from pathlib import Path

root=Path('/mnt/data/v72_work')
server=root/'server.js'
appjs=root/'public/app.js'
html=root/'public/index.html'
css=root/'public/style.css'

s=server.read_text()
# Permissions
s=s.replace('  simulator_trainings: "Simulador — gerenciar treinamentos",\n', '  simulator_trainings: "Simulador — gerenciar treinamentos",\n  emblems: "Emblems — gerenciar catálogo",\n')
s=s.replace('  backup_export: "Backup — exportar dados"\n', '  backup_export: "Backup — exportar dados",\n  emblems_write: "Emblems — criar/editar",\n  emblems_grant: "Emblems — conceder/revogar"\n')
# Admin permission mapping
needle="  if (path.startsWith(\"/simulator/trainings\")) return \"simulator_trainings\";\n"
s=s.replace(needle, needle+'  if (path.startsWith("/emblems")) return "emblems";\n',1)
needle2='  if (path.startsWith("/cards")) {\n'
# insert action mapping before cards block
insert='  if (path.startsWith("/emblems")) {\n    if (path.includes("/grant")) return "emblems_grant";\n    return "emblems_write";\n  }\n'
s=s.replace(needle2, insert+needle2,1)
# Add schema after simulator table/index
schema='''\n    CREATE TABLE IF NOT EXISTS emblems (\n      id BIGSERIAL PRIMARY KEY,\n      name TEXT NOT NULL UNIQUE,\n      description TEXT DEFAULT '',\n      icon TEXT NOT NULL DEFAULT '🏅',\n      category TEXT NOT NULL DEFAULT 'Especial',\n      rarity TEXT NOT NULL DEFAULT 'COMUM',\n      origin TEXT NOT NULL DEFAULT 'Reino Spade',\n      secret INTEGER NOT NULL DEFAULT 0 CHECK (secret IN (0,1)),\n      auto_award INTEGER NOT NULL DEFAULT 1 CHECK (auto_award IN (0,1)),\n      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),\n      created_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,\n      created_at TIMESTAMPTZ DEFAULT NOW(),\n      updated_at TIMESTAMPTZ DEFAULT NOW()\n    );\n\n    CREATE TABLE IF NOT EXISTS emblem_stages (\n      id BIGSERIAL PRIMARY KEY,\n      emblem_id BIGINT NOT NULL REFERENCES emblems(id) ON DELETE CASCADE,\n      stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 4),\n      name TEXT NOT NULL,\n      description TEXT DEFAULT '',\n      requirements JSONB NOT NULL DEFAULT '{"logic":"ALL","conditions":[]}'::jsonb,\n      sort_order INTEGER NOT NULL DEFAULT 0,\n      created_at TIMESTAMPTZ DEFAULT NOW(),\n      updated_at TIMESTAMPTZ DEFAULT NOW(),\n      UNIQUE(emblem_id, stage_number)\n    );\n\n    CREATE TABLE IF NOT EXISTS player_emblems (\n      player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,\n      emblem_id BIGINT NOT NULL REFERENCES emblems(id) ON DELETE CASCADE,\n      stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 4),\n      source TEXT NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO','MANUAL')),\n      featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),\n      awarded_at TIMESTAMPTZ DEFAULT NOW(),\n      updated_at TIMESTAMPTZ DEFAULT NOW(),\n      notes TEXT DEFAULT '',\n      PRIMARY KEY(player_id, emblem_id)\n    );\n    CREATE INDEX IF NOT EXISTS idx_emblem_stages_emblem ON emblem_stages(emblem_id, stage_number);\n    CREATE INDEX IF NOT EXISTS idx_player_emblems_player ON player_emblems(player_id, stage_number DESC);\n    CREATE INDEX IF NOT EXISTS idx_player_emblems_emblem ON player_emblems(emblem_id, stage_number DESC);\n'''
s=s.replace('    CREATE INDEX IF NOT EXISTS idx_simulator_trainings_active ON simulator_trainings(active, visibility, id);\n\n\n', '    CREATE INDEX IF NOT EXISTS idx_simulator_trainings_active ON simulator_trainings(active, visibility, id);\n'+schema+'\n\n')
# Helper functions before simulator routes
marker="app.get('/api/simulator/trainings', async (req,res)=>{"
helpers=r'''
const EMBLEM_STAGE_LABELS={1:'Inicial',2:'Mediano',3:'Avançado',4:'Supremo'};
const EMBLEM_RARITY_LABELS={COMUM:'Comum',RARO:'Raro',EPICO:'Épico',LENDARIO:'Lendário',SUPREMO:'Supremo'};
function normalizeEmblemRequirements(value){
  if(Array.isArray(value)) return {logic:'ALL',conditions:value};
  const v=value&&typeof value==='object'?value:{};
  return {logic:String(v.logic||'ALL').toUpperCase()==='ANY'?'ANY':'ALL',conditions:Array.isArray(v.conditions)?v.conditions:[]};
}
function normalizeEmblemStage(stage,number){
  const n=Math.max(1,Math.min(4,Number(number||stage?.stage_number||1)));
  return {stage_number:n,name:String(stage?.name||EMBLEM_STAGE_LABELS[n]).trim().slice(0,80)||EMBLEM_STAGE_LABELS[n],description:String(stage?.description||'').trim().slice(0,500),requirements:normalizeEmblemRequirements(stage?.requirements),sort_order:Number(stage?.sort_order||n)};
}
function normalizeEmblemInput(body){
  const b=body||{}; const name=String(b.name||'').trim();
  if(name.length<2||name.length>100) throw Object.assign(new Error('Informe um nome de Emblem entre 2 e 100 caracteres.'),{statusCode:400});
  const pick=(v,allowed,def)=>allowed.includes(String(v||def).toUpperCase())?String(v||def).toUpperCase():def;
  const stages=Array.isArray(b.stages)?b.stages:[];
  const out=[];
  for(let i=1;i<=4;i++) out.push(normalizeEmblemStage(stages[i-1]||{},i));
  return {name,description:String(b.description||'').trim().slice(0,1000),icon:String(b.icon||'🏅').trim().slice(0,8)||'🏅',category:String(b.category||'Especial').trim().slice(0,60)||'Especial',rarity:pick(b.rarity,Object.keys(EMBLEM_RARITY_LABELS),'COMUM'),origin:String(b.origin||'Reino Spade').trim().slice(0,100)||'Reino Spade',secret:b.secret?1:0,auto_award:b.auto_award===false||String(b.auto_award)==='0'?0:1,active:b.active===false||String(b.active)==='0'?0:1,stages:out};
}
async function emblemMetric(playerId,condition){
  const c=condition||{}; const type=String(c.type||'').toUpperCase(); const target=Math.max(0,Number(c.value||0));
  let current=0,label=String(c.label||'');
  switch(type){
    case 'CARDS_TOTAL': { const r=await pool.query(`SELECT COALESCE(SUM(quantity),0)::bigint AS value FROM player_cards WHERE player_id=$1`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Cards possuídos'; break; }
    case 'CARD_CATEGORIES': { const r=await pool.query(`SELECT COUNT(DISTINCT COALESCE(NULLIF(c.category,''),c.type))::int AS value FROM player_cards pc JOIN cards c ON c.id=pc.card_id WHERE pc.player_id=$1`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Categorias de Cards'; break; }
    case 'MISSIONS_TOTAL': { const r=await pool.query(`SELECT COALESCE(missions,0)::bigint AS value FROM players WHERE id=$1`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Missões registradas'; break; }
    case 'EVENTS_PARTICIPATED': { const r=await pool.query(`SELECT COUNT(*)::int AS value FROM event_participants WHERE player_id=$1`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Eventos participados'; break; }
    case 'TOURNAMENT_WINS': { const r=await pool.query(`SELECT COUNT(*)::int AS value FROM event_results er JOIN events e ON e.id=er.event_id WHERE er.player_id=$1 AND er.published=1 AND lower(e.event_type) LIKE '%torneio%'`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Vitórias em torneios'; break; }
    case 'POWER': { const r=await pool.query(`SELECT COALESCE(power,0)::bigint AS value FROM players WHERE id=$1`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Poder'; break; }
    case 'SKILL_SC': { const r=await pool.query(`SELECT COALESCE(skill_sc,0)::bigint AS value FROM players WHERE id=$1`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Skill SC'; break; }
    case 'SKILL_VT': { const r=await pool.query(`SELECT COALESCE(skill_vt,0)::bigint AS value FROM players WHERE id=$1`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Skill VT'; break; }
    case 'ACHIEVEMENTS': { const r=await pool.query(`SELECT COALESCE(achievements,0)::bigint AS value FROM players WHERE id=$1`,[playerId]); current=Number(r.rows[0]?.value||0); label ||= 'Conquistas'; break; }
    case 'ROLE': { const r=await pool.query(`SELECT 1 FROM player_roles pr JOIN roles r ON r.id=pr.role_id WHERE pr.player_id=$1 AND lower(trim(r.name))=lower(trim($2)) LIMIT 1`,[playerId,String(c.value||'')]); current=r.rows[0]?1:0; label ||= `Cargo: ${String(c.value||'')}`; return {type,current:current,target:1,label,met:current>=1,percent:current>=1?100:0}; }
    case 'HOUSE': { const r=await pool.query(`SELECT 1 FROM players WHERE id=$1 AND lower(trim(house))=lower(trim($2)) LIMIT 1`,[playerId,String(c.value||'')]); current=r.rows[0]?1:0; label ||= `Casa: ${String(c.value||'')}`; return {type,current:current,target:1,label,met:current>=1,percent:current>=1?100:0}; }
    case 'PATENT': { const r=await pool.query(`SELECT 1 FROM players WHERE id=$1 AND lower(trim(patent))=lower(trim($2)) LIMIT 1`,[playerId,String(c.value||'')]); current=r.rows[0]?1:0; label ||= `Patente: ${String(c.value||'')}`; return {type,current:current,target:1,label,met:current>=1,percent:current>=1?100:0}; }
    default: return {type,current:0,target, label:label||'Requisito manual', met:false, percent:0};
  }
  const met=current>=target;
  return {type,current,target,label,met,percent:target>0?Math.min(100,Math.round((current/target)*100)):met?100:0};
}
async function evaluateEmblemStage(playerId,requirements){
  const req=normalizeEmblemRequirements(requirements); const results=[];
  for(const condition of req.conditions) results.push(await emblemMetric(playerId,condition));
  const achieved=req.conditions.length>0 && (req.logic==='ANY'?results.some(x=>x.met):results.every(x=>x.met));
  const percent=results.length?(req.logic==='ANY'?Math.max(...results.map(x=>x.percent)):Math.round(results.reduce((s,x)=>s+x.percent,0)/results.length)):0;
  return {achieved,percent,conditions:results};
}
async function getEmblemRecords(){
  const [e,s]=await Promise.all([
    pool.query(`SELECT * FROM emblems WHERE active=1 ORDER BY category COLLATE "C", name COLLATE "C", id`),
    pool.query(`SELECT * FROM emblem_stages ORDER BY emblem_id,stage_number`)
  ]);
  const map=new Map(); for(const row of e.rows) map.set(Number(row.id),{...row,id:Number(row.id),secret:Boolean(row.secret),auto_award:Boolean(row.auto_award),active:Boolean(row.active),stages:[]});
  for(const row of s.rows){const item=map.get(Number(row.emblem_id));if(item)item.stages.push({...normalizeEmblemStage(row,row.stage_number),id:Number(row.id)});}
  return [...map.values()];
}
async function syncPlayerEmblems(playerId){
  const emblems=await getEmblemRecords();
  for(const emblem of emblems){
    if(!emblem.auto_award) continue;
    let highest=0;
    for(const stage of emblem.stages.sort((a,b)=>a.stage_number-b.stage_number)){
      const result=await evaluateEmblemStage(playerId,stage.requirements);
      if(result.achieved) highest=stage.stage_number;
    }
    if(highest>0){
      await pool.query(`INSERT INTO player_emblems(player_id,emblem_id,stage_number,source,featured,awarded_at,updated_at) VALUES($1,$2,$3,'AUTO',0,NOW(),NOW()) ON CONFLICT(player_id,emblem_id) DO UPDATE SET stage_number=GREATEST(player_emblems.stage_number,EXCLUDED.stage_number),updated_at=NOW()`,[playerId,emblem.id,highest]);
    }
  }
}
async function getPlayerEmblems(playerId,{sync=true,publicOnly=false}={}){
  if(sync) await syncPlayerEmblems(playerId);
  const [emblemsR,ownedR]=await Promise.all([
    pool.query(`SELECT * FROM emblems WHERE active=1 ORDER BY category COLLATE "C", name COLLATE "C", id`),
    pool.query(`SELECT emblem_id,stage_number,source,featured,awarded_at,updated_at FROM player_emblems WHERE player_id=$1`,[playerId])
  ]);
  const owned=new Map(ownedR.rows.map(r=>[Number(r.emblem_id),{stage:Number(r.stage_number),source:r.source,featured:Boolean(r.featured),awarded_at:r.awarded_at,updated_at:r.updated_at}]));
  const stageR=await pool.query(`SELECT * FROM emblem_stages WHERE emblem_id=ANY($1::bigint[]) ORDER BY emblem_id,stage_number`,[emblemsR.rows.map(r=>r.id)]).catch(()=>({rows:[]}));
  const stagesMap=new Map(); for(const row of stageR.rows){const arr=stagesMap.get(Number(row.emblem_id))||[];arr.push(normalizeEmblemStage(row,row.stage_number));stagesMap.set(Number(row.emblem_id),arr);}
  const items=[];
  for(const e of emblemsR.rows){const id=Number(e.id),own=owned.get(id),unlocked=!!own; if(publicOnly&&e.secret&&!unlocked)continue; const stages=stagesMap.get(id)||[]; const current=unlocked?own.stage:0; const next=stages.find(st=>st.stage_number>current); let progress=null; if(next){const ev=await evaluateEmblemStage(playerId,next.requirements);progress={stage:next.stage_number,percent:ev.percent,conditions:ev.conditions};}
    items.push({id,name:unlocked||!e.secret?e.name:'Emblem secreto',description:unlocked||!e.secret?e.description:'Continue sua jornada para descobrir este Emblem.',icon:e.icon,category:e.category,rarity:e.rarity,rarity_label:EMBLEM_RARITY_LABELS[e.rarity]||e.rarity,origin:e.origin,secret:Boolean(e.secret),auto_award:Boolean(e.auto_award),unlocked,current_stage:current,stage_label:current?EMBLEM_STAGE_LABELS[current]:'Bloqueado',featured:!!own?.featured,awarded_at:own?.awarded_at||null,stages:(unlocked||!e.secret)?stages.map(st=>({...st,name:st.name,stage_label:EMBLEM_STAGE_LABELS[st.stage_number],requirements:undefined})) : [],next_stage:next?{stage_number:next.stage_number,name:next.name,stage_label:EMBLEM_STAGE_LABELS[next.stage_number],description:next.description}:null,progress});
  }
  return {emblems:items,summary:{total:items.length,unlocked:items.filter(x=>x.unlocked).length,featured:items.filter(x=>x.featured).length}};
}

'''
s=s.replace(marker, helpers+marker,1)
# Add player emblem routes before /api/me/cards
route_marker='app.get("/api/me/cards", async (req,res)=>{'
routes=r'''
app.get('/api/emblems', async (req,res)=>{
  try{const r=await pool.query(`SELECT id,name,description,icon,category,rarity,origin,secret,auto_award,active FROM emblems WHERE active=1 ORDER BY category COLLATE "C", name COLLATE "C", id`);res.json({emblems:r.rows.map(x=>({...x,id:Number(x.id),secret:Boolean(x.secret),auto_award:Boolean(x.auto_award),active:Boolean(x.active)}))});}
  catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar os Emblems.'});}
});

app.get('/api/me/emblems', async (req,res)=>{
  const viewer=await resolveViewer(req); if(!viewer||viewer.type!=='PLAYER')return res.status(401).json({error:'Entre como jogador para consultar seus Emblems.'});
  try{res.json(await getPlayerEmblems(viewer.id));}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar seus Emblems.'});}
});

app.post('/api/me/emblems/:id/feature', async (req,res)=>{
  const viewer=await resolveViewer(req); if(!viewer||viewer.type!=='PLAYER')return res.status(401).json({error:'Entre como jogador para editar seus Emblems.'});
  const emblemId=Number(req.params.id);if(!Number.isInteger(emblemId)||emblemId<=0)return res.status(400).json({error:'Emblem inválido.'});
  const featured=req.body?.featured!==false && String(req.body?.featured)!=='0';
  try{
    const own=(await pool.query(`SELECT stage_number FROM player_emblems WHERE player_id=$1 AND emblem_id=$2`,[viewer.id,emblemId])).rows[0];
    if(!own)return res.status(403).json({error:'Você ainda não conquistou este Emblem.'});
    if(featured){const count=(await pool.query(`SELECT COUNT(*)::int AS total FROM player_emblems WHERE player_id=$1 AND featured=1 AND emblem_id<>$2`,[viewer.id,emblemId])).rows[0]?.total||0;if(Number(count)>=5)return res.status(400).json({error:'Você já possui 5 Emblems em destaque. Remova um antes de adicionar outro.'});}
    await pool.query(`UPDATE player_emblems SET featured=$1,updated_at=NOW() WHERE player_id=$2 AND emblem_id=$3`,[featured?1:0,viewer.id,emblemId]);
    res.json({ok:true,featured});
  }catch(e){console.error(e);res.status(500).json({error:'Não foi possível atualizar o destaque do Emblem.'});}
});

app.get('/api/players/:id/emblems', async (req,res)=>{
  const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Jogador inválido.'});
  try{const p=(await pool.query(`SELECT id,public_profile,active FROM players WHERE id=$1 AND public_profile=1 AND active=1`,[id])).rows[0];if(!p)return res.status(404).json({error:'Jogador não encontrado ou perfil privado.'});res.json(await getPlayerEmblems(id,{publicOnly:true}));}
  catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar os Emblems do jogador.'});}
});

app.get('/api/admin/emblems', requireAdmin, async (req,res)=>{
  try{
    const emblems=await getEmblemRecords();
    for(const e of emblems)e.owners=Number((await pool.query(`SELECT COUNT(*)::int AS total FROM player_emblems WHERE emblem_id=$1`,[e.id])).rows[0]?.total||0);
    res.json({emblems});
  }catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar os Emblems administrativos.'});}
});

app.post('/api/admin/emblems', requireAdmin, async (req,res)=>{
  try{const e=normalizeEmblemInput(req.body);const client=await pool.connect();try{await client.query('BEGIN');const ins=await client.query(`INSERT INTO emblems(name,description,icon,category,rarity,origin,secret,auto_award,active,created_by_admin_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()) RETURNING *`,[e.name,e.description,e.icon,e.category,e.rarity,e.origin,e.secret,e.auto_award,e.active,req.admin?.id||null]);for(const st of e.stages)await client.query(`INSERT INTO emblem_stages(emblem_id,stage_number,name,description,requirements,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,NOW(),NOW())`,[ins.rows[0].id,st.stage_number,st.name,st.description,JSON.stringify(st.requirements),st.sort_order]);await client.query('COMMIT');res.json({ok:true,emblem:{...ins.rows[0],id:Number(ins.rows[0].id)}});}catch(x){await client.query('ROLLBACK');throw x;}finally{client.release();}}
  catch(e){console.error(e);res.status(e.statusCode||500).json({error:e.code==='23505'?'Já existe um Emblem com esse nome.':(e.message||'Erro ao criar Emblem.')});}
});

app.put('/api/admin/emblems/:id', requireAdmin, async (req,res)=>{
  const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Emblem inválido.'});
  try{const e=normalizeEmblemInput(req.body);const client=await pool.connect();try{await client.query('BEGIN');const up=await client.query(`UPDATE emblems SET name=$1,description=$2,icon=$3,category=$4,rarity=$5,origin=$6,secret=$7,auto_award=$8,active=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,[e.name,e.description,e.icon,e.category,e.rarity,e.origin,e.secret,e.auto_award,e.active,id]);if(!up.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Emblem não encontrado.'});}await client.query(`DELETE FROM emblem_stages WHERE emblem_id=$1`,[id]);for(const st of e.stages)await client.query(`INSERT INTO emblem_stages(emblem_id,stage_number,name,description,requirements,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,NOW(),NOW())`,[id,st.stage_number,st.name,st.description,JSON.stringify(st.requirements),st.sort_order]);await client.query('COMMIT');res.json({ok:true});}catch(x){await client.query('ROLLBACK');throw x;}finally{client.release();}}
  catch(e){console.error(e);res.status(e.statusCode||500).json({error:e.code==='23505'?'Já existe um Emblem com esse nome.':(e.message||'Erro ao salvar Emblem.')});}
});

app.delete('/api/admin/emblems/:id', requireAdmin, async (req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Emblem inválido.'});try{const r=await pool.query(`UPDATE emblems SET active=0,updated_at=NOW() WHERE id=$1 RETURNING id,name`,[id]);if(!r.rows[0])return res.status(404).json({error:'Emblem não encontrado.'});res.json({ok:true});}catch(e){console.error(e);res.status(500).json({error:'Não foi possível desativar o Emblem.'});}});

app.post('/api/admin/emblems/:id/grant', requireAdmin, async(req,res)=>{const emblemId=Number(req.params.id),playerId=Number(req.body?.player_id),stage=Math.max(1,Math.min(4,Number(req.body?.stage_number||1)));if(!Number.isInteger(emblemId)||emblemId<=0||!Number.isInteger(playerId)||playerId<=0)return res.status(400).json({error:'Emblem ou jogador inválido.'});try{const [e,p]=await Promise.all([pool.query(`SELECT id,name FROM emblems WHERE id=$1 AND active=1`,[emblemId]),pool.query(`SELECT id,nick FROM players WHERE id=$1 AND active=1`,[playerId])]);if(!e.rows[0])return res.status(404).json({error:'Emblem não encontrado.'});if(!p.rows[0])return res.status(404).json({error:'Jogador não encontrado.'});await pool.query(`INSERT INTO player_emblems(player_id,emblem_id,stage_number,source,featured,awarded_at,updated_at,notes) VALUES($1,$2,$3,'MANUAL',0,NOW(),NOW(),$4) ON CONFLICT(player_id,emblem_id) DO UPDATE SET stage_number=GREATEST(player_emblems.stage_number,EXCLUDED.stage_number),source='MANUAL',updated_at=NOW(),notes=EXCLUDED.notes`,[playerId,emblemId,stage,`Concedido pela Administração • ${req.admin?.display_name||'Admin'}`]);res.json({ok:true});}catch(x){console.error(x);res.status(500).json({error:'Não foi possível conceder o Emblem.'});}});

app.delete('/api/admin/emblems/:id/grant/:playerId', requireAdmin, async(req,res)=>{const emblemId=Number(req.params.id),playerId=Number(req.params.playerId);if(!Number.isInteger(emblemId)||emblemId<=0||!Number.isInteger(playerId)||playerId<=0)return res.status(400).json({error:'Emblem ou jogador inválido.'});try{await pool.query(`DELETE FROM player_emblems WHERE player_id=$1 AND emblem_id=$2`,[playerId,emblemId]);res.json({ok:true});}catch(e){console.error(e);res.status(500).json({error:'Não foi possível revogar o Emblem.'});}});

'''
s=s.replace(route_marker, routes+route_marker,1)
# add emblems to existing public player endpoint using extra query after mission/rank
old='const [playerResult, rolesResult, missionsResult, rankingResult] = await Promise.all(['
new='const [playerResult, rolesResult, missionsResult, rankingResult] = await Promise.all(['
s=s.replace(old,new,1)
# insert emblems fetch after completed/rewards calculation
needle='    const completed=missions.filter(m=>m.status==="Concluída").length;\n    const totalRewards=missions.filter(m=>m.status==="Concluída").reduce((sum,m)=>sum+m.reward_yuls,0);\n\n'
rep='    const completed=missions.filter(m=>m.status==="Concluída").length;\n    const totalRewards=missions.filter(m=>m.status==="Concluída").reduce((sum,m)=>sum+m.reward_yuls,0);\n    const emblemData=await getPlayerEmblems(id,{publicOnly:true});\n\n'
s=s.replace(needle,rep,1)
needle2='      mission_summary:{\n        completed:Number(player.missions || completed),\n        recent:missions,\n        rewards_on_page:totalRewards\n      },\n'
rep2=needle2+'      emblems:emblemData,\n'
s=s.replace(needle2,rep2,1)
server.write_text(s)

