const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const path = require("path");
const { Pool } = require("pg");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || "troque-esta-chave";
const SESSION_SECRET = process.env.SESSION_SECRET || "troque-este-segredo";

const ADMIN_PERMISSION_DEFS = {
  dashboard: "Painel geral",
  players: "Jogadores",
  cards: "Cards",
  missions: "Missões",
  events: "Eventos",
  schedule: "Cronograma",
  houses: "Casas",
  hierarchy: "Cargos & Patentes",
  journal: "Jornal",
  announcements: "Comunicados",
  economy: "Economia / Yuls",
  admin_users: "Administradores",
  audit: "Auditoria",
  reports: "Relatórios",
  settings: "Configurações",
  library: "Biblioteca",
  community: "Comunidade / Status",
  rankings: "Rankings",
  notifications: "Notificações & Alertas"
};
const ALL_ADMIN_PERMISSIONS = Object.fromEntries(Object.keys(ADMIN_PERMISSION_DEFS).map(k => [k, true]));

function adminPermissionForRequest(req) {
  const path = req.path || "";
  if (path === "/me") return null;
  if (path.startsWith("/permissions") || path.startsWith("/admins")) return "admin_users";
  if (path === "/reports") return "reports";
  if (path === "/overview") return "dashboard";
  if (path.startsWith("/players")) {
    if (path.includes("/cards") || path.includes("/cards/")) return "cards";
    if (path.includes("/yuls")) return "economy";
    if (path.includes("/missions")) return "missions";
    if (req.body?.action === "cards") return "cards";
    if (req.body?.action === "yuls") return "economy";
    if (req.body?.action === "missions") return "missions";
    return "players";
  }
  if (path.startsWith("/cards")) return "cards";
  if (path.startsWith("/events")) return "events";
  if (path.startsWith("/event-actions")) return "events";
  if (path.startsWith("/schedule")) return "schedule";
  if (path.startsWith("/houses")) return "houses";
  if (path.startsWith("/hierarchy") || path.startsWith("/patents") || path.startsWith("/roles")) return "hierarchy";
  if (path.startsWith("/articles") || path.startsWith("/editions") || path.startsWith("/news")) return "journal";
  if (path.startsWith("/announcements")) return "announcements";
  if (path.startsWith("/library")) return "library";
  if (path.startsWith("/ranking-battles") || path.startsWith("/ranking-history")) return "rankings";
  if (path.startsWith("/notifications")) return "notifications";
  if (path.startsWith("/missions")) return "missions";
  return "dashboard";
}
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

app.use(express.json({ limit: "2mb" }));
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
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

