#!/bin/bash
# Parte 5 (experimento final): ambos servidores apagados, el cliente pierde la
# concesión, arranca solo SRV2, el cliente obtiene IP .2xx, arranca SRV1 y se
# observan dos renovaciones y un reinicio del cliente (INIT-REBOOT).
cd "$(dirname "$0")"
C=../capturas
mark() { echo "$(date +%T.%3N) *** $* ***" | tee -a run/cli.log run/srv1.log run/srv2.log >/dev/null; }
./lab.sh stop-srv1; ./lab.sh stop-srv2
: > run/cli.log; : > run/srv1.log; : > run/srv2.log
tcpdump -i red-dhcp -n -U -w $C/parte5_experimento_final.pcap 'port 67 or port 68' 2>/dev/null & TP=$!
sleep 1
mark "SRV1 y SRV2 APAGADOS: el cliente libera y olvida su concesion"
./lab.sh cli-release; ./lab.sh cli-forget; ./lab.sh cli-kill
echo "$(date +%T) $(ip -n cli -4 -br addr show enp0s3)" >> run/cli.log
mark "ARRANCA SOLO SRV2"; ./lab.sh start-srv2
mark "CLIENTE SOLICITA CONFIGURACION NUEVA"; ./lab.sh cli-start
until grep -q 'bound to' run/cli.log; do sleep 0.5; done
sleep 3
mark "ARRANCA SRV1"; ./lab.sh start-srv1
# dos renovaciones completas
until [ $(grep -c 'DHCPACK' run/cli.log) -ge 3 ]; do sleep 1; done
sleep 3
mark "REINICIO DEL CLIENTE CONSERVANDO SU CONCESION (INIT-REBOOT)"
pkill -f "dhclient .*$PWD/run"; ip -n cli addr flush dev enp0s3; sleep 1
./lab.sh cli-start
until [ $(grep -c 'DHCPACK' run/cli.log) -ge 4 ]; do sleep 1; done
sleep 3; kill $TP
cp run/cli.log $C/parte5_cliente.log; cp run/srv1.log $C/parte5_srv1.log; cp run/srv2.log $C/parte5_srv2.log
echo FIN5