# index nav/page/admin section
h=html.read_text()
h=h.replace('<button data-page="simulador" id="simulatorNav" class="simulator-only-nav" style="display:none">⚔️ Simulador</button><button data-page="grimorio"', '<button data-page="simulador" id="simulatorNav" class="simulator-only-nav" style="display:none">⚔️ Simulador</button><button data-page="emblemas" id="emblemsNav" class="player-only-nav" style="display:none">🏅 Emblems</button><button data-page="grimorio"')
page_insert='''\n<section class="page" id="emblemas" aria-label="Emblems do jogador">\n  <div class="subhero emblem-hero">\n    <div><p class="eyebrow">🏅 COLEÇÃO DO REINO SPADE</p><h1>Seus <em>Emblems.</em></h1><p>Conquiste, evolua e destaque as marcas da sua jornada no Reino.</p></div>\n  </div>\n  <div class="content"><div id="emblemsRoot" class="emblems-root"></div></div>\n</section>\n'''
h=h.replace('<section class="page" id="admin-login">', page_insert+'\n<section class="page" id="admin-login">',1)
# admin emblems section before settings
admin_section='''\n  <section class="admin-emblems-panel panel" id="adminEmblemsPanel">\n    <div class="panel-head"><div><p class="eyebrow">🏅 PROGRESSÃO</p><h3>Gestão de Emblems</h3></div><span>Quatro estágios por Emblem • Inicial, Mediano, Avançado e Supremo</span></div>\n    <form id="adminEmblemForm" class="admin-form emblem-admin-form" onsubmit="return false;">\n      <input type="hidden" id="adminEmblemId">\n      <div class="article-form-grid">\n        <input id="adminEmblemName" class="full" placeholder="Nome do Emblem" required>\n        <input id="adminEmblemIcon" placeholder="Ícone" value="🏅">\n        <input id="adminEmblemCategory" placeholder="Categoria" value="Especial">\n        <select id="adminEmblemRarity"><option value="COMUM">Comum</option><option value="RARO">Raro</option><option value="EPICO">Épico</option><option value="LENDARIO">Lendário</option><option value="SUPREMO">Supremo</option></select>\n        <input id="adminEmblemOrigin" placeholder="Origem" value="Reino Spade">\n        <textarea id="adminEmblemDescription" class="full" placeholder="Descrição do Emblem"></textarea>\n      </div>\n      <div class="emblem-stage-admin-grid">\n        <div class="emblem-stage-admin"><b>🟢 Inicial</b><input id="emblemStage1Name" placeholder="Nome do estágio"><textarea id="emblemStage1Description" placeholder="Descrição"></textarea><textarea id="emblemStage1Req" placeholder='Requisitos JSON: {"logic":"ALL","conditions":[{"type":"CARDS_TOTAL","value":25}]}'></textarea></div>\n        <div class="emblem-stage-admin"><b>🔵 Mediano</b><input id="emblemStage2Name" placeholder="Nome do estágio"><textarea id="emblemStage2Description" placeholder="Descrição"></textarea><textarea id="emblemStage2Req" placeholder='Requisitos JSON'></textarea></div>\n        <div class="emblem-stage-admin"><b>🟣 Avançado</b><input id="emblemStage3Name" placeholder="Nome do estágio"><textarea id="emblemStage3Description" placeholder="Descrição"></textarea><textarea id="emblemStage3Req" placeholder='Requisitos JSON'></textarea></div>\n        <div class="emblem-stage-admin"><b>🔴 Supremo</b><input id="emblemStage4Name" placeholder="Nome do estágio"><textarea id="emblemStage4Description" placeholder="Descrição"></textarea><textarea id="emblemStage4Req" placeholder='Requisitos JSON'></textarea></div>\n      </div>\n      <div class="announcement-options"><label><input type="checkbox" id="adminEmblemSecret"> Emblem secreto</label><label><input type="checkbox" id="adminEmblemAuto" checked> Evolução automática</label><label><input type="checkbox" id="adminEmblemActive" checked> Ativo</label></div>\n      <div class="editor-actions"><button class="gold" type="submit" id="adminEmblemSaveBtn">Criar Emblem</button><button class="outline dark-outline" type="button" id="adminEmblemClearBtn">Limpar</button></div>\n      <div class="error" id="adminEmblemError"></div>\n    </form>\n    <div class="emblem-admin-tools"><input id="adminEmblemPlayerId" type="number" min="1" placeholder="ID do jogador"><select id="adminEmblemGrantStage"><option value="1">Inicial</option><option value="2">Mediano</option><option value="3">Avançado</option><option value="4">Supremo</option></select></div>\n    <div id="adminEmblemList" class="editorial-list"></div>\n  </section>\n'''
h=h.replace('  <section class="admin-settings-panel panel" id="adminSettingsPanel">', admin_section+'\n  <section class="admin-settings-panel panel" id="adminSettingsPanel">',1)
html.write_text(h)

