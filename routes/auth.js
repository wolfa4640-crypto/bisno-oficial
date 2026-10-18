
const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../data/database");

const router = express.Router();

const pastaUploads = path.join(__dirname, "..", "uploads");

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
    const nome = `perfil-${req.session.userId}-${Date.now()}${extensao}`;

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

// Criar conta
router.post("/register", (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({
      erro: "Preenche todos os campos."
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({
      erro: "A palavra-passe deve ter pelo menos 8 caracteres."
    });
  }

  const nomeNormalizado = String(name).trim();
  const emailNormalizado = String(email).trim().toLowerCase();
  const telefoneNormalizado = String(phone).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
    return res.status(400).json({
      erro: "Introduz um e-mail válido."
    });
  }

  try {
    const hash = bcrypt.hashSync(password, 12);

    const resultado = db.prepare(`
      INSERT INTO users (name, email, phone, password)
      VALUES (?, ?, ?, ?)
    `).run(
      nomeNormalizado,
      emailNormalizado,
      telefoneNormalizado,
      hash
    );

    req.session.userId = Number(resultado.lastInsertRowid);

    req.session.save((erro) => {
      if (erro) {
        return res.status(500).json({
          erro: "A conta foi criada, mas não foi possível iniciar a sessão."
        });
      }

      res.status(201).json({
        mensagem: "Conta criada com sucesso!",
        utilizador: {
          id: Number(resultado.lastInsertRowid),
          name: nomeNormalizado,
          email: emailNormalizado,
          phone: telefoneNormalizado,
          avatar: null
        }
      });
    });
  } catch (erro) {
    if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        erro: "Este e-mail já está registado."
      });
    }

    console.error(erro);
    res.status(500).json({
      erro: "Não foi possível criar a conta."
    });
  }
});

// Iniciar sessão
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      erro: "Introduz o e-mail e a palavra-passe."
    });
  }

  const utilizador = db.prepare(`
    SELECT id, name, email, phone, password, avatar
    FROM users
    WHERE email = ?
  `).get(String(email).trim().toLowerCase());

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
          avatar: utilizador.avatar
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
    SELECT id, name, email, phone, avatar
    FROM users
    WHERE id = ?
  `).get(req.session.userId);

  if (!utilizador) {
    return res.status(401).json({
      erro: "Utilizador não encontrado."
    });
  }

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

    if (!nome || !telefone) {
      return res.status(400).json({
        erro: "Preenche o nome e o telefone."
      });
    }

    if (nome.length > 100 || telefone.length > 30) {
      return res.status(400).json({
        erro: "O nome ou telefone é demasiado longo."
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

      res.json({
        mensagem: "Perfil atualizado com sucesso!",
        utilizador: utilizadorAtualizado
      });
    } catch (erro) {
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

    res.clearCookie("connect.sid");
    res.json({ mensagem: "Sessão terminada." });
  });
});

module.exports = router;
