"use strict";

const fs = require("fs");
const path = require("path");

// Render Free não permite disco persistente. Usamos /tmp para manter o serviço
// funcional sem custos adicionais; estes dados podem desaparecer ao reiniciar,
// suspender ou publicar novamente o serviço. Para dados duradouros, configurar
// DATA_DIR e UPLOADS_DIR para um disco persistente ou armazenamento externo.
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
    if (process.env.RENDER) {
      console.warn("[Bisno] A usar armazenamento temporário em " + dataDir + ". No Render Free, dados e imagens podem perder-se em reinícios ou novas publicações.");
    }
  } catch (error) {
    const hint = process.env.RENDER
      ? "Confirma DATA_DIR/UPLOADS_DIR e as permissões do diretório. No plano Free, usa um caminho gravável como /tmp/bisno-data; o armazenamento não é persistente."
      : "Confirma que a pasta de dados existe e que o processo tem permissões de leitura e escrita.";
    throw new Error("Armazenamento do Bisno indisponível (" + dataDir + "): " + error.message + ". " + hint);
  }
}

module.exports = { dataDir, uploadsDir, ensureStorage };
