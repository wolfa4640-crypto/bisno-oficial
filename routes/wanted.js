"use strict";
const express = require("express");
const multer = require("multer");
const { guardarImagem, eliminarImagemPorUrl, urlImagemPublica } = require("../storage/object-storage");
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req,file,cb) => cb(null, ["image/jpeg","image/png","image/webp"].includes(file.mimetype)) });
const db = require("../data/database");
const exigirLogin = require("../middleware/auth");
const router = express.Router();

function texto(value, max) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
function id(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

router.get("/", exigirLogin, async (req, res) => {
  try {
    const search = texto(req.query.q, 100);
    const city = texto(req.query.city, 100);
    const ads = await db.prepare(`
      SELECT w.id, w.user_id, w.product_name, w.description, w.budget, w.city, w.image, w.created_at,
             u.name AS buyer_name, u.phone AS buyer_phone
      FROM wanted_ads w JOIN users u ON u.id = w.user_id
      WHERE w.status = 'active'
        AND (? = '' OR w.product_name ILIKE '%' || ? || '%' OR w.description ILIKE '%' || ? || '%')
        AND (? = '' OR w.city ILIKE '%' || ? || '%')
      ORDER BY w.created_at DESC LIMIT 100
    `).all(search, search, search, city, city);
    res.json({ ads: ads.map(a => ({
      id: a.id, user_id: a.user_id, product_name: a.product_name,
      description: a.description, budget: a.budget, city: a.city, image: urlImagemPublica(a.image),
      buyer_name: a.buyer_name, created_at: a.created_at,
      contact_url: (() => {
        const raw = String(a.buyer_phone || "").replace(/\D/g, "");
        const phone = raw.length === 9 ? "244" + raw : raw;
        return phone.length >= 10 && phone.length <= 15 ? "https://wa.me/" + phone + "?text=" + encodeURIComponent("Olá " + a.buyer_name + ", vi o teu pedido no Bisno: " + a.product_name) : "";
      })()
    })) });
  } catch (error) {
    console.error("Erro ao carregar pedidos de procura:", error);
    res.status(500).json({ erro: "Não foi possível carregar os pedidos de procura." });
  }
});

router.post("/", exigirLogin, uploadImage.single("image"), async (req, res) => {
  let image = null;
  try {
    const product_name = texto(req.body.product_name, 120);
    const description = texto(req.body.description, 2000);
    const city = texto(req.body.city, 100);
    const rawBudget = req.body.budget;
    const budget = rawBudget === undefined || rawBudget === "" || rawBudget === null ? null : Number(rawBudget);
    if (product_name.length < 2 || description.length < 5 || city.length < 2)
      return res.status(400).json({ erro: "Indica o produto, descreve o que procuras e informa a cidade." });
    if (budget !== null && (!Number.isSafeInteger(budget) || budget < 0 || budget > 1000000000000))
      return res.status(400).json({ erro: "O orçamento deve ser um valor inteiro válido em Kz." });
    if (req.file) image = (await guardarImagem({ prefixo: "wanted-ads", nome: "user-" + req.session.userId + "-" + Date.now(), buffer: req.file.buffer, contentType: req.file.mimetype })).url;
    const result = await db.prepare("INSERT INTO wanted_ads(user_id,product_name,description,budget,city,image) VALUES(?,?,?,?,?,?)")
      .run(req.session.userId, product_name, description, budget, city, image);
    res.status(201).json({ mensagem: "Pedido publicado com sucesso.", id: result.lastInsertRowid });
  } catch (error) {
    if (image) await eliminarImagemPorUrl(image).catch(cleanupError => console.error("Falha ao limpar imagem órfã do pedido:", cleanupError.message));
    console.error("Erro ao publicar pedido de procura:", error);
    res.status(500).json({ erro: "Não foi possível publicar o pedido." });
  }
});

router.delete("/:id", exigirLogin, async (req, res) => {
  try {
    const wantedId = id(req.params.id);
    if (!wantedId) return res.status(400).json({ erro: "Pedido inválido." });
    const wanted = await db.prepare("SELECT id, image FROM wanted_ads WHERE id=? AND user_id=?").get(wantedId, req.session.userId);
    if (!wanted) return res.status(404).json({ erro: "Pedido não encontrado ou não pertence à tua conta." });
    const result = await db.prepare("DELETE FROM wanted_ads WHERE id=? AND user_id=?").run(wantedId, req.session.userId);
    if (!result.changes) return res.status(404).json({ erro: "O pedido já não existe." });
    if (wanted.image) await eliminarImagemPorUrl(wanted.image).catch(e => console.error("Pedido eliminado, mas a imagem não pôde ser removida:", e.message));
    res.json({ mensagem: "Pedido e imagem eliminados definitivamente.", id: wantedId });
  } catch (error) {
    console.error("Erro ao encerrar pedido:", error);
    res.status(500).json({ erro: "Não foi possível encerrar o pedido." });
  }
});
module.exports = router;
