"use strict";

const fs = require("fs");
const path = require("path");

// Em Render, DATA_DIR e UPLOADS_DIR devem apontar para o disco persistente montado
// no serviço (por exemplo, /var/data/bisno-data). Sem disco montado, o fallback
// em /tmp é temporário e os dados podem desaparecer em reinícios/publicações.
const renderDefaultDir = process.env.RENDER ? "/tmp/bisno-data" : path.join(__dirname, "..", "data");
const dataDir = path.resolve(process.env.DATA_DIR || renderDefaultDir);
const uploadsDir = path.resolve(
  process.env.UPLOADS_DIR || (process.env.RENDER ? path.join(dataDir, "uploads") : path.join(__dirname, "..", "uploads"))
);

function ensureStorage() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
    fs.accessSync(uploadsDir, fs.constants.R_OK | fs.constants.W_OK);
    if (process.env.RENDER && (!process.env.DATA_DIR || dataDir === "/tmp" || dataDir.startsWith("/tmp/"))) {
      console.warn("[Bisno] ALERTA: a usar armazenamento temporário em " + dataDir + ". Configura um disco persistente e define DATA_DIR/UPLOADS_DIR no Render.");
    } else if (process.env.RENDER && process.env.DATA_DIR) {
      console.log("[Bisno] Diretório de dados configurado via DATA_DIR: " + dataDir + ". Confirma que este caminho corresponde ao disco persistente montado no Render.");
    }
  } catch (error) {
    const hint = process.env.RENDER
      ? "Confirma DATA_DIR/UPLOADS_DIR e as permissões do diretório. No Render, o caminho deve corresponder a um disco persistente montado no serviço."
      : "Confirma que a pasta de dados existe e que o processo tem permissões de leitura e escrita.";
    throw new Error("Armazenamento do Bisno indisponível (" + dataDir + "): " + error.message + ". " + hint);
  }
}

module.exports = { dataDir, uploadsDir, ensureStorage };
