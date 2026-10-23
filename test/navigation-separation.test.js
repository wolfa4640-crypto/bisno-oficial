"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "public", "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

test("publicar um pedido de comprador abre a área própria", () => {
  assert.match(
    script,
    /if\s*\(type\s*===\s*"comprador"\)\s*\{\s*abrirPagina\("area-pedidos-procura"\);\s*window\.bisnoCarregarPedidosProcura\?\.\(\);\s*return;\s*\}/
  );
});

test("o catálogo de vendedores não recebe pedidos de compradores", () => {
  assert.doesNotMatch(script, /bisnoPedidosCompradoresCache/);
  assert.doesNotMatch(script, /ordenarFeedPorPublicacao/);
  assert.doesNotMatch(script, /feedPrincipal\.querySelectorAll\("\.bisno-pedido-procura"\)/);
  assert.doesNotMatch(script, /pedidosCompradores\.forEach/);
});

test("os pedidos de compradores continuam a ser renderizados na sua própria lista", () => {
  assert.match(script, /lista\.innerHTML\s*=\s*dados\.ads\.map\(ad\s*=>/);
  assert.match(html, /id="area-pedidos-procura"/);
  assert.match(html, /id="lista-pedidos-procura"/);
  assert.match(html, /id="lista-produtos"/);
});

test("a navegação esconde painéis dinâmicos antigos", () => {
  assert.match(script, /if\s*\(productDetails\)\s*productDetails\.hidden\s*=\s*id\s*!==\s*"detalhes-produto"/);
  assert.match(script, /if\s*\(publicProfile\)\s*publicProfile\.hidden\s*=\s*id\s*!==\s*"perfil-publico"/);
});

test("a navegação define estados independentes para catálogo e pedidos", () => {
  assert.match(script, /if\s*\(products\)\s*products\.hidden\s*=\s*id\s*!==\s*"area-produtos"/);
  assert.match(script, /if\s*\(wanted\)\s*wanted\.hidden\s*=\s*id\s*!==\s*"area-pedidos-procura"/);
  assert.doesNotMatch(html, /body\.bisno-pagina-pedidos\s+#area-produtos\s*>/);
  assert.doesNotMatch(html, /feed-integrado-home|bisno-feed-compradores/);
});
