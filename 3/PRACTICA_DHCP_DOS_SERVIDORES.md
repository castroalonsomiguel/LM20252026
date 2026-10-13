# Práctica: dos servidores DHCP en la misma red (DORA, renovación y failover)

## Objetivos

Comprobar experimentalmente:

- Cómo funciona DORA: **D**iscover → **O**ffer → **R**equest → **A**CK.
- Qué ocurre cuando dos servidores DHCP reciben el mismo DHCPDISCOVER.
- Cómo puede un cliente recibir dos DHCPOFFER y cuál acaba asignando la dirección.
- Cómo sabe el servidor no seleccionado que su oferta no ha sido aceptada.
- Qué ocurre al renovar una concesión y si la renovación provoca un nuevo DORA.
- Qué ocurre si el servidor que concedió la dirección deja de estar disponible.
- Cómo observar todo el proceso con `journalctl`, `tcpdump` y Wireshark.

> 📷 **Capturas reales** (pcap, logs y pantallas de Wireshark) de toda la práctica ejecutada en
> Ubuntu 24.04: ver [RESULTADOS_LABORATORIO.md](RESULTADOS_LABORATORIO.md).

---

## 0. Entorno de laboratorio

```
                     "RED-DHCP" (Red interna de VirtualBox)
         +-------------------+-------------------+
         |                   |                   |
     DHCP-SRV1           DHCP-SRV2            CLIENTE
   192.168.50.2/24     192.168.50.3/24      (automática)
   Pool .100 - .149    Pool .200 - .229
   Ubuntu 24.04.3      Ubuntu 24.04.3       Ubuntu 24.04.3
```

| Equipo    | IP                  | Función          |
|-----------|---------------------|------------------|
| DHCP-SRV1 | 192.168.50.2/24     | Servidor DHCP 1  |
| DHCP-SRV2 | 192.168.50.3/24     | Servidor DHCP 2  |
| CLIENTE   | Automática (DHCP)   | Cliente DHCP     |
| Pool SRV1 | 192.168.50.100–149  | Pool DHCP 1      |
| Pool SRV2 | 192.168.50.200–229  | Pool DHCP 2      |

Los rangos son distintos a propósito: **mirando la IP del cliente se sabe qué servidor ha "ganado"**
(`.1xx` → SRV1, `.2xx` → SRV2).

> **Importante:** las tres VM usan un adaptador **"Red interna"** (por ejemplo, de nombre `RED-DHCP`).
> No uses "Red NAT": VirtualBox lleva su propio servidor DHCP en esa red y sería un tercer
> competidor que estropearía el experimento.
>
> Como en la red interna no hay Internet, **instala antes los paquetes** (con el adaptador en NAT)
> y después cambia el adaptador a "Red interna".

### 0.1 Paquetes

```bash
# En DHCP-SRV1 y DHCP-SRV2
sudo apt update
sudo apt install isc-dhcp-server tcpdump

# En CLIENTE
sudo apt update
sudo apt install isc-dhcp-client tcpdump wireshark
```

> Nota: ISC DHCP está marcado como obsoleto (su sucesor es Kea), pero sigue en los repositorios
> de Ubuntu 24.04 y sus mensajes de log son muy didácticos para esta práctica.

Comprueba el nombre de la interfaz con `ip a` (en VirtualBox suele ser `enp0s3`; en esta guía se usa ese nombre).

### 0.2 IP estática en los servidores (netplan)

`/etc/netplan/01-lab.yaml` en **DHCP-SRV1** (en SRV2 cambia `.2` por `.3`):

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: false
      addresses: [192.168.50.2/24]
```

```bash
sudo chmod 600 /etc/netplan/01-lab.yaml
sudo netplan apply
ip -4 addr show enp0s3
```

(Si hay otros ficheros en `/etc/netplan/` que configuren `enp0s3` con DHCP, elimínalos o desactívalos.)

### 0.3 Configuración del servidor DHCP

`/etc/default/isc-dhcp-server` (ambos servidores):

```bash
INTERFACESv4="enp0s3"
INTERFACESv6=""
```

`/etc/dhcp/dhcpd.conf` en **DHCP-SRV1**:

```conf
# Concesiones de 5 minutos para poder observar renovaciones
default-lease-time 300;
max-lease-time 300;

