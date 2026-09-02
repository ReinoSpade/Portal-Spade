const state={page:"home",me:null,admin:false,adminKey:null,players:[],selectedPlayer:null};

const qs=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const money=v=>Number(v||0).toLocaleString("pt-BR");

function go(page){
  state.page=page;
  qsa(".page").forEach(x=>x.classList.toggle("active",x.id===page));
  qsa("nav button[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  qs("#nav")?.classList.remove("open");
  if(page==="home") loadHome();
  if(page==="jornal") loadEditions();
  if(page==="jogadores") loadPlayers();
  if(page==="casas") loadHouses();
  if(page==="ranking") loadRanking();
  if(page==="hierarquia") loadHierarchy();
  if(page==="dashboard"){ if(state.me) renderDashboard(); else refreshDashboard(); }
  if(page==="admin" && state.admin) initAdmin();
}

qsa("[data-page]").forEach(el=>el.addEventListener("click",()=>go(el.dataset.page)));
qs("#hamb").addEventListener("click",()=>qs("#nav").classList.toggle("open"));

async function api(url,options={}){
  options.credentials="same-origin";
  const r=await fetch(url,options);let d={};
  try{d=await r.json()}catch{}
  if(!r.ok)throw new Error(d.error||"Ocorreu um erro.");
  return d;
}

async function loadHome(){
  try{
    const d=await api("/api/home");state.data=d;
    qs("#newsGrid").innerHTML=d.news.length?d.news.map((n,i)=>`<article class="news-card ${i===0?"featured":""}"><div class="art ${n.image_url?"has-image":""}" ${n.image_url?`style="background-image:url('${escapeHtml(n.image_url)}')"`:""}>${n.image_url?"":(i===0?"♠":"◆")}</div><div><span class="tag">${escapeHtml(n.category)}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.excerpt)}</p></div></article>`).join(""):`<div class="panel"><h3>Nenhuma notícia publicada</h3><p>Use o painel administrativo para publicar a primeira.</p></div>`;
    const e=d.editions[0];qs("#editionTitle").textContent=e?e.title:"Nenhuma edição publicada";qs("#editionDesc").textContent=e?e.description:"Adicione uma edição pelo painel administrativo.";
  }catch(e){qs("#newsGrid").innerHTML=`<div class="panel"><h3>Erro ao carregar</h3><p>${escapeHtml(e.message)}</p></div>`}
}

async function loadEditions(){
  try{
    const d=state.data||await api("/api/home");
    state.data=d;
    renderJournal(d.editions||[],d.news||[]);
  }catch(e){
    const el=qs("#editions");if(el)el.innerHTML=`<div class="panel"><h3>Erro ao carregar o jornal</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function renderJournal(editions,news){
  const feature=qs("#journalFeature");
  const editionEl=qs("#editions");
  const newsEl=qs("#journalNews");
  const latest=editions?.[0];

  if(feature){
    feature.innerHTML=latest
      ? `<div class="journal-feature-cover ${latest.cover_url?"":"fallback"}" ${latest.cover_url?`style="background-image:url('${escapeHtml(latest.cover_url)}')"`:""}>${latest.cover_url?"":`<div class="cover-fallback"><span style="font-size:65px">♠</span><b>SPADE</b><small>${escapeHtml(latest.edition||"EDIÇÃO")}</small></div>`}</div>
         <div class="journal-feature-info">
           <div class="journal-feature-meta">${escapeHtml(latest.edition||"EDIÇÃO")} • ${escapeHtml(String(latest.date||""))}</div>
           <h2>${escapeHtml(latest.title)}</h2>
           <p>${escapeHtml(latest.description||"")}</p>
           <div class="actions">${latest.pdf_url?`<a class="gold" href="${escapeHtml(latest.pdf_url)}" target="_blank" rel="noopener">📄 Abrir PDF</a>`:""}<button class="outline" data-journal-scroll>Ver todas as edições</button></div>
         </div>`
      : `<div class="panel"><h3>O jornal ainda não possui uma edição.</h3><p>As próximas edições serão publicadas pela administração.</p></div>`;
    const scroll=feature.querySelector("[data-journal-scroll]");
    if(scroll)scroll.onclick=()=>editionEl?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  if(editionEl){
    editionEl.innerHTML=editions?.length
      ? editions.map(e=>`<article class="edition">
          <div class="edition-cover ${e.cover_url?"has-image":""}" ${e.cover_url?`style="background-image:url('${escapeHtml(e.cover_url)}')"`:""}>
            ${e.cover_url?"":`<span>♠</span><small>${escapeHtml(e.edition||"EDIÇÃO")}</small><b>SPADE</b><em>${escapeHtml(String(e.date||""))}</em>`}
          </div>
          <h3>${escapeHtml(e.title)}</h3>
          <p>${escapeHtml(e.description||"")}</p>
          <div class="actions">${e.pdf_url?`<a class="gold small" href="${escapeHtml(e.pdf_url)}" target="_blank" rel="noopener">📄 PDF</a>`:`<span class="tag">PDF NÃO DISPONÍVEL</span>`}</div>
        </article>`).join("")
      : `<div class="panel"><h3>Nenhuma edição publicada.</h3></div>`;
  }

  if(newsEl){
    newsEl.innerHTML=news?.length
      ? news.map((n,i)=>`<article class="news-card ${i===0?"featured":""}">
          <div class="art ${n.image_url?"has-image":""}" ${n.image_url?`style="background-image:url('${escapeHtml(n.image_url)}')"`:""}>${n.image_url?"":(i===0?"♠":"◆")}</div>
          <div><span class="tag">${escapeHtml(n.category||"RPG")} • ${escapeHtml(String(n.date||""))}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.excerpt||"")}</p></div>
        </article>`).join("")
      : `<div class="panel"><h3>Nenhuma notícia publicada.</h3></div>`;
  }
}
async function loadPlayers(){
  const d=await api("/api/players");state.players=d.players;renderPlayers("");
  qs("#playerSearch").oninput=e=>renderPlayers(e.target.value);
}
function renderPlayers(term){
  const t=term.trim().toLowerCase();const p=(state.players||[]).filter(x=>`${x.nick} ${x.identifier} ${x.house}`.toLowerCase().includes(t));
  qs("#playerGrid").innerHTML=p.map(x=>`<article class="player-card"><h3>${escapeHtml(x.nick)}${escapeHtml(x.number)}</h3><p><b>Casa:</b> ${escapeHtml(x.house||"—")}<br><b>Patente:</b> ${escapeHtml(x.patent)}</p><div class="public-role-chips">${(x.roles||[]).map(r=>`<span class="public-role-chip">${escapeHtml(r.name)}</span>`).join("")||`<span class="tag">Nenhum cargo</span>`}</div><p><b>Missões:</b> ${x.missions}<br><b>Yuls:</b> 🪙 ${money(x.yuls)}</p></article>`).join("")||`<div class="panel"><h3>Nenhum jogador encontrado.</h3></div>`;
}
async function loadHouses(){
  try{
    const d=await api("/api/houses");
    state.houses=d.houses||[];
    renderHouses(state.houses);
  }catch(e){
    qs("#houseGrid").innerHTML=`<div class="house-empty">${escapeHtml(e.message)}</div>`;
  }
}
function renderHouses(houses){
  const grid=qs("#houseGrid");
  const detail=qs("#houseDetail");
  if(!grid||!detail)return;
  grid.innerHTML=houses.length
    ? houses.map(h=>`<button type="button" class="house-public-card" data-house-id="${h.id}">
        <div class="house-emblem">${escapeHtml(h.emblem||"♜")}</div>
        <h3>${escapeHtml(h.name)}</h3>
        <p>${escapeHtml(h.description||"Casa do Reino Spade.")}</p>
        <div class="house-meta"><span>${h.count} membros</span><span>${h.missions} missões</span><span>🪙 ${money(h.yuls)}</span></div>
      </button>`).join("")
    : `<div class="house-empty">Nenhuma Casa cadastrada.</div>`;
  qsa("[data-house-id]").forEach(b=>b.addEventListener("click",()=>openHouse(Number(b.dataset.houseId))));
  detail.innerHTML="";
}

async function openHouse(id){
  const detail=qs("#houseDetail");
  if(!detail)return;
  detail.innerHTML=`<div class="house-detail"><p class="eyebrow">CARREGANDO CASA</p><h2>Consultando os registros...</h2></div>`;
  try{
    const d=await api(`/api/houses/${id}`),h=d.house;
    qsa(".house-public-card").forEach(x=>x.classList.toggle("selected",Number(x.dataset.houseId)===id));
    detail.innerHTML=`<div class="house-detail">
      <div class="house-back"><button type="button" id="closeHouse">← Voltar para Casas</button></div>
      <div class="house-detail-head">
        <div class="house-detail-ident">
          <div class="house-emblem">${escapeHtml(h.emblem||"♜")}</div>
          <div><p class="eyebrow">CASA</p><h2>${escapeHtml(h.name)}</h2><p class="lead-house">${escapeHtml(h.description||"")}</p></div>
        </div>
        <div style="text-align:right"><small style="color:#777;font-size:8px;letter-spacing:.12em;text-transform:uppercase">Liderança</small><div style="font-size:11px;margin-top:6px">${escapeHtml(h.leader||"Não definida")}</div><div style="color:#888;font-size:10px;margin-top:3px">${h.vice_leader?`Vice: ${escapeHtml(h.vice_leader)}`:"Vice-liderança não definida"}</div></div>
      </div>
      <div class="house-stats"><div class="house-stat"><small>Membros</small><b>${h.count}</b></div><div class="house-stat"><small>Missões</small><b>${h.missions}</b></div><div class="house-stat"><small>Yuls somados</small><b>🪙 ${money(h.yuls)}</b></div></div>
      <div class="house-members"><h3>Membros da Casa</h3>
        ${h.members.length?h.members.map(p=>`<div class="house-member-row"><div class="member-main"><b>${escapeHtml(p.nick)}${escapeHtml(p.number)}</b><small>${escapeHtml(p.patent||"")} ${p.role?`• ${escapeHtml(p.role)}`:""}</small></div><div class="member-values"><span>📋 ${p.missions} missões</span><span>🪙 ${money(p.yuls)} Yuls ${p.ranking>0?`• #${p.ranking}`:""}</span></div></div>`).join(""):`<div style="color:#888;font-size:11px;padding:10px 0">Nenhum membro público cadastrado.</div>`}
      </div>
    </div>`;
    qs("#closeHouse").addEventListener("click",()=>{detail.innerHTML="";qsa(".house-public-card").forEach(x=>x.classList.remove("selected"));});
    detail.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(e){
    detail.innerHTML=`<div class="house-empty">${escapeHtml(e.message)}</div>`;
  }
}
let rankingData={force:[],activity:[],missions:[],wealth:[],houses:[]};
let activeRanking="force";

async function loadHierarchy(){
  try{
    const d=await api("/api/hierarchy");
    renderPublicHierarchy(d);
    state.hierarchy=d;
  }catch(e){
    const p=qs("#publicPatents"),r=qs("#publicRoles");
    if(p)p.innerHTML=`<div class="hierarchy-item"><p>${escapeHtml(e.message)}</p></div>`;
    if(r)r.innerHTML=`<div class="hierarchy-item"><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function renderPublicHierarchy(d){
  const p=qs("#publicPatents"),r=qs("#publicRoles");
  if(p)p.innerHTML=(d.patents||[]).map(x=>`<div class="hierarchy-item"><h4>${escapeHtml(x.name)}</h4><p>${escapeHtml(x.description||"")}</p></div>`).join("")||`<div class="hierarchy-item"><p>Nenhuma patente cadastrada.</p></div>`;
  if(r)r.innerHTML=(d.roles||[]).map(x=>`<div class="hierarchy-item"><h4>${escapeHtml(x.name)}</h4><div class="hierarchy-salary">${x.salary>0?`🪙 ${money(x.salary)}`:"Remuneração não informada"}</div><p>${escapeHtml(x.description||"")}</p></div>`).join("")||`<div class="hierarchy-item"><p>Nenhum cargo cadastrado.</p></div>`;
}

async function loadAdminHierarchy(){
  try{
    const d=await adminApi("/api/admin/hierarchy");
    state.adminHierarchy=d;
    renderAdminHierarchy(d);
    return d;
  }catch(e){console.error(e);return null}
}

function renderAdminHierarchy(d){
  const patentList=qs("#adminPatentList"),roleList=qs("#adminRoleList");
  if(patentList)patentList.innerHTML=(d.patents||[]).map(x=>`<div class="hier-list-item"><div><b>🎖️ ${escapeHtml(x.name)}</b><small>Ordem: ${x.sort_order}${x.description?` • ${escapeHtml(x.description)}`:""}</small></div><div class="hier-actions"><button type="button" data-patent-edit="${x.id}">✎</button><button type="button" class="delete" data-patent-delete="${x.id}">×</button></div></div>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma patente cadastrada.</div>`;
  if(roleList)roleList.innerHTML=(d.roles||[]).map(x=>`<div class="hier-list-item"><div><b>👑 ${escapeHtml(x.name)}</b><small>🪙 ${money(x.salary)} • Ordem: ${x.sort_order}${x.description?` • ${escapeHtml(x.description)}`:""}</small></div><div class="hier-actions"><button type="button" data-role-edit="${x.id}">✎</button><button type="button" class="delete" data-role-delete="${x.id}">×</button></div></div>`).join("")||`<div style="font-size:10px;color:#888">Nenhum cargo cadastrado.</div>`;

  qsa("[data-patent-edit]").forEach(b=>b.onclick=()=>editPatent(Number(b.dataset.patentEdit)));
  qsa("[data-patent-delete]").forEach(b=>b.onclick=()=>deletePatent(Number(b.dataset.patentDelete)));
  qsa("[data-role-edit]").forEach(b=>b.onclick=()=>editRole(Number(b.dataset.roleEdit)));
  qsa("[data-role-delete]").forEach(b=>b.onclick=()=>deleteRole(Number(b.dataset.roleDelete)));
}

function resetPatentForm(){
  const f=qs("#patentForm");if(!f)return;
  f.reset();qs("#patentId").value="";qs("#patentOrder").value="0";
  qs("#patentSaveBtn").textContent="Criar patente";qs("#patentError").textContent="";
}
function resetRoleForm(){
  const f=qs("#roleForm");if(!f)return;
  f.reset();qs("#roleId").value="";qs("#roleSalary").value="0";qs("#roleOrder").value="0";
  qs("#roleSaveBtn").textContent="Criar cargo";qs("#roleError").textContent="";
}
function editPatent(id){
  const x=(state.adminHierarchy?.patents||[]).find(a=>Number(a.id)===id);if(!x)return;
  qs("#patentId").value=x.id;qs("#patentName").value=x.name;qs("#patentOrder").value=x.sort_order;qs("#patentDescription").value=x.description||"";
  qs("#patentSaveBtn").textContent="Salvar patente";qs("#patentError").textContent="";qs("#patentName").focus();
}
function editRole(id){
  const x=(state.adminHierarchy?.roles||[]).find(a=>Number(a.id)===id);if(!x)return;
  qs("#roleId").value=x.id;qs("#roleName").value=x.name;qs("#roleSalary").value=x.salary;qs("#roleOrder").value=x.sort_order;qs("#roleDescription").value=x.description||"";
  qs("#roleSaveBtn").textContent="Salvar cargo";qs("#roleError").textContent="";qs("#roleName").focus();
}
async function deletePatent(id){
  const x=(state.adminHierarchy?.patents||[]).find(a=>Number(a.id)===id);if(!x)return;
  if(!confirm(`Excluir a patente ${x.name}?`))return;
  try{await adminApi(`/api/admin/patents/${id}`,{method:"DELETE"});await loadAdminHierarchy();await loadAdminEditorial();await loadHierarchy();alert("Patente excluída.")}catch(e){alert(e.message)}
}
async function deleteRole(id){
  const x=(state.adminHierarchy?.roles||[]).find(a=>Number(a.id)===id);if(!x)return;
  if(!confirm(`Excluir o cargo ${x.name}?`))return;
  try{await adminApi(`/api/admin/roles/${id}`,{method:"DELETE"});await loadAdminHierarchy();await loadHierarchy();alert("Cargo excluído.")}catch(e){alert(e.message)}
}

async function loadRanking(){
  try{
    const d=await api("/api/rankings");
    rankingData=d;
    renderRanking(activeRanking);
    qsa(".ranking-tab").forEach(b=>{
      b.onclick=()=>{activeRanking=b.dataset.rankingTab;renderRanking(activeRanking)};
    });
  }catch(e){
    qs("#rankingBody").innerHTML=`<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;
  }
}

function renderRanking(type){
  const body=qs("#rankingBody"), info=qs("#rankingExplainer");
  if(!body)return;
  qsa(".ranking-tab").forEach(b=>b.classList.toggle("active",b.dataset.rankingTab===type));

  const descriptions={
    force:"Força é definida pelo atributo de poder cadastrado no perfil do jogador.",
    activity:"Atividade considera missões e conquistas registradas no sistema.",
    missions:"Classificação pela quantidade de missões concluídas.",
    wealth:"Classificação pelo saldo atual de Yuls.",
    houses:"Classificação das Casas pelo poder somado dos seus membros."
  };
  info.textContent=descriptions[type]||"";

  if(type==="houses"){
    const rows=rankingData.houses||[];
    body.innerHTML=rows.length?rows.map((h,i)=>`<tr>
      <td><span class="rank-number">${i+1}</span></td>
      <td><div class="house-rank-main"><span class="house-rank-emblem">${escapeHtml(h.emblem||"♜")}</span><span class="rank-main">${escapeHtml(h.name)}<small>${h.members} membros</small></span></div></td>
      <td class="rank-house">${h.leader?`Líder: ${escapeHtml(h.leader)}`:"Sem líder definida"}</td>
      <td class="rank-secondary">⚔️ ${h.power.toLocaleString("pt-BR")}</td>
      <td class="rank-secondary">📋 ${h.missions}</td>
    </tr>`).join(""):`<tr><td colspan="5">Nenhuma Casa cadastrada.</td></tr>`;
    return;
  }

  const rows=rankingData[type]||[];
  body.innerHTML=rows.length?rows.map((p,i)=>{
    let main="",secondary="";
    if(type==="force"){main=`⚔️ ${p.power.toLocaleString("pt-BR")}`;secondary=`📋 ${p.missions} missões`}
    if(type==="activity"){main=`⭐ ${(p.missions + p.achievements*3).toLocaleString("pt-BR")}`;secondary=`🏆 ${p.achievements} conquistas`}
    if(type==="missions"){main=`📋 ${p.missions}`;secondary=`🪙 ${money(p.yuls)} Yuls`}
    if(type==="wealth"){main=`🪙 ${money(p.yuls)}`;secondary=`📋 ${p.missions} missões`}
    return `<tr>
      <td><span class="rank-number">${i+1}</span></td>
      <td><div class="rank-main">${escapeHtml(p.nick)}${escapeHtml(p.number)}<small>${escapeHtml(p.identifier)}</small></div></td>
      <td class="rank-house">${escapeHtml(p.house||"Sem Casa")}</td>
      <td class="rank-secondary">${main}</td>
      <td class="rank-secondary">${secondary}</td>
    </tr>`;
  }).join(""):`<tr><td colspan="5">Nenhum jogador disponível.</td></tr>`;
}


async function loadPlayerYuls(){
  const balanceEl=qs("#playerYulsBalance");
  const historyEl=qs("#playerYulsHistory");
  if(!balanceEl||!historyEl)return;

  balanceEl.textContent=`🪙 ${money(state.me?.yuls||0)}`;
  historyEl.innerHTML="<p>Carregando histórico...</p>";

  try{
    const d=await api("/api/me/yuls-history");
    balanceEl.textContent=`🪙 ${money(d.balance)}`;

    historyEl.innerHTML=d.history.length
      ? d.history.map(h=>`<div class="player-yuls-row">
          <div class="reason">
            <b>${escapeHtml(h.reason||"Movimentação")}</b>
            <small>${escapeHtml(new Date(h.created_at).toLocaleString("pt-BR"))}</small>
          </div>
          <div class="change ${h.amount>=0?"plus":"minus"}">
            ${h.amount>=0?"+":""}${money(h.amount)}
            <small>Saldo: ${money(h.balance_after)}</small>
          </div>
        </div>`).join("")
      : `<div class="yuls-empty">Nenhuma movimentação de Yuls registrada.</div>`;
  }catch(e){
    historyEl.innerHTML=`<div class="yuls-empty">${escapeHtml(e.message)}</div>`;
  }
}

async function loadPlayerMissions(){
  const countEl=qs("#playerMissionCount");
  const historyEl=qs("#playerMissionHistory");
  if(!countEl||!historyEl)return;
  try{
    const d=await api("/api/me/missions");
    const completed=d.missions.filter(m=>m.status==="Concluída").length;
    countEl.textContent=`${completed} ${completed===1?"missão":"missões"} concluídas`;
    historyEl.innerHTML=d.missions.length?d.missions.map(m=>{
      const cls=m.status==="Concluída"?"done":m.status==="Falha"?"fail":"cancel";
      return `<div class="player-mission-row"><div class="player-mission-top"><div><div class="player-mission-title">${escapeHtml(m.title)}</div><div class="player-mission-meta">${escapeHtml(m.mission_type)}${m.mission_rank?` • ${escapeHtml(m.mission_rank)}`:""} • ${escapeHtml(String(m.completed_at||""))}</div></div><span class="mission-status ${cls}">${escapeHtml(m.status)}</span></div>${m.reward_yuls>0?`<div class="mission-reward">🪙 +${money(m.reward_yuls)} Yuls</div>`:""}${m.notes?`<div class="mission-notes">${escapeHtml(m.notes)}</div>`:""}</div>`;
    }).join(""):"<div class=\"yuls-empty\">Nenhuma missão registrada.</div>";
  }catch(e){historyEl.innerHTML=`<div class=\"yuls-empty\">${escapeHtml(e.message)}</div>`}
}

async function refreshDashboardStateOnly(){
  try{
    const d=await api("/api/me");
    state.me=d.player;
    if(state.page==="dashboard"){ renderDashboard(); }
  }catch{}
}

async function refreshDashboard(){
  try{
    const d=await api("/api/me");
    state.me=d.player;
    setPlayerNav();
    renderDashboard();
  }catch(e){
    state.me=null;
    setLoginNav();
    go("login");
  }
}

function renderDashboard(){
 if(!state.me)return go("login");
 qs("#dashName").textContent=`Bem-vindo, ${state.me.nick}.`;
 qs("#dash").innerHTML=`<div class="dash-grid"><div class="dash-main"><div class="dash-ident"><div class="avatar">♠</div><div><h2>${escapeHtml(state.me.nick)}${escapeHtml(state.me.number)}</h2><p>${escapeHtml(state.me.patent)} • ${escapeHtml(state.me.house||"Casa não definida")}</p></div></div><div class="profile-lines"><div><small>Cargos</small><b>${state.me.roles?.length?state.me.roles.map(r=>escapeHtml(r.name)).join(" • "):"Não definido"}</b></div><div><small>Grimório</small><b>${escapeHtml(state.me.grimoire||"Não definido")}</b></div></div><div class="profile-lines"><div><small>Casa</small><b>${escapeHtml(state.me.house||"Não definida")}</b></div><div><small>Ranking</small><b>${state.me.ranking||"—"}</b></div></div></div><div class="dash-status"><p class="eyebrow">STATUS</p><div class="stats"><div class="stat"><small>❤️ HP</small><b>${state.me.hp}</b></div><div class="stat"><small>♦️ Mana</small><b>${state.me.mana}</b></div><div class="stat"><small>📋 Missões</small><b>${state.me.missions}</b></div><div class="stat yuls"><small>🪙 Yuls</small><b>${money(state.me.yuls)}</b></div></div></div></div><div class="panel" style="margin-top:12px"><p class="eyebrow">CONQUISTAS</p><h3>${state.me.achievements} conquistas registradas</h3><p>Os dados serão atualizados pela administração do RPG.</p></div>`;
 loadPlayerYuls();
 loadPlayerMissions();
}

async function tryMe(){
  try{
    const d=await api("/api/me");state.me=d.player;setPlayerNav();
  }catch{}
}
function setPlayerNav(){const b=qs("#loginNav");b.textContent="Meu painel";b.dataset.page="dashboard";b.onclick=()=>go("dashboard");}
function setLoginNav(){const b=qs("#loginNav");b.textContent="Entrar";b.dataset.page="login";b.onclick=()=>go("login");}

qs("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const err=qs("#loginError");err.textContent="";
  const identifier=qs("#identifier").value.trim();
  const password=qs("#password").value;
  if(!identifier||!password){err.textContent="Preencha login e senha.";return}
  try{
    const d=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier,password})});
    state.me=d.player;setPlayerNav();go("dashboard");
  }catch(ex){err.textContent=ex.message}
});

