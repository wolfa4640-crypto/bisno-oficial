"use strict";
const express = require("express");
const db = require("../data/database");
const router = express.Router();
const adminEmail = () => String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
function exigirAdmin(req,res,next) {
  if (!req.session?.userId) return res.status(401).json({erro:"Inicia sessão primeiro."});
  if (!adminEmail()) return res.status(503).json({erro:"Define ADMIN_EMAIL nas variáveis do Render."});
  try {
    const u=db.prepare("SELECT id,email,is_blocked FROM users WHERE id=?").get(req.session.userId);
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
function log(req,action,type,id,reason){
  db.prepare("INSERT INTO admin_audit_logs (admin_user_id,admin_email,action,target_type,target_id,reason,result,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
    .run(req.session.userId,adminEmail(),action,type,String(id),reason?String(reason).slice(0,300):null,"success");
}
const idOf=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
const pageOf=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Math.min(Number(x),100000):1;
router.use(exigirAdmin);
router.use((req,res,next)=>["POST","PUT","PATCH","DELETE"].includes(req.method)?sameOrigin(req,res,next):next());

router.get("/stats",(req,res)=>{
 const n=q=>db.prepare(q).get().n;
 res.json({stats:{
  users:n("SELECT COUNT(*) n FROM users"),users24h:n("SELECT COUNT(*) n FROM users WHERE datetime(created_at)>=datetime('now','-1 day')"),
  users7d:n("SELECT COUNT(*) n FROM users WHERE datetime(created_at)>=datetime('now','-7 days')"),
  users30d:n("SELECT COUNT(*) n FROM users WHERE datetime(created_at)>=datetime('now','-30 days')"),
  blockedUsers:n("SELECT COUNT(*) n FROM users WHERE is_blocked=1"),products:n("SELECT COUNT(*) n FROM products"),
  activeProducts:n("SELECT COUNT(*) n FROM products WHERE is_blocked=0"),blockedProducts:n("SELECT COUNT(*) n FROM products WHERE is_blocked=1")},
  registrations:db.prepare("SELECT date(created_at) day,COUNT(*) count FROM users WHERE datetime(created_at)>=datetime('now','-29 days') GROUP BY date(created_at) ORDER BY day").all(),
  publications:db.prepare("SELECT date(created_at) day,COUNT(*) count FROM products WHERE datetime(created_at)>=datetime('now','-29 days') GROUP BY date(created_at) ORDER BY day").all()});
});
router.get("/users",(req,res)=>{
 const page=pageOf(req.query.page),limit=Math.min(pageOf(req.query.limit||20),100),search=String(req.query.search||"").trim().slice(0,120),status=String(req.query.status||"");
 const w=[],a=[];if(search){w.push("(u.name LIKE ? OR u.email LIKE ? OR CAST(u.id AS TEXT)=?)");a.push("%"+search+"%","%"+search+"%",search);}
 if(status==="blocked")w.push("u.is_blocked=1");if(status==="active")w.push("u.is_blocked=0");
 const c=w.length?" WHERE "+w.join(" AND "):"";
 const total=db.prepare("SELECT COUNT(*) n FROM users u"+c).get(...a).n;
 const users=db.prepare("SELECT u.id,u.name,u.email,u.phone,u.created_at,u.is_blocked,u.blocked_reason,(SELECT COUNT(*) FROM products p WHERE p.user_id=u.id) product_count FROM users u"+c+" ORDER BY u.id DESC LIMIT ? OFFSET ?").all(...a,limit,(page-1)*limit);
 res.json({users,page,limit,total,pages:Math.ceil(total/limit)});
});
router.get("/users/:id",(req,res)=>{
 const id=idOf(req.params.id);if(!id)return res.status(400).json({erro:"Identificador inválido."});
 const user=db.prepare("SELECT id,name,email,phone,created_at,is_blocked,blocked_reason FROM users WHERE id=?").get(id);
 if(!user)return res.status(404).json({erro:"Utilizador não encontrado."});
 const products=db.prepare("SELECT id,name,price,category,city,created_at,is_blocked,blocked_reason FROM products WHERE user_id=? ORDER BY id DESC LIMIT 100").all(id);
 res.json({user,products});
});
router.patch("/users/:id/status",(req,res)=>{
 const id=idOf(req.params.id),blocked=req.body?.blocked;if(!id||typeof blocked!=="boolean")return res.status(400).json({erro:"Estado inválido."});
 const u=db.prepare("SELECT id,email FROM users WHERE id=?").get(id);if(!u)return res.status(404).json({erro:"Utilizador não encontrado."});
 if(String(u.email).toLowerCase()===adminEmail())return res.status(400).json({erro:"Não podes bloquear a conta administrativa."});
 const reason=blocked?String(req.body.reason||"").trim().slice(0,300):null;
 db.prepare("UPDATE users SET is_blocked=?,blocked_reason=? WHERE id=?").run(blocked?1:0,reason,id);
 log(req,blocked?"user.block":"user.unblock","user",id,reason);res.json({mensagem:blocked?"Utilizador bloqueado.":"Utilizador desbloqueado."});
});
router.delete("/users/:id",(req,res)=>{
 const id=idOf(req.params.id);if(!id)return res.status(400).json({erro:"Identificador inválido."});
 const u=db.prepare("SELECT id,email FROM users WHERE id=?").get(id);if(!u)return res.status(404).json({erro:"Utilizador não encontrado."});
 if(String(u.email).toLowerCase()===adminEmail())return res.status(400).json({erro:"Não podes eliminar a conta administrativa."});
 try{db.transaction(()=>{log(req,"user.delete","user",id,req.body?.reason||"Eliminação administrativa");db.prepare("DELETE FROM users WHERE id=?").run(id);})();res.json({mensagem:"Utilizador eliminado."});}
 catch{return res.status(409).json({erro:"Não foi possível eliminar a conta devido a dados associados."});}
});
router.get("/products",(req,res)=>{
 const page=pageOf(req.query.page),limit=Math.min(pageOf(req.query.limit||20),100),search=String(req.query.search||"").trim().slice(0,120),status=String(req.query.status||"");
 const w=[],a=[];if(search){w.push("(p.name LIKE ? OR CAST(p.id AS TEXT)=? OR u.name LIKE ? OR u.email LIKE ?)");a.push("%"+search+"%",search,"%"+search+"%","%"+search+"%");}
 if(status==="blocked")w.push("p.is_blocked=1");if(status==="active")w.push("p.is_blocked=0");const c=w.length?" WHERE "+w.join(" AND "):"";
 const total=db.prepare("SELECT COUNT(*) n FROM products p LEFT JOIN users u ON u.id=p.user_id"+c).get(...a).n;
 const products=db.prepare("SELECT p.id,p.name,p.price,p.category,p.city,p.neighborhood,p.image,p.created_at,p.is_blocked,p.blocked_reason,p.user_id,u.name seller_name,u.email seller_email FROM products p LEFT JOIN users u ON u.id=p.user_id"+c+" ORDER BY p.id DESC LIMIT ? OFFSET ?").all(...a,limit,(page-1)*limit);
 res.json({products,page,limit,total,pages:Math.ceil(total/limit)});
});
router.patch("/products/:id/status",(req,res)=>{
 const id=idOf(req.params.id),blocked=req.body?.blocked;if(!id||typeof blocked!=="boolean")return res.status(400).json({erro:"Estado inválido."});
 const p=db.prepare("SELECT id FROM products WHERE id=?").get(id);if(!p)return res.status(404).json({erro:"Anúncio não encontrado."});
 const reason=blocked?String(req.body.reason||"").trim().slice(0,300):null;
 db.prepare("UPDATE products SET is_blocked=?,blocked_reason=? WHERE id=?").run(blocked?1:0,reason,id);
 log(req,blocked?"product.suspend":"product.restore","product",id,reason);res.json({mensagem:blocked?"Anúncio suspenso.":"Anúncio reativado."});
});
router.delete("/products/:id",(req,res)=>{
 const id=idOf(req.params.id);if(!id)return res.status(400).json({erro:"Identificador inválido."});
 if(!db.prepare("SELECT id FROM products WHERE id=?").get(id))return res.status(404).json({erro:"Anúncio não encontrado."});
 db.transaction(()=>{log(req,"product.delete","product",id,req.body?.reason||"Eliminação administrativa");db.prepare("DELETE FROM products WHERE id=?").run(id);})();
 res.json({mensagem:"Anúncio eliminado."});
});
router.get("/audit-logs",(req,res)=>{
 const page=pageOf(req.query.page),limit=Math.min(pageOf(req.query.limit||30),100);
 const logs=db.prepare("SELECT id,admin_user_id,admin_email,action,target_type,target_id,reason,result,created_at FROM admin_audit_logs ORDER BY id DESC LIMIT ? OFFSET ?").all(limit,(page-1)*limit);
 const total=db.prepare("SELECT COUNT(*) n FROM admin_audit_logs").get().n;res.json({logs,page,limit,total,pages:Math.ceil(total/limit)});
});
module.exports={router,exigirAdmin};
