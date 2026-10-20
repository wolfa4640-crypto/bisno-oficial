
const Database = require("better-sqlite3");
const path = require("path");
const { dataDir, ensureStorage } = require("../config/storage");
ensureStorage();
const caminho = path.join(dataDir, "marketplace.db");

const db = new Database(caminho);

// Ativar as chaves estrangeiras
db.pragma("foreign_keys = ON");

// Criar as tabelas se ainda não existirem
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL CHECK(price >= 0),
    condition TEXT NOT NULL
      CHECK(condition IN ('Novo', 'Usado')),
    category TEXT NOT NULL,
    city TEXT NOT NULL,
    neighborhood TEXT NOT NULL,
    image TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE
  );
`);

// Adicionar a coluna WhatsApp se ainda não existir
const colunasProdutos = db.pragma("table_info(products)");

if (!colunasProdutos.some((coluna) => coluna.name === "whatsapp")) {
  db.exec("ALTER TABLE products ADD COLUMN whatsapp TEXT");
}

// Adicionar a fotografia do perfil sem apagar dados existentes
const colunasUtilizadores = db.pragma("table_info(users)");

if (!colunasUtilizadores.some((coluna) => coluna.name === "avatar")) {
  db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
}



// Segurança de contas: validação de e-mail e recuperação de palavra-passe.
// Contas existentes permanecem verificadas para não bloquear utilizadores atuais.
const colunasSeguranca = db.pragma("table_info(users)");
if (!colunasSeguranca.some(c => c.name === "email_verified")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    purpose TEXT NOT NULL CHECK(purpose IN ('verify_email', 'reset_password')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens(user_id, purpose);
`);

console.log("Base de dados preparada!");

module.exports = db;

// Moderação e administração do marketplace.
const colUsersAdmin = db.pragma("table_info(users)");
if (!colUsersAdmin.some(c => c.name === "is_blocked")) db.exec("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0");
if (!colUsersAdmin.some(c => c.name === "blocked_reason")) db.exec("ALTER TABLE users ADD COLUMN blocked_reason TEXT");
const colProductsAdmin = db.pragma("table_info(products)");
if (!colProductsAdmin.some(c => c.name === "is_blocked")) db.exec("ALTER TABLE products ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0");
if (!colProductsAdmin.some(c => c.name === "blocked_reason")) db.exec("ALTER TABLE products ADD COLUMN blocked_reason TEXT");


// Registo imutável por utilizadores comuns das operações administrativas.
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT,
    result TEXT NOT NULL DEFAULT 'success',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_logs(target_type, target_id);
`);
