function displayPlayerName(player){
  return String(player?.nick||"").trim() || "Jogador";
}

const state={page:"home",me:null,admin:false,adminKey:null,players:[],selectedPlayer:null,selectedPlayers:new Set(),playerImport:{file:null,preview:null},adminFilters:{house:"",patent:"",role:"",visibility:"",sort:"nick"},playerCards:[],adminCards:[],cardFilter:"",cardSearch:"",events:[],adminEvents:[],selectedEventId:null};

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
  if(page==="comunicados") loadAnnouncements();
  if(page==="eventos") loadEvents();
  if(page==="jogadores") loadPlayers();
  if(page==="casas") loadHouses();
  if(page==="ranking") loadRanking();
  if(page==="hierarquia") loadHierarchy();
  if(page==="dashboard"){ if(state.me) renderDashboard(); else refreshDashboard(); }
  if(page==="cards"){ if(state.me) loadPlayerCards(); else { state.page="login"; return go("login"); } }
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
    const d=await api("/api/home");state.data=d;renderHomeAnnouncements(d.announcements||[]);
    qs("#newsGrid").innerHTML=d.news.length?d.news.map((n,i)=>`<article class="news-card ${i===0?"featured":""}"><div class="art ${n.image_url?"has-image":""}" ${n.image_url?`style="background-image:url('${escapeHtml(n.image_url)}')"`:""}>${n.image_url?"":(i===0?"♠":"◆")}</div><div><span class="tag">${escapeHtml(n.category)}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.excerpt)}</p></div></article>`).join(""):`<div class="panel"><h3>Nenhuma notícia publicada</h3><p>Use o painel administrativo para publicar a primeira.</p></div>`;
    const e=d.editions[0];qs("#editionTitle").textContent=e?e.title:"Nenhuma edição publicada";qs("#editionDesc").textContent=e?e.description:"Adicione uma edição pelo painel administrativo.";
  }catch(e){qs("#newsGrid").innerHTML=`<div class="panel"><h3>Erro ao carregar</h3><p>${escapeHtml(e.message)}</p></div>`}
}

async function loadAnnouncements(){
  try{
    const d=await api("/api/announcements");
    state.announcements=d.announcements||[];
    renderAnnouncements(state.announcements);
  }catch(e){
    const f=qs("#announcementFeature"),l=qs("#announcementList");
    if(f)f.innerHTML=`<div class="announcement-feature"><h2>Erro ao carregar comunicados</h2><p>${escapeHtml(e.message)}</p></div>`;
    if(l)l.innerHTML="";
  }
}

function announcementClass(priority){
  return priority==="URGENTE"?"urgent":priority==="IMPORTANTE"?"important":"info";
}

function renderAnnouncements(items){
  const f=qs("#announcementFeature"),l=qs("#announcementList");
  const featured=(items||[]).find(x=>x.featured)||items?.[0];

  if(f){
    f.innerHTML=featured
      ? `<div class="announcement-feature">
          <div class="announcement-meta">
            <span class="announcement-priority ${announcementClass(featured.priority)}">${escapeHtml(featured.priority)}</span>
            <span class="announcement-date">${escapeHtml(String(featured.date||""))}</span>
          </div>
          <h2>${escapeHtml(featured.title)}</h2>
          <p>${escapeHtml(featured.body||"")}</p>
          <small style="color:#777">${escapeHtml(featured.category||"INFORMATIVO")}</small>
        </div>`
      : "";
  }

  if(l){
    const rest=(items||[]).filter(x=>!featured||x.id!==featured.id);
    l.innerHTML=rest.length
      ? rest.map(a=>`<article class="announcement-card ${a.featured?"featured":""}">
          <div class="announcement-head">
            <div>
              <div class="announcement-meta">
                <span class="announcement-priority ${announcementClass(a.priority)}">${escapeHtml(a.priority)}</span>
                <span class="announcement-date">${escapeHtml(String(a.date||""))}</span>
              </div>
              <h3>${escapeHtml(a.title)}</h3>
            </div>
            <span class="tag">${escapeHtml(a.category||"INFORMATIVO")}</span>
          </div>
          <p class="announcement-body">${escapeHtml(a.body||"")}</p>
        </article>`).join("")
      : `<div class="panel"><p>Nenhum outro comunicado publicado.</p></div>`;
  }
}

function renderHomeAnnouncements(items){
  const el=qs("#homeAnnouncements");if(!el)return;
  const arr=(items||[]).slice(0,3);
  el.innerHTML=arr.length
    ? `<div class="home-announcements-wrap">
        <div class="section-head">
          <div><p class="eyebrow">MURAL OFICIAL</p><h2>Comunicados</h2></div>
          <button class="outline dark-outline" data-page="comunicados">Ver todos</button>
        </div>
        <div class="home-announcement-grid">${arr.map(a=>`<article class="home-announcement">
          <div class="announcement-meta">
            <span class="announcement-priority ${announcementClass(a.priority)}">${escapeHtml(a.priority)}</span>
            <span class="announcement-date">${escapeHtml(String(a.date||""))}</span>
          </div>
          <h3>${escapeHtml(a.title)}</h3>
          <p>${escapeHtml((a.body||"").slice(0,170))}${(a.body||"").length>170?"…":""}</p>
        </article>`).join("")}</div>
      </div>`
    : "";
}
function eventTypeLabel(t){return {JOGO:"Evento de Jogo",ESPECIAL:"Evento Especial",TEMPORADA:"Evento de Temporada",LEGIAO:"Evento de Legião"}[t]||t}
function eventStatusClass(s){return s==="ATIVO"?"active":s==="PLANEJADO"?"plan":s==="ENCERRADO"?"closed":""}
function eventStatusLabel(s){return {ATIVO:"ATIVO",PLANEJADO:"PRÓXIMO",ENCERRADO:"ENCERRADO",CANCELADO:"CANCELADO"}[s]||s}

