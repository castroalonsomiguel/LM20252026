/*
 * Centinela · motor del bot de trading simulado (paper trading).
 * Funciona igual en el navegador (index.html) y en Node (bot.js).
 *
 * Qué hace:
 *  1. Estudio a largo plazo de cada moneda con velas diarias reales de Binance.
 *  2. Busca patrones de entrada (setups) en velas de 1 h y los prueba con datos
 *     pasados (backtest) separando entrenamiento y validación.
 *  3. Solo opera los patrones cuya tasa de acierto estimada es >= 75 % en datos
 *     que no se usaron para elegirlos, con esperanza positiva tras comisiones.
 *  4. Máximo 3 operaciones al día. Dinero ficticio: nunca envía órdenes reales.
 *  5. Aprende: cada patrón pasa de "aprendiendo" a "funciona" o "no funciona"
 *     según sus resultados reales en simulación. Lo que no funciona se bloquea.
 */
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.Centinela = E;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------- config
  const CONFIG = {
    quote: 'USDT',
    startCapital: 10000,      // capital ficticio inicial
    riskPct: 0.01,            // se arriesga el 1 % del capital hasta el stop
    maxPosPct: 0.30,          // ninguna posición supera el 30 % del capital
    maxTradesPerDay: 3,
    maxOpen: 3,
    minWin: 0.75,             // probabilidad mínima de ganar exigida
    feePct: 0.001,            // comisión por lado (Binance spot)
    slipPct: 0.0005,          // deslizamiento estimado por lado
    hourlyPages: 4,           // 4 x 1000 velas de 1 h ≈ 166 días de backtest
    trainFrac: 0.7,           // 70 % entrenamiento, 30 % validación
    minTrain: 15,
    minVal: 6,
    maxHoldH: 48,             // cierre por tiempo a las 48 h
    tpGrid: [0.8, 1.2, 1.8],  // take profit en múltiplos de ATR
    slGrid: [1.5, 2.5, 3.5],  // stop loss en múltiplos de ATR
    learnMinTrades: 10,       // operaciones reales para dar un patrón por aprendido
    failEarlyTrades: 5,       // con 5 operaciones y < 50 % se bloquea antes
    researchEveryH: 24,
  };

  const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

  const COINS = [
    { sym: 'BTC', name: 'Bitcoin', ctx: 'La primera criptomoneda y la de mayor capitalización. Oferta máxima de 21 millones y halving cada unos 4 años. Se usa como reserva de valor y marca la dirección del resto del mercado.' },
    { sym: 'ETH', name: 'Ethereum', ctx: 'Plataforma de contratos inteligentes con el mayor ecosistema DeFi y de capas 2. Proof of stake desde 2022. Suele moverse con BTC pero con más volatilidad.' },
    { sym: 'BNB', name: 'BNB', ctx: 'Token de Binance y de BNB Chain. Descuentos en comisiones y quemas periódicas. Su valor depende mucho del negocio y la regulación del exchange.' },
    { sym: 'SOL', name: 'Solana', ctx: 'Cadena de alto rendimiento y comisiones bajas, fuerte en memecoins, DEX y pagos. Muy volátil: grandes subidas y caídas profundas en su historia.' },
    { sym: 'XRP', name: 'XRP', ctx: 'Red de pagos asociada a Ripple. Muy sensible a noticias regulatorias y legales en EE. UU.' },
    { sym: 'ADA', name: 'Cardano', ctx: 'Cadena proof of stake con desarrollo académico y lento. Comunidad grande pero menos actividad DeFi que sus rivales.' },
    { sym: 'DOGE', name: 'Dogecoin', ctx: 'Memecoin sin oferta máxima (emisión fija anual). Precio muy guiado por el sentimiento y las redes sociales.' },
    { sym: 'TRX', name: 'TRON', ctx: 'Cadena muy usada para transferir stablecoins (USDT). Movimientos de precio históricamente más tranquilos.' },
    { sym: 'AVAX', name: 'Avalanche', ctx: 'Plataforma de contratos inteligentes con subredes. Beta alta respecto a BTC.' },
    { sym: 'LINK', name: 'Chainlink', ctx: 'Red de oráculos que lleva datos externos a las cadenas. Infraestructura usada por gran parte de DeFi.' },
    { sym: 'DOT', name: 'Polkadot', ctx: 'Red de parachains interoperables. Rendimiento débil en ciclos recientes y alta inflación por staking.' },
    { sym: 'LTC', name: 'Litecoin', ctx: 'Bifurcación temprana de Bitcoin con bloques más rápidos. Madura, con poca innovación y correlación alta con BTC.' },
    { sym: 'TON', name: 'Toncoin', ctx: 'Cadena vinculada a Telegram. Crecimiento ligado a la adopción dentro de la app.' },
    { sym: 'SUI', name: 'Sui', ctx: 'Cadena reciente de alto rendimiento (lenguaje Move). Poco historial y desbloqueos de tokens programados.' },
    { sym: 'NEAR', name: 'NEAR Protocol', ctx: 'Cadena con sharding y foco en IA y abstracción de cuentas. Volatilidad alta.' },
  ];

  const SETUPS = {
    rebote: {
      name: 'Rebote en tendencia',
      desc: 'Tendencia alcista (EMA50 > EMA200 y precio sobre EMA200) y el RSI vuelve a subir por encima de 35 tras una caída.',
      fn: (x, i) => x.c[i] > x.ema200[i] && x.ema50[i] > x.ema200[i] && x.rsi[i - 1] < 35 && x.rsi[i] >= 35,
    },
    bollinger: {
      name: 'Banda inferior en tendencia',
      desc: 'Tendencia de fondo alcista (EMA50 > EMA200) y cierre por debajo de la banda de Bollinger inferior (20, 2).',
      fn: (x, i) => x.ema50[i] > x.ema200[i] && x.c[i] < x.bbLo[i],
    },
    ruptura: {
      name: 'Ruptura con volumen',
      desc: 'Cierre por encima del máximo de las 48 h anteriores con el doble de volumen medio, RSI < 75 y precio sobre EMA200.',
      fn: (x, i) => x.c[i] > x.hh48[i] && x.v[i] > 2 * x.vol20[i - 1] && x.rsi[i] < 75 && x.c[i] > x.ema200[i],
    },
    panico: {
      name: 'Sobreventa extrema',
      desc: 'RSI < 25 y caída de más del 5 % en 24 h: apuesta a un rebote técnico.',
      fn: (x, i) => x.rsi[i] < 25 && x.ret24[i] < -0.05,
    },
  };

  // ---------------------------------------------------------------- datos
  let fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
  let goodHost = null;

  async function getJSON(path) {
    const hosts = goodHost ? [goodHost, ...HOSTS.filter((h) => h !== goodHost)] : HOSTS;
    let lastErr;
    for (const h of hosts) {
      try {
        const r = await fetchImpl(h + path);
        if (!r.ok) {
          const body = await r.text();
          const err = new Error(`HTTP ${r.status} en ${h}: ${body.slice(0, 160)}`);
          err.status = r.status;
          throw err;
        }
        goodHost = h;
        return await r.json();
      } catch (e) {
        lastErr = e;
        if (e.status === 400) throw e; // símbolo inexistente: no reintentar en otro host
      }
    }
    throw lastErr || new Error('Sin conexión con Binance');
  }

  async function klines(symbol, interval, limit = 1000, endTime) {
    let q = `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    if (endTime) q += `&endTime=${endTime}`;
    const raw = await getJSON(q);
    return raw.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], ct: k[6], qv: +k[7] }));
  }

  async function klinesSince(symbol, interval, startTime, limit = 1000) {
    const raw = await getJSON(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&startTime=${startTime}`);
    return raw.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], ct: k[6], qv: +k[7] }));
  }

  async function klinesPaged(symbol, interval, pages) {
    let all = [];
    let end;
    for (let p = 0; p < pages; p++) {
      const k = await klines(symbol, interval, 1000, end);
      if (!k.length) break;
      all = k.concat(all);
      end = k[0].t - 1;
      if (k.length < 1000) break;
    }
    return all;
  }

  const closedOnly = (k, now = Date.now()) => k.filter((x) => x.ct < now);

  // ---------------------------------------------------------------- indicadores
  function ema(a, n) {
    const o = new Array(a.length).fill(NaN);
    const k = 2 / (n + 1);
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      if (i < n) { s += a[i]; if (i === n - 1) o[i] = s / n; continue; }
      o[i] = a[i] * k + o[i - 1] * (1 - k);
    }
    return o;
  }
  function sma(a, n) {
    const o = new Array(a.length).fill(NaN);
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      s += a[i];
      if (i >= n) s -= a[i - n];
      if (i >= n - 1) o[i] = s / n;
    }
    return o;
  }
  function stdev(a, n) {
    const m = sma(a, n);
    const o = new Array(a.length).fill(NaN);
    for (let i = n - 1; i < a.length; i++) {
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2;
      o[i] = Math.sqrt(s / n);
    }
    return o;
  }
  function rsi(c, n = 14) {
    const o = new Array(c.length).fill(NaN);
    let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      const up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) {
        g += up; l += dn;
        if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
        continue;
      }
      g = (g * (n - 1) + up) / n;
      l = (l * (n - 1) + dn) / n;
      o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return o;
  }
  function atr(k, n = 14) {
    const o = new Array(k.length).fill(NaN);
    let a = 0;
    for (let i = 1; i < k.length; i++) {
      const tr = Math.max(k[i].h - k[i].l, Math.abs(k[i].h - k[i - 1].c), Math.abs(k[i].l - k[i - 1].c));
      if (i <= n) { a += tr; if (i === n) { a /= n; o[i] = a; } continue; }
      a = (a * (n - 1) + tr) / n;
      o[i] = a;
    }
    return o;
  }

  function indicators(k) {
    const c = k.map((x) => x.c), v = k.map((x) => x.v);
    const mid = sma(c, 20), sd = stdev(c, 20);
    const hh48 = new Array(k.length).fill(NaN);
    for (let i = 48; i < k.length; i++) {
      let m = -Infinity;
      for (let j = i - 48; j < i; j++) m = Math.max(m, k[j].h);
      hh48[i] = m;
    }
    return {
      c, v,
      ema50: ema(c, 50),
      ema200: ema(c, 200),
      rsi: rsi(c, 14),
      atr: atr(k, 14),
      bbLo: mid.map((m, i) => m - 2 * sd[i]),
      hh48,
      vol20: sma(v, 20),
      ret24: c.map((x, i) => (i >= 24 ? x / c[i - 24] - 1 : NaN)),
    };
  }

  // ---------------------------------------------------------------- estudio a largo plazo
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
  function maxDrawdown(c) {
    let peak = -Infinity, dd = 0;
    for (const x of c) { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); }
    return dd;
  }

  function studyCoin(d, btc) {
    const c = d.map((x) => x.c);
    const n = c.length;
    const last = c[n - 1];
    const ret = (k) => (n > k ? last / c[n - 1 - k] - 1 : null);
    const lr = c.slice(1).map((x, i) => Math.log(x / c[i]));
    const lr365 = lr.slice(-365);
    const volAnn = std(lr365) * Math.sqrt(365);
    const muAnn = mean(lr365) * 365;
    const down = lr365.filter((x) => x < 0);
    const downDev = Math.sqrt(mean(down.map((x) => x * x))) * Math.sqrt(365);
    const days = (d[n - 1].t - d[0].t) / 864e5;
    const s50 = sma(c, 50)[n - 1], s200 = n >= 200 ? sma(c, 200)[n - 1] : NaN;
    let trend = 'Lateral';
    if (last > s200 && s50 > s200) trend = 'Alcista';
    else if (last < s200 && s50 < s200) trend = 'Bajista';

    let corr = null, beta = null;
    if (btc) {
      const bmap = new Map();
      for (let i = 1; i < btc.length; i++) bmap.set(btc[i].t, Math.log(btc[i].c / btc[i - 1].c));
      const xs = [], ys = [];
      for (let i = Math.max(1, n - 365); i < n; i++) {
        const b = bmap.get(d[i].t);
        if (b !== undefined) { xs.push(b); ys.push(Math.log(c[i] / c[i - 1])); }
      }
      if (xs.length > 60) {
        const mx = mean(xs), my = mean(ys);
        let cov = 0, vx = 0, vy = 0;
        for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
        corr = cov / Math.sqrt(vx * vy);
        beta = cov / vx;
      }
    }
    return {
      price: last,
      r30: ret(30), r90: ret(90), r365: ret(365),
      cagr: days > 60 ? Math.pow(last / c[0], 365 / days) - 1 : null,
      years: days / 365,
      volAnn,
      sharpe: volAnn ? muAnn / volAnn : 0,
      sortino: downDev ? muAnn / downDev : 0,
      maxDD365: maxDrawdown(c.slice(-365)),
      maxDDAll: maxDrawdown(c),
      upDays: lr365.filter((x) => x > 0).length / (lr365.length || 1),
      sma50: s50, sma200: s200, trend,
      distATH: last / Math.max(...d.map((x) => x.h)) - 1,
      corr, beta,
      qv30: mean(d.slice(-30).map((x) => x.qv)),
      spark: c.slice(-365),
    };
  }

  function rankCoins(studies) {
    const keys = Object.keys(studies);
    const feats = {
      sharpe: { w: 0.30, get: (s) => s.sharpe, label: 'rentabilidad ajustada al riesgo (Sharpe)' },
      mom: { w: 0.20, get: (s) => 0.5 * Math.log(1 + (s.r90 ?? 0)) + 0.5 * Math.log(1 + (s.r365 ?? 0)), label: 'impulso a 3 y 12 meses' },
      trend: { w: 0.15, get: (s) => (s.trend === 'Alcista' ? 1 : s.trend === 'Bajista' ? -1 : 0), label: 'tendencia (medias de 50 y 200 días)' },
      dd: { w: 0.15, get: (s) => s.maxDD365, label: 'caída máxima del último año' },
      liq: { w: 0.10, get: (s) => Math.log(s.qv30 || 1), label: 'liquidez' },
      vol: { w: 0.10, get: (s) => -s.volAnn, label: 'estabilidad (volatilidad baja)' },
    };
    const z = {};
    for (const [f, def] of Object.entries(feats)) {
      const vals = keys.map((k) => def.get(studies[k]));
      const m = mean(vals), sd = std(vals) || 1;
      keys.forEach((k, i) => { (z[k] = z[k] || {})[f] = (vals[i] - m) / sd; });
    }
    for (const k of keys) {
      let s = 0;
      const contrib = [];
      for (const [f, def] of Object.entries(feats)) { s += def.w * z[k][f]; contrib.push([def.label, def.w * z[k][f]]); }
      contrib.sort((a, b) => b[1] - a[1]);
      studies[k].score = Math.max(0, Math.min(100, 50 + 25 * s));
      studies[k].pros = contrib.filter((x) => x[1] > 0.05).slice(0, 2).map((x) => x[0]);
      studies[k].cons = contrib.filter((x) => x[1] < -0.05).slice(-2).reverse().map((x) => x[0]);
    }
    keys.sort((a, b) => studies[b].score - studies[a].score).forEach((k, i) => { studies[k].rank = i + 1; });
    return keys;
  }

  // ---------------------------------------------------------------- backtest
  function simulate(k, x, setup, tp, sl, from, to) {
    const cost = 2 * (CONFIG.feePct + CONFIG.slipPct);
    const trades = [];
    let i = Math.max(from, 201);
    while (i < to - 1) {
      if (!(x.atr[i] > 0) || !setup.fn(x, i)) { i++; continue; }
      const entry = k[i].c, a = x.atr[i];
      const tpP = entry + tp * a, slP = entry - sl * a;
      const lastJ = i + CONFIG.maxHoldH;
      if (lastJ >= to) break; // no hay datos para cerrar la operación
      let exit = null, j = i + 1;
      for (; j <= lastJ; j++) {
        if (k[j].l <= slP) { exit = slP; break; } // si toca los dos, se asume el stop (conservador)
        if (k[j].h >= tpP) { exit = tpP; break; }
      }
      if (exit === null) { j = lastJ; exit = k[j].c; }
      trades.push(exit / entry - 1 - cost);
      i = j + 1;
    }
    return trades;
  }

  function wilsonLow(w, n, z = 1.645) {
    if (!n) return 0;
    const p = w / n;
    return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
  }
  function stats(tr) {
    const n = tr.length, w = tr.filter((p) => p > 0).length;
    const avg = n ? mean(tr) : 0;
    return { n, w, win: n ? w / n : 0, avg, sum: tr.reduce((s, p) => s + p, 0), low: wilsonLow(w, n) };
  }

  function qualify(sym, k) {
    const x = indicators(k);
    const split = Math.floor(k.length * CONFIG.trainFrac);
    const out = [];
    for (const [sid, setup] of Object.entries(SETUPS)) {
      let best = null;
      for (const tp of CONFIG.tpGrid) for (const sl of CONFIG.slGrid) {
        const st = stats(simulate(k, x, setup, tp, sl, 0, split));
        if (st.n >= CONFIG.minTrain && st.win >= CONFIG.minWin && st.avg > 0 && (!best || st.sum > best.train.sum)) {
          best = { tp, sl, train: st };
        }
      }
      if (!best) { out.push({ sym, sid, verdict: 'sin-candidato' }); continue; }
      const val = stats(simulate(k, x, setup, best.tp, best.sl, split, k.length));
      const passed = val.n >= CONFIG.minVal && val.win >= CONFIG.minWin && val.avg > 0;
      out.push({ sym, sid, tp: best.tp, sl: best.sl, train: best.train, val, verdict: passed ? 'valido' : 'falla-validacion' });
    }
    return out;
  }

  // ---------------------------------------------------------------- utilidades
  const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + ' %');
  const localDay = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE');
  const pkey = (sym, sid) => `${sym}|${sid}`;

  function freshState() {
    return {
      v: 1, created: Date.now(), capital: CONFIG.startCapital, running: false,
      studies: {}, ranking: [], patterns: {}, open: [], closed: [], lessons: [], log: [],
      lastResearch: 0, lastSignalT: {}, prices: {}, missing: [],
    };
  }

  // ---------------------------------------------------------------- bot
  class Bot {
    constructor({ storage, onChange, fetch: f } = {}) {
      if (f) fetchImpl = f;
      this.storage = storage;
      this.onChange = onChange || (() => {});
      this.state = (storage && storage.load()) || freshState();
      this.busy = false;
    }
    save() { if (this.storage) this.storage.save(this.state); this.onChange(this.state); }
    log(msg, kind = 'info') {
      this.state.log.unshift({ t: Date.now(), msg, kind });
      this.state.log.length = Math.min(this.state.log.length, 300);
      this.onChange(this.state);
    }
    lesson(text, kind) {
      this.state.lessons.unshift({ t: Date.now(), text, kind });
      this.state.lessons.length = Math.min(this.state.lessons.length, 200);
    }
    tradesToday() {
      const d = localDay();
      return this.state.open.concat(this.state.closed).filter((t) => localDay(t.entryT) === d).length;
    }
    equity() {
      let e = this.state.capital;
      for (const t of this.state.open) {
        const p = this.state.prices[t.sym];
        if (p) e += t.notional * (p / t.entry - 1);
      }
      return e;
    }

    async research(progress = () => {}) {
      const s = this.state;
      this.log('Empieza el estudio de todas las monedas con datos reales de Binance.');
      const daily = {}, hourly = {};
      s.missing = [];
      let step = 0;
      const total = COINS.length * 2;
      for (const coin of COINS) {
        const symbol = coin.sym + CONFIG.quote;
        try {
          progress(++step / total, `Velas diarias de ${coin.sym}`);
          daily[coin.sym] = closedOnly(await klines(symbol, '1d', 1000));
          progress(++step / total, `Velas de 1 h de ${coin.sym}`);
          hourly[coin.sym] = closedOnly(await klinesPaged(symbol, '1h', CONFIG.hourlyPages));
        } catch (e) {
          s.missing.push(coin.sym);
          step += 1;
          this.log(`${coin.sym}: no hay datos (${e.message}). Se omite.`, 'warn');
        }
      }
      const studies = {};
      for (const sym of Object.keys(daily)) {
        if (daily[sym].length < 120) { s.missing.push(sym); continue; }
        studies[sym] = studyCoin(daily[sym], daily.BTC);
      }
      s.ranking = rankCoins(studies);
      s.studies = studies;
      for (const sym of Object.keys(studies)) s.prices[sym] = studies[sym].price;

      // Patrones: se conservan los resultados reales y los bloqueos anteriores.
      let valid = 0;
      for (const sym of Object.keys(hourly)) {
        if (hourly[sym].length < 800) continue;
        for (const q of qualify(sym, hourly[sym])) {
          const key = pkey(sym, q.sid);
          const prev = s.patterns[key];
          const p = prev || { sym, sid: q.sid, live: { n: 0, w: 0, sum: 0, recent: [] }, status: null };
          Object.assign(p, { tp: q.tp, sl: q.sl, train: q.train, val: q.val, verdict: q.verdict, tested: Date.now() });
          if (!prev && q.verdict === 'falla-validacion') {
            const why = q.val.n < CONFIG.minVal ? `solo ${q.val.n} operaciones en validación, muy pocas para fiarse`
              : q.val.win < CONFIG.minWin ? `en validación bajó al ${Math.round(q.val.win * 100)} % de acierto`
              : `en validación acertó el ${Math.round(q.val.win * 100)} % pero perdía dinero de media (${pct(q.val.avg, 2)}): las pérdidas eran mayores que las ganancias`;
            this.lesson(`${sym} · ${SETUPS[q.sid].name}: ganaba el ${Math.round(q.train.win * 100)} % en entrenamiento, pero ${why}. Descartado por sobreajuste.`, 'bad');
          }
          if (q.verdict === 'valido') valid++;
          if (!p.status || p.status === 'descartado') p.status = q.verdict === 'valido' ? 'aprendiendo' : 'descartado';
          if (p.status === 'aprendiendo' && q.verdict !== 'valido' && p.live.n === 0) p.status = 'descartado';
          if (q.verdict === 'sin-candidato' && !prev) continue; // no se guarda lo que nunca fue candidato
          s.patterns[key] = p;
        }
      }
      s.lastResearch = Date.now();
      this.log(`Estudio terminado: ${Object.keys(studies).length} monedas analizadas, ${valid} patrones superan el 75 % en validación.`, 'ok');
      this.save();
    }

    probability(p) {
      const bt = { n: (p.train?.n || 0) + (p.val?.n || 0), w: (p.train?.w || 0) + (p.val?.w || 0) };
      const n = bt.n + p.live.n, w = bt.w + p.live.w;
      return { p: n ? w / n : 0, low: wilsonLow(w, n), n };
    }

    tradable(p) {
      return (p.status === 'aprendiendo' || p.status === 'funciona') && p.verdict === 'valido' && this.probability(p).p >= CONFIG.minWin;
    }

    async scan() {
      const s = this.state;
      const pats = Object.values(s.patterns).filter((p) => this.tradable(p));
      const bySym = {};
      for (const p of pats) (bySym[p.sym] = bySym[p.sym] || []).push(p);
      const candidates = [];
      for (const sym of Object.keys(bySym)) {
        let k;
        try { k = await klines(sym + CONFIG.quote, '1h', 400); } catch (e) { this.log(`${sym}: error al leer precios (${e.message})`, 'warn'); continue; }
        s.prices[sym] = k[k.length - 1].c;
        const closed = closedOnly(k);
        const x = indicators(closed);
        const i = closed.length - 1;
        for (const p of bySym[sym]) {
          const key = pkey(sym, p.sid);
          if (s.lastSignalT[key] === closed[i].t) continue;
          if (SETUPS[p.sid].fn(x, i) && x.atr[i] > 0) {
            s.lastSignalT[key] = closed[i].t;
            candidates.push({ p, atr: x.atr[i], price: s.prices[sym], candleT: closed[i].t });
          }
        }
      }
      candidates.sort((a, b) => this.probability(b.p).p - this.probability(a.p).p || b.p.val.avg - a.p.val.avg);
      for (const c of candidates) {
        const reason = this.canOpen(c.p.sym);
        if (reason) { this.log(`Señal ${c.p.sym} · ${SETUPS[c.p.sid].name} ignorada: ${reason}.`, 'warn'); continue; }
        this.open(c);
      }
      this.save();
    }

    canOpen(sym) {
      if (this.tradesToday() >= CONFIG.maxTradesPerDay) return 'ya se hicieron las 3 operaciones de hoy';
      if (this.state.open.length >= CONFIG.maxOpen) return 'hay 3 posiciones abiertas';
      if (this.state.open.some((t) => t.sym === sym)) return `ya hay una posición abierta en ${sym}`;
      return null;
    }

    open({ p, atr: a, price }) {
      const s = this.state;
      const entry = price * (1 + CONFIG.slipPct);
      const tpP = entry + p.tp * a, slP = entry - p.sl * a;
      const riskFrac = (entry - slP) / entry;
      const notional = Math.min(s.capital * CONFIG.riskPct / riskFrac, s.capital * CONFIG.maxPosPct);
      const prob = this.probability(p);
      const t = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        sym: p.sym, sid: p.sid, entry, tpP, slP, notional, entryT: Date.now(), checkedT: Date.now(),
        prob: prob.p, probLow: prob.low, status: p.status,
      };
      s.open.push(t);
      this.log(`COMPRA simulada ${p.sym} a ${fmtPrice(entry)} · ${SETUPS[p.sid].name} · objetivo ${fmtPrice(tpP)}, stop ${fmtPrice(slP)} · prob. estimada ${Math.round(prob.p * 100)} % · tamaño ${notional.toFixed(0)} USDT`, 'trade');
    }

    async updateOpen() {
      const s = this.state;
      const now = Date.now();
      for (const t of [...s.open]) {
        let k;
        try { k = await klinesSince(t.sym + CONFIG.quote, '5m', Math.max(t.entryT, t.checkedT - 5 * 60e3) - 5 * 60e3); } catch (e) { continue; }
        const deadline = t.entryT + CONFIG.maxHoldH * 3600e3;
        let exit = null, reason = null, exitT = null;
        for (const c of k) {
          if (c.t + 5 * 60e3 <= t.entryT) continue;
          if (c.l <= t.slP) { exit = t.slP; reason = 'stop'; exitT = c.t; break; }
          if (c.h >= t.tpP) { exit = t.tpP; reason = 'objetivo'; exitT = c.t; break; }
          if (c.ct >= deadline && c.ct < now) { exit = c.c; reason = 'tiempo (48 h)'; exitT = c.ct; break; }
        }
        if (k.length) { s.prices[t.sym] = k[k.length - 1].c; t.checkedT = now; }
        if (exit !== null) this.close(t, exit, reason, exitT);
      }
    }

    close(t, exitPrice, reason, exitT) {
      const s = this.state;
      const exit = exitPrice * (1 - CONFIG.slipPct);
      const pnlPct = exit / t.entry - 1 - 2 * CONFIG.feePct;
      const pnl = t.notional * pnlPct;
      s.capital += pnl;
      s.open = s.open.filter((o) => o.id !== t.id);
      s.closed.unshift({ ...t, exit, exitT, reason, pnlPct, pnl });
      const win = pnl > 0;
      this.log(`CIERRE ${t.sym} por ${reason}: ${pct(pnlPct, 2)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT)`, win ? 'ok' : 'bad');
      const p = s.patterns[pkey(t.sym, t.sid)];
      if (p) this.learn(p, pnlPct);
    }

    learn(p, pnlPct) {
      const L = p.live;
      L.n++; if (pnlPct > 0) L.w++; L.sum += pnlPct;
      L.recent = (L.recent || []).concat(pnlPct).slice(-20);
      const name = `${p.sym} · ${SETUPS[p.sid].name}`;
      const wr = L.w / L.n, avg = L.sum / L.n;
      const before = p.status;
      if (L.n >= CONFIG.learnMinTrades) {
        const rw = L.recent.filter((x) => x > 0).length / L.recent.length;
        const ravg = mean(L.recent);
        p.status = rw >= CONFIG.minWin && ravg > 0 ? 'funciona' : 'no-funciona';
      } else if (L.n >= CONFIG.failEarlyTrades && wr < 0.5) {
        p.status = 'no-funciona';
      }
      if (p.status !== before) {
        if (p.status === 'funciona') this.lesson(`${name}: ${L.n} operaciones reales en simulación, ${Math.round(wr * 100)} % de acierto y ${pct(avg, 2)} de media. Pasa a APRENDIDO: funciona.`, 'good');
        if (p.status === 'no-funciona') this.lesson(`${name}: se esperaba un ${Math.round(this.probability(p).p * 100)} % de acierto y en real ha dado ${Math.round(wr * 100)} % en ${L.n} operaciones (media ${pct(avg, 2)}). Pasa a APRENDIDO: no funciona y queda bloqueado.`, 'bad');
      }
    }

    async tick(progress) {
      if (this.busy) return;
      this.busy = true;
      try {
        if (Date.now() - this.state.lastResearch > CONFIG.researchEveryH * 3600e3) await this.research(progress);
        await this.updateOpen();
        await this.scan();
      } catch (e) {
        this.log(`Error: ${e.message}`, 'bad');
      } finally {
        this.busy = false;
        this.save();
      }
    }

    reset() { this.state = freshState(); this.save(); }
    import(obj) { if (!obj || obj.v !== 1) throw new Error('Archivo no válido'); this.state = obj; this.save(); }
  }

  function fmtPrice(p) {
    if (!isFinite(p)) return '—';
    const d = p >= 1000 ? 2 : p >= 1 ? 3 : p >= 0.01 ? 5 : 7;
    return p.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  return {
    CONFIG, COINS, SETUPS, Bot, freshState,
    indicators, studyCoin, rankCoins, simulate, stats, qualify, wilsonLow,
    pct, fmtPrice, localDay,
  };
});
