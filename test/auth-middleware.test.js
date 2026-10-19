"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const exigirLogin = require("../middleware/auth");

function respostaFalsa() {
  return {
    statusCode: 200,
    corpo: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(valor) {
      this.corpo = valor;
      return this;
    }
  };
}

test("middleware de autenticação rejeita pedido sem sessão", () => {
  const res = respostaFalsa();
  let avancou = false;

  exigirLogin({}, res, () => { avancou = true; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.corpo, { erro: "Tens de iniciar sessão primeiro." });
  assert.equal(avancou, false);
});

test("middleware de autenticação rejeita sessão sem utilizador", () => {
  const res = respostaFalsa();
  let avancou = false;

  exigirLogin({ session: {} }, res, () => { avancou = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(avancou, false);
});

test("middleware de autenticação permite sessão com userId", () => {
  const res = respostaFalsa();
  let avancou = false;

  exigirLogin({ session: { userId: 7 } }, res, () => { avancou = true; });

  assert.equal(avancou, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.corpo, null);
});
