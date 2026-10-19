"use strict";
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const SQLiteStore = require("connect-sqlite3")(session);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("Configura SESSION_SECRET com pelo menos 32 caracteres nas variáveis de ambiente.");
}
app.disable("x-powered-by");
if (isProduction || process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: true, legacyHeaders: false }));

const dataDir = process.env.DATA_DIR || (process.env.RENDER ? "/var/data" : path.join(__dirname, "data"));
fs.mkdirSync(dataDir, { recursive: true });
if (isProduction && process.env.RENDER && !process.env.ALLOW_EPHEMERAL_STORAGE) {
  console.warn("AVISO: no Render, o armazenamento local pode ser temporário. Configure um disco persistente antes de depender dos dados.");
}
const sessionStore = new SQLiteStore({ db: "sessions.sqlite", dir: dataDir, table: "sessions" });
app.use(session({
  name: "bisno.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProduction, maxAge: 1000 * 60 * 60 * 24 * 14 }
}));

app.get("/api/health", (_req, res) => res.json({ estado: "ok", servico: "Bisno", versao: require("./package.json").version }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/social", require("./routes/social"));
app.use("/api/stores", require("./routes/stores"));
const uploadsDir = process.env.UPLOADS_DIR || (process.env.RENDER ? path.join("/var/data", "uploads") : path.join(__dirname, "uploads"));
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir, { dotfiles: "deny", index: false, maxAge: isProduction ? "1d" : 0 }));
app.use(express.static(path.join(__dirname, "public"), { dotfiles: "deny", index: "index.html", maxAge: isProduction ? "1h" : 0 }));
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ erro: "Endpoint não encontrado." });
  res.status(404).send("Página não encontrada.");
});
app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);
  console.error("Erro no servidor:", erro.message);
  const status = Number(erro.status || erro.statusCode);
  if ([400, 413, 415, 429].includes(status)) return res.status(status).json({ erro: status === 429 ? "Muitos pedidos. Aguarda um pouco e tenta novamente." : (erro.message || "Pedido inválido.") });
  res.status(500).json({ erro: "Ocorreu um erro interno. Tenta novamente." });
});
const servidor = app.listen(PORT, "0.0.0.0", () => console.log(`Bisno v${require("./package.json").version} ativo na porta ${PORT}`));
function encerrar(signal) {
  console.log(`\n${signal}: a encerrar o Bisno...`);
  servidor.close(() => {
    try { require("./data/database").close(); } catch (_) {}
    if (sessionStore.close) sessionStore.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));
