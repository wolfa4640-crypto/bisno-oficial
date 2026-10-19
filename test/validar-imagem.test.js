"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const verificarImagem = require("../middleware/validar-imagem");

function comFicheiro(bytes, mime, esperado) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bisno-image-"));
  const ficheiro = path.join(dir, "upload.bin");
  try {
    fs.writeFileSync(ficheiro, Buffer.from(bytes));
    assert.equal(verificarImagem(ficheiro, mime), esperado);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("aceita assinatura JPEG", () => {
  comFicheiro([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0], "image/jpeg", true);
});

test("aceita assinatura PNG", () => {
  comFicheiro([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png", true);
});

test("aceita assinatura WEBP", () => {
  comFicheiro([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "image/webp", true);
});

test("rejeita conteúdo falso com MIME de imagem", () => {
  comFicheiro(Buffer.from("isto não é uma imagem"), "image/png", false);
});

test("rejeita MIME não suportado", () => {
  comFicheiro([0xff, 0xd8, 0xff], "image/gif", false);
});

test("rejeita ficheiro inexistente", () => {
  assert.equal(verificarImagem("/caminho/inexistente/bisno.png", "image/png"), false);
});