# app.js
j=appjs.read_text()
# state and theme
j=j.replace('adminSimulatorTrainings:[],allies:', 'adminSimulatorTrainings:[],emblems:[],adminEmblems:[],allies:')
j=j.replace('simulador:"battle",missoes:', 'simulador:"battle",emblemas:"home",missoes:')
# go page cases
j=j.replace('  if(page==="simulador"){ if(state.me && state.me.account_type!=="ALLY") loadSimulatorPage(); }\n', '  if(page==="simulador"){ if(state.me && state.me.account_type!=="ALLY") loadSimulatorPage(); }\n  if(page==="emblemas"){ if(state.me && state.me.account_type!=="ALLY") loadEmblemsPage(); else go("dashboard"); }\n')
# update nav visibility
j=j.replace('  const canSeeGrimoire=logged&&state.me?.account_type!=="ALLY"&&String(state.me?.grimoire||"").trim();\n', '  const canSeeGrimoire=logged&&state.me?.account_type!=="ALLY"&&String(state.me?.grimoire||"").trim();\n  const canSeeEmblems=logged&&state.me?.account_type!=="ALLY";\n')
j=j.replace('const visible=id==="cardsNav"?canSeeCards:id==="notificationsNav"?canSeeNotifications:id==="grimoireNav"?canSeeGrimoire:logged;', 'const visible=id==="cardsNav"?canSeeCards:id==="notificationsNav"?canSeeNotifications:id==="grimoireNav"?canSeeGrimoire:id==="emblemsNav"?canSeeEmblems:logged;')
# Insert emblem UI functions before simulator functions marker
marker='const SIM_DIFF_LABEL={FACIL:\'Fácil\',NORMAL:\'Normal\',DIFICIL:\'Difícil\',MESTRE:\'Mestre\'};'
emblem_js=r'''
function emblemStageLabel(n){return ({1:'Inicial',2:'Mediano',3:'Avançado',4:'Supremo'})[Number(n)]||'Bloqueado';}
function emblemRequirementText(c){const type=String(c?.type||'').toUpperCase(),v=c?.value;const map={CARDS_TOTAL:'Cards possuídos',CARD_CATEGORIES:'Categorias de Cards',MISSIONS_TOTAL:'Missões',EVENTS_PARTICIPATED:'Eventos participados',TOURNAMENT_WINS:'Vitórias em torneios',POWER:'Poder',SKILL_SC:'Skill SC',SKILL_VT:'Skill VT',ACHIEVEMENTS:'Conquistas',ROLE:'Cargo',HOUSE:'Casa',PATENT:'Patente'};return `${map[type]||c?.label||type}: ${escapeHtml(String(v??''))}`;}
function renderEmblemCard(e,{compact=false}={}){const locked=!e.unlocked;const stage=e.current_stage||0;const progress=e.progress?.percent??(stage>=4?100:0);return `<article class="emblem-card ${locked?'locked':''} ${e.featured?'featured':''}"><div class="emblem-card-art"><span>${locked?'❔':escapeHtml(e.icon||'🏅')}</span></div><div class="emblem-card-body"><div class="emblem-card-top"><span class="tag">${escapeHtml(e.category||'Especial')}</span><small>${escapeHtml(e.rarity_label||e.rarity||'')}</small></div><h3>${escapeHtml(e.name)}</h3><p>${escapeHtml(e.description||'')}</p><div class="emblem-stage-track">${[1,2,3,4].map(n=>`<span class="${stage>=n?'unlocked':''}">${n}</span>`).join('')}</div><div class="emblem-stage-label">${stage?`🏅 ${escapeHtml(emblemStageLabel(stage))}`:'🔒 Bloqueado'}</div>${e.next_stage&&!locked?`<div class="emblem-progress"><div><small>Próximo estágio: ${escapeHtml(e.next_stage.name)}</small><b>${progress}%</b></div><div class="emblem-progress-bar"><i style="width:${progress}%"></i></div></div>`:''}${e.featured?'<span class="emblem-featured-badge">⭐ Em destaque</span>':''}${stage&&compact?'':(stage?`<button class="outline dark-outline small" type="button" data-emblem-feature="${e.id}" data-featured="${e.featured?'1':'0'}">${e.featured?'☆ Remover destaque':'⭐ Destacar'}</button>`:'')}</div></article>`;}
async function loadEmblemsPage(){const root=qs('#emblemsRoot');if(!root)return;root.innerHTML='<div class="panel emblem-loading">🏅 Carregando sua coleção...</div>';try{const d=await api('/api/me/emblems');state.emblems=d.emblems||[];renderEmblemsPage();}catch(e){root.innerHTML=`<div class="panel emblem-loading">${escapeHtml(e.message)}</div>`;}}
function renderEmblemsPage(){const root=qs('#emblemsRoot');if(!root)return;const items=state.emblems||[],unlocked=items.filter(x=>x.unlocked),featured=items.filter(x=>x.featured);root.innerHTML=`<div class="emblem-summary panel"><div><p class="eyebrow">MINHA COLEÇÃO</p><h2>${unlocked.length} / ${items.length} Emblems</h2><p>Os Emblems são marcas de progressão e reconhecimento. Eles não concedem bônus de combate.</p></div><div class="emblem-summary-stats"><span><small>CONQUISTADOS</small><b>${unlocked.length}</b></span><span><small>EM DESTAQUE</small><b>${featured.length} / 5</b></span></div></div><div class="emblem-collection-head"><div><p class="eyebrow">COLEÇÃO</p><h2>Todos os Emblems</h2></div></div><div class="emblem-grid">${items.map(e=>renderEmblemCard(e)).join('')||'<div class="panel">Nenhum Emblem foi cadastrado ainda.</div>'}</div>`;qsa('[data-emblem-feature]').forEach(b=>b.onclick=async()=>{try{await api(`/api/me/emblems/${b.dataset.emblemFeature}/feature`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({featured:b.dataset.featured!=='1'})});await loadEmblemsPage();}catch(e){alert(e.message)}});}
async function loadAdminEmblems(){const list=qs('#adminEmblemList');if(!list)return;try{const d=await adminApi('/api/admin/emblems');state.adminEmblems=d.emblems||[];list.innerHTML=state.adminEmblems.map(e=>`<div class="emblem-admin-row"><div class="emblem-admin-row-main"><span class="emblem-admin-icon">${escapeHtml(e.icon||'🏅')}</span><div><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.category)} • ${escapeHtml(e.rarity)} • ${e.active?'ATIVO':'INATIVO'} • ${e.owners} possuidor(es)}</small><p>${escapeHtml(e.description||'')}</p></div></div><div class="emblem-admin-actions"><button type="button" data-emblem-edit="${e.id}">✎</button><button type="button" data-emblem-grant="${e.id}">🎁</button><button type="button" class="delete" data-emblem-delete="${e.id}">×</button></div></div>`).join('')||'<div class="admin-history-empty">Nenhum Emblem cadastrado.</div>';qsa('[data-emblem-edit]').forEach(b=>b.onclick=()=>setAdminEmblemForm(state.adminEmblems.find(e=>Number(e.id)===Number(b.dataset.emblemEdit))));qsa('[data-emblem-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Desativar este Emblem?'))return;try{await adminApi(`/api/admin/emblems/${b.dataset.emblemDelete}`,{method:'DELETE'});await loadAdminEmblems();}catch(e){alert(e.message)}});qsa('[data-emblem-grant]').forEach(b=>b.onclick=()=>grantAdminEmblem(Number(b.dataset.emblemGrant)));}catch(e){list.innerHTML=`<div class="admin-history-empty">${escapeHtml(e.message)}</div>`;}}
function setAdminEmblemForm(e=null){qs('#adminEmblemId').value=e?.id||'';qs('#adminEmblemName').value=e?.name||'';qs('#adminEmblemIcon').value=e?.icon||'🏅';qs('#adminEmblemCategory').value=e?.category||'Especial';qs('#adminEmblemRarity').value=e?.rarity||'COMUM';qs('#adminEmblemOrigin').value=e?.origin||'Reino Spade';qs('#adminEmblemDescription').value=e?.description||'';const st=e?.stages||[];for(let i=1;i<=4;i++){const x=st[i-1]||{};qs(`#emblemStage${i}Name`).value=x.name||emblemStageLabel(i);qs(`#emblemStage${i}Description`).value=x.description||'';qs(`#emblemStage${i}Req`).value=x.requirements?JSON.stringify(x.requirements,null,2):'';}qs('#adminEmblemSecret').checked=!!e?.secret;qs('#adminEmblemAuto').checked=e?!!e.auto_award:true;qs('#adminEmblemActive').checked=e?!!e.active:true;qs('#adminEmblemSaveBtn').textContent=e?'Salvar Emblem':'Criar Emblem';qs('#adminEmblemError').textContent=e?'Editando Emblem.':'';}
function clearAdminEmblemForm(){setAdminEmblemForm(null);}
function collectAdminEmblemForm(){const stages=[];for(let i=1;i<=4;i++){const raw=qs(`#emblemStage${i}Req`).value.trim();let requirements={logic:'ALL',conditions:[]};if(raw){try{requirements=JSON.parse(raw);}catch{throw new Error(`Requisitos do estágio ${i} estão com JSON inválido.`)}}stages.push({stage_number:i,name:qs(`#emblemStage${i}Name`).value,description:qs(`#emblemStage${i}Description`).value,requirements});}return {name:qs('#adminEmblemName').value,icon:qs('#adminEmblemIcon').value,category:qs('#adminEmblemCategory').value,rarity:qs('#adminEmblemRarity').value,origin:qs('#adminEmblemOrigin').value,description:qs('#adminEmblemDescription').value,secret:qs('#adminEmblemSecret').checked,auto_award:qs('#adminEmblemAuto').checked,active:qs('#adminEmblemActive').checked,stages};}
async function saveAdminEmblem(){const err=qs('#adminEmblemError');err.textContent='';try{const id=Number(qs('#adminEmblemId').value||0),body=collectAdminEmblemForm();await adminApi(id?`/api/admin/emblems/${id}`:'/api/admin/emblems',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});clearAdminEmblemForm();await loadAdminEmblems();err.textContent='Emblem salvo com sucesso.';}catch(e){err.textContent=e.message;}}
async function grantAdminEmblem(id){const playerId=Number(qs('#adminEmblemPlayerId')?.value||0),stage=Number(qs('#adminEmblemGrantStage')?.value||1);if(!playerId){alert('Informe o ID do jogador antes de conceder o Emblem.');return;}try{await adminApi(`/api/admin/emblems/${id}/grant`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({player_id:playerId,stage_number:stage})});await loadAdminEmblems();alert('Emblem concedido.');}catch(e){alert(e.message)}}

'''
j=j.replace(marker, emblem_js+marker,1)
# initAdmin load
j=j.replace('    if(hasAdminPermission("simulator_trainings")){ await loadAdminSimulatorTrainings(); }\n', '    if(hasAdminPermission("simulator_trainings")){ await loadAdminSimulatorTrainings(); }\n    if(hasAdminPermission("emblems")){ await loadAdminEmblems(); }\n')
# listeners before tryAdminHash
needle='qs("#markAllNotifications")?.addEventListener("click",async()=>{try{await api("/api/me/notifications/read-all",{method:"POST"});await loadNotifications();}catch(e){alert(e.message)}});\n'
listener='''qs("#adminEmblemSaveBtn")?.addEventListener("click",saveAdminEmblem);\nqs("#adminEmblemForm")?.addEventListener("submit",e=>{e.preventDefault();saveAdminEmblem();});\nqs("#adminEmblemClearBtn")?.addEventListener("click",clearAdminEmblemForm);\n'''
j=j.replace(needle,needle+listener,1)
# player dashboard preview data: add a load call and a section in HTML string
j=j.replace('  loadPlayerYuls();loadPlayerMissions();loadPlayerAlerts();loadTodayStatus();\n', '  loadPlayerYuls();loadPlayerMissions();loadPlayerAlerts();loadTodayStatus();loadDashboardEmblems();\n')
# Add functions before renderAllyDashboard marker
marker2='function renderAllyDashboard(){'
extra=r'''
async function loadDashboardEmblems(){const host=qs('#dashboardEmblemsPreview');if(!host)return;try{const d=await api('/api/me/emblems');const items=(d.emblems||[]).filter(e=>e.featured||e.unlocked).slice(0,5);host.innerHTML=items.length?items.map(e=>renderEmblemCard(e,{compact:true})).join(''):`<div class="dashboard-empty-state"><span>🏅</span><div><b>Seus Emblems aparecem aqui.</b><p>Conquiste o primeiro Emblem e destaque suas marcas favoritas.</p></div></div>`;}catch(e){host.innerHTML=`<div class="dashboard-empty-state"><span>⚠️</span><div><b>Emblems indisponíveis.</b><p>${escapeHtml(e.message)}</p></div></div>`;}}

'''
j=j.replace(marker2,extra+marker2,1)
# Dashboard section insert before status const or after dashboard two col maybe
needle3='    ${status}\n    <div class="panel" style="margin-top:12px"><p class="eyebrow">ATIVIDADE</p>'
rep3='''    <section class="panel dashboard-emblems-panel"><div class="panel-head"><div><p class="eyebrow">🏅 PROGRESSÃO</p><h3>Meus Emblems</h3></div><button class="text-button" type="button" data-dashboard-page="emblemas">Ver coleção</button></div><div id="dashboardEmblemsPreview" class="dashboard-emblems-preview"><div class="dashboard-empty-state"><span>🏅</span><div><b>Carregando Emblems...</b></div></div></div></section>\n    ${status}\n    <div class="panel" style="margin-top:12px"><p class="eyebrow">ATIVIDADE</p>'''
j=j.replace(needle3,rep3,1)
# Public player render include emblems
needle4='    const missions=(d.mission_summary?.recent||[]).map(m=>'
# We'll add const after missions computation instead of before
j=j.replace('    const missions=(d.mission_summary?.recent||[]).map(m=>`', '    const missions=(d.mission_summary?.recent||[]).map(m=>`',1)
# Need precise insert after missions expression line end. Use phrase ends `||...` line
find='`<p style="color:#888;font-size:10px">Nenhuma missão recente.</p>`;\n    wrap.innerHTML=`<div class="public-player-detail">'
replace='`<p style="color:#888;font-size:10px">Nenhuma missão recente.</p>`;\n    const publicEmblems=(d.emblems?.emblems||[]).filter(x=>x.featured&&x.unlocked).slice(0,5);\n    wrap.innerHTML=`<div class="public-player-detail">'
j=j.replace(find,replace,1)
# Insert public emblem block before activity
find2='      <div class="public-player-missions"><h3>Atividade recente</h3>${missions}</div>'
rep2='      <div class="public-player-emblems"><div class="public-player-section-head"><div><p class="eyebrow">🏅 EMBLEMS</p><h3>Marcas em destaque</h3></div></div><div class="public-emblem-strip">${publicEmblems.length?publicEmblems.map(x=>renderEmblemCard(x,{compact:true})).join(\'\'):`<p style="color:#888;font-size:10px">Nenhum Emblem em destaque.</p>`}</div></div>\n'+find2
j=j.replace(find2,rep2,1)
appjs.write_text(j)

