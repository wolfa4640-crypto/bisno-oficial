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
const auth = require("../routes/auth");
const products = require("../routes/products");
const stores = require("../routes/stores");
const app = express();
app.use(express.json());
app.use(session({ secret: "test-secret-only-not-production", resave: false, saveUninitialized: false }));
app.post("/test-session/:id", (req, res) => {
  req.session.userId = Number(req.params.id);
  res.json({ ok: true });
});
app.use("/auth", auth);
app.use("/", social);
app.use("/products", products);
app.use("/stores", stores);

let server;
let base;
let buyer;
let seller;
let outsider;
let productId;
let unrelatedProductId;
let storeId;
let conversation;
let notification;

test.before(async () => {
  await db.initializeDatabase();
  await db.prepare("TRUNCATE TABLE users RESTART IDENTITY CASCADE").run();
  const addUser = async (name, email, phone) => {
    const result = await db.prepare(
      "INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)"
    ).run(name,email,phone,"test-hash");
    return Number(result.lastInsertRowid);
  };
  buyer = await addUser("Buyer", "buyer@test.local", "900000001");
  seller = await addUser("Seller", "seller@test.local", "900000002");
  outsider = await addUser("Outsider", "outsider@test.local", "900000003");
  productId = Number((await db.prepare(`
    INSERT INTO products(user_id,name,description,price,condition,category,city,neighborhood)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(seller,"Test item","Test description",1000,"Novo","Tecnologia","Luanda","Maianga")).lastInsertRowid);
  storeId = Number((await db.prepare("INSERT INTO stores(user_id,name,description,city) VALUES(?,?,?,?)").run(seller,"Seller Store","Private test store","Luanda")).lastInsertRowid);
  unrelatedProductId = Number((await db.prepare(`INSERT INTO products(user_id,name,description,price,condition,category,city,neighborhood) VALUES(?,?,?,?,?,?,?,?)`).run(buyer,"Unrelated item","Owned by buyer",500,"Usado","Casa","Luanda","Ingombota")).lastInsertRowid);
  conversation = Number((await db.prepare(
    "INSERT INTO conversations(product_id,buyer_id,seller_id) VALUES(?,?,?)"
  ).run(productId,buyer,seller)).lastInsertRowid);
  await db.prepare("INSERT INTO messages(conversation_id,sender_id,body) VALUES(?,?,?)")
    .run(conversation,seller,"Private message");
  notification = Number((await db.prepare(
    "INSERT INTO notifications(recipient_user_id,actor_user_id,type,message) VALUES(?,?,?,?)"
  ).run(buyer,seller,"message","Private notification")).lastInsertRowid);
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

test("login rejects object-valued credentials with a client error", async () => {
  const res = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "buyer@test.local", password: { unexpected: true } })
  });
  assert.equal(res.status, 400);
});

test("registration rejects non-string fields without creating an account", async () => {
  const before = (await db.prepare("SELECT COUNT(*) AS n FROM users").get()).n;
  const res = await fetch(base + "/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: ["Injected Name"], email: "typed@test.local",
      phone: "900000004", password: "ValidPass123"
    })
  });
  assert.equal(res.status, 400);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM users").get()).n, before);
});

test("outsider cannot read another user's messages", async () => {
  const cookie = await sessionFor(outsider);
  const res = await fetch(base + "/conversations/" + conversation + "/messages", { headers: { cookie } });
  assert.equal(res.status, 404);
  assert.equal((await db.prepare("SELECT read_at FROM messages WHERE conversation_id=?").get(conversation)).read_at, null);
});

test("outsider cannot send messages to another user's conversation", async () => {
  const cookie = await sessionFor(outsider);
  const before = (await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?").get(conversation)).n;
  const res = await fetch(base + "/conversations/" + conversation + "/messages", {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ body: "Unauthorized attempt" })
  });
  assert.equal(res.status, 404);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?").get(conversation)).n, before);
});

test("outsider cannot mark another user's notification as read", async () => {
  const cookie = await sessionFor(outsider);
  const res = await fetch(base + "/notifications/" + notification + "/read", { method: "PATCH", headers: { cookie } });
  assert.equal(res.status, 404);
  assert.equal((await db.prepare("SELECT is_read FROM notifications WHERE id=?").get(notification)).is_read, 0);
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
  assert.ok(await db.prepare("SELECT id FROM products WHERE id=? AND user_id=?").get(productId, seller));
});


test("outsider cannot edit another seller's store through their own store endpoint", async () => {
  const cookie = await sessionFor(outsider);
  const res = await fetch(base + "/stores/mine", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Hijacked store", description: "Changed by outsider" })
  });
  assert.equal(res.status, 404);
  const store = await db.prepare("SELECT name,description FROM stores WHERE id=? AND user_id=?").get(storeId, seller);
  assert.equal(store.name, "Seller Store");
  assert.equal(store.description, "Private test store");
});


test("store contact rejects a product owned by a different seller", async () => {
  const cookie = await sessionFor(buyer);
  const res = await fetch(base + "/stores/" + storeId + "/contact", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ channel: "whatsapp", productId: unrelatedProductId })
  });
  assert.equal(res.status, 400);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM store_contacts WHERE store_id=?").get(storeId)).n,
    0
  );
});

test("store owner cannot follow their own store", async () => {
  const cookie = await sessionFor(seller);
  const res = await fetch(base + "/stores/" + storeId + "/follow", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(res.status, 400);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM store_follows WHERE store_id=?").get(storeId)).n,
    0
  );
});

test("customer can register a valid contact with the store's own listing", async () => {
  const cookie = await sessionFor(buyer);
  const res = await fetch(base + "/stores/" + storeId + "/contact", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ channel: "whatsapp", productId })
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { recorded: true, channel: "whatsapp" });
  const contact = await db.prepare(
    "SELECT customer_user_id,product_id,channel FROM store_contacts WHERE store_id=?"
  ).get(storeId);
  assert.equal(contact.customer_user_id, buyer);
  assert.equal(contact.product_id, productId);
  assert.equal(contact.channel, "whatsapp");
});

test("customer can follow another user's store and the count updates", async () => {
  const cookie = await sessionFor(buyer);
  const res = await fetch(base + "/stores/" + storeId + "/follow", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { followed: true, followers: 1 });
  assert.ok(await db.prepare(
    "SELECT 1 FROM store_follows WHERE store_id=? AND follower_user_id=?"
  ).get(storeId, buyer));
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.UPLOADS_DIR;
});