# NO "authoritative": hay dos servidores independientes en la misma subred
# y no queremos que uno conteste DHCPNAK a peticiones del otro.
#authoritative;

log-facility local7;

subnet 192.168.50.0 netmask 255.255.255.0 {
  range 192.168.50.100 192.168.50.149;
  option subnet-mask 255.255.255.0;
  option broadcast-address 192.168.50.255;
  option routers 192.168.50.1;
  option domain-name-servers 192.168.50.1;
}
```

`/etc/dhcp/dhcpd.conf` en **DHCP-SRV2**: idéntico salvo el rango:

```conf
  range 192.168.50.200 192.168.50.229;
```

> Fíjate en que **ambos entregan la misma puerta de enlace y DNS** (ver pregunta 21).

Arranque y comprobación:

```bash
sudo dhcpd -t -cf /etc/dhcp/dhcpd.conf     # comprobar sintaxis
sudo systemctl restart isc-dhcp-server
sudo systemctl status isc-dhcp-server
```

### 0.4 Cliente

Para controlar a mano cada fase usaremos `dhclient`. Hay que evitar que NetworkManager o
systemd-networkd lancen su propio cliente DHCP sobre la misma interfaz:

```bash
# Ubuntu Desktop (NetworkManager):
sudo nmcli device set enp0s3 managed no
# Ubuntu Server (systemd-networkd): en netplan dejar enp0s3 con "dhcp4: false" y aplicar.
```

Órdenes útiles en el cliente:

| Acción | Orden |
|---|---|
| Pedir concesión (DORA o INIT-REBOOT) | `sudo dhclient -v enp0s3` |
| Liberar concesión (envía DHCPRELEASE) y parar dhclient | `sudo dhclient -r -v enp0s3` |
| Olvidar la concesión guardada (forzar DORA completo) | `sudo rm -f /var/lib/dhcp/dhclient*.leases` |
| Ver la concesión actual | `cat /var/lib/dhcp/dhclient.leases` |
| Ver IP | `ip -4 addr show enp0s3` |

### 0.5 Herramientas de observación

```bash
# Servidores: log del demonio en tiempo real
sudo journalctl -u isc-dhcp-server -f

# Cliente: log de dhclient
sudo journalctl -t dhclient -f

