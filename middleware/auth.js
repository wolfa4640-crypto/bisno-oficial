"use strict";
const db = require("../data/database");

async function exigirLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ erro: "Tens de iniciar sessão primeiro." });
  }
  try {
    const utilizador = await db.prepare("SELECT id, is_blocked FROM users WHERE id = ?").get(req.session.userId);
    if (!utilizador || utilizador.is_blocked) {
      return req.session.destroy(() => res.status(401).json({ erro: "A tua conta está bloqueada ou não existe. Inicia sessão com outra conta." }));
    }
    next();
  } catch (erro) {
    next(erro);
  }
}

module.exports = exigirLogin;
