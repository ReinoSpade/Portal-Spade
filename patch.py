from pathlib import Path
p=Path('/mnt/data/v33-work/server.js')
s=p.read_text()
# add mission tables after existing missions table block
needle='''    CREATE TABLE IF NOT EXISTS houses (\n'''
insert='''    CREATE TABLE IF NOT EXISTS mission_activities (\n      id BIGSERIAL PRIMARY KEY,\n      mission_type TEXT NOT NULL DEFAULT 'Luta',\n      start_at TIMESTAMPTZ NOT NULL,\n      end_at TIMESTAMPTZ NOT NULL,\n      description TEXT DEFAULT '',\n      instructions TEXT DEFAULT '',\n      reward_yuls BIGINT DEFAULT 0 CHECK (reward_yuls >= 0),\n      reward_exp BIGINT DEFAULT 0 CHECK (reward_exp >= 0),\n      reward_cards TEXT DEFAULT '',\n      status TEXT NOT NULL DEFAULT 'AGENDADA',\n      published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),\n      created_by_admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,\n      created_at TIMESTAMPTZ DEFAULT NOW(),\n      updated_at TIMESTAMPTZ DEFAULT NOW(),\n      CHECK (end_at > start_at)\n    );\n\n    CREATE INDEX IF NOT EXISTS idx_mission_activities_dates ON mission_activities(start_at,end_at,status);\n\n'''+needle
s=s.replace(needle,insert,1)
# add routes before public events
needle='''app.get("/api/events", async (req,res)=>{\n'''
routes=r'''const MISSION_TYPES=["Luta","Trívia","História","Treinamento","Recrutamento","Outro"];
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

'''
s=s.replace(needle,routes+needle,1)
p.write_text(s)

# HTML
p=Path('/mnt/data/v33-work/public/index.html'); s=p.read_text()
s=s.replace('''<button data-page="eventos">Eventos</button>''','''<button data-page="eventos">Eventos</button><button data-page="missoes" id="missionsNav">Missões</button>''',1)
needle='''<section class="page" id="eventos">'''
mission_html='''<section class="page" id="missoes">\n  <div class="subhero">\n    <p class="eyebrow">ATIVIDADES DO REINO</p>\n    <h1>Missões de <em>Spade.</em></h1>\n    <p>Atividades oficiais com período, instruções e recompensas. Missões não possuem título.</p>\n  </div>\n  <div class="content">\n    <div id="missionActiveFeature"></div>\n    <div class="event-filter-bar"><input class="search" id="missionSearch" placeholder="Pesquisar por tipo de missão..."><select class="admin-filter" id="missionStatusFilter"><option value="">Todos os status</option><option value="EM_ANDAMENTO">Em andamento</option><option value="AGENDADA">Agendadas</option><option value="CONCLUIDA">Concluídas</option></select></div>\n    <div id="missionGrid" class="mission-grid"></div>\n  </div>\n</section>'''
s=s.replace(needle,mission_html+needle,1)
# admin panel insert before bulk toolbar
needle='''  <div class="bulk-toolbar panel" id="bulkToolbar">'''
admin_m='''  <div class="admin-mission-manager panel" id="adminMissionManager">\n    <div class="panel-head"><div><p class="eyebrow">ATIVIDADES OFICIAIS</p><h3>Administração de Missões</h3></div><span>Missões sem título: tipo + período + instruções + recompensas</span></div>\n    <form id="adminMissionForm" class="mission-admin-form">\n      <input type="hidden" id="adminMissionId">\n      <select id="adminMissionType"><option>Luta</option><option>Trívia</option><option>História</option><option>Treinamento</option><option>Recrutamento</option><option>Outro</option></select>\n      <input id="adminMissionStart" type="datetime-local" required><input id="adminMissionEnd" type="datetime-local" required>\n      <select id="adminMissionStatus"><option>AGENDADA</option><option>EM_ANDAMENTO</option><option>CONCLUIDA</option><option>CANCELADA</option></select>\n      <input id="adminMissionYuls" type="number" min="0" placeholder="Recompensa em Yuls">\n      <input id="adminMissionExp" type="number" min="0" placeholder="Recompensa em EXP">\n      <input id="adminMissionCards" class="wide" placeholder="Cards de recompensa (opcional)">\n      <textarea id="adminMissionDescription" class="wide" placeholder="Descrição da missão"></textarea>\n      <textarea id="adminMissionInstructions" class="wide" placeholder="Instruções / regras da missão"></textarea>\n      <div class="editor-actions wide"><button class="gold" type="submit">＋ Publicar missão</button><button class="outline dark-outline" type="button" id="adminMissionClear">Limpar</button><span class="error" id="adminMissionError"></span></div>\n    </form>\n    <div class="eyebrow" style="margin-top:18px">HISTÓRICO DE MISSÕES</div><div id="adminMissionList" class="admin-mission-list"></div>\n  </div>\n\n'''
s=s.replace(needle,admin_m+needle,1)
s=s.replace('<script src="/app.js?v=31.0"></script>','<script src="/app.js?v=33.0"></script>')
p.write_text(s)