async function loadEvents(){
  try{
    const d=await api("/api/events");state.events=d.events||[];renderEvents(state.events);
  }catch(e){
    const g=qs("#eventGrid");if(g)g.innerHTML=`<div class="panel"><p>${escapeHtml(e.message)}</p></div>`;
  }
}
function renderEvents(items){
  const feature=qs("#eventFeature"),grid=qs("#eventGrid");if(!grid)return;
  const term=String(qs("#eventSearch")?.value||"").toLowerCase().trim();
  const type=qs("#eventTypeFilter")?.value||"",status=qs("#eventStatusFilter")?.value||"";
  const filtered=(items||[]).filter(e=>{
    if(type&&e.event_type!==type)return false;
    if(status&&e.status!==status)return false;
    return !term||`${e.title} ${e.description} ${e.event_type}`.toLowerCase().includes(term);
  });
  const featured=(items||[]).find(e=>e.featured)||items?.find(e=>e.status==="ATIVO");
  if(feature){
    feature.innerHTML=featured?`<div class="event-feature">
      <div class="event-card-meta"><span class="event-type-pill">${escapeHtml(eventTypeLabel(featured.event_type))}</span><span class="event-status-pill ${eventStatusClass(featured.status)}">${escapeHtml(eventStatusLabel(featured.status))}</span></div>
      <h2>${escapeHtml(featured.title)}</h2><p>${escapeHtml(featured.description||"")}</p>
      <button class="gold small" type="button" data-event-open="${featured.id}">Ver evento</button>
    </div>`:"";
    qs("[data-event-open]")?.addEventListener("click",()=>openPublicEvent(Number(featured.id)));
  }
  grid.innerHTML=filtered.length?filtered.map(e=>`<article class="event-card" data-public-event="${e.id}">
    <div class="event-card-cover" ${e.image_url?`style="background-image:url('${escapeHtml(e.image_url)}')"`:""}>${e.image_url?"":"♠"}</div>
    <div class="event-card-body"><div class="event-card-meta"><span class="event-type-pill">${escapeHtml(eventTypeLabel(e.event_type))}</span><span class="event-status-pill ${eventStatusClass(e.status)}">${escapeHtml(eventStatusLabel(e.status))}</span></div>
    <h3>${escapeHtml(e.title)}</h3><p>${escapeHtml((e.description||"").slice(0,150))}${(e.description||"").length>150?"…":""}</p></div>
  </article>`).join(""):`<div class="panel"><p>Nenhum evento encontrado.</p></div>`;
  qsa("[data-public-event]").forEach(b=>b.onclick=()=>openPublicEvent(Number(b.dataset.publicEvent)));
}
async function openPublicEvent(id){
  let wrap=qs("#eventReader");if(!wrap){wrap=document.createElement("div");wrap.id="eventReader";wrap.className="event-public-modal";document.body.appendChild(wrap);}
  wrap.style.display="block";wrap.innerHTML=`<div class="event-public-detail"><div class="event-public-head"><h2>Carregando...</h2></div></div>`;
  try{
    const d=await api(`/api/events/${id}`),e=d.event;
    const actions=(d.actions||[]).map(a=>`<div class="event-action-public"><div><b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.description||"")}</small></div><span>${a.points} pts</span></div>`).join("")||`<p style="font-size:10px;color:#888">Nenhuma ação cadastrada.</p>`;
    const rewards=(d.card_rewards||[]).map(r=>`<div class="event-reward-public"><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.category)}${e.event_type==="TEMPORADA"?` • ${r.points_cost} pontos`:""}${r.description?` • ${escapeHtml(r.description)}`:""}</small></div>${e.event_type==="TEMPORADA"?`<button type="button" data-public-redeem="${r.card_id}">Resgatar</button>`:""}</div>`).join("")||`<p style="font-size:10px;color:#888">Nenhum card disponível como recompensa.</p>`;
    wrap.innerHTML=`<div class="event-public-detail">
      <button class="journal-close" id="closeEventReader">×</button>
      <div class="event-public-head"><div class="event-card-meta"><span class="event-type-pill">${escapeHtml(eventTypeLabel(e.event_type))}</span><span class="event-status-pill ${eventStatusClass(e.status)}">${escapeHtml(eventStatusLabel(e.status))}</span></div>
      <h2>${escapeHtml(e.title)}</h2><p>${escapeHtml(e.description||"")}</p>${e.rules?`<div style="margin-top:12px;font-size:10px;color:#666;white-space:pre-line"><b>Regras:</b><br>${escapeHtml(e.rules)}</div>`:""}</div>
      <div class="event-public-section"><h3>Como ganhar</h3><div class="event-action-list">${actions}</div></div>
      <div class="event-public-section"><h3>Cards disponíveis</h3><div class="event-reward-list">${rewards}</div></div>
    </div>`;
    qs("#closeEventReader").onclick=()=>wrap.style.display="none";
    wrap.onclick=e2=>{if(e2.target===wrap)wrap.style.display="none"};
    qsa("[data-public-redeem]",wrap).forEach(b=>b.onclick=()=>redeemPublicEventCard(id,Number(b.dataset.publicRedeem)));
  }catch(e){wrap.innerHTML=`<div class="event-public-detail"><div class="event-public-head"><button class="journal-close" id="closeEventReader">×</button><h2>Erro</h2><p>${escapeHtml(e.message)}</p></div></div>`;qs("#closeEventReader").onclick=()=>wrap.style.display="none"}
}
async function redeemPublicEventCard(eventId,cardId){
  if(!state.me){alert("Entre no Portal para resgatar um card.");go("login");return}
  try{
    const r=await api(`/api/me/events/${eventId}/redeem`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({card_id:cardId})});
    alert(`Card "${r.card.name}" resgatado com sucesso. Pontos restantes: ${r.points_remaining}.`);
    await loadPlayerCards();
    await openPublicEvent(eventId);
  }catch(e){alert(e.message)}
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
  const feature=qs("#journalFeature"),editionEl=qs("#editions"),newsEl=qs("#journalNews");
  const latest=editions?.[0];

  if(feature){
    feature.innerHTML=latest
      ? `<div class="journal-feature-cover ${latest.cover_url?"":"fallback"}" ${latest.cover_url?`style="background-image:url('${escapeHtml(latest.cover_url)}')"`:""}>${latest.cover_url?"":`<div class="cover-fallback"><span style="font-size:65px">♠</span><b>SPADE</b><small>${escapeHtml(latest.edition||"EDIÇÃO")}</small></div>`}</div>
         <div class="journal-feature-info">
           <div class="journal-feature-meta">${escapeHtml(latest.edition||"EDIÇÃO")} • ${escapeHtml(String(latest.date||""))}</div>
           <h2>${escapeHtml(latest.title)}</h2>
           <p>${escapeHtml(latest.description||"")}</p>
           <div class="actions">${latest.pdf_url?`<a class="gold" href="${escapeHtml(latest.pdf_url)}" target="_blank" rel="noopener">📄 PDF</a>`:""}<button class="gold" data-open-edition="${latest.id}">📖 Ler edição</button><button class="outline" data-journal-scroll>Ver arquivo</button></div>
         </div>`
      : `<div class="panel"><h3>O jornal ainda não possui uma edição.</h3><p>As próximas edições serão publicadas pela administração.</p></div>`;
    const scroll=feature.querySelector("[data-journal-scroll]");
    if(scroll)scroll.onclick=()=>editionEl?.scrollIntoView({behavior:"smooth",block:"start"});
    const open=feature.querySelector("[data-open-edition]");
    if(open)open.onclick=()=>openPublicEdition(Number(open.dataset.openEdition));
  }

  if(editionEl){
    editionEl.innerHTML=editions?.length
      ? editions.map(e=>`<article class="edition">
          <div class="edition-cover ${e.cover_url?"has-image":""}" ${e.cover_url?`style="background-image:url('${escapeHtml(e.cover_url)}')"`:""}>
            ${e.cover_url?"":`<span>♠</span><small>${escapeHtml(e.edition||"EDIÇÃO")}</small><b>SPADE</b><em>${escapeHtml(String(e.date||""))}</em>`}
          </div>
          <h3>${escapeHtml(e.title)}</h3>
          <p>${escapeHtml(e.description||"")}</p>
          <small class="edition-card-meta">${Number(e.article_count||0)} matéria(s)</small>
          <div class="actions"><button class="gold small journal-edition-open" type="button" data-open-edition="${e.id}">📖 Ler edição</button>${e.pdf_url?`<a class="outline small" href="${escapeHtml(e.pdf_url)}" target="_blank" rel="noopener">📄 PDF</a>`:""}</div>
        </article>`).join("")
      : `<div class="panel"><h3>Nenhuma edição publicada.</h3></div>`;
    qsa("[data-open-edition]").forEach(b=>b.onclick=()=>openPublicEdition(Number(b.dataset.openEdition)));
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

async function openPublicEdition(id){
  state.lastPublicEditionId=id;
  let wrap=qs("#journalEditionReader");
  if(!wrap){
    wrap=document.createElement("div");
    wrap.id="journalEditionReader";
    wrap.className="journal-public-article-wrap";
    document.body.appendChild(wrap);
  }
  wrap.innerHTML=`<div class="journal-public-article"><button class="journal-close" id="closeEditionReader">×</button><div class="journal-public-content"><p>Carregando edição...</p></div></div>`;
  wrap.style.display="block";
  try{
    const d=await api(`/api/journal/editions/${id}`);
    const cover=d.edition.cover_url?`style="background-image:url('${escapeHtml(d.edition.cover_url)}')"`:"";
    const articles=(d.articles||[]).map(a=>`<button class="edition-article-link" type="button" data-open-article="${a.id}"><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.author||"Redação")} • ${escapeHtml(a.category||"RPG")}</small></button>`).join("")
      ||`<p style="color:#888;font-size:10px">Esta edição ainda não possui matérias.</p>`;
    wrap.innerHTML=`<div class="journal-public-article">
      <button class="journal-close" id="closeEditionReader">×</button>
      <div class="journal-public-cover ${d.edition.cover_url?"":"no-image"}" ${cover}>${d.edition.cover_url?"":"♠"}</div>
      <div class="journal-public-content">
        <span class="tag">${escapeHtml(d.edition.edition||"EDIÇÃO")} • ${escapeHtml(String(d.edition.date||""))}</span>
        <h2>${escapeHtml(d.edition.title)}</h2>
        <div class="article-subtitle">${escapeHtml(d.edition.description||"")}</div>
        <div class="edition-article-list">${articles}</div>
        ${d.edition.pdf_url?`<div class="actions" style="margin-top:18px"><a class="gold small" href="${escapeHtml(d.edition.pdf_url)}" target="_blank" rel="noopener">📄 Abrir PDF</a></div>`:""}
      </div>
    </div>`;
    qs("#closeEditionReader").onclick=()=>{wrap.style.display="none"};
    wrap.onclick=e=>{if(e.target===wrap)wrap.style.display="none"};
    qsa("[data-open-article]",wrap).forEach(b=>b.onclick=()=>openPublicArticle(Number(b.dataset.openArticle),d.articles));
  }catch(e){
    wrap.innerHTML=`<div class="journal-public-article"><button class="journal-close" id="closeEditionReader">×</button><div class="journal-public-content"><h2>Erro ao carregar</h2><p>${escapeHtml(e.message)}</p></div></div>`;
    qs("#closeEditionReader").onclick=()=>wrap.style.display="none";
  }
}
function openPublicArticle(id,articles){
  const a=(articles||[]).find(x=>Number(x.id)===id);
  if(!a)return;
  const wrap=qs("#journalEditionReader");if(!wrap)return;
  const cover=a.image_url?`style="background-image:url('${escapeHtml(a.image_url)}')"`:"";
  wrap.innerHTML=`<div class="journal-public-article">
    <button class="journal-close" id="closeArticleReader">×</button>
    <div class="journal-public-cover ${a.image_url?"":"no-image"}" ${cover}>${a.image_url?"":"♠"}</div>
    <div class="journal-public-content">
      <span class="tag">${escapeHtml(a.category||"RPG")} • ${escapeHtml(String(a.date||""))}</span>
      <h2>${escapeHtml(a.title)}</h2>
      ${a.subtitle?`<div class="article-subtitle">${escapeHtml(a.subtitle)}</div>`:""}
      <div class="article-meta">Por ${escapeHtml(a.author||"Redação")}</div>
      <div class="article-body">${escapeHtml(a.body||a.excerpt||"")}</div>
    </div>
  </div>`;
  qs("#closeArticleReader").onclick=()=>openPublicEdition(state.lastPublicEditionId||0);
}
async function loadPlayers(){
  const d=await api("/api/players");state.players=d.players;renderPlayers("");
  qs("#playerSearch").oninput=e=>renderPlayers(e.target.value);
}
function renderPlayers(term){
  const t=term.trim().toLowerCase();const p=(state.players||[]).filter(x=>`${x.nick} ${x.identifier} ${x.house}`.toLowerCase().includes(t));
  qs("#playerGrid").innerHTML=p.map(x=>`<article class="player-card"><h3>${escapeHtml(displayPlayerName(x))}</h3><p><b>Casa:</b> ${escapeHtml(x.house||"—")}<br><b>Patente:</b> ${escapeHtml(x.patent)}</p><div class="public-role-chips">${(x.roles||[]).map(r=>`<span class="public-role-chip">${escapeHtml(r.name)}${r.rank_code?` • Rank ${escapeHtml(r.rank_code)}`:""}</span>`).join("")||`<span class="tag">Nenhum cargo</span>`}</div><p><b>Missões:</b> ${x.missions}<br><b>Yuls:</b> 🪙 ${money(x.yuls)}</p><button class="gold small public-profile-button" type="button" data-public-player="${x.id}">Ver ficha</button></article>`).join("")||`<div class="panel"><h3>Nenhum jogador encontrado.</h3></div>`;
  qsa("[data-public-player]").forEach(b=>b.onclick=()=>openPublicPlayer(Number(b.dataset.publicPlayer)));
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
        ${h.members.length?h.members.map(p=>`<div class="house-member-row"><div class="member-main"><b>${escapeHtml(displayPlayerName(p))}</b><small>${escapeHtml(p.patent||"")} ${p.role?`• ${escapeHtml(p.role)}`:""}</small></div><div class="member-values"><span>📋 ${p.missions} missões</span><span>🪙 ${money(p.yuls)} Yuls ${p.ranking>0?`• #${p.ranking}`:""}</span></div></div>`).join(""):`<div style="color:#888;font-size:11px;padding:10px 0">Nenhum membro público cadastrado.</div>`}
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

  const ranks=d.ranks||[],roles=d.roles||[],rankNames={"I":"ADMINISTRAÇÃO","II":"GESTÃO","III":"COORDENAÇÃO","IV":"ESPECIALIZAÇÃO","V":"OPERACIONAL"};
  if(qs("#rankSummary"))qs("#rankSummary").innerHTML=ranks.map(x=>`<button type="button" class="rank-summary-card" data-rank-scroll="${x.code}"><b>RANK ${escapeHtml(x.code)}</b><span>${escapeHtml(rankNames[x.code]||x.name)} • ${roles.filter(r=>r.rank_code===x.code).length} cargo(s)</span></button>`).join("");
  if(qs("#publicRanks"))qs("#publicRanks").innerHTML=ranks.map(x=>`<section class="public-rank-card" id="rank-${escapeHtml(x.code)}"><div class="public-rank-code">${escapeHtml(x.code)}</div><h2>${escapeHtml(x.name)}</h2><p>${escapeHtml(x.description||"")}</p><div class="public-rank-req"><b>Requisitos do Rank:</b><br>${escapeHtml(x.requirements||"")}</div></section>`).join("");
  qsa("[data-rank-scroll]").forEach(b=>b.onclick=()=>qs("#rank-"+b.dataset.rankScroll)?.scrollIntoView({behavior:"smooth",block:"start"}));

  if(r){
    r.innerHTML=roles.length?roles.map(x=>`<article class="public-role-card" data-public-role="${x.id}"><div class="role-meta"><span class="role-pill">RANK ${escapeHtml(x.rank_code||"—")}</span>${x.vacancies?`<span class="role-pill">${escapeHtml(x.vacancies)}</span>`:""}${x.scope?`<span class="role-pill">${escapeHtml(x.scope)}</span>`:""}</div><h4>${escapeHtml(x.name)}</h4><small>${escapeHtml(x.description||"")}</small></article>`).join(""):`<div class="hierarchy-item"><p>Nenhum cargo cadastrado.</p></div>`;
    qsa("[data-public-role]").forEach(b=>b.onclick=()=>openPublicRole(Number(b.dataset.publicRole)));
  }
}

async function openPublicRole(id){
  let wrap=qs("#roleDetailReader");
  if(!wrap){wrap=document.createElement("div");wrap.id="roleDetailReader";wrap.className="role-detail-modal";document.body.appendChild(wrap)}
  wrap.style.display="block";wrap.innerHTML=`<div class="role-detail"><div class="role-detail-head"><button class="journal-close" id="closeRoleDetail">×</button><h2>Carregando...</h2></div></div>`;
  try{
    const d=await api(`/api/roles/${id}`),r=d.role;
    wrap.innerHTML=`<div class="role-detail"><div class="role-detail-head"><button class="journal-close" id="closeRoleDetail">×</button><div class="role-meta"><span class="role-pill">RANK ${escapeHtml(r.rank_code)}</span>${r.vacancies?`<span class="role-pill">${escapeHtml(r.vacancies)}</span>`:""}${r.scope?`<span class="role-pill">${escapeHtml(r.scope)}</span>`:""}</div><h2>${escapeHtml(r.name)}</h2><p>${escapeHtml(r.description||"")}</p></div><div class="role-detail-body">
      <div class="role-detail-block"><h4>Detalhamento / responsabilidades</h4><p>${escapeHtml(r.description||"Não informado.")}</p></div>
      <div class="role-detail-block"><h4>Vagas</h4><p>${escapeHtml(r.vacancies||"Não informadas.")}</p></div>
      <div class="role-detail-block"><h4>Remuneração</h4><p>${escapeHtml(r.payment_mode||"")}${r.payment_mode&&r.remuneration_detail?"\n":""}${escapeHtml(r.remuneration_detail||"Não informada.")}</p></div>
      <div class="role-detail-block"><h4>Requisitos / condições</h4><p>${escapeHtml(r.requirements||"Não informados.")}</p></div>
      <div class="role-detail-block"><h4>Requisitos do Rank</h4><p>${escapeHtml(r.rank_requirements||"Não informados.")}</p></div>
      <div class="role-detail-block"><h4>Benefícios / bônus</h4><p>${escapeHtml(r.benefits||"Não informado.")}</p></div>
    </div></div>`;
    qs("#closeRoleDetail").onclick=()=>wrap.style.display="none";wrap.onclick=e=>{if(e.target===wrap)wrap.style.display="none"};
  }catch(e){wrap.innerHTML=`<div class="role-detail"><div class="role-detail-head"><button class="journal-close" id="closeRoleDetail">×</button><h2>Erro</h2><p>${escapeHtml(e.message)}</p></div></div>`;qs("#closeRoleDetail").onclick=()=>wrap.style.display="none"}
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
  if(roleList)roleList.innerHTML=(d.roles||[]).map(x=>`<div class="hier-list-item"><div><b>👑 ${escapeHtml(x.name)}</b><small>Rank ${escapeHtml(x.rank_code||"—")} • ${escapeHtml(x.vacancies||"Vagas não informadas")} • ${escapeHtml(x.payment_mode||"")}${x.description?` • ${escapeHtml(x.description)}`:""}</small></div><div class="hier-actions"><button type="button" data-role-edit="${x.id}">✎</button><button type="button" class="delete" data-role-delete="${x.id}">×</button></div></div>`).join("")||`<div style="font-size:10px;color:#888">Nenhum cargo cadastrado.</div>`;

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
  f.reset();qs("#roleId").value="";qs("#roleRank").value="V";qs("#roleSalary").value="0";qs("#roleOrder").value="0";qs("#roleActive").checked=true;
  qs("#roleSaveBtn").textContent="Criar cargo";qs("#roleError").textContent="";
}
function editPatent(id){
  const x=(state.adminHierarchy?.patents||[]).find(a=>Number(a.id)===id);if(!x)return;
  qs("#patentId").value=x.id;qs("#patentName").value=x.name;qs("#patentOrder").value=x.sort_order;qs("#patentDescription").value=x.description||"";
  qs("#patentSaveBtn").textContent="Salvar patente";qs("#patentError").textContent="";qs("#patentName").focus();
}
function editRole(id){
  const x=(state.adminHierarchy?.roles||[]).find(a=>Number(a.id)===id);if(!x)return;
  qs("#roleId").value=x.id;qs("#roleName").value=x.name;qs("#roleRank").value=x.rank_code||"V";qs("#roleVacancies").value=x.vacancies||"";qs("#rolePaymentMode").value=x.payment_mode||"";qs("#roleSalary").value=x.salary;qs("#roleOrder").value=x.sort_order;qs("#roleDescription").value=x.description||"";qs("#roleRemuneration").value=x.remuneration_detail||"";qs("#roleRequirements").value=x.requirements||"";qs("#roleBenefits").value=x.benefits||"";qs("#roleScope").value=x.scope||"";qs("#roleActive").checked=Number(x.active??1)===1;
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

async function openPublicPlayer(id){
  const wrap=qs("#publicPlayerDetail");
  if(!wrap)return;
  wrap.classList.add("open");
  wrap.innerHTML=`<div class="public-player-detail"><p>Carregando ficha...</p></div>`;
  try{
    const d=await api(`/api/players/${id}`);
    const p=d.player;
    const roles=(p.roles||[]).map(r=>`<span class="public-role-chip">${escapeHtml(r.name)}</span>`).join("")||`<span class="tag">Nenhum cargo</span>`;
    const missions=(d.mission_summary?.recent||[]).map(m=>`<div class="public-player-mission"><div><b>${escapeHtml(m.title)}</b><small>${escapeHtml(m.status)}${m.mission_rank?` • ${escapeHtml(m.mission_rank)}`:""} • ${escapeHtml(String(m.completed_at||""))}</small></div><span>${m.reward_yuls>0?`🪙 +${money(m.reward_yuls)}`:""}</span></div>`).join("")||`<p style="color:#888;font-size:10px">Nenhuma missão recente.</p>`;
    wrap.innerHTML=`<div class="public-player-detail">
      <div class="public-player-detail-head"><div><p class="eyebrow">FICHA PÚBLICA</p><h2>${escapeHtml(displayPlayerName(p))}</h2><p>Perfil público do Reino Spade</p></div><button class="public-player-close" type="button" id="closePublicPlayer">×</button></div>
      <div class="public-sheet-grid">
        <div class="public-sheet-card"><span>🏰 Casa</span><b>${escapeHtml(p.house||"Não definida")}</b></div>
        <div class="public-sheet-card"><span>🎖️ Patente</span><b>${escapeHtml(p.patent||"Não definida")}</b></div>
        <div class="public-sheet-card"><span>📜 Grimório</span><b>${escapeHtml(p.grimoire||"Não definido")}</b></div>
        <div class="public-sheet-card public-sheet-wide"><span>👑 Cargos</span><div class="public-role-chips" style="margin-top:7px">${roles}</div></div>
        <div class="public-sheet-card"><span>⚔️ Força</span><b>${p.power}</b></div>
        <div class="public-sheet-card"><span>📋 Missões</span><b>${p.missions}</b></div>
        <div class="public-sheet-card"><span>🏆 Conquistas</span><b>${p.achievements}</b></div>
        <div class="public-sheet-card"><span>🪙 Yuls</span><b>${money(p.yuls)}</b></div>
        <div class="public-sheet-card"><span>🏆 Ranking</span><b>${p.ranking>0?"#"+p.ranking:"—"}</b></div>
      </div>
      <div class="public-player-missions"><h3>Atividade recente</h3>${missions}</div>
    </div>`;
    qs("#closePublicPlayer").onclick=()=>wrap.classList.remove("open");
    wrap.onclick=e=>{if(e.target===wrap)wrap.classList.remove("open")};
  }catch(e){
    wrap.innerHTML=`<div class="public-player-detail"><button class="public-player-close" type="button" id="closePublicPlayer">×</button><p style="margin-top:35px">${escapeHtml(e.message)}</p></div>`;
    qs("#closePublicPlayer").onclick=()=>wrap.classList.remove("open");
  }
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
      <td><div class="rank-main">${escapeHtml(displayPlayerName(p))}<small>${escapeHtml(p.identifier)}</small></div></td>
      <td class="rank-house">${escapeHtml(p.house||"Sem Casa")}</td>
      <td class="rank-secondary">${main}</td>
      <td class="rank-secondary">${secondary}</td>
    </tr>`;
  }).join(""):`<tr><td colspan="5">Nenhum jogador disponível.</td></tr>`;
}


function playerAlertStorageKey(id){
  return `spade-alert-${state.me?.identifier||"player"}-${id}`;
}

function playerAlertDismissed(id){
  try{return localStorage.getItem(playerAlertStorageKey(id))==="1"}catch{return false}
}

function dismissPlayerAlert(id){
  try{localStorage.setItem(playerAlertStorageKey(id),"1")}catch{}
  const el=qs(`[data-player-alert="${id}"]`);
  if(el)el.remove();
}

async function loadPlayerAlerts(){
  const wrap=qs("#playerAlerts");
  if(!wrap)return;
  try{
    const d=await api("/api/me/alerts");
    const alerts=(d.alerts||[]).filter(a=>!playerAlertDismissed(a.id));
    wrap.innerHTML=alerts.length
      ? alerts.map(a=>{
          const urgent=a.priority==="URGENTE";
          return `<div class="player-alert ${urgent?"urgent":"important"}" data-player-alert="${a.id}">
            <div class="player-alert-main">
              <span class="player-alert-badge">${urgent?"🔴":"🟡"} ${escapeHtml(a.priority)}</span>
              <h3>${escapeHtml(a.title)}</h3>
              <p>${escapeHtml(a.body||"")}</p>
              <div class="player-alert-date">${escapeHtml(a.category||"")} • ${escapeHtml(String(a.date||""))}</div>
              <a class="player-alert-link" href="#comunicados">Ver mural de comunicados →</a>
            </div>
            <button class="player-alert-close" type="button" data-close-player-alert="${a.id}" aria-label="Fechar aviso">×</button>
          </div>`;
        }).join("")
      : "";
    qsa("[data-close-player-alert]").forEach(b=>{
      b.onclick=()=>dismissPlayerAlert(Number(b.dataset.closePlayerAlert));
    });
  }catch(e){
    wrap.innerHTML="";
  }
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

function cardCategoryList(cards){
  return [...new Set((cards||[]).map(c=>c.category).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"pt-BR"));
}
function renderPlayerCardFilters(cards){
  const el=qs("#playerCardCategoryFilter");if(!el)return;
  const categories=cardCategoryList(cards);
  el.innerHTML=`<option value="">Todas as categorias</option>`+
    categories.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  el.value=state.cardFilter||"";
}
function acquisitionLabel(c){
  const labels={MISSAO:"Missão",EVENTO:"Evento",LOJA:"Loja",PATENTE:"Patente",OUTRO:"Outra origem"};
  const label=labels[c.acquisition_type]||"Outra origem";
  return c.acquisition_name?`${label}: ${c.acquisition_name}`:label;
}
function renderPlayerCards(cards){
  const grid=qs("#playerCardsGrid"),summary=qs("#playerCardsSummary");
  if(!grid)return;
  const filtered=(cards||[]).filter(c=>{
    if(state.cardFilter && c.category!==state.cardFilter)return false;
    const term=String(state.cardSearch||"").trim().toLowerCase();
    return !term || `${c.name} ${c.category} ${c.description||""} ${c.acquisition_name||""}`.toLowerCase().includes(term);
  });
  if(summary)summary.textContent=`${filtered.length} cards no inventário`;
  if(!filtered.length){
    grid.innerHTML=`<div class="cards-empty"><div style="font:28px Georgia;color:#c6a45d">♠</div><b>${(cards||[]).length?"Nenhum card corresponde ao filtro.":"Seu inventário ainda está vazio."}</b><p>${(cards||[]).length?"Tente outra categoria ou pesquisa.":"Os cards serão adicionados pela administração do RPG."}</p></div>`;
    return;
  }
  const groups={};
  filtered.forEach(c=>(groups[c.category]??=[]).push(c));
  grid.innerHTML=Object.entries(groups).map(([category,items])=>`
    <section class="player-card-group">
      <div class="player-card-group-head"><h2>${escapeHtml(category)}</h2><span>${items.length} card(s)</span></div>
      <div class="player-card-grid">
        ${items.map(c=>`<article class="card-inventory-item">
          <div class="card-inventory-top"><span class="card-type-pill">${escapeHtml(c.category)}</span></div>
          <h3>${escapeHtml(c.name)}</h3>
          <p>${escapeHtml(c.description||"Descrição não cadastrada.")}</p>
          ${c.cost?`<div class="card-cost">Custo: ${escapeHtml(c.cost)}</div>`:""}
          <div class="card-acquisition">Obtido por: ${escapeHtml(acquisitionLabel(c))}</div>
        </article>`).join("")}
      </div>
    </section>`).join("");
}
async function loadPlayerCards(){
  try{
    const d=await api("/api/me/cards");
    state.playerCards=d.cards||[];
    renderPlayerCardFilters(state.playerCards);
    renderPlayerCards(state.playerCards);
  }catch(e){
    const grid=qs("#playerCardsGrid");
    if(grid)grid.innerHTML=`<div class="cards-empty">${escapeHtml(e.message)}</div>`;
  }
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
 qs("#dash").innerHTML=`<div class="dash-grid"><div class="dash-main"><div class="dash-ident"><div class="avatar">♠</div><div><h2>${escapeHtml(displayPlayerName(state.me))}</h2><p>${escapeHtml(state.me.patent)} • ${escapeHtml(state.me.house||"Casa não definida")}</p></div></div><div class="profile-lines"><div><small>Cargos</small><b>${state.me.roles?.length?state.me.roles.map(r=>escapeHtml(r.name)).join(" • "):"Não definido"}</b></div><div><small>Grimório</small><b>${escapeHtml(state.me.grimoire||"Não definido")}</b></div></div><div class="profile-lines"><div><small>Casa</small><b>${escapeHtml(state.me.house||"Não definida")}</b></div><div><small>Ranking</small><b>${state.me.ranking||"—"}</b></div></div></div><div class="dash-status"><p class="eyebrow">STATUS</p><div class="stats"><div class="stat"><small>❤️ HP</small><b>${state.me.hp}</b></div><div class="stat"><small>♦️ Mana</small><b>${state.me.mana}</b></div><div class="stat"><small>📋 Missões</small><b>${state.me.missions}</b></div><div class="stat yuls"><small>🪙 Yuls</small><b>${money(state.me.yuls)}</b></div></div></div></div><div class="panel" style="margin-top:12px"><p class="eyebrow">CONQUISTAS</p><h3>${state.me.achievements} conquistas registradas</h3><p>Os dados serão atualizados pela administração do RPG.</p></div>`;
 loadPlayerYuls();
 loadPlayerMissions();
 loadPlayerAlerts();
}

async function tryMe(){
  try{
    const d=await api("/api/me");state.me=d.player;setPlayerNav();
  }catch{}
}
function setPlayerNav(){const b=qs("#loginNav");b.textContent="Meu painel";b.dataset.page="dashboard";b.onclick=()=>go("dashboard");const c=qs("#cardsNav");if(c)c.style.display="inline-flex";}
function setLoginNav(){const b=qs("#loginNav");b.textContent="Entrar";b.dataset.page="login";b.onclick=()=>go("login");const c=qs("#cardsNav");if(c)c.style.display="none";}

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

qs("#playerCardSearch")?.addEventListener("input",e=>{state.cardSearch=e.target.value;renderPlayerCards(state.playerCards)});
qs("#playerCardCategoryFilter")?.addEventListener("change",e=>{state.cardFilter=e.target.value;renderPlayerCards(state.playerCards)});
qs("#backToDashboard")?.addEventListener("click",()=>go("dashboard"));

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

function openPlayerImport(){
  const modal=qs("#playerImportModal");if(!modal)return;
  modal.style.display="block";
  state.playerImport={file:null,preview:null};
  qs("#playerImportFile").value="";qs("#playerImportFileName").textContent="Nenhum arquivo selecionado";
  qs("#playerImportPreview").innerHTML="<p>Escolha um arquivo para começar.</p>";
  qs("#playerImportConfirm").disabled=true;qs("#playerImportStatus").textContent="";
}
function closePlayerImport(){const m=qs("#playerImportModal");if(m)m.style.display="none"}
function renderImportPreview(data){
  const box=qs("#playerImportPreview");if(!box)return;
  const rows=data.rows||[];
  const valid=Number(data.valid||0),invalid=Number(data.invalid||0);
  const summary=`<div class="player-import-summary"><span>${data.total} jogadores</span><span class="ok">✅ ${valid} prontos</span><span class="bad">⚠️ ${invalid} com erros</span></div>`;
  const cols=["Nick","Login","Casa","Patente","Cargos","Yuls","EXP"];
  const table=`<div style="overflow:auto"><table><thead><tr><th>Status</th>${cols.map(x=>`<th>${x}</th>`).join("")}<th>Problemas</th></tr></thead><tbody>${
    rows.map(r=>`<tr>
      <td class="${r.errors?.length?"import-invalid":"import-valid"}">${r.errors?.length?"❌":"✅"} linha ${r.row}</td>
      ${[r.nick,r.login,r.house,r.patent,(r.roles||[]).join(" | "),r.yuls,r.exp].map(v=>`<td>${escapeHtml(v??"")}</td>`).join("")}
      <td class="${r.errors?.length?"import-issue-cell":""}">${escapeHtml((r.errors||[]).map(e=>e.message).join(" • "))}</td>
    </tr>`).join("")
  }</tbody></table></div>`;
  box.innerHTML=summary+table;
  qs("#playerImportConfirm").disabled=invalid>0||valid===0;
}
async function previewPlayerImport(){
  const file=qs("#playerImportFile")?.files?.[0];
  if(!file)return;
  state.playerImport.file=file;
  qs("#playerImportFileName").textContent=`${file.name} • ${(file.size/1024).toFixed(1)} KB`;
  qs("#playerImportStatus").textContent="Lendo e validando...";
  qs("#playerImportConfirm").disabled=true;
  const form=new FormData();form.append("file",file);
  try{
    const data=await adminApi("/api/admin/players/import/preview",{method:"POST",body:form});
    state.playerImport.preview=data;
    renderImportPreview(data);
    qs("#playerImportStatus").textContent=data.invalid?"Corrija os dados indicados e envie novamente.":"Planilha pronta para importação.";
  }catch(e){qs("#playerImportPreview").innerHTML="<p>Não foi possível processar o arquivo.</p>";qs("#playerImportStatus").textContent=e.message}
}
async function confirmPlayerImport(){
  const file=state.playerImport.file;if(!file)return;
  qs("#playerImportConfirm").disabled=true;qs("#playerImportCancel").disabled=true;qs("#playerImportStatus").textContent="Importando jogadores...";
  const form=new FormData();form.append("file",file);
  try{
    const data=await adminApi("/api/admin/players/import",{method:"POST",body:form});
    qs("#playerImportStatus").textContent=`✅ ${data.created} jogadores importados com sucesso.`;
    await initAdmin();
    setTimeout(closePlayerImport,700);
  }catch(e){
    qs("#playerImportStatus").textContent=e.message;
    qs("#playerImportConfirm").disabled=false;qs("#playerImportCancel").disabled=false;
    if(e.issues)renderImportPreview({...state.playerImport.preview,invalid:e.issues.length,valid:0,issues:e.issues});
  }
}
async function initAdmin(){
  if(!state.admin)return;
  try{
    const [ov,pl]=await Promise.all([adminApi("/api/admin/overview"),adminApi("/api/admin/players")]);
    state.players=pl.players;
    await loadAdminCards();
    renderAdminStats(ov);populateAdminFilters();renderAdminList(state.players,qs("#adminSearch").value);
    if(state.selectedPlayer){await selectAdminPlayer(state.selectedPlayer.id)}
  }catch(e){alert(e.message);go("home")}
}

function renderAdminStats(ov){
  const cards=[["👥","Jogadores",ov.players],["🏰","Casas",ov.houses],["📰","Notícias",ov.news],["📖","Edições",ov.editions],["🪙","Yuls em circulação",money(ov.yuls)],["🔐","Sem senha",ov.withoutPassword]];
  qs("#adminStats").innerHTML=cards.map(c=>`<div class="admin-stat"><span>${c[0]} ${c[1]}</span><b>${c[2]}</b></div>`).join("");
}

function renderAdminList(players,term){
  const t=String(term||"").trim().toLowerCase();
  const f=state.adminFilters;
  let filtered=(players||[]).filter(p=>{
    const text=`${p.nick||""} ${p.number||""} ${p.identifier||""} ${p.house||""}`.toLowerCase();
    if(t&&!text.includes(t))return false;
    if(f.house&&String(p.house||"")!==String(f.house))return false;
    if(f.patent&&String(p.patent||"")!==String(f.patent))return false;
    if(f.visibility!==""&&String(Number(p.public_profile))!==String(f.visibility))return false;
    if(f.role&&!((p.roles||[]).map(r=>String(r.id)).includes(String(f.role))))return false;
    return true;
  });

  filtered.sort((a,b)=>{
    if(f.sort==="missions")return Number(b.missions||0)-Number(a.missions||0);
    if(f.sort==="yuls")return Number(b.yuls||0)-Number(a.yuls||0);
    if(f.sort==="power")return Number(b.power||0)-Number(a.power||0);
    if(f.sort==="ranking")return (Number(a.ranking||999999)-Number(b.ranking||999999));
    if(f.sort==="updated")return new Date(b.updated_at||0)-new Date(a.updated_at||0);
    return `${a.nick||""}`.localeCompare(`${b.nick||""}`,"pt-BR");
  });

  qs("#playerCountLabel").textContent=`${filtered.length} visíveis`;

  qs("#adminPlayerList").innerHTML=filtered.length
    ? filtered.map(p=>`<button class="admin-player ${state.selectedPlayer?.id===p.id?"selected":""}" data-player-id="${p.id}" type="button">
        <span class="player-select-wrap" data-stop-row-click><input class="player-select" type="checkbox" data-player-check="${p.id}" ${state.selectedPlayers.has(Number(p.id))?"checked":""}></span>
        <span><b>${escapeHtml(displayPlayerName(p))}</b><small>${escapeHtml(p.house||"Sem Casa")} · ${escapeHtml(p.patent||"Sem patente")} · ${(p.roles||[]).map(r=>escapeHtml(r.name)).join(", ")||"sem cargos"} · ${p.has_password?"🔐 senha definida":"⚠️ sem senha"}</small></span>
        <span class="player-yuls">🪙 ${money(p.yuls)}</span>
      </button>`).join("")
    : `<div style="padding:30px;text-align:center;color:#888;font-size:11px">Nenhum jogador encontrado.</div>`;

  qsa(".admin-player").forEach(b=>b.onclick=()=>selectAdminPlayer(Number(b.dataset.playerId)));
  qsa("[data-player-check]").forEach(c=>{
    c.onclick=e=>e.stopPropagation();
    c.onchange=e=>{
      const id=Number(e.target.dataset.playerCheck);
      if(e.target.checked)state.selectedPlayers.add(id);else state.selectedPlayers.delete(id);
      renderAdminList(state.players,qs("#adminSearch").value);
    };
  });
  updateBulkCount();
}
function populateAdminFilters(){
  const houses=[...new Set((state.players||[]).map(p=>p.house).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const patents=[...new Set((state.players||[]).map(p=>p.patent).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const roleList=state.adminHierarchy?.roles||[];

  const h=qs("#adminHouseFilter"),p=qs("#adminPatentFilter"),r=qs("#adminRoleFilter");
  if(h)h.innerHTML=`<option value="">Todas as Casas</option>`+houses.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  if(p)p.innerHTML=`<option value="">Todas as Patentes</option>`+patents.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  if(r)r.innerHTML=`<option value="">Todos os Cargos</option>`+roleList.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("");
  if(h)h.value=state.adminFilters.house||""; if(p)p.value=state.adminFilters.patent||""; if(r)r.value=state.adminFilters.role||"";
}

function updateBulkCount(){
  const el=qs("#bulkSelectedCount");
  if(el)el.textContent=`${state.selectedPlayers.size} ${state.selectedPlayers.size===1?"selecionado":"selecionados"}`;
}

function openBulkModal(type){
  const ids=[...state.selectedPlayers].filter(id=>state.players.some(p=>Number(p.id)===id));
  if(!ids.length){alert("Selecione pelo menos um jogador.");return;}
  let title="",body="";
  if(type==="yuls")title="🪙 Movimentar Yuls",body=`<div class="bulk-modal-grid"><select id="bulkYulsMode"><option value="add">Adicionar Yuls</option><option value="remove">Retirar Yuls</option></select><input id="bulkYulsAmount" type="number" min="1" placeholder="Valor"><textarea id="bulkYulsReason" placeholder="Motivo"></textarea></div>`;
  if(type==="house")title="🏰 Alterar Casa",body=`<div class="bulk-modal-grid"><select id="bulkHouse">${(state.adminHouses||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("")}</select></div>`;
  if(type==="patent")title="🎖️ Alterar Patente",body=`<div class="bulk-modal-grid"><select id="bulkPatent">${(state.adminHierarchy?.patents||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("")}</select></div>`;
  if(type==="roles")title="👑 Definir Cargos",body=`<div class="bulk-role-options">${(state.adminHierarchy?.roles||[]).map(x=>`<label class="role-option"><input type="checkbox" name="bulkRoleIds" value="${x.id}"><span><b>${escapeHtml(x.name)}</b><small>${x.salary>0?`🪙 ${money(x.salary)}`:""}</small></span></label>`).join("")||`<span style="font-size:10px;color:#888">Nenhum cargo cadastrado.</span>`}</div>`;
  if(type==="missions")title="📋 Ajustar Missões",body=`<div class="bulk-modal-grid"><select id="bulkMissionMode"><option value="add">Adicionar missões</option><option value="set">Definir quantidade</option></select><input id="bulkMissionAmount" type="number" min="0" placeholder="Quantidade"></div>`;
  if(type==="power")title="⚔️ Definir Força",body=`<div class="bulk-modal-grid"><input id="bulkPowerAmount" type="number" min="0" placeholder="Novo valor de força"></div>`;
  if(type==="visibility")title="👁️ Visibilidade",body=`<div class="bulk-modal-grid"><select id="bulkVisibility"><option value="1">Tornar público</option><option value="0">Ocultar perfil</option></select></div>`;

  const modal=document.createElement("div");
  modal.className="bulk-modal-backdrop";modal.id="bulkModal";
  modal.innerHTML=`<div class="bulk-modal"><h3>${title}</h3><p>${ids.length} jogador(es) selecionado(s). A alteração será aplicada a todos.</p>${body}<div class="bulk-modal-actions"><button type="button" class="outline dark-outline" id="bulkCancel">Cancelar</button><button type="button" class="gold" id="bulkConfirm">Aplicar</button></div></div>`;
  document.body.appendChild(modal);
  qs("#bulkCancel").onclick=()=>modal.remove();
  qs("#bulkConfirm").onclick=()=>submitBulkAction(type,ids,modal);
}

async function submitBulkAction(type,ids,modal){
  let action="",payload={player_ids:ids};
  if(type==="yuls"){
    payload.amount=Math.round(Number(qs("#bulkYulsAmount").value||0));
    payload.reason=qs("#bulkYulsReason").value.trim()||"Movimentação administrativa em massa";
    action=qs("#bulkYulsMode").value==="add"?"add_yuls":"remove_yuls";
  }
  if(type==="house"){action="set_house";payload.house_id=Number(qs("#bulkHouse").value)}
  if(type==="patent"){action="set_patent";payload.patent_id=Number(qs("#bulkPatent").value)}
  if(type==="roles"){action="set_roles";payload.role_ids=[...modal.querySelectorAll('input[name="bulkRoleIds"]:checked')].map(x=>Number(x.value))}
  if(type==="missions"){action=qs("#bulkMissionMode").value==="add"?"add_missions":"set_missions";payload.amount=Math.round(Number(qs("#bulkMissionAmount").value||0))}
  if(type==="power"){action="set_power";payload.amount=Math.round(Number(qs("#bulkPowerAmount").value||0))}
  if(type==="visibility"){action="set_public";payload.public_profile=Number(qs("#bulkVisibility").value)}

  try{
    await adminApi("/api/admin/players/bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
    modal.remove();state.selectedPlayers.clear();await initAdmin();alert("Ação aplicada com sucesso.");
  }catch(e){alert(e.message)}
}

async function selectAdminPlayer(id){
  try{
    const [d,m,h,c]=await Promise.all([
      adminApi(`/api/admin/players/${id}`),
      adminApi(`/api/admin/players/${id}/missions`),
      adminApi(`/api/admin/players/${id}/history`),
      adminApi(`/api/admin/players/${id}/cards`)
    ]);
    state.selectedPlayer={...d.player,history:d.history,missions:m.missions,adminHistory:h.admin,yulsHistory:h.yuls,cards:c.cards||[],cardHistory:h.cards||[]};
    renderAdminList(state.players,qs("#adminSearch").value);
    renderEditor(state.selectedPlayer);
  }catch(e){alert(e.message)}
}

function adminTabButton(key,label,active=false){
  return `<button type="button" class="admin-tab ${active?"active":""}" data-admin-tab="${key}">${label}</button>`;
}

function renderOverviewPanel(p){
  return `<div class="admin-overview">
    <div class="admin-overview-card"><span>🪙 Yuls</span><b>${money(p.yuls)}</b></div>
    <div class="admin-overview-card"><span>📋 Missões</span><b>${Number(p.missions||0)}</b></div>
    <div class="admin-overview-card"><span>⚔️ Força</span><b>${Number(p.power||0)}</b></div>
    <div class="admin-overview-card"><span>🏆 Ranking</span><b>${Number(p.ranking||0)>0?"#"+p.ranking:"—"}</b></div>
  </div>
  <div class="admin-status-line">
    <span class="admin-status-pill ${p.public_profile?"ok":"off"}">${p.public_profile?"● Perfil público":"● Perfil oculto"}</span>
    <span class="admin-status-pill ${p.has_password?"ok":"warn"}">${p.has_password?"🔐 Senha definida":"⚠️ Sem senha"}</span>
    <span class="admin-status-pill">${escapeHtml(p.house||"Sem Casa")}</span>
    <span class="admin-status-pill">${escapeHtml(p.patent||"Sem patente")}</span>
  </div>
  <p class="admin-editor-note">O número permanece apenas como identificador interno. O Nick é o nome exibido no Portal.</p>
  <form id="editPlayerForm"><div class="form-grid">
    ${field("Nick","nick",p.nick)}
    ${field("Número interno","number",p.number)}
    ${field("Nova senha","password","","password")}
    ${field("Casa","house",p.house)}
    ${selectField("Patente","patent",p.patent,state.adminHierarchy?.patents||[],"name")}
    ${rolesMultiField(p.roles||[],state.adminHierarchy?.roles||[])}
    ${field("Grimório","grimoire",p.grimoire)}
    ${field("❤️ HP","hp",p.hp,"number")}
    ${field("♦️ Mana","mana",p.mana,"number")}
    ${field("🪙 Yuls","yuls",p.yuls,"number")}
    ${field("📋 Missões","missions",p.missions,"number")}
    ${field("🏆 Conquistas","achievements",p.achievements,"number")}
    ${field("Ranking","ranking",p.ranking,"number")}
    ${field("⚔️ Força","power",p.power,"number")}
    <div class="field full"><label>Perfil público</label><select name="public_profile"><option value="1" ${p.public_profile?"selected":""}>Visível</option><option value="0" ${!p.public_profile?"selected":""}>Oculto</option></select></div>
  </div><div class="editor-actions"><button class="gold" type="submit">Salvar alterações</button><button class="outline dark-outline" type="button" id="deletePlayerBtn">Excluir jogador</button></div><div class="error" id="editError"></div></form>`;
}

function renderEconomyPanel(p){
  const hist=(p.history||[]).map(h=>`<div class="history-row"><span>${escapeHtml(h.reason||"Movimentação")}<br><small>${escapeHtml(String(h.created_at||""))}</small></span><b class="${h.amount>=0?"plus":"minus"}">${h.amount>=0?"+":""}${money(h.amount)} → ${money(h.balance_after)}</b></div>`).join("")||`<div class="admin-history-empty">Nenhuma movimentação registrada.</div>`;
  return `<div class="yuls-box" style="margin-top:0"><h4>🪙 Movimentação de Yuls</h4><div class="yuls-form"><input id="yulsAmount" type="number" step="1" placeholder="+100 ou -100"><input id="yulsReason" placeholder="Motivo (pagamento, multa, recompensa...)"><button class="gold" id="yulsBtn" type="button">Lançar</button></div><div class="history">${hist}</div></div>`;
}

function renderMissionsPanel(p){
  const list=(p.missions||[]).map(m=>`<div class="admin-mission-row"><span><b>${escapeHtml(m.title)}</b><small>${escapeHtml(m.status)}${m.mission_rank?` • ${escapeHtml(m.mission_rank)}`:""}${m.reward_yuls?` • 🪙 ${money(m.reward_yuls)}`:""} • ${escapeHtml(String(m.completed_at||""))}</small></span><button type="button" data-mission-delete="${m.id}">Excluir</button></div>`).join("")||"<div class='admin-history-empty'>Nenhuma missão registrada.</div>";
  return `<div class="admin-mission-box"><h4>⚔️ Registrar missão</h4><div class="mission-form-grid"><input id="missionTitle" class="wide" placeholder="Nome da missão"><input id="missionType" placeholder="Tipo (Missão, Evento...)"><input id="missionRank" placeholder="Rank"><select id="missionStatus"><option>Concluída</option><option>Falha</option><option>Cancelada</option><option>Em andamento</option></select><input id="missionReward" type="number" min="0" step="1" placeholder="Recompensa em Yuls"><input id="missionDate" type="date" value="${new Date().toISOString().slice(0,10)}"><textarea id="missionNotes" class="wide" placeholder="Observações (opcional)"></textarea></div><div class="mission-form-actions"><button class="gold" id="missionBtn" type="button">Registrar missão</button></div><div class="history" style="margin-top:16px"><div class="eyebrow">HISTÓRICO DE MISSÕES</div><div class="admin-mission-history">${list}</div></div></div>`;
}

function renderAdminPlayerCardsPanel(p){
  const inventory=p.cards||[];
  const catalog=(state.adminCards||[]).filter(c=>Number(c.active)===1);
  const options=catalog.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.category)}</option>`).join("");
  const missionOptions=(p.missions||[]).map(m=>`<option value="${m.id}">${escapeHtml(m.title)}${m.completed_at?` • ${escapeHtml(String(m.completed_at))}`:""}</option>`).join("");
  const patentOptions=(state.adminHierarchy?.patents||[]).map(x=>`<option value="${x.name}">${escapeHtml(x.name)}</option>`).join("");

  const list=inventory.length
    ? inventory.map(c=>`<div class="admin-card-row">
        <div>
          <b>${escapeHtml(c.name)}</b>
          <small>${escapeHtml(c.category)}${c.cost?` • ${escapeHtml(c.cost)}`:""} • ${escapeHtml(acquisitionLabel(c))}</small>
        </div>
        <button type="button" class="card-remove-btn" data-admin-card-remove="${c.id}">Retirar</button>
      </div>`).join("")
    : `<div class="admin-history-empty">Este jogador ainda não possui cards.</div>`;

  return `<div>
    <p class="admin-editor-note">Cada card é único no inventário. Ao adicionar, registre a origem: missão, evento, loja ou patente.</p>
    <div class="admin-card-add">
      <select id="adminCardSelect">${options||`<option value="">Nenhum card ativo cadastrado</option>`}</select>
      <select id="adminCardMode"><option value="add">Adicionar card</option></select>
      <select id="adminCardSourceType">
        <option value="MISSAO">🎯 Missão</option>
        <option value="EVENTO">🎉 Evento</option>
        <option value="LOJA">🛒 Loja</option>
        <option value="PATENTE">🎖️ Patente</option>
        <option value="OUTRO">◆ Outra origem</option>
      </select>
      <input id="adminCardSourceName" placeholder="Nome da origem" style="display:none">
      <select id="adminCardMission" style="display:block"><option value="">Selecione a missão</option>${missionOptions}</select>
      <select id="adminCardPatent" style="display:none"><option value="">Selecione a patente</option>${patentOptions}</select>
      <button class="gold" id="adminCardApply" type="button">Adicionar</button>
    </div>
    <div class="eyebrow" style="margin:10px 0">INVENTÁRIO ATUAL</div>
    <div class="admin-player-cards">${list}</div>
  </div>`;
}

function updateAdminCardSourceFields(){
  const type=qs("#adminCardSourceType")?.value||"MISSAO";
  const mission=qs("#adminCardMission"),patent=qs("#adminCardPatent"),name=qs("#adminCardSourceName");
  if(mission)mission.style.display=type==="MISSAO"?"block":"none";
  if(patent)patent.style.display=type==="PATENTE"?"block":"none";
  if(name)name.style.display=(type==="EVENTO"||type==="LOJA"||type==="OUTRO")?"block":"none";
}

async function applyAdminCardChange(){
  if(!state.selectedPlayer)return;
  const cardId=Number(qs("#adminCardSelect")?.value||0);
  const sourceType=qs("#adminCardSourceType")?.value||"MISSAO";
  if(!cardId){alert("Cadastre ou selecione um card.");return}

  let acquisition_id="",acquisition_name="";
  if(sourceType==="MISSAO"){
    acquisition_id=qs("#adminCardMission")?.value||"";
    if(!acquisition_id){alert("Selecione a missão que concedeu o card.");return}
  }else if(sourceType==="PATENTE"){
    acquisition_name=qs("#adminCardPatent")?.value||"";
    if(!acquisition_name){alert("Selecione a patente que concedeu o card.");return}
  }else{
    acquisition_name=(qs("#adminCardSourceName")?.value||"").trim();
    if(!acquisition_name){alert("Informe a origem da aquisição.");return}
  }

  try{
    await adminApi(`/api/admin/players/${state.selectedPlayer.id}/cards`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        card_id:cardId,mode:"add",
        acquisition_type:sourceType,
        acquisition_id:acquisition_id,
        acquisition_name:acquisition_name
      })
    });
    await selectAdminPlayer(state.selectedPlayer.id);
    alert("Card adicionado ao inventário.");
  }catch(e){alert(e.message)}
}

async function removeAdminCard(cardId){
  if(!state.selectedPlayer)return;
  const c=(state.selectedPlayer.cards||[]).find(x=>Number(x.id)===Number(cardId));
  if(!c)return;
  if(!confirm(`Retirar o card "${c.name}" deste jogador?`))return;
  try{
    await adminApi(`/api/admin/players/${state.selectedPlayer.id}/cards`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({card_id:Number(cardId),mode:"remove"})
    });
    await selectAdminPlayer(state.selectedPlayer.id);
    alert("Card retirado do inventário.");
  }catch(e){alert(e.message)}
}


function renderRolesPanel(p){
  return `<div class="panel" style="box-shadow:none;padding:0;border:0;background:transparent">
    <p class="admin-editor-note">Selecione todos os cargos que pertencem ao jogador. A alteração é salva junto com a ficha.</p>
    ${rolesMultiField(p.roles||[],state.adminHierarchy?.roles||[])}
  </div>`;
}

function renderHistoryPanel(p){
  const entries=[];
  (p.adminHistory||[]).forEach(h=>entries.push({kind:h.action,title:h.action,desc:h.description,date:h.created_at}));
  (p.yulsHistory||[]).forEach(h=>entries.push({kind:"YULS",title:"Movimentação de Yuls",desc:`${h.amount>=0?"+":""}${money(h.amount)} • ${h.reason||"Movimentação"} • saldo ${money(h.balance_after)}`,date:h.created_at}));
  (p.missions||[]).forEach(m=>entries.push({kind:"MISSÃO",title:"Missão",desc:`${m.title} • ${m.status}${m.reward_yuls?` • recompensa ${money(m.reward_yuls)}`:""}`,date:m.completed_at||m.created_at}));
  (p.cardHistory||[]).forEach(c=>entries.push({kind:"CARD",title:`Card ${c.action==="ADQUIRIDO"?"adquirido":"removido"}`,desc:`${c.card_name}${c.action==="ADQUIRIDO"&&c.acquisition_name?` • origem: ${c.acquisition_name}`:""}`,date:c.created_at}));
  entries.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  return `<div class="admin-history-list">${entries.length?entries.map(e=>`<div class="admin-history-entry"><span class="admin-history-dot"></span><div><b>${escapeHtml(e.title)}</b><p>${escapeHtml(e.desc)}</p><small>${escapeHtml(String(e.date||""))}</small></div></div>`).join(""):`<div class="admin-history-empty">Nenhum histórico registrado.</div>`}</div>`;
}

function renderEditor(p){
  qs("#adminEditor").innerHTML=`<div class="editor-head"><div><p class="eyebrow">EDITANDO JOGADOR</p><h3>${escapeHtml(displayPlayerName(p))}</h3><p>${escapeHtml(p.house||"Sem Casa")} · ${escapeHtml(p.patent||"Sem patente")}</p></div><button class="icon-button" type="button" id="closeEditor">×</button></div>
  <div class="admin-tabs">
    ${adminTabButton("overview","Dados",true)}
    ${adminTabButton("economy","Economia")}
    ${adminTabButton("missions","Missões")}
    ${adminTabButton("cards","Cards")}
    ${adminTabButton("roles","Cargos")}
    ${adminTabButton("history","Histórico")}
  </div>
  <div class="admin-tab-panel active" data-admin-tab-panel="overview">${renderOverviewPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="economy">${renderEconomyPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="missions">${renderMissionsPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="cards">${renderAdminPlayerCardsPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="roles">${renderRolesPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="history">${renderHistoryPanel(p)}</div>`;

  const empty=`<div class="empty-editor"><div class="empty-icon">♠</div><p class="eyebrow">SELECIONE UM JOGADOR</p><h3>Pronto para administrar</h3><p>Escolha um jogador ao lado para editar os dados, lançar Yuls, registrar missões ou administrar seus cargos.</p></div>`;
  qs("#closeEditor").addEventListener("click",()=>{state.selectedPlayer=null;renderAdminList(state.players,qs("#adminSearch").value);qs("#adminEditor").innerHTML=empty});

  qsa("[data-admin-tab]").forEach(tab=>{
    tab.onclick=()=>{
      const key=tab.dataset.adminTab;
      qsa("[data-admin-tab]").forEach(x=>x.classList.toggle("active",x===tab));
      qsa("[data-admin-tab-panel]").forEach(x=>x.classList.toggle("active",x.dataset.adminTabPanel===key));
    };
  });

  qs("#editPlayerForm").addEventListener("submit",savePlayer);
  qs("#deletePlayerBtn").addEventListener("click",deleteSelectedPlayer);
  qs("#yulsBtn").addEventListener("click",launchYuls);
  qs("#missionBtn").addEventListener("click",launchMission);
  qs("#adminCardApply")?.addEventListener("click",applyAdminCardChange);
  qs("#adminCardSourceType")?.addEventListener("change",updateAdminCardSourceFields);
  updateAdminCardSourceFields();
  qsa("[data-admin-card-remove]").forEach(b=>b.addEventListener("click",()=>removeAdminCard(Number(b.dataset.adminCardRemove))));
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
    await selectAdminPlayer(state.selectedPlayer.id);
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
  if(!confirm(`Excluir ${displayPlayerName(state.selectedPlayer)}? Esta ação não pode ser desfeita.`))return;
  try{
    await adminApi(`/api/admin/players/${state.selectedPlayer.id}`,{method:"DELETE"});
    state.selectedPlayer=null;await initAdmin();
    qs("#adminEditor").innerHTML=`<div class="empty-editor"><div class="empty-icon">♠</div><p class="eyebrow">JOGADOR EXCLUÍDO</p><h3>Selecione outro jogador</h3><p>O cadastro foi removido do banco.</p></div>`;
  }catch(ex){alert(ex.message)}
}

function openNewPlayer(){
  state.selectedPlayer=null;renderAdminList(state.players,qs("#adminSearch").value);
  qs("#adminEditor").innerHTML=`<div class="editor-head"><div><p class="eyebrow">NOVO CADASTRO</p><h3>Novo jogador</h3><p>Crie o acesso usando Nick, número interno e senha.</p></div><button class="icon-button" id="closeEditor" type="button">×</button></div>
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
["adminHouseFilter","adminPatentFilter","adminRoleFilter","adminVisibilityFilter","adminSort"].forEach(id=>{
  const el=qs("#"+id);if(!el)return;
  el.onchange=()=>{
    if(id==="adminHouseFilter")state.adminFilters.house=el.value;
    if(id==="adminPatentFilter")state.adminFilters.patent=el.value;
    if(id==="adminRoleFilter")state.adminFilters.role=el.value;
    if(id==="adminVisibilityFilter")state.adminFilters.visibility=el.value;
    if(id==="adminSort")state.adminFilters.sort=el.value;
    renderAdminList(state.players,qs("#adminSearch").value);
  };
});
qs("#selectAllPlayersBtn").onclick=()=>{
  const checks=[...qs("#adminPlayerList").querySelectorAll("[data-player-check]")];
  checks.forEach(c=>state.selectedPlayers.add(Number(c.dataset.playerCheck)));
  renderAdminList(state.players,qs("#adminSearch").value);
};
qs("#clearAllPlayersBtn").onclick=()=>{
  state.selectedPlayers.clear();
  renderAdminList(state.players,qs("#adminSearch").value);
};
qsa("[data-bulk-action]").forEach(b=>b.onclick=()=>openBulkModal(b.dataset.bulkAction));
qs("#newPlayerBtn").addEventListener("click",openNewPlayer);
qs("#refreshAdminBtn").addEventListener("click",initAdmin);
qs("#newsForm")?.addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await adminApi("/api/admin/news",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();alert("Notícia publicada.");await loadAdminEditorial();await loadHome();if(state.page==="jornal")loadEditions();}catch(ex){alert(ex.message)}});
qs("#editionForm")?.addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await adminApi("/api/admin/editions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();alert("Edição publicada.");await loadAdminEditorial();await loadHome();if(state.page==="jornal")loadEditions();}catch(ex){alert(ex.message)}});
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

qs("#importPlayersBtn").addEventListener("click",openPlayerImport);
qs("#closePlayerImport").addEventListener("click",closePlayerImport);
qs("#playerImportCancel").addEventListener("click",closePlayerImport);
qs("#playerImportFile").addEventListener("change",previewPlayerImport);
qs("#playerImportConfirm").addEventListener("click",confirmPlayerImport);
qs("#roleForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target).entries()); b.active=qs("#roleActive").checked?1:0;
  try{
    if(b.id) await adminApi(`/api/admin/roles/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    else await adminApi("/api/admin/roles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    resetRoleForm();await loadAdminHierarchy();await loadHierarchy();alert("Cargo salvo com sucesso.");
  }catch(ex){qs("#roleError").textContent=ex.message}
});
qs("#roleCancelBtn").addEventListener("click",resetRoleForm);

