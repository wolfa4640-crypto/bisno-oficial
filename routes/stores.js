"use strict";
const express = require("express");
const db = require("../data/database");
const exigirLogin = require("../middleware/auth");
const router = express.Router();

// Durable store and analytics tables live in the same SQLite database as users/products.
db.exec(`
 CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  cover TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
 );
 CREATE TABLE IF NOT EXISTS store_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, visitor_user_id INTEGER,
  visitor_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY(visitor_user_id) REFERENCES users(id) ON DELETE SET NULL
 );
 CREATE TABLE IF NOT EXISTS store_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, follower_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(store_id, follower_user_id),
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY(follower_user_id) REFERENCES users(id) ON DELETE CASCADE
 );
 CREATE TABLE IF NOT EXISTS store_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, customer_user_id INTEGER,
  product_id INTEGER, channel TEXT NOT NULL CHECK(channel IN ('message','whatsapp')),
  contact_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,
  UNIQUE(store_id, contact_key)
 );
`);
// SQLite does not support expression-based daily unique keys as a regular column; add a generated day column safely.
const viewCols = db.pragma('table_info(store_views)');
if (!viewCols.some(c => c.name === 'visit_day')) {
  db.exec("ALTER TABLE store_views ADD COLUMN visit_day TEXT NOT NULL DEFAULT 'legacy'");
  db.exec("UPDATE store_views SET visit_day = substr(created_at,1,10) WHERE visit_day='legacy'");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_store_view_day ON store_views(store_id, visitor_key, visit_day)");
}
const validId = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const getStore = db.prepare(`SELECT s.*, u.name AS owner_name, u.avatar AS owner_avatar FROM stores s JOIN users u ON u.id=s.user_id WHERE s.user_id=?`);
function storeSummary(storeId) {
 return db.prepare(`SELECT
  (SELECT COUNT(*) FROM store_views WHERE store_id=?) AS views,
  (SELECT COUNT(*) FROM store_follows WHERE store_id=?) AS followers,
  (SELECT COUNT(*) FROM store_contacts WHERE store_id=?) AS contacts,
  (SELECT COUNT(*) FROM products p JOIN stores s ON s.user_id=p.user_id WHERE s.id=?) AS products
 `).get(storeId,storeId,storeId,storeId);
}

