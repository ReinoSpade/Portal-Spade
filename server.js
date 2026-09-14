const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
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
  notifications: "Notificações & Alertas",
  allies: "Aliados Ocultos",
  simulator_trainings: "Simulador — gerenciar treinamentos",
  emblems: "Emblems — gerenciar catálogo",

  // Permissões de ação: continuam separadas das permissões de módulo.
  players_write: "Jogadores — criar/editar",
  players_import: "Jogadores — importar por planilha",
  players_delete: "Jogadores — excluir",
  cards_write: "Cards — criar/editar",
  cards_import: "Cards — importar por planilha",
  cards_assign: "Cards — vincular a jogadores/aliados",
  cards_delete: "Cards — excluir",
  missions_write: "Missões — criar/editar",
  missions_import: "Missões — importar por planilha",
  missions_delete: "Missões — excluir",
  events_write: "Eventos — criar/editar",
  events_delete: "Eventos — excluir",
  economy_write: "Economia — movimentar/aprovar",
  houses_write: "Casas — criar/editar",
  houses_import: "Casas — importar por planilha",
  hierarchy_write: "Hierarquia — criar/editar",
  hierarchy_import: "Hierarquia — importar por planilha",
  journal_write: "Jornal — criar/editar",
  announcements_write: "Comunicados — criar/editar",
  library_write: "Biblioteca — criar/editar",
  rankings_write: "Rankings — aprovar/rejeitar",
  notifications_write: "Notificações — criar",
  allies_write: "Aliados — criar/editar",
  admin_users_write: "Administradores — criar/alterar/desativar",
  backup_export: "Backup — exportar dados",
  emblems_write: "Emblems — criar/editar",
  emblems_grant: "Emblems — conceder/revogar"
};
const ALL_ADMIN_PERMISSIONS = Object.fromEntries(Object.keys(ADMIN_PERMISSION_DEFS).map(k => [k, true]));

function adminPermissionForRequest(req) {
  const rawPath = req.path || "";
  const path = rawPath.startsWith("/api/admin") ? (rawPath.slice("/api/admin".length) || "/") : rawPath;
  if (path === "/me") return null;
  if (path.startsWith("/permissions") || path.startsWith("/admins")) return "admin_users";
  if (path === "/reports") return "reports";
  if (path === "/audit") return "audit";
  if (path.startsWith("/settings") || path.startsWith("/backup") || path.startsWith("/health")) return "settings";
  if (path === "/overview") return "dashboard";
  if (path.startsWith("/grimoire")) return "players";
  if (path.startsWith("/cards")) return "cards";
  if (path.startsWith("/missions")) return "missions";
  if (path.startsWith("/events")) return "events";
  if (path.startsWith("/schedule")) return "schedule";
  if (path.startsWith("/houses")) return "houses";
  if (path.startsWith("/hierarchy") || path.startsWith("/patents") || path.startsWith("/roles")) return "hierarchy";
  if (path.startsWith("/journal") || path.startsWith("/articles") || path.startsWith("/editions")) return "journal";
  if (path.startsWith("/announcements")) return "announcements";
  if (path.startsWith("/economy")) return "economy";
  if (path.startsWith("/library")) return "library";
  if (path.startsWith("/rankings") || path.startsWith("/ranking")) return "rankings";
  if (path.startsWith("/notifications")) return "notifications";
  if (path.startsWith("/allies")) return "allies";
  if (path.startsWith("/simulator")) return "simulator_trainings";
  if (path.startsWith("/emblems")) return "emblems";
  if (path.startsWith("/players")) return "players";
  return "dashboard";
}

