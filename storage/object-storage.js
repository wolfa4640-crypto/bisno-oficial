"use strict";

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const bucket = process.env.BISNO_STORAGE_BUCKET || "bisno-public";

function criarCliente() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const region = process.env.AWS_REGION;
  if (!endpoint || !region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("O armazenamento persistente do Neon não está configurado. Confirma as variáveis AWS_* no serviço.");
  }
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
}

function chaveSegura(prefixo, nome) {
  const limpo = String(nome || "imagem").replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${String(prefixo || "uploads").replace(/^\/+|\/+$/g, "")}/${require("crypto").randomUUID()}-${limpo}`;
}

async function guardarImagem({ prefixo, nome, buffer, contentType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error("Imagem vazia ou inválida.");
  if (!/^image\/(jpeg|png|webp)$/.test(String(contentType || ""))) throw new Error("Tipo de imagem não permitido.");
  const key = chaveSegura(prefixo, nome);
  const s3 = criarCliente();
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable"
  }));
  const endpoint = process.env.AWS_ENDPOINT_URL_S3.replace(/\/+$/, "");
  const url = `${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return { key, url };
}

async function eliminarImagem(key) {
  if (!key || typeof key !== "string") return;
  await criarCliente().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function verificarArmazenamento() {
  const s3 = criarCliente();
  const key = "health-check/" + require("crypto").randomUUID() + ".txt";
  const expected = "bisno-neon-storage-ok";
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from(expected),
    ContentType: "text/plain"
  }));
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await response.Body.transformToByteArray();
    if (Buffer.from(bytes).toString("utf8") !== expected) {
      throw new Error("A verificação de leitura do armazenamento devolveu conteúdo inesperado.");
    }
  } finally {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
  return true;
}

async function eliminarImagemPorUrl(url) {
  if (!url || typeof url !== "string") return;
  const endpoint = String(process.env.AWS_ENDPOINT_URL_S3 || "").replace(/\/+$/, "");
  const prefix = endpoint + "/" + bucket + "/";
  if (!endpoint || !url.startsWith(prefix)) return;
  const key = url.slice(prefix.length).split("/").map((part) => decodeURIComponent(part)).join("/");
  await eliminarImagem(key);
}

module.exports = { guardarImagem, eliminarImagem, eliminarImagemPorUrl, verificarArmazenamento, bucket };
