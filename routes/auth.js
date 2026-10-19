
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

const pastaUploads = process.env.UPLOADS_DIR || (process.env.RENDER ? path.join("/var/data", "uploads") : path.join(__dirname, "..", "uploads"));

fs.mkdirSync(pastaUploads, { recursive: true });

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
    const codigo = criarCodigo();
    guardarToken(userId, "verify_email", codigo, 10);
    await enviarEmail(emailNormalizado, "Confirma o teu e-mail — Bisno",
      "O teu código de confirmação do Bisno é: " + codigo + ". Expira em 10 minutos.",
      '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="color:#176b45">Confirma o teu e-mail</h2><p>Usa este código para ativar a tua conta Bisno:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">' + codigo + '</p><p>O código expira em 10 minutos. Se não pediste esta conta, ignora esta mensagem.</p></div>');
    res.status(201).json({ requerVerificacao: true, email: emailNormalizado, mensagem: "Enviámos um código de 6 dígitos para o teu e-mail. Confirma-o para ativar a conta." });
  } catch (erro) {
    if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ erro: "Este e-mail já está registado." });
    console.error("Erro no registo/envio de confirmação:", erro.message);
    res.status(503).json({ erro: erro.message.includes("não está configurado") ? erro.message : "Não foi possível enviar o código. Verifica a configuração de e-mail do servidor e tenta novamente." });
  }
});

// Confirmar código de e-mail
router.post("/verify-email", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const codigo = String(req.body.code || "").trim();
  if (!email || !/^\d{6}$/.test(codigo)) return res.status(400).json({ erro: "Introduz o e-mail e o código de 6 dígitos." });
  const user = db.prepare("SELECT id, name, email, phone, avatar, email_verified FROM users WHERE email = ?").get(email);
  if (!user) return res.status(400).json({ erro: "Código inválido ou expirado. Pede um novo código." });
  if (user.email_verified) return res.json({ mensagem: "E-mail já confirmado. Podes iniciar sessão." });
  const token = db.prepare("SELECT id FROM auth_tokens WHERE user_id = ? AND purpose = 'verify_email' AND token_hash = ? AND expires_at > ?").get(user.id, hashToken(codigo), Date.now());
  if (!token) return res.status(400).json({ erro: "Código inválido ou expirado. Pede um novo código." });
  db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(user.id);
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = 'verify_email'").run(user.id);
  res.json({ mensagem: "E-mail confirmado! Agora podes iniciar sessão." });
});

// Reenviar código de confirmação
router.post("/resend-verification", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Introduz um e-mail válido." });
  const user = db.prepare("SELECT id, email_verified FROM users WHERE email = ?").get(email);
  if (!user) return res.json({ mensagem: "Se a conta existir, enviaremos um novo código." });
  if (user.email_verified) return res.json({ mensagem: "Este e-mail já está confirmado. Podes iniciar sessão." });
  try {
    const codigo = criarCodigo();
    guardarToken(user.id, "verify_email", codigo, 10);
    await enviarEmail(email, "Novo código de confirmação — Bisno",
      "O teu código Bisno é: " + codigo + ". Expira em 10 minutos.",
      '<div style="font-family:Arial,sans-serif;padding:24px"><h2>Confirma o teu e-mail — Bisno</h2><p>O teu código é:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">' + codigo + '</p><p>Expira em 10 minutos.</p></div>');
    res.json({ mensagem: "Enviámos um novo código, se a conta ainda não estiver confirmada." });
  } catch (erro) {
    console.error("Erro ao reenviar código:", erro.message);
    res.status(503).json({ erro: "Não foi possível enviar o e-mail. Tenta novamente mais tarde." });
  }
});

