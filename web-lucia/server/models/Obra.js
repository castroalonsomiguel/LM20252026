import mongoose from "mongoose";
import { cleanJSON } from "./toJSON.js";

const obraSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: [true, "La obra necesita un título."], trim: true, maxlength: 160 },
    tecnica: { type: String, trim: true, maxlength: 120, default: "" },
    anio: { type: Number, min: 1900, max: 2100 },
    medidas: { type: String, trim: true, maxlength: 80, default: "" },
    descripcion: { type: String, trim: true, maxlength: 2000, default: "" },
    imagen: { type: String, trim: true, maxlength: 500, default: "" },
    disponible: { type: Boolean, default: true },
    destacada: { type: Boolean, default: false },
    publicada: { type: Boolean, default: true },
    orden: { type: Number, default: 0 }
  },
  { timestamps: true, collection: "obras" }
);

obraSchema.index({ publicada: 1, orden: 1, createdAt: -1 });
cleanJSON(obraSchema);

export const Obra = mongoose.model("Obra", obraSchema);
