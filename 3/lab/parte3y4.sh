#!/bin/bash
# Parte 3: espera la renovación (T1) con los dos servidores encendidos.
# Parte 4: justo después apaga SRV1 y observa RENEWING -> REBINDING -> expiración -> DORA con SRV2.
cd "$(dirname "$0")"
C=../capturas
./lab.sh cli-release >/dev/null 2>&1; ./lab.sh cli-forget
: > run/cli.log; : > run/srv1.log; : > run/srv2.log
# Garantizamos que el cliente empieza con una concesión de SRV1 (como en el enunciado)
./lab.sh stop-srv2; ./lab.sh cli-start
until grep -q 'bound to' run/cli.log; do sleep 0.5; done
./lab.sh start-srv2
tcpdump -i red-dhcp -n -U -w $C/parte3_renovacion.pcap 'port 67 or port 68' 2>/dev/null & TP=$!
until grep -q 'DHCPACK.*renew\|DHCPREQUEST for .* to 192.168.50.2' run/cli.log && grep -c DHCPACK run/cli.log | grep -q 2; do sleep 0.5; done
sleep 2; kill $TP
cp run/cli.log $C/parte3_cliente.log; cp run/srv1.log $C/parte3_srv1.log; cp run/srv2.log $C/parte3_srv2.log
ip -n cli -4 -br addr show enp0s3 > $C/parte3_ip.txt

# ---- Parte 4 ----
: > run/cli.log; : > run/srv1.log; : > run/srv2.log
tcpdump -i red-dhcp -n -U -w $C/parte4_caida_srv1.pcap 'port 67 or port 68' 2>/dev/null & TP=$!
echo "$(date +%T.%3N) *** SE APAGA SRV1 ***" >> run/cli.log
./lab.sh stop-srv1
# Muestrea la IP del cliente cada 10 s para ver cuándo la pierde
( while true; do echo "$(date +%T) $(ip -n cli -4 -br addr show enp0s3)"; sleep 10; done ) > $C/parte4_ip_cliente.txt & MP=$!
until grep -q 'bound to 192.168.50.2' run/cli.log; do sleep 1; done
sleep 5; kill $TP $MP
cp run/cli.log $C/parte4_cliente.log; cp run/srv2.log $C/parte4_srv2.log
echo FIN
