"use strict";

const fs = require("fs");

function assinaturaImagemValida(caminho, mime) {
  let cabecalho;
  try {
    const fd = fs.openSync(caminho, "r");
    try {
      cabecalho = Buffer.alloc(12);
      const lidos = fs.readSync(fd, cabecalho, 0, cabecalho.length, 0);
      cabecalho = cabecalho.subarray(0, lidos);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    return false;
  }

  if (mime === "image/jpeg") {
    return cabecalho.length >= 3 &&
      cabecalho[0] === 0xff &&
      cabecalho[1] === 0xd8 &&
      cabecalho[2] === 0xff;
  }

  if (mime === "image/png") {
    return cabecalho.length >= 8 &&
      cabecalho.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
  }

  if (mime === "image/webp") {
    return cabecalho.length >= 12 &&
      cabecalho.toString("ascii", 0, 4) === "RIFF" &&
      cabecalho.toString("ascii", 8, 12) === "WEBP";
  }

  return false;
}

module.exports = assinaturaImagemValida;
