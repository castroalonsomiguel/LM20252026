#!/bin/bash
# Pregunta 17: repite 10 veces "liberar + olvidar concesión + DORA" y anota el ganador.
cd "$(dirname "$0")"
PCAP=${1:-../capturas/parte2_10_repeticiones.pcap}
tcpdump -i red-dhcp -n -U -w "$PCAP" 'port 67 or port 68' 2>/dev/null & TP=$!
sleep 1
printf '| Prueba | IP obtenida | Pool | Servidor que la concede | Primer OFFER recibido |\n|---|---|---|---|---|\n'
for i in $(seq 1 10); do
  ./lab.sh cli-release >/dev/null 2>&1
  ./lab.sh cli-forget
  : > run/cli.log
  ./lab.sh cli-start
  for t in $(seq 1 40); do grep -q 'bound to' run/cli.log && break; sleep 0.25; done
  ip=$(grep -oP 'bound to \K[0-9.]+' run/cli.log)
  srv=$(grep -oP 'DHCPACK of [0-9.]+ from \K[0-9.]+' run/cli.log)
  first=$(grep -oP 'DHCPOFFER of [0-9.]+ from \K[0-9.]+' run/cli.log | head -1)
  case $ip in 192.168.50.1*) pool="SRV1 (.100-.149)";; *) pool="SRV2 (.200-.229)";; esac
  name() { [ "$1" = 192.168.50.2 ] && echo "SRV1 ($1)" || echo "SRV2 ($1)"; }
  echo "| $i | $ip | $pool | $(name $srv) | $(name $first) |"
  sleep 1
done
sleep 1; kill $TP
