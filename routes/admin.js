"use strict";
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const db = require("../data/database");
const router = express.Router();
const adminEmail = () => String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
async function exigirAdmin(req,res,next) {
  if (!req.session?.userId) return res.status(401).json({erro:"Inicia sessão primeiro."});
  if (!adminEmail()) return res.status(503).json({erro:"Define ADMIN_EMAIL nas variáveis do Render."});
  try {
    const u=await db.prepare("SELECT id,email,is_blocked FROM users WHERE id=?").get(req.session.userId);
    if(!u || u.is_blocked) return res.status(403).json({erro:"Conta não autorizada."});
    if(String(u.email).toLowerCase()!==adminEmail()) return res.status(403).json({erro:"Acesso reservado ao administrador."});
    next();
  } catch(e){next(e);}
}
function sameOrigin(req,res,next){
  const origin=req.get("origin");
  if(!origin) return res.status(403).json({erro:"Origem do pedido não autorizada."});
  try {if(new URL(origin).host!==req.get("host")) return res.status(403).json({erro:"Origem do pedido não autorizada."});}
  catch{return res.status(403).json({erro:"Origem inválida."});}
  next();
}
async function log(req,action,type,id,reason){
  await db.prepare("INSERT INTO admin_audit_logs (admin_user_id,admin_email,action,target_type,target_id,reason,result,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
    .run(req.session.userId,adminEmail(),action,type,String(id),reason?String(reason).slice(0,300):null,"success");
}
const idOf=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
const pageOf=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Math.min(Number(x),100000):1;
router.use(exigirAdmin);
router.use(async (req,res,next)=>["POST","PUT","PATCH","DELETE"].includes(req.method)?sameOrigin(req,res,next):next());

router.get("/stats",async (req,res)=>{
 const n = async (q) => (await db.prepare(q).get()).n;
 res.json({stats:{
  users:await n("SELECT COUNT(*) n FROM users"),users24h:await n("SELECT COUNT(*) n FROM users WHERE datetime(created_at)>=datetime('now','-1 day')"),
  users7d:await n("SELECT COUNT(*) n FROM users WHERE datetime(created_at)>=datetime('now','-7 days')"),
  users30d:await n("SELECT COUNT(*) n FROM users WHERE datetime(created_at)>=datetime('now','-30 days')"),
  blockedUsers:await n("SELECT COUNT(*) n FROM users WHERE is_blocked=1"),products:await n("SELECT COUNT(*) n FROM products"),
  activeProducts:await n("SELECT COUNT(*) n FROM products WHERE is_blocked=0"),blockedProducts:await n("SELECT COUNT(*) n FROM products WHERE is_blocked=1")},
  registrations:await db.prepare("SELECT CAST(created_at AS DATE) day,COUNT(*) count FROM users WHERE datetime(created_at)>=datetime('now','-29 days') GROUP BY CAST(created_at AS DATE) ORDER BY day").all(),
  publications:await db.prepare("SELECT CAST(created_at AS DATE) day,COUNT(*) count FROM products WHERE datetime(created_at)>=datetime('now','-29 days') GROUP BY CAST(created_at AS DATE) ORDER BY day").all()});
});
router.get("/users",async (req,res)=>{
 const page=pageOf(req.query.page),limit=Math.min(pageOf(req.query.limit||20),100),search=String(req.query.search||"").trim().slice(0,120),status=String(req.query.status||"");
 const w=[],a=[];if(search){w.push("(u.name LIKE ? OR u.email LIKE ? OR CAST(u.id AS TEXT)=?)");a.push("%"+search+"%","%"+search+"%",search);}
 if(status==="blocked")w.push("u.is_blocked=1");if(status==="active")w.push("u.is_blocked=0");
 const c=w.length?" WHERE "+w.join(" AND "):"";
 const total=(await db.prepare("SELECT COUNT(*) n FROM users u"+c).get(...a)).n;
 const users=await db.prepare("SELECT u.id,u.name,u.email,u.phone,u.created_at,u.is_blocked,u.blocked_reason,(SELECT COUNT(*) FROM products p WHERE p.user_id=u.id) product_count FROM users u"+c+" ORDER BY u.id DESC LIMIT ? OFFSET ?").all(...a,limit,(page-1)*limit);
 res.json({users,page,limit,total,pages:Math.ceil(total/limit)});
});
router.get("/users/:id",async (req,res)=>{
 const id=idOf(req.params.id);if(!id)return res.status(400).json({erro:"Identificador inválido."});
 const user=await db.prepare("SELECT id,name,email,phone,created_at,is_blocked,blocked_reason FROM users WHERE id=?").get(id);
 if(!user)return res.status(404).json({erro:"Utilizador não encontrado."});
 const products=await db.prepare("SELECT id,name,price,category,city,created_at,is_blocked,blocked_reason FROM products WHERE user_id=? ORDER BY id DESC LIMIT 100").all(id);
 res.json({user,products});
});
router.patch("/users/:id/status",async (req,res)=>{
 const id=idOf(req.params.id),blocked=req.body?.blocked;if(!id||typeof blocked!=="boolean")return res.status(400).json({erro:"Estado inválido."});
 const u=await db.prepare("SELECT id,email FROM users WHERE id=?").get(id);if(!u)return res.status(404).json({erro:"Utilizador não encontrado."});
 if(String(u.email).toLowerCase()===adminEmail())return res.status(400).json({erro:"Não podes bloquear a conta administrativa."});
 const reason=blocked?String(req.body.reason||"").trim().slice(0,300):null;
 await db.prepare("UPDATE users SET is_blocked=?,blocked_reason=? WHERE id=?").run(blocked?1:0,reason,id);
 await log(req,blocked?"user.block":"user.unblock","user",id,reason);res.json({mensagem:blocked?"Utilizador bloqueado.":"Utilizador desbloqueado."});
});
router.delete("/users/:id",async (req,res)=>{
 const id=idOf(req.params.id);if(!id)return res.status(400).json({erro:"Identificador inválido."});
 const u=await db.prepare("SELECT id,email FROM users WHERE id=?").get(id);if(!u)return res.status(404).json({erro:"Utilizador não encontrado."});
 if(String(u.email).toLowerCase()===adminEmail())return res.status(400).json({erro:"Não podes eliminar a conta administrativa."});
 try{await db.transaction(async () =>{await log(req,"user.delete","user",id,req.body?.reason||"Eliminação administrativa");await db.prepare("DELETE FROM users WHERE id=?").run(id);})();res.json({mensagem:"Utilizador eliminado."});}
 catch{return res.status(409).json({erro:"Não foi possível eliminar a conta devido a dados associados."});}
});
router.get("/products",async (req,res)=>{
 const page=pageOf(req.query.page),limit=Math.min(pageOf(req.query.limit||20),100),search=String(req.query.search||"").trim().slice(0,120),status=String(req.query.status||"");
 const w=[],a=[];if(search){w.push("(p.name LIKE ? OR CAST(p.id AS TEXT)=? OR u.name LIKE ? OR u.email LIKE ?)");a.push("%"+search+"%",search,"%"+search+"%","%"+search+"%");}
 if(status==="blocked")w.push("p.is_blocked=1");if(status==="active")w.push("p.is_blocked=0");const c=w.length?" WHERE "+w.join(" AND "):"";
 const total=(await db.prepare("SELECT COUNT(*) n FROM products p LEFT JOIN users u ON u.id=p.user_id"+c).get(...a)).n;
 const products=await db.prepare("SELECT p.id,p.name,p.price,p.category,p.city,p.neighborhood,p.image,p.created_at,p.is_blocked,p.blocked_reason,p.user_id,u.name seller_name,u.email seller_email FROM products p LEFT JOIN users u ON u.id=p.user_id"+c+" ORDER BY p.id DESC LIMIT ? OFFSET ?").all(...a,limit,(page-1)*limit);
 res.json({products,page,limit,total,pages:Math.ceil(total/limit)});
});
router.patch("/products/:id/status",async (req,res)=>{
 const id=idOf(req.params.id),blocked=req.body?.blocked;if(!id||typeof blocked!=="boolean")return res.status(400).json({erro:"Estado inválido."});
 const p=await db.prepare("SELECT id FROM products WHERE id=?").get(id);if(!p)return res.status(404).json({erro:"Anúncio não encontrado."});
 const reason=blocked?String(req.body.reason||"").trim().slice(0,300):null;
 await db.prepare("UPDATE products SET is_blocked=?,blocked_reason=? WHERE id=?").run(blocked?1:0,reason,id);
 await log(req,blocked?"product.suspend":"product.restore","product",id,reason);res.json({mensagem:blocked?"Anúncio suspenso.":"Anúncio reativado."});
});
router.delete("/products/:id",async (req,res)=>{
 const id=idOf(req.params.id);if(!id)return res.status(400).json({erro:"Identificador inválido."});
 if(!await db.prepare("SELECT id FROM products WHERE id=?").get(id))return res.status(404).json({erro:"Anúncio não encontrado."});
 await db.transaction(async () =>{await log(req,"product.delete","product",id,req.body?.reason||"Eliminação administrativa");await db.prepare("DELETE FROM products WHERE id=?").run(id);})();
 res.json({mensagem:"Anúncio eliminado."});
});
router.get("/audit-logs",async (req,res)=>{
 const page=pageOf(req.query.page),limit=Math.min(pageOf(req.query.limit||30),100);
 const logs=await db.prepare("SELECT id,admin_user_id,admin_email,action,target_type,target_id,reason,result,created_at FROM admin_audit_logs ORDER BY id DESC LIMIT ? OFFSET ?").all(limit,(page-1)*limit);
 const total=(await db.prepare("SELECT COUNT(*) n FROM admin_audit_logs").get()).n;res.json({logs,page,limit,total,pages:Math.ceil(total/limit)});
});

// Pedidos confirmados por e-mail, com contadores para notificações do painel.
router.get("/password-recovery-requests", async (req,res) => {
  const requests = await db.prepare(`
    SELECT r.id, r.user_id, r.email, r.status, r.requested_at, r.email_confirmed_at, u.name, u.phone
    FROM password_recovery_requests r JOIN users u ON u.id=r.user_id
    WHERE r.status='pending' AND r.email_confirmed_at IS NOT NULL
    ORDER BY r.requested_at ASC LIMIT 100
  `).all();
  const pendingCount = (await db.prepare("SELECT COUNT(*) n FROM password_recovery_requests WHERE status='pending' AND email_confirmed_at IS NOT NULL").get()).n;
  const approvedCount = (await db.prepare("SELECT COUNT(*) n FROM password_recovery_requests WHERE status='approved' AND completed_at IS NULL").get()).n;
  const completedCount = (await db.prepare("SELECT COUNT(*) n FROM password_recovery_requests WHERE completed_at IS NOT NULL").get()).n;
  res.json({requests, counts:{pending:pendingCount,approved:approvedCount,completed:completedCount}});
});

// Aprovar recuperação: o utilizador recebe um link de utilização única para definir a própria palavra-passe.
router.post("/password-recovery-requests/:id/approve", async (req,res) => {
  const id=idOf(req.params.id);
  if(!id) return res.status(400).json({erro:"Pedido inválido."});
  const request=await db.prepare("SELECT r.id,r.user_id,r.email,r.status,r.email_confirmed_at,u.name FROM password_recovery_requests r JOIN users u ON u.id=r.user_id WHERE r.id=?").get(id);
  if(!request || request.status!=="pending" || !request.email_confirmed_at) return res.status(404).json({erro:"Pedido confirmado e pendente não encontrado."});
  const token=crypto.randomBytes(32).toString("hex");
  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
  const baseUrl=String(process.env.APP_URL||"").trim().replace(/[/]+$/,"") || (req.protocol+"://"+req.get("host"));
  const resetUrl=baseUrl+"/redefinir.html?token="+token;
  try {
    await db.transaction(async () =>{
      const result=await db.prepare("UPDATE password_recovery_requests SET status='approved',resolved_at=CURRENT_TIMESTAMP,resolved_by=?,reset_token_hash=?,reset_token_expires_at=? WHERE id=? AND status='pending' AND email_confirmed_at IS NOT NULL").run(req.session.userId,tokenHash,Date.now()+60*60*1000,id);
      if(!result.changes) throw new Error("O pedido já foi tratado.");
      await log(req,"password_recovery.approve","password_recovery",id,"E-mail confirmado; link seguro criado por 60 minutos");
    })();
  } catch(e) { return res.status(409).json({erro:"Não foi possível aprovar este pedido. Atualiza a lista e tenta novamente."}); }
  let emailSent=false;
  try {
    const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS}=process.env;
    if(!SMTP_HOST||!SMTP_PORT||!SMTP_USER||!SMTP_PASS) throw new Error("SMTP não configurado");
    const transporter=nodemailer.createTransport({host:SMTP_HOST,port:Number(SMTP_PORT),secure:Number(SMTP_PORT)===465,auth:{user:SMTP_USER,pass:SMTP_PASS}});
    await transporter.sendMail({
      from:process.env.SMTP_FROM||SMTP_USER,to:request.email,subject:"Bisno — autorização para alterar a palavra-passe",
      text:"Olá "+request.name+". O teu pedido de recuperação foi aprovado. Define uma nova palavra-passe neste link (válido durante 60 minutos): "+resetUrl+" . Se não pediste esta alteração, ignora esta mensagem.",
      html:"<p>Olá "+String(request.name).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+".</p><p>O teu pedido de recuperação foi aprovado.</p><p><a href=\""+resetUrl+"\">Clica aqui para definir uma nova palavra-passe</a>. O link é válido durante 60 minutos e só pode ser utilizado uma vez.</p><p>Se não pediste esta alteração, ignora esta mensagem.</p>"
    });
    emailSent=true;
  } catch(e) { console.warn("[Bisno] Link aprovado, mas não foi possível enviar e-mail:",e.message); }
  res.json({mensagem:emailSent?"Pedido aprovado e link enviado ao e-mail confirmado.":"Pedido aprovado, mas o e-mail não pôde ser enviado. Copia o link seguro e entrega-o ao utilizador por um canal privado.",email:request.email,emailSent,resetUrl:emailSent?null:resetUrl});
});