async function loadAdminCards(){
  try{
    const d=await adminApi("/api/admin/cards");
    state.adminCards=d.cards||[];
    state.cardCategories=d.categories||d.types||[];
    renderAdminCardCatalog();
  }catch(e){console.error(e)}
}

function resetCardForm(){
  const f=qs("#cardForm");if(!f)return;
  f.reset();
  qs("#cardId").value="";
  qs("#adminCardCategory").value="Outros";
  qs("#cardActive").checked=true;
  qs("#cardSaveBtn").textContent="Criar card";
  qs("#cardError").textContent="";
}

function editCardForm(id){
  const c=state.adminCards.find(x=>Number(x.id)===id);if(!c)return;
  qs("#cardId").value=c.id;
  qs("#cardName").value=c.name;
  qs("#adminCardCategory").value=c.category;
  qs("#cardCost").value=c.cost||"";
  qs("#cardOrder").value=c.sort_order||0;
  qs("#cardDescription").value=c.description||"";
  qs("#cardActive").checked=!!c.active;
  qs("#cardSaveBtn").textContent="Salvar card";
  qs("#cardError").textContent="";
  qs("#cardName").focus();
}

function renderAdminCardCatalog(){
  const list=qs("#adminCardCatalogList");if(!list)return;
  list.innerHTML=(state.adminCards||[]).map(c=>`<div class="card-catalog-item">
    <div><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.category)}${c.cost?` • ${escapeHtml(c.cost)}`:""} • ${c.players} jogador(es)${c.active?"":" • DESATIVADO"}</small></div>
    <div class="card-catalog-actions"><button type="button" data-card-edit="${c.id}">✎</button><button type="button" class="delete" data-card-delete="${c.id}">×</button></div>
  </div>`).join("")||`<div class="admin-history-empty">Nenhum card cadastrado.</div>`;
  qsa("[data-card-edit]").forEach(b=>b.onclick=()=>editCardForm(Number(b.dataset.cardEdit)));
  qsa("[data-card-delete]").forEach(b=>b.onclick=()=>deleteCard(Number(b.dataset.cardDelete)));
  const select=qs("#adminCardCategory");
  if(select){
    select.innerHTML=(state.cardCategories||[]).map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if(!qs("#cardId").value)select.value="Outros";
  }
}

