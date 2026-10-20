
const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const verificarImagem = require("../middleware/validar-imagem");
const db = require("../data/database");
const nodemailer = require("nodemailer");

function criarTransportadorEmail() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("O envio de e-mails ainda não está configurado no servidor.");
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function enviarEmail(destino, assunto, texto, html) {
  const transportador = criarTransportadorEmail();
  await transportador.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destino,
    subject: assunto,
    text: texto,
    html
  });
}

function criarCodigo() { return String(crypto.randomInt(0, 1000000)).padStart(6, "0"); }
function hashToken(token) { return crypto.createHash("sha256").update(String(token)).digest("hex"); }
function guardarToken(userId, purpose, token, minutos = 15) {
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?").run(userId, purpose);
  db.prepare("INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, purpose, hashToken(token), Date.now() + minutos * 60 * 1000, Date.now());
}

const router = express.Router();

const { uploadsDir: pastaUploads, ensureStorage } = require("../config/storage");
ensureStorage();

const armazenamento = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, pastaUploads);
  },
  filename: (req, file, callback) => {
    const extensoesPermitidas = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp"
    };

    const extensao = extensoesPermitidas[file.mimetype];
    const nome = `perfil-${req.session.userId}-${crypto.randomUUID()}${extensao}`;

    callback(null, nome);
  }
});

const uploadAvatar = multer({
  storage: armazenamento,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const tiposPermitidos = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!tiposPermitidos.includes(file.mimetype)) {
      return callback(
        new Error("A fotografia deve estar em JPG, PNG ou WEBP.")
      );
    }

    callback(null, true);
  }
});

// Criar conta: a conta só pode iniciar sessão depois de validar o e-mail.
router.post("/register", async (req, res) => {
  const { name, email, phone, password } = req.body;
  if ([name, email, phone, password].some(v => typeof v !== "string" || !v.trim())) {
    return res.status(400).json({ erro: "Preenche todos os campos." });
  }
  const nome = name.trim(), emailNormalizado = email.trim().toLowerCase(), telefone = phone.trim(), palavraPasse = password;
  if (nome.length < 2 || nome.length > 100) return res.status(400).json({ erro: "O nome deve ter entre 2 e 100 caracteres." });
  if (emailNormalizado.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) return res.status(400).json({ erro: "Introduz um e-mail válido." });
  if (telefone.length < 7 || telefone.length > 30) return res.status(400).json({ erro: "Introduz um telefone válido." });
  if (palavraPasse.length < 8 || Buffer.byteLength(palavraPasse, "utf8") > 72) return res.status(400).json({ erro: "A palavra-passe deve ter entre 8 caracteres e 72 bytes." });
  try {
    const existente = db.prepare("SELECT id, email_verified FROM users WHERE email = ?").get(emailNormalizado);
    if (existente?.email_verified) return res.status(409).json({ erro: "Este e-mail já está registado. Inicia sessão ou recupera a palavra-passe." });
    let userId;
    if (existente) {
      userId = existente.id;
      db.prepare("UPDATE users SET name = ?, phone = ?, password = ? WHERE id = ?")
        .run(nome, telefone, bcrypt.hashSync(palavraPasse, 12), userId);
    } else {
      const result = db.prepare("INSERT INTO users (name, email, phone, password, email_verified) VALUES (?, ?, ?, ?, 0)")
        .run(nome, emailNormalizado, telefone, bcrypt.hashSync(palavraPasse, 12));
      userId = Number(result.lastInsertRowid);
    }
    // Registo imediato: não bloquear novas contas por falta de configuração SMTP.
    // A confirmação por e-mail continua disponível como funcionalidade opcional.
    db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
    db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = 'verify_email'").run(userId);
    res.status(201).json({ requerVerificacao: false, email: emailNormalizado, mensagem: "Conta criada com sucesso! Já podes iniciar sessão." });
  } catch (erro) {
    if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ erro: "Este e-mail já está registado." });
    console.error("Erro no registo/envio de confirmação:", erro.message);
    res.status(503).json({ erro: erro.message.includes("não está configurado") ? erro.message : "Não foi possível enviar o código. Verifica a configuração de e-mail do servidor e tenta novamente." });
  }
});

// Pedir recuperação de palavra-passe: o administrador aprova o pedido no painel.
router.post("/forgot-password", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erro: "Introduz um e-mail válido." });
  }
  const user = db.prepare("SELECT id, is_blocked FROM users WHERE email = ?").get(email);
  // Resposta genérica para não revelar se o e-mail está registado.
  const mensagem = "Se a conta existir, o pedido foi enviado para análise do administrador. Aguarda o contacto para receber uma palavra-passe temporária.";
  if (!user || user.is_blocked) return res.json({ mensagem });
  try {
    const pending = db.prepare("SELECT id FROM password_recovery_requests WHERE user_id = ? AND status = 'pending'").get(user.id);
    if (!pending) {
      db.prepare("INSERT INTO password_recovery_requests (user_id, email, status) VALUES (?, ?, 'pending')").run(user.id, email);
    }
    res.json({ mensagem });
  } catch (erro) {
    console.error("Erro ao criar pedido de recuperação:", erro.message);
    res.status(500).json({ erro: "Não foi possível registar o pedido. Tenta novamente." });
  }
});


router.post("/login", (req, res, next) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ erro: "Introduz o e-mail e a palavra-passe." });
  const user = db.prepare("SELECT id,name,email,phone,password,avatar,is_blocked FROM users WHERE email=?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ erro: "E-mail ou palavra-passe incorretos." });
  if (user.is_blocked) return res.status(403).json({ erro: "Esta conta está bloqueada." });
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      const isAdmin = Boolean(process.env.ADMIN_EMAIL) && email === String(process.env.ADMIN_EMAIL).trim().toLowerCase();
      const { password: storedPassword, ...safeUser } = user;
      res.json({ mensagem: "Sessão iniciada com sucesso.", utilizador: { ...safeUser, isAdmin } });
    });
  });
});
router.get("/me", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ erro: "Inicia sessão primeiro." });
  const user = db.prepare("SELECT id,name,email,phone,avatar,created_at,is_blocked FROM users WHERE id=?").get(req.session.userId);
  if (!user || user.is_blocked) return req.session.destroy(() => res.status(401).json({ erro: "A sessão expirou ou a conta está bloqueada." }));
  const isAdmin = Boolean(process.env.ADMIN_EMAIL) && user.email.toLowerCase() === String(process.env.ADMIN_EMAIL).trim().toLowerCase();
  res.json({ utilizador: { ...user, isAdmin } });
});
router.post("/logout", (req, res) => {
  if (!req.session) return res.json({ mensagem: "Sessão terminada." });
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ erro: "Não foi possível terminar a sessão." });
    res.clearCookie("bisno.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ mensagem: "Sessão terminada." });
  });
});

module.exports = router;
