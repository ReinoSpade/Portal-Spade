const express = require("express");
const cookieParser = require("cookie-parser");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "troque-esta-chave";
const SESSION_SECRET = process.env.SESSION_SECRET || "troque-este-segredo";
const db = new Database(process.env.DB_FILE || "spade.db");

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nick TEXT NOT NULL,
  number TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  house TEXT DEFAULT '',
  patent TEXT DEFAULT 'Cavaleiro Mágico Junior',
  role TEXT DEFAULT '',
  grimoire TEXT DEFAULT '',
  hp INTEGER DEFAULT 200,
  mana INTEGER DEFAULT 400,
  yuls INTEGER DEFAULT 0,
  missions INTEGER DEFAULT 0,
  achievements INTEGER DEFAULT 0,
  ranking INTEGER DEFAULT 0,
  public_profile INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'RPG',
  excerpt TEXT DEFAULT '',
  body TEXT DEFAULT '',
  date TEXT DEFAULT CURRENT_DATE,
  published INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS editions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  edition TEXT DEFAULT '',
  description TEXT DEFAULT '',
  pdf_url TEXT DEFAULT '',
  date TEXT DEFAULT CURRENT_DATE,
  published INTEGER DEFAULT 1
);
`);

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function makePlayerToken(playerId) {
  const payload = `${playerId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function readPlayerToken(req) {
  const token = req.cookies.spade_player;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, ts, sig] = parts;
  const payload = `${id}.${ts}`;
  if (sign(payload) !== sig) return null;
  if (Date.now() - Number(ts) > 1000 * 60 * 60 * 24 * 7) return null;
  return Number(id);
}

function publicPlayer(row) {
  if (!row) return null;
  return {
    id: row.id, nick: row.nick, number: row.number, identifier: row.identifier,
    house: row.house, patent: row.patent, role: row.role, grimoire: row.grimoire,
    hp: row.hp, mana: row.mana, yuls: row.yuls, missions: row.missions,
    achievements: row.achievements, ranking: row.ranking
  };
}

function requireAdmin(req, res, next) {
  if (req.header("x-admin-key") !== ADMIN_KEY) return res.status(401).json({ error: "Acesso administrativo negado." });
  next();
}

app.post("/api/login", (req, res) => {
  const identifier = String(req.body.identifier || "").trim();
  if (!identifier || !/\d$/.test(identifier)) return res.status(400).json({ error: "Informe um identificador válido, como Mattiel01." });
  const player = db.prepare("SELECT * FROM players WHERE lower(identifier)=lower(?) AND public_profile=1").get(identifier);
  if (!player) return res.status(401).json({ error: "Jogador não encontrado. Confira o nick e o número." });
  res.cookie("spade_player", makePlayerToken(player.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000*60*60*24*7 });
  res.json({ player: publicPlayer(player) });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("spade_player");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const id = readPlayerToken(req);
  if (!id) return res.status(401).json({ error: "Não autenticado." });
  const player = db.prepare("SELECT * FROM players WHERE id=?").get(id);
  if (!player) return res.status(401).json({ error: "Sessão inválida." });
  res.json({ player: publicPlayer(player) });
});

app.get("/api/home", (req, res) => {
  const news = db.prepare("SELECT id,title,category,excerpt,date FROM news WHERE published=1 ORDER BY id DESC LIMIT 6").all();
  const editions = db.prepare("SELECT id,title,edition,description,pdf_url,date FROM editions WHERE published=1 ORDER BY id DESC LIMIT 6").all();
  const houses = db.prepare("SELECT house, COUNT(*) count, COALESCE(SUM(missions),0) missions FROM players WHERE house<>'' GROUP BY house ORDER BY missions DESC LIMIT 9").all();
  const ranking = db.prepare("SELECT nick,identifier,house,missions,ranking FROM players WHERE ranking>0 ORDER BY ranking ASC LIMIT 10").all();
  res.json({ news, editions, houses, ranking });
});

app.get("/api/ranking", (req, res) => {
  const ranking = db.prepare("SELECT nick,identifier,house,missions,yuls,ranking FROM players WHERE ranking>0 ORDER BY ranking ASC LIMIT 75").all();
  res.json({ ranking });
});

app.get("/api/players", (req, res) => {
  const players = db.prepare("SELECT id,nick,number,identifier,house,patent,role,grimoire,missions,achievements,ranking,yuls FROM players WHERE public_profile=1 ORDER BY nick COLLATE NOCASE").all();
  res.json({ players });
});

app.get("/api/admin/overview", requireAdmin, (req,res) => {
  const players = db.prepare("SELECT COUNT(*) c FROM players").get().c;
  const houses = db.prepare("SELECT COUNT(DISTINCT house) c FROM players WHERE house<>''").get().c;
  const news = db.prepare("SELECT COUNT(*) c FROM news WHERE published=1").get().c;
  const editions = db.prepare("SELECT COUNT(*) c FROM editions WHERE published=1").get().c;
  res.json({ players, houses, news, editions });
});

app.get("/api/admin/players", requireAdmin, (req,res) => {
  res.json({ players: db.prepare("SELECT * FROM players ORDER BY nick COLLATE NOCASE").all() });
});

