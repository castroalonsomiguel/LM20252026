import express from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { requireAdmin } from "./auth.js";
import { isDBConnected } from "./db.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export function createApp({ adminToken = "", corsOrigin = "" } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:", "blob:", "https:"],
          "connect-src": ["'self'"],
          "frame-ancestors": ["'none'"]
        }
      }
    })
  );

  if (corsOrigin) app.use("/api", cors({ origin: corsOrigin.split(",").map((s) => s.trim()) }));
  app.use("/api", express.json({ limit: "100kb" }));

  // Si la base de datos no está disponible, responde enseguida en lugar de esperar.
  app.use("/api", (req, res, next) => {
    if (req.path === "/salud" || isDBConnected()) return next();
    res.status(503).json({ error: "El servicio no está disponible en este momento. Inténtalo más tarde." });
  });

  app.use("/api", publicRouter);
  app.use("/api/admin", requireAdmin(adminToken), adminRouter);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

  app.use(express.static(PUBLIC_DIR, { extensions: ["html"], maxAge: "1h" }));
  app.use((_req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, "index.html")));

  // Errores
  app.use((err, _req, res, _next) => {
    if (err instanceof mongoose.Error.ValidationError) {
      const primero = Object.values(err.errors)[0];
      return res.status(400).json({ error: primero?.message || "Datos no válidos." });
    }
    if (err instanceof mongoose.Error.CastError) return res.status(400).json({ error: "Datos no válidos." });
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "La imagen supera el tamaño máximo (8 MB)." : "No se pudo subir la imagen.";
      return res.status(400).json({ error: msg });
    }
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Formato de datos no válido." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Los datos enviados son demasiado grandes." });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Ha ocurrido un error inesperado." });
  });

  return app;
}
