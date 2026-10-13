#!/bin/bash
# Pregunta 19: se hace que SRV2 responda "tarde". Antes de cada prueba se borra
# su base de concesiones; al no conocer al cliente, dhcpd hace un ping-check
# (~1 s) de la IP antes de ofrecerla. SRV1 sí conoce al cliente y responde ya.
cd "$(dirname "$0")"
tcpdump -i red-dhcp -n -U -w ../capturas/parte2_retardo_srv2.pcap 'port 67 or port 68' 2>/dev/null & TP=$!
sleep 1
printf '| Prueba | IP obtenida | Ganador |\n|---|---|---|\n'
for i in 1 2 3 4 5; do
  ./lab.sh cli-release >/dev/null 2>&1; ./lab.sh cli-forget
  ./lab.sh stop-srv2; : > run/srv2.leases; ./lab.sh start-srv2
  : > run/cli.log; ./lab.sh cli-start
  for t in $(seq 1 40); do grep -q 'bound to' run/cli.log && break; sleep 0.25; done
  sleep 1.5
  ip=$(grep -oP 'bound to \K[0-9.]+' run/cli.log)
  case $ip in 192.168.50.1*) w="SRV1";; *) w="SRV2";; esac
  echo "| $i | $ip | $w |"
done
sleep 1; kill $TP
