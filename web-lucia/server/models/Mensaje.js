import mongoose from "mongoose";
import { cleanJSON } from "./toJSON.js";

export const AREAS = ["arquitectura", "pintura", "escenografia", "otro"];

const mensajeSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: [true, "Indica tu nombre."], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, "Indica tu correo electrónico."],
      trim: true,
      lowercase: true,
      maxlength: 200,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "El correo electrónico no es válido."]
    },
    telefono: { type: String, trim: true, maxlength: 40, default: "" },
    area: { type: String, enum: AREAS, default: "otro" },
    mensaje: {
      type: String,
      required: [true, "Escribe tu mensaje."],
      trim: true,
      minlength: [10, "El mensaje es demasiado corto."],
      maxlength: [5000, "El mensaje es demasiado largo (máximo 5000 caracteres)."]
    },
    leido: { type: Boolean, default: false },
    pagina: { type: String, trim: true, maxlength: 200, default: "" }
  },
  { timestamps: true, collection: "mensajes" }
);

mensajeSchema.index({ createdAt: -1 });
mensajeSchema.index({ leido: 1, createdAt: -1 });
cleanJSON(mensajeSchema);

export const Mensaje = mongoose.model("Mensaje", mensajeSchema);
