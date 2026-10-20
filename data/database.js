"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { Pool, types } = require("pg");
types.setTypeParser(20, (value) => Number(value));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não está configurada para o PostgreSQL do Neon.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false }
});
const transactionContext = new AsyncLocalStorage();

pool.on("error", (error) => {
  console.error("[PostgreSQL] Erro inesperado no pool:", error.message);
});

function translateSql(source) {
  let sql = String(source).trim().replace(/;+\s*$/, "");
  sql = sql.replace(/datetime\s*\(\s*'now'\s*,\s*'-(\d+)\s+(hours?|days?|minutes?)'\s*\)/gi, "NOW() - INTERVAL '$1 $2'");
  sql = sql.replace(/datetime\s*\(\s*'now'\s*\)/gi, "NOW()");
  sql = sql.replace(/datetime\s*\(\s*([a-zA-Z_][\w.]*)\s*\)/gi, "$1");
  let idx = 0;
  sql = sql.replace(/\?/g, () => "$" + (++idx));
  return sql;
}

function currentQuery(sql, params = []) {
  const client = transactionContext.getStore();
  return (client || pool).query(translateSql(sql), params);
}

function statement(sql) {
  return {
    async get(...params) {
      const result = await currentQuery(sql, params);
      return result.rows[0];
    },
    async all(...params) {
      const result = await currentQuery(sql, params);
      return result.rows;
    },
    async run(...params) {
      let query = String(sql).trim().replace(/;+\s*$/, "");
      const ignoreConflict = /^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(query);
      query = query.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
      if (ignoreConflict && !/\bON\s+CONFLICT\b/i.test(query)) query += " ON CONFLICT DO NOTHING";
      if (/^INSERT\b/i.test(query) && !/\bRETURNING\b/i.test(query)) {
        if (/\bON\s+CONFLICT\b/i.test(query)) {
          query += " RETURNING id";
        } else {
          query += " RETURNING id";
        }
      }
      const result = await currentQuery(query, params);
      return {
        changes: result.rowCount || 0,
        lastInsertRowid: result.rows && result.rows[0] ? Number(result.rows[0].id) : undefined
      };
    }
  };
}

// Schema changes are centralized in initializeDatabase(); route modules may call
// exec() during import for legacy compatibility, so those calls intentionally do
// not execute un-awaited DDL against production.
function exec() {
  return Promise.resolve();
}

function pragma(expression) {
  const table = String(expression).match(/table_info\s*\(\s*([a-z_]+)\s*\)/i)?.[1]?.toLowerCase();
  const columns = {
    users: ["id", "name", "email", "phone", "password", "created_at", "avatar", "email_verified", "is_blocked", "blocked_reason"],
    products: ["id", "user_id", "name", "description", "price", "condition", "category", "city", "neighborhood", "image", "created_at", "whatsapp", "is_blocked", "blocked_reason"],
    store_views: ["id", "store_id", "visitor_user_id", "visitor_key", "created_at", "visit_day"],
    password_recovery_requests: ["id", "user_id", "email", "status", "requested_at", "resolved_at", "resolved_by", "email_confirmed_at", "reset_token_hash", "reset_token_expires_at", "completed_at"]
  };
  return (columns[table] || []).map((name) => ({ name }));
}

function transaction(callback) {
  return async function runTransaction(...args) {
    const existing = transactionContext.getStore();
    if (existing) return callback(...args);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await transactionContext.run(client, () => callback(...args));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  };
}

async function initializeDatabase() {
  const statements = [
    "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, password TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, price DOUBLE PRECISION NOT NULL CHECK(price >= 0), condition TEXT NOT NULL CHECK(condition IN ('Novo','Usado')), category TEXT NOT NULL, city TEXT NOT NULL, neighborhood TEXT NOT NULL, image TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS whatsapp TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_blocked INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS blocked_reason TEXT",
    "CREATE TABLE IF NOT EXISTS auth_tokens (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','reset_password')), token_hash TEXT NOT NULL UNIQUE, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens(user_id,purpose)",
    "CREATE TABLE IF NOT EXISTS password_recovery_requests (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TIMESTAMP, resolved_by INTEGER, email_confirmed_at TIMESTAMP, reset_token_hash TEXT, reset_token_expires_at BIGINT, completed_at TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS idx_password_recovery_status ON password_recovery_requests(status,requested_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_reset_token ON password_recovery_requests(reset_token_hash) WHERE reset_token_hash IS NOT NULL",
    "CREATE TABLE IF NOT EXISTS admin_audit_logs (id SERIAL PRIMARY KEY, admin_user_id INTEGER, admin_email TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT, result TEXT NOT NULL DEFAULT 'success', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_logs(target_type,target_id)",
    "CREATE TABLE IF NOT EXISTS product_interests (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(product_id,user_id))",
    "CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, type TEXT NOT NULL, message TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id,is_read)",
    "CREATE TABLE IF NOT EXISTS conversations (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(product_id,buyer_id))",
    "CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, read_at TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id,id)",
    "CREATE TABLE IF NOT EXISTS user_follows (id SERIAL PRIMARY KEY, follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(follower_id,followed_id))",
    "CREATE TABLE IF NOT EXISTS stores (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', avatar TEXT, cover TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS store_views (id SERIAL PRIMARY KEY, store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE, visitor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, visitor_key TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, visit_day TEXT NOT NULL DEFAULT 'legacy')",
    "UPDATE store_views SET visit_day = TO_CHAR(created_at, 'YYYY-MM-DD') WHERE visit_day = 'legacy'",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_store_view_day ON store_views(store_id,visitor_key,visit_day)",
    "CREATE TABLE IF NOT EXISTS store_follows (id SERIAL PRIMARY KEY, store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE, follower_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(store_id,follower_user_id))",
    "CREATE TABLE IF NOT EXISTS store_contacts (id SERIAL PRIMARY KEY, store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE, customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, channel TEXT NOT NULL CHECK(channel IN ('message','whatsapp')), contact_key TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(store_id,contact_key))",
    "CREATE TABLE IF NOT EXISTS sessions (sid VARCHAR PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)"
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const sql of statements) await client.query(sql);
    await client.query("COMMIT");
    console.log("[PostgreSQL] Esquema preparado.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  prepare: statement,
  exec,
  pragma,
  transaction,
  pool,
  initializeDatabase,
  close: () => pool.end()
};
