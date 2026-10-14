import mongoose from "mongoose";

export async function connectDB(uri) {
  if (!uri) throw new Error("Falta MONGODB_URI. Cópialo en el archivo .env (ver .env.example).");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB conectado: ${mongoose.connection.name}`);
  return mongoose.connection;
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
