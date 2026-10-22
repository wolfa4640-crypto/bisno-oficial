
"use strict";

const express = require("express");
const { guardarImagem, eliminarImagemPorUrl } = require("../storage/object-storage");
const verificarImagem = require("../middleware/validar-imagem");
const multer = require("multer");

const db = require("../data/database");
const exigirLogin = require("../middleware/auth");

const router = express.Router();

// O catálogo e os anúncios não podem ser consultados sem autenticação.
router.use(exigirLogin);



const extensoes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const LIMITE_IMAGEM = 5 * 1024 * 1024;

// ============================================
// PREPARAÇÃO DA BASE DE DADOS
// ============================================

const colunasProdutos = db.pragma("table_info(products)");

if (!colunasProdutos.length) {
  throw new Error(
    "A tabela products não existe na base de dados."
  );
}

if (!colunasProdutos.some((coluna) => coluna.name === "whatsapp")) {
  db.exec("ALTER TABLE products ADD COLUMN whatsapp TEXT");
}

// ============================================
// FOTOGRAFIAS
// ============================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_IMAGEM, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!extensoes[file.mimetype]) return cb(new Error("Usa uma imagem JPG, PNG ou WEBP."));
    cb(null, true);
  }
});

function apagarFicheiroEnviado() {
  // Os ficheiros são validados em memória e só são persistidos depois da validação.
}

// Os anúncios não expiram automaticamente. Permanecem publicados até o respetivo
// proprietário os eliminar explicitamente (ou uma ação administrativa autorizada).
// Esta função é mantida como no-op para compatibilidade com chamadas existentes.
function limparAnunciosExpirados() {
  return;
}

