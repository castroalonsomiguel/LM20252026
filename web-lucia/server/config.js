import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || "",
  adminToken: process.env.ADMIN_TOKEN || "",
  // Solo si la web se aloja en otro dominio distinto al de la API (p. ej. GitHub Pages)
  corsOrigin: process.env.CORS_ORIGIN || "",
  isProduction: process.env.NODE_ENV === "production"
};