async function adminApi(url,options={}){options.headers={...(options.headers||{}),"x-admin-key":state.adminKey};return api(url,options)}

async function loadAdminHouses(){
  try{
    const d=await adminApi("/api/admin/houses");
    state.adminHouses=d.houses||[];
    const list=qs("#adminHouseList");
    if(!list)return;
    list.innerHTML=state.adminHouses.map(h=>`<div class="admin-house-item">
      <div><b>${escapeHtml(h.emblem||"♜")} ${escapeHtml(h.name)}</b><small>${h.count} membros • ${h.missions} missões • 🪙 ${money(h.yuls)}${h.leader?` • Líder: ${escapeHtml(h.leader)}`:""}</small></div>
      <div class="admin-house-item-actions"><button type="button" data-house-edit="${h.id}" title="Editar">✎</button><button type="button" class="delete" data-house-delete="${h.id}" title="Excluir">×</button></div>
    </div>`).join("")||`<div style="color:#888;font-size:10px;padding:10px">Nenhuma Casa.</div>`;
    qsa("[data-house-edit]").forEach(b=>b.addEventListener("click",()=>editHouseForm(Number(b.dataset.houseEdit))));
    qsa("[data-house-delete]").forEach(b=>b.addEventListener("click",()=>deleteHouse(Number(b.dataset.houseDelete))));
  }catch(e){
    const list=qs("#adminHouseList");if(list)list.innerHTML=`<div style="color:#8b5050;font-size:10px;padding:10px">${escapeHtml(e.message)}</div>`;
  }
}
function resetHouseForm(){
  const form=qs("#houseForm");if(!form)return;
  form.reset();qs("#houseId").value="";qs("#houseEmblem").value="♜";
  qs("#houseSaveBtn").textContent="Criar Casa";qs("#houseError").textContent="";
}
function editHouseForm(id){
  const h=state.adminHouses.find(x=>Number(x.id)===id);if(!h)return;
  qs("#houseId").value=h.id;qs("#houseName").value=h.name;qs("#houseEmblem").value=h.emblem||"♜";
  qs("#houseLeader").value=h.leader||"";qs("#houseVice").value=h.vice_leader||"";qs("#houseDescription").value=h.description||"";
  qs("#houseSaveBtn").textContent="Salvar Casa";qs("#houseError").textContent="";
  qs("#houseName").focus();
}
async function deleteHouse(id){
  const h=state.adminHouses.find(x=>Number(x.id)===id);if(!h)return;
  if(!confirm(`Excluir ${h.name}? Os jogadores dessa Casa ficarão sem Casa.`))return;
  try{
    await adminApi(`/api/admin/houses/${id}`,{method:"DELETE"});
    if(Number(qs("#houseId").value)===id)resetHouseForm();
    await loadAdminHouses();await loadHouses();alert("Casa excluída.");
  }catch(e){alert(e.message)}
}

