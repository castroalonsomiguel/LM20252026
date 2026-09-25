#!/usr/bin/env node
// Centinela en modo consola: deja el bot funcionando 24/7 en tu ordenador.
// Uso: node bot.js            (necesita Node 18 o superior)
// El estado se guarda en estado.json. Puedes importarlo en index.html para verlo.
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');

const FILE = path.join(__dirname, 'estado.json');
const storage = {
  load: () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null),
  save: (s) => fs.writeFileSync(FILE, JSON.stringify(s)),
};

let printed = 0;
const bot = new E.Bot({
  storage,
  onChange: (s) => {
    const fresh = s.log.slice(0, Math.max(0, s.log.length - printed)).reverse();
    for (const l of fresh) console.log(`[${new Date(l.t).toLocaleString('es-ES')}] ${l.msg}`);
    printed = s.log.length;
  },
});
printed = bot.state.log.length;

async function loop() {
  await bot.tick((f, msg) => process.stdout.write(`\r${Math.round(f * 100)} % ${msg}                    `));
  const s = bot.state;
  console.log(`\nCapital ${s.capital.toFixed(2)} USDT · abiertas ${s.open.length} · hoy ${bot.tradesToday()}`);
}

console.log('Centinela en marcha (simulación, sin dinero real). Ctrl+C para parar.');
loop();
setInterval(loop, 60 * 1000);
