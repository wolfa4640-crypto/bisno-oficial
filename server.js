"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error(
    "Configura SESSION_SECRET com pelo menos 32 caracteres no ficheiro .env (usa .env.example como modelo)."
  );
}

app.disable("x-powered-by");
if (isProduction && process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use(session({
  name: "bisno.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.get("/api/health", (req, res) => {
  res.json({ estado: "ok", servico: "Bisno" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/social", require("./routes/social"));

app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  dotfiles: "deny",
  index: false,
  maxAge: isProduction ? "7d" : 0
}));
app.use(express.static(path.join(__dirname, "public"), {
  dotfiles: "deny",
  index: "index.html"
}));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ erro: "Endpoint não encontrado." });
  }
  res.status(404).send("Página não encontrada.");
});

app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);
  console.error("Erro no servidor:", erro.message);
  const status = Number(erro.status || erro.statusCode);
  if (status === 400) return res.status(400).json({ erro: "Pedido inválido." });
  if (status === 413) return res.status(413).json({ erro: "O pedido é demasiado grande." });
  res.status(500).json({ erro: "Ocorreu um erro interno. Tenta novamente." });
});

const servidor = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Bisno ativo na porta ${PORT}`);
  console.log(`No computador: http://localhost:${PORT}`);
});

function encerrar(signal) {
  console.log(`\n${signal}: a encerrar o Bisno...`);
  servidor.close(() => {
    try { require("./data/database").close(); } catch (_) {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));