app.post("/api/admin/players", requireAdmin, (req,res) => {
  const b = req.body || {};
  const nick = String(b.nick||"").trim(), number = String(b.number||"").trim();
  if (!nick || !number || !/^\d+$/.test(number)) return res.status(400).json({error:"Nick e número são obrigatórios."});
  const identifier = `${nick}${number}`;
  try {
    const info = db.prepare(`INSERT INTO players
      (nick,number,identifier,house,patent,role,grimoire,hp,mana,yuls,missions,achievements,ranking,public_profile)
      VALUES (@nick,@number,@identifier,@house,@patent,@role,@grimoire,@hp,@mana,@yuls,@missions,@achievements,@ranking,@public_profile)`).run({
        nick, number, identifier, house:String(b.house||""), patent:String(b.patent||"Cavaleiro Mágico Junior"),
        role:String(b.role||""), grimoire:String(b.grimoire||""), hp:Number(b.hp ?? 200), mana:Number(b.mana ?? 400),
        yuls:Number(b.yuls ?? 0), missions:Number(b.missions ?? 0), achievements:Number(b.achievements ?? 0),
        ranking:Number(b.ranking ?? 0), public_profile:Number(b.public_profile ?? 1)
      });
    res.json({ player: db.prepare("SELECT * FROM players WHERE id=?").get(info.lastInsertRowid) });
  } catch (e) { res.status(400).json({error:"Não foi possível criar. O identificador provavelmente já existe."}); }
});

app.put("/api/admin/players/:id", requireAdmin, (req,res) => {
  const id = Number(req.params.id), b = req.body || {};
  const current = db.prepare("SELECT * FROM players WHERE id=?").get(id);
  if (!current) return res.status(404).json({error:"Jogador não encontrado."});
  const nick = String(b.nick ?? current.nick).trim();
  const number = String(b.number ?? current.number).trim();
  if (!nick || !number || !/^\d+$/.test(number)) return res.status(400).json({error:"Nick e número são obrigatórios."});
  const identifier = `${nick}${number}`;
  try {
    db.prepare(`UPDATE players SET nick=?,number=?,identifier=?,house=?,patent=?,role=?,grimoire=?,hp=?,mana=?,yuls=?,missions=?,achievements=?,ranking=?,public_profile=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(nick,number,identifier,String(b.house ?? current.house),String(b.patent ?? current.patent),String(b.role ?? current.role),String(b.grimoire ?? current.grimoire),
        Number(b.hp ?? current.hp),Number(b.mana ?? current.mana),Number(b.yuls ?? current.yuls),Number(b.missions ?? current.missions),
        Number(b.achievements ?? current.achievements),Number(b.ranking ?? current.ranking),Number(b.public_profile ?? current.public_profile),id);
    res.json({ player: db.prepare("SELECT * FROM players WHERE id=?").get(id) });
  } catch(e){ res.status(400).json({error:"Não foi possível salvar. O identificador pode já estar em uso."}); }
});

app.delete("/api/admin/players/:id", requireAdmin, (req,res) => {
  db.prepare("DELETE FROM players WHERE id=?").run(Number(req.params.id));
  res.json({ok:true});
});

app.post("/api/admin/news", requireAdmin, (req,res) => {
  const b=req.body||{};
  if(!String(b.title||"").trim()) return res.status(400).json({error:"Título obrigatório."});
  const info=db.prepare("INSERT INTO news(title,category,excerpt,body,date,published) VALUES (?,?,?,?,?,?)")
    .run(String(b.title),String(b.category||"RPG"),String(b.excerpt||""),String(b.body||""),String(b.date||new Date().toISOString().slice(0,10)),1);
  res.json({news:db.prepare("SELECT * FROM news WHERE id=?").get(info.lastInsertRowid)});
});

app.post("/api/admin/editions", requireAdmin, (req,res) => {
  const b=req.body||{};
  if(!String(b.title||"").trim()) return res.status(400).json({error:"Título obrigatório."});
  const info=db.prepare("INSERT INTO editions(title,edition,description,pdf_url,date,published) VALUES (?,?,?,?,?,?)")
    .run(String(b.title),String(b.edition||""),String(b.description||""),String(b.pdf_url||""),String(b.date||new Date().toISOString().slice(0,10)),1);
  res.json({edition:db.prepare("SELECT * FROM editions WHERE id=?").get(info.lastInsertRowid)});
});

app.post("/api/admin/seed", requireAdmin, (req,res) => {
  const count = db.prepare("SELECT COUNT(*) c FROM players").get().c;
  if(count>0) return res.json({ok:true, seeded:false});
  const seed = [
    ["Mattiel","01","Novachrono","Cavaleiro Mágico Junior","Administrador","",200,400,20660,18,0,1],
    ["Wesyx","02","Novachrono","Cavaleiro Mágico Junior","","",200,400,4000,12,0,2],
    ["Bananinha","03","Mars","Cavaleiro Mágico Junior","","",200,400,560,7,0,15],
    ["Killer","04","Voltia","Cavaleiro Mágico Junior","","",200,400,680,9,0,12]
  ];
  const stmt=db.prepare(`INSERT INTO players(nick,number,identifier,house,patent,role,grimoire,hp,mana,yuls,missions,achievements,ranking) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const tx=db.transaction(()=>seed.forEach(x=>stmt.run(x[0],x[1],`${x[0]}${x[1]}`,x[2],x[3],x[4],x[5],x[6],x[7],x[8],x[9],x[10],x[11])));
  tx();
  db.prepare("INSERT INTO news(title,category,excerpt,body) VALUES (?,?,?,?)").run("O Portal Spade está oficialmente aberto","REINO SPADE","O centro digital do RPG começa uma nova fase.","Esta é a primeira notícia do Portal Spade. Substitua pelo comunicado oficial.");
  db.prepare("INSERT INTO editions(title,edition,description) VALUES (?,?,?)").run("The King Magazine — Setembro 2026","EDIÇÃO 01","A edição de estreia do novo ciclo de Spade.");
  res.json({ok:true,seeded:true});
});

app.get(/.*/, (req,res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", ()=>console.log(`Portal Spade em http://0.0.0.0:${PORT}`));
