import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../app.js";

const TOKEN = "token-de-prueba-123456789";
const auth = { Authorization: `Bearer ${TOKEN}` };
const app = createApp({ adminToken: TOKEN });

describe("sin base de datos", () => {
  test("GET /api/salud responde aunque no haya conexión", async () => {
    const res = await request(app).get("/api/salud");
    assert.equal(res.status, 200);
    assert.equal(res.body.baseDeDatos, "desconectada");
  });

  test("las rutas de datos responden 503 en vez de quedarse colgadas", async () => {
    const res = await request(app).get("/api/obras");
    assert.equal(res.status, 503);
  });

  test("sirve la web estática y el panel", async () => {
    const home = await request(app).get("/");
    assert.equal(home.status, 200);
    assert.match(home.text, /Lucía Castro/);
    const admin = await request(app).get("/admin");
    assert.equal(admin.status, 200);
    assert.match(admin.text, /Acceso al panel/);
    assert.ok(home.headers["content-security-policy"]);
  });

  test("no expone el código del servidor", async () => {
    const res = await request(app).get("/server/config.js");
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /MONGODB_URI/);
  });
});

// Pruebas con base de datos: usa MONGODB_TEST_URI si está definida;
// si no, arranca un MongoDB en memoria (necesita poder descargar el binario).
let mongo;
let uri = process.env.MONGODB_TEST_URI;
if (!uri) {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri("lucia-test");
  } catch (err) {
    console.warn("Se omiten las pruebas con base de datos: no se pudo iniciar MongoDB en memoria.", err.message);
  }
}

describe("con base de datos", { skip: !uri }, () => {
  before(async () => {
    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase();
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  test("guarda un mensaje de contacto válido", async () => {
    const res = await request(app).post("/api/contacto").send({
      nombre: "Ana", email: "ana@example.com", area: "pintura",
      mensaje: "Me gustaría encargar un cuadro.", privacidad: true
    });
    assert.equal(res.status, 201);
    const lista = await request(app).get("/api/admin/mensajes").set(auth);
    assert.equal(lista.body.mensajes.length, 1);
    assert.equal(lista.body.sinLeer, 1);
  });

  test("rechaza mensajes sin privacidad o con correo inválido", async () => {
    const a = await request(app).post("/api/contacto").send({ nombre: "A", email: "a@b.co", mensaje: "Hola, qué tal todo" });
    assert.equal(a.status, 400);
    const b = await request(app).post("/api/contacto").send({ nombre: "A", email: "no-es-correo", mensaje: "Hola, qué tal todo", privacidad: true });
    assert.equal(b.status, 400);
    assert.match(b.body.error, /correo/i);
  });

  test("el campo trampa descarta bots sin guardar", async () => {
    const res = await request(app).post("/api/contacto").send({ nombre: "Bot", email: "b@b.co", mensaje: "spam spam spam", privacidad: true, web: "x" });
    assert.equal(res.status, 201);
    const lista = await request(app).get("/api/admin/mensajes").set(auth);
    assert.ok(lista.body.mensajes.every((m) => m.nombre !== "Bot"));
  });

  test("admin sin clave o con clave errónea → 401", async () => {
    assert.equal((await request(app).get("/api/admin/mensajes")).status, 401);
    assert.equal((await request(app).get("/api/admin/mensajes").set({ Authorization: "Bearer mala" })).status, 401);
  });

  test("ciclo completo de una obra con imagen", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
    const up = await request(app).post("/api/admin/imagenes").set(auth).attach("imagen", png, { filename: "a.png", contentType: "image/png" });
    assert.equal(up.status, 201);
    const img = await request(app).get(up.body.url);
    assert.equal(img.status, 200);
    assert.equal(img.headers["content-type"], "image/png");

    const creada = await request(app).post("/api/admin/obras").set(auth).send({ titulo: "Horizonte", tecnica: "Óleo", imagen: up.body.url, destacada: true });
    assert.equal(creada.status, 201);
    const otra = await request(app).post("/api/admin/obras").set(auth).send({ titulo: "Jardín", destacada: true });
    assert.equal(otra.status, 201);

    const publicas = await request(app).get("/api/obras");
    assert.equal(publicas.body.length, 2);
    assert.equal(publicas.body.filter((o) => o.destacada).length, 1, "solo una obra destacada");

    await request(app).patch(`/api/admin/obras/${creada.body.id}`).set(auth).send({ publicada: false }).expect(200);
    assert.equal((await request(app).get("/api/obras")).body.length, 1);

    await request(app).delete(`/api/admin/obras/${creada.body.id}`).set(auth).expect(204);
    assert.equal((await request(app).get(up.body.url)).status, 404, "la imagen se borra con la obra");
  });

  test("ids inválidos devuelven 404", async () => {
    assert.equal((await request(app).delete("/api/admin/obras/123").set(auth)).status, 404);
    assert.equal((await request(app).get("/api/imagenes/xyz")).status, 404);
  });
});