async function deleteCard(id){
  const c=(state.adminCards||[]).find(x=>Number(x.id)===id);if(!c)return;
  if(!confirm(`Excluir o card "${c.name}"?`))return;
  try{
    await adminApi(`/api/admin/cards/${id}`,{method:"DELETE"});
    if(Number(qs("#cardId").value)===id)resetCardForm();
    await loadAdminCards();
    if(state.selectedPlayer)await selectAdminPlayer(state.selectedPlayer.id);
    alert("Card excluído.");
  }catch(e){alert(e.message)}
}

async function loadAdminEvents(){
  try{
    const d=await adminApi("/api/admin/events");
    state.adminEvents=d.events||[];
    renderAdminEvents();
    populateEventSelects();
  }catch(e){console.error(e)}
}
function resetEventForm(){
  const f=qs("#eventAdminForm");if(!f)return;f.reset();
  qs("#eventId").value="";qs("#eventType").value="JOGO";qs("#eventStatus").value="PLANEJADO";
  qs("#eventPublished").checked=true;qs("#eventFeatured").checked=false;
  qs("#eventSaveBtn").textContent="Criar evento";qs("#eventError").textContent="";
}
function editAdminEvent(id){
  const e=state.adminEvents.find(x=>Number(x.id)===id);if(!e)return;
  qs("#eventId").value=e.id;qs("#eventTitle").value=e.title;qs("#eventType").value=e.event_type;
  qs("#eventStatus").value=e.status;qs("#eventStart").value=String(e.start_date||"").slice(0,10);qs("#eventEnd").value=String(e.end_date||"").slice(0,10);
  qs("#eventImage").value=e.image_url||"";qs("#eventDescription").value=e.description||"";qs("#eventRules").value=e.rules||"";
  qs("#eventPublished").checked=!!e.published;qs("#eventFeatured").checked=!!e.featured;qs("#eventSaveBtn").textContent="Salvar evento";
}
function renderAdminEvents(){
  const list=qs("#adminEventList");if(!list)return;
  list.innerHTML=(state.adminEvents||[]).map(e=>`<div class="editorial-item">
    <div class="editorial-item-head"><div><b>${escapeHtml(e.title)}</b><small>${escapeHtml(eventTypeLabel(e.event_type))} • ${escapeHtml(eventStatusLabel(e.status))} • ${e.participants} participante(s) • ${e.actions} ação(ões)}</small></div>
    <div class="editorial-actions"><button type="button" data-event-edit="${e.id}">✎</button><button type="button" class="delete" data-event-delete="${e.id}">×</button></div></div>
  </div>`).join("")||`<div style="font-size:10px;color:#888">Nenhum evento cadastrado.</div>`;
  qsa("[data-event-edit]").forEach(b=>b.onclick=()=>editAdminEvent(Number(b.dataset.eventEdit)));
  qsa("[data-event-delete]").forEach(b=>b.onclick=()=>deleteAdminEvent(Number(b.dataset.eventDelete)));
}
async function deleteAdminEvent(id){
  const e=state.adminEvents.find(x=>Number(x.id)===id);if(!e)return;
  if(!confirm(`Excluir o evento "${e.title}"?`))return;
  try{await adminApi(`/api/admin/events/${id}`,{method:"DELETE"});await loadAdminEvents();alert("Evento excluído.")}catch(e){alert(e.message)}
}
function populateEventSelects(){
  const sels=["eventActionEventSelect","eventRewardEventSelect","eventPlayerEventSelect","eventResultEventSelect"];
  const html=(state.adminEvents||[]).map(e=>`<option value="${e.id}">${escapeHtml(e.title)}</option>`).join("");
  sels.forEach(id=>{const el=qs("#"+id);if(el)el.innerHTML=html});
  if(state.selectedEventId){sels.forEach(id=>{const el=qs("#"+id);if(el)el.value=String(state.selectedEventId)})}
  if(!state.selectedEventId&&state.adminEvents?.[0]){state.selectedEventId=Number(state.adminEvents[0].id)}
  if(state.adminEvents?.[0])loadEventAdminDetails(state.selectedEventId||Number(state.adminEvents[0].id));
}
async function loadEventAdminDetails(eventId){
  if(!eventId)return;state.selectedEventId=Number(eventId);
  try{
    const [a,r,p]=await Promise.all([
      adminApi(`/api/admin/events/${eventId}/actions`),
      adminApi(`/api/admin/events/${eventId}/rewards`),
      adminApi(`/api/admin/events/${eventId}/players`)
    ]);
    renderEventActions(a.actions||[]);
    renderEventRewards(r.rewards||[]);
    renderEventPlayers(p.players||[]);
    populateEventPlayerPicker();
    await loadAdminResults(eventId);
  }catch(e){console.error(e)}
}
function renderEventActions(actions){
  const el=qs("#adminEventActionList");if(!el)return;
  el.innerHTML=(actions||[]).map(a=>`<div class="admin-event-card"><div><b>${escapeHtml(a.name)}</b><small>${a.points} pontos • ${escapeHtml(a.description||"")}</small></div><button type="button" class="delete" data-event-action-delete="${a.id}">×</button></div>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma ação cadastrada.</div>`;
  qsa("[data-event-action-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Excluir esta ação?")){try{await adminApi(`/api/admin/event-actions/${b.dataset.eventActionDelete}`,{method:"DELETE"});await loadEventAdminDetails(state.selectedEventId)}catch(e){alert(e.message)}}});
}
function renderEventRewards(rewards){
  const el=qs("#adminEventRewardList");if(!el)return;
  el.innerHTML=(rewards||[]).map(r=>`<div class="admin-event-card"><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.category)} • ${r.points_cost} pontos${r.description?` • ${escapeHtml(r.description)}`:""}</small></div><button type="button" class="delete" data-event-reward-delete="${r.card_id}">×</button></div>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma recompensa vinculada.</div>`;
  qsa("[data-event-reward-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Remover esta recompensa?")){try{await adminApi(`/api/admin/events/${state.selectedEventId}/rewards/${b.dataset.eventRewardDelete}`,{method:"DELETE"});await loadEventAdminDetails(state.selectedEventId)}catch(e){alert(e.message)}}});
}
function populateEventPlayerPicker(){
  const el=qs("#eventParticipantPicker");if(!el)return;
  el.innerHTML=(state.players||[]).map(p=>`<label class="edition-picker-item"><input type="checkbox" data-event-player-pick="${p.id}"><span><b>${escapeHtml(displayPlayerName(p))}</b><small>${escapeHtml(p.house||"Sem Casa")} • ${escapeHtml(p.patent||"Sem patente")}</small></span></label>`).join("")||`<div style="font-size:10px;color:#888">Nenhum jogador.</div>`;
}
function renderEventPlayers(players){
  const list=qs("#eventParticipantList");if(!list)return;
  list.innerHTML=(players||[]).map(p=>`<div class="event-participant-row"><div><b>${escapeHtml(displayPlayerName(p))}</b><small>${escapeHtml(p.house||"Sem Casa")} • ${escapeHtml(p.patent||"Sem patente")}</small></div><span class="event-points-badge">${p.points} pts</span><span style="font-size:8px;color:#777">🪙 ${money(p.yuls)} • ✨ ${p.exp}</span><span style="font-size:8px;color:#777">📋 ${p.missions}</span></div>`).join("")||`<div class="admin-history-empty">Nenhum participante.</div>`;
  const sel=qs("#eventRewardPlayer"),sel2=qs("#eventActionPlayer"),sel3=qs("#eventCardRewardPlayer");
  const opts=(players||[]).map(p=>`<option value="${p.id}">${escapeHtml(displayPlayerName(p))} • ${p.points} pts</option>`).join("");
  if(sel)sel.innerHTML=opts||`<option value="">Nenhum participante</option>`;
  if(sel2)sel2.innerHTML=opts||`<option value="">Nenhum participante</option>`;
  if(sel3)sel3.innerHTML=opts||`<option value="">Nenhum participante</option>`;
  // Actions and active cards available for this event.
  loadEventActionSelect();
  loadEventGrantCardSelect(players||[]);
}
async function loadEventGrantCardSelect(players){
  const sel=qs("#eventGrantCard");if(!sel)return;
  const opts=(state.adminCards||[]).filter(c=>Number(c.active)===1)
    .map(c=>`<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.category)}</option>`).join("");
  sel.innerHTML=opts||`<option value="">Nenhum card ativo</option>`;
  if(!qs("#eventCardRewardPlayer")?.value && players?.[0])qs("#eventCardRewardPlayer").value=String(players[0].id);
}