# CSS append
c=css.read_text()
c += r'''
/* V72 — Emblems */
.emblem-hero{background:radial-gradient(circle at 78% 30%,rgba(198,164,93,.15),transparent 34%),linear-gradient(135deg,#111216,#18140e)}
.emblems-root{display:grid;gap:16px}.emblem-summary{display:flex;justify-content:space-between;align-items:center;gap:20px;background:linear-gradient(135deg,#111216,#1d1810);color:#fff}.emblem-summary h2{font:600 32px Cinzel;margin:0 0 6px}.emblem-summary p:not(.eyebrow){color:#aaa;font-size:11px;max-width:700px;line-height:1.6}.emblem-summary-stats{display:flex;gap:10px;flex-wrap:wrap}.emblem-summary-stats span{min-width:105px;border:1px solid #3a362f;border-radius:10px;padding:12px;background:#0d0e10}.emblem-summary-stats small{display:block;color:#888;font-size:7px;letter-spacing:.15em}.emblem-summary-stats b{display:block;font:600 22px Cinzel;color:#d9bc79;margin-top:4px}.emblem-collection-head{display:flex;align-items:end;justify-content:space-between}.emblem-collection-head h2{font:600 28px Cinzel;margin:0}.emblem-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.emblem-card{background:#fff;border:1px solid #ddd4c6;border-radius:12px;overflow:hidden;position:relative}.emblem-card.locked{filter:saturate(.35);opacity:.78}.emblem-card.featured{border-color:#c6a45d;box-shadow:0 0 0 2px rgba(198,164,93,.12)}.emblem-card-art{height:120px;background:radial-gradient(circle,#3a352a 0,#17181b 72%);display:grid;place-items:center}.emblem-card-art span{width:68px;height:68px;border-radius:50%;border:1px solid #c6a45d;display:grid;place-items:center;font-size:31px;background:#0f1012;box-shadow:0 8px 30px rgba(0,0,0,.25)}.emblem-card-body{padding:14px}.emblem-card-top{display:flex;justify-content:space-between;gap:8px;align-items:center}.emblem-card-top small{font-size:8px;color:#8b7a5c}.emblem-card h3{font:600 18px Cinzel;margin:7px 0 6px}.emblem-card p{font-size:9px;color:#777;line-height:1.55;min-height:42px}.emblem-stage-track{display:flex;gap:5px;margin-top:10px}.emblem-stage-track span{width:24px;height:24px;border-radius:50%;border:1px solid #d5cbbd;display:grid;place-items:center;font-size:8px;color:#aaa;background:#f7f4ee}.emblem-stage-track span.unlocked{border-color:#b18b47;background:#f4ead6;color:#8b6b36;font-weight:800}.emblem-stage-label{margin-top:8px;font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:#8d784f;font-weight:800}.emblem-progress{margin-top:10px}.emblem-progress>div:first-child{display:flex;justify-content:space-between;gap:8px}.emblem-progress small{font-size:7px;color:#777}.emblem-progress b{font-size:8px;color:#8e713e}.emblem-progress-bar{height:5px;background:#eee9df;border-radius:999px;overflow:hidden;margin-top:5px}.emblem-progress-bar i{display:block;height:100%;background:#c6a45d}.emblem-featured-badge{display:inline-block;margin-top:9px;padding:4px 7px;border-radius:999px;background:#f5eddc;color:#8a6f3e;font-size:7px;font-weight:800}.emblem-card button{margin-top:10px;width:100%;min-height:34px;font-size:8px}.emblem-loading{padding:30px;text-align:center}.dashboard-emblems-panel{margin-top:12px}.dashboard-emblems-preview{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.dashboard-emblems-preview .emblem-card{min-width:0}.dashboard-emblems-preview .emblem-card-art{height:72px}.dashboard-emblems-preview .emblem-card-art span{width:43px;height:43px;font-size:21px}.dashboard-emblems-preview .emblem-card-body{padding:9px}.dashboard-emblems-preview .emblem-card p,.dashboard-emblems-preview .emblem-progress,.dashboard-emblems-preview .emblem-stage-track,.dashboard-emblems-preview .emblem-card button{display:none}.dashboard-emblems-preview .emblem-card h3{font-size:11px}.dashboard-emblems-preview .emblem-stage-label{font-size:7px}.public-player-emblems{margin-top:18px}.public-player-section-head{margin-bottom:10px}.public-player-section-head h3{font:600 18px Cinzel;margin:0}.public-emblem-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.public-emblem-strip .emblem-card-art{height:70px}.public-emblem-strip .emblem-card-art span{width:42px;height:42px;font-size:20px}.public-emblem-strip .emblem-card-body{padding:8px}.public-emblem-strip .emblem-card p,.public-emblem-strip .emblem-progress,.public-emblem-strip .emblem-stage-track,.public-emblem-strip .emblem-card button{display:none}.public-emblem-strip .emblem-card h3{font-size:10px}.public-emblem-strip .emblem-stage-label{font-size:6px}.admin-emblems-panel{margin-top:12px}.emblem-admin-form{display:grid;gap:12px}.emblem-stage-admin-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.emblem-stage-admin{border:1px solid #ddd4c6;background:#faf8f3;border-radius:10px;padding:12px}.emblem-stage-admin b{display:block;font:600 13px Cinzel;margin-bottom:8px}.emblem-stage-admin input,.emblem-stage-admin textarea{width:100%;border:1px solid #cec5b7;border-radius:8px;background:#fff;padding:9px;font-size:10px;margin-bottom:7px}.emblem-stage-admin textarea{min-height:74px;resize:vertical}.emblem-admin-tools{display:flex;gap:8px;max-width:520px;margin:15px 0}.emblem-admin-tools input,.emblem-admin-tools select{height:40px;border:1px solid #cec5b7;border-radius:8px;background:#fff;padding:0 10px;font-size:11px}.emblem-admin-tools input{flex:1}.emblem-admin-row{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:13px 0;border-top:1px solid #e6dfd4}.emblem-admin-row-main{display:flex;gap:11px;align-items:center;min-width:0}.emblem-admin-icon{width:42px;height:42px;border-radius:10px;border:1px solid #d8ccb8;background:#faf7ef;display:grid;place-items:center;font-size:22px;flex:none}.emblem-admin-row b{font:600 13px Cinzel}.emblem-admin-row small{display:block;color:#888;font-size:8px;margin-top:4px}.emblem-admin-row p{margin:4px 0 0;color:#777;font-size:9px}.emblem-admin-actions{display:flex;gap:5px;flex:none}.emblem-admin-actions button{width:34px;height:34px;border:1px solid #d3cbbb;background:#fff;border-radius:8px;cursor:pointer}.emblem-admin-actions .delete{color:#7d3f3f}
@media(max-width:1000px){.emblem-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.dashboard-emblems-preview{grid-template-columns:repeat(3,minmax(0,1fr))}.public-emblem-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.emblem-stage-admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){.emblem-summary{flex-direction:column;align-items:flex-start}.emblem-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-emblems-preview{grid-template-columns:repeat(2,minmax(0,1fr))}.public-emblem-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.emblem-stage-admin-grid{grid-template-columns:1fr}.emblem-admin-tools{flex-direction:column;max-width:none}.emblem-admin-row{align-items:flex-start;flex-direction:column}.emblem-admin-actions{width:100%}.emblem-admin-actions button{flex:1}.emblem-summary h2{font-size:25px}}
@media(max-width:480px){.emblem-grid{grid-template-columns:1fr}.dashboard-emblems-preview{grid-template-columns:1fr 1fr}.public-emblem-strip{grid-template-columns:1fr 1fr}}
'''
css.write_text(c)

