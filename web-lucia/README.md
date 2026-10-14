# Web de Lucía Castro — Arquitectura · Pintura · Escenografía

Sitio estático (HTML + CSS + JS, sin dependencias). Basta con abrir `index.html` en el navegador
o subir la carpeta a cualquier hosting (GitHub Pages, Netlify, etc.).

## Páginas
| Página | Contenido |
|---|---|
| `index.html` | Portada con animación de entrada y acceso a los tres espacios |
| `arquitectura.html` → `arquitectura-mas.html` | Presentación como arquitecta y fortalezas · "Saber más" |
| `pintura.html` → `pintura-mas.html` | Aptitudes como pintora y cuadro destacado · "Saber más" con galería |
| `escenografia.html` → `escenografia-mas.html` | Paso por la escenografía · "Saber más" |

Los botones **Saber más** abren la página ampliada en una pestaña nueva.

## Cómo personalizar
- **Portfolio, correo, teléfono e Instagram:** `assets/config.js` (se aplica a todas las páginas).
  Por defecto el portfolio apunta a `assets/portfolio-lucia-castro.pdf`: copia ahí el PDF
  o cambia `portfolioUrl` por un enlace externo (Issuu, Drive, Behance…).
- **Cuadros:** coloca las fotos en `assets/img/` con estos nombres y aparecerán automáticamente
  (si no existen se muestra un lienzo abstracto):
  - `cuadro-destacado.jpg` (página Pintura)
  - `cuadro-1.jpg` … `cuadro-6.jpg` (galería de "Saber más" de Pintura)
  Los títulos y técnicas de cada cuadro se editan en `pintura.html` y `pintura-mas.html`.
- **Textos:** directamente en cada archivo `.html`.
