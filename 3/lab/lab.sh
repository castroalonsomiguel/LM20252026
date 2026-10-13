#!/bin/bash
# Recrea el laboratorio "RED-DHCP" en una sola máquina Ubuntu 24.04 usando
# network namespaces: srv1, srv2 y cli conectados a un bridge (equivale a la
# "Red interna" de VirtualBox). Cada namespace tiene su interfaz enp0s3.
#
# Uso: sudo ./lab.sh up | down | start-srv1 | stop-srv1 | start-srv2 | stop-srv2
#                  | cli-start | cli-release | cli-forget | cli-kill
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
RUN="$DIR/run"            # ficheros de estado (leases, pid, logs)
mkdir -p "$RUN"

up() {
  ip link add red-dhcp type bridge
  ip link set red-dhcp up
  for ns in srv1 srv2 cli; do
    ip netns add $ns
    ip link add $ns-br type veth peer name enp0s3 netns $ns
    ip link set $ns-br master red-dhcp up
    ip -n $ns link set lo up
    ip -n $ns link set enp0s3 up
    # dhclient-script reescribe resolv.conf: ip netns exec monta este en su lugar
    mkdir -p /etc/netns/$ns && : > /etc/netns/$ns/resolv.conf
  done
  ip -n srv1 addr add 192.168.50.2/24 dev enp0s3
  ip -n srv2 addr add 192.168.50.3/24 dev enp0s3
  ip -n srv1 link set enp0s3 address 08:00:27:00:00:02
  ip -n srv2 link set enp0s3 address 08:00:27:00:00:03
  # MAC fija para el cliente, como la de una VM de VirtualBox
  ip -n cli link set enp0s3 address 08:00:27:aa:bb:cc
}

down() {
  pkill -f "dhcpd .*$RUN" 2>/dev/null || true
  pkill -f "dhclient .*$RUN" 2>/dev/null || true
  for ns in srv1 srv2 cli; do ip netns del $ns 2>/dev/null || true; done
  ip link del red-dhcp 2>/dev/null || true
}

start_srv() {  # $1 = srv1 | srv2
  touch "$RUN/$1.leases"
  # -d: primer plano, log a stderr (equivale a journalctl -u isc-dhcp-server)
  ip netns exec $1 dhcpd -4 -d -cf "$DIR/dhcpd-$1.conf" -lf "$RUN/$1.leases" \
     -pf "$RUN/$1.pid" enp0s3 2>&1 | stamp >>"$RUN/$1.log" &
  sleep 1
}

# Antepone la hora a cada línea (como hace journalctl)
stamp() { while IFS= read -r l; do printf '%s %s\n' "$(date +%T.%3N)" "$l"; done; }

# Cliente: dhclient en primer plano (-d) con su propio fichero de concesiones.
# Sin -d/-v escribiría en syslog (journalctl -t dhclient).
cli_start() {
  ip netns exec cli dhclient -4 -v -d -lf "$RUN/cli.leases" -pf "$RUN/cli.pid" \
     enp0s3 2>&1 | stamp >>"$RUN/cli.log" &
}
cli_release() {   # equivale a "dhclient -r": envía DHCPRELEASE y para el cliente
  ip netns exec cli dhclient -4 -r -v -lf "$RUN/cli.leases" -pf "$RUN/cli.pid" \
     enp0s3 2>&1 | stamp >>"$RUN/cli.log"
  pkill -f "dhclient .*$RUN" 2>/dev/null || true
}
cli_forget() { rm -f "$RUN/cli.leases"; }
cli_kill() { pkill -f "dhclient .*$RUN" 2>/dev/null || true; ip -n cli addr flush dev enp0s3; }

stop_srv() {
  pkill -f "dhcpd .*dhcpd-$1.conf" || true
  while pgrep -f "dhcpd .*dhcpd-$1.conf" >/dev/null; do sleep 0.2; done
  rm -f "$RUN/$1.pid"
}

case "$1" in
  up) up ;;
  down) down ;;
  start-srv1) start_srv srv1 ;;  stop-srv1) stop_srv srv1 ;;
  start-srv2) start_srv srv2 ;;  stop-srv2) stop_srv srv2 ;;
  cli-start) cli_start ;;  cli-release) cli_release ;;
  cli-forget) cli_forget ;;  cli-kill) cli_kill ;;
  *) echo "uso: $0 up|down|start-srvN|stop-srvN|cli-start|cli-release|cli-forget|cli-kill"; exit 1 ;;
esac
