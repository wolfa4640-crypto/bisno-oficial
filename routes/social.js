
const express = require("express");
const db = require("../data/database");
const exigirLogin = require("../middleware/auth");

const router = express.Router();

// As conversas e mensagens expiram após 72 horas.
async function limparConversasExpiradas() {
  try {
    await db.prepare("DELETE FROM messages WHERE created_at <= datetime('now', '-72 hours')").run();
    await db.prepare("DELETE FROM conversations WHERE updated_at <= datetime('now', '-72 hours')").run();
  } catch (e) { console.error("[Bisno] Falha ao limpar conversas expiradas:", e.message); }
}
const temporizadorLimpezaConversas = setInterval(limparConversasExpiradas, 15 * 60 * 1000);
if (temporizadorLimpezaConversas.unref) temporizadorLimpezaConversas.unref();

// Todo o conteúdo social exige uma sessão autenticada.
router.use(exigirLogin);

// Criar as tabelas novas sem apagar os dados existentes.
db.exec(`
  CREATE TABLE IF NOT EXISTS product_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_user_id INTEGER NOT NULL,
    actor_user_id INTEGER,
    product_id INTEGER,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    buyer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, buyer_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    read_at TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON notifications(recipient_user_id, is_read);

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);
`);

limparConversasExpiradas();

// Contar interesses de um anúncio — consulta pública.
router.get("/products/:id/interests", async (req, res) => {
  const productId = Number(req.params.id);

  if (!Number.isInteger(productId) || productId < 1) {
    return res.status(400).json({ erro: "Anúncio inválido." });
  }

  const produto = await db.prepare(
    "SELECT id FROM products WHERE id = ?"
  ).get(productId);

  if (!produto) {
    return res.status(404).json({ erro: "Anúncio não encontrado." });
  }

  const resultado = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM product_interests
    WHERE product_id = ?
  `).get(productId);

  const interessado = req.session?.userId
    ? Boolean(await db.prepare(`
        SELECT 1 FROM product_interests
        WHERE product_id = ? AND user_id = ?
      `).get(productId, req.session.userId))
    : false;

  res.json({
    total: resultado.total,
    interessado
  });
});

// Demonstrar interesse.
router.post("/interests/:productId", exigirLogin, async (req, res) => {
  const productId = Number(req.params.productId);
  const userId = Number(req.session.userId);

  if (!Number.isInteger(productId) || productId < 1) {
    return res.status(400).json({ erro: "Anúncio inválido." });
  }

  const produto = await db.prepare(`
    SELECT id, user_id, name
    FROM products
    WHERE id = ?
  `).get(productId);

  if (!produto) {
    return res.status(404).json({ erro: "Anúncio não encontrado." });
  }

  if (produto.user_id === userId) {
    return res.status(400).json({
      erro: "Não podes demonstrar interesse no teu próprio anúncio."
    });
  }

  const existente = await db.prepare(`
    SELECT id FROM product_interests
    WHERE product_id = ? AND user_id = ?
  `).get(productId, userId);

  if (existente) {
    const total = await db.prepare(`
      SELECT COUNT(*) AS total
      FROM product_interests WHERE product_id = ?
    `).get(productId).total;

    return res.json({
      mensagem: "Já demonstraste interesse neste anúncio.",
      interessado: true,
      total
    });
  }

  const transacao = db.transaction(async () => {
    // INSERT OR IGNORE evita erro 500 se dois pedidos simultâneos tentarem
    // registar o mesmo interesse protegido pela chave UNIQUE.
    const insercao = await db.prepare(`
      INSERT OR IGNORE INTO product_interests (product_id, user_id)
      VALUES (?, ?)
    `).run(productId, userId);

    if (insercao.changes) {
      const utilizador = await db.prepare(
        "SELECT name FROM users WHERE id = ?"
      ).get(userId);

      await db.prepare(`
        INSERT INTO notifications
          (recipient_user_id, actor_user_id, product_id, type, message)
        VALUES (?, ?, ?, 'interest', ?)
      `).run(
        produto.user_id,
        userId,
        productId,
        `${utilizador?.name || "Um utilizador"} demonstrou interesse no anúncio "${produto.name}".`
      );
    }

    return {
      total: await db.prepare(`
        SELECT COUNT(*) AS total
        FROM product_interests WHERE product_id = ?
      `).get(productId).total,
      inserido: Boolean(insercao.changes)
    };
  });

  const resultado = await transacao();

  res.status(resultado.inserido ? 201 : 200).json({
    mensagem: resultado.inserido
      ? "Interesse registado!"
      : "Já demonstraste interesse neste anúncio.",
    interessado: true,
    total: resultado.total
  });
});

// Retirar interesse.
router.delete("/interests/:productId", exigirLogin, async (req, res) => {
  const productId = Number(req.params.productId);

  if (!Number.isInteger(productId) || productId < 1) {
    return res.status(400).json({ erro: "Anúncio inválido." });
  }

  await db.prepare(`
    DELETE FROM product_interests
    WHERE product_id = ? AND user_id = ?
  `).run(productId, req.session.userId);

  const total = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM product_interests WHERE product_id = ?
  `).get(productId).total;

  res.json({
    mensagem: "Interesse atualizado.",
    interessado: false,
    total
  });
});

