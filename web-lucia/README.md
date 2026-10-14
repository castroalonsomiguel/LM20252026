# Web de Lucía Castro — Arquitectura · Pintura · Escenografía

Web profesional con servidor propio (Node.js + Express) y base de datos **MongoDB**.

## Qué guarda la base de datos

| Colección | Para qué sirve |
|---|---|
| `mensajes` | Lo que la gente envía desde el formulario de contacto (nombre, correo, teléfono, tema, mensaje, leído/no leído). |
| `obras` | Los cuadros de la sección Pintura: título, técnica, medidas, año, descripción, imagen, disponible/vendida, destacada, visible y orden. |
| `imagenes` | Las fotos de los cuadros subidas desde el panel (se guardan en la propia base de datos). |

La obra marcada como **destacada** aparece en `pintura.html`; el resto, en la galería de `pintura-mas.html`.
Si el servidor no responde, la web sigue funcionando y muestra los cuadros de ejemplo.

## Panel de administración — `/admin`

Lucía entra en `https://SU-DOMINIO/admin` con la clave `ADMIN_TOKEN` y puede:
- leer los mensajes, marcarlos como leídos, responder por correo y borrarlos;
- añadir, editar, ocultar o borrar cuadros y subir sus fotos (JPG, PNG o WEBP, máx. 8 MB).

## Estructura

```
web-lucia/
├── public/            ← la web (HTML, CSS, JS) y el panel admin.html
├── server/
│   ├── index.js       ← arranque del servidor
│   ├── app.js         ← Express: seguridad, rutas y web estática
│   ├── models/        ← esquemas de MongoDB (Mensaje, Obra, Imagen)
│   ├── routes/        ← API pública y API del panel
│   ├── seed.js        ← carga las obras de ejemplo
│   └── test/          ← pruebas automáticas
├── .env.example       ← variables de configuración
└── package.json
```

## Puesta en marcha en tu ordenador

Necesitas **Node.js 20 o superior**.

1. **Crea la base de datos** (gratis) en [MongoDB Atlas](https://www.mongodb.com/cloud/atlas):
   1. Crea un clúster gratuito (M0).
   2. En *Database Access*, crea un usuario con contraseña.
   3. En *Network Access*, permite el acceso (`0.0.0.0/0` si vas a publicar en Render).
   4. En *Connect → Drivers*, copia la cadena de conexión `mongodb+srv://...`.
2. **Configura el proyecto:**
   ```bash
   cd web-lucia
   npm install
   cp .env.example .env
   ```
   Abre `.env` y rellena `MONGODB_URI` (añade el nombre de la base, p. ej. `/lucia-castro`, antes del `?`)
   y `ADMIN_TOKEN`. Puedes generar una clave segura con:
   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```
3. **Carga las obras de ejemplo** (opcional): `npm run seed`
4. **Arranca:** `npm start` y abre <http://localhost:3000> (panel en <http://localhost:3000/admin>).

## Publicar en internet (Render, gratis)

1. Sube el repositorio a GitHub.
2. En [render.com](https://render.com) crea un **Web Service** a partir del repositorio.
   - *Root Directory:* `web-lucia`
   - *Build Command:* `npm install`
   - *Start Command:* `npm start`
3. En *Environment*, añade `MONGODB_URI`, `ADMIN_TOKEN` y `NODE_ENV=production`.
4. Cuando termine, la web estará en `https://NOMBRE.onrender.com`. Desde *Settings → Custom Domains*
   puedes conectar un dominio propio (p. ej. `luciacastro.es`).

Sirve cualquier alojamiento de Node.js (Railway, Fly.io, un VPS…).
Si prefieres publicar la parte estática aparte (por ejemplo en GitHub Pages), pon la URL del servidor
en `apiUrl` dentro de `public/assets/config.js` y añade el dominio de la web a `CORS_ORIGIN` en el servidor.

## Personalizar

- **Contacto y portfolio:** `public/assets/config.js`. El portfolio apunta por defecto a
  `public/assets/portfolio-lucia-castro.pdf`; copia ahí el PDF o pon un enlace externo.
- **Textos:** en cada archivo `.html` de `public/`.
- **Cuadros:** desde el panel `/admin`.

## Seguridad incluida

- Panel protegido con clave (`ADMIN_TOKEN`, mínimo 16 caracteres; comparación segura).
- Límite de 5 mensajes cada 15 minutos por persona y campo trampa contra bots.
- Validación de todos los datos en el servidor y cabeceras de seguridad (Helmet, CSP).
- El archivo `.env` con las contraseñas nunca se sube a GitHub (`.gitignore`).

## Pruebas

```bash
npm test
```
Las pruebas con base de datos arrancan un MongoDB temporal automáticamente
(o usan `MONGODB_TEST_URI` si la defines). No tocan tu base de datos real.