router.get('/mine', exigirLogin, (req,res) => {
 const store=getStore.get(req.session.userId);
 if(!store) return res.json({store:null, stats:{views:0,followers:0,contacts:0,products:0}});
 res.json({store,stats:storeSummary(store.id)});
});
router.post('/activate', exigirLogin, (req,res) => {
 const user=db.prepare('SELECT id,name,avatar FROM users WHERE id=?').get(req.session.userId);
 if (!user) return res.status(401).json({erro:'A sessão já não corresponde a um utilizador válido. Inicia sessão novamente.'});
 const name=clean(req.body.name,80) || `${user.name} — Loja`;
 if (name.length < 2) return res.status(400).json({erro:'O nome da loja deve ter pelo menos 2 caracteres.'});
 const description=clean(req.body.description,500);
 const city=clean(req.body.city,100);
 db.prepare(`INSERT INTO stores(user_id,name,description,city,avatar) VALUES(?,?,?,?,?)
 ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, description=excluded.description, city=excluded.city, avatar=excluded.avatar, is_active=1, updated_at=CURRENT_TIMESTAMP`)
 .run(user.id,name,description,city,user.avatar||null);
 const store=getStore.get(user.id);
 res.status(201).json({store,stats:storeSummary(store.id)});
});
router.patch('/mine', exigirLogin, (req,res) => {
 const store=getStore.get(req.session.userId);
 if(!store) return res.status(404).json({erro:'Ativa a tua loja primeiro.'});
 const name=clean(req.body.name,80) || store.name;
 if (name.length < 2) return res.status(400).json({erro:'O nome da loja deve ter pelo menos 2 caracteres.'});
 const description=clean(req.body.description,500);
 const city=typeof req.body.city === 'string' ? clean(req.body.city,100) : store.city;
 db.prepare('UPDATE stores SET name=?,description=?,city=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(name,description,city,store.id,req.session.userId);
 res.json({store:getStore.get(req.session.userId),stats:storeSummary(store.id)});
});
router.post('/by-user/:userId/view', (req,res) => {
 const userId=validId(req.params.userId); if(!userId) return res.status(400).json({erro:'Utilizador inválido.'});
 const store=db.prepare('SELECT id,user_id FROM stores WHERE user_id=? AND is_active=1').get(userId);
 if(!store) return res.json({recorded:false,store:null});
 if(req.session.userId && Number(req.session.userId)===Number(store.user_id)) return res.json({recorded:false,store:{id:store.id}});
 const day=new Date().toISOString().slice(0,10); const key=req.sessionID || `anon-${req.ip}`;
 db.prepare(`INSERT INTO store_views(store_id,visitor_user_id,visitor_key,visit_day) VALUES(?,?,?,?) ON CONFLICT(store_id,visitor_key,visit_day) DO NOTHING`).run(store.id,req.session.userId||null,key,day);
 res.json({recorded:true,store:{id:store.id}});
});
router.get('/:id', (req,res) => {
 const id=validId(req.params.id); if(!id) return res.status(400).json({erro:'Loja inválida.'});
 const store=db.prepare(`SELECT s.id,s.user_id,s.name,s.description,s.city,s.avatar,s.cover,s.created_at,u.name AS owner_name,u.avatar AS owner_avatar FROM stores s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.is_active=1`).get(id);
 if(!store) return res.status(404).json({erro:'Loja não encontrada.'});
 const products=db.prepare(`SELECT id,user_id,name,description,price,condition,category,city,neighborhood,image,created_at FROM products WHERE user_id=? ORDER BY id DESC LIMIT 100`).all(store.user_id);
 const followed=req.session.userId ? !!db.prepare('SELECT 1 FROM store_follows WHERE store_id=? AND follower_user_id=?').get(id,req.session.userId) : false;
 res.json({store,products,followed,stats:{followers:db.prepare('SELECT COUNT(*) total FROM store_follows WHERE store_id=?').get(id).total}});
});
router.post('/:id/view', (req,res) => {
 const id=validId(req.params.id); if(!id) return res.status(400).json({erro:'Loja inválida.'});
 const store=db.prepare('SELECT id,user_id FROM stores WHERE id=? AND is_active=1').get(id); if(!store) return res.status(404).json({erro:'Loja não encontrada.'});
 if(req.session.userId && Number(req.session.userId)===Number(store.user_id)) return res.json({recorded:false});
 const day=new Date().toISOString().slice(0,10);
 const key=req.sessionID || `anon-${req.ip}`;
 db.prepare(`INSERT INTO store_views(store_id,visitor_user_id,visitor_key,visit_day) VALUES(?,?,?,?) ON CONFLICT(store_id,visitor_key,visit_day) DO NOTHING`).run(id,req.session.userId||null,key,day);
 res.json({recorded:true});
});
router.post('/:id/follow', exigirLogin, (req,res) => {
 const id=validId(req.params.id); if(!id) return res.status(400).json({erro:'Loja inválida.'});
 const store=db.prepare('SELECT id,user_id,name FROM stores WHERE id=? AND is_active=1').get(id); if(!store) return res.status(404).json({erro:'Loja não encontrada.'});
 if(Number(store.user_id)===Number(req.session.userId)) return res.status(400).json({erro:'Não podes seguir a tua própria loja.'});
 const already=db.prepare('SELECT 1 FROM store_follows WHERE store_id=? AND follower_user_id=?').get(id,req.session.userId);
 if(already) db.prepare('DELETE FROM store_follows WHERE store_id=? AND follower_user_id=?').run(id,req.session.userId);
 else {
  db.prepare('INSERT INTO store_follows(store_id,follower_user_id) VALUES(?,?)').run(id,req.session.userId);
  db.prepare(`INSERT INTO notifications(recipient_user_id,actor_user_id,type,message) VALUES(?,?, 'store_follow', ?)`)
   .run(store.user_id,req.session.userId,`${db.prepare('SELECT name FROM users WHERE id=?').get(req.session.userId)?.name || 'Um utilizador'} começou a seguir a tua loja ${store.name}.`);
 }
 res.json({followed:!already,followers:db.prepare('SELECT COUNT(*) total FROM store_follows WHERE store_id=?').get(id).total});
});
// Register contacts when a chat or WhatsApp action is started. Count each customer once per store.
router.post('/:id/contact', exigirLogin, (req,res) => {
 const id=validId(req.params.id); if(!id) return res.status(400).json({erro:'Loja inválida.'});
 const channel=req.body.channel==='whatsapp'?'whatsapp':'message';
 const productId=validId(req.body.productId);
 const store=db.prepare('SELECT id,user_id FROM stores WHERE id=? AND is_active=1').get(id); if(!store) return res.status(404).json({erro:'Loja não encontrada.'});
 if(Number(store.user_id)===Number(req.session.userId)) return res.status(400).json({erro:'Não podes contactar a tua própria loja.'});
 if (req.body.productId != null && req.body.productId !== '') {
  if (!productId) return res.status(400).json({erro:'Anúncio inválido.'});
  const product=db.prepare('SELECT id FROM products WHERE id=? AND user_id=?').get(productId,store.user_id);
  if (!product) return res.status(400).json({erro:'O anúncio não pertence a esta loja.'});
 }
 const key=`${req.session.userId}:${channel}`;
 db.prepare(`INSERT INTO store_contacts(store_id,customer_user_id,product_id,channel,contact_key) VALUES(?,?,?,?,?) ON CONFLICT(store_id,contact_key) DO NOTHING`).run(id,req.session.userId,productId,channel,key);
 res.json({recorded:true,channel});
});
module.exports=router;