# JS
p=Path('/mnt/data/v33-work/public/app.js'); s=p.read_text()
s=s.replace('statusBoard:[],todayStatus:null,editorialOverview:null','statusBoard:[],todayStatus:null,editorialOverview:null,missions:[],adminMissions:[]')
s=s.replace('if(page==="eventos") loadEvents();','if(page==="eventos") loadEvents();\n  if(page==="missoes") loadMissions();')
# Insert functions before loadEvents likely
needle='''async function loadEvents(){'''
func=r'''async function loadMissions(){
  const grid=qs("#missionGrid"),feature=qs("#missionActiveFeature"); if(!grid)return;
  try{
    const d=await api("/api/missions"); state.missions=d.missions||[]; renderMissionsPublic(state.missions);
  }catch(e){grid.innerHTML=`<div class="panel"><h3>Missões indisponíveis</h3><p>${escapeHtml(e.message)}</p></div>`;}
}
function missionLabel(m){return `Missão de ${m.mission_type||"Missão"}`;}
function missionDate(v){try{return new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});}catch{return String(v||"")}}
function renderMissionsPublic(items){
  const feature=qs("#missionActiveFeature"),grid=qs("#missionGrid"); if(!grid)return;
  const search=(qs("#missionSearch")?.value||"").toLowerCase(),filter=qs("#missionStatusFilter")?.value||"";
  const arr=(items||[]).filter(m=>(!search||String(m.mission_type||"").toLowerCase().includes(search))&&(!filter||m.status===filter));
  const active=(items||[]).find(m=>m.status==="EM_ANDAMENTO");
  if(feature) feature.innerHTML=active?`<div class="mission-active-feature"><div><p class="eyebrow">⚔️ ACONTECENDO AGORA</p><h2>${escapeHtml(missionLabel(active))}</h2><p>Encerra em <b>${escapeHtml(missionDate(active.end_at))}</b>.</p></div><button class="gold small" type="button" data-mission-scroll="${active.id}">Ver missão</button></div>`:"";
  grid.innerHTML=arr.length?arr.map(m=>`<article class="mission-card ${m.status==="EM_ANDAMENTO"?"active":""}" id="mission-${m.id}"><div class="mission-card-top"><span class="tag">${escapeHtml(m.status)}</span><b>${escapeHtml(missionLabel(m))}</b></div><p>${escapeHtml(m.description||"Sem descrição publicada.")}</p><div class="mission-meta"><span>📅 ${escapeHtml(missionDate(m.start_at))}</span><span>⏳ ${escapeHtml(missionDate(m.end_at))}</span></div><div class="mission-instructions"><b>Instruções</b><p>${escapeHtml(m.instructions||"Consulte as instruções oficiais no Portal.")}</p></div><div class="mission-rewards">${m.reward_yuls?`🪙 ${money(m.reward_yuls)} Yuls`:""}${m.reward_exp?` ✨ ${money(m.reward_exp)} EXP`:""}${m.reward_cards?` 🃏 ${escapeHtml(m.reward_cards)}`:""}${!m.reward_yuls&&!m.reward_exp&&!m.reward_cards?"Sem recompensa cadastrada":""}</div></article>`).join(""):`<div class="panel"><h3>Nenhuma missão encontrada.</h3><p>Ajuste os filtros ou aguarde uma nova atividade oficial.</p></div>`;
  qsa("[data-mission-scroll]").forEach(b=>b.onclick=()=>qs(`#mission-${b.dataset.missionScroll}`)?.scrollIntoView({behavior:"smooth",block:"center"}));
}
qs("#missionSearch")?.addEventListener("input",()=>renderMissionsPublic(state.missions));
qs("#missionStatusFilter")?.addEventListener("change",()=>renderMissionsPublic(state.missions));

'''
s=s.replace(needle,func+needle,1)
# permission visibility and init
s=s.replace('schedule:[".admin-schedule-manager"],events:[".admin-event-manager"]','schedule:[".admin-schedule-manager"],events:[".admin-event-manager"],missions:[".admin-mission-manager"]')
s=s.replace('if(hasAdminPermission("schedule")) await loadAdminSchedule();','if(hasAdminPermission("schedule")) await loadAdminSchedule();\n    if(hasAdminPermission("missions")) await loadAdminMissions();')
# append admin mission functions before initAdmin
needle='''async function initAdmin(){'''
adminfunc=r'''async function loadAdminMissions(){
  const list=qs("#adminMissionList");if(!list)return;
  try{const d=await adminApi("/api/admin/missions");state.adminMissions=d.missions||[];renderAdminMissions();}catch(e){list.innerHTML=`<div class="admin-history-empty">${escapeHtml(e.message)}</div>`}
}
function toLocalInput(v){const d=new Date(v);if(Number.isNaN(d.getTime()))return "";const z=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;}
function renderAdminMissions(){
  const list=qs("#adminMissionList");if(!list)return;
  list.innerHTML=(state.adminMissions||[]).map(m=>`<div class="admin-mission-item"><div><b>${escapeHtml(missionLabel(m))}</b><small>${escapeHtml(m.status)} • ${escapeHtml(missionDate(m.start_at))} → ${escapeHtml(missionDate(m.end_at))}${m.published?"":" • Não publicada"}</small></div><div class="admin-mission-actions"><button type="button" data-mission-edit="${m.id}">✎</button><button type="button" class="delete" data-mission-cancel="${m.id}">×</button></div></div>`).join("")||`<div class="admin-history-empty">Nenhuma missão cadastrada.</div>`;
  qsa("[data-mission-edit]").forEach(b=>b.onclick=()=>editAdminMission(Number(b.dataset.missionEdit)));
  qsa("[data-mission-cancel]").forEach(b=>b.onclick=async()=>{if(!confirm("Encerrar esta missão sem apagar seu registro?"))return;try{await adminApi(`/api/admin/missions/${b.dataset.missionCancel}`,{method:"DELETE"});await loadAdminMissions();await loadMissions();}catch(e){alert(e.message)}});
}
function editAdminMission(id){const m=state.adminMissions.find(x=>Number(x.id)===id);if(!m)return;qs("#adminMissionId").value=m.id;qs("#adminMissionType").value=m.mission_type;qs("#adminMissionStart").value=toLocalInput(m.start_at);qs("#adminMissionEnd").value=toLocalInput(m.end_at);qs("#adminMissionStatus").value=m.status;qs("#adminMissionYuls").value=m.reward_yuls||0;qs("#adminMissionExp").value=m.reward_exp||0;qs("#adminMissionCards").value=m.reward_cards||"";qs("#adminMissionDescription").value=m.description||"";qs("#adminMissionInstructions").value=m.instructions||"";qs("#adminMissionError").textContent="Editando missão.";qs("#adminMissionManager")?.scrollIntoView({behavior:"smooth",block:"center"});}
function clearAdminMissionForm(){qs("#adminMissionForm")?.reset();qs("#adminMissionId").value="";qs("#adminMissionError").textContent="";qs("#adminMissionStatus").value="AGENDADA";}
qs("#adminMissionClear")?.addEventListener("click",clearAdminMissionForm);
qs("#adminMissionForm")?.addEventListener("submit",async e=>{e.preventDefault();const err=qs("#adminMissionError");err.textContent="";const body={mission_type:qs("#adminMissionType").value,start_at:qs("#adminMissionStart").value,end_at:qs("#adminMissionEnd").value,status:qs("#adminMissionStatus").value,reward_yuls:Number(qs("#adminMissionYuls").value||0),reward_exp:Number(qs("#adminMissionExp").value||0),reward_cards:qs("#adminMissionCards").value,description:qs("#adminMissionDescription").value,instructions:qs("#adminMissionInstructions").value};const id=qs("#adminMissionId").value;try{await adminApi(id?`/api/admin/missions/${id}`:"/api/admin/missions",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});clearAdminMissionForm();await loadAdminMissions();await loadMissions();alert(id?"Missão atualizada.":"Missão publicada.");}catch(ex){err.textContent=ex.message}});

'''
s=s.replace(needle,adminfunc+needle,1)
p.write_text(s)