async function initAdmin(){
  if(!state.admin)return;
  try{
    const [ov,pl]=await Promise.all([adminApi("/api/admin/overview"),adminApi("/api/admin/players")]);
    state.players=pl.players;
    renderAdminStats(ov);renderAdminList(state.players,qs("#adminSearch").value);
    if(state.selectedPlayer){await selectAdminPlayer(state.selectedPlayer.id)}
  }catch(e){alert(e.message);go("home")}
}

function renderAdminStats(ov){
  const cards=[["👥","Jogadores",ov.players],["🏰","Casas",ov.houses],["📰","Notícias",ov.news],["📖","Edições",ov.editions],["🪙","Yuls em circulação",money(ov.yuls)],["🔐","Sem senha",ov.withoutPassword]];
  qs("#adminStats").innerHTML=cards.map(c=>`<div class="admin-stat"><span>${c[0]} ${c[1]}</span><b>${c[2]}</b></div>`).join("");
}

function renderAdminList(players,term){
  const t=String(term||"").trim().toLowerCase();
  const filtered=players.filter(p=>`${p.nick} ${p.number} ${p.identifier} ${p.house}`.toLowerCase().includes(t));
  qs("#playerCountLabel").textContent=`${filtered.length} visíveis`;
  qs("#adminPlayerList").innerHTML=filtered.map(p=>`<button class="admin-player ${state.selectedPlayer?.id===p.id?"selected":""}" data-player-id="${p.id}" type="button"><span><b>${escapeHtml(p.nick)}${escapeHtml(p.number)}</b><small>${escapeHtml(p.house||"Sem Casa")} · ${escapeHtml(p.patent)} · ${(p.roles||[]).map(r=>escapeHtml(r.name)).join(", ")||"sem cargos"} · ${p.has_password?"🔐 senha definida":"⚠️ sem senha"}</small></span><span class="player-yuls">🪙 ${money(p.yuls)}</span></button>`).join("")||`<div style="padding:30px;text-align:center;color:#888;font-size:11px">Nenhum jogador encontrado.</div>`;
  qsa(".admin-player").forEach(b=>b.addEventListener("click",()=>selectAdminPlayer(Number(b.dataset.playerId))));
}

