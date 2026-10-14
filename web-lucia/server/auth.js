import crypto from "node:crypto";

const digest = (value) => crypto.createHash("sha256").update(String(value)).digest();

// Protege el panel de administración con un token secreto (ADMIN_TOKEN).
export function requireAdmin(adminToken) {
  return (req, res, next) => {
    if (!adminToken || adminToken.length < 16) {
      return res.status(503).json({ error: "El panel de administración no está configurado (ADMIN_TOKEN)." });
    }
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || !crypto.timingSafeEqual(digest(token), digest(adminToken))) {
      return res.status(401).json({ error: "Acceso no autorizado." });
    }
    next();
  };
}