# Cualquiera de las tres máquinas: captura (los mensajes DHCP van a los puertos 67/68)
sudo tcpdump -i enp0s3 -n -e -vvv 'port 67 or port 68'
sudo tcpdump -i enp0s3 -n 'port 67 or port 68' -w dora.pcap    # para abrir en Wireshark
```

Filtros útiles de Wireshark:

| Filtro | Qué muestra |
|---|---|
| `dhcp` | Todo el tráfico DHCP (en versiones antiguas: `bootp`) |
| `dhcp.option.dhcp == 1` | DHCPDISCOVER |
| `dhcp.option.dhcp == 2` | DHCPOFFER |
| `dhcp.option.dhcp == 3` | DHCPREQUEST |
| `dhcp.option.dhcp == 5` | DHCPACK |
| `dhcp.option.dhcp == 6` | DHCPNAK |
| `dhcp.option.dhcp == 7` | DHCPRELEASE |

Campos a mirar en cada paquete: `Your (client) IP address` (yiaddr), `Client IP address` (ciaddr),
`Option 54: DHCP Server Identifier`, `Option 50: Requested IP Address`, `Option 51: Lease Time`,
`Option 3: Router`, y las direcciones IP/MAC de origen y destino (broadcast o unicast).

> Capturar en el **cliente** permite ver ambas OFFER. Para ver qué recibe cada servidor,
> captura también en SRV1 y SRV2 (o usa la traza de VirtualBox:
> `VBoxManage modifyvm "CLIENTE" --nictrace1 on --nictracefile1 dora.pcap`).

---

## Parte 1. Dos servidores reciben un DISCOVER

### Procedimiento

1. En SRV1 y SRV2: `sudo journalctl -u isc-dhcp-server -f`
2. En el cliente, en otra terminal: `sudo tcpdump -i enp0s3 -n -vvv 'port 67 or port 68'`
3. En el cliente:

```bash
sudo dhclient -r enp0s3 2>/dev/null
sudo rm -f /var/lib/dhcp/dhclient*.leases
sudo dhclient -v enp0s3
ip -4 addr show enp0s3
```

Salida típica del cliente (ejemplo en el que gana SRV1):

```
DHCPDISCOVER on enp0s3 to 255.255.255.255 port 67 interval 3
DHCPOFFER of 192.168.50.100 from 192.168.50.2
DHCPREQUEST for 192.168.50.100 on enp0s3 to 255.255.255.255 port 67
DHCPACK of 192.168.50.100 from 192.168.50.2
bound to 192.168.50.100 -- renewal in 139 seconds.
```

Log en **SRV1** (ganador):

```
DHCPDISCOVER from 08:00:27:xx:xx:xx via enp0s3
DHCPOFFER on 192.168.50.100 to 08:00:27:xx:xx:xx (cliente) via enp0s3
DHCPREQUEST for 192.168.50.100 (192.168.50.2) from 08:00:27:xx:xx:xx (cliente) via enp0s3
DHCPACK on 192.168.50.100 to 08:00:27:xx:xx:xx (cliente) via enp0s3
```

Log en **SRV2** (perdedor):

```
DHCPDISCOVER from 08:00:27:xx:xx:xx via enp0s3
DHCPOFFER on 192.168.50.200 to 08:00:27:xx:xx:xx (cliente) via enp0s3
DHCPREQUEST for 192.168.50.100 (192.168.50.2) from 08:00:27:xx:xx:xx (cliente) via enp0s3: ...
```

En SRV2 aparece el REQUEST, pero **no** aparece ningún DHCPACK: el número entre paréntesis
(el *Server Identifier*) es `192.168.50.2`, no el suyo. (El texto exacto que añade al final
depende de la versión; lo importante es que no responde.)

### Respuestas

**1. ¿Qué dirección IP ha recibido el cliente?**
La que muestre `ip -4 addr show enp0s3` / la línea `bound to ...` de dhclient. En el ejemplo,
`192.168.50.100`. *(Anota la tuya.)*

**2. ¿De qué pool procede?**
Si está entre `.100` y `.149` procede del pool de SRV1; si está entre `.200` y `.229`, del de SRV2.

**3. ¿Qué servidor DHCP le ha proporcionado la dirección?**
El que aparece en `DHCPACK of ... from <IP>` en el cliente, que coincide con el servidor cuyo
log muestra `DHCPACK on ...`. También se ve en el fichero de concesión:
`option dhcp-server-identifier 192.168.50.x;` en `/var/lib/dhcp/dhclient.leases`.

**4. ¿Han recibido los dos servidores el DHCPDISCOVER?**
**Sí.** El cliente aún no tiene IP, así que envía el DISCOVER desde `0.0.0.0` a
`255.255.255.255` (MAC destino `ff:ff:ff:ff:ff:ff`). Un broadcast llega a todos los equipos del
dominio de difusión, y ambos servidores lo registran (`DHCPDISCOVER from ...`).

**5. ¿Han enviado los dos un DHCPOFFER?**
**Sí.** Son servidores independientes, no se coordinan entre sí; cada uno reserva provisionalmente
una dirección de su pool y responde con su oferta (`DHCPOFFER on ...` en ambos logs, y dos OFFER en
la captura del cliente).

**6. ¿Cuál de los dos DHCPOFFER ha seleccionado el cliente?**
El que figura en el DHCPREQUEST: su opción 54 (*Server Identifier*) y su opción 50
(*Requested IP Address*) identifican servidor y dirección. Con `dhclient`, systemd-networkd y
NetworkManager, en la práctica es **la primera oferta válida que llega**.

**7. ¿Es obligatorio que seleccione la primera oferta recibida?**
**No.** La RFC 2131 dice que el cliente puede recibir varias ofertas y **elegir una cualquiera**;
no impone ningún criterio. Muchos clientes cogen la primera por sencillez, otros pueden esperar
un tiempo y elegir según la duración de la concesión, las opciones ofrecidas, etc. (en `dhclient`
se ajusta con `select-timeout` en `/etc/dhcp/dhclient.conf`; por defecto es 0 → la primera).

**8. ¿Cómo sabe el servidor que pierde que el cliente ha elegido al otro servidor?**
Porque el **DHCPREQUEST se envía también por broadcast** y lleva la **opción 54 – DHCP Server
Identifier** con la IP del servidor elegido. Todos los servidores que hicieron oferta lo
reciben: el elegido ve su propia IP y responde con DHCPACK; el no elegido ve una IP distinta,
entiende que su oferta ha sido rechazada, **no responde** y devuelve al pool la dirección que había
reservado provisionalmente. Es decir, el REQUEST sirve a la vez de "acepto a este" y de
"rechazo a los demás". No existe un mensaje específico de rechazo dirigido al perdedor.

---

## Parte 2. Capturar DORA con Wireshark

### Procedimiento

```bash
# En el cliente
sudo dhclient -r enp0s3 2>/dev/null
sudo rm -f /var/lib/dhcp/dhclient*.leases
sudo tcpdump -i enp0s3 -n 'port 67 or port 68' -w dora.pcap &
sudo dhclient -v enp0s3
sudo pkill tcpdump
wireshark dora.pcap &        # filtro: dhcp
```

Secuencia esperada (cliente con MAC `08:00:27:aa:bb:cc`, gana SRV1):

| # | Origen → Destino | Mensaje | Datos clave |
|---|---|---|---|
| 1 | 0.0.0.0 → 255.255.255.255 | DHCPDISCOVER | Transaction ID = X |
| 2 | 192.168.50.2 → (cliente/broadcast) | DHCPOFFER | yiaddr 192.168.50.100, opt 54 = 192.168.50.2 |
| 3 | 192.168.50.3 → (cliente/broadcast) | DHCPOFFER | yiaddr 192.168.50.200, opt 54 = 192.168.50.3 |
| 4 | 0.0.0.0 → 255.255.255.255 | DHCPREQUEST | opt 50 = 192.168.50.100, opt 54 = 192.168.50.2 |
| 5 | 192.168.50.2 → (cliente/broadcast) | DHCPACK | yiaddr 192.168.50.100, opt 51 = 300 s |

Todos comparten el mismo **Transaction ID**, que es lo que relaciona los cuatro pasos.
(El orden de los dos OFFER puede variar entre pruebas.)

### Respuestas

**9. ¿Cuántos DHCPDISCOVER aparecen?**
**Uno** (puede aparecer alguno más si el cliente no recibe respuesta a tiempo y retransmite;
en ese caso tendrán el mismo Transaction ID).

**10. ¿Cuántos DHCPOFFER aparecen?**
**Dos**, uno de cada servidor, con el mismo Transaction ID que el DISCOVER.

**11. Anota la IP del servidor que envía cada OFFER.**
`192.168.50.2` (SRV1) y `192.168.50.3` (SRV2): se ve en la IP de origen y en la opción 54.

**12. Dirección ofrecida por SRV1:** campo *Your (client) IP address* de su OFFER, del rango
`192.168.50.100–149` (p. ej. `192.168.50.100`).

**13. Dirección ofrecida por SRV2:** del rango `192.168.50.200–229` (p. ej. `192.168.50.200`).

**14. En el DHCPREQUEST, Option 54 DHCP Server Identifier, ¿qué dirección aparece?**
La IP del servidor cuya oferta se ha aceptado (`192.168.50.2` en el ejemplo). Junto a ella, la
opción 50 *Requested IP Address* contiene la dirección que ese servidor ofreció.

**15. ¿Coincide con el servidor finalmente seleccionado?**
**Sí, siempre.** Justamente esa opción es la que comunica la elección; el DHCPACK solo lo envía
el servidor cuya IP figura en ella.

**16. ¿Qué servidor envía el DHCPACK?**
El servidor seleccionado (el de la opción 54 del REQUEST). El otro no envía nada.

**17. Repetir el experimento 10 veces.**

Antes de cada repetición:

```bash
sudo dhclient -r enp0s3                    # libera (DHCPRELEASE) y para dhclient
sudo rm -f /var/lib/dhcp/dhclient*.leases  # olvidar la concesión → DORA completo
sudo dhclient -v enp0s3
```

| Prueba | IP obtenida | Pool | Servidor que la concede | ¿Qué OFFER llegó antes? |
|---|---|---|---|---|
| 1  |  |  |  |  |
| 2  |  |  |  |  |
| 3  |  |  |  |  |
| 4  |  |  |  |  |
| 5  |  |  |  |  |
| 6  |  |  |  |  |
| 7  |  |  |  |  |
| 8  |  |  |  |  |
| 9  |  |  |  |  |
| 10 |  |  |  |  |

> Los resultados dependen de tiempos de respuesta reales, por lo que **cada grupo obtendrá su
> propia tabla**. Rellena la última columna mirando el orden de los OFFER en tcpdump/Wireshark.

**18. ¿Gana siempre el mismo servidor?**
**No tiene por qué.** Con dos servidores igual de cargados el resultado es prácticamente una
carrera y puede variar entre pruebas. Es habitual, sin embargo, observar **rachas** del mismo
ganador por dos motivos:

- El servidor que ya concedió una IP a esa MAC la recuerda en su fichero de concesiones
  (`/var/lib/dhcp/dhcpd.leases`) y puede volver a ofrecerla enseguida.
- `isc-dhcp-server`, antes de ofrecer una dirección "nueva", hace un *ping-check* para
  asegurarse de que no está en uso y espera hasta ~1 s la respuesta, lo que retrasa su OFFER.

Además, si **no** se borra el fichero de concesiones del cliente, éste incluye en el DISCOVER la
opción 50 con su IP anterior (o directamente hace INIT-REBOOT), favoreciendo al ganador anterior.

**19. ¿Influye cuál responde antes?**
**Sí, decisivamente** con estos clientes, porque se quedan con la primera oferta. Se puede
comprobar retrasando artificialmente uno de los servidores, por ejemplo SRV1:

```bash
# En SRV1: añadir 500 ms de retardo a todo lo que envía
sudo tc qdisc add dev enp0s3 root netem delay 500ms
# ... repetir varias pruebas: ahora gana SRV2 casi siempre ...
sudo tc qdisc del dev enp0s3 root
```

**20. ¿Puede el administrador garantizar qué servidor será elegido simplemente teniendo dos
servidores DHCP independientes?**
**No.** La elección la hace el **cliente**, según su propia implementación y según la oferta que
llegue antes, que depende de la carga, la latencia, el ping-check, etc. Dos servidores
independientes no se coordinan. Para controlarlo hace falta otra solución: un único servidor,
**DHCP failover** de ISC (`failover peer` con `split`), alta disponibilidad de **Kea**
(`hot-standby` / `load-balancing`), configuración explícita de un servidor primario y otro con
retardo de respuesta (p. ej. `min-secs` en ISC), reservas por MAC (`host { hardware ethernet ...;
fixed-address ...; }`) sólo en uno de ellos, etc.

**21. ¿Qué problema supondría que SRV1 entregase como gateway 192.168.50.1 y SRV2 entregase
192.168.50.254?**
Los clientes de la misma red tendrían **configuraciones distintas según quién ganara la
carrera**, de forma aleatoria:

- Si una de las dos puertas de enlace no existe o está mal configurada, parte de los equipos
  se quedan sin salida a otras redes/Internet, y de manera **intermitente** (un mismo equipo
  funciona hoy y mañana no, tras reiniciar o tras perder la concesión).
- Si ambas existen pero tienen distintas políticas (cortafuegos, rutas, NAT, proxy, QoS), el
  comportamiento de la red será incoherente y muy difícil de diagnosticar.
- Lo mismo aplica al DNS, máscara, dominio, etc.

Conclusión: si hay varios servidores DHCP en una subred, **todas las opciones comunes (máscara,
router, DNS, dominio...) deben ser idénticas** y los rangos no deben solaparse.

---

## Parte 3. Renovación de la concesión

¿Vuelven a competir los dos servidores al renovar?

Con una concesión de 300 s, el cliente usa los temporizadores por defecto:

| Temporizador | Valor | Qué hace el cliente |
|---|---|---|
| **T1** (renovación) | 50 % → ~150 s | Pasa a **RENEWING**: DHCPREQUEST **unicast** al servidor que concedió |
| **T2** (reenlace) | 87,5 % → ~262 s | Pasa a **REBINDING**: DHCPREQUEST **broadcast** a cualquier servidor |
| Expiración | 100 % → 300 s | Pierde la IP y vuelve a **INIT** (DHCPDISCOVER) |

(`dhclient` añade una pequeña aleatoriedad: por eso dice "renewal in 139 seconds" y no 150.)

### Procedimiento

Con el cliente ya configurado, deja `tcpdump` (o Wireshark) capturando en el cliente y los logs
de ambos servidores abiertos, y espera unos 2,5 minutos. Para no esperar, también se puede
lanzar una renovación inmediata con `sudo dhclient -v enp0s3` mientras la concesión es válida
(dhclient reutiliza la concesión guardada).

Salida típica en el cliente:

```
DHCPREQUEST for 192.168.50.100 on enp0s3 to 192.168.50.2 port 67
DHCPACK of 192.168.50.100 from 192.168.50.2
bound to 192.168.50.100 -- renewal in 144 seconds.
```

En SRV1:

```
DHCPREQUEST for 192.168.50.100 from 08:00:27:xx:xx:xx (cliente) via enp0s3
DHCPACK on 192.168.50.100 to 08:00:27:xx:xx:xx (cliente) via enp0s3
```

En SRV2: **nada** (el REQUEST es unicast a SRV1 y no le llega).

### Respuestas

**22. ¿Aparece un nuevo DHCPDISCOVER durante una renovación normal?**
**No.** Solo hay DHCPREQUEST + DHCPACK.

**23. ¿Aparecen dos DHCPOFFER?**
**No**, no aparece ningún OFFER: no hay fase de descubrimiento ni de oferta.

**24. ¿Con qué servidor intenta renovar inicialmente?**
Con el **mismo servidor que le concedió la dirección** (el de la opción 54 guardada en la
concesión). El REQUEST va en **unicast** a su IP (`to 192.168.50.2 port 67`), con el campo
`ciaddr` relleno con la IP actual del cliente y sin opción 54 ni 50. Por eso el otro servidor ni
siquiera se entera: **no hay competición**.

**25. ¿Mantiene la misma dirección IP?**
**Sí.** El servidor amplía la concesión de la misma IP (otros 300 s) y no se interrumpe ninguna
conexión.

**26. ¿Qué diferencia existe entre obtener una concesión nueva y renovar una existente?**

| | Concesión nueva (INIT → DORA) | Renovación (RENEWING) |
|---|---|---|
| Mensajes | 4: DISCOVER, OFFER, REQUEST, ACK | 2: REQUEST, ACK |
| Destino | Broadcast (el cliente aún no tiene IP) | Unicast al servidor que concedió |
| IP origen del cliente | 0.0.0.0 | Su IP actual (`ciaddr` relleno) |
| Servidores implicados | Todos los de la red: compiten | Solo el servidor original |
| Resultado | Cualquier IP de cualquier pool | Se prolonga la misma IP |
| Interrupción del servicio | El equipo no tiene IP hasta el ACK | Ninguna, la IP sigue en uso |

---

## Parte 4. Apagar el servidor que ha concedido la IP al cliente

Supuesto: SRV1 concedió `192.168.50.112` al cliente y apagamos SRV1
(`sudo systemctl stop isc-dhcp-server` o apagar la VM), manteniendo SRV2 encendido.

Sigue con `tcpdump` y `journalctl -t dhclient -f` en el cliente y `journalctl -u isc-dhcp-server -f`
en SRV2, y observa los 5 minutos completos. Secuencia esperada en el cliente:

```
# t ≈ 150 s (T1) — RENEWING: unicast a SRV1, sin respuesta, reintentos
DHCPREQUEST for 192.168.50.112 on enp0s3 to 192.168.50.2 port 67
DHCPREQUEST for 192.168.50.112 on enp0s3 to 192.168.50.2 port 67
...
# t ≈ 262 s (T2) — REBINDING: broadcast a cualquier servidor
DHCPREQUEST for 192.168.50.112 on enp0s3 to 255.255.255.255 port 67
...
# t = 300 s — expira la concesión: se borra la IP y vuelve a INIT
DHCPDISCOVER on enp0s3 to 255.255.255.255 port 67 interval 3
DHCPOFFER of 192.168.50.200 from 192.168.50.3
DHCPREQUEST for 192.168.50.200 on enp0s3 to 255.255.255.255 port 67
DHCPACK of 192.168.50.200 from 192.168.50.3
bound to 192.168.50.200 -- renewal in 141 seconds.
```

Y en SRV2, durante el REBINDING, algo como:

```
DHCPREQUEST for 192.168.50.112 from 08:00:27:xx:xx:xx via enp0s3: unknown lease 192.168.50.112.
```

### Respuestas

**27. ¿Pierde inmediatamente su dirección cuando apagamos SRV1?**
**No.** El cliente no está en contacto permanente con el servidor: la IP es suya durante todo el
tiempo de la concesión, esté o no el servidor encendido. `ip addr` sigue mostrando `.112`.

**28. ¿Puede seguir utilizando 192.168.50.112 mientras la concesión sea válida?**
**Sí**, con total normalidad (ping, conexiones, etc.) hasta que expire, es decir, hasta como
máximo 300 s desde el último ACK.

**29. ¿Qué ocurre cuando intenta renovar con SRV1?**
Al llegar a T1 envía DHCPREQUEST **unicast** a `192.168.50.2`. Nadie responde, así que va
**reintentando** periódicamente (cada vez con intervalos menores, aproximadamente la mitad del
tiempo que queda hasta T2, con un mínimo de unos segundos) mientras sigue usando la IP. SRV2 no ve
estos mensajes porque no van dirigidos a él.

**30. ¿Puede finalmente intervenir SRV2?**
**Sí, pero no "salvando" la IP .112:**

- En **REBINDING** (T2) el REQUEST va por broadcast y SRV2 lo recibe, pero **no tiene ningún
  registro de esa concesión** (la creó SRV1 y no comparten base de datos). Según la RFC 2131, un
  servidor que no conoce la concesión debe permanecer en silencio; ISC registra
  `unknown lease 192.168.50.112` y **no responde**. (No contesta NAK porque no es `authoritative`
  y la dirección pertenece a la subred, aunque no a su pool.)
- Cuando la concesión **expira**, el cliente elimina la IP y vuelve a **INIT** → DHCPDISCOVER.
  Ahora solo responde SRV2, y el cliente obtiene una dirección **de su pool (.200–.229)**.

Consecuencia: el cliente recupera la conectividad, pero **cambia de IP** y se pierden las
conexiones abiertas. (Con DHCP failover sí compartirían la base de concesiones y SRV2 podría
renovar la `.112` en REBINDING.)

**31. ¿Qué diferencia observas entre los estados RENEWING y REBINDING?**

| | RENEWING | REBINDING |
|---|---|---|
| Cuándo empieza | T1 (50 % de la concesión) | T2 (87,5 % de la concesión) |
| Destino del DHCPREQUEST | **Unicast** al servidor que concedió (`to 192.168.50.2`) | **Broadcast** (`to 255.255.255.255`) |
| Quién puede responder | Solo el servidor original | **Cualquier** servidor DHCP que conozca la concesión |
| Significado | "Servidor original, ¿me renuevas?" | "El mío no contesta: ¿alguien puede renovármela?" |
| Si nadie responde | Al llegar a T2 pasa a REBINDING | Al expirar pierde la IP y pasa a INIT |

En ambos casos el cliente sigue usando su IP y el REQUEST lleva `ciaddr` relleno; lo que cambia es
el destino.

**32. ¿Qué ocurrirá si ningún servidor DHCP responde y finalmente expira completamente la
concesión?**
El cliente **elimina la dirección IP** de la interfaz (y las rutas asociadas, incluida la puerta
de enlace) y queda **sin conectividad IPv4** en esa red. Vuelve al estado **INIT** y sigue
enviando DHCPDISCOVER periódicamente, con intervalos crecientes, hasta que algún servidor responda.
`dhclient` acaba con `No DHCPOFFERS received.` y lo reintenta más tarde. Según el sistema, podría
asignarse una dirección de enlace local (APIPA, `169.254.x.x`) si está configurado, pero por
defecto Ubuntu no lo hace.

---

## Parte 5. Experimento final

### Procedimiento

1. **Apagar ambos servidores:** `sudo systemctl stop isc-dhcp-server` en SRV1 y SRV2.
2. **Hacer que el cliente pierda la concesión:** esperar a que expire (≤ 300 s; en el log
   aparecerán los REQUEST de RENEWING/REBINDING y luego DISCOVER sin respuesta) o forzarlo:

   ```bash
   sudo dhclient -r enp0s3                    # libera y quita la IP
   sudo rm -f /var/lib/dhcp/dhclient*.leases  # olvida la concesión anterior
   ip -4 addr show enp0s3                     # sin dirección IPv4
   ```

3. **Arrancar únicamente SRV2:** `sudo systemctl start isc-dhcp-server`.
4. **Forzar una configuración nueva en el cliente:** `sudo dhclient -v enp0s3`
   → DORA completo con un solo OFFER, de `192.168.50.3`, con una IP de `192.168.50.200–229`.
5. **Arrancar SRV1:** `sudo systemctl start isc-dhcp-server`.
6. Observar durante varias renovaciones (≥ 10 minutos) con `tcpdump` en el cliente y
   `journalctl` en ambos servidores.

Lo que se observa: cada ~150 s aparece un DHCPREQUEST unicast `to 192.168.50.3` seguido de
DHCPACK de SRV2; **en el log de SRV1 no aparece nada**.

### 33. Ahora que existen otra vez dos servidores DHCP, ¿cambiará automáticamente el cliente de SRV2 a SRV1 porque SRV1 haya vuelto a estar disponible?

**No.** Justificación basada en el funcionamiento de las concesiones:

1. **La competición entre servidores solo ocurre en el estado INIT** (DHCPDISCOVER por
   broadcast). El cliente ya tiene una concesión válida de SRV2, está en estado **BOUND** y no
   tiene ningún motivo para volver a buscar servidores.
2. Las **renovaciones** (T1) se envían en **unicast al servidor que concedió la dirección**,
   identificado por la opción 54 que el cliente guardó (`192.168.50.3`). SRV1 ni siquiera recibe
   esos mensajes, así que no tiene ocasión de ofrecer nada.
3. SRV2 sigue respondiendo con DHCPACK, de modo que el cliente **nunca llega a REBINDING** (T2)
   y mucho menos a la expiración. Y aunque llegara a REBINDING, SRV1 no conoce esa concesión y no
   respondería.
4. DHCP no tiene ningún mecanismo de "servidor preferido" ni de vuelta atrás (*failback*): el
   protocolo busca **estabilidad de la dirección**, no volver a un servidor concreto. Un servidor
   tampoco puede "arrebatar" un cliente a otro.
5. Incluso si el cliente se reinicia conservando el fichero de concesión, hace **INIT-REBOOT**:
   envía un DHCPREQUEST pidiendo su IP `.2xx`; SRV2 la confirma con ACK y SRV1, que no tiene
   registro de ella, permanece en silencio.

El cliente solo podría pasar a SRV1 si vuelve al estado INIT y SRV1 gana la carrera: si SRV2 deja
de responder y la concesión expira, si el cliente libera la concesión (`dhclient -r`) y olvida la
guardada, si SRV2 le contesta DHCPNAK, etc.

---

## Resumen

- El **DISCOVER** y el **REQUEST inicial** son broadcast: todos los servidores los ven.
- Con dos servidores independientes, el cliente recibe **dos OFFER** y elige uno
  (normalmente el primero); **la elección no la controla el administrador**.
- El **Server Identifier (opción 54)** del REQUEST anuncia el ganador; el perdedor se entera
  porque ve otra IP en esa opción y libera su oferta en silencio.
- La **renovación** es REQUEST/ACK en unicast con el servidor original: **no hay nuevo DORA ni
  competición**, y la IP se mantiene.
- Si el servidor original cae: RENEWING (unicast, sin respuesta) → REBINDING (broadcast) →
  expiración → nuevo DORA con los servidores disponibles → **nueva IP**.
- Cuando vuelve un servidor, **los clientes no regresan a él**: se quedan con quien les renueva.
- Varios servidores DHCP en una subred deben tener **rangos disjuntos y opciones idénticas**;
  para alta disponibilidad real se usa DHCP failover (ISC) o HA de Kea.