async function loadEventActionSelect(){
  const sel=qs("#eventActionForPlayer");if(!sel)return;
  try{
    const d=await adminApi(`/api/admin/events/${state.selectedEventId}/actions`);
    sel.innerHTML=(d.actions||[]).map(a=>`<option value="${a.id}">${escapeHtml(a.name)} • +${a.points} pts</option>`).join("")||`<option value="">Nenhuma ação</option>`;
  }catch(e){}
}

async function loadAdminResults(eventId){
  const id=Number(eventId||state.selectedEventId);if(!id)return;
  try{const d=await adminApi(`/api/admin/events/${id}/results`);state.adminResults=d.results||[];renderAdminResults(state.adminResults)}catch(e){const er=qs("#eventResultError");if(er)er.textContent=e.message}
}
function renderAdminResults(results){
  const el=qs("#eventResultSlots");if(!el)return;
  const bySlot=new Map((results||[]).map(r=>[r.slot,r]));
  const slots=[["WINNER_1","🥇 1º Vencedor","winner",false],["WINNER_2","🥈 2º Vencedor","winner",false],["WINNER_3","🥉 3º Vencedor","winner",false],["HONOR_1","🏅 Menção Honrosa 1","honor",true],["HONOR_2","🏅 Menção Honrosa 2","honor",true],["HONOR_3","🏅 Menção Honrosa 3","honor",true]];
  const opts=(state.players||[]).map(p=>`<option value="${p.id}">${escapeHtml(displayPlayerName(p))} • ${escapeHtml(p.house||"Sem Casa")}</option>`).join("");
  el.innerHTML=slots.map(([slot,label,cls,isHonor])=>{const r=bySlot.get(slot);return `<div class="event-result-slot ${cls}" data-result-slot="${slot}"><label>${label}</label><select data-result-player="${slot}"><option value="">Selecionar jogador</option>${opts}</select>${isHonor?`<div class="event-result-fixed">Reconhecimento • sem premiação</div><span></span>`:`<div class="event-result-fixed">🪙 ${slot==="WINNER_1"?100:slot==="WINNER_2"?80:50} Yuls fixos</div><input data-result-exp="${slot}" type="number" min="0" placeholder="EXP">`}</div>`}).join("");
  slots.forEach(([slot])=>{const r=bySlot.get(slot);if(!r)return;const sel=qs(`[data-result-player="${slot}"]`);if(sel)sel.value=String(r.player_id);const ex=qs(`[data-result-exp="${slot}"]`);if(ex)ex.value=r.reward_exp||0})
}
async function saveAdminResults(){
  const id=Number(qs("#eventResultEventSelect")?.value||0);if(!id)return;
  const results=[...qs("#eventResultSlots").querySelectorAll("[data-result-slot]")].map(row=>{const slot=row.dataset.resultSlot;const player_id=Number(row.querySelector(`[data-result-player="${slot}"]`)?.value||0);const ex=Number(row.querySelector(`[data-result-exp="${slot}"]`)?.value||0);return {slot,player_id,reward_exp:slot.startsWith("WINNER_")?ex:0}}).filter(x=>x.player_id>0);
  try{await adminApi(`/api/admin/events/${id}/results`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({results})});await loadAdminResults(id);qs("#eventResultError").textContent="";alert("Resultado salvo.")}catch(e){qs("#eventResultError").textContent=e.message}
}
async function publishAdminResults(){
  const id=Number(qs("#eventResultEventSelect")?.value||0);if(!id)return;
  if(!confirm("Publicar este resultado? Os vencedores receberão 100, 80 e 50 Yuls. As Menções Honrosas não recebem premiação."))return;
  try{await adminApi(`/api/admin/events/${id}/results/publish`,{method:"POST"});await loadAdminResults(id);alert("Resultado publicado e premiações aplicadas aos vencedores.")}catch(e){qs("#eventResultError").textContent=e.message}
}