# CSS append
p=Path('/mnt/data/v33-work/public/style.css'); s=p.read_text()
s+=r'''
.mission-active-feature{background:#111216;color:#fff;border:1px solid #3b3c42;border-radius:14px;padding:22px;display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:18px}.mission-active-feature h2{font:600 27px Cinzel;margin:0 0 7px}.mission-active-feature p:not(.eyebrow){margin:0;color:#aaa;font-size:11px}.mission-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.mission-card{background:#fff;border:1px solid #dcd5c8;border-radius:12px;padding:20px}.mission-card.active{border-color:#b29252;box-shadow:0 0 0 1px #b29252}.mission-card-top{display:flex;justify-content:space-between;gap:10px;align-items:center}.mission-card-top b{font:600 20px Cinzel}.mission-card>p{font-size:11px;color:#6f6b63;line-height:1.65}.mission-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:9px;color:#777;border-top:1px solid #eee6da;border-bottom:1px solid #eee6da;padding:11px 0}.mission-instructions{margin-top:13px}.mission-instructions b{font-size:9px;text-transform:uppercase;letter-spacing:.12em}.mission-instructions p{font-size:10px;color:#777;line-height:1.6;white-space:pre-line}.mission-rewards{margin-top:12px;font-size:10px;color:#9a7738;font-weight:800}.admin-mission-manager{margin:12px 0}.mission-admin-form{display:grid;grid-template-columns:1fr 1fr 1fr .8fr;gap:8px}.mission-admin-form input,.mission-admin-form select,.mission-admin-form textarea{border:1px solid #cec5b7;border-radius:8px;background:#fff;padding:11px;font-size:11px}.mission-admin-form textarea{min-height:78px;resize:vertical}.mission-admin-form .wide{grid-column:1/-1}.admin-mission-list{display:grid;gap:7px;margin-top:9px;max-height:360px;overflow:auto}.admin-mission-item{background:#faf8f3;border:1px solid #e0d8cc;border-radius:9px;padding:12px;display:flex;justify-content:space-between;gap:10px;align-items:center}.admin-mission-item b{font:600 14px Cinzel}.admin-mission-item small{display:block;color:#777;font-size:9px;margin-top:3px}.admin-mission-actions{display:flex;gap:5px}.admin-mission-actions button{height:34px;min-width:34px;border:1px solid #d2cabc;background:#fff;border-radius:7px;cursor:pointer}.admin-mission-actions .delete{color:#8b5050}@media(max-width:900px){.mission-grid{grid-template-columns:1fr}.mission-admin-form{grid-template-columns:1fr 1fr}.mission-admin-form .wide{grid-column:1/-1}}@media(max-width:520px){.mission-active-feature{align-items:flex-start;flex-direction:column}.mission-admin-form{grid-template-columns:1fr}.mission-admin-form .wide{grid-column:auto}}
'''
p.write_text(s)