async function selectAdminPlayer(id){
  try{
    const [d,m]=await Promise.all([adminApi(`/api/admin/players/${id}`),adminApi(`/api/admin/players/${id}/missions`)]);
    state.selectedPlayer={...d.player,history:d.history,missions:m.missions};
    renderAdminList(state.players,qs("#adminSearch").value);
    renderEditor(state.selectedPlayer);
  }catch(e){alert(e.message)}
}

function renderEditor(p){
  const hist=(p.history||[]).map(h=>`<div class="history-row"><span>${escapeHtml(h.reason||"Movimentação")}<br><small>${escapeHtml(h.created_at||"")}</small></span><b class="${h.amount>=0?"plus":"minus"}">${h.amount>=0?"+":""}${money(h.amount)} → ${money(h.balance_after)}</b></div>`).join("")||`<div style="font-size:10px;color:#888;padding:8px 0">Nenhuma movimentação registrada.</div>`;
  qs("#adminEditor").innerHTML=`<div class="editor-head"><div><p class="eyebrow">EDITANDO JOGADOR</p><h3>${escapeHtml(p.nick)}${escapeHtml(p.number)}</h3><p>${escapeHtml(p.identifier)}</p></div><button class="icon-button" type="button" id="closeEditor">×</button></div>
  <form id="editPlayerForm"><div class="form-grid">
  ${field("Nick","nick",p.nick)}${field("Número","number",p.number)}${field("Nova senha","password","","password")}${field("Casa","house",p.house)}${selectField("Patente","patent",p.patent,state.adminHierarchy?.patents||[], "name")}${rolesMultiField(p.roles||[],state.adminHierarchy?.roles||[])}${field("Grimório","grimoire",p.grimoire)}
  ${field("❤️ HP","hp",p.hp,"number")}${field("♦️ Mana","mana",p.mana,"number")}${field("🪙 Yuls","yuls",p.yuls,"number")}${field("📋 Missões","missions",p.missions,"number")}${field("🏆 Conquistas","achievements",p.achievements,"number")}${field("Ranking","ranking",p.ranking,"number")}
  <div class="field full"><label>Perfil público</label><select name="public_profile"><option value="1" ${p.public_profile?"selected":""}>Visível</option><option value="0" ${!p.public_profile?"selected":""}>Oculto</option></select></div>
  </div><div class="editor-actions"><button class="gold" type="submit">Salvar alterações</button><button class="outline dark-outline" type="button" id="deletePlayerBtn">Excluir jogador</button></div><div class="error" id="editError"></div></form>
  <div class="yuls-box"><h4>🪙 Movimentação de Yuls</h4><div class="yuls-form"><input id="yulsAmount" type="number" step="1" placeholder="+100 ou -100"><input id="yulsReason" placeholder="Motivo (pagamento, multa, recompensa...)"><button class="gold" id="yulsBtn" type="button">Lançar</button></div><div class="history">${hist}</div></div>
  <div class="admin-mission-box"><h4>⚔️ Registrar missão</h4><div class="mission-form-grid"><input id="missionTitle" class="wide" placeholder="Nome da missão"><input id="missionType" placeholder="Tipo (Missão, Evento...)"><input id="missionRank" placeholder="Rank"><select id="missionStatus"><option>Concluída</option><option>Falha</option><option>Cancelada</option><option>Em andamento</option></select><input id="missionReward" type="number" min="0" step="1" placeholder="Recompensa em Yuls"><input id="missionDate" type="date" value="${new Date().toISOString().slice(0,10)}"><textarea id="missionNotes" class="wide" placeholder="Observações (opcional)"></textarea></div><div class="mission-form-actions"><button class="gold" id="missionBtn" type="button">Registrar missão</button></div><div class="history"><div class="eyebrow" style="margin-top:15px">HISTÓRICO DE MISSÕES</div><div class="admin-mission-history">${(p.missions||[]).map(m=>`<div class="admin-mission-row"><span><b>${escapeHtml(m.title)}</b><small>${escapeHtml(m.status)}${m.mission_rank?` • ${escapeHtml(m.mission_rank)}`:""} • ${escapeHtml(String(m.completed_at||""))}</small></span><button type="button" data-mission-delete="${m.id}">Excluir</button></div>`).join("")||"<div style='font-size:10px;color:#888'>Nenhuma missão registrada.</div>"}</div></div></div>`;
  qs("#closeEditor").addEventListener("click",()=>{state.selectedPlayer=null;renderAdminList(state.players,qs("#adminSearch").value);qs("#adminEditor").innerHTML=`<div class="empty-editor"><div class="empty-icon">♠</div><p class="eyebrow">SELECIONE UM JOGADOR</p><h3>Pronto para administrar</h3><p>Escolha um jogador ao lado para editar os dados ou lançar uma movimentação de Yuls.</p></div>`});
  qs("#editPlayerForm").addEventListener("submit",savePlayer);
  qs("#deletePlayerBtn").addEventListener("click",deleteSelectedPlayer);
  qs("#yulsBtn").addEventListener("click",launchYuls);
  qs("#missionBtn").addEventListener("click",launchMission);
  qsa("[data-mission-delete]").forEach(b=>b.addEventListener("click",()=>deleteMission(Number(b.dataset.missionDelete))));
}
function rolesMultiField(selected,items){
  const ids=new Set((selected||[]).map(x=>String(typeof x==="object"?x.id:x)));
  const options=(items||[]).map(x=>`<label class="role-option"><input type="checkbox" name="role_ids" value="${escapeHtml(x.id)}" ${ids.has(String(x.id))?"checked":""}><span><b>${escapeHtml(x.name)}</b><small>${x.salary>0?`🪙 ${money(x.salary)}`:"Remuneração não informada"}</small></span></label>`).join("");
  return `<div class="field full"><label>Cargos (pode selecionar vários)</label><div class="roles-editor"><div class="roles-editor-title">Selecione todos os cargos do jogador</div><div class="roles-picker">${options||`<span style="font-size:10px;color:#888">Nenhum cargo cadastrado.</span>`}</div></div></div>`;
}
function selectField(label,name,value,items,key){
  const options=(items||[]).map(x=>`<option value="${escapeHtml(x[key]||"")}" ${String(x[key]||"")===String(value||"")?"selected":""}>${escapeHtml(x.name||x[key]||"")}</option>`).join("");
  return `<div class="field"><label>${label}</label><select name="${name}"><option value="">Não definido</option>${options}</select></div>`;
}
function field(label,name,value,type="text"){
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${escapeHtml(value??"")}"></div>`;
}
async function savePlayer(e){
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());
  b.role_ids=[...e.target.querySelectorAll('input[name="role_ids"]:checked')].map(x=>Number(x.value));
  try{
    const d=await adminApi(`/api/admin/players/${state.selectedPlayer.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    state.selectedPlayer={...d.player,history:state.selectedPlayer.history};
    await initAdmin();
    alert("Jogador atualizado com sucesso.");
  }catch(ex){qs("#editError").textContent=ex.message}
}
async function launchYuls(){
  const amount=Number(qs("#yulsAmount").value),reason=qs("#yulsReason").value.trim();
  if(!Number.isFinite(amount)||amount===0){alert("Informe uma quantidade diferente de zero.");return}
  try{
    await adminApi(`/api/admin/players/${state.selectedPlayer.id}/yuls`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount,reason})});
    await selectAdminPlayer(state.selectedPlayer.id);alert("Movimentação registrada.");
    if(state.me && Number(state.me.id)===Number(state.selectedPlayer.id)){ await refreshDashboardStateOnly(); }
  }catch(ex){alert(ex.message)}
}
async function launchMission(){
  if(!state.selectedPlayer)return;
  const title=qs("#missionTitle").value.trim();
  const mission_type=qs("#missionType").value.trim()||"Missão";
  const mission_rank=qs("#missionRank").value.trim();
  const status=qs("#missionStatus").value;
  const reward_yuls=Number(qs("#missionReward").value||0);
  const completed_at=qs("#missionDate").value;
  const notes=qs("#missionNotes").value.trim();
  if(!title){alert("Informe o nome da missão.");return}
  if(!Number.isFinite(reward_yuls)||reward_yuls<0){alert("Recompensa inválida.");return}
  try{
    await adminApi(`/api/admin/players/${state.selectedPlayer.id}/missions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,mission_type,mission_rank,status,reward_yuls,completed_at,notes})});
    await selectAdminPlayer(state.selectedPlayer.id);
    alert(status==="Concluída"?"Missão registrada e contagem atualizada.":"Missão registrada.");
    if(state.me&&Number(state.me.id)===Number(state.selectedPlayer.id)){await refreshDashboardStateOnly();}
  }catch(ex){alert(ex.message)}
}

