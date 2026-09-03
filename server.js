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
    exp: Number(row.exp || 0),
    roles: row.roles || []
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
      missions INTEGER DEFAULT 0 CHECK (missions >= 0),
      achievements INTEGER DEFAULT 0 CHECK (achievements >= 0),
      ranking INTEGER DEFAULT 0 CHECK (ranking >= 0),
      power INTEGER DEFAULT 0 CHECK (power >= 0),
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
    CREATE TABLE IF NOT EXISTS cards (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'Outros',
      category TEXT,
      cost TEXT DEFAULT '',
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


  `);

  // Add columns introduced in later versions to existing installations.
  await pool.query(`
    ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
    ALTER TABLE players ADD COLUMN IF NOT EXISTS power INTEGER NOT NULL DEFAULT 0 CHECK (power >= 0);
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
    SET category=COALESCE(NULLIF(category,''),type,'Outros')
    WHERE COALESCE(category,'')='';

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
    CREATE INDEX IF NOT EXISTS idx_player_cards_player ON player_cards(player_id, updated_at DESC);
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
      `INSERT INTO cards(name,type,category,cost,description,sort_order)
       VALUES ($1,$2,$2,$3,$4,$5)
       ON CONFLICT (name) DO NOTHING`,
      [name,type,cost,description,sort_order]
    );
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
      "SELECT * FROM players WHERE (lower(nick)=lower($1) OR lower(identifier)=lower($1)) AND public_profile=1 LIMIT 1",
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
    const result = await pool.query("SELECT * FROM players WHERE id=$1", [id]);
    const player = result.rows[0];
    if (!player) return res.status(401).json({ error: "Sessão inválida." });
    player.roles=await getPlayerRoles(id);
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
      `SELECT c.id,c.name,COALESCE(c.category,c.type) AS category,c.cost,c.description,c.sort_order,
              pc.acquisition_type,pc.acquisition_name,pc.acquisition_id,pc.acquired_at,pc.updated_at
       FROM player_cards pc
       JOIN cards c ON c.id=pc.card_id
       WHERE pc.player_id=$1 AND c.active=1
       ORDER BY COALESCE(c.category,c.type),c.sort_order,c.name COLLATE "C"`,
      [id]
    );
    res.json({
      cards:r.rows.map(c=>({
        id:Number(c.id),name:c.name,category:c.category||"Outros",cost:c.cost||"",
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
             s.location,s.link,s.event_id,s.status,s.featured,e.title AS event_title
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
      link:a.link||"",event_id:a.event_id?Number(a.event_id):null,event_title:a.event_title||"",
      status:a.status||"AGENDADA",featured:Boolean(a.featured)
    }))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar cronograma."});}
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
      pool.query(`SELECT h.id,h.name,h.emblem,h.description,h.leader,h.vice_leader,
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
    const [powerResult, missionsResult, wealthResult, activityResult, houseResult] = await Promise.all([
      pool.query(
        `SELECT id,nick,number,identifier,house,power,missions,achievements,yuls
         FROM players
         WHERE public_profile=1
         ORDER BY power DESC, missions DESC, nick COLLATE "C" ASC
         LIMIT 75`
      ),
      pool.query(
        `SELECT id,nick,number,identifier,house,power,missions,achievements,yuls
         FROM players
         WHERE public_profile=1
         ORDER BY missions DESC, achievements DESC, nick COLLATE "C" ASC
         LIMIT 75`
      ),
      pool.query(
        `SELECT id,nick,number,identifier,house,power,missions,achievements,yuls
         FROM players
         WHERE public_profile=1
         ORDER BY yuls DESC, missions DESC, nick COLLATE "C" ASC
         LIMIT 75`
      ),
      pool.query(
        `SELECT id,nick,number,identifier,house,power,missions,achievements,yuls
         FROM players
         WHERE public_profile=1
         ORDER BY (missions + achievements * 3) DESC, missions DESC, achievements DESC, nick COLLATE "C" ASC
         LIMIT 75`
      ),
      pool.query(
        `SELECT h.id,h.name,h.emblem,h.leader,h.vice_leader,
                COUNT(p.id)::int AS members,
                COALESCE(SUM(p.missions),0)::bigint AS missions,
                COALESCE(SUM(p.yuls),0)::bigint AS yuls,
                COALESCE(SUM(p.power),0)::bigint AS power
         FROM houses h
         LEFT JOIN players p ON lower(trim(p.house))=lower(trim(h.name)) AND p.public_profile=1
         GROUP BY h.id
         ORDER BY power DESC, missions DESC, members DESC, h.name ASC
         LIMIT 20`
      )
    ]);

    const mapPlayer = p => ({
      id:Number(p.id),
      nick:p.nick,
      number:p.number,
      identifier:p.identifier,
      house:p.house||"",
      power:Number(p.power||0),
      missions:Number(p.missions||0),
      achievements:Number(p.achievements||0),
      yuls:Number(p.yuls||0)
    });

    res.json({
      force: powerResult.rows.map(mapPlayer),
      missions: missionsResult.rows.map(mapPlayer),
      wealth: wealthResult.rows.map(mapPlayer),
      activity: activityResult.rows.map(mapPlayer),
      houses: houseResult.rows.map(h=>({
        id:Number(h.id),
        name:h.name,
        emblem:h.emblem||"♜",
        leader:h.leader||"",
        vice_leader:h.vice_leader||"",
        members:Number(h.members||0),
        missions:Number(h.missions||0),
        yuls:Number(h.yuls||0),
        power:Number(h.power||0)
      }))
    });
  } catch(e) {
    console.error("Erro em /api/rankings:",e);
    res.status(500).json({error:"Erro ao carregar rankings."});
  }
});

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
         WHERE id=$1 AND public_profile=1`,
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
       FROM players WHERE public_profile=1 ORDER BY nick COLLATE "C" ASC`
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
    const r=await pool.query("DELETE FROM articles WHERE id=$1",[id]);
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


const CARD_CATEGORIES=[
  "Falha","Fuga","Ataque/Defesa","Barreira","Paralisia",
  "Magia Ofensiva","Réplica","Técnica","Ativação",
  "Invocação","Ilusão","Regeneração","Outros"
];

app.get("/api/admin/cards", requireAdmin, async (req,res)=>{
  try{
    const r=await pool.query(
      `SELECT c.id,c.name,COALESCE(c.category,c.type) AS category,c.cost,c.description,c.sort_order,c.active,
              COUNT(pc.player_id)::int AS players
       FROM cards c
       LEFT JOIN player_cards pc ON pc.card_id=c.id
       GROUP BY c.id
       ORDER BY COALESCE(c.category,c.type),c.sort_order,c.name COLLATE "C"`
    );
    res.json({
      categories:CARD_CATEGORIES,
      cards:r.rows.map(c=>({
        id:Number(c.id),name:c.name,category:c.category||"Outros",
        cost:c.cost||"",description:c.description||"",sort_order:Number(c.sort_order||0),
        active:Number(c.active),players:Number(c.players||0)
      }))
    });
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao carregar banco de cards."});
  }
});

app.post("/api/admin/cards", requireAdmin, async (req,res)=>{
  const b=req.body||{};
  const name=String(b.name||"").trim();
  const category=String(b.category||"Outros").trim();
  const cost=String(b.cost||"").trim();
  const description=String(b.description||"").trim();
  const sort_order=Number.isFinite(Number(b.sort_order))?Math.round(Number(b.sort_order)):0;
  if(!name)return res.status(400).json({error:"Nome do card é obrigatório."});
  if(!CARD_CATEGORIES.includes(category))return res.status(400).json({error:"Categoria de card inválida."});
  try{
    const r=await pool.query(
      `INSERT INTO cards(name,type,category,cost,description,sort_order)
       VALUES ($1,$2,$2,$3,$4,$5) RETURNING *`,
      [name,category,cost,description,sort_order]
    );
    res.json({card:r.rows[0]});
  }catch(e){
    console.error(e);
    if(e.code==="23505")return res.status(400).json({error:"Esse card já existe."});
    res.status(500).json({error:"Erro ao criar card."});
  }
});

app.put("/api/admin/cards/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  const name=String(b.name||"").trim();
  const category=String(b.category||"Outros").trim();
  const cost=String(b.cost||"").trim();
  const description=String(b.description||"").trim();
  const sort_order=Number.isFinite(Number(b.sort_order))?Math.round(Number(b.sort_order)):0;
  const active=Number(b.active??1)?1:0;
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Card inválido."});
  if(!name)return res.status(400).json({error:"Nome do card é obrigatório."});
  if(!CARD_CATEGORIES.includes(category))return res.status(400).json({error:"Categoria de card inválida."});
  try{
    const r=await pool.query(
      `UPDATE cards
       SET name=$1,type=$2,category=$2,cost=$3,description=$4,sort_order=$5,active=$6,updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name,category,cost,description,sort_order,active,id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Card não encontrado."});
    res.json({card:r.rows[0]});
  }catch(e){
    console.error(e);
    if(e.code==="23505")return res.status(400).json({error:"Esse card já existe."});
    res.status(500).json({error:"Erro ao atualizar card."});
  }
});