router.post("/password-recovery-requests/:id/reject", async (req,res) => {
  const id = idOf(req.params.id);
  if (!id) return res.status(400).json({erro:"Pedido inválido."});
  const result = await db.prepare("UPDATE password_recovery_requests SET status='rejected',resolved_at=CURRENT_TIMESTAMP,resolved_by=? WHERE id=? AND status='pending'").run(req.session.userId,id);
  if (!result.changes) return res.status(404).json({erro:"Pedido pendente não encontrado."});
  await log(req,"password_recovery.reject","password_recovery",id,"Pedido rejeitado pelo administrador");
  res.json({mensagem:"Pedido rejeitado."});
});

// Compatibilidade com os controlos já apresentados no painel do marketplace.
router.get("/overview", async (req,res) => {
  const stats = {
    users: (await db.prepare("SELECT COUNT(*) n FROM users").get()).n,
    blockedUsers: (await db.prepare("SELECT COUNT(*) n FROM users WHERE is_blocked=1").get()).n,
    products: (await db.prepare("SELECT COUNT(*) n FROM products").get()).n,
    activeProducts: (await db.prepare("SELECT COUNT(*) n FROM products WHERE is_blocked=0").get()).n,
    blockedProducts: (await db.prepare("SELECT COUNT(*) n FROM products WHERE is_blocked=1").get()).n
  };
  const users = await db.prepare("SELECT id,name,email,phone,created_at,is_blocked FROM users ORDER BY id DESC LIMIT 100").all();
  const products = await db.prepare("SELECT p.id,p.name,p.city,p.is_blocked,u.name seller_name,u.email seller_email FROM products p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 100").all();
  res.json({stats,users,products});
});
router.patch("/users/:id/block", async (req,res) => {
  const id=idOf(req.params.id), blocked=req.body?.blocked;
  if(!id || typeof blocked!=="boolean") return res.status(400).json({erro:"Estado inválido."});
  const u=await db.prepare("SELECT id,email FROM users WHERE id=?").get(id);
  if(!u) return res.status(404).json({erro:"Utilizador não encontrado."});
  if(String(u.email).toLowerCase()===adminEmail()) return res.status(400).json({erro:"Não podes bloquear a conta administrativa."});
  await db.prepare("UPDATE users SET is_blocked=?,blocked_reason=? WHERE id=?").run(blocked?1:0,blocked?"Bloqueado pelo administrador":null,id);
  await log(req,blocked?"user.block":"user.unblock","user",id,null);
  res.json({mensagem:blocked?"Utilizador bloqueado.":"Utilizador desbloqueado."});
});
router.patch("/products/:id/block", async (req,res) => {
  const id=idOf(req.params.id), blocked=req.body?.blocked;
  if(!id || typeof blocked!=="boolean") return res.status(400).json({erro:"Estado inválido."});
  const p=await db.prepare("SELECT id FROM products WHERE id=?").get(id);
  if(!p) return res.status(404).json({erro:"Anúncio não encontrado."});
  await db.prepare("UPDATE products SET is_blocked=?,blocked_reason=? WHERE id=?").run(blocked?1:0,blocked?"Suspenso pelo administrador":null,id);
  await log(req,blocked?"product.suspend":"product.restore","product",id,null);
  res.json({mensagem:blocked?"Anúncio suspenso.":"Anúncio reativado."});
});


