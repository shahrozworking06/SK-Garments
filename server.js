require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const root = __dirname;
const uploadDir = path.join(root, "public", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.warn("WARNING: Set SESSION_SECRET to a random string of 32+ characters in .env before production.");
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.warn("WARNING: Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before starting.");
}
const db = new Database(path.join(root, "data", "shop.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_code TEXT UNIQUE NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, items_json TEXT NOT NULL, total INTEGER NOT NULL, payment_method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', payment_status TEXT NOT NULL DEFAULT 'Unpaid', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, phone TEXT NOT NULL, message TEXT NOT NULL, sender TEXT NOT NULL DEFAULT 'customer', read_by_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const seed = db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)");
seed.run("shop_name", process.env.SHOP_NAME || "SK GARMENTS");
seed.run("whatsapp_number", process.env.WHATSAPP_NUMBER || "923196236961");
seed.run("bank_enabled", "0"); seed.run("bank_name", ""); seed.run("account_title", "");
seed.run("account_number", ""); seed.run("iban", ""); seed.run("payment_instructions", "");
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const existing = db.prepare("SELECT id FROM admins WHERE email=?").get(process.env.ADMIN_EMAIL.toLowerCase());
  if (!existing) db.prepare("INSERT INTO admins(email,password_hash) VALUES (?,?)")
    .run(process.env.ADMIN_EMAIL.toLowerCase(), bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));
}
if (db.prepare("SELECT COUNT(*) n FROM products").get().n === 0) {
  const ins = db.prepare("INSERT INTO products(name,category,price,description,image,stock) VALUES (?,?,?,?,?,?)");
  ins.run("Black Drop Shoulder Tee", "T-Shirts", 1499, "Relaxed fit, soft-feel everyday T-shirt. Add your own sizes and product details in the owner panel.", "/tshirts-black-blue-red.png", 10);
  ins.run("Blue Graphic Tee", "T-Shirts", 1499, "A bold blue tee for everyday streetwear. Sample listing — edit price, description and stock.", "/tshirts-black-blue-red.png", 10);
  ins.run("Classic Black Tee", "T-Shirts", 1299, "Minimal black T-shirt. Sample listing — replace with your actual product photos.", "/tshirt-collection.png", 10);
}
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "https:"], connectSrc: ["'self'"], objectSrc: ["'none'"],
  upgradeInsecureRequests: null
}}}));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:false, limit:"1mb"}));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: path.join(root, "data") }),
  secret: process.env.SESSION_SECRET || "unsafe-development-secret-change-this-before-deploying",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 8*60*60*1000 }
}));
app.use(express.static(path.join(root, "public")));
const loginLimiter = rateLimit({windowMs:15*60*1000, limit:8, standardHeaders:true, legacyHeaders:false});
const orderLimiter = rateLimit({windowMs:60*60*1000, limit:20, standardHeaders:true, legacyHeaders:false});
const chatLimiter = rateLimit({windowMs:10*60*1000, limit:30, standardHeaders:true, legacyHeaders:false});
const upload = multer({storage:multer.diskStorage({
  destination:(req,file,cb)=>cb(null,uploadDir),
  filename:(req,file,cb)=>cb(null, Date.now()+"-"+Math.random().toString(36).slice(2,9)+path.extname(file.originalname).toLowerCase())
}), limits:{fileSize:5*1024*1024}, fileFilter:(req,file,cb)=>{
  if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.mimetype)) return cb(new Error("Only JPG, PNG, WEBP or GIF images are allowed."));
  cb(null,true);
}});
const adminOnly=(req,res,next)=>req.session.adminId?next():res.status(401).json({error:"Please sign in to the owner panel."});
const setting=(key)=>db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value || "";
const setSetting=db.prepare("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
const safeProduct=p=>({...p, active:!!p.active});
app.get("/api/store",(req,res)=>{
  const products=db.prepare("SELECT id,name,category,price,description,image,stock FROM products WHERE active=1 ORDER BY id DESC").all();
  res.json({shopName:setting("shop_name"), whatsapp:setting("whatsapp_number"), products,
    bankEnabled:setting("bank_enabled")==="1",
    bank:setting("bank_enabled")==="1"?{name:setting("bank_name"),title:setting("account_title"),number:setting("account_number"),iban:setting("iban"),instructions:setting("payment_instructions")} : null});
});
app.post("/api/admin/login",loginLimiter,async(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
  const user=db.prepare("SELECT * FROM admins WHERE email=?").get(email);
  if(!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:"Email or password is incorrect."});
  req.session.regenerate(err=>{ if(err)return res.status(500).json({error:"Could not create session."}); req.session.adminId=user.id; res.json({ok:true}); });
});
app.post("/api/admin/logout",adminOnly,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/me",adminOnly,(req,res)=>res.json({email:db.prepare("SELECT email FROM admins WHERE id=?").get(req.session.adminId)?.email}));
app.get("/api/admin/summary",adminOnly,(req,res)=>{
  res.json({
    products:db.prepare("SELECT COUNT(*) n FROM products").get().n,
    orders:db.prepare("SELECT COUNT(*) n FROM orders").get().n,
    pending:db.prepare("SELECT COUNT(*) n FROM orders WHERE status='Pending'").get().n,
    revenue:db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status IN ('Confirmed','Processing','Shipped','Delivered')").get().n,
    unread:db.prepare("SELECT COUNT(*) n FROM messages WHERE sender='customer' AND read_by_admin=0").get().n
  });
});
app.get("/api/admin/products",adminOnly,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all().map(safeProduct)));
app.post("/api/admin/upload",adminOnly,upload.single("image"),(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Choose an image first."});
  res.json({image:"/uploads/"+req.file.filename});
});
app.post("/api/admin/products",adminOnly,(req,res)=>{
  const {name,category,price,description,image,stock}=req.body;
  if(!String(name||"").trim()||!String(category||"").trim()||!Number.isFinite(Number(price))||Number(price)<0) return res.status(400).json({error:"Name, category and a valid price are required."});
  const info=db.prepare("INSERT INTO products(name,category,price,description,image,stock) VALUES (?,?,?,?,?,?)")
    .run(String(name).trim().slice(0,120),String(category).slice(0,60),Math.round(Number(price)),String(description||"").slice(0,2000),String(image||"").slice(0,500),Math.max(0,Math.round(Number(stock)||0)));
  res.json({ok:true,id:info.lastInsertRowid});
});
app.put("/api/admin/products/:id",adminOnly,(req,res)=>{
  const {name,category,price,description,image,stock,active}=req.body;
  if(!String(name||"").trim()||!String(category||"").trim()||!Number.isFinite(Number(price))||Number(price)<0)return res.status(400).json({error:"Enter a valid name, category and price."});
  const result=db.prepare("UPDATE products SET name=?,category=?,price=?,description=?,image=?,stock=?,active=? WHERE id=?")
  .run(String(name).trim().slice(0,120),String(category).slice(0,60),Math.round(Number(price)),String(description||"").slice(0,2000),String(image||"").slice(0,500),Math.max(0,Math.round(Number(stock)||0),),active===false?0:1,Number(req.params.id));
  res.json({ok:result.changes>0});
});
app.delete("/api/admin/products/:id",adminOnly,(req,res)=>res.json({ok:db.prepare("DELETE FROM products WHERE id=?").run(Number(req.params.id)).changes>0}));
app.get("/api/admin/orders",adminOnly,(req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all()));
app.patch("/api/admin/orders/:id",adminOnly,(req,res)=>{
  const statuses=["Pending","Confirmed","Processing","Shipped","Delivered","Cancelled"];
  const pays=["Unpaid","Awaiting Verification","Paid","Refunded"];
  const o=db.prepare("SELECT * FROM orders WHERE id=?").get(Number(req.params.id));
  if(!o)return res.status(404).json({error:"Order not found."});
  const status=statuses.includes(req.body.status)?req.body.status:o.status;
  const payment_status=pays.includes(req.body.payment_status)?req.body.payment_status:o.payment_status;
  db.prepare("UPDATE orders SET status=?,payment_status=? WHERE id=?").run(status,payment_status,o.id);
  res.json({ok:true});
});
app.get("/api/admin/messages",adminOnly,(req,res)=>{
  db.prepare("UPDATE messages SET read_by_admin=1 WHERE sender='customer'").run();
  res.json(db.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 300").all().reverse());
});
app.get("/api/chat", (req,res)=>{
  const phone=String(req.query.phone||"").replace(/[^\d+]/g,"").slice(0,20);
  if(!phone)return res.json([]);
  res.json(db.prepare("SELECT id,customer_name,message,sender,created_at FROM messages WHERE phone=? ORDER BY id ASC LIMIT 200").all(phone));
});
app.post("/api/chat",chatLimiter,(req,res)=>{
  const name=String(req.body.name||"").trim().slice(0,80),phone=String(req.body.phone||"").replace(/[^\d+]/g,"").slice(0,20),message=String(req.body.message||"").trim().slice(0,1000);
  if(!name||phone.length<7||!message)return res.status(400).json({error:"Enter your name, phone number and message."});
  const info=db.prepare("INSERT INTO messages(customer_name,phone,message,sender) VALUES (?,?,?,'customer')").run(name,phone,message);
  res.json({ok:true,id:info.lastInsertRowid});
});
app.post("/api/admin/messages/reply",adminOnly,(req,res)=>{
  const phone=String(req.body.phone||"").replace(/[^\d+]/g,"").slice(0,20),message=String(req.body.message||"").trim().slice(0,1000);
  if(phone.length<7||!message)return res.status(400).json({error:"Phone and reply are required."});
  db.prepare("INSERT INTO messages(customer_name,phone,message,sender,read_by_admin) VALUES (?,?,?,'admin',1)").run("SK Garments",phone,message);
  res.json({ok:true});
});
app.get("/api/admin/settings",adminOnly,(req,res)=>res.json({
  shop_name:setting("shop_name"),whatsapp_number:setting("whatsapp_number"),bank_enabled:setting("bank_enabled")==="1",
  bank_name:setting("bank_name"),account_title:setting("account_title"),account_number:setting("account_number"),iban:setting("iban"),payment_instructions:setting("payment_instructions")
}));
app.put("/api/admin/settings",adminOnly,(req,res)=>{
  const fields=["shop_name","whatsapp_number","bank_name","account_title","account_number","iban","payment_instructions"];
  for(const f of fields) setSetting.run(f,String(req.body[f]||"").slice(0,1000));
  setSetting.run("bank_enabled",req.body.bank_enabled?"1":"0");
  res.json({ok:true});
});
app.post("/api/orders",orderLimiter,(req,res)=>{
  const name=String(req.body.name||"").trim().slice(0,100),phone=String(req.body.phone||"").replace(/[^\d+()\-\s]/g,"").slice(0,30),address=String(req.body.address||"").trim().slice(0,500),payment=String(req.body.payment||"COD");
  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!name||phone.replace(/\D/g,"").length<7||!address||!items.length)return res.status(400).json({error:"Please fill your name, phone, address and cart."});
  if(!["COD","Bank Transfer"].includes(payment))return res.status(400).json({error:"Unsupported payment method."});
  if(payment==="Bank Transfer"&&setting("bank_enabled")!=="1")return res.status(400).json({error:"Bank transfer is not enabled right now."});
  let total=0,clean=[];
  for(const item of items){
    const p=db.prepare("SELECT id,name,price,stock FROM products WHERE id=? AND active=1").get(Number(item.id));
    const qty=Math.max(1,Math.min(20,Math.floor(Number(item.qty)||1)));
    if(!p)return res.status(400).json({error:"A product in your cart is no longer available."});
    if(p.stock>0&&qty>p.stock)return res.status(400).json({error:"Not enough stock for "+p.name});
    total+=p.price*qty;clean.push({id:p.id,name:p.name,price:p.price,qty});
  }
  const code="SK"+Date.now().toString().slice(-8)+Math.random().toString(10).slice(2,4);
  db.prepare("INSERT INTO orders(order_code,customer_name,phone,address,items_json,total,payment_method) VALUES (?,?,?,?,?,?,?)").run(code,name,phone,address,JSON.stringify(clean),total,payment);
  res.json({ok:true,orderCode:code,total,whatsapp:setting("whatsapp_number"),message:"Order received. Save your order code to ask about status."});
});
app.get("/api/order/:code",(req,res)=>{
  const o=db.prepare("SELECT order_code,customer_name,total,payment_method,status,payment_status,created_at FROM orders WHERE order_code=? AND phone=?")
  .get(String(req.params.code).slice(0,30),String(req.query.phone||"").replace(/[^\d+()\-\s]/g,"").slice(0,30));
  if(!o)return res.status(404).json({error:"Order not found. Check your order code and phone number."});
  res.json(o);
});
app.get("/admin",(req,res)=>res.sendFile(path.join(root,"public","admin.html")));
app.use((err,req,res,next)=>{console.error(err.message);res.status(400).json({error:err.message||"Request failed."});});
app.listen(PORT,()=>console.log(`SK Garments running on port ${PORT}`));
