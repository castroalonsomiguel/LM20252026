import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { Mensaje } from "../models/Mensaje.js";
import { Obra } from "../models/Obra.js";
import { Imagen } from "../models/Imagen.js";
import { pick } from "./util.js";

const OBRA_FIELDS = ["titulo", "tecnica", "anio", "medidas", "descripcion", "imagen", "disponible", "destacada", "publicada", "orden"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const IMAGE_PREFIX = "/api/imagenes/";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("Formato de imagen no admitido (usa JPG, PNG, WEBP o AVIF)."), { status: 400 }));
  }
});

export const adminRouter = Router();

const notFound = (res, what) => res.status(404).json({ error: `${what} no encontrado.` });
const validId = (id) => mongoose.isValidObjectId(id);

async function borrarImagenInterna(url) {
  if (url && url.startsWith(IMAGE_PREFIX)) {
    const id = url.slice(IMAGE_PREFIX.length);
    if (validId(id)) await Imagen.findByIdAndDelete(id);
  }
}

adminRouter.get("/comprobar", (_req, res) => res.json({ ok: true }));

// ---------- Mensajes ----------
adminRouter.get("/mensajes", async (req, res) => {
  const filtro = {};
  if (req.query.leido === "true") filtro.leido = true;
  if (req.query.leido === "false") filtro.leido = false;
  const [mensajes, sinLeer] = await Promise.all([
    Mensaje.find(filtro).sort({ createdAt: -1 }).limit(500),
    Mensaje.countDocuments({ leido: false })
  ]);
  res.json({ mensajes, sinLeer });
});

adminRouter.patch("/mensajes/:id", async (req, res) => {
  if (!validId(req.params.id)) return notFound(res, "Mensaje");
  const m = await Mensaje.findByIdAndUpdate(req.params.id, { leido: Boolean(req.body?.leido) }, { new: true });
  if (!m) return notFound(res, "Mensaje");
  res.json(m);
});

adminRouter.delete("/mensajes/:id", async (req, res) => {
  if (!validId(req.params.id)) return notFound(res, "Mensaje");
  const m = await Mensaje.findByIdAndDelete(req.params.id);
  if (!m) return notFound(res, "Mensaje");
  res.status(204).end();
});

// ---------- Obras ----------
adminRouter.get("/obras", async (_req, res) => {
  res.json(await Obra.find().sort({ destacada: -1, orden: 1, createdAt: -1 }));
});

adminRouter.post("/obras", async (req, res) => {
  const obra = await Obra.create(pick(req.body, OBRA_FIELDS));
  if (obra.destacada) await Obra.updateMany({ _id: { $ne: obra._id } }, { destacada: false });
  res.status(201).json(obra);
});

adminRouter.patch("/obras/:id", async (req, res) => {
  if (!validId(req.params.id)) return notFound(res, "Obra");
  const anterior = await Obra.findById(req.params.id);
  if (!anterior) return notFound(res, "Obra");
  const cambios = pick(req.body, OBRA_FIELDS);
  const obra = await Obra.findByIdAndUpdate(req.params.id, cambios, { new: true, runValidators: true });
  if (cambios.imagen !== undefined && cambios.imagen !== anterior.imagen) await borrarImagenInterna(anterior.imagen);
  if (obra.destacada) await Obra.updateMany({ _id: { $ne: obra._id } }, { destacada: false });
  res.json(obra);
});

adminRouter.delete("/obras/:id", async (req, res) => {
  if (!validId(req.params.id)) return notFound(res, "Obra");
  const obra = await Obra.findByIdAndDelete(req.params.id);
  if (!obra) return notFound(res, "Obra");
  await borrarImagenInterna(obra.imagen);
  res.status(204).end();
});

// ---------- Imágenes ----------
adminRouter.post("/imagenes", upload.single("imagen"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se ha recibido ninguna imagen." });
  const img = await Imagen.create({
    nombre: req.file.originalname,
    contentType: req.file.mimetype,
    tamano: req.file.size,
    data: req.file.buffer
  });
  res.status(201).json({ url: IMAGE_PREFIX + img.id });
});
