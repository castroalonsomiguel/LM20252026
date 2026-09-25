#!/bin/bash
# Ejecuta el bot cada minuto. Termina (y avisa) cuando se abre o se cierra una operación,
# o cuando la cuenta se detiene por el límite de pérdida.
cd "$(dirname "$0")"; export NODE_USE_ENV_PROXY=1
sig() { node -e "const s=require('./estado_real.json');console.log(s.open.map(t=>t.id).join(',')+'|'+s.closed.length+'|'+(s.halted?1:0))"; }
s0=$(sig)
for i in $(seq 1 720); do
  node real.js tick >/dev/null 2>&1
  s=$(sig)
  if [ "$s" != "$s0" ]; then echo "CAMBIO $s0 -> $s"; node -e "const s=require('./estado_real.json');s.log.slice(0,4).forEach(l=>console.log(l.msg))"; exit 0; fi
  sleep 60
done
echo "sin cambios en 12 h"
