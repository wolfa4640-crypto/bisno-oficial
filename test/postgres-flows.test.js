"use strict";

require("express-async-errors");
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const db = require("../data/database");
const auth = require("../routes/auth");
const products = require("../routes/products");

const cookieName = "bisno.sid";
const sessionStore = new PgSession({
  pool: db.pool,
  tableName: "sessions",
  createTableIfMissing: false,
  pruneSessionInterval: 15 * 60
});
let server;
let base;
let email;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    name: cookieName,
    secret: process.env.SESSION_SECRET || "test-session-secret-with-more-than-32-characters",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 86400000 }
  }));
  app.use("/api/auth", auth);
  app.use("/api/products", products);
  return app;
}

async function startServer() {
  server = createApp().listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  base = "http://127.0.0.1:" + server.address().port;
}

async function stopServer() {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server = null;
}

function cookieFrom(response) {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "o login deve criar um cookie de sessão");
  return cookie.split(";")[0];
}

test("PostgreSQL mantém registo, login, sessão, anúncio, consulta e eliminação após reinício", async () => {
  await db.initializeDatabase();
  await db.prepare("TRUNCATE TABLE users RESTART IDENTITY CASCADE").run();
  email = "pg-flow-" + Date.now() + "@example.test";
  await startServer();

  const register = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "PostgreSQL Test User",
      email,
      phone: "923456789",
      password: "ValidPass123"
    })
  });
  assert.equal(register.status, 201, "o registo deve gravar no PostgreSQL");

  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "ValidPass123" })
  });
  assert.equal(login.status, 200, "o login deve validar a palavra-passe");
  const cookie = cookieFrom(login);

  await stopServer();
  await startServer();

  const me = await fetch(base + "/api/auth/me", { headers: { cookie } });
  assert.equal(me.status, 200, "a sessão deve sobreviver ao reinício do servidor");
  const meBody = await me.json();
  assert.equal(meBody.utilizador.email, email);

  const publish = await fetch(base + "/api/products", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Anúncio PostgreSQL",
      description: "Teste de persistência",
      price: 1500,
      condition: "Novo",
      category: "Tecnologia",
      city: "Luanda",
      neighborhood: "Maianga",
      whatsapp: "244923456789"
    })
  });
  assert.equal(publish.status, 201, "a publicação deve gravar no PostgreSQL");
  const published = await publish.json();
  const productId = published.produto.id;
  assert.ok(Number.isInteger(productId) && productId > 0);

  const listing = await fetch(base + "/api/products", { headers: { cookie } });
  assert.equal(listing.status, 200);
  const listingBody = await listing.json();
  assert.ok(listingBody.produtos.some((p) => p.id === productId));

  await stopServer();
  await startServer();
  const listingAfterRestart = await fetch(base + "/api/products", { headers: { cookie } });
  assert.equal(listingAfterRestart.status, 200);
  assert.ok((await listingAfterRestart.json()).produtos.some((p) => p.id === productId),
    "o anúncio deve continuar acessível após reinício");

  const deletion = await fetch(base + "/api/products/" + productId, {
    method: "DELETE",
    headers: { cookie }
  });
  assert.equal(deletion.status, 200, "o proprietário deve conseguir eliminar o anúncio");
  const deleted = await db.prepare("SELECT id FROM products WHERE id=?").get(productId);
  assert.equal(deleted, undefined, "o anúncio eliminado não deve continuar na base de dados");

  const persistedUser = await db.prepare("SELECT id FROM users WHERE email=?").get(email);
  assert.ok(persistedUser, "o utilizador deve permanecer na base de dados após os reinícios");
});

test.after(async () => {
  await stopServer();
  try { await sessionStore.close(); } catch (_) {}
  await db.close();
});