// Pedir recuperação de palavra-passe
router.post("/forgot-password", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Introduz um e-mail válido." });
  const user = db.prepare("SELECT id, email_verified FROM users WHERE email = ?").get(email);
  const mensagem = "Se existir uma conta confirmada com esse e-mail, enviaremos instruções de recuperação.";
  if (!user || !user.email_verified) return res.json({ mensagem });
  try {
    const token = crypto.randomBytes(32).toString("hex");
    guardarToken(user.id, "reset_password", token, 30);
    const baseUrl = (process.env.APP_URL || "https://bisno-oficial.onrender.com").replace(/\/$/, "");
    const link = baseUrl + "/?reset=" + encodeURIComponent(token) + "&email=" + encodeURIComponent(email);
    await enviarEmail(email, "Recuperar palavra-passe — Bisno",
      "Para definir uma nova palavra-passe, abre este link (válido por 30 minutos): " + link,
      '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="color:#176b45">Recuperar palavra-passe</h2><p>Recebemos um pedido para alterar a palavra-passe da tua conta Bisno.</p><p><a style="display:inline-block;padding:12px 18px;background:#176b45;color:#fff;text-decoration:none;border-radius:8px" href="' + link + '">Criar nova palavra-passe</a></p><p>O link expira em 30 minutos. Se não pediste esta alteração, ignora este e-mail.</p></div>');
    res.json({ mensagem });
  } catch (erro) {
    console.error("Erro ao enviar recuperação:", erro.message);
    res.status(503).json({ erro: "Não foi possível enviar o e-mail de recuperação. Tenta novamente mais tarde." });
  }
});

// Definir nova palavra-passe com token de uso único
router.post("/reset-password", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const token = String(req.body.token || "").trim();
  const password = String(req.body.password || "");
  if (!email || !token || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ erro: "O link é inválido ou expirou, ou a palavra-passe não cumpre os requisitos." });
  }
  const user = db.prepare("SELECT id FROM users WHERE email = ? AND email_verified = 1").get(email);
  if (!user) return res.status(400).json({ erro: "O link é inválido ou expirou. Pede uma nova recuperação." });
  const saved = db.prepare("SELECT id FROM auth_tokens WHERE user_id = ? AND purpose = 'reset_password' AND token_hash = ? AND expires_at > ?").get(user.id, hashToken(token), Date.now());
  if (!saved) return res.status(400).json({ erro: "O link é inválido ou expirou. Pede uma nova recuperação." });
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(bcrypt.hashSync(password, 12), user.id);
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = 'reset_password'").run(user.id);
  res.json({ mensagem: "Palavra-passe alterada. Já podes iniciar sessão." });
});

// Iniciar sessão
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string" ||
      !email.trim() || !password) {
    return res.status(400).json({
      erro: "Introduz o e-mail e a palavra-passe."
    });
  }

  const utilizador = db.prepare(`
    SELECT id, name, email, phone, password, avatar, is_blocked
    FROM users
    WHERE email = ?
  `).get(String(email).trim().toLowerCase());

  if (utilizador && !utilizador.email_verified) return res.status(403).json({ erro: "Confirma o teu e-mail antes de iniciar sessão." });
  if (utilizador && utilizador.is_blocked) return res.status(403).json({ erro: "Esta conta foi bloqueada. Contacta o suporte do Bisno." });

  if (!utilizador || !bcrypt.compareSync(password, utilizador.password)) {
    return res.status(401).json({
      erro: "E-mail ou palavra-passe incorretos."
    });
  }

  req.session.regenerate((erro) => {
    if (erro) {
      return res.status(500).json({
        erro: "Não foi possível iniciar a sessão."
      });
    }

    req.session.userId = utilizador.id;

    req.session.save((erro) => {
      if (erro) {
        return res.status(500).json({
          erro: "Não foi possível guardar a sessão."
        });
      }

      res.json({
        mensagem: "Sessão iniciada com sucesso!",
        utilizador: {
          id: utilizador.id,
          name: utilizador.name,
          email: utilizador.email,
          phone: utilizador.phone,
          avatar: utilizador.avatar,
          isAdmin: Boolean(process.env.ADMIN_EMAIL && utilizador.email.toLowerCase() === String(process.env.ADMIN_EMAIL).trim().toLowerCase())
        }
      });
    });
  });
});

