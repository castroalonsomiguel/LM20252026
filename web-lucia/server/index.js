import { config } from "./config.js";
import { connectDB } from "./db.js";
import { createApp } from "./app.js";

const app = createApp({ adminToken: config.adminToken, corsOrigin: config.corsOrigin });

try {
  await connectDB(config.mongoUri);
} catch (err) {
  console.error("No se pudo conectar a MongoDB:", err.message);
  process.exit(1);
}

if (!config.adminToken || config.adminToken.length < 16) {
  console.warn("Aviso: ADMIN_TOKEN no está definido o es demasiado corto; el panel /admin estará desactivado.");
}

app.listen(config.port, () => {
  console.log(`Web de Lucía Castro en http://localhost:${config.port}`);
});
