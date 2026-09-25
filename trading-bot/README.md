# Centinela · bot de trading simulado

Bot hecho desde cero que estudia las principales criptomonedas con **datos reales de Binance** y opera con **dinero ficticio** (10 000 USDT). Nunca envía órdenes reales ni necesita claves de API.

## Cómo usarlo

**Opción A: en el navegador (panel visual)**
1. Descarga la carpeta `trading-bot` (o clona el repositorio).
2. Abre `index.html` con Chrome, Edge o Firefox.
3. El estudio de las monedas se hace solo al abrir la página. Pulsa **Iniciar bot** para que empiece a operar.
4. El bot solo trabaja mientras la página está abierta. Al volver a abrirla, revisa lo que pasó con las operaciones abiertas.

**Opción B: 24/7 en la consola (Node 18 o superior)**
```
cd trading-bot
node bot.js
```
Guarda todo en `estado.json`. Puedes cargar ese archivo en el panel con **Importar estado**.

## Qué hace

1. **Estudio a largo plazo** de BTC, ETH, BNB, SOL, XRP, ADA, DOGE, TRX, AVAX, LINK, DOT, LTC, TON, SUI y NEAR con velas diarias (hasta 1000 días): rentabilidad a 30 días, 90 días y 1 año, CAGR, volatilidad, caída máxima, Sharpe, Sortino, tendencia, correlación y beta con BTC, y liquidez. Con todo eso se calcula una puntuación relativa de 0 a 100.
2. **Busca patrones de entrada** en velas de 1 hora (unos 166 días): rebote en tendencia, banda inferior de Bollinger, ruptura con volumen y sobreventa extrema.
3. **Backtest con validación**: elige objetivo y stop con el 70 % más antiguo de los datos y lo comprueba con el 30 % más reciente. Solo se aceptan los patrones con **≥ 75 % de acierto en validación** que además **ganan dinero de media** después de comisiones (0,1 % por lado) y deslizamiento.
4. **Sin límite de operaciones al día**: entra en todo lo que pase los filtros, con una posición por moneda y sin que la suma de posiciones supere el capital. Arriesga el 1 % del capital hasta el stop y cierra por objetivo, por stop o a las 48 h.
5. **Criterio Claude**: cada hora busca en el historial de cada moneda los momentos parecidos al actual (misma tendencia y RSI parecido), simula comprar en ellos con varias combinaciones de objetivo y stop, y abre la mejor si acertó ≥ 75 % en al menos 30 casos y ganó dinero de media.
6. **Límite de pérdida del 25 %**: si una operación pierde más del 25 % del capital inicial, se cierra. Si la pérdida total de la cuenta (cerradas más abiertas) llega al 25 % (2500 USDT), se cierra todo y el bot deja de operar hasta que pulses «Reiniciar».
7. **Aprende**:
   - *Aprendiendo*: patrones validados que se están probando en simulación.
   - *Aprendido: funciona*: 10 operaciones o más con ≥ 75 % de acierto y ganancia media positiva.
   - *Aprendido: no funciona*: no cumplió lo esperado (o falló en validación). Queda bloqueado para no repetir el error.
   - *Diario de lecciones*: explica en texto cada cambio.

Los parámetros están al principio de `engine.js`, en `CONFIG`.

## Limitaciones

- El 75 % es una estimación con datos pasados, no una garantía. El mercado cambia y un patrón que funcionó puede dejar de hacerlo (por eso existe el apartado «no funciona»).
- Si ningún patrón llega al 75 %, el bot no opera. Es lo esperado: prefiere no operar a operar mal.
- Un acierto alto no basta: por eso también se exige que la ganancia media sea positiva.
- La puntuación de largo plazo compara cómo se han comportado las monedas; no predice su precio.
- Es un proyecto educativo. No es asesoramiento financiero.
