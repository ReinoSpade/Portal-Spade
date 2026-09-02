const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
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
    id: row.id,
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

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id BIGSERIAL PRIMARY KEY,
      nick TEXT NOT NULL,
      number TEXT NOT NULL,
      identifier TEXT NOT NULL UNIQUE,
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

    CREATE INDEX IF NOT EXISTS idx_players_identifier ON players(identifier);
    CREATE INDEX IF NOT EXISTS idx_players_nick ON players(nick);
    CREATE INDEX IF NOT EXISTS idx_yuls_history_player ON yuls_history(player_id, id DESC);
  `);

  // Helpful first-run content only; never duplicates on later restarts.
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
  if (!identifier || !/\d$/.test(identifier)) {
    return res.status(400).json({ error: "Informe um identificador válido, como Mattiel01." });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM players WHERE lower(identifier)=lower($1) AND public_profile=1 LIMIT 1",
      [identifier]
    );
    const player = result.rows[0];
    if (!player) return res.status(401).json({ error: "Jogador não encontrado. Confira o nick e o número." });

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

app.get("/api/home", async (req, res) => {
  try {
    const [news, editions, houses, ranking] = await Promise.all([
      pool.query("SELECT id,title,category,excerpt,date FROM news WHERE published=1 ORDER BY id DESC LIMIT 6"),
      pool.query("SELECT id,title,edition,description,pdf_url,date FROM editions WHERE published=1 ORDER BY id DESC LIMIT 6"),
      pool.query(`SELECT house, COUNT(*)::int AS count, COALESCE(SUM(missions),0)::bigint AS missions
                  FROM players WHERE house<>'' GROUP BY house ORDER BY missions DESC LIMIT 12`),
      pool.query(`SELECT nick,identifier,house,missions,ranking
                  FROM players WHERE ranking>0 ORDER BY ranking ASC LIMIT 10`)
    ]);
    res.json({
      news: news.rows,
      editions: editions.rows,
      houses: houses.rows.map(x => ({...x, missions: Number(x.missions)})),
      ranking: ranking.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar o portal." });
  }
});

app.get("/api/ranking", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT nick,identifier,house,missions,yuls,ranking
       FROM players WHERE ranking>0 ORDER BY ranking ASC LIMIT 75`
    );
    res.json({ ranking: result.rows.map(x => ({...x, yuls: Number(x.yuls), missions: Number(x.missions), ranking: Number(x.ranking)})) });
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
    const [players, houses, news, editions, yuls] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS c FROM players"),
      pool.query("SELECT COUNT(DISTINCT house)::int AS c FROM players WHERE house<>''"),
      pool.query("SELECT COUNT(*)::int AS c FROM news WHERE published=1"),
      pool.query("SELECT COUNT(*)::int AS c FROM editions WHERE published=1"),
      pool.query("SELECT COALESCE(SUM(yuls),0)::bigint AS s FROM players")
    ]);
    res.json({
      players: players.rows[0].c,
      houses: houses.rows[0].c,
      news: news.rows[0].c,
      editions: editions.rows[0].c,
      yuls: Number(yuls.rows[0].s)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar administração." });
  }
});

app.get("/api/admin/players", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY nick COLLATE \"C\" ASC");
    res.json({ players: result.rows.map(r => ({
      ...publicPlayer(r),
      public_profile: Number(r.public_profile),
      created_at: r.created_at,
      updated_at: r.updated_at
    }))});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar jogadores administrativos." });
  }
});

app.get("/api/admin/players/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({error:"Jogador inválido."});
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
      player: {...publicPlayer(player), public_profile: Number(player.public_profile), created_at: player.created_at, updated_at: player.updated_at},
      history: historyResult.rows.map(h => ({...h, amount:Number(h.amount), balance_after:Number(h.balance_after)}))
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({error:"Erro ao carregar jogador."});
  }
});