function makeAdminToken(adminId) {
  const payload = `${adminId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function readAdminToken(req) {
  const token = req.cookies.spade_admin;
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
    ranking: Number(row.ranking || 0),
    power: Number(row.power || 0),
    active: Number(row.active ?? 1),
    exp: Number(row.exp || 0),
    roles: row.roles || []
  };
}

async function resolveAdmin(req) {
  const tokenId = readAdminToken(req);
  if (tokenId) {
    const r = await pool.query("SELECT id,username,display_name,active FROM admin_users WHERE id=$1 AND active=1 LIMIT 1", [tokenId]);
    if (r.rows[0]) return r.rows[0];
  }
  if (req.header("x-admin-key") === ADMIN_KEY) {
    return { id: 0, username: "master-key", display_name: "Chave principal", active: 1, legacy: true };
  }
  return null;
}

async function requireAdmin(req, res, next) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return res.status(401).json({ error: "Acesso administrativo negado." });
    if (admin.legacy) { req.admin = { ...admin, permissions: ALL_ADMIN_PERMISSIONS }; return next(); }
    const perm = adminPermissionForRequest(req);
    if (!perm) {
      const r = await pool.query("SELECT permissions FROM admin_permissions WHERE admin_id=$1 LIMIT 1", [admin.id]);
      req.admin = { ...admin, permissions: r.rows[0]?.permissions || ALL_ADMIN_PERMISSIONS };
      return next();
    }
    const r = await pool.query("SELECT permissions FROM admin_permissions WHERE admin_id=$1 LIMIT 1", [admin.id]);
    const permissions = r.rows[0]?.permissions || ALL_ADMIN_PERMISSIONS;
    if (permissions[perm] !== true) return res.status(403).json({ error: `Seu acesso administrativo não possui permissão para: ${ADMIN_PERMISSION_DEFS[perm] || perm}.` });
    req.admin = { ...admin, permissions };
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Não foi possível validar o acesso administrativo." });
  }
}

function positiveInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

async function initDatabase() {
  // Create all base tables before running any migrations or seed queries.
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
      dracmas BIGINT DEFAULT 0 CHECK (dracmas >= 0),
      missions INTEGER DEFAULT 0 CHECK (missions >= 0),
      achievements INTEGER DEFAULT 0 CHECK (achievements >= 0),
      ranking INTEGER DEFAULT 0 CHECK (ranking >= 0),
      power INTEGER DEFAULT 0 CHECK (power >= 0),
      public_profile INTEGER DEFAULT 1 CHECK (public_profile IN (0,1)),
      active INTEGER DEFAULT 1 CHECK (active IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      active INTEGER DEFAULT 1 CHECK (active IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      last_login TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS admin_permissions (
      admin_id BIGINT PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
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


    CREATE TABLE IF NOT EXISTS articles (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      author TEXT DEFAULT '',
      category TEXT DEFAULT 'RPG',
      excerpt TEXT DEFAULT '',
      body TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      date DATE DEFAULT CURRENT_DATE,
      published INTEGER DEFAULT 1 CHECK (published IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS edition_articles (
      edition_id BIGINT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
      article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      PRIMARY KEY (edition_id, article_id)
    );


    -- Cards are created before Events because event reward tables reference them.
    CREATE TABLE IF NOT EXISTS library_items (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'GERAL',
      description TEXT DEFAULT '',
      content TEXT DEFAULT '',
      url TEXT DEFAULT '',
      icon TEXT DEFAULT '📚',
      published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_library_items_public ON library_items(published,sort_order,id DESC);

    CREATE TABLE IF NOT EXISTS player_statuses (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date),
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(player_id,status_date),
      CHECK (char_length(message) BETWEEN 1 AND 280)
    );

    CREATE TABLE IF NOT EXISTS card_categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cards (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      name_jp TEXT DEFAULT '',
      name_pt TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'Outros',
      category TEXT,
      element_type TEXT NOT NULL DEFAULT 'NAO_ELEMENTAL' CHECK (element_type IN ('ELEMENTAL','NAO_ELEMENTAL')),
      element TEXT DEFAULT '',
      cost_type TEXT NOT NULL DEFAULT 'SEM_CUSTO' CHECK (cost_type IN ('MANA','VIDA','SEM_CUSTO')),
      cost TEXT DEFAULT '',
      power_value INTEGER NOT NULL DEFAULT 0 CHECK (power_value >= 0),
      origin TEXT NOT NULL DEFAULT 'Exclusivo',
      status TEXT NOT NULL DEFAULT 'ATIVO',
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1 CHECK (active IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_cards (
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      card_id BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      acquisition_type TEXT DEFAULT 'OUTRO',
      acquisition_id BIGINT,
      acquisition_name TEXT DEFAULT '',
      acquired_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (player_id, card_id)
    );

    CREATE TABLE IF NOT EXISTS player_card_history (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      card_id BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      acquisition_type TEXT DEFAULT 'OUTRO',
      acquisition_id BIGINT,
      acquisition_name TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'JOGO',
      description TEXT DEFAULT '',
      rules TEXT DEFAULT '',
      start_date DATE,
      end_date DATE,
      status TEXT NOT NULL DEFAULT 'PLANEJADO',
      image_url TEXT DEFAULT '',
      featured INTEGER DEFAULT 0 CHECK (featured IN (0,1)),
      published INTEGER DEFAULT 1 CHECK (published IN (0,1)),
      yuls_reward BIGINT DEFAULT 0 CHECK (yuls_reward >= 0),
      exp_reward BIGINT DEFAULT 0 CHECK (exp_reward >= 0),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS event_participants (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (event_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS event_actions (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      points INTEGER NOT NULL DEFAULT 0 CHECK (points > 0),
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1 CHECK (active IN (0,1)),
      UNIQUE(event_id,name)
    );

    CREATE TABLE IF NOT EXISTS event_action_history (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      action_id BIGINT NOT NULL REFERENCES event_actions(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      points INTEGER NOT NULL CHECK (points > 0),
      note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS event_points (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (event_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS event_card_rewards (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      card_id BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      points_cost INTEGER DEFAULT 0 CHECK (points_cost >= 0),
      description TEXT DEFAULT '',
      active INTEGER DEFAULT 1 CHECK (active IN (0,1)),
      PRIMARY KEY (event_id, card_id)
    );

    CREATE TABLE IF NOT EXISTS event_reward_history (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      reward_type TEXT NOT NULL,
      card_id BIGINT REFERENCES cards(id) ON DELETE SET NULL,
      points_spent INTEGER DEFAULT 0,
      yuls BIGINT DEFAULT 0,
      exp BIGINT DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS event_results (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      slot TEXT NOT NULL,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      reward_yuls BIGINT DEFAULT 0 CHECK (reward_yuls >= 0),
      reward_exp BIGINT DEFAULT 0 CHECK (reward_exp >= 0),
      published INTEGER DEFAULT 0 CHECK (published IN (0,1)),
      reward_applied INTEGER DEFAULT 0 CHECK (reward_applied IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(event_id,slot),
      UNIQUE(event_id,player_id)
    );

    CREATE TABLE IF NOT EXISTS schedule_activities (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      activity_type TEXT DEFAULT 'ATIVIDADE',
      description TEXT DEFAULT '',
      activity_date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      location TEXT DEFAULT '',
      link TEXT DEFAULT '',
      event_id BIGINT REFERENCES events(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'AGENDADA',
      featured INTEGER DEFAULT 0 CHECK (featured IN (0,1)),
      published INTEGER DEFAULT 1 CHECK (published IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS yuls_history (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      amount BIGINT NOT NULL,
      reason TEXT DEFAULT '',
      balance_after BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS economy_transactions (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      currency TEXT NOT NULL CHECK (currency IN ('YULS','DRACMAS')),
      amount BIGINT NOT NULL CHECK (amount <> 0),
      reason TEXT NOT NULL DEFAULT '',
      source_type TEXT DEFAULT 'ADMINISTRATIVO',
      source_id BIGINT,
      status TEXT NOT NULL DEFAULT 'AGUARDANDO_APROVACAO' CHECK (status IN ('AGUARDANDO_APROVACAO','APROVADA_AGUARDANDO_PAGAMENTO','PAGA','ESTORNADA','REJEITADA')),
      activity_date DATE DEFAULT CURRENT_DATE,
      approval_date TIMESTAMPTZ,
      payment_date TIMESTAMPTZ,
      reversed_at TIMESTAMPTZ,
      created_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      approved_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      paid_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      reversed_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_economy_transactions_player ON economy_transactions(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_economy_transactions_status ON economy_transactions(status, created_at DESC);

    ALTER TABLE players ADD COLUMN IF NOT EXISTS dracmas BIGINT DEFAULT 0;

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

    CREATE TABLE IF NOT EXISTS mission_activities (
      id BIGSERIAL PRIMARY KEY,
      mission_type TEXT NOT NULL DEFAULT 'Luta',
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      description TEXT DEFAULT '',
      instructions TEXT DEFAULT '',
      reward_yuls BIGINT DEFAULT 0 CHECK (reward_yuls >= 0),
      reward_exp BIGINT DEFAULT 0 CHECK (reward_exp >= 0),
      reward_cards TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'AGENDADA',
      published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
      created_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (end_at > start_at)
    );

    CREATE INDEX IF NOT EXISTS idx_mission_activities_dates ON mission_activities(start_at,end_at,status);

    CREATE TABLE IF NOT EXISTS houses (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      emblem TEXT DEFAULT '♜',
      description TEXT DEFAULT '',
      leader TEXT DEFAULT '',
      vice_leader TEXT DEFAULT '',
      motto TEXT DEFAULT '',
      color TEXT DEFAULT '',
      banner_url TEXT DEFAULT '',
      history TEXT DEFAULT '',
      goals TEXT DEFAULT '',
      achievements TEXT DEFAULT '',
      status TEXT DEFAULT 'ATIVA',
      active INTEGER DEFAULT 1 CHECK (active IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS house_history (
      id BIGSERIAL PRIMARY KEY,
      house_id BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL DEFAULT 'REGISTRO',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      event_date DATE DEFAULT CURRENT_DATE,
      created_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_house_history_house_date ON house_history(house_id,event_date DESC,id DESC);

    ALTER TABLE houses ADD COLUMN IF NOT EXISTS motto TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS history TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS goals TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS achievements TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVA';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1;

    CREATE TABLE IF NOT EXISTS house_history (
      id BIGSERIAL PRIMARY KEY, house_id BIGINT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL DEFAULT 'REGISTRO', title TEXT NOT NULL, description TEXT DEFAULT '',
      event_date DATE DEFAULT CURRENT_DATE, created_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_house_history_house_date ON house_history(house_id,event_date DESC,id DESC);

    CREATE TABLE IF NOT EXISTS patents (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS role_ranks (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      requirements TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS roles (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      salary BIGINT DEFAULT 0 CHECK (salary >= 0),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_roles (
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (player_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS player_notifications (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'INFORMATIVO' CHECK (type IN ('URGENTE','IMPORTANTE','INFORMATIVO','SISTEMA')),
      link_page TEXT DEFAULT '',
      read_at TIMESTAMPTZ,
      created_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'INFORMATIVO',
      priority TEXT DEFAULT 'INFORMATIVO',
      body TEXT DEFAULT '',
      date DATE DEFAULT CURRENT_DATE,
      featured INTEGER DEFAULT 0 CHECK (featured IN (0,1)),
      published INTEGER DEFAULT 1 CHECK (published IN (0,1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_admin_history (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ranking_battles (
      id BIGSERIAL PRIMARY KEY,
      ranking_type TEXT NOT NULL CHECK (ranking_type IN ('SC','VT')),
      challenger_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      opponent_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      winner_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
      result TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (result IN ('PENDENTE','CHALLENGER','OPPONENT','EMPATE')),
      status TEXT NOT NULL DEFAULT 'AGUARDANDO_OPONENTE' CHECK (status IN ('AGUARDANDO_OPONENTE','AGUARDANDO_ADMIN','APROVADA','REJEITADA')),
      proof_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      challenger_score_before INTEGER NOT NULL DEFAULT 0,
      opponent_score_before INTEGER NOT NULL DEFAULT 0,
      challenger_score_after INTEGER,
      opponent_score_after INTEGER,
      confirmed_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      approved_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      rejected_reason TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (challenger_id <> opponent_id)
    );

    CREATE TABLE IF NOT EXISTS ranking_history (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      ranking_type TEXT NOT NULL CHECK (ranking_type IN ('SC','VT')),
      battle_id BIGINT REFERENCES ranking_battles(id) ON DELETE SET NULL,
      score_before INTEGER NOT NULL DEFAULT 0,
      score_after INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );


  `);

  // Add columns introduced in later versions to existing installations.
  await pool.query(`
    ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
    ALTER TABLE players ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1 CHECK (active IN (0,1));
    ALTER TABLE players ADD COLUMN IF NOT EXISTS power INTEGER NOT NULL DEFAULT 0 CHECK (power >= 0);
    ALTER TABLE players ADD COLUMN IF NOT EXISTS skill_sc INTEGER NOT NULL DEFAULT 0 CHECK (skill_sc >= 0);
    ALTER TABLE players ADD COLUMN IF NOT EXISTS skill_vt INTEGER NOT NULL DEFAULT 0 CHECK (skill_vt >= 0);
    ALTER TABLE news ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
    ALTER TABLE editions ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT '';

    ALTER TABLE players ADD COLUMN IF NOT EXISTS exp BIGINT NOT NULL DEFAULT 0 CHECK (exp >= 0);
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS rank_code TEXT DEFAULT 'V';
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS vacancies TEXT DEFAULT '';
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT '';
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS remuneration_detail TEXT DEFAULT '';
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS requirements TEXT DEFAULT '';
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS benefits TEXT DEFAULT '';
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT '';
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1 CHECK (active IN (0,1));
      `);
  await pool.query(`
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS name_jp TEXT DEFAULT '';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS name_pt TEXT DEFAULT '';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS element_type TEXT DEFAULT 'NAO_ELEMENTAL';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS element TEXT DEFAULT '';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS cost_type TEXT DEFAULT 'SEM_CUSTO';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS power_value INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'Exclusivo';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVO';
    ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS acquisition_type TEXT DEFAULT 'OUTRO';
    ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS acquisition_id BIGINT;
    ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS acquisition_name TEXT DEFAULT '';
    ALTER TABLE player_card_history ADD COLUMN IF NOT EXISTS acquisition_type TEXT DEFAULT 'OUTRO';
    ALTER TABLE player_card_history ADD COLUMN IF NOT EXISTS acquisition_id BIGINT;
    ALTER TABLE player_card_history ADD COLUMN IF NOT EXISTS acquisition_name TEXT DEFAULT '';
    ALTER TABLE player_card_history ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
  `);

  await pool.query(`
    UPDATE cards
    SET category=COALESCE(NULLIF(category,''),type,'Outros'),
        name_pt=COALESCE(NULLIF(name_pt,''),name),
        status=COALESCE(NULLIF(status,''),'ATIVO'),
        origin=COALESCE(NULLIF(origin,''),'Exclusivo'),
        element_type=COALESCE(NULLIF(element_type,''),'NAO_ELEMENTAL'),
        cost_type=COALESCE(NULLIF(cost_type,''),'SEM_CUSTO')
    WHERE COALESCE(category,'')='';

    UPDATE cards SET name_pt=COALESCE(NULLIF(name_pt,''),name) WHERE COALESCE(name_pt,'')='';

    UPDATE player_cards
    SET quantity=1
    WHERE quantity<>1;
  `);

  // Indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_players_identifier ON players(identifier);
    CREATE INDEX IF NOT EXISTS idx_players_nick ON players(nick);
    CREATE INDEX IF NOT EXISTS idx_yuls_history_player ON yuls_history(player_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_player_roles_role ON player_roles(role_id);
    CREATE INDEX IF NOT EXISTS idx_missions_player ON missions(player_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_announcements_public ON announcements(published, featured, id DESC);
    CREATE INDEX IF NOT EXISTS idx_player_admin_history ON player_admin_history(player_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ranking_battles_status ON ranking_battles(status, ranking_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ranking_battles_players ON ranking_battles(challenger_id, opponent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ranking_history_player ON ranking_history(player_id, ranking_type, id DESC);
    CREATE INDEX IF NOT EXISTS idx_player_notifications_player ON player_notifications(player_id, read_at, id DESC);
    CREATE INDEX IF NOT EXISTS idx_player_cards_player ON player_cards(player_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_player_statuses_date ON player_statuses(status_date DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_player_statuses_player ON player_statuses(player_id,status_date DESC);

    CREATE TABLE IF NOT EXISTS status_reactions (
      id BIGSERIAL PRIMARY KEY,
      status_id BIGINT NOT NULL REFERENCES player_statuses(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL DEFAULT '❤️',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(status_id,player_id,reaction)
    );
    CREATE INDEX IF NOT EXISTS idx_status_reactions_status ON status_reactions(status_id);

    CREATE TABLE IF NOT EXISTS status_comments (
      id BIGSERIAL PRIMARY KEY,
      status_id BIGINT NOT NULL REFERENCES player_statuses(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (char_length(message) BETWEEN 1 AND 280)
    );
    CREATE INDEX IF NOT EXISTS idx_status_comments_status ON status_comments(status_id,created_at);

    CREATE INDEX IF NOT EXISTS idx_player_cards_card ON player_cards(card_id);
    CREATE INDEX IF NOT EXISTS idx_player_card_history_player ON player_card_history(player_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_player_card_history_card ON player_card_history(card_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type, sort_order, name);
    CREATE INDEX IF NOT EXISTS idx_cards_category ON cards(category, sort_order, name);
    CREATE INDEX IF NOT EXISTS idx_roles_rank ON roles(rank_code, sort_order, name);
    CREATE INDEX IF NOT EXISTS idx_role_ranks_order ON role_ranks(sort_order, code);
    CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_edition_articles_edition ON edition_articles(edition_id, sort_order, article_id);
    CREATE INDEX IF NOT EXISTS idx_edition_articles_article ON edition_articles(article_id);
    CREATE INDEX IF NOT EXISTS idx_events_public ON events(published,status,featured,id DESC);
    CREATE INDEX IF NOT EXISTS idx_event_participants_player ON event_participants(player_id,event_id);
    CREATE INDEX IF NOT EXISTS idx_event_actions_event ON event_actions(event_id,sort_order,id);
    CREATE INDEX IF NOT EXISTS idx_event_action_history_player ON event_action_history(player_id,id DESC);
    CREATE INDEX IF NOT EXISTS idx_event_points_player ON event_points(player_id,event_id);
    CREATE INDEX IF NOT EXISTS idx_event_rewards_player ON event_reward_history(player_id,id DESC);
    CREATE INDEX IF NOT EXISTS idx_event_results_event ON event_results(event_id,slot);
    CREATE INDEX IF NOT EXISTS idx_event_results_player ON event_results(player_id,id DESC);
    CREATE INDEX IF NOT EXISTS idx_schedule_public ON schedule_activities(published,activity_date,start_time,id);
    CREATE INDEX IF NOT EXISTS idx_schedule_event ON schedule_activities(event_id);
    ALTER TABLE schedule_activities ADD COLUMN IF NOT EXISTS mission_id BIGINT REFERENCES mission_activities(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_schedule_mission ON schedule_activities(mission_id);

  `);

  // Migrate the old single-role field to the multiple-role relationship.
  await pool.query(`
    INSERT INTO player_roles(player_id, role_id)
    SELECT p.id, r.id
    FROM players p
    JOIN roles r ON lower(trim(p.role))=lower(trim(r.name))
    LEFT JOIN player_roles pr ON pr.player_id=p.id AND pr.role_id=r.id
    WHERE trim(COALESCE(p.role,'')) <> ''
      AND pr.player_id IS NULL
  `);


  const rankDefinitions = [
    ["I","RANK I — ADMINISTRAÇÃO",
     "Cargos de maior responsabilidade, ligados à administração de recursos, informações ou estruturas fundamentais do RPG.",
     "Experiência ou conhecimento equivalente aos requisitos do Rank II e/ou III e pelo menos 60 dias ocupando uma função; elevado domínio dos sistemas e regras; histórico consistente de responsabilidade; alto grau de confiança do Conselho; capacidade de administrar, decidir e coordenar; organização, maturidade e imparcialidade. Ocupação por nomeação ou aprovação do Conselho.",
     1],
    ["II","RANK II — GESTÃO",
     "Cargos responsáveis pela administração e funcionamento de setores específicos do Reino.",
     "Experiência ou conhecimento equivalente aos requisitos do Rank IV e pelo menos 30 dias de experiência prévia ocupando alguma função; amplo domínio das regras; histórico de responsabilidade e confiança; capacidade de administrar atividades, recursos ou informações; autonomia; orientar e supervisionar; organização e registros; solucionar problemas; maturidade. Nomeação mediante aprovação do Conselho com ciência do Parlamento.",
     2],
    ["III","RANK III — COORDENAÇÃO",
     "Cargos destinados à organização, supervisão ou execução de atividades relevantes para o funcionamento do RPG.",
     "Experiência ou conhecimento equivalente aos requisitos do Rank IV e pelo menos 15 dias de experiência em cargo anterior; domínio das regras do setor; organização e regularidade; capacidade de coordenar atividades e solucionar problemas; cumprir prazos e registros; responsabilidade; histórico satisfatório. Nomeação depende de aprovação do Conselho.",
     3],
    ["IV","RANK IV — ESPECIALIZAÇÃO",
     "Cargos que dependem de habilidades específicas para produção ou execução de trabalhos especializados.",
     "Domínio da atividade; conhecimento das regras necessárias; autonomia; regularidade; qualidade compatível; cumprimento dos registros ou procedimentos. O Conselho poderá solicitar avaliação.",
     4],
    ["V","RANK V — OPERACIONAL",
     "Cargos voltados à execução direta de tarefas práticas e atividades operacionais.",
     "Estar ativo no RPG; conhecer as regras básicas; demonstrar disponibilidade; cumprir atividades; manter organização; respeitar orientações do Conselho. Não é exigida experiência anterior.",
     5]
  ];
  for(const rank of rankDefinitions){
    await pool.query(
      `INSERT INTO role_ranks(code,name,description,requirements,sort_order)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(code) DO UPDATE SET
         name=EXCLUDED.name,description=EXCLUDED.description,requirements=EXCLUDED.requirements,
         sort_order=EXCLUDED.sort_order,updated_at=NOW()`,
      rank
    );
  }

  const officialRoles = [
    ["Contador de Yuls","V","até 02 por Reino","Por atualização","150, 50, 04 por atualização (máximo de 02 pagamentos por semana por reino).","Função de atualização das Listas de Yuls e EXP, duas vezes por semana, nos períodos definidos no regulamento.","Card Personalizado “+20 de Vida e +10 Mana” ou “+30 de Vida” ou “+20 de Mana” por Listas sem Atrasos; progressão do bônus prevista.","Reino",1],
    ["Contador de EXP","V","até 02 por Reino","Por atualização","120, 40, 03 por atualização (máximo de 02 pagamentos por semana por reino).","Função de atualização das Listas de Yuls e EXP, duas vezes por semana, nos períodos definidos no regulamento.","Card Personalizado conforme bônus operacional das listas sem atrasos.","Reino",2],
    ["Contador de Saldo das Organizações","V","01 por Reino","Por atualização","175, 60, 05 por atualização (01 pagamento por semana).","Manutenção da Lista de Saldo das Organizações até o fim do sábado.","Card Personalizado conforme bônus operacional de listas sem atrasos.","Reino",3],
    ["Contador de Dracmas","V","01 por Reino","Por atualização","150, 50, 4 por atualização (01 pagamento por semana).","Manutenção das listas de saldo e de Dracmas até o fim do sábado.","Card Personalizado conforme bônus operacional de listas sem atrasos.","Reino",4],
    ["Contador de Ajudas por Luta","V","01 por Reino","Por produção","10, 5 e 1 a cada 10 ajudas contadas.","Contabilizar ajudas enviadas no dia posterior ao fim da missão.","Card Personalizado “+20 de Aumento de Dano” ou “+10 de Redução de Dano” conforme bônus operacional.","Reino",5],
    ["Vendedor de Itens da Loja Mágica","V","01 por Reino","Por semana e produção","100, 30 e 3 por semana + 75 e 15 a cada 5 vendas na mesma semana.","Enviar as fichas de venda no grupo pertinente no momento da venda, observadas as restrições previstas.","Card Personalizado conforme bônus operacional de vendas, entregas e relatórios no prazo.","Reino",6],
    ["Contador de Missões","V","01 por Reino","Por produção","50, 25 e 3 a cada 50 magos em missão + 20 e 10 por andamento com diferença de 2 horas entre si ou a cada 15 magos.","Mínimo de 2 andamentos por dia de missão e entrega do resultado padronizado; missões revezadas entre Reinos.","Card Personalizado conforme bônus operacional de contabilizações/entregas/relatórios no prazo.","Reino",7],
    ["Crupiê/Mestre de Apostas do Cassino","V","04 por Reino","Por abertura e participante","80, 20 e 3 por abertura de jogo + 20 e 10 por pessoa em seu jogo que participe.","Caso fique sem abrir jogos por 15 dias será retirado da função.","Card Personalizado conforme bônus operacional de abertura em todas as edições do cassino no mês.","Reino",8],
    ["Editor de Imagens","V","02 por organização em cada Reino","Por produção","75, 25 e 4 por conjunto de imagens editadas e postadas com aprovação do Conselho (máximo de 02 pagamentos por semana).","Produção e postagem de conjuntos de imagens com aprovação do Conselho.","Card Personalizado conforme bônus operacional aplicável.","Organização",9],

    ["Desenhista","IV","02 por Organização na Forja do Reino e 01 por Organização na Forja Central","Por produção","50, 30, 03 e 01 por card produzido + 10, 5 por cada troca de elemento.","Desenhos submetidos conforme o fluxo e prazos da Forja do Reino/Forja Central.","Card Personalizado “Dreno 20 de Vida e 10 Mana” ou “Dreno de 30 de Vida” ou “Dreno 20 de Mana” conforme o bônus operacional.","Organização",10],
    ["Criador de Imagens e Vídeos","IV","Membros que também exercem a função de Editores de Imagem","Por produção","50, 30, 03 e 01 por imagem produzida e postada no Feed sobre assunto relevante do RPG e aprovada pelo Parlamento.","Solicitações no grupo de divulgação; prazo mínimo de 48 horas para envio.","Card Personalizado conforme regra ³ do bônus operacional.","Organização",11],
    ["Organizador de Eventos","IV","02 por Organização","Por evento e participante","70, 35, 05 e 01 por evento produzido sem reclamações ou indícios de imparcialidade + 10 e 5 a cada 10 participantes devidamente comprovados.","Organizar os eventos distribuídos no planejamento mensal do Reino.","Card Personalizado conforme regra ³ do bônus operacional.","Organização",12],
    ["Jornalistas","IV","02 vagas por organização","Por matéria","75, 25, 03 por matéria pública com correlação ao RPG e aprovada; 50, 15 e 02 por matéria sem correlação e aprovada; 25, 5 e 01 por matéria não aprovada (máximo de 03 pagamentos por semana).","Enviar matérias até o dia anterior à publicação, conforme planejamento do jornal.","Card Personalizado conforme regra ³ do bônus operacional.","Organização",13],
    ["Recuperadores de Card","IV","02 vagas por Reino","Por produção","40, 20 e 1 a cada 20 Cards Recuperados.","Demandas rotativas entre recuperadores e membros dos respectivos Reinos; período de 15 dias para fins de pagamento.","Card Personalizado conforme regra ³ do bônus operacional.","Reino",14],
    ["Juízes de Lutas","IV","De acordo com sua patente","Por atividade","De acordo com a tabela dos juízes.","Aplicação das regras de ajuizamento, estrelas e restrições conforme tipo e complexidade das lutas.","Card Personalizado da regra ⁴ para os 05 com maior quantidade de lutas ajuizadas sem reclamações.","Reino",15],

    ["Coordenador de Forja","III","01 por Reino","Mensal","750, 500 e 25 por mês.","Coordena o setor de Forja e participa do planejamento mensal, sujeito às aprovações previstas.","Cargo privativo a Magos Intermediários ou patentes superiores.","Reino",16],
    ["Coordenador de Divulgação","III","01 por Reino","Mensal","750, 500 e 25 por mês.","Coordena o setor de Divulgação e participa do planejamento mensal, sujeito às aprovações previstas.","Cargo privativo a Magos Intermediários ou patentes superiores.","Reino",17],
    ["Coordenador de Eventos","III","01 por Reino","Mensal","750, 500 e 25 por mês.","Coordena o setor de Eventos e participa do planejamento mensal, sujeito às aprovações previstas.","Cargo privativo a Magos Intermediários ou patentes superiores.","Reino",18],
    ["Coordenador de Jornal","III","01 por Reino","Mensal","750, 500 e 25 por mês.","Coordena o setor de Jornal e participa do planejamento mensal, sujeito às aprovações previstas.","Cargo privativo a Magos Intermediários ou patentes superiores.","Reino",19],
    ["Coordenador de Catalogação de Card’s","III","01 por Reino","Mensal","750, 500 e 25 por mês.","Coordena a Catalogação de Cards e participa do planejamento mensal, sujeito às aprovações previstas.","Cargo privativo a Magos Intermediários ou patentes superiores.","Reino",20],
    ["Coordenador de Ajuizamento","III","01 por Reino","Mensal","750, 500 e 25 por mês.","Coordena o Ajuizamento e participa do planejamento mensal, sujeito às aprovações previstas.","Cargo privativo a Magos Intermediários ou patentes superiores.","Reino",21],
    ["Coordenador de Cassino","III","01 por Reino","Conforme atividade","De acordo com sua atividade e nunca somando rendimentos acima do rendimento base dos Coordenadores.","Coordena o setor de Cassino e participa do planejamento mensal, sujeito às aprovações previstas.","Cargo privativo a Magos Intermediários ou patentes superiores.","Reino",22],

    ["Líder de Casa","II","03 por Casa (01 líder e 02 vice-líderes)","Mensal e por meta","250, 150, 5 por meta batida mensalmente + pagamentos individuais por magos sem organizações participantes de missões, torneios, eventos e treinados.","Liderança da Casa e acompanhamento de metas e participação.","Card Personalizado “Aumento 30 de Vida, Aumento 30 de Mana e Aumento 30 de Dano”; progressão e Card único Rank SS conforme regulamento.","Casa",23],
    ["Dirigente de Organização","II","02 por Organização","Por missão","150, 100 e 4 por missão com todos os membros participantes.","Direção da Organização e acompanhamento das missões com participação dos membros.","Card Personalizado conforme regra ⁶, com progressão e Card único Rank SS após 6 meses consecutivos.","Organização",24],

    ["Administrador de Reino","I","01 por patente, por Reino","Por produção de metas","500, 250 e 10 a cada 100 magos em missão, inscritos em torneio e inscritos em exame.","Administração de recursos, informações ou estruturas importantes do Reino.","Card Personalizado Rank SS caso bata as metas estabelecidas, sem aumento de efeitos e permanente após 03 vezes consecutivas.","Reino",25],
    ["Imperador Supremo","I","01 por patente, por Reino","Por produção de metas","500, 250 e 10 a cada 100 magos em missão, inscritos em torneio e inscritos em exame.","Exercício da autoridade máxima prevista para o cargo no Reino.","Card Personalizado Rank SS caso bata as metas estabelecidas, sem aumento de efeitos e permanente após 03 vezes consecutivas.","Reino",26]
  ];

  for(const role of officialRoles){
    const [name,rank,vacancies,paymentMode,remunerationDetail,responsibilities,benefits,scope,sortOrder]=role;
    const requirements=["III","II","I"].includes(rank)
      ? "Aplicam-se também os requisitos do respectivo Rank; nomeação/aprovação conforme o regulamento."
      : "";
    await pool.query(
      `INSERT INTO roles(name,description,salary,sort_order,rank_code,vacancies,payment_mode,remuneration_detail,requirements,benefits,scope,active)
       VALUES($1,$2,0,$3,$4,$5,$6,$7,$8,$9,$10,1)
       ON CONFLICT(name) DO UPDATE SET
         description=EXCLUDED.description,
         sort_order=EXCLUDED.sort_order,
         rank_code=EXCLUDED.rank_code,
         vacancies=EXCLUDED.vacancies,
         payment_mode=EXCLUDED.payment_mode,
         remuneration_detail=EXCLUDED.remuneration_detail,
         requirements=EXCLUDED.requirements,
         benefits=EXCLUDED.benefits,
         scope=EXCLUDED.scope,
         active=1,
         updated_at=NOW()`,
      [name,responsibilities,sortOrder,rank,vacancies,paymentMode,remunerationDetail,requirements,benefits,scope]
    );
  }

  async function seedDigitalEditionOne(){
    const ed=await pool.query(`SELECT id FROM editions WHERE published=1 ORDER BY id ASC LIMIT 1`);
    if(!ed.rows[0])return;
    const editionId=Number(ed.rows[0].id);
    const articles=[
      ["Editorial — O nascimento de Spade","A primeira página de uma história que ainda está sendo escrita.","Redação The King Magazine","EDITORIAL","Há Reinos que nascem com glórias. Outros nascem com promessas. Spade nasceu com trabalho.",`Quando os primeiros membros chegaram, ainda não havia tradição, prestígio ou história para contar. Havia apenas um Reino novo, Casas começando a criar raízes, Legiões tomando forma e gente disposta — ou curiosa o bastante — a descobrir até onde aquilo poderia chegar.\n\nOs primeiros dias trouxeram aquilo que todo Reino recém-nascido precisa enfrentar: regras, organização, competição, recrutamento, dúvidas e a velha vontade de descobrir quem conseguiria chegar primeiro.\n\nAgora já existem nomes, rivalidades, vitórias, fracassos, cargos, Cards, missões e algumas boas histórias. Esta é a primeira edição. E talvez seja justamente por isso a mais importante.\n\nPorque daqui para frente, tudo o que acontecer terá passado a fazer parte da história de Spade.`],
      ["O nascimento de um Reino","Como Spade começou a ganhar forma.","Redação The King Magazine","HISTÓRIA","Os primeiros dias foram suficientes para mostrar que o novo Reino não pretendia ficar parado.",`Spade começou como começo de todo grande ciclo: pequeno, barulhento e cheio de possibilidades. Antes que a rotina pudesse se instalar, o Reino já organizava missões, exames, eventos, recrutamentos e atividades que colocavam os jogadores diante de escolhas e desafios.\n\nA estrutura surgiu depressa. Casas passaram a reunir seus membros, Legiões começaram a selecionar seus combatentes, e o cronograma deixou de ser apenas uma lista para se tornar uma espécie de relógio do Reino.\n\nO que parecia um conjunto de atividades isoladas rapidamente virou uma comunidade com memória própria.`],
      ["Os primeiros dias","Da Trívia às primeiras grandes provas.","Redação The King Magazine","RETROSPECTIVA","Missões, exames e eventos deram aos primeiros dias de Spade um ritmo que não demorou a acelerar.",`O começo de Spade não teve tempo para ser silencioso. Missões de Trívia, provas de admissão, desafios de Rank, eventos e recrutamentos se sucederam enquanto os jogadores ainda descobriam os caminhos do novo Reino.\n\nFoi nesse período que a participação começou a ganhar peso. Não bastava estar presente: era preciso fazer, disputar, vencer, organizar e aprender.\n\nOs primeiros resultados ainda eram modestos, mas já anunciavam uma característica que acompanharia Spade: o Reino se movimentava quando seus jogadores decidiam se movimentar.`],
      ["As Casas que deram rosto ao Reino","As moradas onde a história começou a se dividir.","Redação The King Magazine","CASAS","Muito antes de existirem números consolidados, existiam bandeiras, nomes e lideranças.",`Cada Casa começou a construir sua própria maneira de existir. Algumas buscaram recrutamento, outras apostaram em atividade, outras encontraram sua força na organização.\n\nEssa diferença é importante. Um Reino pode reunir centenas de nomes, mas são as suas Casas que dão rosto à comunidade. É nelas que surgem rivalidades, alianças, lideranças, erros, recomeços e aquela saudável vontade de provar que a própria bandeira consegue chegar mais longe.\n\nNo Portal, essa história agora pode ser acompanhada por membros, missões, Yuls e outros números. Mas os números contam apenas uma parte dela. O restante está nas pessoas.`],
      ["As Três Legiões","Destruição, Conquista e Extermínio.","Redação The King Magazine","LEGIÕES","Três caminhos diferentes para representar a mesma vontade: conquistar um lugar na história de Spade.",`As Legiões nasceram para organizar forças que não poderiam permanecer dispersas. Destruição, Conquista e Extermínio assumiram identidades próprias e começaram a reunir jogadores ao redor de objetivos diferentes.\n\nO primeiro período de seleção já mostrou que uma Legião não é apenas um nome bonito. Ela exige disciplina, participação, comunicação e, acima de tudo, disposição para trabalhar como grupo.\n\nCom o tempo, as três forças passaram a representar mais do que funções. Tornaram-se parte da identidade do Reino.`],
      ["O primeiro grande torneio","Quando a competição deixou de ser promessa.","Redação The King Magazine","TORNEIO","O primeiro grande torneio colocou os nomes do novo Reino frente a frente.",`Todo Reino precisa de um momento em que a promessa vira competição real. Em Spade, esse momento chegou com o primeiro grande Torneio de Reino.\n\nFases, disputas e resultados deram aos jogadores a oportunidade de descobrir não apenas quem tinha força, mas quem conseguia manter a cabeça no lugar quando a pressão aparecia.\n\nÉ fácil ser promissor quando ninguém está olhando. O torneio serviu para descobrir quem continuava sendo perigoso quando todos estavam olhando.`],
      ["Quando participar passou a valer","Fichas, leilões, recompensas e a economia do Reino.","Redação The King Magazine","ECONOMIA","Em Spade, participar começou a significar progresso — e, em alguns casos, uma boa oportunidade de gastar.",`A criação das Fichas de Participação mudou a relação dos jogadores com as atividades. Eventos, missões, torneios e outras ações passaram a alimentar um sistema em que presença podia se transformar em recurso.\n\nDepois vieram as trocas, os leilões e a circulação de recompensas. A comunidade descobriu rapidamente que uma boa estratégia também podia existir fora da luta.\n\nFoi assim que Spade começou a construir sua própria economia: com atividade, recompensa e aquela inevitável vontade de descobrir o que dava para comprar.`],
      ["O nascimento da imprensa","Antes da primeira edição, já havia gente cobrando pelo jornal.","Redação The King Magazine","JORNAL","O jornal foi anunciado cedo — e a comunidade tratou de lembrar que promessa de jornalista também tem prazo.",`Um Reino que começa a criar história precisa de alguém disposto a registrá-la. Foi assim que a ideia do The King Magazine apareceu ainda nos primeiros movimentos de Spade.\n\nVieram recrutamento, planejamento, cobrança, discussão sobre matérias e, naturalmente, a pergunta inevitável: “cadê o jornal?”.\n\nA imprensa de Spade nasceu, portanto, de uma necessidade simples: se os acontecimentos estavam acontecendo rápido demais, alguém precisava contar essa história antes que a comunidade começasse a esquecer o que tinha acabado de viver.`],
      ["Da Forja à Torre de Grimórios","Criação, treinamento e o desejo de construir mais do que números.","Redação The King Magazine","SISTEMAS","Forja, Grimórios e outras atividades começaram a ampliar o repertório de Spade.",`A história de um Reino não pode depender apenas de combates. Em determinado momento, é preciso criar. A Forja trouxe exatamente essa camada: transformar ideias em objetos, Cards e recursos que passam a fazer parte do próprio universo.\n\nA Torre de Grimórios acrescentou outro símbolo forte. Treinar e descobrir mais sobre a própria magia faz parte da construção do personagem e também da construção do Reino.\n\nEntre uma missão e outra, Spade começou a descobrir que sua história também seria feita por aquilo que os jogadores fossem capazes de criar.`],
      ["Um Reino aprende a se organizar","A administração que nasceu junto com a comunidade.","Redação The King Magazine","ADMINISTRAÇÃO","Quando o Reino cresce, boa vontade deixa de ser suficiente e estrutura passa a ser necessidade.",`Atualizar listas, julgar lutas, coordenar eventos, administrar Casas, cuidar do jornal, organizar Cards e manter os registros em ordem são trabalhos que raramente aparecem na frente do palco — até o dia em que deixam de existir.\n\nFoi dessa necessidade que nasceu uma estrutura administrativa mais clara, com Ranks, funções, responsabilidades e formas de remuneração.\n\nO objetivo não é transformar pessoas em números. É dar nome, responsabilidade e reconhecimento a quem mantém o Reino funcionando quando a maioria só enxerga o resultado.`],
      ["Vozes de Spade","O Reino também é feito pelo que seus jogadores dizem.","Redação The King Magazine","COMUNIDADE","Uma história fica melhor quando aqueles que a vivem também ganham espaço para contar o que pensam.",`Entre anúncios, missões, disputas e cobranças, existe uma camada que nenhum ranking consegue medir: a voz dos jogadores.\n\nÉ nas conversas rápidas, nas comemorações, nas reclamações, nos conselhos e nas piadas que a comunidade revela o que realmente pensa do Reino.\n\nEsta coluna foi criada para isso. Nas próximas edições, o mural de Status do Portal e os registros da comunidade poderão trazer essas vozes para o centro da revista.`],
      ["Dizem por aí...","Porque todo Reino que se preze precisa de um corredor cheio de fofocas.","Redação The King Magazine","FOFOCAS","Há coisas que não aparecem no relatório. Ainda bem.",`Dizem por aí que ninguém lê fofoca até perceber que o próprio nome apareceu nela.\n\nDizem também que alguns jogadores começam dizendo que não se importam com ranking e terminam atualizando a página cinco vezes. Que certas Casas juram que não existe rivalidade alguma — desde que ninguém toque no assunto. E que toda grande reforma administrativa encontra, em algum canto, alguém perguntando: “mas isso vai dar Yuls?”.\n\nA verdade? Talvez metade seja exagero. A outra metade provavelmente estará no próximo comunicado.`],
      ["O próximo capítulo","O primeiro ciclo terminou. A história, não.","Redação The King Magazine","ENCERRAMENTO","A primeira edição registra onde chegamos. O restante ainda está sendo escrito.",`Spade começou há pouco, mas já tem memória. Tem Casas, Legiões, jogadores, histórias, Cards, eventos, missões, conquistas e um calendário cheio de coisas por acontecer.\n\nO Portal agora passa a guardar não apenas números, mas também a narrativa do Reino. O cronograma aponta para o futuro. O Ranking mostra o presente. O Jornal registra aquilo que não podemos deixar desaparecer.\n\nEste foi apenas o primeiro capítulo. O próximo depende de todos nós.`]
    ];
    for(let i=0;i<articles.length;i++){
      const a=articles[i];
      const existing=await pool.query(`SELECT id FROM articles WHERE title=$1 ORDER BY id DESC LIMIT 1`,[a[0]]);
      let articleId;
      if(existing.rows[0]) articleId=Number(existing.rows[0].id);
      else {
        const created=await pool.query(`INSERT INTO articles(title,subtitle,author,category,excerpt,body,date,published) VALUES($1,$2,$3,$4,$5,$6,(NOW() AT TIME ZONE 'America/Sao_Paulo')::date,1) RETURNING id`,a);
        articleId=Number(created.rows[0].id);
      }
      await pool.query(`INSERT INTO edition_articles(edition_id,article_id,sort_order) VALUES($1,$2,$3) ON CONFLICT (edition_id,article_id) DO UPDATE SET sort_order=EXCLUDED.sort_order`,[editionId,articleId,(i+1)*10]);
    }
    await pool.query(`UPDATE editions SET title=CASE WHEN title='' THEN 'The King Magazine — Setembro 2026' ELSE title END, description=CASE WHEN description='' THEN 'A primeira edição digital do The King Magazine: o nascimento de Spade.' ELSE description END WHERE id=$1`,[editionId]);
  }

  await seedDigitalEditionOne();

  const defaultPatents = [
    "Cavaleiro Mágico Junior",
    "Cavaleiro Mágico",
    "Cavaleiro Mágico Sênior",
    "Senior"
  ];
  for (const name of defaultPatents) {
    await pool.query(
      `INSERT INTO patents(name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [name]
    );
  }

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

  const defaultCards = [
    ["Falha Simples 40/00","Falha","40/00","Cancela ataques do oponente conforme as regras do RPG.",10],
    ["Falha Simples 50/00","Falha","50/00","Versão de 50 pontos da Falha Simples.",20],
    ["Falha Ilusão 50/00","Falha","50/00","Falha aplicada contra ilusões.",30],
    ["Fuga Simples 40/00","Fuga","40/00","Fuga simples; não pode ser falhada.",40],
    ["Camuflagem 50/00","Fuga","50/00","Camuflagem para evasão conforme as regras do RPG.",50],
    ["Ataque/Defesa 100/100","Ataque/Defesa","100/100","Ataca e defende simultaneamente.",60],
    ["Barreira com Dano 50 em TC","Barreira","50/00","Barreira que causa 50 de dano em Técnica Comum.",70],
    ["Paralisia Simples","Paralisia","70/70","Paralisa o oponente na rodada seguinte.",80],
    ["Paralisia Falha-Ataque","Paralisia","","Falha ataques e aplica a paralisação conforme as regras.",90],
    ["Paralisia Dano 70/70","Paralisia","70/70","Causa dano e anula técnicas ou magias menores.",100],
    ["Magia Ofensiva 50/50","Magia Ofensiva","50/50","Magia ofensiva de 50 pontos.",110],
    ["Magia Ofensiva 200/200","Magia Ofensiva","200/200","Magia ofensiva de 200 pontos.",120],
    ["Refletivo de Magia Ofensiva a Distância","Magia Ofensiva","40","Reflete Magia Ofensiva a Distância.",130],
    ["Réplica do Reino","Réplica","50","Réplica do Reino; custo de 50.",140],
    ["Réplica Kruger","Réplica","50","Réplica Kruger; causa 50 de dano em Técnica Comum quando aplicada conforme as regras.",150],
    ["Técnica Especial Corporal (TCE)","Técnica","00/130","Técnica Especial Corporal.",160],
    ["Técnica Comum Corporal (TC)","Técnica","00/130","Técnica Comum Corporal.",170],
    ["Técnica Comum a Distância (TD)","Técnica","00/130","Técnica Comum a Distância.",180],
    ["Ativação","Ativação","-10 Mana/rodada","Torna o usuário imune a Técnicas Básicas e Ilusões enquanto ativa.",190]
  ];
  for (const [name,type,cost,description,sort_order] of defaultCards) {
    await pool.query(
      `INSERT INTO cards(name,type,category,name_pt,cost,cost_type,description,sort_order,origin,power_value)
       VALUES ($1,$2,$2,$1,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (name) DO NOTHING`,
      [name,type,cost,cost ? (String(cost).includes('Mana') ? 'MANA' : 'SEM_CUSTO') : 'SEM_CUSTO',description,sort_order,'SC Junior',0]
    );
  }

  const cardCategorySeeds=['Falha','Fuga','Ataque/Defesa','Barreira','Paralisia','Magia Ofensiva','Réplica','Técnica','Ativação','Invocação','Ilusão','Regeneração','Outros'];
  for (let i=0;i<cardCategorySeeds.length;i++) {
    await pool.query(`INSERT INTO card_categories(name,sort_order) VALUES($1,$2) ON CONFLICT(name) DO NOTHING`,[cardCategorySeeds[i],i+1]);
  }

  // The announcements table definitely exists at this point.
  const announcementCount = await pool.query(
    "SELECT COUNT(*)::int AS c FROM announcements"
  );
  if (announcementCount.rows[0].c === 0) {
    await pool.query(
      `INSERT INTO announcements(title,category,priority,body,featured,published)
       VALUES ($1,$2,$3,$4,1,1)`,
      [
        "Bem-vindos ao Portal Spade",
        "REINO SPADE",
        "INFORMATIVO",
        "Este espaço será usado para os comunicados oficiais do Reino."
      ]
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
      [
        "The King Magazine — Setembro 2026",
        "EDIÇÃO 01",
        "A edição de estreia do novo ciclo de Spade."
      ]
    );
  }

  // Bootstrap the first named administrator from environment variables.
  // This keeps the legacy ADMIN_KEY working while providing a normal username/password login.
  const adminUsername = String(process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || ADMIN_KEY || "");
  if (adminUsername && adminPassword) {
    const existingAdmin = await pool.query("SELECT id FROM admin_users WHERE username=$1 LIMIT 1", [adminUsername]);
    if (!existingAdmin.rows[0]) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await pool.query(
        `INSERT INTO admin_users(username,password_hash,display_name,active) VALUES($1,$2,$3,1)`,
        [adminUsername, hash, process.env.ADMIN_DISPLAY_NAME || "Administrador principal"]
      );
    }
  }
  // Every existing administrator starts with full access; permissions can then be restricted.
  const admins = await pool.query("SELECT id FROM admin_users");
  for (const a of admins.rows) {
    await pool.query(`INSERT INTO admin_permissions(admin_id,permissions) VALUES($1,$2::jsonb) ON CONFLICT (admin_id) DO NOTHING`, [a.id, JSON.stringify(ALL_ADMIN_PERMISSIONS)]);
  }
}

app.get("/api/admin/permissions/definitions", requireAdmin, async (req,res)=>{
  res.json({permissions: ADMIN_PERMISSION_DEFS});
});

app.get("/api/admin/permissions/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Administrador inválido."});
  try {
    const r=await pool.query("SELECT permissions FROM admin_permissions WHERE admin_id=$1 LIMIT 1",[id]);
    res.json({permissions:r.rows[0]?.permissions||ALL_ADMIN_PERMISSIONS});
  } catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar permissões."});}
});

app.put("/api/admin/permissions/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Administrador inválido."});
  if(Number(req.admin.id)===id && req.body?.permissions && Object.values(req.body.permissions).some(v=>v===false)) return res.status(400).json({error:"Você não pode remover suas próprias permissões."});
  try {
    const requested=req.body?.permissions||{};
    const permissions={};
    for(const key of Object.keys(ADMIN_PERMISSION_DEFS)) permissions[key]=requested[key]===true;
    const r=await pool.query(`INSERT INTO admin_permissions(admin_id,permissions,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT (admin_id) DO UPDATE SET permissions=EXCLUDED.permissions,updated_at=NOW() RETURNING permissions`,[id,JSON.stringify(permissions)]);
    res.json({permissions:r.rows[0].permissions});
  } catch(e){console.error(e);res.status(500).json({error:"Erro ao salvar permissões."});}
});

app.post("/api/admin/login", async (req,res)=>{
  const username=String(req.body?.username||"").trim().toLowerCase();
  const password=String(req.body?.password||"");
  if(!username||!password)return res.status(400).json({error:"Informe usuário e senha."});
  try{
    const r=await pool.query("SELECT * FROM admin_users WHERE username=$1 AND active=1 LIMIT 1",[username]);
    const admin=r.rows[0];
    if(!admin || !(await bcrypt.compare(password,admin.password_hash))){
      return res.status(401).json({error:"Usuário ou senha administrativos incorretos."});
    }
    await pool.query("UPDATE admin_users SET last_login=NOW(),updated_at=NOW() WHERE id=$1",[admin.id]);
    res.cookie("spade_admin",makeAdminToken(Number(admin.id)),{
      httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:1000*60*60*24*7
    });
    const pr=await pool.query("SELECT permissions FROM admin_permissions WHERE admin_id=$1 LIMIT 1",[admin.id]);
    res.json({admin:{id:Number(admin.id),username:admin.username,display_name:admin.display_name||admin.username,active:true,permissions:pr.rows[0]?.permissions||ALL_ADMIN_PERMISSIONS}});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao realizar login administrativo."});}
});

app.post("/api/admin/logout", (req,res)=>{
  res.clearCookie("spade_admin");
  res.json({ok:true});
});

app.get("/api/admin/me", requireAdmin, async (req,res)=>{
  res.json({admin:{id:Number(req.admin.id),username:req.admin.username,display_name:req.admin.display_name||req.admin.username,active:true,legacy:Boolean(req.admin.legacy),permissions:req.admin.permissions||ALL_ADMIN_PERMISSIONS}});
});

app.get("/api/admin/admins", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(`SELECT a.id,a.username,a.display_name,a.active,a.created_at,a.updated_at,a.last_login,COALESCE(p.permissions,$1::jsonb) AS permissions FROM admin_users a LEFT JOIN admin_permissions p ON p.admin_id=a.id ORDER BY lower(a.username)`,[JSON.stringify(ALL_ADMIN_PERMISSIONS)]);
    res.json({admins:r.rows.map(a=>({...a,id:Number(a.id),active:Boolean(a.active)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar administradores."});}
});

app.post("/api/admin/admins", requireAdmin, async (req,res)=>{
  const username=String(req.body?.username||"").trim().toLowerCase();
  const displayName=String(req.body?.display_name||username).trim();
  const password=String(req.body?.password||"");
  if(!/^[a-z0-9._-]{3,40}$/.test(username))return res.status(400).json({error:"Usuário inválido. Use 3–40 caracteres: letras, números, ponto, hífen ou sublinhado."});
  if(password.length<8)return res.status(400).json({error:"A senha deve ter pelo menos 8 caracteres."});
  try{
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query(`INSERT INTO admin_users(username,password_hash,display_name,active) VALUES($1,$2,$3,1) RETURNING id,username,display_name,active,created_at,last_login`,[username,hash,displayName]);
    await pool.query(`INSERT INTO admin_permissions(admin_id,permissions) VALUES($1,$2::jsonb) ON CONFLICT (admin_id) DO NOTHING`,[r.rows[0].id,JSON.stringify(ALL_ADMIN_PERMISSIONS)]);
    res.json({admin:{...r.rows[0],id:Number(r.rows[0].id),active:Boolean(r.rows[0].active),permissions:ALL_ADMIN_PERMISSIONS}});
  }catch(e){
    if(e.code==="23505")return res.status(409).json({error:"Esse usuário administrativo já existe."});
    console.error(e);res.status(500).json({error:"Erro ao criar administrador."});
  }
});

app.put("/api/admin/admins/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Administrador inválido."});
  const displayName=String(req.body?.display_name||"").trim();
  const hasPassword=Object.prototype.hasOwnProperty.call(req.body||{},"password");
  const password=String(req.body?.password||"");
  const active=req.body?.active===undefined?null:(req.body.active?1:0);
  if(hasPassword && password && password.length<8)return res.status(400).json({error:"A senha deve ter pelo menos 8 caracteres."});
  if(active===0 && Number(req.admin.id)===id)return res.status(400).json({error:"Você não pode desativar o administrador que está usando."});
  try{
    const fields=[];const values=[];let n=1;
    if(displayName){fields.push(`display_name=$${n++}`);values.push(displayName);}
    if(active!==null){fields.push(`active=$${n++}`);values.push(active);}
    if(hasPassword && password){fields.push(`password_hash=$${n++}`);values.push(await bcrypt.hash(password,12));}
    if(!fields.length)return res.status(400).json({error:"Nenhuma alteração informada."});
    fields.push("updated_at=NOW()");values.push(id);
    const r=await pool.query(`UPDATE admin_users SET ${fields.join(",")} WHERE id=$${n} RETURNING id,username,display_name,active,created_at,updated_at,last_login`,values);
    if(!r.rows[0])return res.status(404).json({error:"Administrador não encontrado."});
    res.json({admin:{...r.rows[0],id:Number(r.rows[0].id),active:Boolean(r.rows[0].active)}});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao atualizar administrador."});}
});

app.delete("/api/admin/admins/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Administrador inválido."});
  if(Number(req.admin.id)===id)return res.status(400).json({error:"Você não pode remover seu próprio acesso."});
  try{
    const r=await pool.query("UPDATE admin_users SET active=0,updated_at=NOW() WHERE id=$1 RETURNING id",[id]);
    if(!r.rows[0])return res.status(404).json({error:"Administrador não encontrado."});
    res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao desativar administrador."});}
});

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
      "SELECT * FROM players WHERE (lower(nick)=lower($1) OR lower(identifier)=lower($1)) AND public_profile=1 AND active=1 LIMIT 1",
      [identifier]
    );
    const player = result.rows[0];
    if (!player) return res.status(401).json({ error: "Login ou senha incorretos." });
    if (!player.password_hash) {
      return res.status(403).json({ error: "Sua senha ainda não foi cadastrada. Procure a administração do RPG." });
    }

    const valid = await bcrypt.compare(password, player.password_hash);
    if (!valid) return res.status(401).json({ error: "Login ou senha incorretos." });
    player.roles=await getPlayerRoles(player.id);

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
    const result = await pool.query("SELECT * FROM players WHERE id=$1 AND active=1", [id]);
    const player = result.rows[0];
    if (!player) return res.status(401).json({ error: "Sessão inválida." });
    player.roles=await getPlayerRoles(id);
    res.json({ player: publicPlayer(player) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar perfil." });
  }
});

app.get("/api/me/dashboard", async (req,res)=>{
  const id=readPlayerToken(req);
  if(!id)return res.status(401).json({error:"Não autenticado."});
  try{
    const [playerR, cardsR, rankingsR, activeR, scheduleR, notesR, statusR] = await Promise.all([
      pool.query(`SELECT id,nick,house,patent,grimoire,hp,mana,yuls,missions,achievements,exp,active FROM players WHERE id=$1 AND active=1 LIMIT 1`,[id]),
      pool.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(c.power_value),0)::bigint AS power FROM player_cards pc JOIN cards c ON c.id=pc.card_id WHERE pc.player_id=$1`,[id]),
      pool.query(`WITH powers AS (SELECT p.id,COALESCE(SUM(c.power_value),0)::bigint AS score FROM players p LEFT JOIN player_cards pc ON pc.player_id=p.id LEFT JOIN cards c ON c.id=pc.card_id WHERE p.active=1 AND p.public_profile=1 GROUP BY p.id), sc AS (SELECT id,skill_sc AS score FROM players WHERE active=1 AND public_profile=1), vt AS (SELECT id,skill_vt AS score FROM players WHERE active=1 AND public_profile=1) SELECT (SELECT COUNT(*)+1 FROM powers WHERE score>(SELECT score FROM powers WHERE id=$1))::int AS power_rank,(SELECT COUNT(*)+1 FROM sc WHERE score>(SELECT score FROM sc WHERE id=$1))::int AS sc_rank,(SELECT COUNT(*)+1 FROM vt WHERE score>(SELECT score FROM vt WHERE id=$1))::int AS vt_rank`,[id]),
      pool.query(`SELECT id,title,event_type,status,start_date,end_date FROM events WHERE published=1 AND status='ATIVO' ORDER BY end_date ASC,id ASC LIMIT 4`),
      pool.query(`SELECT s.id,s.title,s.activity_type,s.activity_date,s.start_time,s.end_time,s.status,s.event_id,s.mission_id,e.title AS event_title FROM schedule_activities s LEFT JOIN events e ON e.id=s.event_id WHERE s.published=1 AND s.status NOT IN ('CANCELADA') AND s.activity_date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date ORDER BY s.activity_date ASC,s.start_time ASC NULLS LAST,s.id ASC LIMIT 5`),
      pool.query(`SELECT id,title,body,type,link_page,read_at,created_at FROM player_notifications WHERE player_id=$1 ORDER BY id DESC LIMIT 5`,[id]),
      pool.query(`SELECT id,message,status_date,created_at,updated_at FROM player_statuses WHERE player_id=$1 AND status_date=(NOW() AT TIME ZONE 'America/Sao_Paulo')::date LIMIT 1`,[id])
    ]);
    const player=playerR.rows[0];
    if(!player)return res.status(401).json({error:"Sessão inválida."});
    const roles=await getPlayerRoles(id);
    res.json({
      player:{...publicPlayer({...player,roles})},
      cards:{count:Number(cardsR.rows[0]?.count||0),power:Number(cardsR.rows[0]?.power||0)},
      rankings:{power:Number(rankingsR.rows[0]?.power_rank||0),sc:Number(rankingsR.rows[0]?.sc_rank||0),vt:Number(rankingsR.rows[0]?.vt_rank||0)},
      activeEvents:activeR.rows.map(x=>({id:Number(x.id),title:x.title,event_type:x.event_type||"EVENTO",status:x.status,start_date:x.start_date,end_date:x.end_date})),
      upcoming:scheduleR.rows.map(x=>({id:Number(x.id),title:x.title,activity_type:x.activity_type||"ATIVIDADE",activity_date:x.activity_date,start_time:x.start_time,end_time:x.end_time,status:x.status,event_id:x.event_id?Number(x.event_id):null,mission_id:x.mission_id?Number(x.mission_id):null,event_title:x.event_title||""})),
      notifications:notesR.rows.map(x=>({id:Number(x.id),title:x.title,body:x.body,type:x.type,link_page:x.link_page||"",read:Boolean(x.read_at),created_at:x.created_at})),
      unreadNotifications:notesR.rows.filter(x=>!x.read_at).length,
      todayStatus:statusR.rows[0]?{id:Number(statusR.rows[0].id),message:statusR.rows[0].message,status_date:statusR.rows[0].status_date,created_at:statusR.rows[0].created_at,updated_at:statusR.rows[0].updated_at}:null
    });
  }catch(e){console.error("Erro em /api/me/dashboard:",e);res.status(500).json({error:"Erro ao carregar seu painel."});}
});


function saoPauloTodaySql(){ return "((NOW() AT TIME ZONE 'America/Sao_Paulo')::date)"; }

app.get("/api/me/status/today", async (req,res)=>{
  const playerId=readPlayerToken(req);
  if(!playerId)return res.status(401).json({error:"Não autenticado."});
  try{
    const r=await pool.query(`
      SELECT ps.id,ps.status_date,ps.message,ps.created_at,ps.updated_at,p.nick,p.house
      FROM player_statuses ps
      JOIN players p ON p.id=ps.player_id
      WHERE ps.player_id=$1 AND ps.status_date=${saoPauloTodaySql()}
      LIMIT 1`,[playerId]);
    const x=r.rows[0];
    res.json({status:x?{
      id:Number(x.id),status_date:x.status_date,message:x.message,
      created_at:x.created_at,updated_at:x.updated_at,nick:x.nick,house:x.house||""
    }:null});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar seu status de hoje."});}
});

app.post("/api/me/status", async (req,res)=>{
  const playerId=readPlayerToken(req);
  if(!playerId)return res.status(401).json({error:"Não autenticado."});
  const message=String(req.body?.message||"").trim();
  if(!message)return res.status(400).json({error:"Escreva uma mensagem antes de publicar."});
  if(message.length>280)return res.status(400).json({error:"O status pode ter no máximo 280 caracteres."});
  try{
    const r=await pool.query(`
      INSERT INTO player_statuses(player_id,status_date,message,created_at,updated_at)
      VALUES($1,${saoPauloTodaySql()},$2,NOW(),NOW())
      ON CONFLICT(player_id,status_date)
      DO UPDATE SET message=EXCLUDED.message,updated_at=NOW()
      RETURNING id,status_date,message,created_at,updated_at`,
      [playerId,message]
    );
    const player=await pool.query("SELECT nick,house FROM players WHERE id=$1",[playerId]);
    res.json({status:{...r.rows[0],id:Number(r.rows[0].id),nick:player.rows[0]?.nick||"",house:player.rows[0]?.house||""}});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao publicar seu status."});}
});

app.get("/api/status-board", async (req,res)=>{
  const viewerId=readPlayerToken(req);
  if(!viewerId)return res.status(401).json({error:"Faça login para visualizar o quadro de status."});
  try{
    const days=Math.min(14,Math.max(1,Number(req.query?.days||7)));
    const r=await pool.query(`
      SELECT ps.id,ps.player_id,ps.status_date,ps.message,ps.created_at,ps.updated_at,
             p.nick,p.house,p.patent,p.public_profile,
             COALESCE((SELECT COUNT(*) FROM status_reactions sr WHERE sr.status_id=ps.id),0) AS reaction_count,
             COALESCE((SELECT COUNT(*) FROM status_comments sc WHERE sc.status_id=ps.id),0) AS comment_count,
             EXISTS(SELECT 1 FROM status_reactions sr2 WHERE sr2.status_id=ps.id AND sr2.player_id=$2 AND sr2.reaction='❤️') AS reacted
      FROM player_statuses ps
      JOIN players p ON p.id=ps.player_id
      WHERE ps.status_date >= (${saoPauloTodaySql()} - $1::int) AND COALESCE(p.active,1)=1
      ORDER BY ps.status_date DESC,ps.updated_at DESC,ps.id DESC
      LIMIT 500`,[days-1,viewerId]);
    res.json({statuses:r.rows.map(x=>({
      id:Number(x.id),player_id:Number(x.player_id),status_date:x.status_date,
      message:x.message,created_at:x.created_at,updated_at:x.updated_at,
      nick:x.nick,house:x.house||"",patent:x.patent||"",
      reaction_count:Number(x.reaction_count||0),comment_count:Number(x.comment_count||0),reacted:Boolean(x.reacted),
      mine:Number(x.player_id)===Number(viewerId)
    }))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar quadro de status."});}
});

app.post("/api/status/:id/react", async (req,res)=>{
  const playerId=readPlayerToken(req);
  if(!playerId)return res.status(401).json({error:"Não autenticado."});
  const statusId=Number(req.params.id);
  if(!Number.isFinite(statusId))return res.status(400).json({error:"Status inválido."});
  try{
    const exists=await pool.query("SELECT id FROM player_statuses WHERE id=$1",[statusId]);
    if(!exists.rows[0])return res.status(404).json({error:"Status não encontrado."});
    const q=await pool.query("SELECT id FROM status_reactions WHERE status_id=$1 AND player_id=$2 AND reaction='❤️'",[statusId,playerId]);
    if(q.rows[0]) await pool.query("DELETE FROM status_reactions WHERE id=$1",[q.rows[0].id]);
    else await pool.query("INSERT INTO status_reactions(status_id,player_id,reaction) VALUES($1,$2,'❤️') ON CONFLICT DO NOTHING",[statusId,playerId]);
    const c=await pool.query("SELECT COUNT(*) FROM status_reactions WHERE status_id=$1",[statusId]);
    res.json({reacted:!q.rows[0],count:Number(c.rows[0].count)});
  }catch(e){console.error(e);res.status(500).json({error:"Não foi possível atualizar a reação."});}
});

app.get("/api/status/:id/comments", async (req,res)=>{
  const viewer=readPlayerToken(req);
  if(!viewer)return res.status(401).json({error:"Não autenticado."});
  const statusId=Number(req.params.id);
  try{
    const r=await pool.query(`SELECT sc.id,sc.player_id,sc.message,sc.created_at,p.nick,p.house
      FROM status_comments sc JOIN players p ON p.id=sc.player_id
      WHERE sc.status_id=$1 ORDER BY sc.created_at ASC LIMIT 100`,[statusId]);
    res.json({comments:r.rows.map(x=>({id:Number(x.id),player_id:Number(x.player_id),message:x.message,created_at:x.created_at,nick:x.nick,house:x.house||"",mine:Number(x.player_id)===Number(viewer)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Não foi possível carregar os comentários."});}
});

app.post("/api/status/:id/comments", async (req,res)=>{
  const playerId=readPlayerToken(req);
  if(!playerId)return res.status(401).json({error:"Não autenticado."});
  const statusId=Number(req.params.id);
  const message=String(req.body?.message||"").trim();
  if(!message)return res.status(400).json({error:"Escreva um comentário."});
  if(message.length>280)return res.status(400).json({error:"O comentário pode ter no máximo 280 caracteres."});
  try{
    const r=await pool.query("INSERT INTO status_comments(status_id,player_id,message) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM player_statuses WHERE id=$1) RETURNING id,created_at",[statusId,playerId,message]);
    if(!r.rows[0])return res.status(404).json({error:"Status não encontrado."});
    const p=await pool.query("SELECT nick,house FROM players WHERE id=$1",[playerId]);
    res.json({comment:{id:Number(r.rows[0].id),player_id:playerId,message,created_at:r.rows[0].created_at,nick:p.rows[0]?.nick||"",house:p.rows[0]?.house||"",mine:true}});
  }catch(e){console.error(e);res.status(500).json({error:"Não foi possível publicar o comentário."});}
});


async function applyEconomyTransaction(client, tx, adminId) {
  const player = (await client.query(`SELECT id,yuls,dracmas FROM players WHERE id=$1 FOR UPDATE`, [tx.player_id])).rows[0];
  if (!player) throw Object.assign(new Error("Jogador não encontrado."), {statusCode:404});
  const field = tx.currency === 'DRACMAS' ? 'dracmas' : 'yuls';
  const current = Number(player[field] || 0);
  const next = current + Number(tx.amount);
  if (next < 0) throw Object.assign(new Error(`O saldo de ${tx.currency === 'DRACMAS' ? 'Dracmas' : 'Yuls'} não pode ficar negativo.`), {statusCode:400});
  await client.query(`UPDATE players SET ${field}=$1,updated_at=NOW() WHERE id=$2`, [next, tx.player_id]);
  if (tx.currency === 'YULS') {
    await client.query(`INSERT INTO yuls_history(player_id,amount,reason,balance_after) VALUES($1,$2,$3,$4)`, [tx.player_id, tx.amount, tx.reason || 'Movimentação de Yuls', next]);
  }
  return next;
}

app.get("/api/admin/economy", requireAdmin, async (req,res)=>{
  try {
    const status=String(req.query.status||'').toUpperCase();
    const params=[]; let where='';
    if(['AGUARDANDO_APROVACAO','APROVADA_AGUARDANDO_PAGAMENTO','PAGA','ESTORNADA','REJEITADA'].includes(status)){params.push(status);where='WHERE et.status=$1';}
    const r=await pool.query(`SELECT et.*,p.nick,p.number,p.house,a.display_name AS created_by_name,ap.display_name AS approved_by_name,pp.display_name AS paid_by_name
      FROM economy_transactions et JOIN players p ON p.id=et.player_id
      LEFT JOIN admin_users a ON a.id=et.created_by_admin_id LEFT JOIN admin_users ap ON ap.id=et.approved_by_admin_id LEFT JOIN admin_users pp ON pp.id=et.paid_by_admin_id
      ${where} ORDER BY et.created_at DESC LIMIT 300`,params);
    const totals=await pool.query(`SELECT currency,COALESCE(SUM(amount) FILTER(WHERE status='PAGA'),0)::bigint AS paid,COUNT(*) FILTER(WHERE status IN ('AGUARDANDO_APROVACAO','APROVADA_AGUARDANDO_PAGAMENTO'))::int AS pending FROM economy_transactions GROUP BY currency`);
    res.json({transactions:r.rows.map(x=>({...x,id:Number(x.id),player_id:Number(x.player_id),amount:Number(x.amount),source_id:x.source_id?Number(x.source_id):null})),totals:totals.rows});
  } catch(e){console.error(e);res.status(500).json({error:'Erro ao carregar a economia.'});}
});

app.post("/api/admin/economy/transactions", requireAdmin, async (req,res)=>{
  const b=req.body||{}, playerId=Number(b.player_id), amount=Math.round(Number(b.amount||0));
  const currency=String(b.currency||'YULS').toUpperCase(); const reason=String(b.reason||'').trim();
  if(!Number.isInteger(playerId)||playerId<=0)return res.status(400).json({error:'Jogador inválido.'});
  if(!['YULS','DRACMAS'].includes(currency))return res.status(400).json({error:'Moeda inválida.'});
  if(!Number.isInteger(amount)||amount===0)return res.status(400).json({error:'O valor não pode ser zero.'});
  if(!reason)return res.status(400).json({error:'Informe o motivo da transação.'});
  try{
    const r=await pool.query(`INSERT INTO economy_transactions(player_id,currency,amount,reason,source_type,source_id,status,activity_date,created_by_admin_id) VALUES($1,$2,$3,$4,$5,$6,'AGUARDANDO_APROVACAO',$7,$8) RETURNING *`,[playerId,currency,amount,reason,String(b.source_type||'ADMINISTRATIVO'),b.source_id?Number(b.source_id):null,b.activity_date||new Date().toISOString().slice(0,10),req.admin.id]);
    res.json({ok:true,transaction:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:'Erro ao criar transação.'});}
});

app.post("/api/admin/economy/transactions/:id/approve", requireAdmin, async(req,res)=>{
  const id=Number(req.params.id); if(!Number.isInteger(id))return res.status(400).json({error:'Transação inválida.'});
  try{const r=await pool.query(`UPDATE economy_transactions SET status='APROVADA_AGUARDANDO_PAGAMENTO',approval_date=NOW(),approved_by_admin_id=$1,updated_at=NOW() WHERE id=$2 AND status='AGUARDANDO_APROVACAO' RETURNING *`,[req.admin.id,id]);if(!r.rows[0])return res.status(404).json({error:'Transação não está aguardando aprovação.'});res.json({ok:true});}catch(e){res.status(500).json({error:'Erro ao aprovar transação.'});}
});

app.post("/api/admin/economy/transactions/:id/pay", requireAdmin, async(req,res)=>{
  const id=Number(req.params.id); const client=await pool.connect();
  try{await client.query('BEGIN'); const tx=(await client.query(`SELECT * FROM economy_transactions WHERE id=$1 AND status='APROVADA_AGUARDANDO_PAGAMENTO' FOR UPDATE`,[id])).rows[0]; if(!tx){await client.query('ROLLBACK');return res.status(404).json({error:'Transação não está aguardando pagamento.'});}
    const balance=await applyEconomyTransaction(client,tx,req.admin.id);
    await client.query(`UPDATE economy_transactions SET status='PAGA',payment_date=NOW(),paid_by_admin_id=$1,updated_at=NOW() WHERE id=$2`,[req.admin.id,id]);
    await client.query('COMMIT');res.json({ok:true,balance});
  }catch(e){await client.query('ROLLBACK');console.error(e);res.status(e.statusCode||500).json({error:e.message||'Erro ao efetivar pagamento.'});}finally{client.release();}
});

app.post("/api/admin/economy/transactions/:id/reject", requireAdmin, async(req,res)=>{const id=Number(req.params.id);try{const r=await pool.query(`UPDATE economy_transactions SET status='REJEITADA',updated_at=NOW() WHERE id=$1 AND status IN ('AGUARDANDO_APROVACAO','APROVADA_AGUARDANDO_PAGAMENTO') RETURNING id`,[id]);if(!r.rows[0])return res.status(404).json({error:'Transação não pode ser rejeitada neste estado.'});res.json({ok:true});}catch(e){res.status(500).json({error:'Erro ao rejeitar transação.'});}});

app.post("/api/admin/economy/transactions/:id/reverse", requireAdmin, async(req,res)=>{
  const id=Number(req.params.id), client=await pool.connect();
  try{await client.query('BEGIN');const tx=(await client.query(`SELECT * FROM economy_transactions WHERE id=$1 AND status='PAGA' FOR UPDATE`,[id])).rows[0];if(!tx){await client.query('ROLLBACK');return res.status(404).json({error:'Somente transações pagas podem ser estornadas.'});}
    const reverse={...tx,amount:-Number(tx.amount),reason:`Estorno: ${tx.reason||'Transação'}`}; await applyEconomyTransaction(client,reverse,req.admin.id);
    await client.query(`UPDATE economy_transactions SET status='ESTORNADA',reversed_at=NOW(),reversed_by_admin_id=$1,updated_at=NOW() WHERE id=$2`,[req.admin.id,id]);
    await client.query(`INSERT INTO economy_transactions(player_id,currency,amount,reason,source_type,source_id,status,activity_date,approval_date,payment_date,created_by_admin_id,approved_by_admin_id,paid_by_admin_id) VALUES($1,$2,$3,$4,'ESTORNO',$5,'PAGA',$6,NOW(),NOW(),$7,$7,$7)`,[tx.player_id,tx.currency,-Number(tx.amount),`Estorno: ${tx.reason||'Transação'}`,id,tx.activity_date,req.admin.id]);
    await client.query('COMMIT');res.json({ok:true});
  }catch(e){await client.query('ROLLBACK');console.error(e);res.status(e.statusCode||500).json({error:e.message||'Erro ao estornar.'});}finally{client.release();}
});

app.get("/api/me/yuls-history", async (req, res) => {
  const id = readPlayerToken(req);
  if (!id) return res.status(401).json({ error: "Não autenticado." });
  try {
    const [playerResult, historyResult] = await Promise.all([
      pool.query("SELECT yuls,dracmas FROM players WHERE id=$1", [id]),
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
      dracmas: Number(player.dracmas || 0),
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



app.get("/api/me/events", async (req,res)=>{
  const playerId=readPlayerToken(req);
  if(!playerId)return res.status(401).json({error:"Não autenticado."});
  try{
    const r=await pool.query(`
      SELECT e.id,e.title,e.event_type,e.description,e.start_date,e.end_date,e.status,e.featured,
             COALESCE(points.points,0)::int AS points
      FROM event_participants participant
      JOIN events e ON e.id=participant.event_id
      LEFT JOIN event_points points ON points.event_id=e.id AND points.player_id=$1
      WHERE participant.player_id=$1 AND e.published=1
      ORDER BY CASE e.status WHEN 'ATIVO' THEN 1 WHEN 'PLANEJADO' THEN 2 WHEN 'ENCERRADO' THEN 3 ELSE 4 END,e.id DESC
    `,[playerId]);
    res.json({events:r.rows.map(e=>({...e,id:Number(e.id),points:Number(e.points||0),featured:Boolean(e.featured)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar seus eventos."});}
});

app.get("/api/me/cards", async (req,res)=>{
  const id=readPlayerToken(req);
  if(!id)return res.status(401).json({error:"Não autenticado."});
  try{
    const r=await pool.query(
      `SELECT c.id,c.name,c.name_jp,c.name_pt,COALESCE(c.category,c.type) AS category,c.element_type,c.element,c.cost_type,c.cost,c.power_value,c.origin,c.status,c.description,c.sort_order,
              pc.acquisition_type,pc.acquisition_name,pc.acquisition_id,pc.acquired_at,pc.updated_at
       FROM player_cards pc
       JOIN cards c ON c.id=pc.card_id
       WHERE pc.player_id=$1
       ORDER BY COALESCE(c.category,c.type),c.sort_order,c.name COLLATE "C"`,
      [id]
    );
    res.json({
      cards:r.rows.map(c=>({
        id:Number(c.id),name:c.name,name_pt:c.name_pt||c.name,name_jp:c.name_jp||"",category:c.category||"Outros",element_type:c.element_type||"NAO_ELEMENTAL",element:c.element||"",cost_type:c.cost_type||"SEM_CUSTO",cost:c.cost||"",power_value:Number(c.power_value||0),origin:c.origin||"Exclusivo",status:c.status||"ATIVO",
        description:c.description||"",
        acquisition_type:c.acquisition_type||"OUTRO",
        acquisition_name:c.acquisition_name||"",
        acquisition_id:c.acquisition_id?Number(c.acquisition_id):null,
        acquired_at:c.acquired_at,updated_at:c.updated_at
      }))
    });
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar inventário de cards."});
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

app.get("/api/announcements", async (req,res)=>{
  try{
    const r=await pool.query(
      `SELECT id,title,category,priority,body,date,featured
       FROM announcements
       WHERE published=1
       ORDER BY featured DESC,
         CASE priority WHEN 'URGENTE' THEN 1 WHEN 'IMPORTANTE' THEN 2 ELSE 3 END,
         id DESC
       LIMIT 100`
    );
    res.json({announcements:r.rows.map(a=>({
      id:Number(a.id),title:a.title,category:a.category||"INFORMATIVO",
      priority:a.priority||"INFORMATIVO",body:a.body||"",date:a.date,
      featured:Boolean(a.featured)
    }))});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar comunicados."});
  }
});

app.get("/api/me/alerts", async (req,res)=>{
  const id=readPlayerToken(req);
  if(!id)return res.status(401).json({error:"Não autenticado."});
  try{
    const r=await pool.query(
      `SELECT id,title,category,priority,body,date,featured
       FROM announcements
       WHERE published=1
         AND priority IN ('URGENTE','IMPORTANTE')
       ORDER BY CASE priority WHEN 'URGENTE' THEN 1 WHEN 'IMPORTANTE' THEN 2 ELSE 3 END,
                featured DESC,id DESC
       LIMIT 20`
    );
    res.json({
      alerts:r.rows.map(a=>({
        id:Number(a.id),
        title:a.title,
        category:a.category||"INFORMATIVO",
        priority:a.priority||"INFORMATIVO",
        body:a.body||"",
        date:a.date,
        featured:Boolean(a.featured)
      }))
    });
  }catch(e){
    console.error("Erro em /api/me/alerts:",e);
    res.status(500).json({error:"Erro ao carregar avisos."});
  }
});


app.get("/api/me/notifications", async (req,res)=>{
  const id=readPlayerToken(req); if(!id)return res.status(401).json({error:"Não autenticado."});
  try{
    const r=await pool.query(`SELECT id,title,body,type,link_page,read_at,created_at FROM player_notifications WHERE player_id=$1 ORDER BY id DESC LIMIT 60`,[id]);
    const unread=r.rows.filter(x=>!x.read_at).length;
    res.json({notifications:r.rows.map(x=>({...x,id:Number(x.id),read:Boolean(x.read_at)})),unread});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar notificações."});}
});

app.post("/api/me/notifications/:id/read", async (req,res)=>{
  const playerId=readPlayerToken(req), id=Number(req.params.id); if(!playerId)return res.status(401).json({error:"Não autenticado."});
  try{const r=await pool.query(`UPDATE player_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND player_id=$2 RETURNING id`,[id,playerId]); if(!r.rowCount)return res.status(404).json({error:"Notificação não encontrada."}); res.json({ok:true});}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao marcar notificação."});}
});

app.post("/api/me/notifications/read-all", async (req,res)=>{
  const playerId=readPlayerToken(req); if(!playerId)return res.status(401).json({error:"Não autenticado."});
  try{await pool.query(`UPDATE player_notifications SET read_at=COALESCE(read_at,NOW()) WHERE player_id=$1 AND read_at IS NULL`,[playerId]);res.json({ok:true});}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao marcar notificações."});}
});

app.get("/api/admin/notifications", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(`SELECT n.id,n.title,n.body,n.type,n.link_page,n.created_at,p.id player_id,p.nick,p.house FROM player_notifications n JOIN players p ON p.id=n.player_id ORDER BY n.id DESC LIMIT 200`);
    res.json({notifications:r.rows.map(x=>({...x,id:Number(x.id),player_id:Number(x.player_id)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar notificações administrativas."});}
});

app.post("/api/admin/notifications", requireAdmin, async (req,res)=>{
  const b=req.body||{}, title=String(b.title||'').trim(), body=String(b.body||'').trim(), type=String(b.type||'INFORMATIVO').trim(), link=String(b.link_page||'').trim();
  if(!title)return res.status(400).json({error:"Título obrigatório."});
  if(!['URGENTE','IMPORTANTE','INFORMATIVO','SISTEMA'].includes(type))return res.status(400).json({error:"Tipo inválido."});
  try{
    let ids=[];
    if(b.all_active){ const r=await pool.query(`SELECT id FROM players WHERE active=1 ORDER BY id`); ids=r.rows.map(x=>x.id); }
    else if(Array.isArray(b.player_ids)){ ids=b.player_ids.map(Number).filter(Number.isInteger); }
    else if(b.player_id){ ids=[Number(b.player_id)]; }
    ids=[...new Set(ids)].filter(x=>x>0);
    if(!ids.length)return res.status(400).json({error:"Selecione ao menos um jogador ou marque todos os ativos."});
    const client=await pool.connect(); try{await client.query('BEGIN'); for(const pid of ids){await client.query(`INSERT INTO player_notifications(player_id,title,body,type,link_page,created_by_admin_id) VALUES($1,$2,$3,$4,$5,$6)`,[pid,title,body,type,link,req.admin.id]);} await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e}finally{client.release();}
    res.json({ok:true,sent:ids.length});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao enviar notificações."});}
});

app.get("/api/library", async (req,res)=>{
  try{
    const q=String(req.query.q||'').trim();
    const category=String(req.query.category||'').trim();
    const params=[]; const where=['published=1'];
    if(q){params.push(`%${q}%`); where.push(`(title ILIKE $${params.length} OR category ILIKE $${params.length} OR description ILIKE $${params.length} OR content ILIKE $${params.length})`);}
    if(category){params.push(category); where.push(`category=$${params.length}`);}
    const r=await pool.query(`SELECT id,title,category,description,content,url,icon,sort_order,created_at,updated_at FROM library_items WHERE ${where.join(' AND ')} ORDER BY sort_order ASC,title ASC,id DESC`,params);
    res.json({items:r.rows.map(x=>({...x,id:Number(x.id),sort_order:Number(x.sort_order||0)}))});
  }catch(e){console.error(e);res.status(500).json({error:'Erro ao carregar a Biblioteca.'});}
});

app.get("/api/admin/library", requireAdmin, async (req,res)=>{
  try{const r=await pool.query(`SELECT * FROM library_items ORDER BY sort_order ASC,title ASC,id DESC`);res.json({items:r.rows.map(x=>({...x,id:Number(x.id),sort_order:Number(x.sort_order||0),published:Number(x.published||0)}))});}
  catch(e){console.error(e);res.status(500).json({error:'Erro ao carregar a Biblioteca administrativa.'});}
});
app.post("/api/admin/library", requireAdmin, async (req,res)=>{
  const b=req.body||{}; if(!String(b.title||'').trim())return res.status(400).json({error:'Título obrigatório.'});
  try{const r=await pool.query(`INSERT INTO library_items(title,category,description,content,url,icon,published,sort_order,created_by_admin_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[String(b.title).trim(),String(b.category||'GERAL').trim(),String(b.description||''),String(b.content||''),String(b.url||''),String(b.icon||'📚'),b.published===false||Number(b.published)===0?0:1,positiveInt(b.sort_order,0),req.admin.id||null]);res.json({item:r.rows[0]});}
  catch(e){console.error(e);res.status(500).json({error:'Erro ao cadastrar material.'});}
});
app.put("/api/admin/library/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Material inválido.'}); const b=req.body||{};
  try{const r=await pool.query(`UPDATE library_items SET title=$1,category=$2,description=$3,content=$4,url=$5,icon=$6,published=$7,sort_order=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,[String(b.title||'').trim(),String(b.category||'GERAL').trim(),String(b.description||''),String(b.content||''),String(b.url||''),String(b.icon||'📚'),b.published===false||Number(b.published)===0?0:1,positiveInt(b.sort_order,0),id]);if(!r.rows[0])return res.status(404).json({error:'Material não encontrado.'});res.json({item:r.rows[0]});}
  catch(e){console.error(e);res.status(500).json({error:'Erro ao atualizar material.'});}
});
app.delete("/api/admin/library/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Material inválido.'});
  try{const r=await pool.query(`UPDATE library_items SET published=0,updated_at=NOW() WHERE id=$1 RETURNING id`,[id]);if(!r.rows[0])return res.status(404).json({error:'Material não encontrado.'});res.json({ok:true});}
  catch(e){console.error(e);res.status(500).json({error:'Erro ao arquivar material.'});}
});

app.get("/api/editorial/overview", async (req,res)=>{
  try{
    const [stats,houses,statuses,featuredEvents]=await Promise.all([
      pool.query(`SELECT
        (SELECT COUNT(*) FROM players)::int AS players,
        (SELECT COUNT(*) FROM houses)::int AS houses,
        (SELECT COUNT(*) FROM news WHERE published=1)::int AS news,
        (SELECT COUNT(*) FROM editions WHERE published=1)::int AS editions,
        (SELECT COALESCE(SUM(yuls),0) FROM players)::bigint AS yuls,
        (SELECT COUNT(*) FROM missions)::int AS missions,
        (SELECT COUNT(*) FROM events WHERE published=1)::int AS events,
        (SELECT COUNT(*) FROM cards WHERE active=1)::int AS cards`),
      pool.query(`SELECT h.id,h.name,h.emblem,h.description,COUNT(p.id)::int AS members,
                         COALESCE(SUM(p.missions),0)::int AS missions,COALESCE(SUM(p.yuls),0)::bigint AS yuls
                  FROM houses h LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name))
                  GROUP BY h.id ORDER BY missions DESC,h.name ASC LIMIT 6`),
      pool.query(`SELECT ps.status_date,ps.message,p.nick,p.house,ps.updated_at
                  FROM player_statuses ps JOIN players p ON p.id=ps.player_id
                  WHERE p.public_profile=1 AND ps.status_date >= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 1)
                  ORDER BY ps.status_date DESC,ps.updated_at DESC LIMIT 6`),
      pool.query(`SELECT id,title,event_type,description,start_date,end_date,status,image_url,featured
                  FROM events WHERE published=1 ORDER BY featured DESC,
                  CASE status WHEN 'ATIVO' THEN 1 WHEN 'PLANEJADO' THEN 2 WHEN 'ENCERRADO' THEN 3 ELSE 4 END,
                  start_date NULLS LAST,id DESC LIMIT 3`)
    ]);
    const st=stats.rows[0]||{};
    res.json({
      stats:{players:Number(st.players||0),houses:Number(st.houses||0),news:Number(st.news||0),editions:Number(st.editions||0),
             yuls:Number(st.yuls||0),missions:Number(st.missions||0),events:Number(st.events||0),cards:Number(st.cards||0)},
      houses:houses.rows.map(h=>({id:Number(h.id),name:h.name,emblem:h.emblem||'♜',description:h.description||'',members:Number(h.members||0),missions:Number(h.missions||0),yuls:Number(h.yuls||0)})),
      voices:statuses.rows.map(x=>({date:x.status_date,message:x.message,nick:x.nick,house:x.house||'',updated_at:x.updated_at})),
      featuredEvents:featuredEvents.rows.map(x=>({...x,id:Number(x.id),featured:Boolean(x.featured)}))
    });
  }catch(e){console.error(e);res.status(500).json({error:'Erro ao carregar o material editorial.'})}
});

app.get("/api/journal/editions/:id", async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Edição inválida."});
  try{
    const editionResult=await pool.query(
      `SELECT id,title,edition,description,pdf_url,cover_url,date,published
       FROM editions WHERE id=$1 AND published=1`,[id]
    );
    const edition=editionResult.rows[0];
    if(!edition)return res.status(404).json({error:"Edição não encontrada."});

    const articles=await pool.query(
      `SELECT a.id,a.title,a.subtitle,a.author,a.category,a.excerpt,a.body,a.image_url,a.date,ea.sort_order
       FROM edition_articles ea
       JOIN articles a ON a.id=ea.article_id
       WHERE ea.edition_id=$1 AND a.published=1
       ORDER BY ea.sort_order ASC,a.id ASC`,
      [id]
    );
    res.json({
      edition:{...edition,id:Number(edition.id),published:Number(edition.published)},
      articles:articles.rows.map(a=>({...a,id:Number(a.id),sort_order:Number(a.sort_order||0),published:1}))
    });
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar a edição."});
  }
});

const EVENT_TYPES=["JOGO","ESPECIAL","TEMPORADA","LEGIAO"];
const EVENT_STATUSES=["PLANEJADO","ATIVO","ENCERRADO","CANCELADO"];
const EVENT_REWARD_TYPES=["YULS","EXP","CARD"];
const EVENT_RESULT_SLOTS=["WINNER_1","WINNER_2","WINNER_3","HONOR_1","HONOR_2","HONOR_3"];
const SCHEDULE_STATUSES=["AGENDADA","EM_ANDAMENTO","CONCLUIDA","CANCELADA"];


const MISSION_TYPES=["Luta","Trívia","História","Treinamento","Recrutamento","Outro"];
const MISSION_STATUSES=["AGENDADA","EM_ANDAMENTO","CONCLUIDA","CANCELADA"];

function missionStatusFromDates(startAt,endAt,status){
  if(status==="CANCELADA"||status==="CONCLUIDA") return status;
  const now=Date.now(),s=new Date(startAt).getTime(),e=new Date(endAt).getTime();
  if(now<s) return "AGENDADA";
  if(now<e) return "EM_ANDAMENTO";
  return "CONCLUIDA";
}

app.get("/api/missions", async (req,res)=>{
  const viewer=readPlayerToken(req);
  if(!viewer) return res.status(401).json({error:"Faça login para visualizar as missões."});
  try{
    const r=await pool.query(`SELECT id,mission_type,start_at,end_at,description,instructions,reward_yuls,reward_exp,reward_cards,status,published FROM mission_activities WHERE published=1 ORDER BY start_at DESC,id DESC LIMIT 100`);
    res.json({missions:r.rows.map(m=>({...m,id:Number(m.id),reward_yuls:Number(m.reward_yuls||0),reward_exp:Number(m.reward_exp||0),status:missionStatusFromDates(m.start_at,m.end_at,m.status)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar missões."});}
});

app.get("/api/missions/active", async (req,res)=>{
  const viewer=readPlayerToken(req);
  if(!viewer) return res.status(401).json({active:null});
  try{
    const r=await pool.query(`SELECT id,mission_type,start_at,end_at,description,instructions,reward_yuls,reward_exp,reward_cards,status FROM mission_activities WHERE published=1 AND status<>\'CANCELADA\' AND start_at<=NOW() AND end_at>NOW() ORDER BY end_at ASC,id ASC LIMIT 1`);
    const m=r.rows[0];
    res.json({active:m?{...m,id:Number(m.id),reward_yuls:Number(m.reward_yuls||0),reward_exp:Number(m.reward_exp||0)}:null});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao verificar missão ativa."});}
});