async function deleteMission(missionId){
  if(!confirm("Excluir esta missão? Se ela estiver concluída, a contagem e a recompensa serão desfeitas."))return;
  try{await adminApi(`/api/admin/missions/${missionId}`,{method:"DELETE"});await selectAdminPlayer(state.selectedPlayer.id);alert("Missão excluída.");if(state.me&&Number(state.me.id)===Number(state.selectedPlayer.id)){await refreshDashboardStateOnly();}}catch(ex){alert(ex.message)}
}

async function deleteSelectedPlayer(){
  if(!state.selectedPlayer)return;
  if(!confirm(`Excluir ${state.selectedPlayer.nick}${state.selectedPlayer.number}? Esta ação não pode ser desfeita.`))return;
  try{
    await adminApi(`/api/admin/players/${state.selectedPlayer.id}`,{method:"DELETE"});
    state.selectedPlayer=null;await initAdmin();
    qs("#adminEditor").innerHTML=`<div class="empty-editor"><div class="empty-icon">♠</div><p class="eyebrow">JOGADOR EXCLUÍDO</p><h3>Selecione outro jogador</h3><p>O cadastro foi removido do banco.</p></div>`;
  }catch(ex){alert(ex.message)}
}

function openNewPlayer(){
  state.selectedPlayer=null;renderAdminList(state.players,qs("#adminSearch").value);
  qs("#adminEditor").innerHTML=`<div class="editor-head"><div><p class="eyebrow">NOVO CADASTRO</p><h3>Novo jogador</h3><p>Crie o acesso usando Nick + número.</p></div><button class="icon-button" id="closeEditor" type="button">×</button></div>
  <form id="newAdminPlayerForm"><div class="form-grid">
  ${field("Nick","nick","")}${field("Número","number","01")}${field("Senha inicial","password","","password")}${field("Casa","house","")}${selectField("Patente","patent","Cavaleiro Mágico Junior",state.adminHierarchy?.patents||[], "name")}${rolesMultiField([],state.adminHierarchy?.roles||[])}${field("Grimório","grimoire","")}${field("❤️ HP","hp",200,"number")}${field("♦️ Mana","mana",400,"number")}${field("🪙 Yuls","yuls",0,"number")}${field("📋 Missões","missions",0,"number")}${field("🏆 Conquistas","achievements",0,"number")}${field("Ranking manual","ranking",0,"number")}${field("⚔️ Força","power",0,"number")}
  </div><div class="editor-actions"><button class="gold" type="submit">Cadastrar jogador</button></div><div class="error" id="newPlayerError"></div></form>`;
  qs("#closeEditor").addEventListener("click",()=>renderEditor({nick:"",number:"",history:[],missions:[],public_profile:1}));
  qs("#newAdminPlayerForm").addEventListener("submit",async e=>{
    e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());
    b.role_ids=[...e.target.querySelectorAll('input[name="role_ids"]:checked')].map(x=>Number(x.value));
    try{const d=await adminApi("/api/admin/players",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});await initAdmin();await selectAdminPlayer(d.player.id);alert("Jogador cadastrado.");}
    catch(ex){qs("#newPlayerError").textContent=ex.message}
  });
}

