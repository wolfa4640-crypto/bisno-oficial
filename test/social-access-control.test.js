"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bisno-social-"));
process.env.DATA_DIR = path.join(tmp, "data");
process.env.UPLOADS_DIR = path.join(tmp, "uploads");
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const express = require("express");
const session = require("express-session");
const db = require("../data/database");
require("../routes/stores");
const social = require("../routes/social");
const products = require("../routes/products");
const app = express();
app.use(express.json());
app.use(session({ secret: "test-secret-only-not-production", resave: false, saveUninitialized: false }));
app.post("/test-session/:id", (req, res) => {
  req.session.userId = Number(req.params.id);
  res.json({ ok: true });
});
app.use("/", social);
app.use("/products", products);

let server;
let base;
let buyer;
let seller;
let outsider;
let productId;
let conversation;
let notification;

test.before(async () => {
  const addUser = (name, email, phone) => Number(db.prepare(
    "INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)"
  ).run(name,email,phone,"test-hash").lastInsertRowid);
  buyer = addUser("Buyer", "buyer@test.local", "900000001");
  seller = addUser("Seller", "seller@test.local", "900000002");
  outsider = addUser("Outsider", "outsider@test.local", "900000003");
  productId = Number(db.prepare(`
    INSERT INTO products(user_id,name,description,price,condition,category,city,neighborhood)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(seller,"Test item","Test description",1000,"Novo","Tecnologia","Luanda","Maianga").lastInsertRowid);
  conversation = Number(db.prepare(
    "INSERT INTO conversations(product_id,buyer_id,seller_id) VALUES(?,?,?)"
  ).run(productId,buyer,seller).lastInsertRowid);
  db.prepare("INSERT INTO messages(conversation_id,sender_id,body) VALUES(?,?,?)")
    .run(conversation,seller,"Private message");
  notification = Number(db.prepare(
    "INSERT INTO notifications(recipient_user_id,actor_user_id,type,message) VALUES(?,?,?,?)"
  ).run(buyer,seller,"message","Private notification").lastInsertRowid);
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  base = "http://127.0.0.1:" + server.address().port;
});

async function sessionFor(userId) {
  const login = await fetch(base + "/test-session/" + userId, { method: "POST" });
  const cookie = login.headers.get("set-cookie");
  assert.ok(cookie, "test session cookie should be created");
  return cookie.split(";")[0];
}

test("outsider cannot read another user's messages", async () => {
  const cookie = await sessionFor(outsider);
  const res = await fetch(base + "/conversations/" + conversation + "/messages", { headers: { cookie } });
  assert.equal(res.status, 404);
  assert.equal(db.prepare("SELECT read_at FROM messages WHERE conversation_id=?").get(conversation).read_at, null);
});

test("outsider cannot send messages to another user's conversation", async () => {
  const cookie = await sessionFor(outsider);
  const before = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?").get(conversation).n;
  const res = await fetch(base + "/conversations/" + conversation + "/messages", {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ body: "Unauthorized attempt" })
  });
  assert.equal(res.status, 404);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?").get(conversation).n, before);
});

test("outsider cannot mark another user's notification as read", async () => {
  const cookie = await sessionFor(outsider);
  const res = await fetch(base + "/notifications/" + notification + "/read", { method: "PATCH", headers: { cookie } });
  assert.equal(res.status, 404);
  assert.equal(db.prepare("SELECT is_read FROM notifications WHERE id=?").get(notification).is_read, 0);
});

test("notifications list is scoped to the signed-in user", async () => {
  const cookie = await sessionFor(outsider);
  const res = await fetch(base + "/notifications", { headers: { cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.notificacoes.some((n) => n.id === notification), false);
  assert.equal(data.naoLidas, 0);
});

test("a legitimate conversation participant can still read messages", async () => {
  const cookie = await sessionFor(buyer);
  const res = await fetch(base + "/conversations/" + conversation + "/messages", { headers: { cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mensagens.length, 1);
  assert.equal(data.mensagens[0].body, "Private message");
});


test("outsider cannot delete another seller's listing", async () => {
  const cookie = await sessionFor(outsider);
  const res = await fetch(base + "/products/" + productId, {
    method: "DELETE",
    headers: { cookie }
  });
  assert.equal(res.status, 404);
  assert.ok(db.prepare("SELECT id FROM products WHERE id=? AND user_id=?").get(productId, seller));
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.UPLOADS_DIR;
});
