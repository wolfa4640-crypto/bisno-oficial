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

const dbAdmin = require("./data/database");
function exigirAdmin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ erro: "Inicia sessão primeiro." });
  const emailAdmin = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!emailAdmin) return res.status(503).json({ erro: "O administrador ainda não foi configurado. Define ADMIN_EMAIL nas variáveis do Render." });
  const utilizador = dbAdmin.prepare("SELECT id, email, is_blocked FROM users WHERE id = ?").get(req.session.userId);
  if (!utilizador || utilizador.is_blocked) return res.status(403).json({ erro: "A tua conta está bloqueada ou não existe." });
  if (utilizador.email.toLowerCase() !== emailAdmin) return res.status(403).json({ erro: "Acesso reservado ao administrador." });
  next();
}
app.get("/api/admin/overview", exigirAdmin, (_req, res) => {
  res.json({
    stats: {
      users: dbAdmin.prepare("SELECT COUNT(*) AS n FROM users").get().n,
      blockedUsers: dbAdmin.prepare("SELECT COUNT(*) AS n FROM users WHERE is_blocked = 1").get().n,
      products: dbAdmin.prepare("SELECT COUNT(*) AS n FROM products").get().n,
      blockedProducts: dbAdmin.prepare("SELECT COUNT(*) AS n FROM products WHERE is_blocked = 1").get().n,
      activeProducts: dbAdmin.prepare("SELECT COUNT(*) AS n FROM products WHERE is_blocked = 0").get().n
    },
    users: dbAdmin.prepare("SELECT id, name, email, phone, created_at, is_blocked FROM users ORDER BY id DESC LIMIT 200").all(),
    products: dbAdmin.prepare("SELECT p.id, p.name, p.price, p.category, p.city, p.created_at, p.is_blocked, u.name AS seller_name, u.email AS seller_email FROM products p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 200").all()
  });
});
app.patch("/api/admin/users/:id/block", exigirAdmin, (req, res) => {
  const id = Number(req.params.id), blocked = req.body?.blocked === true;
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: "Utilizador inválido." });
  const target = dbAdmin.prepare("SELECT id, email FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ erro: "Utilizador não encontrado." });
  if (target.email.toLowerCase() === String(process.env.ADMIN_EMAIL).trim().toLowerCase()) return res.status(400).json({ erro: "Não podes bloquear a conta de administrador." });
  dbAdmin.prepare("UPDATE users SET is_blocked = ?, blocked_reason = ? WHERE id = ?").run(blocked ? 1 : 0, blocked ? String(req.body?.reason || "Bloqueado pelo administrador").slice(0, 300) : null, id);
  res.json({ mensagem: blocked ? "Utilizador bloqueado." : "Utilizador desbloqueado." });
});
app.delete("/api/admin/users/:id", exigirAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: "Utilizador inválido." });
  const target = dbAdmin.prepare("SELECT id, email FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ erro: "Utilizador não encontrado." });
  if (target.email.toLowerCase() === String(process.env.ADMIN_EMAIL).trim().toLowerCase()) return res.status(400).json({ erro: "Não podes eliminar a conta de administrador." });
  try {
    dbAdmin.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ mensagem: "Utilizador eliminado." });
  } catch (e) { res.status(409).json({ erro: "Não foi possível eliminar este utilizador por existirem dados associados. Bloqueia a conta em alternativa." }); }
});
app.patch("/api/admin/products/:id/block", exigirAdmin, (req, res) => {
  const id = Number(req.params.id), blocked = req.body?.blocked === true;
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: "Anúncio inválido." });
  const result = dbAdmin.prepare("UPDATE products SET is_blocked = ?, blocked_reason = ? WHERE id = ?").run(blocked ? 1 : 0, blocked ? String(req.body?.reason || "Bloqueado pelo administrador").slice(0, 300) : null, id);
  if (!result.changes) return res.status(404).json({ erro: "Anúncio não encontrado." });
  res.json({ mensagem: blocked ? "Anúncio bloqueado." : "Anúncio desbloqueado." });
});
app.delete("/api/admin/products/:id", exigirAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: "Anúncio inválido." });
  const result = dbAdmin.prepare("DELETE FROM products WHERE id = ?").run(id);
  if (!result.changes) return res.status(404).json({ erro: "Anúncio não encontrado." });
  res.json({ mensagem: "Anúncio eliminado." });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/social", require("./routes/social"));
app.use("/api/stores", require("./routes/stores"));
const uploadsDir = process.env.UPLOADS_DIR || (process.env.RENDER ? path.join("/var/data", "uploads") : path.join(__dirname, "uploads"));
fs.mkdirSync(uploadsDir, { recursive: true });
const exigirLogin = require("./middleware/auth");
app.use("/uploads", exigirLogin, express.static(uploadsDir, { dotfiles: "deny", index: false, maxAge: isProduction ? "1d" : 0 }));
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