app.post("/api/admin/players", requireAdmin, async (req, res) => {
  const b = req.body || {};
  const nick = String(b.nick || "").trim();
  const number = String(b.number || "").trim();
  if (!nick || !number || !/^\d+$/.test(number)) {
    return res.status(400).json({ error: "Nick e número são obrigatórios." });
  }
  const identifier = `${nick}${number}`;
  const values = [
    nick, number, identifier,
    String(b.house || ""), String(b.patent || "Cavaleiro Mágico Junior"),
    String(b.role || ""), String(b.grimoire || ""),
    positiveInt(b.hp,200), positiveInt(b.mana,400), positiveInt(b.yuls,0),
    positiveInt(b.missions,0), positiveInt(b.achievements,0), positiveInt(b.ranking,0),
    Number(b.public_profile ?? 1) ? 1 : 0
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO players
       (nick,number,identifier,house,patent,role,grimoire,hp,mana,yuls,missions,achievements,ranking,public_profile)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      values
    );
    const player = result.rows[0];
    if (Number(player.yuls) !== 0) {
      await client.query(
        `INSERT INTO yuls_history(player_id,amount,reason,balance_after)
         VALUES ($1,$2,$3,$4)`,
        [player.id, Number(player.yuls), "Saldo inicial", Number(player.yuls)]
      );
    }
    await client.query("COMMIT");
    res.json({ player: {...publicPlayer(player), public_profile:Number(player.public_profile)} });
  } catch(e) {
    await client.query("ROLLBACK");
    console.error(e);
    if (e.code === "23505") return res.status(400).json({error:"Não foi possível criar. O identificador já existe."});
    res.status(500).json({ error:"Erro ao criar jogador." });
  } finally {
    client.release();
  }
});