app.get("/api/admin/missions", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(`SELECT id,mission_type,start_at,end_at,description,instructions,reward_yuls,reward_exp,reward_cards,status,published,created_at,updated_at FROM mission_activities ORDER BY start_at DESC,id DESC LIMIT 300`);
    res.json({types:MISSION_TYPES,statuses:MISSION_STATUSES,missions:r.rows.map(m=>({...m,id:Number(m.id),reward_yuls:Number(m.reward_yuls||0),reward_exp:Number(m.reward_exp||0),status:missionStatusFromDates(m.start_at,m.end_at,m.status)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar missões administrativas."});}
});

app.post("/api/admin/missions", requireAdmin, async (req,res)=>{
  const b=req.body||{}; const type=String(b.mission_type||"Luta").trim();
  const start=new Date(b.start_at), end=new Date(b.end_at);
  if(!MISSION_TYPES.includes(type)) return res.status(400).json({error:"Tipo de missão inválido."});
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start) return res.status(400).json({error:"Informe início e encerramento válidos."});
  try{
    const r=await pool.query(`INSERT INTO mission_activities(mission_type,start_at,end_at,description,instructions,reward_yuls,reward_exp,reward_cards,status,published,created_by_admin_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[type,start.toISOString(),end.toISOString(),String(b.description||""),String(b.instructions||""),Math.max(0,Number(b.reward_yuls||0)),Math.max(0,Number(b.reward_exp||0)),String(b.reward_cards||""),String(b.status||"AGENDADA"),b.published===false?0:1,req.admin?.id||null]);
    res.json({mission:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao criar missão."});}
});

app.put("/api/admin/missions/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Missão inválida."});
  const b=req.body||{}; const type=String(b.mission_type||"Luta").trim();
  const start=new Date(b.start_at), end=new Date(b.end_at);
  if(!MISSION_TYPES.includes(type)) return res.status(400).json({error:"Tipo de missão inválido."});
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)return res.status(400).json({error:"Informe início e encerramento válidos."});
  try{
    const r=await pool.query(`UPDATE mission_activities SET mission_type=$1,start_at=$2,end_at=$3,description=$4,instructions=$5,reward_yuls=$6,reward_exp=$7,reward_cards=$8,status=$9,published=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,[type,start.toISOString(),end.toISOString(),String(b.description||""),String(b.instructions||""),Math.max(0,Number(b.reward_yuls||0)),Math.max(0,Number(b.reward_exp||0)),String(b.reward_cards||""),String(b.status||"AGENDADA"),b.published===false?0:1,id]);
    if(!r.rowCount)return res.status(404).json({error:"Missão não encontrada."}); res.json({mission:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao atualizar missão."});}
});

app.delete("/api/admin/missions/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Missão inválida."});
  try{ const r=await pool.query(`UPDATE mission_activities SET status='CANCELADA',published=0,updated_at=NOW() WHERE id=$1 RETURNING id`,[id]); if(!r.rowCount)return res.status(404).json({error:"Missão não encontrada."}); res.json({ok:true}); }
  catch(e){console.error(e);res.status(500).json({error:"Erro ao encerrar missão."});}
});

app.get("/api/events", async (req,res)=>{
  try{
    const r=await pool.query(`
      SELECT e.id,e.title,e.event_type,e.description,e.rules,e.start_date,e.end_date,e.status,
             e.image_url,e.featured
      FROM events e
      WHERE e.published=1
      ORDER BY e.featured DESC,
               CASE e.status WHEN 'ATIVO' THEN 1 WHEN 'PLANEJADO' THEN 2 WHEN 'ENCERRADO' THEN 3 ELSE 4 END,
               e.start_date NULLS LAST,e.id DESC
      LIMIT 100
    `);
    res.json({events:r.rows.map(e=>({
      id:Number(e.id),title:e.title,event_type:e.event_type,description:e.description||"",
      rules:e.rules||"",start_date:e.start_date,end_date:e.end_date,status:e.status,
      image_url:e.image_url||"",featured:Boolean(e.featured)
    }))});
  }catch(e){
    console.error(e);res.status(500).json({error:"Erro ao carregar eventos."});
  }
});

app.get("/api/events/:id", async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Evento inválido."});
  try{
    const er=await pool.query(
      `SELECT id,title,event_type,description,rules,start_date,end_date,status,image_url,featured
       FROM events WHERE id=$1 AND published=1`,[id]
    );
    if(!er.rows[0])return res.status(404).json({error:"Evento não encontrado."});

    const [actions,rewards,results]=await Promise.all([
      pool.query(
        `SELECT id,name,description,points,sort_order
         FROM event_actions WHERE event_id=$1 AND active=1 ORDER BY sort_order,id`,[id]
      ),
      pool.query(
        `SELECT ecr.card_id,ecr.points_cost,ecr.description,c.name,c.category,c.cost
         FROM event_card_rewards ecr
         JOIN cards c ON c.id=ecr.card_id
         WHERE ecr.event_id=$1 AND ecr.active=1
         ORDER BY ecr.points_cost,c.sort_order,c.name COLLATE "C"`,[id]
      ),
      pool.query(
        `SELECT er.slot,er.player_id,p.nick,p.house,p.patent,er.reward_yuls,er.reward_exp,er.published
         FROM event_results er
         JOIN players p ON p.id=er.player_id
         WHERE er.event_id=$1 AND er.published=1
         ORDER BY CASE er.slot
           WHEN 'WINNER_1' THEN 1 WHEN 'WINNER_2' THEN 2 WHEN 'WINNER_3' THEN 3
           WHEN 'HONOR_1' THEN 4 WHEN 'HONOR_2' THEN 5 WHEN 'HONOR_3' THEN 6 ELSE 99 END`,
        [id]
      )
    ]);

    res.json({
      event:{...er.rows[0],id:Number(er.rows[0].id),featured:Boolean(er.rows[0].featured)},
      actions:actions.rows.map(a=>({id:Number(a.id),name:a.name,description:a.description||"",points:Number(a.points),sort_order:Number(a.sort_order||0)})),
      card_rewards:rewards.rows.map(r=>({card_id:Number(r.card_id),points_cost:Number(r.points_cost||0),description:r.description||"",name:r.name,category:r.category||"Outros",cost:r.cost||""})),
      results:results.rows.map(r=>({
        slot:r.slot,player_id:Number(r.player_id),nick:r.nick,house:r.house||"",patent:r.patent||"",
        reward_yuls:r.slot==="WINNER_1"?100:r.slot==="WINNER_2"?80:r.slot==="WINNER_3"?50:0,reward_exp:r.slot.startsWith("WINNER_")?Number(r.reward_exp||0):0,published:Number(r.published)
      }))
    });
  }catch(e){
    console.error(e);res.status(500).json({error:"Erro ao carregar evento."});
  }
});


app.post("/api/me/events/:id/redeem", async (req,res)=>{
  const playerId=readPlayerToken(req),eventId=Number(req.params.id),cardId=Number(req.body?.card_id);
  if(!playerId)return res.status(401).json({error:"Não autenticado."});
  if(!Number.isInteger(eventId)||!Number.isInteger(cardId))return res.status(400).json({error:"Evento ou card inválido."});

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const ev=await client.query(
      `SELECT e.id,e.title,e.event_type,e.status,ep.points
       FROM events e
       JOIN event_points ep ON ep.event_id=e.id AND ep.player_id=$2
       WHERE e.id=$1 FOR UPDATE`,[eventId,playerId]
    );
    if(!ev.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Você não está participando deste evento."});}
    if(ev.rows[0].event_type!=="TEMPORADA"){await client.query("ROLLBACK");return res.status(400).json({error:"Este evento não usa troca por pontos."});}

    const rr=await client.query(
      `SELECT ecr.card_id,ecr.points_cost,c.name,c.category,c.active
       FROM event_card_rewards ecr JOIN cards c ON c.id=ecr.card_id
       WHERE ecr.event_id=$1 AND ecr.card_id=$2 AND ecr.active=1`,[eventId,cardId]
    );
    if(!rr.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Esta recompensa não está disponível."});}
    if(Number(ev.rows[0].points)<Number(rr.rows[0].points_cost)){await client.query("ROLLBACK");return res.status(400).json({error:"Você não possui pontos suficientes."});}

    const owned=await client.query("SELECT 1 FROM player_cards WHERE player_id=$1 AND card_id=$2",[playerId,cardId]);
    if(owned.rows[0]){await client.query("ROLLBACK");return res.status(400).json({error:"Você já possui este card. Cards são únicos."});}

    await client.query(
      `UPDATE event_points SET points=points-$1,updated_at=NOW() WHERE event_id=$2 AND player_id=$3`,
      [Number(rr.rows[0].points_cost),eventId,playerId]
    );
    await client.query(
      `INSERT INTO player_cards(player_id,card_id,quantity,acquisition_type,acquisition_id,acquisition_name,acquired_at,updated_at)
       VALUES($1,$2,1,'EVENTO',$3,$4,NOW(),NOW())`,
      [playerId,cardId,eventId,ev.rows[0].title]
    );
    await client.query(
      `INSERT INTO player_card_history(player_id,card_id,action,acquisition_type,acquisition_id,acquisition_name,notes)
       VALUES($1,$2,'ADQUIRIDO','EVENTO',$3,$4,$5)`,
      [playerId,cardId,eventId,ev.rows[0].title,`Resgate por ${Number(rr.rows[0].points_cost)} pontos.`]
    );
    await client.query(
      `INSERT INTO event_reward_history(event_id,player_id,reward_type,card_id,points_spent,note)
       VALUES($1,$2,'CARD',$3,$4,$5)`,
      [eventId,playerId,cardId,Number(rr.rows[0].points_cost),`Resgate de ${rr.rows[0].name}`]
    );
    await client.query("COMMIT");
    res.json({ok:true,card:{id:Number(rr.rows[0].card_id),name:rr.rows[0].name,category:rr.rows[0].category},points_remaining:Number(ev.rows[0].points)-Number(rr.rows[0].points_cost)});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Erro ao resgatar recompensa."});}
  finally{client.release();}
});


app.get("/api/schedule", async (req,res)=>{
  try{
    const r=await pool.query(`
      SELECT s.id,s.title,s.activity_type,s.description,s.activity_date,s.start_time,s.end_time,
             s.location,s.link,s.event_id,s.mission_id,s.status,s.featured,e.title AS event_title
      FROM schedule_activities s
      LEFT JOIN events e ON e.id=s.event_id
      WHERE s.published=1
      ORDER BY s.activity_date ASC,s.start_time ASC NULLS LAST,s.id ASC
      LIMIT 200
    `);
    res.json({activities:r.rows.map(a=>({
      id:Number(a.id),title:a.title,activity_type:a.activity_type||"ATIVIDADE",
      description:a.description||"",activity_date:a.activity_date,
      start_time:a.start_time,end_time:a.end_time,location:a.location||"",
      link:a.link||"",event_id:a.event_id?Number(a.event_id):null,mission_id:a.mission_id?Number(a.mission_id):null,event_title:a.event_title||"",
      status:a.status||"AGENDADA",featured:Boolean(a.featured)
    }))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar cronograma."});}
});

app.get("/api/active-activities", async (req,res)=>{
  try{
    const r=await pool.query(`
      SELECT s.id,s.title,s.activity_type,s.description,s.activity_date,s.start_time,s.end_time,s.location,s.link,s.status,
             s.event_id,s.mission_id,e.title AS event_title,ma.mission_type,ma.end_at AS mission_end_at
      FROM schedule_activities s
      LEFT JOIN events e ON e.id=s.event_id
      LEFT JOIN mission_activities ma ON ma.id=s.mission_id
      WHERE s.published=1 AND (
        (s.activity_date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AND (s.start_time IS NULL OR s.start_time <= (NOW() AT TIME ZONE 'America/Sao_Paulo')::time) AND (s.end_time IS NULL OR s.end_time >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::time))
        OR s.status='EM_ANDAMENTO'
      )
      ORDER BY s.featured DESC,s.start_time ASC NULLS LAST,s.id ASC LIMIT 20`);
    res.json({activities:r.rows.map(a=>({...a,id:Number(a.id),event_id:a.event_id?Number(a.event_id):null,mission_id:a.mission_id?Number(a.mission_id):null}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar atividades em andamento."});}
});

app.get("/api/roles/:id", async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Cargo inválido."});
  try{
    const r=await pool.query(`
      SELECT r.id,r.name,r.description,r.rank_code,r.vacancies,r.payment_mode,r.remuneration_detail,
             r.requirements,r.benefits,r.scope,rr.name AS rank_name,rr.description AS rank_description,rr.requirements AS rank_requirements
      FROM roles r LEFT JOIN role_ranks rr ON rr.code=r.rank_code
      WHERE r.id=$1 AND r.active=1`,[id]);
    if(!r.rows[0])return res.status(404).json({error:"Cargo não encontrado."});
    const x=r.rows[0];
    res.json({role:{
      id:Number(x.id),name:x.name,description:x.description||"",rank_code:x.rank_code||"",
      rank_name:x.rank_name||"",rank_description:x.rank_description||"",rank_requirements:x.rank_requirements||"",
      vacancies:x.vacancies||"",payment_mode:x.payment_mode||"",remuneration_detail:x.remuneration_detail||"",
      requirements:x.requirements||"",benefits:x.benefits||"",scope:x.scope||""
    }});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar o cargo."});}
});


app.get("/api/search", async (req,res)=>{
  const q=String(req.query.q||"").trim().slice(0,80);
  if(q.length<2)return res.json({query:q,results:[]});
  const like=`%${q.replace(/[%_]/g,"\\$&")}%`;
  const ilike=(idx)=>`(name ILIKE $${idx} OR title ILIKE $${idx} OR description ILIKE $${idx})`;
  try{
    const playerId=readPlayerToken(req);
    const isAdmin=!!(await resolveAdmin(req));
    const cardsAllowed=!!playerId||isAdmin;
    const queries=[
      pool.query(`SELECT id,nick,house,patent FROM players WHERE public_profile=1 AND active=1 AND (nick ILIKE $1 OR house ILIKE $1 OR patent ILIKE $1) ORDER BY nick ASC LIMIT 8`,[like]),
      pool.query(`SELECT id,name,emblem FROM houses WHERE active=1 AND (name ILIKE $1 OR description ILIKE $1 OR motto ILIKE $1) ORDER BY name ASC LIMIT 8`,[like]),
      pool.query(`SELECT id,title,event_type,status,start_date,end_date FROM events WHERE published=1 AND (title ILIKE $1 OR description ILIKE $1 OR event_type ILIKE $1) ORDER BY CASE status WHEN 'ATIVO' THEN 1 WHEN 'PLANEJADO' THEN 2 WHEN 'ENCERRADO' THEN 3 ELSE 4 END,start_date DESC,id DESC LIMIT 8`,[like]),
      pool.query(`SELECT id,mission_type,start_at,end_at,status,description FROM mission_activities WHERE published=1 AND status<>'CANCELADA' AND (mission_type ILIKE $1 OR description ILIKE $1 OR instructions ILIKE $1) ORDER BY start_at DESC,id DESC LIMIT 8`,[like]),
      pool.query(`SELECT id,title,activity_type,activity_date,start_time,end_time,status FROM schedule_activities WHERE published=1 AND (title ILIKE $1 OR activity_type ILIKE $1 OR description ILIKE $1) ORDER BY activity_date DESC,start_time DESC NULLS LAST,id DESC LIMIT 8`,[like]),
      pool.query(`SELECT id,title,subtitle,category,excerpt,date FROM articles WHERE published=1 AND (title ILIKE $1 OR subtitle ILIKE $1 OR category ILIKE $1 OR excerpt ILIKE $1 OR body ILIKE $1) ORDER BY date DESC,id DESC LIMIT 8`,[like]),
      pool.query(`SELECT id,title,category,description FROM library_items WHERE published=1 AND (title ILIKE $1 OR category ILIKE $1 OR description ILIKE $1 OR content ILIKE $1) ORDER BY sort_order ASC,title ASC LIMIT 8`,[like])
    ];
    if(cardsAllowed){
      queries.push(pool.query(`SELECT id,name_jp,name_pt,category,origin,power_value FROM cards WHERE active=1 AND (name_jp ILIKE $1 OR name_pt ILIKE $1 OR category ILIKE $1 OR origin ILIKE $1) ORDER BY name_pt ASC LIMIT 8`,[like]));
    }
    const out=await Promise.all(queries);
    const [players,houses,events,missions,schedule,articles,library,cards]=out;
    const results=[];
    players.rows.forEach(x=>results.push({kind:'player',icon:'👤',title:x.nick,meta:[x.house,x.patent].filter(Boolean).join(' • '),page:'jogadores',id:Number(x.id)}));
    houses.rows.forEach(x=>results.push({kind:'house',icon:x.emblem||'🏰',title:x.name,meta:'Casa de Spade',page:'casas',id:Number(x.id)}));
    events.rows.forEach(x=>results.push({kind:'event',icon:'🎪',title:x.title,meta:`${x.event_type||'Evento'} • ${x.status||''}`.replace(/ • $/,''),page:'eventos',id:Number(x.id)}));
    missions.rows.forEach(x=>results.push({kind:'mission',icon:'⚔️',title:`Missão de ${x.mission_type||'Missão'}`,meta:`${x.status||''}${x.start_at?` • ${new Date(x.start_at).toLocaleDateString('pt-BR')}`:''}`.replace(/^ • | • $/g,''),page:'missoes',id:Number(x.id)}));
    schedule.rows.forEach(x=>results.push({kind:'schedule',icon:'📅',title:x.title,meta:`${x.activity_type||'Atividade'} • ${x.activity_date||''}`.replace(/ • $/,''),page:'cronograma',id:Number(x.id)}));
    articles.rows.forEach(x=>results.push({kind:'article',icon:'📰',title:x.title,meta:`${x.category||'Jornal'} • ${x.date||''}`.replace(/ • $/,''),page:'jornal',id:Number(x.id)}));
    library.rows.forEach(x=>results.push({kind:'library',icon:x.icon||'📚',title:x.title,meta:x.category||'Biblioteca',page:'biblioteca',id:Number(x.id)}));
    if(cards){cards.rows.forEach(x=>results.push({kind:'card',icon:'🃏',title:x.name_pt||x.name_jp,meta:`${x.name_jp && x.name_pt?x.name_jp+' • ':''}${x.category||'Card'}${x.origin?` • ${x.origin}`:''}`,page:'cards',id:Number(x.id)}));}
    res.json({query:q,results:results.slice(0,40),cards_visible:cardsAllowed});
  }catch(e){console.error('Erro em /api/search:',e);res.status(500).json({error:'Erro ao pesquisar no Portal.'});}
});

app.get("/api/home", async (req, res) => {
  try {
    const [news, editions, houses, ranking, announcements] = await Promise.all([
      pool.query("SELECT id,title,category,excerpt,body,image_url,date FROM news WHERE published=1 ORDER BY id DESC LIMIT 6"),
      pool.query(`
        SELECT e.id,e.title,e.edition,e.description,e.pdf_url,e.cover_url,e.date,
               COUNT(ea.article_id)::int AS article_count
        FROM editions e
        LEFT JOIN edition_articles ea ON ea.edition_id=e.id
        WHERE e.published=1
        GROUP BY e.id
        ORDER BY e.id DESC LIMIT 6
      `),
      pool.query(`SELECT h.id,h.name,h.emblem,h.description,h.leader,h.vice_leader,h.motto,h.color,h.banner_url,h.status,h.active,
                         COUNT(p.id)::int AS count,
                         COALESCE(SUM(p.missions),0)::bigint AS missions
                  FROM houses h
                  LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name))
                  GROUP BY h.id
                  ORDER BY missions DESC, h.name ASC
                  LIMIT 20`),
      pool.query(`SELECT nick,identifier,house,missions,ranking
                  FROM players WHERE ranking>0 ORDER BY ranking ASC LIMIT 10`),
      pool.query(`SELECT id,title,category,priority,body,date,featured
                  FROM announcements
                  WHERE published=1
                  ORDER BY featured DESC,
                    CASE priority WHEN 'URGENTE' THEN 1 WHEN 'IMPORTANTE' THEN 2 ELSE 3 END,
                    id DESC
                  LIMIT 5`)
    ]);
    res.json({
      news: news.rows,
      editions: editions.rows,
      houses: houses.rows.map(x => ({ ...x, count: Number(x.count), missions: Number(x.missions) })),
      ranking: ranking.rows,
      announcements: announcements.rows.map(a=>({
        id:Number(a.id),title:a.title,category:a.category||"INFORMATIVO",
        priority:a.priority||"INFORMATIVO",body:a.body||"",date:a.date,featured:Boolean(a.featured)
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar o portal." });
  }
});


app.get("/api/houses", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.id,h.name,h.emblem,h.description,h.leader,h.vice_leader,h.motto,h.color,h.banner_url,h.status,h.active,
              COUNT(p.id)::int AS count,
              COALESCE(SUM(p.missions),0)::bigint AS missions,
              COALESCE(SUM(p.yuls),0)::bigint AS yuls
       FROM houses h
       LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name)) AND p.public_profile=1
       WHERE COALESCE(h.active,1)=1
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
        motto: h.motto || "", color: h.color || "", banner_url: h.banner_url || "", status: h.status || "ATIVA",
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

    const historyResult = await pool.query(`SELECT id,event_type,title,description,event_date FROM house_history WHERE house_id=$1 ORDER BY event_date DESC,id DESC LIMIT 30`, [id]);

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
        motto: house.motto || "", color: house.color || "", banner_url: house.banner_url || "",
        history: house.history || "", goals: house.goals || "", achievements: house.achievements || "", status: house.status || "ATIVA",
        timeline: historyResult.rows.map(x=>({id:Number(x.id),event_type:x.event_type,title:x.title,description:x.description||"",event_date:x.event_date})),
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



app.get("/api/hierarchy", async (req,res) => {
  try {
    const [patents,roles,ranks]=await Promise.all([
      pool.query(`SELECT id,name,description,sort_order FROM patents ORDER BY sort_order ASC,name COLLATE "C" ASC`),
      pool.query(`SELECT id,name,description,salary,sort_order,rank_code,vacancies,payment_mode,remuneration_detail,requirements,benefits,scope
                  FROM roles WHERE active=1
                  ORDER BY CASE rank_code WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4 WHEN 'V' THEN 5 ELSE 99 END,sort_order ASC,name COLLATE "C" ASC`),
      pool.query(`SELECT id,code,name,description,requirements,sort_order FROM role_ranks ORDER BY sort_order ASC`)
    ]);
    res.json({
      patents:patents.rows.map(x=>({id:Number(x.id),name:x.name,description:x.description||"",sort_order:Number(x.sort_order||0)})),
      roles:roles.rows.map(x=>({id:Number(x.id),name:x.name,description:x.description||"",salary:Number(x.salary||0),sort_order:Number(x.sort_order||0),rank_code:x.rank_code||"",vacancies:x.vacancies||"",payment_mode:x.payment_mode||"",remuneration_detail:x.remuneration_detail||"",requirements:x.requirements||"",benefits:x.benefits||"",scope:x.scope||""})),
      ranks:ranks.rows.map(x=>({id:Number(x.id),code:x.code,name:x.name,description:x.description||"",requirements:x.requirements||"",sort_order:Number(x.sort_order||0)}))
    });
  } catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar hierarquia administrativa."});}
});
app.get("/api/rankings", async (req, res) => {
  try {
    const [powerResult, scResult, vtResult, missionsResult, wealthResult, activityResult, houseResult] = await Promise.all([
      pool.query(`SELECT p.id,p.nick,p.number,p.identifier,p.house,COALESCE(SUM(c.power_value),0)::bigint AS power,p.missions,p.achievements,p.yuls FROM players p LEFT JOIN player_cards pc ON pc.player_id=p.id LEFT JOIN cards c ON c.id=pc.card_id WHERE p.public_profile=1 AND p.active=1 GROUP BY p.id ORDER BY power DESC, p.missions DESC, p.nick COLLATE "C" ASC LIMIT 75`),
      pool.query(`SELECT id,nick,number,identifier,house,skill_sc AS score,missions,achievements,yuls FROM players WHERE public_profile=1 AND active=1 ORDER BY skill_sc DESC, missions DESC, nick COLLATE "C" ASC LIMIT 75`),
      pool.query(`SELECT id,nick,number,identifier,house,skill_vt AS score,missions,achievements,yuls FROM players WHERE public_profile=1 AND active=1 ORDER BY skill_vt DESC, missions DESC, nick COLLATE "C" ASC LIMIT 75`),
      pool.query(`SELECT id,nick,number,identifier,house,power,missions,achievements,yuls FROM players WHERE public_profile=1 AND active=1 ORDER BY missions DESC, achievements DESC, nick COLLATE "C" ASC LIMIT 75`),
      pool.query(`SELECT id,nick,number,identifier,house,power,missions,achievements,yuls FROM players WHERE public_profile=1 AND active=1 ORDER BY yuls DESC, missions DESC, nick COLLATE "C" ASC LIMIT 75`),
      pool.query(`SELECT id,nick,number,identifier,house,power,missions,achievements,yuls FROM players WHERE public_profile=1 AND active=1 ORDER BY (missions + achievements * 3) DESC, missions DESC, achievements DESC, nick COLLATE "C" ASC LIMIT 75`),
      pool.query(`SELECT h.id,h.name,h.emblem,h.leader,h.vice_leader,COUNT(p.id)::int AS members,COALESCE(SUM(p.missions),0)::bigint AS missions,COALESCE(SUM(p.yuls),0)::bigint AS yuls,COALESCE(SUM(cp.card_power),0)::bigint AS power FROM houses h LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name)) AND p.public_profile=1 AND p.active=1 LEFT JOIN LATERAL (SELECT COALESCE(SUM(c.power_value),0)::bigint AS card_power FROM player_cards pc JOIN cards c ON c.id=pc.card_id WHERE pc.player_id=p.id) cp ON TRUE WHERE h.active=1 GROUP BY h.id ORDER BY power DESC, missions DESC, members DESC, h.name ASC LIMIT 20`)
    ]);
    const mapPlayer=p=>({id:Number(p.id),nick:p.nick,number:p.number,identifier:p.identifier,house:p.house||"",power:Number(p.power||0),score:Number(p.score||0),missions:Number(p.missions||0),achievements:Number(p.achievements||0),yuls:Number(p.yuls||0)});
    res.json({
      force:powerResult.rows.map(mapPlayer), skill_sc:scResult.rows.map(mapPlayer), skill_vt:vtResult.rows.map(mapPlayer),
      missions:missionsResult.rows.map(mapPlayer), wealth:wealthResult.rows.map(mapPlayer), activity:activityResult.rows.map(mapPlayer),
      houses:houseResult.rows.map(h=>({id:Number(h.id),name:h.name,emblem:h.emblem||"♜",leader:h.leader||"",vice_leader:h.vice_leader||"",members:Number(h.members||0),missions:Number(h.missions||0),yuls:Number(h.yuls||0),power:Number(h.power||0)}))
    });
  } catch(e) { console.error("Erro em /api/rankings:",e); res.status(500).json({error:"Erro ao carregar rankings."}); }
});

app.get("/api/ranking-players", async (req,res)=>{
  try { const r=await pool.query(`SELECT id,nick,identifier,house,skill_sc,skill_vt FROM players WHERE active=1 AND public_profile=1 ORDER BY nick COLLATE "C" ASC`); res.json({players:r.rows.map(x=>({id:Number(x.id),nick:x.nick,identifier:x.identifier,house:x.house||"",skill_sc:Number(x.skill_sc||0),skill_vt:Number(x.skill_vt||0)}))}); }
  catch(e){res.status(500).json({error:"Erro ao carregar jogadores para a batalha."});}
});

app.get("/api/me/ranking-battles", async (req,res)=>{
  const id=readPlayerToken(req); if(!id)return res.status(401).json({error:"Não autenticado."});
  try{const r=await pool.query(`SELECT rb.*,c.nick AS challenger_nick,o.nick AS opponent_nick FROM ranking_battles rb JOIN players c ON c.id=rb.challenger_id JOIN players o ON o.id=rb.opponent_id WHERE rb.challenger_id=$1 OR rb.opponent_id=$1 ORDER BY rb.created_at DESC LIMIT 50`,[id]);
    res.json({battles:r.rows.map(x=>({id:Number(x.id),ranking_type:x.ranking_type,challenger_id:Number(x.challenger_id),opponent_id:Number(x.opponent_id),challenger_nick:x.challenger_nick,opponent_nick:x.opponent_nick,result:x.result,status:x.status,proof_url:x.proof_url||"",notes:x.notes||"",challenger_score_before:Number(x.challenger_score_before||0),opponent_score_before:Number(x.opponent_score_before||0),challenger_score_after:x.challenger_score_after===null?null:Number(x.challenger_score_after),opponent_score_after:x.opponent_score_after===null?null:Number(x.opponent_score_after),created_at:x.created_at}))});}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar batalhas."});}
});

app.post("/api/ranking-battles", async (req,res)=>{
  const id=readPlayerToken(req); if(!id)return res.status(401).json({error:"Faça login para registrar uma batalha."});
  const type=String(req.body?.ranking_type||"").toUpperCase(), opponentId=Number(req.body?.opponent_id), result=String(req.body?.result||"PENDENTE").toUpperCase();
  if(!['SC','VT'].includes(type))return res.status(400).json({error:"Escolha SC ou VT."});
  if(!Number.isInteger(opponentId)||opponentId<=0||opponentId===id)return res.status(400).json({error:"Adversário inválido."});
  if(!['PENDENTE','CHALLENGER','OPPONENT','EMPATE'].includes(result))return res.status(400).json({error:"Resultado inválido."});
  try{
    const p=await pool.query(`SELECT id,nick,skill_sc,skill_vt FROM players WHERE id=$1 AND active=1 AND public_profile=1`,[id]);
    const o=await pool.query(`SELECT id,nick,skill_sc,skill_vt FROM players WHERE id=$1 AND active=1 AND public_profile=1`,[opponentId]);
    if(!p.rows[0]||!o.rows[0])return res.status(404).json({error:"Jogador não encontrado ou inativo."});
    const col=type==='SC'?'skill_sc':'skill_vt';
    const r=await pool.query(`INSERT INTO ranking_battles(ranking_type,challenger_id,opponent_id,result,proof_url,notes,challenger_score_before,opponent_score_before) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[type,id,opponentId,result,String(req.body?.proof_url||''),String(req.body?.notes||''),Number(p.rows[0][col]||0),Number(o.rows[0][col]||0)]);
    res.json({ok:true,id:Number(r.rows[0].id),message:"Batalha registrada e enviada ao oponente para confirmação."});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao registrar batalha."});}
});

app.post("/api/ranking-battles/:id/confirm", async(req,res)=>{
  const playerId=readPlayerToken(req), battleId=Number(req.params.id); if(!playerId)return res.status(401).json({error:"Não autenticado."});
  if(!Number.isInteger(battleId))return res.status(400).json({error:"Batalha inválida."});
  try{const r=await pool.query(`UPDATE ranking_battles SET status='AGUARDANDO_ADMIN',confirmed_at=NOW(),updated_at=NOW() WHERE id=$1 AND opponent_id=$2 AND status='AGUARDANDO_OPONENTE' RETURNING id`,[battleId,playerId]); if(!r.rows[0])return res.status(400).json({error:"Batalha não encontrada ou já confirmada."}); res.json({ok:true,message:"Batalha confirmada e enviada à Administração."});}
  catch(e){res.status(500).json({error:"Erro ao confirmar batalha."});}
});

app.get("/api/admin/ranking-battles", requireAdmin, async(req,res)=>{
  try{const status=String(req.query.status||'').toUpperCase();const params=[];let where='';if(['AGUARDANDO_OPONENTE','AGUARDANDO_ADMIN','APROVADA','REJEITADA'].includes(status)){params.push(status);where='WHERE rb.status=$1';}
    const r=await pool.query(`SELECT rb.*,c.nick AS challenger_nick,o.nick AS opponent_nick,a.display_name AS admin_name FROM ranking_battles rb JOIN players c ON c.id=rb.challenger_id JOIN players o ON o.id=rb.opponent_id LEFT JOIN admin_users a ON a.id=rb.approved_by_admin_id ${where} ORDER BY rb.created_at DESC LIMIT 100`,params);
    res.json({battles:r.rows.map(x=>({...x,id:Number(x.id),challenger_id:Number(x.challenger_id),opponent_id:Number(x.opponent_id),challenger_score_before:Number(x.challenger_score_before||0),opponent_score_before:Number(x.opponent_score_before||0),challenger_score_after:x.challenger_score_after===null?null:Number(x.challenger_score_after),opponent_score_after:x.opponent_score_after===null?null:Number(x.opponent_score_after)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar registros de ranking."});}
});

app.post("/api/admin/ranking-battles/:id/approve", requireAdmin, async(req,res)=>{
  const battleId=Number(req.params.id);const cs=Number(req.body?.challenger_score_after),os=Number(req.body?.opponent_score_after);
  if(!Number.isInteger(battleId)||!Number.isInteger(cs)||cs<0||!Number.isInteger(os)||os<0)return res.status(400).json({error:"Informe pontuações finais válidas para os dois jogadores."});
  const client=await pool.connect();try{await client.query('BEGIN');const b=(await client.query(`SELECT * FROM ranking_battles WHERE id=$1 AND status='AGUARDANDO_ADMIN' FOR UPDATE`,[battleId])).rows[0];if(!b){await client.query('ROLLBACK');return res.status(404).json({error:"Batalha não está aguardando aprovação."});}
    const col=b.ranking_type==='SC'?'skill_sc':'skill_vt';const cp=(await client.query(`SELECT id,${col} AS score FROM players WHERE id=$1 FOR UPDATE`,[b.challenger_id])).rows[0];const op=(await client.query(`SELECT id,${col} AS score FROM players WHERE id=$1 FOR UPDATE`,[b.opponent_id])).rows[0];
    await client.query(`UPDATE players SET ${col}=$1,updated_at=NOW() WHERE id=$2`,[cs,b.challenger_id]);await client.query(`UPDATE players SET ${col}=$1,updated_at=NOW() WHERE id=$2`,[os,b.opponent_id]);
    await client.query(`UPDATE ranking_battles SET status='APROVADA',challenger_score_after=$1,opponent_score_after=$2,approved_at=NOW(),approved_by_admin_id=$3,updated_at=NOW() WHERE id=$4`,[cs,os,req.admin.id,battleId]);
    await client.query(`INSERT INTO ranking_history(player_id,ranking_type,battle_id,score_before,score_after,reason) VALUES($1,$2,$3,$4,$5,$6),($7,$2,$3,$8,$9,$10)`,[b.challenger_id,b.ranking_type,battleId,Number(cp.score||0),cs,'Batalha aprovada no Ranking',b.opponent_id,Number(op.score||0),os,'Batalha aprovada no Ranking']);
    await client.query('COMMIT');res.json({ok:true,message:"Batalha aprovada e ranking atualizado."});
  }catch(e){await client.query('ROLLBACK');console.error(e);res.status(500).json({error:"Erro ao aprovar batalha."});}finally{client.release();}
});

app.post("/api/admin/ranking-battles/:id/reject", requireAdmin, async(req,res)=>{const battleId=Number(req.params.id),reason=String(req.body?.reason||'');try{const r=await pool.query(`UPDATE ranking_battles SET status='REJEITADA',rejected_reason=$1,approved_by_admin_id=$2,updated_at=NOW() WHERE id=$3 AND status='AGUARDANDO_ADMIN' RETURNING id`,[reason,req.admin.id,battleId]);if(!r.rows[0])return res.status(404).json({error:"Batalha não está aguardando aprovação."});res.json({ok:true,message:"Batalha rejeitada. Nenhuma pontuação foi alterada."});}catch(e){res.status(500).json({error:"Erro ao rejeitar batalha."});}});

app.get("/api/ranking-history/:playerId", async(req,res)=>{const id=Number(req.params.playerId);if(!Number.isInteger(id))return res.status(400).json({error:"Jogador inválido."});try{const r=await pool.query(`SELECT rh.*,p.nick FROM ranking_history rh JOIN players p ON p.id=rh.player_id WHERE rh.player_id=$1 ORDER BY rh.created_at DESC LIMIT 100`,[id]);res.json({history:r.rows.map(x=>({...x,id:Number(x.id),player_id:Number(x.player_id),battle_id:x.battle_id?Number(x.battle_id):null,score_before:Number(x.score_before),score_after:Number(x.score_after)}))});}catch(e){res.status(500).json({error:"Erro ao carregar histórico."});}});

app.get("/api/ranking", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT nick,identifier,house,missions,yuls,ranking,power
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


app.get("/api/players/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Jogador inválido." });
  }

  try {
    const [playerResult, rolesResult, missionsResult, rankingResult] = await Promise.all([
      pool.query(
        `SELECT id,nick,number,identifier,house,patent,role,grimoire,
                hp,mana,yuls,missions,achievements,ranking,power,public_profile
         FROM players
         WHERE id=$1 AND public_profile=1 AND active=1`,
        [id]
      ),
      pool.query(
        `SELECT r.id,r.name,r.description,r.salary,r.sort_order
         FROM roles r
         JOIN player_roles pr ON pr.role_id=r.id
         WHERE pr.player_id=$1
         ORDER BY r.sort_order ASC,r.name COLLATE "C" ASC`,
        [id]
      ),
      pool.query(
        `SELECT id,title,mission_type,mission_rank,status,reward_yuls,notes,completed_at
         FROM missions
         WHERE player_id=$1
         ORDER BY id DESC
         LIMIT 20`,
        [id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS position
         FROM players
         WHERE public_profile=1
           AND ranking>0
           AND ranking < (SELECT ranking FROM players WHERE id=$1)`,
        [id]
      )
    ]);

    const player = playerResult.rows[0];
    if (!player) {
      return res.status(404).json({ error: "Jogador não encontrado ou perfil privado." });
    }

    const roles = rolesResult.rows.map(r => ({
      id:Number(r.id),
      name:r.name,
      description:r.description || "",
      salary:Number(r.salary || 0),
      sort_order:Number(r.sort_order || 0)
    }));

    const missions = missionsResult.rows.map(m => ({
      id:Number(m.id),
      title:m.title,
      mission_type:m.mission_type || "",
      mission_rank:m.mission_rank || "",
      status:m.status || "",
      reward_yuls:Number(m.reward_yuls || 0),
      notes:m.notes || "",
      completed_at:m.completed_at,
      created_at:m.created_at
    }));

    const completed=missions.filter(m=>m.status==="Concluída").length;
    const totalRewards=missions.filter(m=>m.status==="Concluída").reduce((sum,m)=>sum+m.reward_yuls,0);

    res.json({
      player:{...publicPlayer(player),roles},
      mission_summary:{
        completed:Number(player.missions || completed),
        recent:missions,
        rewards_on_page:totalRewards
      },
      ranking_position: Number(player.ranking || 0) > 0
        ? Number(rankingResult.rows[0].position)+1
        : 0
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({error:"Erro ao carregar ficha do jogador."});
  }
});

app.get("/api/players", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,nick,number,identifier,house,patent,role,grimoire,missions,achievements,ranking,power,yuls
       FROM players WHERE public_profile=1 AND active=1 ORDER BY nick COLLATE "C" ASC`
    );
    res.json({ players: result.rows.map(publicPlayer) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar jogadores." });
  }
});



app.get("/api/admin/articles", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(
      `SELECT id,title,subtitle,author,category,excerpt,body,image_url,date,published
       FROM articles ORDER BY id DESC LIMIT 300`
    );
    res.json({articles:r.rows.map(a=>({...a,id:Number(a.id),published:Number(a.published)}))});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar matérias."});
  }
});

app.post("/api/admin/articles", requireAdmin, async (req,res)=>{
  const b=req.body||{};
  const title=String(b.title||"").trim();
  if(!title)return res.status(400).json({error:"Título da matéria é obrigatório."});
  try{
    const r=await pool.query(
      `INSERT INTO articles(title,subtitle,author,category,excerpt,body,image_url,date,published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        title,String(b.subtitle||"").trim(),String(b.author||"").trim(),
        String(b.category||"RPG").trim()||"RPG",String(b.excerpt||"").trim(),
        String(b.body||""),String(b.image_url||"").trim(),
        String(b.date||new Date().toISOString().slice(0,10)).trim(),
        Number(b.published??1)?1:0
      ]
    );
    res.json({article:r.rows[0]});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao criar matéria."});
  }
});

app.put("/api/admin/articles/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Matéria inválida."});
  const title=String(b.title||"").trim();
  if(!title)return res.status(400).json({error:"Título da matéria é obrigatório."});
  try{
    const r=await pool.query(
      `UPDATE articles
       SET title=$1,subtitle=$2,author=$3,category=$4,excerpt=$5,body=$6,image_url=$7,date=$8,published=$9,updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [
        title,String(b.subtitle||"").trim(),String(b.author||"").trim(),
        String(b.category||"RPG").trim()||"RPG",String(b.excerpt||"").trim(),
        String(b.body||""),String(b.image_url||"").trim(),
        String(b.date||new Date().toISOString().slice(0,10)).trim(),
        Number(b.published??1)?1:0,id
      ]
    );
    if(!r.rows[0])return res.status(404).json({error:"Matéria não encontrada."});
    res.json({article:r.rows[0]});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao atualizar matéria."});
  }
});

app.delete("/api/admin/articles/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Matéria inválida."});
  try{
    const r=await pool.query("UPDATE articles SET published=0,updated_at=NOW() WHERE id=$1 RETURNING id",[id]);
    if(!r.rowCount)return res.status(404).json({error:"Matéria não encontrada."});
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao excluir matéria."});
  }
});

app.get("/api/admin/editions/:id/articles", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Edição inválida."});
  try{
    const r=await pool.query(
      `SELECT a.id,a.title,a.subtitle,a.author,a.category,a.excerpt,a.image_url,ea.sort_order
       FROM edition_articles ea
       JOIN articles a ON a.id=ea.article_id
       WHERE ea.edition_id=$1
       ORDER BY ea.sort_order,a.id`,
      [id]
    );
    res.json({articles:r.rows.map(a=>({...a,id:Number(a.id),sort_order:Number(a.sort_order||0)}))});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar composição da edição."});
  }
});

app.put("/api/admin/editions/:id/articles", requireAdmin, async (req,res)=>{
  const editionId=Number(req.params.id);
  if(!Number.isInteger(editionId)||editionId<=0)return res.status(400).json({error:"Edição inválida."});

  const items=Array.isArray(req.body?.articles)?req.body.articles:[];
  try{
    const edition=await pool.query("SELECT id FROM editions WHERE id=$1",[editionId]);
    if(!edition.rows[0])return res.status(404).json({error:"Edição não encontrada."});

    const cleaned=[];
    for(const item of items){
      const articleId=Number(item.article_id);
      const sortOrder=Math.round(Number(item.sort_order||0));
      if(Number.isInteger(articleId)&&articleId>0){
        cleaned.push({article_id:articleId,sort_order:sortOrder});
      }
    }
    const unique=new Map();
    cleaned.forEach(x=>unique.set(x.article_id,x));

    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const ids=[...unique.keys()];
      if(ids.length){
        const valid=await client.query(
          `SELECT id FROM articles WHERE id=ANY($1::bigint[])`,[ids]
        );
        const validIds=new Set(valid.rows.map(x=>Number(x.id)));
        for(const item of unique.values()){
          if(!validIds.has(item.article_id)){
            await client.query("ROLLBACK");
            return res.status(400).json({error:"Uma das matérias selecionadas não existe."});
          }
        }
      }

      await client.query("DELETE FROM edition_articles WHERE edition_id=$1",[editionId]);
      for(const item of [...unique.values()].sort((a,b)=>a.sort_order-b.sort_order||a.article_id-b.article_id)){
        await client.query(
          `INSERT INTO edition_articles(edition_id,article_id,sort_order)
           VALUES ($1,$2,$3)`,
          [editionId,item.article_id,item.sort_order]
        );
      }
      await client.query("COMMIT");
      res.json({ok:true,count:unique.size});
    }catch(e){
      await client.query("ROLLBACK");
      throw e;
    }finally{
      client.release();
    }
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao salvar a composição da edição."});
  }
});

app.get("/api/admin/news", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(`SELECT id,title,category,excerpt,body,image_url,date,published
                              FROM news ORDER BY id DESC LIMIT 100`);
    res.json({news:r.rows.map(n=>({...n,published:Number(n.published)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar notícias."});}
});

app.put("/api/admin/news/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Notícia inválida."});
  if(!String(b.title||"").trim())return res.status(400).json({error:"Título obrigatório."});
  try{
    const r=await pool.query(
      `UPDATE news
       SET title=$1,category=$2,excerpt=$3,body=$4,image_url=$5,date=$6,published=$7
       WHERE id=$8 RETURNING *`,
      [String(b.title).trim(),String(b.category||"RPG").trim(),String(b.excerpt||"").trim(),
       String(b.body||""),String(b.image_url||"").trim(),String(b.date||new Date().toISOString().slice(0,10)),
       Number(b.published??1)?1:0,id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Notícia não encontrada."});
    res.json({news:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao atualizar notícia."});}
});

app.delete("/api/admin/news/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  try{await pool.query("DELETE FROM news WHERE id=$1",[id]);res.json({ok:true})}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao excluir notícia."});}
});

app.get("/api/admin/editions", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(`
      SELECT e.id,e.title,e.edition,e.description,e.pdf_url,e.cover_url,e.date,e.published,
             COUNT(ea.article_id)::int AS article_count
      FROM editions e
      LEFT JOIN edition_articles ea ON ea.edition_id=e.id
      GROUP BY e.id
      ORDER BY e.id DESC LIMIT 100
    `);
    res.json({editions:r.rows.map(e=>({...e,id:Number(e.id),published:Number(e.published),article_count:Number(e.article_count||0)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar edições."});}
});

app.put("/api/admin/editions/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Edição inválida."});
  if(!String(b.title||"").trim())return res.status(400).json({error:"Título obrigatório."});
  try{
    const r=await pool.query(
      `UPDATE editions
       SET title=$1,edition=$2,description=$3,pdf_url=$4,cover_url=$5,date=$6,published=$7
       WHERE id=$8 RETURNING *`,
      [String(b.title).trim(),String(b.edition||"").trim(),String(b.description||"").trim(),
       String(b.pdf_url||"").trim(),String(b.cover_url||"").trim(),
       String(b.date||new Date().toISOString().slice(0,10)),Number(b.published??1)?1:0,id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Edição não encontrada."});
    res.json({edition:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao atualizar edição."});}
});

app.delete("/api/admin/editions/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  try{await pool.query("DELETE FROM editions WHERE id=$1",[id]);res.json({ok:true})}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao excluir edição."});}
});

app.get("/api/admin/announcements", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(
      `SELECT id,title,category,priority,body,date,featured,published
       FROM announcements ORDER BY id DESC LIMIT 200`
    );
    res.json({announcements:r.rows.map(a=>({
      id:Number(a.id),title:a.title,category:a.category||"INFORMATIVO",
      priority:a.priority||"INFORMATIVO",body:a.body||"",date:a.date,
      featured:Number(a.featured),published:Number(a.published)
    }))});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar comunicados administrativos."});
  }
});

app.post("/api/admin/announcements", requireAdmin, async (req,res)=>{
  const b=req.body||{};
  const title=String(b.title||"").trim();
  const category=String(b.category||"INFORMATIVO").trim()||"INFORMATIVO";
  const priority=String(b.priority||"INFORMATIVO").trim()||"INFORMATIVO";
  const body=String(b.body||"").trim();
  const date=String(b.date||new Date().toISOString().slice(0,10)).trim();
  const featured=Number(b.featured)?1:0;
  const published=Number(b.published??1)?1:0;

  if(!title)return res.status(400).json({error:"Título do comunicado é obrigatório."});
  if(!["URGENTE","IMPORTANTE","INFORMATIVO"].includes(priority)){
    return res.status(400).json({error:"Prioridade inválida."});
  }

  try{
    if(featured)await pool.query("UPDATE announcements SET featured=0");
    const r=await pool.query(
      `INSERT INTO announcements(title,category,priority,body,date,featured,published)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title,category,priority,body,date,featured,published]
    );
    res.json({announcement:r.rows[0]});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao publicar comunicado."});
  }
});

app.put("/api/admin/announcements/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Comunicado inválido."});

  const title=String(b.title||"").trim();
  const category=String(b.category||"INFORMATIVO").trim()||"INFORMATIVO";
  const priority=String(b.priority||"INFORMATIVO").trim()||"INFORMATIVO";
  const body=String(b.body||"").trim();
  const date=String(b.date||new Date().toISOString().slice(0,10)).trim();
  const featured=Number(b.featured)?1:0;
  const published=Number(b.published??1)?1:0;

  if(!title)return res.status(400).json({error:"Título do comunicado é obrigatório."});
  if(!["URGENTE","IMPORTANTE","INFORMATIVO"].includes(priority)){
    return res.status(400).json({error:"Prioridade inválida."});
  }

  try{
    if(featured)await pool.query("UPDATE announcements SET featured=0 WHERE id<>$1",[id]);
    const r=await pool.query(
      `UPDATE announcements
       SET title=$1,category=$2,priority=$3,body=$4,date=$5,featured=$6,published=$7,updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [title,category,priority,body,date,featured,published,id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Comunicado não encontrado."});
    res.json({announcement:r.rows[0]});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao atualizar comunicado."});
  }
});

app.delete("/api/admin/announcements/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Comunicado inválido."});
  try{
    const r=await pool.query("DELETE FROM announcements WHERE id=$1",[id]);
    if(!r.rowCount)return res.status(404).json({error:"Comunicado não encontrado."});
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao excluir comunicado."});
  }
});


const CARD_CATEGORIES=["Falha","Fuga","Ataque/Defesa","Barreira","Paralisia","Magia Ofensiva","Réplica","Técnica","Ativação","Invocação","Ilusão","Regeneração","Outros"];
const CARD_ORIGINS=["SC Junior","SC Inter","SC Sênior","Patente","Missão","Evento","Exclusivo","Loja Mágica","Mercado Negro","Função/Cargo"];
const CARD_ELEMENT_TYPES=["ELEMENTAL","NAO_ELEMENTAL"];
const CARD_COST_TYPES=["MANA","VIDA","SEM_CUSTO"];
const CARD_STATUSES=["ATIVO","INATIVO"];

app.post("/api/admin/card-categories", requireAdmin, async (req,res)=>{
  const name=String(req.body?.name||"").trim();
  if(!name)return res.status(400).json({error:"Nome da categoria é obrigatório."});
  try{const r=await pool.query(`INSERT INTO card_categories(name,sort_order) VALUES($1,COALESCE((SELECT MAX(sort_order)+1 FROM card_categories),1)) RETURNING *`,[name]);res.json({category:r.rows[0]});}
  catch(e){if(e.code==="23505")return res.status(400).json({error:"Essa categoria já existe."});res.status(500).json({error:"Erro ao criar categoria."});}
});

app.get("/api/admin/cards", requireAdmin, async (req,res)=>{
  try{
    const [r,cats]=await Promise.all([
      pool.query(`SELECT c.id,c.name,c.name_jp,c.name_pt,COALESCE(c.category,c.type) AS category,c.element_type,c.element,c.cost_type,c.cost,c.power_value,c.origin,c.status,c.description,c.sort_order,c.active,COUNT(pc.player_id)::int AS players
                  FROM cards c LEFT JOIN player_cards pc ON pc.card_id=c.id
                  GROUP BY c.id ORDER BY COALESCE(c.category,c.type),c.sort_order,c.name COLLATE "C"`),
      pool.query(`SELECT name FROM card_categories WHERE active=1 ORDER BY sort_order,name COLLATE "C"`)
    ]);
    res.json({
      categories:cats.rows.map(x=>x.name),origins:CARD_ORIGINS,element_types:CARD_ELEMENT_TYPES,cost_types:CARD_COST_TYPES,statuses:CARD_STATUSES,
      cards:r.rows.map(c=>({id:Number(c.id),name:c.name,name_jp:c.name_jp||"",name_pt:c.name_pt||c.name,category:c.category||"Outros",element_type:c.element_type||"NAO_ELEMENTAL",element:c.element||"",cost_type:c.cost_type||"SEM_CUSTO",cost:c.cost||"",power_value:Number(c.power_value||0),origin:c.origin||"Exclusivo",status:c.status||"ATIVO",description:c.description||"",sort_order:Number(c.sort_order||0),active:Number(c.active),players:Number(c.players||0)}))
    });
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar banco de cards."});}
});

app.post("/api/admin/cards", requireAdmin, async (req,res)=>{
  const b=req.body||{};
  const namePt=String(b.name_pt||b.name||"").trim(), nameJp=String(b.name_jp||"").trim();
  const category=String(b.category||"Outros").trim();
  const elementType=String(b.element_type||"NAO_ELEMENTAL").toUpperCase();
  const element=String(b.element||"").trim();
  const costType=String(b.cost_type||"SEM_CUSTO").toUpperCase();
  const cost=String(b.cost||"").trim();
  const power=Math.max(0,Math.round(Number(b.power_value||0)));
  const origin=String(b.origin||"Exclusivo").trim();
  const status=String(b.status||"ATIVO").toUpperCase();
  const description=String(b.description||"").trim();
  const sort_order=Number.isFinite(Number(b.sort_order))?Math.round(Number(b.sort_order)):0;
  if(!namePt)return res.status(400).json({error:"Nome em português é obrigatório."});
  if(!CARD_CATEGORIES.includes(category))return res.status(400).json({error:"Categoria de card inválida."});
  if(!CARD_ELEMENT_TYPES.includes(elementType)||!CARD_COST_TYPES.includes(costType)||!CARD_ORIGINS.includes(origin)||!CARD_STATUSES.includes(status))return res.status(400).json({error:"Configuração do card inválida."});
  if(elementType==="ELEMENTAL"&&!element)return res.status(400).json({error:"Informe o elemento do card elemental."});
  try{
    const r=await pool.query(`INSERT INTO cards(name,name_jp,name_pt,type,category,element_type,element,cost_type,cost,power_value,origin,status,description,sort_order,active)
      VALUES($1,$2,$1,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[namePt,nameJp,category,elementType,element,costType,cost,power,origin,status,description,sort_order,status==="ATIVO"?1:0]);
    res.json({card:r.rows[0]});
  }catch(e){console.error(e);if(e.code==="23505")return res.status(400).json({error:"Esse card já existe."});res.status(500).json({error:"Erro ao criar card."});}
});

app.put("/api/admin/cards/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  const namePt=String(b.name_pt||b.name||"").trim(), nameJp=String(b.name_jp||"").trim();
  const category=String(b.category||"Outros").trim(),elementType=String(b.element_type||"NAO_ELEMENTAL").toUpperCase(),element=String(b.element||"").trim(),costType=String(b.cost_type||"SEM_CUSTO").toUpperCase(),cost=String(b.cost||"").trim();
  const power=Math.max(0,Math.round(Number(b.power_value||0))),origin=String(b.origin||"Exclusivo").trim(),status=String(b.status||"ATIVO").toUpperCase(),description=String(b.description||"").trim();
  const sort_order=Number.isFinite(Number(b.sort_order))?Math.round(Number(b.sort_order)):0;
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Card inválido."});
  if(!namePt)return res.status(400).json({error:"Nome em português é obrigatório."});
  if(!CARD_CATEGORIES.includes(category)||!CARD_ELEMENT_TYPES.includes(elementType)||!CARD_COST_TYPES.includes(costType)||!CARD_ORIGINS.includes(origin)||!CARD_STATUSES.includes(status))return res.status(400).json({error:"Configuração do card inválida."});
  if(elementType==="ELEMENTAL"&&!element)return res.status(400).json({error:"Informe o elemento do card elemental."});
  try{
    const r=await pool.query(`UPDATE cards SET name=$1,name_jp=$2,name_pt=$1,type=$3,category=$3,element_type=$4,element=$5,cost_type=$6,cost=$7,power_value=$8,origin=$9,status=$10,description=$11,sort_order=$12,active=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,[namePt,nameJp,category,elementType,element,costType,cost,power,origin,status,description,sort_order,status==="ATIVO"?1:0,id]);
    if(!r.rows[0])return res.status(404).json({error:"Card não encontrado."});
    res.json({card:r.rows[0]});
  }catch(e){console.error(e);if(e.code==="23505")return res.status(400).json({error:"Esse card já existe."});res.status(500).json({error:"Erro ao atualizar card."});}
});

app.delete("/api/admin/cards/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Card inválido."});
  try{
    const r=await pool.query(`UPDATE cards SET active=0,status='INATIVO',updated_at=NOW() WHERE id=$1 RETURNING id,name,name_pt`,[id]);
    if(!r.rows[0])return res.status(404).json({error:"Card não encontrado."});
    res.json({ok:true,card:r.rows[0],message:"Card desativado. O histórico e a posse existente foram preservados."});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao desativar card."});}
});

app.get("/api/admin/events", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(`
      SELECT e.id,e.title,e.event_type,e.description,e.rules,e.start_date,e.end_date,e.status,e.image_url,
             e.featured,e.published,
             COUNT(DISTINCT ep.player_id)::int AS participants,
             COUNT(DISTINCT ea.id)::int AS actions
      FROM events e
      LEFT JOIN event_participants ep ON ep.event_id=e.id
      LEFT JOIN event_actions ea ON ea.event_id=e.id
      GROUP BY e.id
      ORDER BY e.id DESC
    `);
    res.json({types:EVENT_TYPES,statuses:EVENT_STATUSES,events:r.rows.map(e=>({
      id:Number(e.id),title:e.title,event_type:e.event_type,description:e.description||"",
      rules:e.rules||"",start_date:e.start_date,end_date:e.end_date,status:e.status,
      image_url:e.image_url||"",featured:Number(e.featured),published:Number(e.published),
      participants:Number(e.participants||0),actions:Number(e.actions||0)
    }))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar eventos administrativos."});}
});

app.post("/api/admin/events", requireAdmin, async (req,res)=>{
  const b=req.body||{};
  const title=String(b.title||"").trim(),type=String(b.event_type||"JOGO").trim().toUpperCase(),
        status=String(b.status||"PLANEJADO").trim().toUpperCase();
  if(!title)return res.status(400).json({error:"Nome do evento é obrigatório."});
  if(!EVENT_TYPES.includes(type))return res.status(400).json({error:"Tipo de evento inválido."});
  if(!EVENT_STATUSES.includes(status))return res.status(400).json({error:"Status inválido."});
  try{
    const r=await pool.query(
      `INSERT INTO events(title,event_type,description,rules,start_date,end_date,status,image_url,featured,published)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title,type,String(b.description||"").trim(),String(b.rules||"").trim(),
       b.start_date||null,b.end_date||null,status,String(b.image_url||"").trim(),
       Number(b.featured)?1:0,Number(b.published??1)?1:0]
    );
    if(Number(b.featured))await pool.query("UPDATE events SET featured=0 WHERE id<>$1",[r.rows[0].id]);
    res.json({event:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao criar evento."});}
});

app.put("/api/admin/events/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  const title=String(b.title||"").trim(),type=String(b.event_type||"JOGO").trim().toUpperCase(),
        status=String(b.status||"PLANEJADO").trim().toUpperCase();
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Evento inválido."});
  if(!title)return res.status(400).json({error:"Nome do evento é obrigatório."});
  if(!EVENT_TYPES.includes(type))return res.status(400).json({error:"Tipo de evento inválido."});
  if(!EVENT_STATUSES.includes(status))return res.status(400).json({error:"Status inválido."});
  try{
    const r=await pool.query(
      `UPDATE events SET title=$1,event_type=$2,description=$3,rules=$4,start_date=$5,end_date=$6,
       status=$7,image_url=$8,featured=$9,published=$10,updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [title,type,String(b.description||"").trim(),String(b.rules||"").trim(),
       b.start_date||null,b.end_date||null,status,String(b.image_url||"").trim(),
       Number(b.featured)?1:0,Number(b.published??1)?1:0,id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Evento não encontrado."});
    if(Number(b.featured))await pool.query("UPDATE events SET featured=0 WHERE id<>$1",[id]);
    res.json({event:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao atualizar evento."});}
});

app.delete("/api/admin/events/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Evento inválido."});
  try{
    const r=await pool.query("DELETE FROM events WHERE id=$1",[id]);
    if(!r.rowCount)return res.status(404).json({error:"Evento não encontrado."});
    res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao excluir evento."});}
});

app.get("/api/admin/events/:id/actions", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  try{
    const r=await pool.query(`SELECT id,name,description,points,sort_order,active FROM event_actions WHERE event_id=$1 ORDER BY sort_order,id`,[id]);
    res.json({actions:r.rows.map(a=>({...a,id:Number(a.id),points:Number(a.points),sort_order:Number(a.sort_order),active:Number(a.active)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar ações do evento."});}
});

app.post("/api/admin/events/:id/actions", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id),b=req.body||{};
  const name=String(b.name||"").trim(),points=Math.round(Number(b.points||0));
  if(!name||points<=0)return res.status(400).json({error:"Nome e pontos da ação são obrigatórios."});
  try{
    const r=await pool.query(
      `INSERT INTO event_actions(event_id,name,description,points,sort_order,active)
       VALUES($1,$2,$3,$4,$5,1) RETURNING *`,
      [eventId,name,String(b.description||"").trim(),points,Math.round(Number(b.sort_order||0))]
    );
    res.json({action:r.rows[0]});
  }catch(e){console.error(e);if(e.code==="23505")return res.status(400).json({error:"Essa ação já existe neste evento."});res.status(500).json({error:"Erro ao criar ação."});}
});

app.delete("/api/admin/event-actions/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  try{const r=await pool.query("DELETE FROM event_actions WHERE id=$1",[id]);if(!r.rowCount)return res.status(404).json({error:"Ação não encontrada."});res.json({ok:true})}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao excluir ação."});}
});

app.get("/api/admin/events/:id/rewards", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  try{
    const r=await pool.query(`
      SELECT er.card_id,er.points_cost,er.description,er.active,c.name,c.category,c.cost
      FROM event_card_rewards er JOIN cards c ON c.id=er.card_id
      WHERE er.event_id=$1 ORDER BY er.points_cost,c.name COLLATE "C"`,[id]
    );
    res.json({rewards:r.rows.map(x=>({...x,card_id:Number(x.card_id),points_cost:Number(x.points_cost||0),active:Number(x.active)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar recompensas."});}
});

app.post("/api/admin/events/:id/rewards", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id),b=req.body||{},cardId=Number(b.card_id);
  const cost=Math.max(0,Math.round(Number(b.points_cost||0)));
  if(!Number.isInteger(cardId)||cardId<=0)return res.status(400).json({error:"Selecione um card."});
  try{
    const exists=await pool.query("SELECT id FROM cards WHERE id=$1 AND active=1",[cardId]);
    if(!exists.rows[0])return res.status(404).json({error:"Card não encontrado ou desativado."});
    const r=await pool.query(
      `INSERT INTO event_card_rewards(event_id,card_id,points_cost,description,active)
       VALUES($1,$2,$3,$4,1)
       ON CONFLICT(event_id,card_id) DO UPDATE SET points_cost=EXCLUDED.points_cost,description=EXCLUDED.description,active=1
       RETURNING *`,
      [eventId,cardId,cost,String(b.description||"").trim()]
    );
    res.json({reward:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao vincular card como recompensa."});}
});

app.delete("/api/admin/events/:id/rewards/:cardId", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id),cardId=Number(req.params.cardId);
  try{const r=await pool.query("DELETE FROM event_card_rewards WHERE event_id=$1 AND card_id=$2",[eventId,cardId]);if(!r.rowCount)return res.status(404).json({error:"Recompensa não encontrada."});res.json({ok:true})}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao remover recompensa."});}
});

app.get("/api/admin/events/:id/players", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  try{
    const r=await pool.query(`
      SELECT p.id,p.nick,p.house,p.patent,p.yuls,p.missions,p.exp,
             ep.joined_at,COALESCE(ept.points,0)::int AS points
      FROM event_participants ep
      JOIN players p ON p.id=ep.player_id
      LEFT JOIN event_points ept ON ept.event_id=ep.event_id AND ept.player_id=ep.player_id
      WHERE ep.event_id=$1
      ORDER BY p.nick COLLATE "C"`,[id]);
    res.json({players:r.rows.map(p=>({...p,id:Number(p.id),yuls:Number(p.yuls||0),missions:Number(p.missions||0),exp:Number(p.exp||0),points:Number(p.points||0)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar participantes."});}
});

app.post("/api/admin/events/:id/participants", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id),ids=[...new Set((Array.isArray(req.body?.player_ids)?req.body.player_ids:[]).map(Number).filter(x=>Number.isInteger(x)&&x>0))];
  if(!ids.length)return res.status(400).json({error:"Selecione jogadores."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    for(const playerId of ids){
      const exists=await client.query("SELECT id FROM players WHERE id=$1",[playerId]);
      if(!exists.rows[0])continue;
      await client.query("INSERT INTO event_participants(event_id,player_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[eventId,playerId]);
      await client.query("INSERT INTO event_points(event_id,player_id,points) VALUES($1,$2,0) ON CONFLICT DO NOTHING",[eventId,playerId]);
    }
    await client.query("COMMIT");res.json({ok:true,count:ids.length});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Erro ao adicionar participantes."});}
  finally{client.release();}
});

app.post("/api/admin/events/:id/action", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id),playerId=Number(req.body?.player_id),actionId=Number(req.body?.action_id);
  const note=String(req.body?.note||"").trim();
  if(!Number.isInteger(eventId)||!Number.isInteger(playerId)||!Number.isInteger(actionId))return res.status(400).json({error:"Evento, jogador e ação são obrigatórios."});

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const ar=await client.query("SELECT * FROM event_actions WHERE id=$1 AND event_id=$2 AND active=1 FOR UPDATE",[actionId,eventId]);
    if(!ar.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Ação não encontrada."});}
    await client.query("INSERT INTO event_participants(event_id,player_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[eventId,playerId]);
    const pointResult=await client.query(
      `INSERT INTO event_points(event_id,player_id,points) VALUES($1,$2,$3)
       ON CONFLICT(event_id,player_id) DO UPDATE SET points=event_points.points+EXCLUDED.points,updated_at=NOW()
       RETURNING points`,[eventId,playerId,Number(ar.rows[0].points)]
    );
    await client.query(
      `INSERT INTO event_action_history(event_id,action_id,player_id,points,note) VALUES($1,$2,$3,$4,$5)`,
      [eventId,actionId,playerId,Number(ar.rows[0].points),note]
    );
    await client.query("COMMIT");
    res.json({ok:true,points:Number(pointResult.rows[0].points)});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Erro ao registrar ação do evento."});}
  finally{client.release();}
});



app.post("/api/admin/events/:id/card-reward", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id),playerId=Number(req.body?.player_id),cardId=Number(req.body?.card_id);
  const note=String(req.body?.note||"").trim();
  if(!Number.isInteger(eventId)||!Number.isInteger(playerId)||!Number.isInteger(cardId)){
    return res.status(400).json({error:"Evento, jogador e card são obrigatórios."});
  }

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const er=await client.query("SELECT id,title,event_type FROM events WHERE id=$1",[eventId]);
    const pr=await client.query("SELECT id,nick FROM players WHERE id=$1",[playerId]);
    const cr=await client.query("SELECT id,name,category,active FROM cards WHERE id=$1",[cardId]);
    if(!er.rows[0]||!pr.rows[0]||!cr.rows[0]){
      await client.query("ROLLBACK");
      return res.status(404).json({error:"Evento, jogador ou card não encontrado."});
    }
    if(!Number(cr.rows[0].active)){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"Este card está desativado."});
    }

    const owned=await client.query(
      "SELECT 1 FROM player_cards WHERE player_id=$1 AND card_id=$2",
      [playerId,cardId]
    );
    if(owned.rows[0]){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"O jogador já possui este card. Cards são únicos."});
    }

    await client.query(
      `INSERT INTO player_cards(player_id,card_id,quantity,acquisition_type,acquisition_id,acquisition_name,acquired_at,updated_at)
       VALUES($1,$2,1,'EVENTO',$3,$4,NOW(),NOW())`,
      [playerId,cardId,eventId,er.rows[0].title]
    );
    await client.query(
      `INSERT INTO player_card_history(player_id,card_id,action,acquisition_type,acquisition_id,acquisition_name,notes)
       VALUES($1,$2,'ADQUIRIDO','EVENTO',$3,$4,$5)`,
      [playerId,cardId,eventId,er.rows[0].title,note||`Recompensa do evento ${er.rows[0].title}.`]
    );
    await client.query(
      `INSERT INTO event_reward_history(event_id,player_id,reward_type,card_id,note)
       VALUES($1,$2,'CARD',$3,$4)`,
      [eventId,playerId,cardId,note||`Card ${cr.rows[0].name} concedido pelo evento.`]
    );
    await client.query(
      `INSERT INTO player_admin_history(player_id,action,description)
       VALUES($1,'EVENTO',$2)`,
      [playerId,`Card de evento concedido: ${cr.rows[0].name} • ${er.rows[0].title}.`]
    );

    await client.query("COMMIT");
    res.json({ok:true,card:{id:Number(cr.rows[0].id),name:cr.rows[0].name,category:cr.rows[0].category||"Outros"}});
  }catch(e){
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({error:"Erro ao conceder card do evento."});
  }finally{
    client.release();
  }
});

app.post("/api/admin/events/:id/reward", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id),playerId=Number(req.body?.player_id);
  const yuls=Math.max(0,Math.round(Number(req.body?.yuls||0))),exp=Math.max(0,Math.round(Number(req.body?.exp||0)));
  const note=String(req.body?.note||"").trim();
  if(!Number.isInteger(eventId)||!Number.isInteger(playerId))return res.status(400).json({error:"Evento e jogador são obrigatórios."});
  if(yuls===0&&exp===0)return res.status(400).json({error:"Informe Yuls e/ou EXP."});

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const pr=await client.query("SELECT * FROM players WHERE id=$1 FOR UPDATE",[playerId]);
    const er=await client.query("SELECT id,title,event_type FROM events WHERE id=$1",[eventId]);
    if(!pr.rows[0]||!er.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Evento ou jogador não encontrado."});}

    const newYuls=Number(pr.rows[0].yuls||0)+yuls;
    const newExp=Number(pr.rows[0].exp||0)+exp;
    await client.query("UPDATE players SET yuls=$1,exp=$2,updated_at=NOW() WHERE id=$3",[newYuls,newExp,playerId]);
    if(yuls>0){
      await client.query(`INSERT INTO yuls_history(player_id,amount,reason,balance_after) VALUES($1,$2,$3,$4)`,
        [playerId,yuls,`Evento: ${er.rows[0].title}${note?` • ${note}`:""}`,newYuls]);
    }
    await client.query(
      `INSERT INTO event_reward_history(event_id,player_id,reward_type,yuls,exp,note)
       VALUES($1,$2,'MISTO',$3,$4,$5)`,
      [eventId,playerId,yuls,exp,note]
    );
    await client.query(
      `INSERT INTO player_admin_history(player_id,action,description)
       VALUES($1,'EVENTO',$2)`,
      [playerId,`Recompensa de evento: +${yuls} Yuls${exp?` • +${exp} EXP`:""}${note?` • ${note}`:""}.`]
    );
    await client.query("COMMIT");
    res.json({ok:true,yuls:newYuls,exp:newExp});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Erro ao lançar recompensa."});}
  finally{client.release();}
});


app.get("/api/admin/events/:id/results", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id);
  if(!Number.isInteger(eventId)||eventId<=0)return res.status(400).json({error:"Evento inválido."});
  try{
    const r=await pool.query(`
      SELECT er.id,er.slot,er.player_id,p.nick,p.house,p.patent,
             er.reward_yuls,er.reward_exp,er.published,er.reward_applied
      FROM event_results er JOIN players p ON p.id=er.player_id
      WHERE er.event_id=$1
      ORDER BY CASE er.slot
        WHEN 'WINNER_1' THEN 1 WHEN 'WINNER_2' THEN 2 WHEN 'WINNER_3' THEN 3
        WHEN 'HONOR_1' THEN 4 WHEN 'HONOR_2' THEN 5 WHEN 'HONOR_3' THEN 6 ELSE 99 END
    `,[eventId]);
    res.json({results:r.rows.map(x=>({
      id:Number(x.id),slot:x.slot,player_id:Number(x.player_id),nick:x.nick,
      house:x.house||"",patent:x.patent||"",reward_yuls:Number(x.reward_yuls||0),
      reward_exp:Number(x.reward_exp||0),published:Number(x.published),reward_applied:Number(x.reward_applied)
    }))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar resultados."});}
});

app.put("/api/admin/events/:id/results", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id);
  const results=Array.isArray(req.body?.results)?req.body.results:[];
  if(!Number.isInteger(eventId)||eventId<=0)return res.status(400).json({error:"Evento inválido."});

  const allowed=new Set(EVENT_RESULT_SLOTS);
  const seenSlots=new Set(),seenPlayers=new Set();
  const cleaned=[];
  for(const x of results){
    const slot=String(x.slot||"").trim().toUpperCase();
    const playerId=Number(x.player_id);
    if(!allowed.has(slot)||!Number.isInteger(playerId)||playerId<=0)continue;
    if(seenSlots.has(slot)||seenPlayers.has(playerId)){
      return res.status(400).json({error:"Cada posição deve ter um jogador diferente."});
    }
    seenSlots.add(slot);seenPlayers.add(playerId);
    const isHonor=slot.startsWith("HONOR_");
    const fixedWinner=slot==="WINNER_1"?100:slot==="WINNER_2"?80:slot==="WINNER_3"?50:0;
    const rewardYuls=isHonor?0:fixedWinner;
    const rewardExp=isHonor?0:Math.max(0,Math.round(Number(x.reward_exp||0)));
    cleaned.push({slot,playerId,rewardYuls,rewardExp});
  }

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const ev=await client.query("SELECT id,event_type,status FROM events WHERE id=$1 FOR UPDATE",[eventId]);
    if(!ev.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Evento não encontrado."});}
    if(ev.rows[0].event_type!=="JOGO"){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"Resultados de pódio são exclusivos de eventos de jogo."});
    }

    const locked=await client.query(
      "SELECT slot,reward_applied,published FROM event_results WHERE event_id=$1 FOR UPDATE",[eventId]
    );
    if(locked.rows.some(r=>Number(r.reward_applied)===1)){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"As premiações deste evento já foram aplicadas. Para preservar o histórico, não é possível alterar os resultados pagos."});
    }

    await client.query("DELETE FROM event_results WHERE event_id=$1",[eventId]);
    for(const item of cleaned){
      await client.query(
        `INSERT INTO event_results(event_id,slot,player_id,reward_yuls,reward_exp,published,reward_applied)
         VALUES($1,$2,$3,$4,$5,0,0)`,
        [eventId,item.slot,item.playerId,item.rewardYuls,item.rewardExp]
      );
    }
    await client.query("COMMIT");
    res.json({ok:true,count:cleaned.length});
  }catch(e){
    await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Erro ao salvar resultados."});
  }finally{client.release();}
});

app.post("/api/admin/events/:id/results/publish", requireAdmin, async (req,res)=>{
  const eventId=Number(req.params.id);
  if(!Number.isInteger(eventId)||eventId<=0)return res.status(400).json({error:"Evento inválido."});

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const ev=await client.query("SELECT id,title,event_type FROM events WHERE id=$1 FOR UPDATE",[eventId]);
    if(!ev.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Evento não encontrado."});}
    if(ev.rows[0].event_type!=="JOGO"){await client.query("ROLLBACK");return res.status(400).json({error:"Somente eventos de jogo possuem pódio."});}

    const rr=await client.query(`
      SELECT er.*,p.nick,p.yuls,p.exp
      FROM event_results er JOIN players p ON p.id=er.player_id
      WHERE er.event_id=$1 ORDER BY er.id FOR UPDATE`,[eventId]);
    if(!rr.rows.length){await client.query("ROLLBACK");return res.status(400).json({error:"Cadastre os resultados antes de publicar."});}

    for(const r of rr.rows){
      if(Number(r.reward_applied)===1)continue;
      const awardYuls=r.slot==="WINNER_1"?100:r.slot==="WINNER_2"?80:r.slot==="WINNER_3"?50:0;
      const awardExp=r.slot.startsWith("WINNER_")?Number(r.reward_exp||0):0;
      const newYuls=Number(r.yuls||0)+awardYuls;
      const newExp=Number(r.exp||0)+awardExp;
      await client.query("UPDATE players SET yuls=$1,exp=$2,updated_at=NOW() WHERE id=$3",[newYuls,newExp,r.player_id]);

      if(awardYuls>0){
        await client.query(
          `INSERT INTO yuls_history(player_id,amount,reason,balance_after)
           VALUES($1,$2,$3,$4)`,
          [r.player_id,awardYuls,`Premiação do evento: ${ev.rows[0].title}`,newYuls]
        );
      }
      if(awardYuls>0||awardExp>0){
        await client.query(
          `INSERT INTO event_reward_history(event_id,player_id,reward_type,yuls,exp,note)
           VALUES($1,$2,'RESULTADO',$3,$4,$5)`,
          [eventId,r.player_id,awardYuls,awardExp,`Resultado oficial do evento ${ev.rows[0].title}.`]
        );
        await client.query(
          `INSERT INTO player_admin_history(player_id,action,description)
           VALUES($1,'EVENTO',$2)`,
          [r.player_id,`Resultado oficial: ${r.slot} • ${ev.rows[0].title}${awardYuls?` • +${awardYuls} Yuls`:""}${awardExp?` • +${awardExp} EXP`:""}.`]
        );
      }
      await client.query(
        `UPDATE event_results SET published=1,reward_applied=1,updated_at=NOW() WHERE id=$1`,
        [r.id]
      );
    }
    await client.query("COMMIT");
    res.json({ok:true});
  }catch(e){
    await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Erro ao publicar o resultado."});
  }finally{client.release();}
});


app.get("/api/admin/schedule", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(`
      SELECT s.id,s.title,s.activity_type,s.description,s.activity_date,s.start_time,s.end_time,
             s.location,s.link,s.event_id,s.status,s.featured,s.published,e.title AS event_title
      FROM schedule_activities s LEFT JOIN events e ON e.id=s.event_id
      ORDER BY s.activity_date ASC,s.start_time ASC NULLS LAST,s.id ASC
    `);
    res.json({activities:r.rows.map(a=>({...a,id:Number(a.id),event_id:a.event_id?Number(a.event_id):null,mission_id:a.mission_id?Number(a.mission_id):null,featured:Number(a.featured),published:Number(a.published)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar cronograma administrativo."});}
});

app.post("/api/admin/schedule", requireAdmin, async (req,res)=>{
  const b=req.body||{};
  const title=String(b.title||"").trim(),date=String(b.activity_date||"").trim();
  if(!title||!date)return res.status(400).json({error:"Título e data são obrigatórios."});
  try{
    const r=await pool.query(
      `INSERT INTO schedule_activities(title,activity_type,description,activity_date,start_time,end_time,location,link,event_id,mission_id,status,featured,published)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [title,String(b.activity_type||"ATIVIDADE").trim(),String(b.description||"").trim(),date,
       b.start_time||null,b.end_time||null,String(b.location||"").trim(),String(b.link||"").trim(),
       b.event_id?Number(b.event_id):null,b.mission_id?Number(b.mission_id):null,String(b.status||"AGENDADA").trim().toUpperCase(),
       Number(b.featured)?1:0,Number(b.published??1)?1:0]
    );
    if(Number(b.featured))await pool.query("UPDATE schedule_activities SET featured=0 WHERE id<>$1",[r.rows[0].id]);
    res.json({activity:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao criar atividade."});}
});

app.put("/api/admin/schedule/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Atividade inválida."});
  const title=String(b.title||"").trim(),date=String(b.activity_date||"").trim();
  if(!title||!date)return res.status(400).json({error:"Título e data são obrigatórios."});
  try{
    const r=await pool.query(
      `UPDATE schedule_activities SET title=$1,activity_type=$2,description=$3,activity_date=$4,start_time=$5,end_time=$6,
       location=$7,link=$8,event_id=$9,mission_id=$10,status=$11,featured=$12,published=$13,updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [title,String(b.activity_type||"ATIVIDADE").trim(),String(b.description||"").trim(),date,
       b.start_time||null,b.end_time||null,String(b.location||"").trim(),String(b.link||"").trim(),
       b.event_id?Number(b.event_id):null,b.mission_id?Number(b.mission_id):null,String(b.status||"AGENDADA").trim().toUpperCase(),
       Number(b.featured)?1:0,Number(b.published??1)?1:0,id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Atividade não encontrada."});
    if(Number(b.featured))await pool.query("UPDATE schedule_activities SET featured=0 WHERE id<>$1",[id]);
    res.json({activity:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao atualizar atividade."});}
});

app.delete("/api/admin/schedule/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  try{const r=await pool.query("UPDATE schedule_activities SET status='CANCELADA',published=0,updated_at=NOW() WHERE id=$1 RETURNING id",[id]);if(!r.rowCount)return res.status(404).json({error:"Atividade não encontrada."});res.json({ok:true})}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao arquivar atividade."});}
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


app.get("/api/admin/reports", requireAdmin, async (req,res)=>{
  try{
    const [players,houses,cards,economy,missions,events,battles,statuses,topPower,topActivity,houseStats] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active=1)::int AS active, COUNT(*) FILTER (WHERE active=0)::int AS suspended, COUNT(*) FILTER (WHERE public_profile=1)::int AS public_profiles FROM players`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE COALESCE(status,'ATIVA')='ATIVA')::int AS active FROM houses`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active=1)::int AS active, COALESCE(SUM(power_value) FILTER (WHERE active=1),0)::bigint AS catalog_power FROM cards`),
      pool.query(`SELECT COALESCE(SUM(yuls),0)::bigint AS yuls, COALESCE(SUM(dracmas),0)::bigint AS dracmas FROM players`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='EM_ANDAMENTO')::int AS ongoing, COUNT(*) FILTER (WHERE status='CONCLUIDA')::int AS completed FROM mission_activities`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='EM_ANDAMENTO')::int AS ongoing, COUNT(*) FILTER (WHERE status='CONCLUIDO')::int AS completed FROM events`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='AGUARDANDO_ADMIN')::int AS pending, COUNT(*) FILTER (WHERE status='APROVADA')::int AS approved, COUNT(*) FILTER (WHERE status='REJEITADA')::int AS rejected FROM ranking_battles`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE created_at::date=CURRENT_DATE)::int AS today FROM player_statuses`),
      pool.query(`SELECT id,nick,house,COALESCE(power,0)::bigint AS power FROM players WHERE active=1 ORDER BY COALESCE(power,0) DESC,nick LIMIT 10`),
      pool.query(`SELECT id,nick,house,missions,achievements,(missions+achievements*3)::bigint AS activity FROM players WHERE active=1 ORDER BY activity DESC,nick LIMIT 10`),
      pool.query(`SELECT h.id,h.name,h.emblem,COUNT(p.id)::int AS members,COALESCE(SUM(p.missions),0)::bigint AS missions,COALESCE(SUM(p.yuls),0)::bigint AS yuls,COALESCE(SUM(p.power),0)::bigint AS power FROM houses h LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name)) AND p.active=1 GROUP BY h.id,h.name,h.emblem ORDER BY power DESC,name`)
    ]);
    res.json({players:players.rows[0],houses:houses.rows[0],cards:cards.rows[0],economy:economy.rows[0],missions:missions.rows[0],events:events.rows[0],battles:battles.rows[0],statuses:statuses.rows[0],topPower:topPower.rows,topActivity:topActivity.rows,houseStats:houseStats.rows});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao gerar os relatórios do Reino."});
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
      `INSERT INTO houses(name,emblem,description,leader,vice_leader,motto,color,banner_url,history,goals,achievements,status,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1) RETURNING *`,
      [name,String(b.emblem||"♜").trim()||"♜",String(b.description||"").trim(),
       String(b.leader||"").trim(),String(b.vice_leader||"").trim(),String(b.motto||"").trim(),String(b.color||"").trim(),String(b.banner_url||"").trim(),String(b.history||"").trim(),String(b.goals||"").trim(),String(b.achievements||"").trim(),String(b.status||"ATIVA").trim()]
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
         SET name=$1,emblem=$2,description=$3,leader=$4,vice_leader=$5,motto=$6,color=$7,banner_url=$8,history=$9,goals=$10,achievements=$11,status=$12,active=$13,updated_at=NOW()
         WHERE id=$14 RETURNING *`,
        [name,String(b.emblem||"♜").trim()||"♜",String(b.description||"").trim(),
         String(b.leader||"").trim(),String(b.vice_leader||"").trim(),String(b.motto||"").trim(),String(b.color||"").trim(),String(b.banner_url||"").trim(),String(b.history||"").trim(),String(b.goals||"").trim(),String(b.achievements||"").trim(),String(b.status||"ATIVA").trim(),b.active===false||String(b.active)==='0'?0:1,id]
      );
      if((current.rows[0].leader||"") !== String(b.leader||"").trim() || (current.rows[0].vice_leader||"") !== String(b.vice_leader||"").trim()) {
        await client.query(`INSERT INTO house_history(house_id,event_type,title,description,created_by_admin_id) VALUES ($1,'LIDERANÇA','Atualização da liderança',$2,$3)`, [id, `Liderança registrada: Líder ${String(b.leader||"não definido").trim()||"não definido"}; Vice ${String(b.vice_leader||"não definido").trim()||"não definido"}.`, req.admin?.id || null]);
      }
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
  try {
    const result=await pool.query(`UPDATE houses SET active=0,status='ARQUIVADA',updated_at=NOW() WHERE id=$1 RETURNING id,name`,[id]);
    if(!result.rows[0]) return res.status(404).json({error:"Casa não encontrada."});
    await pool.query(`INSERT INTO house_history(house_id,event_type,title,description,created_by_admin_id) VALUES ($1,'ESTRUTURA','Casa arquivada','A Casa foi retirada da estrutura ativa do Reino, preservando seu histórico.',$2)`,[id,req.admin?.id||null]);
    res.json({ok:true,archived:true});
  } catch(e) { console.error(e); res.status(500).json({error:"Erro ao arquivar Casa."}); }
});

app.post("/api/admin/houses/:id/history", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id), b=req.body||{};
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:"Casa inválida."});
  const title=String(b.title||"").trim();
  if(!title) return res.status(400).json({error:"Título do registro é obrigatório."});
  try {
    const r=await pool.query(`INSERT INTO house_history(house_id,event_type,title,description,event_date,created_by_admin_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[id,String(b.event_type||"REGISTRO").trim(),title,String(b.description||"").trim(),String(b.event_date||new Date().toISOString().slice(0,10)),req.admin?.id||null]);
    res.json({history:r.rows[0]});
  } catch(e){ console.error(e); res.status(500).json({error:"Erro ao registrar histórico da Casa."}); }
});

app.get("/api/admin/hierarchy", requireAdmin, async (req,res) => {
  try {
    const [patents,roles,ranks]=await Promise.all([
      pool.query(`SELECT id,name,description,sort_order FROM patents ORDER BY sort_order ASC,name COLLATE "C" ASC`),
      pool.query(`SELECT id,name,description,salary,sort_order,rank_code,vacancies,payment_mode,remuneration_detail,requirements,benefits,scope,active
                  FROM roles
                  ORDER BY CASE rank_code WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4 WHEN 'V' THEN 5 ELSE 99 END,sort_order ASC,name COLLATE "C" ASC`),
      pool.query(`SELECT id,code,name,description,requirements,sort_order FROM role_ranks ORDER BY sort_order ASC`)
    ]);
    res.json({
      patents:patents.rows.map(x=>({id:Number(x.id),name:x.name,description:x.description||"",sort_order:Number(x.sort_order||0)})),
      roles:roles.rows.map(x=>({id:Number(x.id),name:x.name,description:x.description||"",salary:Number(x.salary||0),sort_order:Number(x.sort_order||0),rank_code:x.rank_code||"",vacancies:x.vacancies||"",payment_mode:x.payment_mode||"",remuneration_detail:x.remuneration_detail||"",requirements:x.requirements||"",benefits:x.benefits||"",scope:x.scope||"",active:Number(x.active??1)})),
      ranks:ranks.rows.map(x=>({id:Number(x.id),code:x.code,name:x.name,description:x.description||"",requirements:x.requirements||"",sort_order:Number(x.sort_order||0)}))
    });
  } catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar hierarquia administrativa."});}
});
app.post("/api/admin/patents", requireAdmin, async (req,res) => {
  const b=req.body||{},name=String(b.name||"").trim();
  if(!name)return res.status(400).json({error:"Nome da patente é obrigatório."});
  try {
    const r=await pool.query(
      `INSERT INTO patents(name,description,sort_order) VALUES ($1,$2,$3) RETURNING *`,
      [name,String(b.description||"").trim(),Number(b.sort_order||0)]
    );
    res.json({patent:r.rows[0]});
  } catch(e){console.error(e);if(e.code==="23505")return res.status(400).json({error:"Essa patente já existe."});res.status(500).json({error:"Erro ao criar patente."});}
});

app.put("/api/admin/patents/:id", requireAdmin, async (req,res) => {
  const id=Number(req.params.id),b=req.body||{},name=String(b.name||"").trim();
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Patente inválida."});
  if(!name)return res.status(400).json({error:"Nome da patente é obrigatório."});
  try {
    const r=await pool.query(
      `UPDATE patents SET name=$1,description=$2,sort_order=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,
      [name,String(b.description||"").trim(),Number(b.sort_order||0),id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Patente não encontrada."});
    res.json({patent:r.rows[0]});
  } catch(e){console.error(e);if(e.code==="23505")return res.status(400).json({error:"Essa patente já existe."});res.status(500).json({error:"Erro ao atualizar patente."});}
});

app.delete("/api/admin/patents/:id", requireAdmin, async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Patente inválida."});
  try {
    const r=await pool.query("SELECT name FROM patents WHERE id=$1",[id]);
    const p=r.rows[0]; if(!p)return res.status(404).json({error:"Patente não encontrada."});
    const used=await pool.query(`SELECT COUNT(*)::int AS c FROM players WHERE lower(trim(patent))=lower(trim($1))`,[p.name]);
    if(used.rows[0].c>0)return res.status(400).json({error:"Essa patente está atribuída a jogadores. Altere as patentes desses jogadores antes de excluir."});
    await pool.query("DELETE FROM patents WHERE id=$1",[id]);
    res.json({ok:true});
  } catch(e){console.error(e);res.status(500).json({error:"Erro ao excluir patente."});}
});

app.post("/api/admin/roles", requireAdmin, async (req,res) => {
  const b=req.body||{},name=String(b.name||"").trim(),rank=String(b.rank_code||"V").trim().toUpperCase();
  if(!name)return res.status(400).json({error:"Nome do cargo é obrigatório."});
  if(!["I","II","III","IV","V"].includes(rank))return res.status(400).json({error:"Rank inválido."});
  try {
    const r=await pool.query(
      `INSERT INTO roles(name,description,salary,sort_order,rank_code,vacancies,payment_mode,remuneration_detail,requirements,benefits,scope,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name,String(b.description||"").trim(),Math.max(0,Math.round(Number(b.salary||0))),Number(b.sort_order||0),rank,
       String(b.vacancies||"").trim(),String(b.payment_mode||"").trim(),String(b.remuneration_detail||"").trim(),
       String(b.requirements||"").trim(),String(b.benefits||"").trim(),String(b.scope||"").trim(),Number(b.active??1)?1:0]
    );
    res.json({role:r.rows[0]});
  } catch(e){console.error(e);if(e.code==="23505")return res.status(400).json({error:"Esse cargo já existe."});res.status(500).json({error:"Erro ao criar cargo."});}
});

app.put("/api/admin/roles/:id", requireAdmin, async (req,res) => {
  const id=Number(req.params.id),b=req.body||{},name=String(b.name||"").trim(),rank=String(b.rank_code||"V").trim().toUpperCase();
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Cargo inválido."});
  if(!name)return res.status(400).json({error:"Nome do cargo é obrigatório."});
  if(!["I","II","III","IV","V"].includes(rank))return res.status(400).json({error:"Rank inválido."});
  try {
    const r=await pool.query(
      `UPDATE roles SET name=$1,description=$2,salary=$3,sort_order=$4,rank_code=$5,vacancies=$6,payment_mode=$7,
       remuneration_detail=$8,requirements=$9,benefits=$10,scope=$11,active=$12,updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [name,String(b.description||"").trim(),Math.max(0,Math.round(Number(b.salary||0))),Number(b.sort_order||0),rank,
       String(b.vacancies||"").trim(),String(b.payment_mode||"").trim(),String(b.remuneration_detail||"").trim(),
       String(b.requirements||"").trim(),String(b.benefits||"").trim(),String(b.scope||"").trim(),Number(b.active??1)?1:0,id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Cargo não encontrado."});
    res.json({role:r.rows[0]});
  } catch(e){console.error(e);if(e.code==="23505")return res.status(400).json({error:"Esse cargo já existe."});res.status(500).json({error:"Erro ao atualizar cargo."});}
});

app.delete("/api/admin/roles/:id", requireAdmin, async (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Cargo inválido."});
  try {
    const r=await pool.query("SELECT name FROM roles WHERE id=$1",[id]);
    const role=r.rows[0]; if(!role)return res.status(404).json({error:"Cargo não encontrado."});
    const used=await pool.query(`SELECT COUNT(*)::int AS c FROM player_roles WHERE role_id=$1`,[id]);
    if(used.rows[0].c>0)return res.status(400).json({error:"Esse cargo está atribuído a jogadores. Remova o cargo desses jogadores antes de excluir."});
    await pool.query("DELETE FROM roles WHERE id=$1",[id]);
    res.json({ok:true});
  } catch(e){console.error(e);res.status(500).json({error:"Erro ao excluir cargo."});}
});


const IMPORT_FIELDS = {
  nick:["nick","nome","jogador","player"],
  login:["login","usuario","username","identificador","identifier"],
  password:["senha","password"],
  number:["numero","número","numero interno","número interno","internal number"],
  house:["casa","house"],
  patent:["patente","patent"],
  roles:["cargos","cargo","roles","role"],
  grimoire:["grimorio","grimoire"],
  hp:["hp","vida"],
  mana:["mana"],
  yuls:["yuls","saldo"],
  exp:["exp","experiencia","experiência"],
  missions:["missoes","missões","missions"],
  achievements:["conquistas","achievements"],
  ranking:["ranking","classificacao","classificação"],
  power:["forca","força","power"],
  public_profile:["perfil publico","perfil público","public profile","publico","público"]
};

function normalizeImportHeader(v){
  return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase()
    .replace(/[_\-\/]+/g," ").replace(/\s+/g," ");
}
function parseImportNumber(v,fallback=0){
  const raw=String(v??"").trim().replace(/\./g,"").replace(",",".");
  if(raw==="")return fallback;
  const n=Number(raw);return Number.isFinite(n)?Math.max(0,Math.round(n)):fallback;
}
function parseImportRows(buffer,filename){
  const lower=String(filename||"").toLowerCase();
  let workbook;
  if(lower.endsWith(".csv")){
    const text=buffer.toString("utf8");
    workbook=XLSX.read(text,{type:"string",raw:true});
  }else{
    workbook=XLSX.read(buffer,{type:"buffer",cellDates:false,raw:true});
  }
  const first=workbook.SheetNames[0];
  if(!first)throw new Error("A planilha não possui nenhuma aba.");
  const sheet=workbook.Sheets[first];
  const raw=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});
  if(!raw.length)throw new Error("A planilha não possui jogadores.");
  return raw.map((row,index)=>{
    const normalized={};
    for(const [k,v] of Object.entries(row)) normalized[normalizeImportHeader(k)]=v;
    const get=(field)=> {
      const keys=IMPORT_FIELDS[field]||[];
      for(const key of keys){
        const value=normalized[normalizeImportHeader(key)];
        if(value!==undefined && String(value).trim()!=="") return String(value).trim();
      }
      return "";
    };
    return {
      row:index+2,
      nick:get("nick"),
      login:get("login"),
      password:get("password"),
      number:get("number"),
      house:get("house"),
      patent:get("patent"),
      roles:get("roles"),
      grimoire:get("grimoire"),
      hp:get("hp"),mana:get("mana"),yuls:get("yuls"),exp:get("exp"),
      missions:get("missions"),achievements:get("achievements"),
      ranking:get("ranking"),power:get("power"),
      public_profile:get("public_profile")
    };
  });
}
async function validateImportRows(rows){
  const issues=[];
  if(!Array.isArray(rows)||!rows.length)return {rows:[],issues:[{row:0,field:"arquivo",message:"Nenhum jogador encontrado."}]};

  const [houses,patents,roles,existing]=await Promise.all([
    pool.query(`SELECT name FROM houses ORDER BY name`),
    pool.query(`SELECT name FROM patents ORDER BY sort_order,name COLLATE "C"`),
    pool.query(`SELECT id,name,rank_code FROM roles WHERE active=1 ORDER BY sort_order,name COLLATE "C"`),
    pool.query(`SELECT id,nick,identifier,number FROM players`)
  ]);

  const houseMap=new Map(houses.rows.map(x=>[normalizeImportHeader(x.name),x.name]));
  const patentMap=new Map(patents.rows.map(x=>[normalizeImportHeader(x.name),x.name]));
  const roleMap=new Map(roles.rows.map(x=>[normalizeImportHeader(x.name),x]));
  const existingLogin=new Set(existing.rows.map(x=>String(x.identifier||"").trim().toLowerCase()).filter(Boolean));
  const existingNick=new Set(existing.rows.map(x=>String(x.nick||"").trim().toLowerCase()).filter(Boolean));

  const seenLogin=new Set(),seenNick=new Set();
  const clean=[];
  for(const r of rows){
    const out={...r,errors:[]};
    const add=(field,message)=>out.errors.push({field,message});
    if(!r.nick)add("nick","Nick é obrigatório.");
    if(!r.login)add("login","Login é obrigatório.");
    if(!r.password || String(r.password).length<6)add("password","Senha obrigatória com pelo menos 6 caracteres.");
    if(r.number && !/^\d+$/.test(String(r.number)))add("number","Número interno deve conter apenas dígitos.");
    if(r.nick){
      const nk=r.nick.toLowerCase();
      if(seenNick.has(nk)||existingNick.has(nk))add("nick","Este nick já existe ou está duplicado na planilha.");
      seenNick.add(nk);
    }
    if(r.login){
      const lg=r.login.toLowerCase();
      if(seenLogin.has(lg)||existingLogin.has(lg)||existingNick.has(lg))add("login","Este login já está em uso ou conflita com um nick existente.");
      seenLogin.add(lg);
    }
    if(r.house){
      const h=houseMap.get(normalizeImportHeader(r.house));
      if(!h)add("house",`Casa não encontrada: ${r.house}`);
      else out.house=h;
    }
    if(r.patent){
      const pt=patentMap.get(normalizeImportHeader(r.patent));
      if(!pt)add("patent",`Patente não encontrada: ${r.patent}`);
      else out.patent=pt;
    }else{
      out.patent="Cavaleiro Mágico Junior";
    }
    const roleNames=r.roles?String(r.roles).split(/[|;,]/).map(x=>x.trim()).filter(Boolean):[];
    const roleIds=[];
    const rankSeen=new Set();
    for(const rn of roleNames){
      const role=roleMap.get(normalizeImportHeader(rn));
      if(!role){add("roles",`Cargo não encontrado: ${rn}`);continue}
      const rank=String(role.rank_code||"").toUpperCase();
      if(rank&&rankSeen.has(rank))add("roles",`Dois cargos do mesmo Rank: ${rank}`);
      if(rank)rankSeen.add(rank);
      roleIds.push(Number(role.id));
    }
    out.role_ids=[...new Set(roleIds)];
    out.role_names=roleNames;
    out.hp=parseImportNumber(r.hp,200);
    out.mana=parseImportNumber(r.mana,400);
    out.yuls=parseImportNumber(r.yuls,0);
    out.exp=parseImportNumber(r.exp,0);
    out.missions=parseImportNumber(r.missions,0);
    out.achievements=parseImportNumber(r.achievements,0);
    out.ranking=parseImportNumber(r.ranking,0);
    out.power=parseImportNumber(r.power,0);
    const pub=normalizeImportHeader(r.public_profile);
    out.public_profile=["0","nao","não","false","oculto","oculta"].includes(pub)?0:1;
    clean.push(out);
  }
  const autoNumbers=new Set(existing.rows.map(x=>String(x.number||"")).filter(Boolean));
  let next=existing.rows.reduce((m,x)=>/^\d+$/.test(String(x.number||""))?Math.max(m,Number(x.number)):m,0)+1;
  for(const r of clean){
    if(!r.number){
      while(autoNumbers.has(String(next)))next++;
      r.number=String(next++);
    }
    if(autoNumbers.has(String(r.number)))r.errors.push({field:"number",message:"Número interno já existe."});
    autoNumbers.add(String(r.number));
    if(!r.roles && false){}
  }
  const resultRows=clean.map(r=>({
    row:r.row,nick:r.nick,login:r.login,number:r.number,house:r.house||"",patent:r.patent||"",
    roles:r.role_names||[],grimoire:r.grimoire||"",hp:r.hp,mana:r.mana,yuls:r.yuls,exp:r.exp,
    missions:r.missions,achievements:r.achievements,ranking:r.ranking,power:r.power,
    public_profile:r.public_profile,errors:r.errors
  }));
  for(const r of resultRows)for(const e of r.errors)issues.push({row:r.row,field:e.field,message:e.message});
  return {rows:resultRows,issues};
}


app.post("/api/admin/players/import/preview", requireAdmin, importUpload.single("file"), async (req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:"Selecione um arquivo."});
    const rows=parseImportRows(req.file.buffer,req.file.originalname);
    const result=await validateImportRows(rows);
    const valid=result.rows.filter(r=>!r.errors.length).length;
    res.json({
      filename:req.file.originalname,
      total:result.rows.length,
      valid,
      invalid:result.rows.length-valid,
      issues:result.issues,
      rows:result.rows
    });
  }catch(e){
    console.error("Import preview error:",e);
    res.status(400).json({error:e.message||"Não foi possível ler a planilha."});
  }
});

app.post("/api/admin/players/import", requireAdmin, importUpload.single("file"), async (req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:"Selecione um arquivo."});
    const rows=parseImportRows(req.file.buffer,req.file.originalname);
    const checked=await validateImportRows(rows);
    if(checked.issues.length){
      return res.status(400).json({
        error:"A importação foi bloqueada porque existem dados inválidos.",
        issues:checked.issues,
        total:checked.rows.length,
        valid:checked.rows.filter(r=>!r.errors.length).length
      });
    }

    const client=await pool.connect();
    let created=0;
    try{
      await client.query("BEGIN");
      for(const r of checked.rows){
        const passwordHash=await bcrypt.hash(String(rows.find(x=>Number(x.row)===Number(r.row)).password),12);
        const result=await client.query(
          `INSERT INTO players
           (nick,number,identifier,password_hash,house,patent,role,grimoire,hp,mana,yuls,exp,missions,achievements,ranking,power,public_profile)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           RETURNING id,yuls`,
          [
            r.nick,r.number,r.login,passwordHash,r.house,r.patent,
            r.roles[0]||"",r.grimoire,r.hp,r.mana,r.yuls,r.exp,r.missions,r.achievements,r.ranking,r.power,r.public_profile
          ]
        );
        const playerId=Number(result.rows[0].id);
        for(const roleId of ((await validateRoleIdsForImport(r.roles))||[])){
          await client.query(`INSERT INTO player_roles(player_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[playerId,roleId]);
        }
        if(r.yuls>0){
          await client.query(
            `INSERT INTO yuls_history(player_id,amount,reason,balance_after) VALUES($1,$2,$3,$4)`,
            [playerId,r.yuls,"Saldo inicial importado",r.yuls]
          );
        }
        await client.query(
          `INSERT INTO player_admin_history(player_id,action,description)
           VALUES($1,'IMPORTAÇÃO', $2)`,
          [playerId,`Jogador importado em massa. Login: ${r.login}.`]
        );
        created++;
      }
      await client.query("COMMIT");
      res.json({ok:true,created});
    }catch(e){
      await client.query("ROLLBACK");
      console.error("Import commit error:",e);
      if(e.code==="23505")return res.status(400).json({error:"A importação encontrou um identificador ou registro duplicado. Nenhuma alteração foi aplicada."});
      res.status(500).json({error:"Erro ao importar os jogadores. Nenhuma alteração foi aplicada."});
    }finally{client.release();}
  }catch(e){
    console.error("Import error:",e);
    res.status(400).json({error:e.message||"Não foi possível importar os jogadores."});
  }
});

