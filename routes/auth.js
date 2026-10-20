
const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
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
async function guardarToken(userId, purpose, token, minutos = 15) {
  await db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?").run(userId, purpose);
  await db.prepare("INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, purpose, hashToken(token), Date.now() + minutos * 60 * 1000, Date.now());
}

const router = express.Router();

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
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
    const existente = await db.prepare("SELECT id, email_verified FROM users WHERE email = ?").get(emailNormalizado);
    if (existente?.email_verified) return res.status(409).json({ erro: "Este e-mail já está registado. Inicia sessão ou recupera a palavra-passe." });
    let userId;
    if (existente) {
      userId = existente.id;
      await db.prepare("UPDATE users SET name = ?, phone = ?, password = ? WHERE id = ?")
        .run(nome, telefone, bcrypt.hashSync(palavraPasse, 12), userId);
    } else {
      const result = await db.prepare("INSERT INTO users (name, email, phone, password, email_verified) VALUES (?, ?, ?, ?, 0)")
        .run(nome, emailNormalizado, telefone, bcrypt.hashSync(palavraPasse, 12));
      userId = Number(result.lastInsertRowid);
    }
    // Registo imediato: não bloquear novas contas por falta de configuração SMTP.
    // A confirmação por e-mail continua disponível como funcionalidade opcional.
    await db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
    await db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = 'verify_email'").run(userId);
    res.status(201).json({ requerVerificacao: false, email: emailNormalizado, mensagem: "Conta criada com sucesso! Já podes iniciar sessão." });
  } catch (erro) {
    if (erro.code === "23505") return res.status(409).json({ erro: "Este e-mail já está registado." });
    console.error("Erro no registo/envio de confirmação:", erro.message);
    res.status(503).json({ erro: erro.message.includes("não está configurado") ? erro.message : "Não foi possível enviar o código. Verifica a configuração de e-mail do servidor e tenta novamente." });
  }
});

// Recuperação segura: enviar código ao e-mail registado antes de avisar a administração.
router.post("/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Introduz um e-mail válido." });
  const user = await db.prepare("SELECT id, is_blocked FROM users WHERE email=?").get(email);
  const generic = "Se a conta existir e estiver ativa, será enviado um código de confirmação para o e-mail registado.";
  if (!user || user.is_blocked) return res.json({ mensagem: generic });
  const code = criarCodigo();
  try {
    await guardarToken(user.id, "reset_password", code, 15);
    await enviarEmail(email, "Código de recuperação do Bisno", `O teu código de confirmação é: ${code}. Expira em 15 minutos. Se não pediste esta recuperação, ignora esta mensagem.`, `<p>O teu código de confirmação do Bisno é:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Expira em 15 minutos. Se não pediste esta recuperação, ignora esta mensagem.</p>`);
    res.json({ mensagem: "Enviámos um código para o e-mail associado à conta. Introduz o código para confirmar a tua identidade." });
  } catch (err) {
    console.error("Falha ao enviar código de recuperação:", err.message);
    res.status(503).json({ erro: "Não foi possível enviar o código. O serviço de e-mail precisa de ser configurado no servidor." });
  }
});

router.post("/confirm-password-recovery", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ erro: "Confirma o e-mail e introduz o código de seis dígitos." });
  const user = await db.prepare("SELECT id,is_blocked FROM users WHERE email=?").get(email);
  if (!user || user.is_blocked) return res.status(400).json({ erro: "Código inválido ou expirado. Pede um novo código." });
  const token = await db.prepare("SELECT id FROM auth_tokens WHERE user_id=? AND purpose='reset_password' AND token_hash=? AND expires_at>?").get(user.id, hashToken(code), Date.now());
  if (!token) return res.status(400).json({ erro: "Código inválido ou expirado. Pede um novo código." });
  try {
    await db.transaction(async () => {
      await db.prepare("DELETE FROM auth_tokens WHERE id=?").run(token.id);
      const pending = await db.prepare("SELECT id FROM password_recovery_requests WHERE user_id=? AND status='pending'").get(user.id);
      if (pending) {
        await db.prepare("UPDATE password_recovery_requests SET email_confirmed_at=CURRENT_TIMESTAMP,email=? WHERE id=?").run(email, pending.id);
      } else {
        await db.prepare("INSERT INTO password_recovery_requests (user_id,email,status,email_confirmed_at) VALUES (?,?,'pending',CURRENT_TIMESTAMP)").run(user.id, email);
      }
    })();
    res.json({ mensagem: "E-mail confirmado! O teu pedido já está visível na área do administrador. Aguarda a autorização para alterares a palavra-passe." });
  } catch (err) {
    console.error("Falha ao confirmar pedido:", err.message);
    res.status(500).json({ erro: "Não foi possível registar o pedido. Tenta novamente." });
  }
});

router.post("/complete-password-reset", async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  if (token.length < 40 || token.length > 200) return res.status(400).json({ erro: "Link de recuperação inválido." });
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ erro: "A palavra-passe deve ter pelo menos 8 caracteres." });
  const request = await db.prepare("SELECT id,user_id FROM password_recovery_requests WHERE status='approved' AND completed_at IS NULL AND reset_token_hash=? AND reset_token_expires_at>?").get(hashToken(token), Date.now());
  if (!request) return res.status(400).json({ erro: "Este link expirou ou já foi utilizado. Pede uma nova recuperação." });
  try {
    await db.transaction(async () => {
      await db.prepare("UPDATE users SET password=? WHERE id=?").run(bcrypt.hashSync(password, 12), request.user_id);
      await db.prepare("UPDATE password_recovery_requests SET completed_at=CURRENT_TIMESTAMP,reset_token_hash=NULL,reset_token_expires_at=NULL WHERE id=?").run(request.id);
      await db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='reset_password'").run(request.user_id);
    })();
    res.json({ mensagem: "Palavra-passe alterada com sucesso. Já podes iniciar sessão." });
  } catch (err) {
    console.error("Falha ao definir nova palavra-passe:", err.message);
    res.status(500).json({ erro: "Não foi possível alterar a palavra-passe." });
  }
});

router.post("/login", async (req, res, next) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ erro: "Introduz o e-mail e a palavra-passe." });
  const user = await db.prepare("SELECT id,name,email,phone,password,avatar,is_blocked FROM users WHERE email=?").get(email);
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
router.get("/me", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ erro: "Inicia sessão primeiro." });
  const user = await db.prepare("SELECT id,name,email,phone,avatar,created_at,is_blocked FROM users WHERE id=?").get(req.session.userId);
  if (!user || user.is_blocked) return req.session.destroy(() => res.status(401).json({ erro: "A sessão expirou ou a conta está bloqueada." }));
  const isAdmin = Boolean(process.env.ADMIN_EMAIL) && user.email.toLowerCase() === String(process.env.ADMIN_EMAIL).trim().toLowerCase();
  res.json({ utilizador: { ...user, isAdmin } });
});
router.post("/logout", async (req, res) => {
  if (!req.session) return res.json({ mensagem: "Sessão terminada." });
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ erro: "Não foi possível terminar a sessão." });
    res.clearCookie("bisno.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ mensagem: "Sessão terminada." });
  });
});

module.exports = router;
