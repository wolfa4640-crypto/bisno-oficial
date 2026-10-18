
const Database = require("better-sqlite3");
const path = require("path");

const caminho = path.join(__dirname, "marketplace.db");

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

console.log("Base de dados preparada!");

module.exports = db;
