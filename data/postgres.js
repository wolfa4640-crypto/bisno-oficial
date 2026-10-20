"use strict";

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não está configurada para o PostgreSQL.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false }
});

pool.on("error", (error) => {
  console.error("[PostgreSQL] Erro inesperado no pool:", error.message);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function one(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function many(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback({
      query: (text, params = []) => client.query(text, params),
      one: async (text, params = []) => {
        const response = await client.query(text, params);
        return response.rows[0] || null;
      },
      many: async (text, params = []) => {
        const response = await client.query(text, params);
        return response.rows;
      }
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function checkConnection() {
  const result = await query("SELECT current_database() AS database, NOW() AS checked_at");
  return result.rows[0];
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, one, many, transaction, checkConnection, close };