async function validateRoleIdsForImport(roleNames){
  const names=Array.isArray(roleNames)?roleNames:[];
  if(!names.length)return [];
  const result=await pool.query(
    `SELECT id,name,rank_code FROM roles WHERE active=1 AND lower(name)=ANY($1::text[])`,
    [names.map(x=>String(x).toLowerCase())]
  );
  return result.rows.map(x=>Number(x.id));
}

app.get("/api/admin/players", requireAdmin, async (req, res) => {
  try {
    const result=await pool.query(`
      SELECT p.*,
             COALESCE(json_agg(json_build_object(
               'id',r.id,'name',r.name,'description',r.description,
               'salary',r.salary,'sort_order',r.sort_order
             ) ORDER BY r.sort_order,r.name) FILTER (WHERE r.id IS NOT NULL),'[]'::json) AS roles
      FROM players p
      LEFT JOIN player_roles pr ON pr.player_id=p.id
      LEFT JOIN roles r ON r.id=pr.role_id
      GROUP BY p.id
      ORDER BY p.nick COLLATE "C" ASC
    `);
    res.json({players:result.rows.map(r=>({
      ...publicPlayer(r),
      roles:r.roles||[],
      public_profile:Number(r.public_profile),
      active:Number(r.active ?? 1),
      has_password:Boolean(r.password_hash),
      created_at:r.created_at,
      updated_at:r.updated_at
    }))});
  } catch(e) {
    console.error(e);
    res.status(500).json({error:"Erro ao carregar jogadores administrativos."});
  }
});