async function loadAdminArticles(){
  try{
    const [a,e]=await Promise.all([
      adminApi("/api/admin/articles"),
      adminApi("/api/admin/editions")
    ]);
    state.adminArticles=a.articles||[];
    state.adminEditions=e.editions||[];
    renderAdminArticles();
    populateEditorEditionSelect();
    if(state.editorEditionId)await loadEditionComposition(state.editorEditionId);
  }catch(e){console.error(e)}
}

function resetArticleForm(){
  const f=qs("#articleForm");if(!f)return;
  f.reset();
  qs("#articleId").value="";
  qs("#articleCategory").value="RPG";
  qs("#articleDate").value=new Date().toISOString().slice(0,10);
  qs("#articlePublished").checked=true;
  qs("#articleSaveBtn").textContent="Criar matéria";
  qs("#articleError").textContent="";
}
function editArticle(id){
  const a=(state.adminArticles||[]).find(x=>Number(x.id)===id);if(!a)return;
  qs("#articleId").value=a.id;qs("#articleTitle").value=a.title;qs("#articleSubtitle").value=a.subtitle||"";
  qs("#articleAuthor").value=a.author||"";qs("#articleCategory").value=a.category||"RPG";
  qs("#articleDate").value=String(a.date||"").slice(0,10);qs("#articleImage").value=a.image_url||"";
  qs("#articleExcerpt").value=a.excerpt||"";qs("#articleBody").value=a.body||"";
  qs("#articlePublished").checked=!!a.published;
  qs("#articleSaveBtn").textContent="Salvar matéria";qs("#articleError").textContent="";
  qs("#articleTitle").focus();
  qsa(".journal-editor-tab").forEach(x=>x.classList.toggle("active",x.dataset.editorTab==="article"));
  qsa("[data-editor-panel]").forEach(x=>x.classList.toggle("active",x.dataset.editorPanel==="article"));
}
function renderAdminArticles(){
  const list=qs("#adminArticleList");if(!list)return;
  list.innerHTML=(state.adminArticles||[]).map(a=>`<div class="editorial-item article-item" data-article-item="${a.id}">
    <div class="editorial-item-head"><div><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.category||"RPG")} • ${escapeHtml(a.author||"Redação")} • ${escapeHtml(String(a.date||""))}${a.published?"":" • Rascunho"}</small></div>
    <div class="editorial-actions"><button type="button" data-article-edit="${a.id}">✎</button><button type="button" class="delete" data-article-delete="${a.id}">×</button></div></div>
  </div>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma matéria cadastrada.</div>`;
  qsa("[data-article-edit]").forEach(b=>b.onclick=()=>editArticle(Number(b.dataset.articleEdit)));
  qsa("[data-article-delete]").forEach(b=>b.onclick=()=>deleteArticle(Number(b.dataset.articleDelete)));
}
async function deleteArticle(id){
  const a=(state.adminArticles||[]).find(x=>Number(x.id)===id);if(!a)return;
  if(!confirm(`Excluir a matéria "${a.title}"?`))return;
  try{await adminApi(`/api/admin/articles/${id}`,{method:"DELETE"});await loadAdminArticles();alert("Matéria excluída.")}catch(e){alert(e.message)}
}

function populateEditorEditionSelect(){
  const el=qs("#editorEditionSelect");if(!el)return;
  el.innerHTML=(state.adminEditions||[]).map(e=>`<option value="${e.id}">${escapeHtml(e.edition||"Edição")} — ${escapeHtml(e.title)}</option>`).join("");
  if(state.editorEditionId)el.value=String(state.editorEditionId);
  if(!state.editorEditionId&&state.adminEditions?.[0]){state.editorEditionId=Number(state.adminEditions[0].id);el.value=String(state.editorEditionId);}
}
async function loadEditionComposition(id){
  if(!id)return;
  state.editorEditionId=Number(id);
  try{
    const d=await adminApi(`/api/admin/editions/${id}/articles`);
    const selected=new Map((d.articles||[]).map(a=>[Number(a.id),a]));
    renderEditionPicker(selected);
    renderEditionOrder(selected);
  }catch(e){qs("#editionCompositionError").textContent=e.message}
}
function renderEditionPicker(selected){
  const el=qs("#editionArticlePicker");if(!el)return;
  el.innerHTML=(state.adminArticles||[]).map(a=>`<label class="edition-picker-item">
    <input type="checkbox" data-edition-pick="${a.id}" ${selected.has(Number(a.id))?"checked":""}>
    <span><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.category||"RPG")} • ${escapeHtml(a.author||"Redação")}</small></span>
  </label>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma matéria cadastrada.</div>`;
  qsa("[data-edition-pick]").forEach(c=>c.onchange=()=>syncEditionOrderFromPicker());
}
function syncEditionOrderFromPicker(){
  const selectedIds=[...qs("#editionArticlePicker").querySelectorAll("[data-edition-pick]:checked")].map(x=>Number(x.dataset.editionPick));
  const current=new Map([...qs("#editionArticleOrder").querySelectorAll("[data-edition-order]")].map(el=>[Number(el.dataset.editionOrder),Number(el.querySelector("input")?.value||0)]));
  const selected=new Map();
  selectedIds.forEach((id,i)=>selected.set(id,current.has(id)?current.get(id):(i+1)*10));
  renderEditionOrder(selected);
}
function renderEditionOrder(selected){
  const el=qs("#editionArticleOrder");if(!el)return;
  const items=[...(selected||new Map()).entries()]
    .map(([id,order])=>({a:(state.adminArticles||[]).find(x=>Number(x.id)===id),order}))
    .filter(x=>x.a)
    .sort((a,b)=>Number(a.order)-Number(b.order)||a.a.title.localeCompare(b.a.title,"pt-BR"));
  el.innerHTML=items.length?items.map((x,i)=>`<div class="edition-order-item" data-edition-row="${x.a.id}">
    <b>${escapeHtml(x.a.title)}</b><input type="number" value="${Number(x.order)||((i+1)*10)}" aria-label="Ordem">
    <button type="button" data-edition-up="${x.a.id}">↑</button><button type="button" data-edition-down="${x.a.id}">↓</button>
  </div>`).join(""):`<div class="admin-history-empty">Nenhuma matéria selecionada.</div>`;
  qsa("[data-edition-up]").forEach(b=>b.onclick=()=>moveEditionArticle(Number(b.dataset.editionUp),-1));
  qsa("[data-edition-down]").forEach(b=>b.onclick=()=>moveEditionArticle(Number(b.dataset.editionDown),1));
}
function moveEditionArticle(id,direction){
  const rows=[...qs("#editionArticleOrder").querySelectorAll("[data-edition-row]")];
  const idx=rows.findIndex(x=>Number(x.dataset.editionRow)===id);
  const target=idx+direction;if(idx<0||target<0||target>=rows.length)return;
  const parent=rows[0].parentElement;
  if(direction<0)parent.insertBefore(rows[idx],rows[target]);
  else parent.insertBefore(rows[target],rows[idx]);
  [...parent.querySelectorAll("[data-edition-row]")].forEach((row,i)=>row.querySelector("input").value=(i+1)*10);
}
async function saveEditionComposition(){
  const id=Number(qs("#editorEditionSelect")?.value||0);
  if(!id){alert("Cadastre uma edição primeiro.");return}
  const articles=[...qs("#editionArticleOrder").querySelectorAll("[data-edition-row]")].map(row=>({
    article_id:Number(row.dataset.editionRow),
    sort_order:Math.round(Number(row.querySelector("input").value||0))
  }));
  try{
    await adminApi(`/api/admin/editions/${id}/articles`,{
      method:"PUT",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({articles})
    });
    qs("#editionCompositionError").textContent="";
    await loadAdminArticles();
    alert("Composição da edição salva.");
  }catch(e){qs("#editionCompositionError").textContent=e.message}
}

async function loadAdminAnnouncements(){
  try{
    const d=await adminApi("/api/admin/announcements");
    state.adminAnnouncements=d.announcements||[];
    renderAdminAnnouncements();
  }catch(e){console.error(e)}
}

function resetAnnouncementForm(){
  const f=qs("#announcementForm");if(!f)return;
  f.reset();
  qs("#announcementId").value="";
  qs("#announcementCategory").value="INFORMATIVO";
  qs("#announcementPriority").value="INFORMATIVO";
  qs("#announcementDate").value=new Date().toISOString().slice(0,10);
  qs("#announcementFeatured").checked=false;
  qs("#announcementPublished").checked=true;
  qs("#announcementSaveBtn").textContent="Publicar comunicado";
  qs("#announcementError").textContent="";
}

function editAnnouncement(id){
  const a=(state.adminAnnouncements||[]).find(x=>Number(x.id)===id);if(!a)return;
  qs("#announcementId").value=a.id;
  qs("#announcementTitle").value=a.title;
  qs("#announcementCategory").value=a.category||"INFORMATIVO";
  qs("#announcementPriority").value=a.priority||"INFORMATIVO";
  qs("#announcementBody").value=a.body||"";
  qs("#announcementDate").value=String(a.date||"").slice(0,10);
  qs("#announcementFeatured").checked=!!a.featured;
  qs("#announcementPublished").checked=!!a.published;
  qs("#announcementSaveBtn").textContent="Salvar comunicado";
  qs("#announcementError").textContent="";
  qs("#announcementTitle").focus();
}

function renderAdminAnnouncements(){
  const el=qs("#adminAnnouncementList");if(!el)return;
  el.innerHTML=(state.adminAnnouncements||[]).map(a=>`<div class="editorial-item">
    <div class="editorial-item-head">
      <div>
        <b>${escapeHtml(a.title)}</b>
        <small><span class="announcement-priority ${announcementClass(a.priority)}">${escapeHtml(a.priority)}</span> ${escapeHtml(a.category||"INFORMATIVO")} • ${escapeHtml(String(a.date||""))}${a.featured?" • DESTAQUE":""}${a.published?"":" • RASCUNHO"}</small>
      </div>
      <div class="editorial-actions">
        <button type="button" data-ann-edit="${a.id}">✎</button>
        <button type="button" class="delete" data-ann-delete="${a.id}">×</button>
      </div>
    </div>
  </div>`).join("")||`<div style="font-size:10px;color:#888">Nenhum comunicado.</div>`;

  qsa("[data-ann-edit]").forEach(b=>b.onclick=()=>editAnnouncement(Number(b.dataset.annEdit)));
  qsa("[data-ann-delete]").forEach(b=>b.onclick=()=>deleteAnnouncement(Number(b.dataset.annDelete)));
}

async function deleteAnnouncement(id){
  if(!confirm("Excluir este comunicado?"))return;
  try{
    await adminApi(`/api/admin/announcements/${id}`,{method:"DELETE"});
    resetAnnouncementForm();
    await loadAdminAnnouncements();
    await loadAnnouncements();
    await loadHome();
    alert("Comunicado excluído.");
  }catch(e){alert(e.message)}
}

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

qs("#saveEventResultsBtn").addEventListener("click",saveAdminResults);
qs("#publishEventResultsBtn").addEventListener("click",publishAdminResults);
qs("#eventAdminForm").addEventListener("submit",async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());
  b.featured=qs("#eventFeatured").checked?1:0;b.published=qs("#eventPublished").checked?1:0;
  try{
    if(b.id)await adminApi(`/api/admin/events/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    else await adminApi("/api/admin/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    resetEventForm();await loadAdminEvents();alert("Evento salvo com sucesso.");
  }catch(ex){qs("#eventError").textContent=ex.message}
});
qs("#eventCancelBtn").addEventListener("click",resetEventForm);

qsa("[data-event-admin-tab]").forEach(tab=>tab.onclick=()=>{
  qsa("[data-event-admin-tab]").forEach(x=>x.classList.toggle("active",x===tab));
  qsa("[data-event-admin-panel]").forEach(x=>x.classList.toggle("active",x.dataset.eventAdminPanel===tab.dataset.eventAdminTab));
});
["eventActionEventSelect","eventRewardEventSelect","eventPlayerEventSelect","eventResultEventSelect"].forEach(id=>qs("#"+id)?.addEventListener("change",e=>loadEventAdminDetails(Number(e.target.value))));
qs("#eventActionForm").addEventListener("submit",async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());
  try{await adminApi(`/api/admin/events/${state.selectedEventId}/actions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();await loadEventAdminDetails(state.selectedEventId);qs("#eventActionError").textContent=""}catch(ex){qs("#eventActionError").textContent=ex.message}
});
qs("#eventRewardForm").addEventListener("submit",async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());
  try{await adminApi(`/api/admin/events/${state.selectedEventId}/rewards`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();await loadEventAdminDetails(state.selectedEventId);qs("#eventRewardError").textContent=""}catch(ex){qs("#eventRewardError").textContent=ex.message}
});
qs("#eventAddParticipantsBtn").addEventListener("click",async()=>{
  const ids=[...qs("#eventParticipantPicker").querySelectorAll("[data-event-player-pick]:checked")].map(x=>Number(x.dataset.eventPlayerPick));
  try{await adminApi(`/api/admin/events/${state.selectedEventId}/participants`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({player_ids:ids})});await loadEventAdminDetails(state.selectedEventId);alert("Participantes adicionados.")}catch(e){alert(e.message)}
});
qs("#eventGrantBtn").addEventListener("click",async()=>{
  const player_id=Number(qs("#eventRewardPlayer").value),yuls=Number(qs("#eventGrantYuls").value||0),exp=Number(qs("#eventGrantExp").value||0),note=qs("#eventGrantNote").value.trim();
  try{await adminApi(`/api/admin/events/${state.selectedEventId}/reward`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({player_id,yuls,exp,note})});qs("#eventGrantYuls").value="";qs("#eventGrantExp").value="";qs("#eventGrantNote").value="";await loadEventAdminDetails(state.selectedEventId);alert("Recompensa lançada.")}catch(e){alert(e.message)}
});
qs("#eventGrantCardBtn").addEventListener("click",async()=>{
  const player_id=Number(qs("#eventCardRewardPlayer").value),card_id=Number(qs("#eventGrantCard").value),note=qs("#eventGrantCardNote").value.trim();
  try{
    const r=await adminApi(`/api/admin/events/${state.selectedEventId}/card-reward`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({player_id,card_id,note})
    });
    qs("#eventGrantCardNote").value="";
    await loadEventAdminDetails(state.selectedEventId);
    alert(`Card "${r.card.name}" concedido com sucesso.`);
  }catch(e){alert(e.message)}
});