app.delete("/api/admin/cards/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Card inválido."});
  try{
    const used=await pool.query("SELECT COUNT(*)::int AS players FROM player_cards WHERE card_id=$1",[id]);
    if(Number(used.rows[0].players)>0){
      return res.status(400).json({error:"Este card está no inventário de jogadores. Remova-o dos inventários ou desative-o antes de excluir."});
    }
    const r=await pool.query("DELETE FROM cards WHERE id=$1",[id]);
    if(!r.rowCount)return res.status(404).json({error:"Card não encontrado."});
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Erro ao excluir card."});
  }
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
    res.json({activities:r.rows.map(a=>({...a,id:Number(a.id),event_id:a.event_id?Number(a.event_id):null,featured:Number(a.featured),published:Number(a.published)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar cronograma administrativo."});}
});

app.post("/api/admin/schedule", requireAdmin, async (req,res)=>{
  const b=req.body||{};
  const title=String(b.title||"").trim(),date=String(b.activity_date||"").trim();
  if(!title||!date)return res.status(400).json({error:"Título e data são obrigatórios."});
  try{
    const r=await pool.query(
      `INSERT INTO schedule_activities(title,activity_type,description,activity_date,start_time,end_time,location,link,event_id,status,featured,published)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [title,String(b.activity_type||"ATIVIDADE").trim(),String(b.description||"").trim(),date,
       b.start_time||null,b.end_time||null,String(b.location||"").trim(),String(b.link||"").trim(),
       b.event_id?Number(b.event_id):null,String(b.status||"AGENDADA").trim().toUpperCase(),
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
       location=$7,link=$8,event_id=$9,status=$10,featured=$11,published=$12,updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [title,String(b.activity_type||"ATIVIDADE").trim(),String(b.description||"").trim(),date,
       b.start_time||null,b.end_time||null,String(b.location||"").trim(),String(b.link||"").trim(),
       b.event_id?Number(b.event_id):null,String(b.status||"AGENDADA").trim().toUpperCase(),
       Number(b.featured)?1:0,Number(b.published??1)?1:0,id]
    );
    if(!r.rows[0])return res.status(404).json({error:"Atividade não encontrada."});
    if(Number(b.featured))await pool.query("UPDATE schedule_activities SET featured=0 WHERE id<>$1",[id]);
    res.json({activity:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Erro ao atualizar atividade."});}
});

app.delete("/api/admin/schedule/:id", requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);
  try{const r=await pool.query("DELETE FROM schedule_activities WHERE id=$1",[id]);if(!r.rowCount)return res.status(404).json({error:"Atividade não encontrada."});res.json({ok:true})}
  catch(e){console.error(e);res.status(500).json({error:"Erro ao excluir atividade."});}
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
  if(!["add_yuls","remove_yuls","set_house","set_patent","set_roles","set_missions","add_missions","set_power","set_public"].includes(action)){
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

    const descriptions={
      add_yuls:"Yuls adicionados em massa pela administração.",
      remove_yuls:"Yuls retirados em massa pela administração.",
      set_house:`Casa definida em massa: ${String(b.house_id||"")}.`,
      set_patent:`Patente definida em massa: ${String(b.patent_id||"")}.`,
      set_roles:"Cargos definidos em massa pela administração.",
      set_missions:"Missões ajustadas em massa pela administração.",
      add_missions:"Missões adicionadas em massa pela administração.",
      set_power:"Força ajustada em massa pela administração.",
      set_public:Number(b.public_profile)?"Perfis tornados públicos em massa.":"Perfis ocultados em massa."
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
           power=$15, public_profile=$16, updated_at=NOW()
       WHERE id=$17
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