app.put("/api/admin/players/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({error:"Jogador inválido."});
  const b = req.body || {};
  const currentResult = await pool.query("SELECT * FROM players WHERE id=$1", [id]);
  const current = currentResult.rows[0];
  if (!current) return res.status(404).json({error:"Jogador não encontrado."});

  const nick = String(b.nick ?? current.nick).trim();
  const number = String(b.number ?? current.number).trim();
  if (!nick || !number || !/^\d+$/.test(number)) return res.status(400).json({error:"Nick e número são obrigatórios."});

  const newYuls = positiveInt(b.yuls, Number(current.yuls));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE players
       SET nick=$1, number=$2, identifier=$3, house=$4, patent=$5, role=$6, grimoire=$7,
           hp=$8, mana=$9, yuls=$10, missions=$11, achievements=$12, ranking=$13,
           public_profile=$14, updated_at=NOW()
       WHERE id=$15
       RETURNING *`,
      [
        nick, number, `${nick}${number}`,
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
        [id,diff,String(b.yuls_reason || "Ajuste administrativo"),newYuls]
      );
    }
    await client.query("COMMIT");
    res.json({ player: {...publicPlayer(updated), public_profile:Number(updated.public_profile)} });
  } catch(e) {
    await client.query("ROLLBACK");
    console.error(e);
    if(e.code === "23505") return res.status(400).json({error:"Não foi possível salvar. O identificador já está em uso."});
    res.status(500).json({error:"Erro ao atualizar jogador."});
  } finally {
    client.release();
  }
});

app.post("/api/admin/players/:id/yuls", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const amount = Math.round(Number(req.body?.amount || 0));
  const reason = String(req.body?.reason || "Movimentação administrativa").trim();
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({error:"Jogador inválido."});
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({error:"Informe uma quantidade diferente de zero."});

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT yuls FROM players WHERE id=$1 FOR UPDATE",[id]);
    const player = result.rows[0];
    if(!player) { await client.query("ROLLBACK"); return res.status(404).json({error:"Jogador não encontrado."}); }
    const newBalance = Number(player.yuls) + amount;
    if(newBalance < 0) { await client.query("ROLLBACK"); return res.status(400).json({error:"O saldo de Yuls não pode ficar negativo."}); }

    await client.query("UPDATE players SET yuls=$1,updated_at=NOW() WHERE id=$2",[newBalance,id]);
    await client.query(
      `INSERT INTO yuls_history(player_id,amount,reason,balance_after)
       VALUES ($1,$2,$3,$4)`,
      [id,amount,reason,newBalance]
    );
    await client.query("COMMIT");

    const updated=await pool.query("SELECT * FROM players WHERE id=$1",[id]);
    res.json({player:publicPlayer(updated.rows[0])});
  } catch(e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({error:"Erro ao lançar movimentação de Yuls."});
  } finally {
    client.release();
  }
});

app.delete("/api/admin/players/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({error:"Jogador inválido."});
  try {
    await pool.query("DELETE FROM players WHERE id=$1",[id]);
    res.json({ok:true});
  } catch(e) {
    console.error(e);
    res.status(500).json({error:"Erro ao excluir jogador."});
  }
});

app.post("/api/admin/news", requireAdmin, async (req, res) => {
  const b=req.body||{};
  if(!String(b.title||"").trim()) return res.status(400).json({error:"Título obrigatório."});
  try {
    const result=await pool.query(
      `INSERT INTO news(title,category,excerpt,body,date,published) VALUES ($1,$2,$3,$4,$5,1) RETURNING *`,
      [String(b.title),String(b.category||"RPG"),String(b.excerpt||""),String(b.body||""),String(b.date||new Date().toISOString().slice(0,10))]
    );
    res.json({news:result.rows[0]});
  } catch(e){console.error(e);res.status(500).json({error:"Erro ao publicar notícia."});}
});

app.post("/api/admin/editions", requireAdmin, async (req, res) => {
  const b=req.body||{};
  if(!String(b.title||"").trim()) return res.status(400).json({error:"Título obrigatório."});
  try {
    const result=await pool.query(
      `INSERT INTO editions(title,edition,description,pdf_url,date,published) VALUES ($1,$2,$3,$4,$5,1) RETURNING *`,
      [String(b.title),String(b.edition||""),String(b.description||""),String(b.pdf_url||""),String(b.date||new Date().toISOString().slice(0,10))]
    );
    res.json({edition:result.rows[0]});
  } catch(e){console.error(e);res.status(500).json({error:"Erro ao publicar edição."});}
});

app.post("/api/admin/seed", requireAdmin, async (req, res) => {
  try {
    const countResult=await pool.query("SELECT COUNT(*)::int AS c FROM players");
    if(countResult.rows[0].c>0) return res.json({ok:true,seeded:false});

    const seed=[
      ["Mattiel","01","Novachrono","Senior","Rei","Toxina",1000,2000,0,0,0,0],
      ["Wesyx","02","Novachrono","Cavaleiro Mágico Junior","","",200,400,0,0,0,0],
      ["Bananinha","03","Mars","Cavaleiro Mágico Junior","","",200,400,0,0,0,0],
      ["Killer","04","Voltia","Cavaleiro Mágico Junior","","",200,400,0,0,0,0]
    ];

    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      for(const x of seed){
        await client.query(
          `INSERT INTO players(nick,number,identifier,house,patent,role,grimoire,hp,mana,yuls,missions,achievements,ranking)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [x[0],x[1],`${x[0]}${x[1]}`,x[2],x[3],x[4],x[5],x[6],x[7],x[8],x[9],x[10],x[11]]
        );
      }
      await client.query(
        `INSERT INTO news(title,category,excerpt,body) VALUES ($1,$2,$3,$4)`,
        ["O Portal Spade está oficialmente aberto","REINO SPADE","O centro digital do RPG começa uma nova fase.","Esta é uma notícia inicial de teste. Substitua pelo comunicado oficial."]
      );
      await client.query(
        `INSERT INTO editions(title,edition,description) VALUES ($1,$2,$3)`,
        ["The King Magazine — Setembro 2026","EDIÇÃO 01","A edição de estreia do novo ciclo de Spade."]
      );
      await client.query("COMMIT");
      res.json({ok:true,seeded:true});
    }catch(e){
      await client.query("ROLLBACK");
      throw e;
    }finally{client.release();}
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao criar dados iniciais."});}
});

app.get(/.*/, (req,res) => {
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
