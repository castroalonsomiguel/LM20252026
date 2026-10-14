// Carga en la base de datos las obras de ejemplo que aparecen en la web.
// Uso: npm run seed   (no duplica obras: si ya hay obras, no hace nada)
import mongoose from "mongoose";
import { config } from "./config.js";
import { connectDB } from "./db.js";
import { Obra } from "./models/Obra.js";

const OBRAS = [
  { titulo: "Obra destacada", tecnica: "Óleo sobre lienzo", destacada: true, orden: 0 },
  { titulo: "Sin título I", tecnica: "Óleo sobre lienzo", orden: 1 },
  { titulo: "Horizonte", tecnica: "Acrílico sobre tabla", orden: 2 },
  { titulo: "Jardín", tecnica: "Técnica mixta", orden: 3 },
  { titulo: "Tríptico", tecnica: "Acrílico sobre lienzo", orden: 4 },
  { titulo: "Atardecer", tecnica: "Óleo sobre lienzo", orden: 5 },
  { titulo: "Movimiento", tecnica: "Acuarela", orden: 6 }
];

await connectDB(config.mongoUri);

const total = await Obra.countDocuments();
if (total > 0) {
  console.log(`Ya hay ${total} obras en la base de datos; no se ha añadido nada.`);
} else {
  await Obra.insertMany(OBRAS);
  console.log(`Añadidas ${OBRAS.length} obras de ejemplo. Edítalas desde /admin.`);
}
await mongoose.disconnect();
