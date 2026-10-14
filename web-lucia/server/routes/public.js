import { Router } from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { Mensaje } from "../models/Mensaje.js";
import { Obra } from "../models/Obra.js";
import { Imagen } from "../models/Imagen.js";
import { isDBConnected } from "../db.js";
import { pick } from "./util.js";

export const publicRouter = Router();

const contactoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Has enviado varios mensajes seguidos. Inténtalo de nuevo en unos minutos." }
});

publicRouter.get("/salud", (_req, res) => {
  res.json({ ok: true, baseDeDatos: isDBConnected() ? "conectada" : "desconectada" });
});

publicRouter.post("/contacto", contactoLimiter, async (req, res) => {
  const body = req.body || {};
  // Campo trampa: los humanos no lo ven; si viene relleno es un bot.
  if (body.web) return res.status(201).json({ ok: true });
  if (body.privacidad !== true && body.privacidad !== "on") {
    return res.status(400).json({ error: "Debes aceptar la política de privacidad." });
  }
  const mensaje = await Mensaje.create(pick(body, ["nombre", "email", "telefono", "area", "mensaje", "pagina"]));
  res.status(201).json({ ok: true, id: mensaje.id });
});

publicRouter.get("/obras", async (_req, res) => {
  const obras = await Obra.find({ publicada: true })
    .sort({ destacada: -1, orden: 1, createdAt: -1 })
    .select("-publicada -createdAt -updatedAt");
  res.set("Cache-Control", "no-cache");
  res.json(obras);
});

publicRouter.get("/imagenes/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Imagen no encontrada." });
  const img = await Imagen.findById(req.params.id);
  if (!img) return res.status(404).json({ error: "Imagen no encontrada." });
  res.set("Content-Type", img.contentType);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(img.data);
});