qs("#adminSearch").addEventListener("input",e=>renderAdminList(state.players,e.target.value));
qs("#newPlayerBtn").addEventListener("click",openNewPlayer);
qs("#refreshAdminBtn").addEventListener("click",initAdmin);
qs("#newsForm").addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await adminApi("/api/admin/news",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();alert("Notícia publicada.");await loadAdminEditorial();await loadHome();if(state.page==="jornal")loadEditions();}catch(ex){alert(ex.message)}});
qs("#editionForm").addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await adminApi("/api/admin/editions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();alert("Edição publicada.");await loadAdminEditorial();await loadHome();if(state.page==="jornal")loadEditions();}catch(ex){alert(ex.message)}});
qs("#logoutAdminBtn").addEventListener("click",()=>{state.admin=false;state.adminKey=null;state.selectedPlayer=null;go("home")});

qs("#houseForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target).entries());
  try{
    if(b.id){
      await adminApi(`/api/admin/houses/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    }else{
      await adminApi("/api/admin/houses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    }
    resetHouseForm();await loadAdminHouses();await loadHouses();alert("Casa salva com sucesso.");
  }catch(ex){qs("#houseError").textContent=ex.message}
});
qs("#houseCancelBtn").addEventListener("click",resetHouseForm);

qs("#patentForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target).entries());
  try{
    if(b.id) await adminApi(`/api/admin/patents/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    else await adminApi("/api/admin/patents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    resetPatentForm();await loadAdminHierarchy();await loadHierarchy();alert("Patente salva com sucesso.");
  }catch(ex){qs("#patentError").textContent=ex.message}
});
qs("#patentCancelBtn").addEventListener("click",resetPatentForm);

qs("#roleForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target).entries());
  try{
    if(b.id) await adminApi(`/api/admin/roles/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    else await adminApi("/api/admin/roles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    resetRoleForm();await loadAdminHierarchy();await loadHierarchy();alert("Cargo salvo com sucesso.");
  }catch(ex){qs("#roleError").textContent=ex.message}
});
qs("#roleCancelBtn").addEventListener("click",resetRoleForm);

async function loadAdminEditorial(){
  try{
    const [n,e]=await Promise.all([adminApi("/api/admin/news"),adminApi("/api/admin/editions")]);
    state.adminNews=n.news||[];state.adminEditions=e.editions||[];
    renderAdminEditorial();
  }catch(err){console.error(err)}
}

function renderAdminEditorial(){
  const nl=qs("#adminNewsList"),el=qs("#adminEditionList");
  if(nl)nl.innerHTML=(state.adminNews||[]).map(n=>`<div class="editorial-item"><div class="editorial-item-head"><div><b>${escapeHtml(n.title)}</b><small>${escapeHtml(n.category||"RPG")} • ${escapeHtml(String(n.date||""))}${n.published?"":" • Rascunho"}</small></div><div class="editorial-actions"><button type="button" data-news-delete="${n.id}">×</button></div></div></div>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma notícia.</div>`;
  if(el)el.innerHTML=(state.adminEditions||[]).map(x=>`<div class="editorial-item"><div class="editorial-item-head"><div><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.edition||"Edição")} • ${escapeHtml(String(x.date||""))}${x.pdf_url?" • PDF":" • sem PDF"}</small></div><div class="editorial-actions"><button type="button" data-edition-delete="${x.id}">×</button></div></div></div>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma edição.</div>`;
  qsa("[data-news-delete]").forEach(b=>b.onclick=()=>deleteNews(Number(b.dataset.newsDelete)));
  qsa("[data-edition-delete]").forEach(b=>b.onclick=()=>deleteEdition(Number(b.dataset.editionDelete)));
}

async function deleteNews(id){
  if(!confirm("Excluir esta notícia?"))return;
  try{await adminApi(`/api/admin/news/${id}`,{method:"DELETE"});await loadAdminEditorial();await loadHome();if(state.page==="jornal")loadEditions();alert("Notícia excluída.")}catch(e){alert(e.message)}
}
async function deleteEdition(id){
  if(!confirm("Excluir esta edição?"))return;
  try{await adminApi(`/api/admin/editions/${id}`,{method:"DELETE"});await loadAdminEditorial();await loadHome();if(state.page==="jornal")loadEditions();alert("Edição excluída.")}catch(e){alert(e.message)}
}

async function tryAdminHash(){
  if(location.hash!=="#admin")return;
  setTimeout(async()=>{
    const key=prompt("Chave administrativa:");
    if(!key){history.replaceState(null,"",location.pathname+location.search);go("home");return}
    state.adminKey=key;
    try{await adminApi("/api/admin/overview");state.admin=true;go("admin");}
    catch(e){state.adminKey=null;alert("Chave inválida.");go("home")}
  },80);
}

loadHome();tryMe();tryAdminHash();
