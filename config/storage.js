"use strict";

const fs = require("fs");
const path = require("path");

// DATA_DIR deve apontar para o disco persistente montado no Render.
// No Render, o padrão é /var/data; localmente, usa a pasta data do projeto.
const dataDir = path.resolve(
  process.env.DATA_DIR || (process.env.RENDER ? "/var/data" : path.join(__dirname, "..", "data"))
);
const uploadsDir = path.resolve(
  process.env.UPLOADS_DIR || path.join(dataDir, "uploads")
);

function ensureStorage() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
    fs.accessSync(uploadsDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    const hint = process.env.RENDER
      ? "No Render, adiciona um disco persistente com ponto de montagem /var/data, ou define DATA_DIR para o ponto de montagem correto. Confirma também as permissões do disco."
      : "Confirma que a pasta de dados existe e que o processo tem permissões de leitura e escrita.";
    throw new Error("Armazenamento do Bisno indisponível (" + dataDir + "): " + error.message + ". " + hint);
  }
}

module.exports = { dataDir, uploadsDir, ensureStorage };