# README v72
readme=root/'README_V72_EMBLEMS.md'
readme.write_text('''# Portal Spade — V72 — Sistema de Emblems\n\nImplementação aprovada do sistema de Emblems.\n\n## Conceito\nCada Emblem possui quatro estágios fixos: Inicial, Mediano, Avançado e Supremo. O mesmo Emblem evolui; não são quatro registros independentes.\n\n## Banco\n- emblems\n- emblem_stages (quatro estágios por Emblem)\n- player_emblems (posse/evolução por jogador)\n\n## Requisitos automáticos suportados\nCARDS_TOTAL, CARD_CATEGORIES, MISSIONS_TOTAL, EVENTS_PARTICIPATED, TOURNAMENT_WINS, POWER, SKILL_SC, SKILL_VT, ACHIEVEMENTS, ROLE, HOUSE, PATENT.\n\nRequisitos são JSON por estágio no formato {"logic":"ALL","conditions":[...]} ou logic ANY. Emblems com progressão automática sobem de estágio sem downgrade. Emblems manuais são concedidos/revogados pela Administração.\n\n## Segurança\nEmblems nunca alteram HP, Mana, dano, ranking ou qualquer regra de combate. Destaques do jogador são limitados a 5. Emblems secretos permanecem ocultos até serem conquistados.\n''')

print('patched')
