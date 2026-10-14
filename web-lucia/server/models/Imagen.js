import mongoose from "mongoose";

// Las imágenes de las obras se guardan en la propia base de datos,
// así la web funciona igual en cualquier alojamiento.
const imagenSchema = new mongoose.Schema(
  {
    nombre: { type: String, trim: true, maxlength: 200 },
    contentType: { type: String, required: true },
    tamano: { type: Number, required: true },
    data: { type: Buffer, required: true }
  },
  { timestamps: true, collection: "imagenes" }
);

export const Imagen = mongoose.model("Imagen", imagenSchema);
