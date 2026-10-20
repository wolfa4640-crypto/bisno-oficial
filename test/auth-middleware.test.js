"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const exigirLogin = require("../middleware/auth");
const db = require("../data/database");

let validUserId;

test.before(async () => {
  await db.initializeDatabase();
  await db.prepare("TRUNCATE TABLE users RESTART IDENTITY CASCADE").run();
  const created = await db.prepare(
    "INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)"
  ).run("Middleware test", "middleware-test@example.test", "900000007", "test-hash");
  validUserId = created.lastInsertRowid;
});

function respostaFalsa() {
  return {
    statusCode: 200,
    corpo: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(valor) { this.corpo = valor; return this; }
  };
}

test("middleware rejeita pedido sem sessão", async () => {
  const res = respostaFalsa();
  let avancou = false;
  await exigirLogin({}, res, () => { avancou = true; });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.corpo, { erro: "Tens de iniciar sessão primeiro." });
  assert.equal(avancou, false);
});

test("middleware rejeita sessão sem utilizador", async () => {
  const res = respostaFalsa();
  let avancou = false;
  await exigirLogin({ session: {} }, res, () => { avancou = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(avancou, false);
});

test("middleware aceita sessão de utilizador existente", async () => {
  const res = respostaFalsa();
  let avancou = false;
  await exigirLogin({ session: { userId: validUserId } }, res, () => { avancou = true; });
  assert.equal(avancou, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.corpo, null);
});

test.after(async () => {
  await db.close();
});