qs("#eventRegisterActionBtn").addEventListener("click",async()=>{
  const player_id=Number(qs("#eventActionPlayer").value),action_id=Number(qs("#eventActionForPlayer").value),note=qs("#eventActionNote").value.trim();
  try{await adminApi(`/api/admin/events/${state.selectedEventId}/action`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({player_id,action_id,note})});qs("#eventActionNote").value="";await loadEventAdminDetails(state.selectedEventId);alert("Pontos registrados.")}catch(e){alert(e.message)}
});

qs("#articleForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target).entries());
  b.published=qs("#articlePublished").checked?1:0;
  try{
    if(b.id){
      await adminApi(`/api/admin/articles/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    }else{
      await adminApi("/api/admin/articles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    }
    resetArticleForm();await loadAdminArticles();alert("Matéria salva com sucesso.");
  }catch(ex){qs("#articleError").textContent=ex.message}
});
qs("#articleCancelBtn").addEventListener("click",resetArticleForm);
qs("#editorEditionSelect").addEventListener("change",e=>loadEditionComposition(Number(e.target.value)));
qs("#saveEditionCompositionBtn").addEventListener("click",saveEditionComposition);
qsa(".journal-editor-tab").forEach(tab=>{
  tab.onclick=()=>{
    qsa(".journal-editor-tab").forEach(x=>x.classList.toggle("active",x===tab));
    qsa("[data-editor-panel]").forEach(x=>x.classList.toggle("active",x.dataset.editorPanel===tab.dataset.editorTab));
  };
});

qs("#announcementForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target).entries());
  b.featured=qs("#announcementFeatured").checked?1:0;
  b.published=qs("#announcementPublished").checked?1:0;

  try{
    if(b.id){
      await adminApi(`/api/admin/announcements/${b.id}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(b)
      });
    }else{
      await adminApi("/api/admin/announcements",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(b)
      });
    }
    resetAnnouncementForm();
    await loadAdminAnnouncements();
    await loadAnnouncements();
    await loadHome();
    alert("Comunicado salvo com sucesso.");
  }catch(ex){
    qs("#announcementError").textContent=ex.message;
  }
});

qs("#cardForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target).entries());
  b.active=qs("#cardActive").checked?1:0;
  try{
    if(b.id)await adminApi(`/api/admin/cards/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    else await adminApi("/api/admin/cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    resetCardForm();await loadAdminCards();
    if(state.selectedPlayer)await selectAdminPlayer(state.selectedPlayer.id);
    alert("Card salvo com sucesso.");
  }catch(ex){qs("#cardError").textContent=ex.message}
});
qs("#cardCancelBtn").addEventListener("click",resetCardForm);

qs("#announcementCancelBtn").addEventListener("click",resetAnnouncementForm);

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