app.post("/api/admin/players/bulk", requireAdmin, async (req,res)=>{
  const b=req.body||{};
  const ids=[...new Set((Array.isArray(b.player_ids)?b.player_ids:[])
    .map(Number).filter(x=>Number.isInteger(x)&&x>0))];
  const action=String(b.action||"").trim();

  if(!ids.length)return res.status(400).json({error:"Selecione pelo menos um jogador."});
  if(!["add_yuls","remove_yuls","set_house","set_patent","set_roles","set_missions","add_missions","set_power","set_public","set_active"].includes(action)){
    return res.status(400).json({error:"Ação inválida."});
  }
  if(action==="set_roles"){
    const roleCheck=await validateRoleRanks(b.role_ids);
    if(!roleCheck.ok)return res.status(400).json({error:roleCheck.error});
  }

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const pr=await client.query(`SELECT * FROM players WHERE id=ANY($1::bigint[]) FOR UPDATE`,[ids]);
    if(pr.rows.length!==ids.length){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"Um ou mais jogadores não foram encontrados."});
    }

    if(action==="add_yuls"||action==="remove_yuls"){
      const amount=Math.round(Number(b.amount||0));
      if(!Number.isFinite(amount)||amount<=0){
        await client.query("ROLLBACK");
        return res.status(400).json({error:"Informe um valor de Yuls maior que zero."});
      }
      const delta=action==="add_yuls"?amount:-amount;
      const reason=String(b.reason||"Movimentação administrativa em massa").trim();

      for(const player of pr.rows){
        const newBalance=Number(player.yuls||0)+delta;
        if(newBalance<0){
          await client.query("ROLLBACK");
          return res.status(400).json({error:`A ação deixaria ${player.nick}${player.number} com saldo negativo.`});
        }
        await client.query("UPDATE players SET yuls=$1,updated_at=NOW() WHERE id=$2",[newBalance,player.id]);
        await client.query(
          `INSERT INTO yuls_history(player_id,amount,reason,balance_after) VALUES ($1,$2,$3,$4)`,
          [player.id,delta,reason,newBalance]
        );
        await client.query(`INSERT INTO economy_transactions(player_id,currency,amount,reason,source_type,status,activity_date,approval_date,payment_date,created_by_admin_id,approved_by_admin_id,paid_by_admin_id) VALUES($1,'YULS',$2,$3,'LEGADO_EM_MASSA','PAGA',CURRENT_DATE,NOW(),NOW(),$4,$4,$4)`,[player.id,delta,reason,req.admin.id]);
      }
    }

    if(action==="set_house"){
      const id=Number(b.house_id||0);
      const r=await client.query("SELECT name FROM houses WHERE id=$1",[id]);
      if(!r.rows[0]){await client.query("ROLLBACK");return res.status(400).json({error:"Casa não encontrada."});}
      await client.query("UPDATE players SET house=$1,updated_at=NOW() WHERE id=ANY($2::bigint[])",[r.rows[0].name,ids]);
    }

    if(action==="set_patent"){
      const id=Number(b.patent_id||0);
      const r=await client.query("SELECT name FROM patents WHERE id=$1",[id]);
      if(!r.rows[0]){await client.query("ROLLBACK");return res.status(400).json({error:"Patente não encontrada."});}
      await client.query("UPDATE players SET patent=$1,updated_at=NOW() WHERE id=ANY($2::bigint[])",[r.rows[0].name,ids]);
    }

    if(action==="set_roles"){
      const roleIds=[...new Set((Array.isArray(b.role_ids)?b.role_ids:[])
        .map(Number).filter(x=>Number.isInteger(x)&&x>0))];
      const valid=roleIds.length
        ? await client.query(`SELECT id FROM roles WHERE id=ANY($1::bigint[])`,[roleIds])
        : {rows:[]};
      await client.query("DELETE FROM player_roles WHERE player_id=ANY($1::bigint[])",[ids]);
      for(const playerId of ids){
        for(const role of valid.rows){
          await client.query(
            `INSERT INTO player_roles(player_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [playerId,Number(role.id)]
          );
        }
      }
    }

    if(action==="set_missions"||action==="add_missions"){
      const amount=Math.round(Number(b.amount||0));
      if(!Number.isFinite(amount)||amount<0){
        await client.query("ROLLBACK");
        return res.status(400).json({error:"Quantidade de missões inválida."});
      }
      for(const player of pr.rows){
        const value=action==="add_missions"?Number(player.missions||0)+amount:amount;
        await client.query("UPDATE players SET missions=$1,updated_at=NOW() WHERE id=$2",[value,player.id]);
      }
    }

    if(action==="set_power"){
      const amount=Math.round(Number(b.amount||0));
      if(!Number.isFinite(amount)||amount<0){
        await client.query("ROLLBACK");
        return res.status(400).json({error:"Valor de força inválido."});
      }
      await client.query("UPDATE players SET power=$1,updated_at=NOW() WHERE id=ANY($2::bigint[])",[amount,ids]);
    }

    if(action==="set_public"){
      const visible=Number(b.public_profile)?1:0;
      await client.query("UPDATE players SET public_profile=$1,updated_at=NOW() WHERE id=ANY($2::bigint[])",[visible,ids]);
    }

    if(action==="set_active"){
      const active=Number(b.active)?1:0;
      await client.query("UPDATE players SET active=$1,updated_at=NOW() WHERE id=ANY($2::bigint[])",[active,ids]);
    }

    const descriptions={
      add_yuls:"Yuls adicionados em massa pela administração.",
      remove_yuls:"Yuls retirados em massa pela administração.",
      set_house:`Casa definida em massa: ${String(b.house_id||"")}.`,
      set_patent:`Patente definida em massa: ${String(b.patent_id||"")}.`,
      set_roles:"Cargos definidos em massa pela administração.",
      set_missions:"Missões ajustadas em massa pela administração.",
      add_missions:"Missões adicionadas em massa pela administração.",
      set_power:"Força ajustada em massa pela administração.",
      set_public:Number(b.public_profile)?"Perfis tornados públicos em massa.":"Perfis ocultados em massa.",
      set_active:Number(b.active)?"Jogadores reativados em massa.":"Jogadores suspensos em massa."
    };
    await client.query(
      `INSERT INTO player_admin_history(player_id,action,description)
       SELECT unnest($1::bigint[]), 'AÇÃO EM MASSA', $2`,
      [ids,descriptions[action]||"Ação administrativa em massa."]
    );

    await client.query("COMMIT");
    res.json({ok:true,changed:ids.length});
  }catch(e){
    await client.query("ROLLBACK");
    console.error("Erro em /api/admin/players/bulk:",e);
    res.status(500).json({error:"Erro ao executar ação em massa."});
  }finally{
    client.release();
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
    const roles=await getPlayerRoles(id);
    res.json({
      player: {
        ...publicPlayer(player),
        roles,
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




async function refreshPlayerCardPower(client, playerId){
  await client.query(`UPDATE players p SET power=COALESCE((SELECT SUM(c.power_value) FROM player_cards pc JOIN cards c ON c.id=pc.card_id WHERE pc.player_id=p.id),0),updated_at=NOW() WHERE p.id=$1`,[playerId]);
}

app.post("/api/admin/cards/distribute", requireAdmin, async (req,res)=>{
  const body=req.body||{};
  const playerIds=[...new Set((Array.isArray(body.player_ids)?body.player_ids:[])
    .map(Number).filter(x=>Number.isInteger(x)&&x>0))];
  const cardId=Number(body.card_id);
  const acquisitionType=String(body.acquisition_type||"OUTRO").trim().toUpperCase();
  const acquisitionName=String(body.acquisition_name||"").trim();
  const acquisitionId=(body.acquisition_id!==undefined&&body.acquisition_id!=="")?Number(body.acquisition_id):null;
  const validTypes=["MISSAO","EVENTO","LOJA","PATENTE","OUTRO"];

  if(!playerIds.length)return res.status(400).json({error:"Selecione pelo menos um jogador."});
  if(!Number.isInteger(cardId)||cardId<=0)return res.status(400).json({error:"Selecione um card."});
  if(!validTypes.includes(acquisitionType))return res.status(400).json({error:"Origem inválida."});
  if(!acquisitionName && !acquisitionId)return res.status(400).json({error:"Informe a origem do card."});

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const cr=await client.query(
      "SELECT id,name,COALESCE(category,type) AS category,active FROM cards WHERE id=$1 FOR UPDATE",[cardId]
    );
    if(!cr.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Card não encontrado."});}
    if(!Number(cr.rows[0].active)){await client.query("ROLLBACK");return res.status(400).json({error:"Este card está desativado."});}

    const prs=await client.query(
      `SELECT id,nick,house FROM players WHERE id=ANY($1::bigint[]) ORDER BY nick COLLATE "C"`,[playerIds]
    );
    if(prs.rows.length!==playerIds.length){
      const found=new Set(prs.rows.map(x=>Number(x.id)));
      const missing=playerIds.filter(id=>!found.has(id));
      await client.query("ROLLBACK");
      return res.status(404).json({error:`Jogador(es) não encontrado(s): ${missing.join(", ")}`});
    }

    const added=[],skipped=[];
    for(const pr of prs.rows){
      const existing=await client.query(
        "SELECT 1 FROM player_cards WHERE player_id=$1 AND card_id=$2",[pr.id,cardId]
      );
      if(existing.rows[0]){
        skipped.push({player_id:Number(pr.id),nick:pr.nick,reason:"Já possui este card."});
        continue;
      }

      let resolvedName=acquisitionName;
      let resolvedId=acquisitionId;

      if(acquisitionType==="MISSAO" && resolvedId){
        const mr=await client.query(
          "SELECT id,title FROM missions WHERE id=$1 AND player_id=$2",[resolvedId,pr.id]
        );
        if(!mr.rows[0]){
          skipped.push({player_id:Number(pr.id),nick:pr.nick,reason:"A missão informada não pertence a este jogador."});
          continue;
        }
        resolvedName=mr.rows[0].title;
      }
      if(!resolvedName){
        skipped.push({player_id:Number(pr.id),nick:pr.nick,reason:"Origem não informada."});
        continue;
      }

      await client.query(
        `INSERT INTO player_cards(player_id,card_id,quantity,acquisition_type,acquisition_id,acquisition_name,acquired_at,updated_at)
         VALUES($1,$2,1,$3,$4,$5,NOW(),NOW())`,
        [pr.id,cardId,acquisitionType,resolvedId,resolvedName]
      );
      await client.query(
        `INSERT INTO player_card_history(player_id,card_id,action,acquisition_type,acquisition_id,acquisition_name,notes)
         VALUES($1,$2,'ADQUIRIDO',$3,$4,$5,$6)`,
        [pr.id,cardId,acquisitionType,resolvedId,resolvedName,"Card distribuído pela administração em massa."]
      );
      await client.query(
        `INSERT INTO player_admin_history(player_id,action,description)
         VALUES($1,'CARDS',$2)`,
        [pr.id,`Card adquirido: ${cr.rows[0].name} • origem ${acquisitionType}${resolvedName?` — ${resolvedName}`:""}. Distribuição em massa.`]
      );
      added.push({player_id:Number(pr.id),nick:pr.nick});
    }

    for(const pr of prs.rows){ await refreshPlayerCardPower(client, pr.id); }
    await client.query("COMMIT");
    res.json({
      ok:true,
      card:{id:Number(cr.rows[0].id),name:cr.rows[0].name,category:cr.rows[0].category||"Outros"},
      added,skipped,total:playerIds.length
    });
  }catch(e){
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({error:"Erro ao distribuir o card."});
  }finally{client.release();}
});

app.get("/api/admin/players/:id/cards", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Jogador inválido."});
  try{
    const r=await pool.query(
      `SELECT c.id,c.name,COALESCE(c.category,c.type) AS category,c.cost,c.description,c.active,
              pc.acquisition_type,pc.acquisition_id,pc.acquisition_name,pc.acquired_at,pc.updated_at
       FROM player_cards pc
       JOIN cards c ON c.id=pc.card_id
       WHERE pc.player_id=$1
       ORDER BY COALESCE(c.category,c.type),c.sort_order,c.name COLLATE "C"`,
      [id]
    );
    res.json({
      cards:r.rows.map(c=>({
        id:Number(c.id),name:c.name,category:c.category||"Outros",cost:c.cost||"",
        description:c.description||"",active:Number(c.active),
        acquisition_type:c.acquisition_type||"OUTRO",
        acquisition_id:c.acquisition_id?Number(c.acquisition_id):null,
        acquisition_name:c.acquisition_name||"",
        acquired_at:c.acquired_at,updated_at:c.updated_at
      }))
    });
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar cards do jogador."});
  }
});

app.post("/api/admin/players/:id/cards", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  const cardId=Number(b.card_id);
  const mode=String(b.mode||"add");
  const acquisitionType=String(b.acquisition_type||"OUTRO").trim().toUpperCase();
  const acquisitionName=String(b.acquisition_name||"").trim();
  const acquisitionId=(b.acquisition_id!==undefined && b.acquisition_id!=="")?Number(b.acquisition_id):null;

  const validTypes=["MISSAO","EVENTO","LOJA","PATENTE","OUTRO"];
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Jogador inválido."});
  if(!Number.isInteger(cardId)||cardId<=0)return res.status(400).json({error:"Card inválido."});
  if(!["add","remove"].includes(mode))return res.status(400).json({error:"Modo inválido."});
  if(!validTypes.includes(acquisitionType))return res.status(400).json({error:"Origem inválida."});

  const client=await pool.connect();
  try{
    await client.query("BEGIN");

    const pr=await client.query(
      "SELECT id,nick FROM players WHERE id=$1 FOR UPDATE",[id]
    );
    const cr=await client.query(
      "SELECT id,name,COALESCE(category,type) AS category,active FROM cards WHERE id=$1 FOR UPDATE",[cardId]
    );
    if(!pr.rows[0]||!cr.rows[0]){
      await client.query("ROLLBACK");
      return res.status(404).json({error:"Jogador ou card não encontrado."});
    }

    const existing=await client.query(
      "SELECT player_id FROM player_cards WHERE player_id=$1 AND card_id=$2 FOR UPDATE",
      [id,cardId]
    );

    if(mode==="add" && existing.rows[0]){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"Este jogador já possui esse card. Cards são únicos no inventário."});
    }
    if(mode==="remove" && !existing.rows[0]){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"Este jogador não possui esse card."});
    }

    let resolvedName=acquisitionName;
    let resolvedId=acquisitionId;

    if(mode==="add"){
      if(acquisitionType==="MISSAO"){
        if(!resolvedId){
          await client.query("ROLLBACK");
          return res.status(400).json({error:"Selecione a missão que concedeu o card."});
        }
        const mr=await client.query(
          "SELECT id,title FROM missions WHERE id=$1 AND player_id=$2",
          [resolvedId,id]
        );
        if(!mr.rows[0]){
          await client.query("ROLLBACK");
          return res.status(400).json({error:"A missão selecionada não pertence a este jogador."});
        }
        resolvedName=mr.rows[0].title;
      }else if(!resolvedName){
        await client.query("ROLLBACK");
        return res.status(400).json({error:"Informe a origem da aquisição."});
      }

      await client.query(
        `INSERT INTO player_cards(player_id,card_id,quantity,acquisition_type,acquisition_id,acquisition_name,acquired_at,updated_at)
         VALUES ($1,$2,1,$3,$4,$5,NOW(),NOW())`,
        [id,cardId,acquisitionType,resolvedId,resolvedName]
      );

      await client.query(
        `INSERT INTO player_card_history(player_id,card_id,action,acquisition_type,acquisition_id,acquisition_name,notes)
         VALUES ($1,$2,'ADQUIRIDO',$3,$4,$5,$6)`,
        [id,cardId,acquisitionType,resolvedId,resolvedName,"Card adicionado ao inventário."]
      );

      await client.query(
        `INSERT INTO player_admin_history(player_id,action,description)
         VALUES ($1,'CARDS',$2)`,
        [id,`Card adquirido: ${cr.rows[0].name} • origem ${acquisitionType}${resolvedName?` — ${resolvedName}`:""}.`]
      );
    }else{
      const current=await client.query(
        `SELECT acquisition_type,acquisition_id,acquisition_name
         FROM player_cards WHERE player_id=$1 AND card_id=$2`,
        [id,cardId]
      );
      const old=current.rows[0]||{};
      await client.query(
        "DELETE FROM player_cards WHERE player_id=$1 AND card_id=$2",[id,cardId]
      );
      await client.query(
        `INSERT INTO player_card_history(player_id,card_id,action,acquisition_type,acquisition_id,acquisition_name,notes)
         VALUES ($1,$2,'REMOVIDO',$3,$4,$5,$6)`,
        [id,cardId,old.acquisition_type||"OUTRO",old.acquisition_id||null,old.acquisition_name||"","Card removido do inventário."]
      );
      await client.query(
        `INSERT INTO player_admin_history(player_id,action,description)
         VALUES ($1,'CARDS',$2)`,
        [id,`Card removido: ${cr.rows[0].name}.`]
      );
    }

    await refreshPlayerCardPower(client, playerId);
    await client.query("COMMIT");
    res.json({ok:true,card:{
      id:Number(cr.rows[0].id),name:cr.rows[0].name,category:cr.rows[0].category||"Outros"
    }});
  }catch(e){
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({error:"Erro ao atualizar inventário de cards."});
  }finally{
    client.release();
  }
});


app.get("/api/admin/players/:id/history", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Jogador inválido."});
  try{
    const [adminH,yulsH,missionsH,cardsH]=await Promise.all([
      pool.query(
        `SELECT id,action,description,created_at
         FROM player_admin_history
         WHERE player_id=$1 ORDER BY id DESC LIMIT 100`,[id]
      ),
      pool.query(
        `SELECT id,amount,reason,balance_after,created_at
         FROM yuls_history WHERE player_id=$1 ORDER BY id DESC LIMIT 100`,[id]
      ),
      pool.query(
        `SELECT id,title,status,reward_yuls,completed_at,created_at
         FROM missions WHERE player_id=$1 ORDER BY id DESC LIMIT 100`,[id]
      ),
      pool.query(
        `SELECT h.id,h.card_id,h.action,h.acquisition_type,h.acquisition_name,h.notes,h.created_at,c.name AS card_name
         FROM player_card_history h
         JOIN cards c ON c.id=h.card_id
         WHERE h.player_id=$1 ORDER BY h.id DESC LIMIT 100`,[id]
      )
    ]);
    res.json({
      admin:adminH.rows.map(x=>({id:Number(x.id),action:x.action,description:x.description,created_at:x.created_at})),
      yuls:yulsH.rows.map(x=>({id:Number(x.id),amount:Number(x.amount),reason:x.reason,balance_after:Number(x.balance_after),created_at:x.created_at})),
      missions:missionsH.rows.map(x=>({id:Number(x.id),title:x.title,status:x.status,reward_yuls:Number(x.reward_yuls||0),completed_at:x.completed_at,created_at:x.created_at})),
      cards:cardsH.rows.map(x=>({
        id:Number(x.id),card_id:Number(x.card_id),card_name:x.card_name,
        action:x.action,acquisition_type:x.acquisition_type||"OUTRO",
        acquisition_name:x.acquisition_name||"",notes:x.notes||"",created_at:x.created_at
      }))
    });
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar histórico administrativo."});
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

async function getPlayerRoles(playerId){
  const result=await pool.query(
    `SELECT r.id,r.name,r.description,r.salary,r.sort_order,r.rank_code,r.vacancies
     FROM roles r
     JOIN player_roles pr ON pr.role_id=r.id
     WHERE pr.player_id=$1
     ORDER BY r.sort_order,r.name COLLATE "C" ASC`,
    [playerId]
  );
  return result.rows.map(r=>({
    id:Number(r.id),name:r.name,description:r.description||"",
    salary:Number(r.salary||0),sort_order:Number(r.sort_order||0)
  }));
}

async function normalizeRoleIds(roleIds){
  const ids=[...new Set((Array.isArray(roleIds)?roleIds:[])
    .map(Number).filter(x=>Number.isInteger(x)&&x>0))];
  if(!ids.length)return [];
  const result=await pool.query(`SELECT id FROM roles WHERE id=ANY($1::bigint[])`,[ids]);
  return result.rows.map(r=>Number(r.id));
}

async function validateNewPassword(password) {
  const value = String(password || "");
  if (value.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  if (value.length > 100) throw new Error("A senha é muito longa.");
  return bcrypt.hash(value, 12);
}


async function logPlayerAdminAction(client, playerId, action, description){
  await client.query(
    `INSERT INTO player_admin_history(player_id,action,description) VALUES ($1,$2,$3)`,
    [playerId,action,description]
  );
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

  const roleIds=await normalizeRoleIds(b.role_ids);
  const identifier = `${nick}${number}`;
  try {
    const passwordHash = await validateNewPassword(password);
    const result = await pool.query(
      `INSERT INTO players
       (nick,number,identifier,password_hash,house,patent,role,grimoire,hp,mana,yuls,missions,achievements,ranking,power,public_profile)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        nick, number, identifier, passwordHash,
        String(b.house || ""), String(b.patent || "Cavaleiro Mágico Junior"),
        String(b.role || ""), String(b.grimoire || ""),
        positiveInt(b.hp, 200), positiveInt(b.mana, 400), positiveInt(b.yuls, 0),
        positiveInt(b.missions, 0), positiveInt(b.achievements, 0), positiveInt(b.ranking, 0),
        positiveInt(b.power, 0), Number(b.public_profile ?? 1) ? 1 : 0
      ]
    );
    const player = result.rows[0];
    for(const roleId of roleIds){
      await pool.query(`INSERT INTO player_roles(player_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,[player.id,roleId]);
    }
    if (Number(player.yuls) !== 0) {
      await pool.query(
        `INSERT INTO yuls_history(player_id,amount,reason,balance_after)
         VALUES ($1,$2,$3,$4)`,
        [player.id, Number(player.yuls), "Saldo inicial", Number(player.yuls)]
      );
    }
    await pool.query(
      `INSERT INTO player_admin_history(player_id,action,description)
       VALUES ($1,$2,$3)`,
      [player.id,"CADASTRO","Jogador cadastrado pela administração."]
    );
    res.json({ player: { ...publicPlayer(player), public_profile: Number(player.public_profile), has_password: true } });
  } catch (e) {
    console.error(e);
    if (e.code === "23505") return res.status(400).json({ error: "Não foi possível criar. O identificador já existe." });
    if (e.message?.includes("Senha")) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: "Erro ao criar jogador." });
  }
});

async function validateRoleRanks(roleIds){
  const ids=[...new Set((Array.isArray(roleIds)?roleIds:[]).map(Number).filter(x=>Number.isInteger(x)&&x>0))];
  if(!ids.length)return {ok:true};
  const r=await pool.query(`SELECT id,name,rank_code FROM roles WHERE id=ANY($1::bigint[])`,[ids]);
  if(r.rows.length!==ids.length)return {ok:false,error:"Um ou mais cargos não foram encontrados."};
  const seen=new Set();
  for(const role of r.rows){
    const rank=String(role.rank_code||"").toUpperCase();
    if(rank&&seen.has(rank))return {ok:false,error:`Um jogador não pode exercer dois cargos da mesma hierarquia (${rank}).`};
    if(rank)seen.add(rank);
  }
  return {ok:true};
}

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

  const roleIds=await normalizeRoleIds(b.role_ids);
  const roleCheck=await validateRoleRanks(roleIds);
  if(!roleCheck.ok)return res.status(400).json({error:roleCheck.error});
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
           power=$15, public_profile=$16, active=$17, updated_at=NOW()
       WHERE id=$18
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
        positiveInt(b.power, Number(current.power || 0)),
        Number(b.public_profile ?? current.public_profile) ? 1 : 0,
        Number(b.active ?? current.active ?? 1) ? 1 : 0,
        id
      ]
    );
    const updated = result.rows[0];
    await client.query("DELETE FROM player_roles WHERE player_id=$1",[id]);
    for(const roleId of roleIds){
      await client.query(`INSERT INTO player_roles(player_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,[id,roleId]);
    }
    const diff = newYuls - Number(current.yuls);
    if (diff !== 0) {
      await client.query(
        `INSERT INTO yuls_history(player_id,amount,reason,balance_after)
         VALUES ($1,$2,$3,$4)`,
        [id, diff, String(b.yuls_reason || "Ajuste administrativo"), newYuls]
      );
    }

    const changes=[];
    if(String(current.nick||"")!==nick) changes.push(`Nick: ${current.nick} → ${nick}`);
    if(String(current.number||"")!==number) changes.push("Número interno alterado");
    if(String(current.house||"")!==String(b.house ?? current.house ?? "")) changes.push(`Casa: ${current.house||"—"} → ${String(b.house ?? current.house ?? "")||"—"}`);
    if(String(current.patent||"")!==String(b.patent ?? current.patent ?? "")) changes.push(`Patente: ${current.patent||"—"} → ${String(b.patent ?? current.patent ?? "")||"—"}`);
    if(String(current.grimoire||"")!==String(b.grimoire ?? current.grimoire ?? "")) changes.push("Grimório alterado");
    if(Number(current.hp||0)!==positiveInt(b.hp,Number(current.hp))) changes.push(`HP: ${Number(current.hp||0)} → ${positiveInt(b.hp,Number(current.hp))}`);
    if(Number(current.mana||0)!==positiveInt(b.mana,Number(current.mana))) changes.push(`Mana: ${Number(current.mana||0)} → ${positiveInt(b.mana,Number(current.mana))}`);
    if(Number(current.missions||0)!==positiveInt(b.missions,Number(current.missions))) changes.push(`Missões: ${Number(current.missions||0)} → ${positiveInt(b.missions,Number(current.missions))}`);
    if(Number(current.achievements||0)!==positiveInt(b.achievements,Number(current.achievements))) changes.push(`Conquistas: ${Number(current.achievements||0)} → ${positiveInt(b.achievements,Number(current.achievements))}`);
    if(Number(current.ranking||0)!==positiveInt(b.ranking,Number(current.ranking))) changes.push(`Ranking: ${Number(current.ranking||0)} → ${positiveInt(b.ranking,Number(current.ranking))}`);
    if(Number(current.power||0)!==positiveInt(b.power,Number(current.power||0))) changes.push(`Força: ${Number(current.power||0)} → ${positiveInt(b.power,Number(current.power||0))}`);
    if(Number(current.public_profile)!==Number(b.public_profile ?? current.public_profile)) changes.push(`Perfil ${Number(b.public_profile ?? current.public_profile)?"publicado":"ocultado"}`);
    if(Number(current.active ?? 1)!==Number(b.active ?? current.active ?? 1)) changes.push(`Acesso ${Number(b.active ?? current.active ?? 1)?"ativado":"suspenso"}`);
    if(String(b.password||"").length>0) changes.push("Senha alterada");

    if(changes.length){
      await client.query(
        `INSERT INTO player_admin_history(player_id,action,description)
         VALUES ($1,$2,$3)`,
        [id,"EDIÇÃO",changes.join(" • ")]
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
    await client.query(`INSERT INTO economy_transactions(player_id,currency,amount,reason,source_type,status,activity_date,approval_date,payment_date,created_by_admin_id,approved_by_admin_id,paid_by_admin_id) VALUES($1,'YULS',$2,$3,'LEGADO','PAGA',CURRENT_DATE,NOW(),NOW(),$4,$4,$4)`,[id,amount,reason,req.admin.id]);
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
    const result=await pool.query("UPDATE players SET active=0, updated_at=NOW() WHERE id=$1 RETURNING id", [id]);
    if(!result.rows[0]) return res.status(404).json({error:"Jogador não encontrado."});
    await pool.query(`INSERT INTO player_admin_history(player_id,action,description) VALUES($1,'SUSPENSÃO','Acesso do jogador suspenso pela administração. O cadastro e o histórico foram preservados.')`,[id]);
    res.json({ ok: true, archived: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao suspender jogador." });
  }
});

app.post("/api/admin/players/:id/status", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  const active=Number(req.body?.active)?1:0;
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Jogador inválido."});
  try{
    const result=await pool.query("UPDATE players SET active=$1,updated_at=NOW() WHERE id=$2 RETURNING *",[active,id]);
    if(!result.rows[0])return res.status(404).json({error:"Jogador não encontrado."});
    await pool.query(`INSERT INTO player_admin_history(player_id,action,description) VALUES($1,$2,$3)`,[id,active?"ATIVAÇÃO":"SUSPENSÃO",active?"Acesso do jogador reativado pela administração.":"Acesso do jogador suspenso pela administração."]);
    res.json({ok:true,player:{...publicPlayer(result.rows[0]),active}});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao alterar status do jogador."});}
});

app.post("/api/admin/news", requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || "").trim()) return res.status(400).json({ error: "Título obrigatório." });
  try {
    const result = await pool.query(
      `INSERT INTO news(title,category,excerpt,body,image_url,date,published) VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING *`,
      [
        String(b.title), String(b.category || "RPG"), String(b.excerpt || ""),
        String(b.body || ""), String(b.image_url || ""),
        String(b.date || new Date().toISOString().slice(0, 10))
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
      `INSERT INTO editions(title,edition,description,pdf_url,cover_url,date,published) VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING *`,
      [
        String(b.title), String(b.edition || ""), String(b.description || ""),
        String(b.pdf_url || ""), String(b.cover_url || ""),
        String(b.date || new Date().toISOString().slice(0, 10))
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