function validarId(valor) {
  const id = Number(valor);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function validarTexto(valor, limite) {
  return (
    typeof valor === "string" &&
    valor.trim().length > 0 &&
    valor.trim().length <= limite
  );
}

// Categorias dinâmicas com contagens reais, sem depender de opções fixas no HTML.
router.get("/categories", async (_req,res) => {
  try {
    const categories = await db.prepare("SELECT category AS name, COUNT(*) AS products FROM products WHERE is_blocked=0 AND TRIM(category)<>'' GROUP BY category ORDER BY LOWER(category) ASC").all();
    res.json({categories});
  } catch (error) {
    console.error("Erro ao carregar categorias:", error.message);
    res.status(500).json({erro:"Não foi possível carregar as categorias."});
  }
});

// ============================================
// 1. CATÁLOGO PÚBLICO
// GET /api/products
// ============================================

router.get("/", async (req, res) => {
  try {
    const produtos = await db.prepare(`
      SELECT
        products.id,
        products.user_id,
        products.user_id AS seller_id,
        products.name,
        products.description,
        products.price,
        products.condition,
        products.category,
        products.city,
        products.neighborhood,
        products.whatsapp,
        products.image,
        products.created_at,
        users.name AS seller_name,
        users.avatar AS seller_avatar
      FROM products
      LEFT JOIN users ON users.id = products.user_id
      WHERE products.is_blocked = 0
      ORDER BY products.id DESC
      LIMIT 100
    `).all();

    return res.json({ produtos });
  } catch (erro) {
    console.error("Erro ao listar anúncios:", erro);

    return res.status(500).json({
      erro: "Não foi possível carregar os anúncios."
    });
  }
});

// ============================================
// 2. ANÚNCIOS DO UTILIZADOR AUTENTICADO
// GET /api/products/mine
// ============================================

router.get("/mine", exigirLogin, async (req, res) => {
  try {
    const produtos = await db.prepare(`
      SELECT
        id,
        user_id,
        user_id AS seller_id,
        name,
        description,
        price,
        condition,
        category,
        city,
        neighborhood,
        whatsapp,
        image,
        created_at
      FROM products
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(req.session.userId);

    return res.json({ produtos });
  } catch (erro) {
    console.error("Erro ao carregar os meus anúncios:", erro);

    return res.status(500).json({
      erro: "Não foi possível carregar os teus anúncios."
    });
  }
});

// ============================================
// 3. PERFIL PÚBLICO DO VENDEDOR
// GET /api/products/seller/:id
// ============================================

router.get("/seller/:id", async (req, res) => {
  try {
    const vendedorId = validarId(req.params.id);

    if (!vendedorId) {
      return res.status(400).json({
        erro: "O identificador do vendedor é inválido."
      });
    }

    const vendedor = await db.prepare(`
      SELECT id, name, avatar
      FROM users
      WHERE id = ?
    `).get(vendedorId);

    if (!vendedor) {
      return res.status(404).json({
        erro: "Vendedor não encontrado."
      });
    }

    const produtos = await db.prepare(`
      SELECT
        id,
        user_id,
        user_id AS seller_id,
        name,
        description,
        price,
        condition,
        category,
        city,
        neighborhood,
        whatsapp,
        image,
        created_at
      FROM products
      WHERE user_id = ? AND is_blocked = 0
      ORDER BY id DESC
      LIMIT 100
    `).all(vendedorId);

    return res.json({
      vendedor,
      produtos
    });
  } catch (erro) {
    console.error("Erro ao carregar perfil do vendedor:", erro);

    return res.status(500).json({
      erro: "Não foi possível carregar o perfil do vendedor."
    });
  }
});

// ============================================
// 4. PUBLICAR ANÚNCIO
// POST /api/products
// ============================================

router.post(
  "/",
  exigirLogin,
  async (req, res, next) => {
    limparAnunciosExpirados();
    const publicados = (await db.prepare("SELECT COUNT(*) AS total FROM products WHERE user_id = ? AND created_at >= datetime('now', '-24 hours')").get(req.session.userId)).total;
    if (publicados >= 5) {
      return res.status(429).json({ erro: "Atingiste o limite de 5 anúncios por período de 24 horas. Tenta novamente quando um dos teus anúncios completar 24 horas desde a publicação." });
    }
    next();
  },

  async (req, res, next) => {
    upload.single("image")(req, res, (erro) => {
      if (!erro) return next();

      if (erro instanceof multer.MulterError) {
        if (erro.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            erro: "A fotografia não pode ultrapassar 5 MB."
          });
        }

        if (erro.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            erro: "Só podes enviar uma fotografia por anúncio."
          });
        }

        return res.status(400).json({
          erro: "Não foi possível receber a fotografia."
        });
      }

      return res.status(400).json({
        erro: erro.message ||
          "Ocorreu um erro no envio da fotografia."
      });
    });
  },

  async (req, res) => {
    let imagem = null;

    try {
      const {
        name,
        description,
        price,
        condition,
        category,
        city,
        neighborhood,
        whatsapp
      } = req.body;

      imagem = null;

      if (req.file && !verificarImagem(req.file.buffer, req.file.mimetype)) {
        apagarFicheiroEnviado(req.file);
        return res.status(400).json({ erro: "O ficheiro não corresponde a uma imagem válida." });
      }

      // Campos obrigatórios.
      if (
        !validarTexto(name, 120) ||
        !validarTexto(description, 3000) ||
        price === undefined ||
        String(price).trim() === "" ||
        !validarTexto(condition, 10) ||
        !validarTexto(category, 60) ||
        !validarTexto(city, 100) ||
        !validarTexto(neighborhood, 100) ||
        !validarTexto(whatsapp, 30)
      ) {
        apagarFicheiroEnviado(req.file);

        return res.status(400).json({
          erro:
            "Preenche todos os campos obrigatórios com dados válidos."
        });
      }

      const preco = Number(price);

      // Os preços em Kz devem ser inteiros seguros para evitar valores
      // fracionários ou números que percam precisão na base de dados/JSON.
      if (!Number.isSafeInteger(preco) || preco < 0 || preco > 1_000_000_000_000) {
        apagarFicheiroEnviado(req.file);

        return res.status(400).json({
          erro: "Introduz um preço inteiro válido em Kz (entre 0 e 1 bilião de Kz)."
        });
      }

      if (!["Novo", "Usado"].includes(condition.trim())) {
        apagarFicheiroEnviado(req.file);

        return res.status(400).json({
          erro: "O estado deve ser Novo ou Usado."
        });
      }

      const numeroWhatsApp = whatsapp.replace(/\D/g, "");

      if (
        numeroWhatsApp.length < 7 ||
        numeroWhatsApp.length > 15
      ) {
        apagarFicheiroEnviado(req.file);

        return res.status(400).json({
          erro:
            "Introduz um número de WhatsApp válido, incluindo o código do país."
        });
      }

      if (req.file) {
        const guardada = await guardarImagem({ prefixo: "products", nome: req.file.originalname, buffer: req.file.buffer, contentType: req.file.mimetype });
        imagem = guardada.url;
      }

      const resultado = await db.prepare(`
        INSERT INTO products (
          user_id,
          name,
          description,
          price,
          condition,
          category,
          city,
          neighborhood,
          whatsapp,
          image
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.session.userId,
        name.trim(),
        description.trim(),
        preco,
        condition.trim(),
        category.trim(),
        city.trim(),
        neighborhood.trim(),
        numeroWhatsApp,
        imagem
      );

      return res.status(201).json({
        mensagem: "Anúncio publicado com sucesso!",

        produto: {
          id: Number(resultado.lastInsertRowid),
          user_id: req.session.userId,
          seller_id: req.session.userId,
          name: name.trim(),
          description: description.trim(),
          price: preco,
          condition: condition.trim(),
          category: category.trim(),
          city: city.trim(),
          neighborhood: neighborhood.trim(),
          whatsapp: numeroWhatsApp,
          image: imagem
        }
      });
    } catch (erro) {
      // Se a gravação falhar, evitar deixar uma imagem órfã.
      apagarFicheiroEnviado(req.file);
      if (imagem) { try { await eliminarImagemPorUrl(imagem); } catch (erroImagem) { console.error("Falha ao remover imagem órfã:", erroImagem.message); } }

      console.error("Erro ao publicar anúncio:", erro);

      return res.status(500).json({
        erro: "Não foi possível publicar o anúncio."
      });
    }
  }
);

// ============================================
// 5. ELIMINAR ANÚNCIO DO PRÓPRIO VENDEDOR
// DELETE /api/products/:id
// ============================================

router.delete("/:id", exigirLogin, async (req, res) => {
  try {
    const id = validarId(req.params.id);

    if (!id) {
      return res.status(400).json({
        erro: "O identificador do anúncio é inválido."
      });
    }

    const produto = await db.prepare(`
      SELECT id, image
      FROM products
      WHERE id = ? AND user_id = ?
    `).get(id, req.session.userId);

    if (!produto) {
      return res.status(404).json({
        erro:
          "Anúncio não encontrado ou não tens autorização para o eliminar."
      });
    }

    const resultado = await db.prepare(`
      DELETE FROM products
      WHERE id = ? AND user_id = ?
    `).run(id, req.session.userId);

    if (resultado.changes === 0) {
      return res.status(404).json({
        erro: "O anúncio já não existe ou não pode ser eliminado."
      });
    }

    if (produto.image) {
      try { await eliminarImagemPorUrl(produto.image); }
      catch (erroImagem) { console.error("O anúncio foi eliminado, mas não foi possível apagar a fotografia:", erroImagem.message); }
    }

    return res.json({
      mensagem: "Anúncio eliminado com sucesso!",
      id: produto.id
    });
  } catch (erro) {
    console.error("Erro ao eliminar anúncio:", erro);

    return res.status(500).json({
      erro: "Não foi possível eliminar o anúncio."
    });
  }
});

module.exports = router;