router.get("/stores", async (_req,res) => {
  const stores = await db.prepare(`SELECT s.id,s.user_id,s.name,s.description,s.city,s.is_active,s.created_at,
    u.name AS owner_name,u.email AS owner_email,
    (SELECT COUNT(*) FROM products p WHERE p.user_id=s.user_id AND p.is_blocked=0) AS product_count,
    (SELECT COUNT(*) FROM store_follows f WHERE f.store_id=s.id) AS followers,
    (SELECT COUNT(*) FROM store_views v WHERE v.store_id=s.id) AS views,
    (SELECT COUNT(*) FROM store_contacts c WHERE c.store_id=s.id) AS contacts
    FROM stores s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 200`).all();
  res.json({stores});
});
router.patch("/stores/:id/status", async (req,res) => {
  const id=idOf(req.params.id), active=req.body?.active;
  if(!id || typeof active!=="boolean") return res.status(400).json({erro:"Estado da loja inválido."});
  const store=await db.prepare("SELECT id,name FROM stores WHERE id=?").get(id);
  if(!store) return res.status(404).json({erro:"Loja não encontrada."});
  await db.prepare("UPDATE stores SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(active?1:0,id);
  await log(req,active?"store.activate":"store.suspend","store",id,null);
  res.json({mensagem:active?"Loja reativada.":"Loja suspensa.",active});
});


router.get("/site-phrases", async (_req,res) => {
 const row=await db.prepare("SELECT value FROM site_settings WHERE key=?").get("home_phrases");
 res.json({phrases:row?.value||null});
});
router.put("/site-phrases", async (req,res) => {
 const raw=req.body?.phrases;
 if(!Array.isArray(raw)||raw.length<1||raw.length>6)return res.status(400).json({erro:"Indica entre 1 e 6 cartões."});
 const phrases=raw.map(p=>({etiqueta:String(p?.etiqueta||"").trim().slice(0,80),titulo:String(p?.titulo||"").trim().slice(0,100),descricao:String(p?.descricao||"").trim().slice(0,240)}));
 if(phrases.some(p=>!p.etiqueta||!p.titulo||!p.descricao))return res.status(400).json({erro:"Preenche todos os campos."});
 await db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=CURRENT_TIMESTAMP").run("home_phrases",JSON.stringify(phrases));
 await log(req,"site.home_phrases.update","settings","home_phrases",null);
 res.json({mensagem:"Frases atualizadas.",phrases});
});
module.exports={router,exigirAdmin};