// Consultar a conta autenticada
router.get("/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      erro: "Não tens sessão iniciada."
    });
  }

  const utilizador = db.prepare(`
    SELECT id, name, email, phone, avatar, is_blocked
    FROM users
    WHERE id = ?
  `).get(req.session.userId);

  if (!utilizador || utilizador.is_blocked) {
    req.session.destroy(() => {});
    return res.status(401).json({ erro: "A conta não existe ou foi bloqueada." });
  }
  delete utilizador.is_blocked;
  utilizador.isAdmin = Boolean(process.env.ADMIN_EMAIL && utilizador.email.toLowerCase() === String(process.env.ADMIN_EMAIL).trim().toLowerCase());
  res.json({ utilizador });
});

// Editar nome, telefone e fotografia do próprio perfil
router.put(
  "/profile",
  (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({
        erro: "Inicia sessão para editar o teu perfil."
      });
    }

    next();
  },
  (req, res, next) => {
    uploadAvatar.single("avatar")(req, res, (erro) => {
      if (!erro) {
        if (req.file && !verificarImagem(req.file.path, req.file.mimetype)) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          return res.status(400).json({ erro: "O ficheiro não corresponde a uma imagem válida." });
        }
        return next();
      }

      const mensagem = erro.code === "LIMIT_FILE_SIZE"
        ? "A fotografia não pode ultrapassar 5 MB."
        : erro.message || "Não foi possível carregar a fotografia.";

      return res.status(400).json({ erro: mensagem });
    });
  },
  (req, res) => {
    const utilizadorAtual = db.prepare(`
      SELECT id, name, email, phone, avatar
      FROM users
      WHERE id = ?
    `).get(req.session.userId);

    if (!utilizadorAtual) {
      return res.status(404).json({
        erro: "Utilizador não encontrado."
      });
    }

    const nome = String(req.body.name || "").trim();
    const telefone = String(req.body.phone || "").trim();

    if (nome.length < 2 || nome.length > 100) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(400).json({
        erro: "O nome deve ter entre 2 e 100 caracteres."
      });
    }

    if (telefone.length < 7 || telefone.length > 30) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(400).json({
        erro: "O telefone deve ter entre 7 e 30 caracteres."
      });
    }

    const avatar = req.file
      ? `/uploads/${req.file.filename}`
      : utilizadorAtual.avatar;

    try {
      db.prepare(`
        UPDATE users
        SET name = ?, phone = ?, avatar = ?
        WHERE id = ?
      `).run(nome, telefone, avatar, req.session.userId);

      const utilizadorAtualizado = db.prepare(`
        SELECT id, name, email, phone, avatar
        FROM users
        WHERE id = ?
      `).get(req.session.userId);

      // Após guardar a nova referência, limpar o avatar antigo da pasta própria.
      // Nunca remover caminhos externos nem ficheiros que não estejam em /uploads/.
      if (req.file && utilizadorAtual.avatar && utilizadorAtual.avatar.startsWith("/uploads/")) {
        const avatarAntigo = path.basename(utilizadorAtual.avatar);
        const caminhoAvatarAntigo = path.join(pastaUploads, avatarAntigo);
        if (caminhoAvatarAntigo !== req.file.path) {
          try {
            if (fs.existsSync(caminhoAvatarAntigo)) fs.unlinkSync(caminhoAvatarAntigo);
          } catch (erroAvatar) {
            console.error("Perfil atualizado, mas não foi possível limpar o avatar antigo:", erroAvatar);
          }
        }
      }

      res.json({
        mensagem: "Perfil atualizado com sucesso!",
        utilizador: utilizadorAtualizado
      });
    } catch (erro) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      console.error(erro);
      res.status(500).json({
        erro: "Não foi possível atualizar o perfil."
      });
    }
  }
);

// Terminar sessão
router.post("/logout", (req, res) => {
  req.session.destroy((erro) => {
    if (erro) {
      return res.status(500).json({
        erro: "Não foi possível terminar a sessão."
      });
    }

    res.clearCookie("bisno.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ mensagem: "Sessão terminada." });
  });
});

module.exports = router;