function adminActionPermissionForRequest(req) {
  const rawPath = req.path || "";
  const path = rawPath.startsWith("/api/admin") ? (rawPath.slice("/api/admin".length) || "/") : rawPath;
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET") return null;
  if (path.startsWith("/players/import")) return "players_import";
  if (path.match(/^\/players\/\d+$/) && method === "DELETE") return "players_delete";
  if (path.match(/^\/players(\/\d+)?$/)) return "players_write";
  if (path.startsWith("/cards/import")) return "cards_import";
  if (path.startsWith("/cards/distribute")) return "cards_assign";
  if (path.match(/^\/cards(\/\d+)?$/) && method === "DELETE") return "cards_delete";
  if (path.match(/^\/cards(\/\d+)?$/)) return "cards_write";
  if (path.match(/^\/players\/\d+\/cards"/)) return "cards_assign";
  if (path.startsWith("/missions/import")) return "missions_import";
  if (path.match(/^\/missions(\/\d+)?$/) && method === "DELETE") return "missions_delete";
  if (path.match(/^\/missions(\/\d+)?$/)) return "missions_write";
  if (path.match(/^\/players\/\d+\/missions"/)) return method === "DELETE" ? "missions_delete" : "missions_write";
  if (path.match(/^\/events(\/\d+)?$/) && method === "DELETE") return "events_delete";
  if (path.match(/^\/events(\/\d+)?$/)) return "events_write";
  if (path.startsWith("/economy")) return "economy_write";
  if (path.startsWith("/houses/import")) return "houses_import";
  if (path.match(/^\/houses(\/\d+)?$/)) return "houses_write";
  if (path.startsWith("/hierarchy/import")) return "hierarchy_import";
  if (path.startsWith("/hierarchy") || path.startsWith("/patents") || path.startsWith("/roles")) return "hierarchy_write";
  if (path.startsWith("/articles") || path.startsWith("/editions") || path.startsWith("/journal")) return "journal_write";
  if (path.startsWith("/announcements")) return "announcements_write";
  if (path.startsWith("/library")) return "library_write";
  if (path.startsWith("/rankings") || path.startsWith("/ranking-battles")) return "rankings_write";
  if (path.startsWith("/notifications")) return "notifications_write";
  if (path.startsWith("/allies")) return "allies_write";
  if (path.startsWith("/admins") || path.startsWith("/permissions")) return "admin_users_write";
  if (path.startsWith("/backup")) return "backup_export";
  if (path.startsWith("/emblems/grant") || path.startsWith("/emblems/revoke")) return "emblems_grant";
  if (path.startsWith("/emblems")) return "emblems_write";
  return null;
}

function adminHasPermission(admin, key) {
  if (!key) return true;
  if (!admin) return false;
  if (admin.is_superadmin || admin.permissions?.superadmin) return true;
  return Boolean(admin.permissions?.[key]);
}

async function resolveAdmin(req) {
  const token = req.cookies?.spade_admin;
  if (!token) return null;
  try {
    const payload = verifySessionToken(token);
    if (!payload || payload.type !== "ADMIN") return null;
    const r = await pool.query(`SELECT id,username,display_name,active FROM admin_users WHERE id=$1 LIMIT 1`, [payload.id]);
    if (!r.rows[0] || Number(r.rows[0].active) !== 1) return null;
    const perms = await pool.query(`SELECT permissions FROM admin_permissions WHERE admin_id=$1 LIMIT 1`, [payload.id]);
    return { ...r.rows[0], id:Number(r.rows[0].id), is_superadmin: payload.is_superadmin === true, permissions: perms.rows[0]?.permissions || {} };
  } catch { return null; }
}

async function resolveViewer(req) {
  const playerId = readPlayerToken(req);
  if (playerId) {
    const p = await pool.query(`SELECT id,nick,number,identifier,house,patent,role,grimoire,account_type,active,public_profile FROM players WHERE id=$1 LIMIT 1`, [playerId]);
    if (p.rows[0] && Number(p.rows[0].active) === 1) return { type:"PLAYER", ...p.rows[0], id:Number(p.rows[0].id) };
  }
  const allyToken = req.cookies?.spade_ally;
  if (allyToken) {
    try {
      const payload = verifySessionToken(allyToken);
      if (payload?.type === "ALLY") {
        const a = await pool.query(`SELECT id,name,active FROM ally_accounts WHERE id=$1 LIMIT 1`, [payload.id]);
        if (a.rows[0] && Number(a.rows[0].active) === 1) return { type:"ALLY", ...a.rows[0], id:Number(a.rows[0].id) };
      }
    } catch {}
  }
  return null;
}

function requireAdmin(req,res,next){
  resolveAdmin(req).then(admin=>{
    if(!admin)return res.status(401).json({error:"Não autenticado como administrador."});
    const modulePermission=adminPermissionForRequest(req);
    const actionPermission=adminActionPermissionForRequest(req);
    if(!adminHasPermission(admin,modulePermission) || !adminHasPermission(admin,actionPermission)) return res.status(403).json({error:"Seu perfil administrativo não possui permissão para esta ação."});
    req.admin=admin;next();
  }).catch(()=>res.status(500).json({error:"Erro ao validar administrador."}));
}

function signSessionToken(payload){
  const body=Buffer.from(JSON.stringify({...payload,iat:Date.now()})).toString("base64url");
  const sig=crypto.createHmac("sha256",SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifySessionToken(token){
  const [body,sig]=String(token||"").split(".");
  if(!body||!sig)return null;
  const expected=crypto.createHmac("sha256",SESSION_SECRET).update(body).digest("base64url");
  if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
  try{
    const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
    if(Date.now()-Number(payload.iat||0)>1000*60*60*24*30)return null;
    return payload;
  }catch{return null;}
}
function readPlayerToken(req){
  const token=req.cookies?.spade_session;
  const payload=verifySessionToken(token);
  return payload?.type === "PLAYER" ? Number(payload.id) : null;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized:false } : false,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});
app.use(express.json({limit:"20mb"}));
app.use(express.urlencoded({extended:true,limit:"20mb"}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,"public"),{maxAge:process.env.NODE_ENV === "production" ? "1h" : 0}));

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

    CREATE TABLE IF NOT EXISTS grimoire_pages (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      level_number INTEGER NOT NULL CHECK (level_number > 0),
      magic_name TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(player_id, level_number)
    );
    CREATE INDEX IF NOT EXISTS idx_grimoire_pages_player ON grimoire_pages(player_id, level_number);

    CREATE TABLE IF NOT EXISTS exp_history (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL CHECK (amount > 0),
      source_code TEXT NOT NULL DEFAULT 'AJUSTE',
      source_detail TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      exp_before INTEGER NOT NULL DEFAULT 0 CHECK (exp_before >= 0),
      exp_after INTEGER NOT NULL DEFAULT 0 CHECK (exp_after >= 0),
      level_before INTEGER NOT NULL DEFAULT 1 CHECK (level_before >= 1),
      level_after INTEGER NOT NULL DEFAULT 1 CHECK (level_after >= 1),
      upgraded INTEGER NOT NULL DEFAULT 0 CHECK (upgraded IN (0,1)),
      created_by_admin_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_exp_history_player ON exp_history(player_id, id DESC);

    CREATE TABLE IF NOT EXISTS exp_rules (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      percent_value INTEGER,
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
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

    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER DEFAULT 200,
      ip TEXT DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS player_admin_history (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_player_admin_history_player ON player_admin_history(player_id, id DESC);

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
    CREATE INDEX IF NOT EXISTS idx_missions_player_status ON missions(player_id,status,id DESC);

    CREATE TABLE IF NOT EXISTS mission_activities (
      id BIGSERIAL PRIMARY KEY,
      mission_type TEXT NOT NULL DEFAULT 'Luta',
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      description TEXT DEFAULT '',
      instructions TEXT DEFAULT '',
      reward_yuls BIGINT DEFAULT 0,
      reward_exp BIGINT DEFAULT 0,
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
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS motto TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS history TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS goals TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS achievements TEXT DEFAULT '';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ATIVA';
    ALTER TABLE houses ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1;

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

    CREATE TABLE IF NOT EXISTS player_statuses (
      id BIGSERIAL PRIMARY KEY,
      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status_date DATE NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(player_id,status_date),
      CHECK (char_length(message) BETWEEN 1 AND 280)
    );
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
  `);
  // Compatibility and the remaining schema/seed code continues below unchanged.
  // V73 also centralizes date handling and mission counters after the full schema has loaded.
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS dracmas BIGINT DEFAULT 0`);
  // ...
}

// --- Existing Portal Spade application routes, helpers and schema continue below. ---
