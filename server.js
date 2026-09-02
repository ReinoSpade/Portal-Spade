const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || "troque-esta-chave";
const SESSION_SECRET = process.env.SESSION_SECRET || "troque-este-segredo";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL não foi configurada.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

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
  if (!Number.isFinite(Number(id)) || !Number.isFinite(Number(ts))) return null;
  if (Date.now() - Number(ts) > 1000 * 60 * 60 * 24 * 7) return null;
  return Number(id);
}

function publicPlayer(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    nick: row.nick,
    number: row.number,
    identifier: row.identifier,
    house: row.house || "",
    patent: row.patent || "",
    role: row.role || "",
    grimoire: row.grimoire || "",
    hp: Number(row.hp || 0),
    mana: Number(row.mana || 0),
    yuls: Number(row.yuls || 0),
    missions: Number(row.missions || 0),
    achievements: Number(row.achievements || 0),
    ranking: Number(row.ranking || 0)
  };
}

function requireAdmin(req, res, next) {
  if (req.header("x-admin-key") !== ADMIN_KEY) {
    return res.status(401).json({ error: "Acesso administrativo negado." });
  }
  next();
}

function positiveInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id BIGSERIAL PRIMARY KEY,
      nick TEXT NOT NULL,
      number TEXT NOT NULL,
      identifier TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      house TEXT DEFAULT '',
      patent TEXT DEFAULT 'Cavaleiro Mágico Junior',
      role TEXT DEFAULT '',
      grimoire TEXT DEFAULT '',
      hp INTEGER DEFAULT 200 CHECK (hp >= 0),
      mana INTEGER DEFAULT 400 CHECK (mana >= 0),
      yuls BIGINT DEFAULT 0 CHECK (yuls >= 0),
      missions INTEGER DEFAULT 0 CHECK (missions >= 0),
      achievements INTEGER DEFAULT 0 CHECK (achievements >= 0),
      ranking INTEGER DEFAULT 0 CHECK (ranking >= 0),
      public_profile INTEGER DEFAULT 1 CHECK (public_profile IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS news (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'RPG',
      excerpt TEXT DEFAULT '',
      body TEXT DEFAULT '',
      date DATE DEFAULT CURRENT_DATE,
      published INTEGER DEFAULT 1 CHECK (published IN (0,1))
    );

    CREATE TABLE IF NOT EXISTS editions (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      edition TEXT DEFAULT '',
      description TEXT DEFAULT '',
      pdf_url TEXT DEFAULT '',
      date DATE DEFAULT CURRENT_DATE,
      published INTEGER DEFAULT 1 CHECK (published IN (0,1))
    );

    CREATE TABLE IF NOT EXISTS yuls_history (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      amount BIGINT NOT NULL,
      reason TEXT DEFAULT '',
      balance_after BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS missions (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      mission_type TEXT DEFAULT 'Missão',
      mission_rank TEXT DEFAULT '',
      status TEXT DEFAULT 'Concluída',
      reward_yuls BIGINT DEFAULT 0 CHECK (reward_yuls >= 0),
      notes TEXT DEFAULT '',
      completed_at DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS houses (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      emblem TEXT DEFAULT '♜',
      description TEXT DEFAULT '',
      leader TEXT DEFAULT '',
      vice_leader TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_players_identifier ON players(identifier);
    CREATE INDEX IF NOT EXISTS idx_players_nick ON players(nick);
    CREATE INDEX IF NOT EXISTS idx_yuls_history_player ON yuls_history(player_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_missions_player ON missions(player_id, id DESC);
  `);


  const defaultHouses = [
    "Casa Mars",
    "Casa Voltia",
    "Casa Kruger",
    "Casa Whomalt",
    "Casa Faust",
    "Casa Vermillion",
    "Casa Silvamillion",
    "Casa Silva",
    "Casa Mariella"
  ];
  for (const name of defaultHouses) {
    await pool.query(
      `INSERT INTO houses(name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [name]
    );
  }

  const newsCount = await pool.query("SELECT COUNT(*)::int AS c FROM news");
  if (newsCount.rows[0].c === 0) {
    await pool.query(
      `INSERT INTO news(title,category,excerpt,body) VALUES ($1,$2,$3,$4)`,
      [
        "O Portal Spade está oficialmente aberto",
        "REINO SPADE",
        "O centro digital do RPG começa uma nova fase.",
        "Esta é uma notícia inicial de teste. Substitua pelo comunicado oficial."
      ]
    );
  }
  const editionCount = await pool.query("SELECT COUNT(*)::int AS c FROM editions");
  if (editionCount.rows[0].c === 0) {
    await pool.query(
      `INSERT INTO editions(title,edition,description) VALUES ($1,$2,$3)`,
      ["The King Magazine — Setembro 2026", "EDIÇÃO 01", "A edição de estreia do novo ciclo de Spade."]
    );
  }
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (e) {
    console.error(e);
    res.status(503).json({ ok: false, database: "error" });
  }
});

app.post("/api/login", async (req, res) => {
  const identifier = String(req.body.identifier || "").trim();
  const password = String(req.body.password || "");
  if (!identifier) return res.status(400).json({ error: "Informe seu login." });
  if (!password) return res.status(400).json({ error: "Informe sua senha." });

  try {
    const result = await pool.query(
      "SELECT * FROM players WHERE lower(identifier)=lower($1) AND public_profile=1 LIMIT 1",
      [identifier]
    );
    const player = result.rows[0];
    if (!player) return res.status(401).json({ error: "Login ou senha incorretos." });
    if (!player.password_hash) {
      return res.status(403).json({ error: "Sua senha ainda não foi cadastrada. Procure a administração do RPG." });
    }

    const valid = await bcrypt.compare(password, player.password_hash);
    if (!valid) return res.status(401).json({ error: "Login ou senha incorretos." });

    res.cookie("spade_player", makePlayerToken(Number(player.id)), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7
    });
    res.json({ player: publicPlayer(player) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao realizar login." });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("spade_player");
  res.json({ ok: true });
});

app.get("/api/me", async (req, res) => {
  const id = readPlayerToken(req);
  if (!id) return res.status(401).json({ error: "Não autenticado." });
  try {
    const result = await pool.query("SELECT * FROM players WHERE id=$1", [id]);
    const player = result.rows[0];
    if (!player) return res.status(401).json({ error: "Sessão inválida." });
    res.json({ player: publicPlayer(player) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar perfil." });
  }
});

app.get("/api/me/yuls-history", async (req, res) => {
  const id = readPlayerToken(req);
  if (!id) return res.status(401).json({ error: "Não autenticado." });
  try {
    const [playerResult, historyResult] = await Promise.all([
      pool.query("SELECT yuls FROM players WHERE id=$1", [id]),
      pool.query(
        `SELECT id,amount,reason,balance_after,created_at
         FROM yuls_history WHERE player_id=$1 ORDER BY id DESC LIMIT 50`,
        [id]
      )
    ]);
    const player = playerResult.rows[0];
    if (!player) return res.status(401).json({ error: "Sessão inválida." });
    res.json({
      balance: Number(player.yuls || 0),
      history: historyResult.rows.map(h => ({
        id: Number(h.id),
        amount: Number(h.amount),
        reason: h.reason || "",
        balance_after: Number(h.balance_after),
        created_at: h.created_at
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar histórico de Yuls." });
  }
});

app.get("/api/me/missions", async (req, res) => {
  const id = readPlayerToken(req);
  if (!id) return res.status(401).json({ error: "Não autenticado." });
  try {
    const result = await pool.query(
      `SELECT id,title,mission_type,mission_rank,status,reward_yuls,notes,completed_at,created_at
       FROM missions WHERE player_id=$1 ORDER BY id DESC LIMIT 100`,
      [id]
    );
    res.json({ missions: result.rows.map(m => ({
      id:Number(m.id), title:m.title, mission_type:m.mission_type||"", mission_rank:m.mission_rank||"",
      status:m.status||"", reward_yuls:Number(m.reward_yuls||0), notes:m.notes||"", completed_at:m.completed_at, created_at:m.created_at
    })) });
  } catch (e) {
    console.error(e); res.status(500).json({ error:"Erro ao carregar missões." });
  }
});

app.get("/api/home", async (req, res) => {
  try {
    const [news, editions, houses, ranking] = await Promise.all([
      pool.query("SELECT id,title,category,excerpt,date FROM news WHERE published=1 ORDER BY id DESC LIMIT 6"),
      pool.query("SELECT id,title,edition,description,pdf_url,date FROM editions WHERE published=1 ORDER BY id DESC LIMIT 6"),
      pool.query(`SELECT h.id,h.name,h.emblem,h.description,h.leader,h.vice_leader,
                         COUNT(p.id)::int AS count,
                         COALESCE(SUM(p.missions),0)::bigint AS missions
                  FROM houses h
                  LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name))
                  GROUP BY h.id
                  ORDER BY missions DESC, h.name ASC
                  LIMIT 20`),
      pool.query(`SELECT nick,identifier,house,missions,ranking
                  FROM players WHERE ranking>0 ORDER BY ranking ASC LIMIT 10`)
    ]);
    res.json({
      news: news.rows,
      editions: editions.rows,
      houses: houses.rows.map(x => ({ ...x, count: Number(x.count), missions: Number(x.missions) })),
      ranking: ranking.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar o portal." });
  }
});


app.get("/api/houses", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.id,h.name,h.emblem,h.description,h.leader,h.vice_leader,
              COUNT(p.id)::int AS count,
              COALESCE(SUM(p.missions),0)::bigint AS missions,
              COALESCE(SUM(p.yuls),0)::bigint AS yuls
       FROM houses h
       LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name)) AND p.public_profile=1
       GROUP BY h.id
       ORDER BY missions DESC,h.name ASC`
    );
    res.json({
      houses: result.rows.map(h => ({
        id: Number(h.id),
        name: h.name,
        emblem: h.emblem || "♜",
        description: h.description || "",
        leader: h.leader || "",
        vice_leader: h.vice_leader || "",
        count: Number(h.count),
        missions: Number(h.missions),
        yuls: Number(h.yuls)
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar Casas." });
  }
});

app.get("/api/houses/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Casa inválida." });

  try {
    const houseResult = await pool.query("SELECT * FROM houses WHERE id=$1", [id]);
    const house = houseResult.rows[0];
    if (!house) return res.status(404).json({ error: "Casa não encontrada." });

    const members = await pool.query(
      `SELECT id,nick,number,identifier,patent,role,grimoire,missions,yuls,ranking
       FROM players
       WHERE public_profile=1 AND lower(trim(house))=lower(trim($1))
       ORDER BY missions DESC,nick COLLATE "C" ASC`,
      [house.name]
    );

    const totals = members.rows.reduce((acc, p) => {
      acc.missions += Number(p.missions || 0);
      acc.yuls += Number(p.yuls || 0);
      return acc;
    }, { missions: 0, yuls: 0 });

    res.json({
      house: {
        id: Number(house.id),
        name: house.name,
        emblem: house.emblem || "♜",
        description: house.description || "",
        leader: house.leader || "",
        vice_leader: house.vice_leader || "",
        count: members.rows.length,
        missions: totals.missions,
        yuls: totals.yuls,
        members: members.rows.map(p => ({
          id: Number(p.id),
          nick: p.nick,
          number: p.number,
          identifier: p.identifier,
          patent: p.patent || "",
          role: p.role || "",
          grimoire: p.grimoire || "",
          missions: Number(p.missions || 0),
          yuls: Number(p.yuls || 0),
          ranking: Number(p.ranking || 0)
        }))
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar Casa." });
  }
});

app.get("/api/ranking", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT nick,identifier,house,missions,yuls,ranking
       FROM players WHERE ranking>0 ORDER BY ranking ASC LIMIT 75`
    );
    res.json({
      ranking: result.rows.map(x => ({
        ...x, yuls: Number(x.yuls), missions: Number(x.missions), ranking: Number(x.ranking)
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar ranking." });
  }
});

app.get("/api/players", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,nick,number,identifier,house,patent,role,grimoire,missions,achievements,ranking,yuls
       FROM players WHERE public_profile=1 ORDER BY nick COLLATE "C" ASC`
    );
    res.json({ players: result.rows.map(publicPlayer) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar jogadores." });
  }
});

app.get("/api/admin/overview", requireAdmin, async (req, res) => {
  try {
    const [players, houses, news, editions, yuls, withoutPassword] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS c FROM players"),
      pool.query("SELECT COUNT(DISTINCT house)::int AS c FROM players WHERE house<>''"),
      pool.query("SELECT COUNT(*)::int AS c FROM news WHERE published=1"),
      pool.query("SELECT COUNT(*)::int AS c FROM editions WHERE published=1"),
      pool.query("SELECT COALESCE(SUM(yuls),0)::bigint AS s FROM players"),
      pool.query("SELECT COUNT(*)::int AS c FROM players WHERE password_hash=''")
    ]);
    res.json({
      players: players.rows[0].c,
      houses: houses.rows[0].c,
      news: news.rows[0].c,
      editions: editions.rows[0].c,
      yuls: Number(yuls.rows[0].s),
      withoutPassword: withoutPassword.rows[0].c
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar administração." });
  }
});


app.get("/api/admin/houses", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.id,h.name,h.emblem,h.description,h.leader,h.vice_leader,
              COUNT(p.id)::int AS count,
              COALESCE(SUM(p.missions),0)::bigint AS missions,
              COALESCE(SUM(p.yuls),0)::bigint AS yuls
       FROM houses h
       LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name))
       GROUP BY h.id
       ORDER BY h.name COLLATE "C" ASC`
    );
    res.json({ houses: result.rows.map(h => ({
      id:Number(h.id), name:h.name, emblem:h.emblem||"♜",
      description:h.description||"", leader:h.leader||"", vice_leader:h.vice_leader||"",
      count:Number(h.count), missions:Number(h.missions), yuls:Number(h.yuls)
    }))});
  } catch(e) {
    console.error(e);
    res.status(500).json({error:"Erro ao carregar Casas administrativas."});
  }
});

app.post("/api/admin/houses", requireAdmin, async (req, res) => {
  const b=req.body||{};
  const name=String(b.name||"").trim();
  if(!name) return res.status(400).json({error:"Nome da Casa é obrigatório."});
  try {
    const result=await pool.query(
      `INSERT INTO houses(name,emblem,description,leader,vice_leader)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name,String(b.emblem||"♜").trim()||"♜",String(b.description||"").trim(),
       String(b.leader||"").trim(),String(b.vice_leader||"").trim()]
    );
    res.json({house:result.rows[0]});
  } catch(e) {
    console.error(e);
    if(e.code==="23505") return res.status(400).json({error:"Essa Casa já existe."});
    res.status(500).json({error:"Erro ao criar Casa."});
  }
});

app.put("/api/admin/houses/:id", requireAdmin, async (req,res) => {
  const id=Number(req.params.id), b=req.body||{};
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:"Casa inválida."});
  const name=String(b.name||"").trim();
  if(!name) return res.status(400).json({error:"Nome da Casa é obrigatório."});
  try {
    const current=await pool.query("SELECT * FROM houses WHERE id=$1",[id]);
    if(!current.rows[0]) return res.status(404).json({error:"Casa não encontrada."});
    const oldName=current.rows[0].name;
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const result=await client.query(
        `UPDATE houses
         SET name=$1,emblem=$2,description=$3,leader=$4,vice_leader=$5,updated_at=NOW()
         WHERE id=$6 RETURNING *`,
        [name,String(b.emblem||"♜").trim()||"♜",String(b.description||"").trim(),
         String(b.leader||"").trim(),String(b.vice_leader||"").trim(),id]
      );
      if(oldName.toLowerCase()!==name.toLowerCase()){
        await client.query(
          `UPDATE players SET house=$1,updated_at=NOW()
           WHERE lower(trim(house))=lower(trim($2))`,
          [name,oldName]
        );
      }
      await client.query("COMMIT");
      res.json({house:result.rows[0]});
    } catch(e) {
      await client.query("ROLLBACK");
      throw e;
    } finally { client.release(); }
  } catch(e) {
    console.error(e);
    if(e.code==="23505") return res.status(400).json({error:"Essa Casa já existe."});
    res.status(500).json({error:"Erro ao atualizar Casa."});
  }
});

app.delete("/api/admin/houses/:id", requireAdmin, async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:"Casa inválida."});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await client.query("SELECT name FROM houses WHERE id=$1",[id]);
    const house=result.rows[0];
    if(!house){await client.query("ROLLBACK");return res.status(404).json({error:"Casa não encontrada."});}
    await client.query("UPDATE players SET house='' , updated_at=NOW() WHERE lower(trim(house))=lower(trim($1))",[house.name]);
    await client.query("DELETE FROM houses WHERE id=$1",[id]);
    await client.query("COMMIT");
    res.json({ok:true});
  } catch(e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({error:"Erro ao excluir Casa."});
  } finally { client.release(); }
});

app.get("/api/admin/players", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY nick COLLATE \"C\" ASC");
    res.json({
      players: result.rows.map(r => ({
        ...publicPlayer(r),
        public_profile: Number(r.public_profile),
        has_password: Boolean(r.password_hash),
        created_at: r.created_at,
        updated_at: r.updated_at
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar jogadores administrativos." });
  }
});

app.get("/api/admin/players/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Jogador inválido." });
  try {
    const [playerResult, historyResult] = await Promise.all([
      pool.query("SELECT * FROM players WHERE id=$1", [id]),
      pool.query(
        `SELECT id,amount,reason,balance_after,created_at
         FROM yuls_history WHERE player_id=$1 ORDER BY id DESC LIMIT 30`,
        [id]
      )
    ]);
    const player = playerResult.rows[0];
    if (!player) return res.status(404).json({ error: "Jogador não encontrado." });
    res.json({
      player: {
        ...publicPlayer(player),
        public_profile: Number(player.public_profile),
        has_password: Boolean(player.password_hash),
        created_at: player.created_at,
        updated_at: player.updated_at
      },
      history: historyResult.rows.map(h => ({
        ...h, amount: Number(h.amount), balance_after: Number(h.balance_after)
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar jogador." });
  }
});

app.get("/api/admin/players/:id/missions", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Jogador inválido." });
  try {
    const result = await pool.query(
      `SELECT id,title,mission_type,mission_rank,status,reward_yuls,notes,completed_at,created_at
       FROM missions WHERE player_id=$1 ORDER BY id DESC LIMIT 100`, [id]
    );
    res.json({ missions: result.rows.map(m => ({
      id:Number(m.id), title:m.title, mission_type:m.mission_type||"", mission_rank:m.mission_rank||"",
      status:m.status||"", reward_yuls:Number(m.reward_yuls||0), notes:m.notes||"", completed_at:m.completed_at, created_at:m.created_at
    })) });
  } catch (e) {
    console.error(e); res.status(500).json({ error:"Erro ao carregar histórico de missões." });
  }
});

app.post("/api/admin/players/:id/missions", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const title = String(b.title||"").trim();
  const missionType = String(b.mission_type||"Missão").trim();
  const missionRank = String(b.mission_rank||"").trim();
  const status = String(b.status||"Concluída").trim();
  const rewardYuls = Math.max(0, Math.round(Number(b.reward_yuls||0)));
  const notes = String(b.notes||"").trim();
  const completedAt = String(b.completed_at || new Date().toISOString().slice(0,10)).trim();

  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({error:"Jogador inválido."});
  if (!title) return res.status(400).json({error:"Informe o nome da missão."});
  if (!['Concluída','Falha','Cancelada','Em andamento'].includes(status)) return res.status(400).json({error:"Status inválido."});
  if (!Number.isFinite(rewardYuls) || rewardYuls < 0) return res.status(400).json({error:"Recompensa inválida."});

  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const pr=await client.query('SELECT * FROM players WHERE id=$1 FOR UPDATE',[id]);
    const player=pr.rows[0];
    if(!player){await client.query('ROLLBACK');return res.status(404).json({error:'Jogador não encontrado.'});}

    const mr=await client.query(
      `INSERT INTO missions(player_id,title,mission_type,mission_rank,status,reward_yuls,notes,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id,title,missionType,missionRank,status,rewardYuls,notes,completedAt]
    );

    let newMissionCount=Number(player.missions||0);
    let newYuls=Number(player.yuls||0);
    if(status==='Concluída'){
      newMissionCount+=1;
      newYuls+=rewardYuls;
      await client.query('UPDATE players SET missions=$1,yuls=$2,updated_at=NOW() WHERE id=$3',[newMissionCount,newYuls,id]);
      if(rewardYuls>0){
        await client.query(
          `INSERT INTO yuls_history(player_id,amount,reason,balance_after) VALUES ($1,$2,$3,$4)`,
          [id,rewardYuls,`Recompensa da missão: ${title}`,newYuls]
        );
      }
    }

    await client.query('COMMIT');
    const updated=await pool.query('SELECT * FROM players WHERE id=$1',[id]);
    res.json({player:publicPlayer(updated.rows[0]),mission:mr.rows[0]});
  } catch(e) {
    await client.query('ROLLBACK'); console.error(e); res.status(500).json({error:'Erro ao registrar missão.'});
  } finally { client.release(); }
});

app.delete("/api/admin/missions/:id", requireAdmin, async (req, res) => {
  const missionId=Number(req.params.id);
  if(!Number.isInteger(missionId)||missionId<=0) return res.status(400).json({error:'Missão inválida.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const mr=await client.query('SELECT * FROM missions WHERE id=$1 FOR UPDATE',[missionId]);
    const mission=mr.rows[0];
    if(!mission){await client.query('ROLLBACK');return res.status(404).json({error:'Missão não encontrada.'});}
    if(mission.status==='Concluída'){
      const pr=await client.query('SELECT * FROM players WHERE id=$1 FOR UPDATE',[mission.player_id]);
      const player=pr.rows[0];
      if(player){
        const newMissionCount=Math.max(0,Number(player.missions||0)-1);
        const newYuls=Math.max(0,Number(player.yuls||0)-Number(mission.reward_yuls||0));
        await client.query('UPDATE players SET missions=$1,yuls=$2,updated_at=NOW() WHERE id=$3',[newMissionCount,newYuls,mission.player_id]);
      }
    }
    await client.query('DELETE FROM missions WHERE id=$1',[missionId]);
    await client.query('COMMIT');
    res.json({ok:true});
  } catch(e) {
    await client.query('ROLLBACK'); console.error(e); res.status(500).json({error:'Erro ao excluir missão.'});
  } finally { client.release(); }
});

async function validateNewPassword(password) {
  const value = String(password || "");
  if (value.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  if (value.length > 100) throw new Error("A senha é muito longa.");
  return bcrypt.hash(value, 12);
}

app.post("/api/admin/players", requireAdmin, async (req, res) => {
  const b = req.body || {};
  const nick = String(b.nick || "").trim();
  const number = String(b.number || "").trim();
  const password = String(b.password || "");

  if (!nick || !number || !/^\d+$/.test(number)) {
    return res.status(400).json({ error: "Nick e número são obrigatórios." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Defina uma senha com pelo menos 6 caracteres." });
  }

  const identifier = `${nick}${number}`;
  try {
    const passwordHash = await validateNewPassword(password);
    const result = await pool.query(
      `INSERT INTO players
       (nick,number,identifier,password_hash,house,patent,role,grimoire,hp,mana,yuls,missions,achievements,ranking,public_profile)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        nick, number, identifier, passwordHash,
        String(b.house || ""), String(b.patent || "Cavaleiro Mágico Junior"),
        String(b.role || ""), String(b.grimoire || ""),
        positiveInt(b.hp, 200), positiveInt(b.mana, 400), positiveInt(b.yuls, 0),
        positiveInt(b.missions, 0), positiveInt(b.achievements, 0), positiveInt(b.ranking, 0),
        Number(b.public_profile ?? 1) ? 1 : 0
      ]
    );
    const player = result.rows[0];
    if (Number(player.yuls) !== 0) {
      await pool.query(
        `INSERT INTO yuls_history(player_id,amount,reason,balance_after)
         VALUES ($1,$2,$3,$4)`,
        [player.id, Number(player.yuls), "Saldo inicial", Number(player.yuls)]
      );
    }
    res.json({ player: { ...publicPlayer(player), public_profile: Number(player.public_profile), has_password: true } });
  } catch (e) {
    console.error(e);
    if (e.code === "23505") return res.status(400).json({ error: "Não foi possível criar. O identificador já existe." });
    if (e.message?.includes("Senha")) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: "Erro ao criar jogador." });
  }
});

app.put("/api/admin/players/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Jogador inválido." });
  const b = req.body || {};
  const currentResult = await pool.query("SELECT * FROM players WHERE id=$1", [id]);
  const current = currentResult.rows[0];
  if (!current) return res.status(404).json({ error: "Jogador não encontrado." });

  const nick = String(b.nick ?? current.nick).trim();
  const number = String(b.number ?? current.number).trim();
  if (!nick || !number || !/^\d+$/.test(number)) {
    return res.status(400).json({ error: "Nick e número são obrigatórios." });
  }

  let passwordHash = current.password_hash || "";
  if (String(b.password || "").length > 0) {
    if (String(b.password).length < 6) {
      return res.status(400).json({ error: "A nova senha precisa ter pelo menos 6 caracteres." });
    }
    passwordHash = await bcrypt.hash(String(b.password), 12);
  }

  const newYuls = positiveInt(b.yuls, Number(current.yuls));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE players
       SET nick=$1, number=$2, identifier=$3, password_hash=$4, house=$5, patent=$6, role=$7, grimoire=$8,
           hp=$9, mana=$10, yuls=$11, missions=$12, achievements=$13, ranking=$14,
           public_profile=$15, updated_at=NOW()
       WHERE id=$16
       RETURNING *`,
      [
        nick, number, `${nick}${number}`, passwordHash,
        String(b.house ?? current.house ?? ""),
        String(b.patent ?? current.patent ?? ""),
        String(b.role ?? current.role ?? ""),
        String(b.grimoire ?? current.grimoire ?? ""),
        positiveInt(b.hp, Number(current.hp)),
        positiveInt(b.mana, Number(current.mana)),
        newYuls,
        positiveInt(b.missions, Number(current.missions)),
        positiveInt(b.achievements, Number(current.achievements)),
        positiveInt(b.ranking, Number(current.ranking)),
        Number(b.public_profile ?? current.public_profile) ? 1 : 0,
        id
      ]
    );
    const updated = result.rows[0];
    const diff = newYuls - Number(current.yuls);
    if (diff !== 0) {
      await client.query(
        `INSERT INTO yuls_history(player_id,amount,reason,balance_after)
         VALUES ($1,$2,$3,$4)`,
        [id, diff, String(b.yuls_reason || "Ajuste administrativo"), newYuls]
      );
    }
    await client.query("COMMIT");
    res.json({
      player: {
        ...publicPlayer(updated),
        public_profile: Number(updated.public_profile),
        has_password: Boolean(updated.password_hash)
      }
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    if (e.code === "23505") return res.status(400).json({ error: "Não foi possível salvar. O identificador já está em uso." });
    res.status(500).json({ error: "Erro ao atualizar jogador." });
  } finally {
    client.release();
  }
});

app.post("/api/admin/players/:id/yuls", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const amount = Math.round(Number(req.body?.amount || 0));
  const reason = String(req.body?.reason || "Movimentação administrativa").trim();
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Jogador inválido." });
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: "Informe uma quantidade diferente de zero." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT yuls FROM players WHERE id=$1 FOR UPDATE", [id]);
    const player = result.rows[0];
    if (!player) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Jogador não encontrado." });
    }

    const newBalance = Number(player.yuls) + amount;
    if (newBalance < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "O saldo de Yuls não pode ficar negativo." });
    }

    await client.query("UPDATE players SET yuls=$1,updated_at=NOW() WHERE id=$2", [newBalance, id]);
    await client.query(
      `INSERT INTO yuls_history(player_id,amount,reason,balance_after)
       VALUES ($1,$2,$3,$4)`,
      [id, amount, reason, newBalance]
    );
    await client.query("COMMIT");

    const updated = await pool.query("SELECT * FROM players WHERE id=$1", [id]);
    res.json({ player: publicPlayer(updated.rows[0]) });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Erro ao lançar movimentação de Yuls." });
  } finally {
    client.release();
  }
});

app.delete("/api/admin/players/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Jogador inválido." });
  try {
    await pool.query("DELETE FROM players WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao excluir jogador." });
  }
});

app.post("/api/admin/news", requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || "").trim()) return res.status(400).json({ error: "Título obrigatório." });
  try {
    const result = await pool.query(
      `INSERT INTO news(title,category,excerpt,body,date,published) VALUES ($1,$2,$3,$4,$5,1) RETURNING *`,
      [
        String(b.title), String(b.category || "RPG"), String(b.excerpt || ""),
        String(b.body || ""), String(b.date || new Date().toISOString().slice(0, 10))
      ]
    );
    res.json({ news: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao publicar notícia." });
  }
});

app.post("/api/admin/editions", requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || "").trim()) return res.status(400).json({ error: "Título obrigatório." });
  try {
    const result = await pool.query(
      `INSERT INTO editions(title,edition,description,pdf_url,date,published) VALUES ($1,$2,$3,$4,$5,1) RETURNING *`,
      [
        String(b.title), String(b.edition || ""), String(b.description || ""),
        String(b.pdf_url || ""), String(b.date || new Date().toISOString().slice(0, 10))
      ]
    );
    res.json({ edition: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao publicar edição." });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`Portal Spade conectado ao PostgreSQL na porta ${PORT}`));
  })
  .catch(err => {
    console.error("Falha ao inicializar o banco:", err);
    process.exit(1);
  });