// Listar notificações do utilizador autenticado.
router.get("/notifications", exigirLogin, async (req, res) => {
  const notificacoes = await db.prepare(`
    SELECT n.id, n.type, n.message, n.is_read, n.created_at,
           n.product_id, n.actor_user_id,
           u.name AS actor_name,
           p.name AS product_name
    FROM notifications n
    LEFT JOIN users u ON u.id = n.actor_user_id
    LEFT JOIN products p ON p.id = n.product_id
    WHERE n.recipient_user_id = ?
    ORDER BY n.id DESC
    LIMIT 100
  `).all(req.session.userId);

  const naoLidas = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM notifications
    WHERE recipient_user_id = ? AND is_read = 0
  `).get(req.session.userId).total;

  res.json({ notificacoes, naoLidas });
});

// Marcar notificação como lida.
router.patch("/notifications/:id/read", exigirLogin, async (req, res) => {
  const notificationId = Number(req.params.id);
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    return res.status(400).json({ erro: "Notificação inválida." });
  }

  const resultado = await db.prepare(`
    UPDATE notifications
    SET is_read = 1
    WHERE id = ? AND recipient_user_id = ?
  `).run(notificationId, req.session.userId);

  if (!resultado.changes) {
    return res.status(404).json({
      erro: "Notificação não encontrada."
    });
  }

  res.json({ mensagem: "Notificação marcada como lida." });
});

// Listar conversas do utilizador.
router.get("/conversations", exigirLogin, async (req, res) => {
  const conversas = await db.prepare(`
    SELECT c.id, c.product_id, c.buyer_id, c.seller_id,
           c.created_at, c.updated_at,
           p.name AS product_name,
           CASE WHEN c.buyer_id = ? THEN seller.name
                ELSE buyer.name END AS other_user_name,
           (SELECT m.body FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.id DESC LIMIT 1) AS last_message,
           (SELECT COUNT(*) FROM messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id != ?
              AND m.read_at IS NULL) AS unread_count
    FROM conversations c
    JOIN products p ON p.id = c.product_id
    JOIN users buyer ON buyer.id = c.buyer_id
    JOIN users seller ON seller.id = c.seller_id
    WHERE c.buyer_id = ? OR c.seller_id = ?
    ORDER BY c.updated_at DESC, c.id DESC
  `).all(
    req.session.userId,
    req.session.userId,
    req.session.userId,
    req.session.userId
  );

  res.json({ conversas });
});

// Iniciar ou recuperar conversa sobre um anúncio.
router.post("/conversations", exigirLogin, async (req, res) => {
  const productId = Number(req.body.productId);
  const buyerId = Number(req.session.userId);

  if (!Number.isInteger(productId) || productId < 1) {
    return res.status(400).json({ erro: "Anúncio inválido." });
  }

  const produto = await db.prepare(`
    SELECT id, user_id FROM products WHERE id = ?
  `).get(productId);

  if (!produto) {
    return res.status(404).json({ erro: "Anúncio não encontrado." });
  }

  if (produto.user_id === buyerId) {
    return res.status(400).json({
      erro: "Não podes iniciar uma conversa contigo próprio."
    });
  }

  await db.prepare(`
    INSERT INTO conversations (product_id, buyer_id, seller_id)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id, buyer_id) DO NOTHING
  `).run(productId, buyerId, produto.user_id);

  const conversa = await db.prepare(`
    SELECT id, product_id, buyer_id, seller_id
    FROM conversations
    WHERE product_id = ? AND buyer_id = ?
  `).get(productId, buyerId);

  // If the seller has an active store, count the first contact by this customer.
  const loja = await db.prepare('SELECT id FROM stores WHERE user_id = ? AND is_active = 1').get(produto.user_id);
  if (loja) {
    await db.prepare(`INSERT INTO store_contacts(store_id,customer_user_id,product_id,channel,contact_key)
      VALUES(?,?,?,'message',?) ON CONFLICT(store_id,contact_key) DO NOTHING`)
      .run(loja.id, buyerId, productId, `${buyerId}:message`);
  }
  res.status(200).json({ conversa });
});

// Ler mensagens e marcar como lidas.
router.get("/conversations/:id/messages", exigirLogin, async (req, res) => {
  const conversationId = Number(req.params.id);
  const userId = Number(req.session.userId);
  if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
    return res.status(400).json({ erro: "Conversa inválida." });
  }

  const conversa = await db.prepare(`
    SELECT id FROM conversations
    WHERE id = ? AND (buyer_id = ? OR seller_id = ?)
  `).get(conversationId, userId, userId);

  if (!conversa) {
    return res.status(404).json({
      erro: "Conversa não encontrada."
    });
  }

  await db.prepare(`
    UPDATE messages
    SET read_at = CURRENT_TIMESTAMP
    WHERE conversation_id = ?
      AND sender_id != ?
      AND read_at IS NULL
  `).run(conversationId, userId);

  const mensagens = await db.prepare(`
    SELECT m.id, m.sender_id, m.body, m.created_at, m.read_at,
           u.name AS sender_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.id ASC
  `).all(conversationId);

  res.json({ mensagens });
});

// Enviar mensagem.
router.post("/conversations/:id/messages", exigirLogin, async (req, res) => {
  const conversationId = Number(req.params.id);
  const userId = Number(req.session.userId);
  const body = String(req.body.body || "").trim();
  if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
    return res.status(400).json({ erro: "Conversa inválida." });
  }

  if (!body || body.length > 3000) {
    return res.status(400).json({
      erro: "A mensagem deve ter entre 1 e 3000 caracteres."
    });
  }

  const conversa = await db.prepare(`
    SELECT id, product_id, buyer_id, seller_id
    FROM conversations
    WHERE id = ? AND (buyer_id = ? OR seller_id = ?)
  `).get(conversationId, userId, userId);

  if (!conversa) {
    return res.status(404).json({
      erro: "Conversa não encontrada."
    });
  }

  const destinatario = conversa.buyer_id === userId
    ? conversa.seller_id
    : conversa.buyer_id;

  const transacao = db.transaction(async () => {
    const resultado = await db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES (?, ?, ?)
    `).run(conversationId, userId, body);

    await db.prepare(`
      UPDATE conversations
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(conversationId);

    await db.prepare(`
      INSERT INTO notifications
        (recipient_user_id, actor_user_id, product_id, type, message)
      VALUES (?, ?, ?, 'message', ?)
    `).run(
      destinatario,
      userId,
      conversa.product_id,
      "Recebeste uma nova mensagem no Bisno."
    );

    return await db.prepare(`
      SELECT id, conversation_id, sender_id, body, created_at, read_at
      FROM messages WHERE id = ?
    `).get(resultado.lastInsertRowid);
  });

  res.status(201).json({ mensagem: transacao() });
});



// Seguimento de vendedores: dados persistentes, sem alterar contas ou anúncios existentes.
db.exec(`
  CREATE TABLE IF NOT EXISTS user_follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    followed_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, followed_id),
    CHECK(follower_id <> followed_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON user_follows(followed_id);
  CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
`);

// Contagem pública de seguidores e estado do seguimento para o utilizador autenticado.
router.get("/users/:id/follow", async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId < 1) return res.status(400).json({ erro: "Utilizador inválido." });
  const target = await db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
  if (!target) return res.status(404).json({ erro: "Utilizador não encontrado." });
  const followers = await db.prepare("SELECT COUNT(*) AS total FROM user_follows WHERE followed_id = ?").get(targetId).total;
  const following = req.session?.userId
    ? Boolean(await db.prepare("SELECT 1 FROM user_follows WHERE follower_id = ? AND followed_id = ?").get(req.session.userId, targetId))
    : false;
  res.json({ followers, following, isSelf: Number(req.session?.userId) === targetId });
});

// Seguir vendedor.
router.post("/users/:id/follow", exigirLogin, async (req, res) => {
  const targetId = Number(req.params.id);
  const followerId = Number(req.session.userId);
  if (!Number.isInteger(targetId) || targetId < 1) return res.status(400).json({ erro: "Utilizador inválido." });
  if (targetId === followerId) return res.status(400).json({ erro: "Não podes seguir o teu próprio perfil." });
  const target = await db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
  if (!target) return res.status(404).json({ erro: "Utilizador não encontrado." });
  await db.prepare("INSERT OR IGNORE INTO user_follows (follower_id, followed_id) VALUES (?, ?)").run(followerId, targetId);
  const followers = await db.prepare("SELECT COUNT(*) AS total FROM user_follows WHERE followed_id = ?").get(targetId).total;
  res.json({ following: true, followers });
});

// Deixar de seguir vendedor.
router.delete("/users/:id/follow", exigirLogin, async (req, res) => {
  const targetId = Number(req.params.id);
  const followerId = Number(req.session.userId);
  if (!Number.isInteger(targetId) || targetId < 1) return res.status(400).json({ erro: "Utilizador inválido." });
  await db.prepare("DELETE FROM user_follows WHERE follower_id = ? AND followed_id = ?").run(followerId, targetId);
  const followers = await db.prepare("SELECT COUNT(*) AS total FROM user_follows WHERE followed_id = ?").get(targetId).total;
  res.json({ following: false, followers });
});


module.exports = router;
