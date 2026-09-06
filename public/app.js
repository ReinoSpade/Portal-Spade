function displayPlayerName(player){
  return String(player?.nick||"").trim() || "Jogador";
}

const state={page:"home",me:null,grimoireData:null,grimoirePages:[],ambient:{effects:true,sound:false,theme:"home"},admin:false,adminUser:null,adminKey:null,adminPermissions:{},players:[],selectedPlayer:null,selectedPlayers:new Set(),playerImport:{file:null,preview:null},adminFilters:{house:"",patent:"",role:"",visibility:"",status:"",sort:"nick"},playerCards:[],adminCards:[],cardFilter:"",cardSearch:"",events:[],adminEvents:[],selectedEventId:null,schedule:[],adminSchedule:[],statusBoard:[],todayStatus:null,editorialOverview:null,missions:[],adminMissions:[],activeActivities:[],libraryItems:[],adminLibrary:[],rankingBattles:[],rankingPlayers:[],adminAudit:[],allies:[],selectedAllyId:null,allyCards:[],expRules:[]};

const qs=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const money=v=>Number(v||0).toLocaleString("pt-BR");

const AMBIENT_TRACKS={
  home:"/assets/audio/spade-home.ogg",
  guide:"/assets/audio/spade-guide.ogg",
  grimoire:"/assets/audio/spade-grimoire.ogg",
  battle:"/assets/audio/spade-battle.ogg",
  journal:"/assets/audio/spade-journal.ogg",
  market:"/assets/audio/spade-market.ogg"
};
const PAGE_THEME={home:"home",guia:"guide",grimorio:"grimoire",biblioteca:"grimoire",jornal:"journal",comunicados:"journal",cards:"battle",missoes:"battle",eventos:"battle",cronograma:"battle",ranking:"battle",casas:"home",jogadores:"home",status:"home",cargos:"home",hierarquia:"home",admin:"home",
  "admin-login":"home"};
function setAmbientTheme(page){
  state.ambient.theme=PAGE_THEME[page]||"home";
  document.body.dataset.ambientTheme=state.ambient.theme;
  if(state.ambient.sound) playAmbientTheme();
}
async function playAmbientTheme(){
  const audio=qs("#ambientAudio"); if(!audio||!state.ambient.sound)return;
  const src=AMBIENT_TRACKS[state.ambient.theme]||AMBIENT_TRACKS.home;
  if(!audio.src.endsWith(src)){audio.src=src;audio.load();}
  audio.volume=.18;
  try{await audio.play();}catch{}
}
function updateAmbientButtons(){
  const eb=qs("#ambientEffectsBtn"),sb=qs("#ambientSoundBtn");
  if(eb){eb.textContent=state.ambient.effects?"✨ Efeitos ON":"✨ Efeitos OFF";eb.setAttribute("aria-pressed",String(state.ambient.effects));}
  if(sb){sb.textContent=state.ambient.sound?"🔊 Som ON":"🔊 Som OFF";sb.setAttribute("aria-pressed",String(state.ambient.sound));}
  document.body.classList.toggle("magic-effects-off",!state.ambient.effects);
}
function initSpadeAmbient(){
  try{state.ambient.effects=localStorage.getItem("spade-effects")!=="0";state.ambient.sound=localStorage.getItem("spade-sound")==="1";}catch{}
  updateAmbientButtons();
  qs("#ambientEffectsBtn")?.addEventListener("click",()=>{state.ambient.effects=!state.ambient.effects;try{localStorage.setItem("spade-effects",state.ambient.effects?"1":"0")}catch{};updateAmbientButtons();});
  qs("#ambientSoundBtn")?.addEventListener("click",()=>{state.ambient.sound=!state.ambient.sound;try{localStorage.setItem("spade-sound",state.ambient.sound?"1":"0")}catch{};updateAmbientButtons();if(state.ambient.sound)playAmbientTheme();else qs("#ambientAudio")?.pause();});
}
function runPageTransition(){
  const el=qs("#pageTransition"); if(!el||!state.ambient.effects||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  el.classList.remove("show");void el.offsetWidth;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),520);
}


let globalSearchTimer=null;
let globalSearchAbort=null;
function closeGlobalSearch(){const box=qs("#globalSearchResults");if(box){box.hidden=true;box.innerHTML="";}}
function searchResultIcon(kind){return {player:'👤',house:'🏰',event:'🎪',mission:'⚔️',schedule:'📅',article:'📰',library:'📚',card:'🃏'}[kind]||'•';}
function renderGlobalSearchResults(data){
  const box=qs("#globalSearchResults"); if(!box)return;
  const results=data?.results||[];
  if(!results.length){box.innerHTML='<div class="global-search-empty">Nenhum resultado encontrado.</div>';box.hidden=false;return;}
  const labels={player:'Jogador',house:'Casa',event:'Evento',mission:'Missão',schedule:'Cronograma',article:'Jornal',library:'Biblioteca',card:'Card'};
  box.innerHTML=`<div class="global-search-head"><span>RESULTADOS</span><small>${results.length} encontrado${results.length===1?'':'s'}</small></div>`+
    results.map((r,i)=>`<button type="button" class="global-search-result" data-search-kind="${escapeHtml(r.kind)}" data-search-id="${Number(r.id)||0}" data-search-page="${escapeHtml(r.page||'home')}"><span class="global-search-icon">${searchResultIcon(r.kind)}</span><span class="global-search-copy"><b>${escapeHtml(r.title)}</b><small>${escapeHtml(labels[r.kind]||'Portal')}${r.meta?` • ${escapeHtml(r.meta)}`:''}</small></span></button>`).join("");
  box.hidden=false;
}
async function performGlobalSearch(q){
  const box=qs("#globalSearchResults"); if(!box)return;
  if(globalSearchAbort)globalSearchAbort.abort();
  if(q.trim().length<2){closeGlobalSearch();return;}
  globalSearchAbort=new AbortController();
  box.innerHTML='<div class="global-search-loading">Pesquisando...</div>';box.hidden=false;
  try{
    const d=await api(`/api/search?q=${encodeURIComponent(q.trim())}`,{signal:globalSearchAbort.signal});
    renderGlobalSearchResults(d);
  }catch(e){if(e.name!=='AbortError'){box.innerHTML=`<div class="global-search-empty">${escapeHtml(e.message)}</div>`;box.hidden=false;}}
}
function initGlobalSearch(){
  const input=qs("#globalSearchInput"); if(!input)return;
  input.addEventListener('input',()=>{clearTimeout(globalSearchTimer);globalSearchTimer=setTimeout(()=>performGlobalSearch(input.value),180);});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.blur();closeGlobalSearch();}if(e.key==='Enter'){const first=qs('#globalSearchResults .global-search-result');if(first){e.preventDefault();first.click();}}});
  document.addEventListener('click',e=>{if(!e.target.closest('#globalSearchWrap'))closeGlobalSearch();});
  document.addEventListener('click',e=>{const r=e.target.closest('[data-search-page]');if(!r)return;const kind=r.dataset.searchKind,id=Number(r.dataset.searchId||0);closeGlobalSearch();input.value='';
    if(kind==='player'&&id)return openPublicPlayer(id);
    if(kind==='house'&&id)return openHouse(id);
    if(kind==='event'&&id)return openPublicEvent(id);
    if(kind==='library'){go('biblioteca');const s=qs('#librarySearch');if(s){s.value=r.querySelector('b')?.textContent||'';loadLibrary();}return;}
    if(kind==='article'){go('jornal');return;}
    if(kind==='mission'){go('missoes');const s=qs('#missionSearch');if(s){s.value=(r.querySelector('b')?.textContent||'').replace(/^Missão de /,'');s.dispatchEvent(new Event('input'));}return;}
    if(kind==='schedule'){go('cronograma');const s=qs('#scheduleSearch');if(s){s.value=r.querySelector('b')?.textContent||'';s.dispatchEvent(new Event('input'));}return;}
    if(kind==='card'){go('cards');const s=qs('#playerCardSearch');if(s){s.value=r.querySelector('b')?.textContent||'';s.dispatchEvent(new Event('input'));}return;}
    go(r.dataset.searchPage||'home');
  });
}

function go(page){
  const previous=state.page;
  if(page==="grimorio" && (!state.me || state.me.account_type==="ALLY" || !String(state.me.grimoire||"").trim())){ if(previous!==page) go("dashboard"); return; }
  runPageTransition();
  state.page=page;
  setAmbientTheme(page);
  qsa(".page").forEach(x=>x.classList.toggle("active",x.id===page));
  qsa("nav button[data-page]").forEach(x=>{
    const active=x.dataset.page===page;
    x.classList.toggle("active",active);
    if(active) x.setAttribute("aria-current","page"); else x.removeAttribute("aria-current");
  });
  qs("#nav")?.classList.remove("open");
  qs("#globalSearchResults")?.setAttribute("hidden","");
  if(previous!==page) window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  if(page==="home") loadHome();
  if(page==="jornal") loadEditions();
  if(page==="notificacoes") loadNotifications();
  if(page==="comunicados") loadAnnouncements();
  if(page==="status") { if(state.me) loadStatusBoard(); else { state.page="login"; return go("login"); } }
  if(page==="eventos") loadEvents();
  if(page==="missoes") loadMissions();
  if(page==="cronograma") loadSchedule();
  if(page==="jogadores") loadPlayers();
  if(page==="casas") loadHouses();
  if(page==="ranking") loadRanking();
  if(page==="hierarquia") loadHierarchy();
  if(page==="biblioteca") loadLibrary();
  if(page==="dashboard"){ if(state.me) loadPlayerDashboardData(); else refreshDashboard(); }
  if(page==="grimorio"){ if(state.me) loadMyGrimoire(); else go("login"); }
  if(page==="cards"){ if(state.me) loadPlayerCards(); else { state.page="login"; return go("login"); } }
  if(page==="admin"){ if(state.admin) initAdmin(); else go("admin-login"); }
  if(page==="admin-login") refreshAdminSession();
}

qsa("[data-page]").forEach(el=>el.addEventListener("click",()=>go(el.dataset.page)));
qs("#hamb").addEventListener("click",()=>qs("#nav").classList.toggle("open"));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){qs("#nav")?.classList.remove("open");qs("#globalSearchResults")?.setAttribute("hidden","");qs("#globalSearchInput")?.blur();}});


function initGuideNavigation(){
  qsa('[data-guide-scroll]').forEach(btn=>btn.addEventListener('click',()=>{
    const target=qs(`#${btn.dataset.guideScroll}`);
    if(target) target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }));
}
async function api(url,options={}){
  options.credentials="same-origin";
  const r=await fetch(url,options);let d={};
  try{d=await r.json()}catch{}
  if(!r.ok)throw new Error(d.error||"Ocorreu um erro.");
  return d;
}

async function loadHome(){
  try{
    const [d,active]=await Promise.all([api("/api/home"),api("/api/active-activities")]);state.data=d;state.activeActivities=active.activities||[];renderHomeAnnouncements(d.announcements||[]);renderHomeActiveActivities(state.activeActivities);
    qs("#newsGrid").innerHTML=d.news.length?d.news.map((n,i)=>`<article class="news-card ${i===0?"featured":""}"><div class="art ${n.image_url?"has-image":""}" ${n.image_url?`style="background-image:url('${escapeHtml(n.image_url)}')"`:""}>${n.image_url?"":(i===0?"♠":"◆")}</div><div><span class="tag">${escapeHtml(n.category)}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.excerpt)}</p></div></article>`).join(""):`<div class="panel"><h3>Nenhuma notícia publicada</h3><p>Use o painel administrativo para publicar a primeira.</p></div>`;
    const e=d.editions[0];qs("#editionTitle").textContent=e?e.title:"Nenhuma edição publicada";qs("#editionDesc").textContent=e?e.description:"Adicione uma edição pelo painel administrativo.";
  }catch(e){qs("#newsGrid").innerHTML=`<div class="panel"><h3>Erro ao carregar</h3><p>${escapeHtml(e.message)}</p></div>`}
}

async function loadLibrary(){
  try{const params=new URLSearchParams();const q=qs("#librarySearch")?.value.trim();const cat=qs("#libraryCategory")?.value;if(q)params.set("q",q);if(cat)params.set("category",cat);const d=await api(`/api/library?${params.toString()}`);state.libraryItems=d.items||[];renderLibrary(state.libraryItems);populateLibraryCategories(state.libraryItems);}
  catch(e){const el=qs("#libraryGrid");if(el)el.innerHTML=`<div class="panel"><h3>Não foi possível carregar a Biblioteca.</h3><p>${escapeHtml(e.message)}</p></div>`;}
}
function populateLibraryCategories(items){const sel=qs("#libraryCategory");if(!sel)return;const current=sel.value;const cats=[...new Set((items||[]).map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));sel.innerHTML='<option value="">Todas as categorias</option>'+cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");if(cats.includes(current))sel.value=current;}
function renderLibrary(items){const el=qs("#libraryGrid");if(!el)return;el.innerHTML=(items||[]).length?(items||[]).map(x=>`<article class="library-card"><div class="library-icon">${escapeHtml(x.icon||"📚")}</div><span class="tag">${escapeHtml(x.category||"GERAL")}</span><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description||"")}</p><div class="library-actions">${x.content?`<button class="outline dark-outline small" type="button" data-library-read="${x.id}">Ler no Portal</button>`:""}${x.url?`<a class="gold small library-link" href="${escapeHtml(x.url)}" target="_blank" rel="noopener">Abrir material</a>`:""}</div></article>`).join(""): '<div class="panel"><h3>Nenhum material encontrado.</h3><p>A Biblioteca será alimentada pela Administração.</p></div>';qsa("[data-library-read]").forEach(b=>b.onclick=()=>{const x=state.libraryItems.find(i=>Number(i.id)===Number(b.dataset.libraryRead));if(!x)return;openLibraryReader(x);});}
function openLibraryReader(x){let modal=qs("#libraryReaderModal");if(!modal){modal=document.createElement("div");modal.id="libraryReaderModal";modal.className="modal-overlay";document.body.appendChild(modal);}modal.innerHTML=`<div class="modal-card library-reader"><button class="modal-close" type="button" id="libraryReaderClose">×</button><p class="eyebrow">${escapeHtml(x.category||"BIBLIOTECA")}</p><h2>${escapeHtml(x.title)}</h2><p class="library-reader-desc">${escapeHtml(x.description||"")}</p><div class="library-reader-content">${escapeHtml(x.content||"").replace(/\n/g,"<br>")}</div>${x.url?`<a class="gold small" href="${escapeHtml(x.url)}" target="_blank" rel="noopener">Abrir material original</a>`:""}</div>`;modal.classList.add("open");qs("#libraryReaderClose").onclick=()=>modal.classList.remove("open");modal.onclick=e=>{if(e.target===modal)modal.classList.remove("open")};}

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

function renderHomeActiveActivities(items){
  const el=qs("#homeActiveActivities");if(!el)return;
  const arr=(items||[]).slice(0,6);
  el.innerHTML=arr.length?`<div class="home-active-wrap"><div class="section-head"><div><p class="eyebrow">♠️ ATIVIDADE OFICIAL</p><h2>Acontecendo agora</h2></div><button class="outline dark-outline" data-page="cronograma">Ver cronograma</button></div><div class="home-active-grid">${arr.map(a=>{const icon=a.source==='MISSION'?'⚔️':a.source==='EVENT'?'🎪':'📅',label=a.source==='MISSION'?'MISSÃO':a.source==='EVENT'?'EVENTO':'CRONOGRAMA',end=a.end_label||a.end_time?String(a.end_time||a.end_label||''):'',action=a.source==='EVENT'?`<button class="gold small" data-home-open-event="${Number(a.event_id||a.id)}">Ver evento</button>`:a.source==='MISSION'?`<button class="gold small" data-page="missoes">Ver missão</button>`:`<button class="gold small" data-page="cronograma">Ver atividade</button>`;return `<article class="home-active-card"><span class="tag">${icon} ${label} • ACONTECENDO AGORA</span><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.description||a.activity_type||'Atividade oficial')}</p>${end?`<small>Encerramento: <b>${escapeHtml(end)}</b></small>`:''}${action}</article>`}).join('')}</div></div>`:"";
  qsa('[data-home-open-event]').forEach(b=>b.onclick=()=>openPublicEvent(Number(b.dataset.homeOpenEvent)));
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

function statusDateLabel(value){
  const str=String(value||"").slice(0,10);
  const [y,m,d]=str.split("-");
  return y&&m&&d?`${d}/${m}/${y}`:"";
}
function statusDateHuman(value){
  const str=String(value||"").slice(0,10);
  const [y,m,d]=str.split("-");
  if(!y)return "";
  const dt=new Date(Number(y),Number(m)-1,Number(d));
  const today=new Date();
  today.setHours(0,0,0,0);
  dt.setHours(0,0,0,0);
  const diff=Math.round((today-dt)/86400000);
  if(diff===0)return "Hoje";
  if(diff===1)return "Ontem";
  return statusDateLabel(value);
}
async function loadTodayStatus(){
  if(!state.me)return;
  try{
    const d=await api("/api/me/status/today");
    state.todayStatus=d.status||null;
    const box=qs("#playerStatusMessage"),date=qs("#playerStatusDate");
    if(box)box.value=state.todayStatus?.message||"";
    if(date)date.textContent=state.todayStatus?"Status de hoje":"Ainda não publicado";
    updateStatusCounter();
  }catch(e){console.error(e)}
}
function updateStatusCounter(){
  const box=qs("#playerStatusMessage"),count=qs("#playerStatusCount");
  if(count)count.textContent=String((box?.value||"").length);
}
async function publishPlayerStatus(){
  if(state.me?.account_type==="ALLY") return;
  const box=qs("#playerStatusMessage"),err=qs("#playerStatusError");
  const message=(box?.value||"").trim();
  if(!message){if(err)err.textContent="Escreva uma mensagem antes de publicar.";return}
  if(message.length>280){if(err)err.textContent="O status pode ter no máximo 280 caracteres.";return}
  if(err)err.textContent="Publicando...";
  try{
    const d=await api("/api/me/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});
    state.todayStatus=d.status||null;
    if(err)err.textContent="Status publicado.";
    qs("#playerStatusDate").textContent="Status de hoje";
    await loadStatusBoard();
    setTimeout(()=>{if(qs("#playerStatusError"))qs("#playerStatusError").textContent=""},1200);
  }catch(e){if(err)err.textContent=e.message}
}
async function loadStatusBoard(){
  const board=qs("#statusBoard");if(board)board.innerHTML=`<div class="panel"><p>Carregando mural...</p></div>`;
  try{
    const d=await api("/api/status-board?days=7");
    state.statusBoard=d.statuses||[];
    renderStatusBoard(state.statusBoard);
  }catch(e){
    if(board)board.innerHTML=`<div class="panel"><p>${escapeHtml(e.message)}</p></div>`;
  }
}
function renderStatusBoard(items){
  const board=qs("#statusBoard");if(!board)return;
  board.innerHTML=items.length?items.map(x=>`<article class="status-post ${x.mine?"mine":""}">
    <div class="status-avatar">♠</div>
    <div class="status-body">
      <div class="status-post-head"><div><b>${escapeHtml(x.nick)}</b><small>${escapeHtml(x.house||"Sem Casa")}${x.patent?` • ${escapeHtml(x.patent)}`:""}</small></div><time>${escapeHtml(statusDateHuman(x.status_date))}</time></div>
      <p>${escapeHtml(x.message)}</p>
      <div class="status-actions">
        ${state.me?.account_type==="ALLY"
          ? `<span class="status-readonly">👁️ Somente leitura</span><span>❤️ ${x.reaction_count||0}</span><button type="button" class="status-comments-toggle" data-status-comments="${x.id}">💬 ${x.comment_count||0}</button>`
          : `<button type="button" class="status-react ${x.reacted?"active":""}" data-status-react="${x.id}">❤️ <span>${x.reaction_count||0}</span></button><button type="button" class="status-comments-toggle" data-status-comments="${x.id}">💬 <span>${x.comment_count||0}</span></button>${x.mine?`<span class="status-own">Seu status</span>`:""}` }
      </div>
      <div class="status-comments" id="status-comments-${x.id}" hidden></div>
    </div>
  </article>`).join(""):`<div class="panel status-empty"><div>♠</div><h3>Nenhum status publicado</h3><p>Seja o primeiro a compartilhar algo com o Reino hoje.</p></div>`;
}
async function toggleStatusReaction(id,button){
  try{const d=await api(`/api/status/${id}/react`,{method:"POST"});button.classList.toggle("active",!!d.reacted);const span=button.querySelector("span");if(span)span.textContent=d.count;}catch(e){alert(e.message)}
}
async function toggleStatusComments(id){
  const box=qs(`#status-comments-${id}`);if(!box)return;
  if(!box.hidden){box.hidden=true;return;}
  box.hidden=false;box.innerHTML=`<div class="comments-loading">Carregando comentários...</div>`;
  try{const d=await api(`/api/status/${id}/comments`);const comments=(d.comments||[]).map(c=>`<div class="status-comment"><b>${escapeHtml(c.nick)}</b><span>${escapeHtml(c.message)}</span></div>`).join("");const form=state.me?.account_type==="ALLY"?`<div class="status-readonly-note">👁️ Você está acompanhando este mural em modo observador.</div>`:`<form class="status-comment-form" data-comment-form="${id}"><input maxlength="280" placeholder="Comente neste status..."><button class="gold small" type="submit">Enviar</button></form>`;box.innerHTML=comments+form;
  }catch(e){box.innerHTML=`<div class="comments-loading">${escapeHtml(e.message)}</div>`}
}
async function loadSchedule(){
  try{
    const d=await api("/api/schedule");
    state.schedule=d.activities||[];
    populateScheduleTypeFilter(state.schedule);
    renderSchedule(state.schedule);
  }catch(e){
    const g=qs("#scheduleGrid");if(g)g.innerHTML=`<div class="panel"><p>${escapeHtml(e.message)}</p></div>`;
  }
}
function scheduleDateLabel(value){
  if(!value)return "";
  const str=String(value).slice(0,10);
  const [y,m,d]=str.split("-");
  return [d,m,y].join("/");
}
function renderSchedule(items){
  const g=qs("#scheduleGrid");if(!g)return;
  const term=String(qs("#scheduleSearch")?.value||"").toLowerCase().trim();
  const date=qs("#scheduleDateFilter")?.value||"",type=qs("#scheduleTypeFilter")?.value||"";
  const filtered=(items||[]).filter(a=>{
    if(date&&String(a.activity_date).slice(0,10)!==date)return false;
    if(type&&a.activity_type!==type)return false;
    return !term||`${a.title} ${a.description} ${a.activity_type} ${a.location}`.toLowerCase().includes(term);
  });
  g.innerHTML=filtered.length?filtered.map(a=>`<article class="schedule-card ${a.featured?"featured":""}">
    <div class="schedule-date"><b>${escapeHtml(scheduleDateLabel(a.activity_date))}</b><small>${escapeHtml(a.start_time?String(a.start_time).slice(0,5):"")}${a.end_time?` — ${escapeHtml(String(a.end_time).slice(0,5))}`:""}</small></div>
    <div class="schedule-main"><div class="schedule-card-meta"><span>${escapeHtml(a.activity_type||"ATIVIDADE")}</span><span>${escapeHtml(a.status||"AGENDADA")}</span></div><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.description||"")}</p><small>${escapeHtml(a.location||"")}${a.event_title?` • Evento: ${escapeHtml(a.event_title)}`:""}</small>${a.link?`<a class="schedule-link" href="${escapeHtml(a.link)}" target="_blank" rel="noopener">Abrir link</a>`:""}</div>
  </article>`).join(""):`<div class="panel"><p>Nenhuma atividade encontrada.</p></div>`;
}
function populateScheduleTypeFilter(items){
  const el=qs("#scheduleTypeFilter");if(!el)return;
  const types=[...new Set((items||[]).map(x=>x.activity_type).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"pt-BR"));
  const current=el.value;
  el.innerHTML=`<option value="">Todos os tipos</option>`+types.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  if(types.includes(current))el.value=current;
}

async function loadMissions(){
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
    const rewards=(d.card_rewards||[]).map(r=>`<div class="event-reward-public"><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.category)}${e.event_type==="TEMPORADA"?` • ${r.points_cost} pontos`:""}${r.description?` • ${escapeHtml(r.description)}`:""}</small></div>${e.event_type==="TEMPORADA" && state.me?.account_type!=="ALLY"?`<button type="button" data-public-redeem="${r.card_id}">Resgatar</button>`:""}</div>`).join("")||(state.me?`<p style="font-size:10px;color:#888">Nenhum card disponível como recompensa.</p>`:`<p style="font-size:10px;color:#888">Recompensas em Cards estão visíveis somente a jogadores de Spade e Aliados.</p>`);
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
    const o=await api("/api/editorial/overview");
    state.editorialOverview=o;
    renderJournal(d.editions||[],d.news||[],o);
  }catch(e){
    const el=qs("#editions");if(el)el.innerHTML=`<div class="panel"><h3>Erro ao carregar o jornal</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}
function renderEditorialStats(o){
  const s=o?.stats||{};
  const el=qs("#editorialStats");if(!el)return;
  const cards=[["♟","Jogadores",s.players],["♜","Casas",s.houses],["⚔","Missões",s.missions],["◆","Eventos",s.events],["🃏","Cards ativos",s.cards],["🪙","Yuls em circulação",money(s.yuls)]];
  el.innerHTML=cards.map(c=>`<div class="editorial-stat"><span>${c[0]}</span><small>${c[1]}</small><b>${c[2]}</b></div>`).join("");
}
function renderEditorialHouses(o){
  const el=qs("#editorialHouses");if(!el)return;
  el.innerHTML=(o?.houses||[]).map((h,i)=>`<button class="editorial-house-row" data-open-house-editorial="${h.id}" type="button"><span class="house-rank">${String(i+1).padStart(2,"0")}</span><span class="house-row-emblem">${escapeHtml(h.emblem||"♜")}</span><span class="house-row-main"><b>${escapeHtml(h.name)}</b><small>${h.members} membros • ${h.missions} missões</small></span><strong>${money(h.yuls)} 🪙</strong></button>`).join("")||`<p style="font-size:9px;color:#888">Nenhuma Casa cadastrada.</p>`;
  qsa("[data-open-house-editorial]").forEach(b=>b.onclick=()=>{go("casas");setTimeout(()=>openHouse(Number(b.dataset.openHouseEditorial)),50)});
}
function renderEditorialVoices(o){
  const el=qs("#editorialVoices");if(!el)return;
  el.innerHTML=(o?.voices||[]).map(v=>`<blockquote class="editorial-voice"><p>“${escapeHtml(v.message)}”</p><footer>${escapeHtml(v.nick)}${v.house?` • ${escapeHtml(v.house)}`:""}</footer></blockquote>`).join("")||`<div class="journal-empty-note">O mural ainda está silencioso.</div>`;
}
function renderJournalContents(articles){
  const el=qs("#journalContents");if(!el)return;
  el.innerHTML=(articles||[]).map((a,i)=>`<button type="button" class="journal-content-item" data-open-article-index="${i}"><span>${String(i+1).padStart(2,"0")}</span><div><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.category||"RPG")}${a.author?` • ${escapeHtml(a.author)}`:""}</small></div><em>→</em></button>`).join("")||`<p style="font-size:9px;color:#888">Esta edição ainda não possui matérias.</p>`;
  qsa("[data-open-article-index]").forEach(b=>b.onclick=()=>openPublicArticle(Number(b.dataset.openArticleIndex),articles));
}
function renderJournalStories(articles){
  const el=qs("#journalStories");if(!el)return;
  const featured=(articles||[]).filter(a=>a.category!=="EDITORIAL");
  el.innerHTML=featured.slice(0,8).map((a,i)=>`<article class="journal-story-card ${i<2?"large":""}"><div class="story-number">${String(i+1).padStart(2,"0")}</div><div class="story-copy"><span class="tag">${escapeHtml(a.category||"RPG")}</span><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.excerpt||"")}</p><button type="button" class="outline small" data-story-article="${a.id}">Ler matéria</button></div></article>`).join("")||`<div class="panel"><p>Nenhuma reportagem publicada.</p></div>`;
  qsa("[data-story-article]").forEach(b=>b.onclick=()=>openPublicArticle(Number(b.dataset.storyArticle),articles));
}
function renderEditorialTimeline(){
  const items=[
    ["08 AGO","O começo","O novo Reino começa a reunir suas primeiras histórias."],
    ["10 AGO","Primeiros desafios","Missões, exames e atividades colocam os jogadores em movimento."],
    ["13 AGO","As Legiões","As primeiras forças organizadas começam a ganhar forma."],
    ["21 AGO","Primeiro grande torneio","A competição passa a escrever seus primeiros resultados."],
    ["23 AGO","Fichas e recompensas","A participação começa a alimentar o primeiro grande ciclo de trocas."],
    ["26 AGO","A Forja","Criar também passa a fazer parte da história do Reino."],
    ["31 AGO","Fim de um ciclo","Rankings e exames marcam o fechamento de agosto."],
    ["02 SET","Nova fase","Administração, cargos e estrutura apontam para o próximo capítulo."]
  ];
  const el=qs("#journalTimeline");if(!el)return;
  el.innerHTML=items.map((x,i)=>`<article class="timeline-item"><div class="timeline-dot">${String(i+1).padStart(2,"0")}</div><div class="timeline-date">${x[0]}</div><div class="timeline-copy"><h3>${x[1]}</h3><p>${x[2]}</p></div></article>`).join("");
}
function renderJournal(editions,news,o){
  const feature=qs("#journalFeature"),editionEl=qs("#editions"),newsEl=qs("#journalNews"),latest=editions?.[0];
  if(feature){
    feature.innerHTML=latest?`<div class="journal-feature-cover ${latest.cover_url?"has-image":"fallback"}" ${latest.cover_url?`style="background-image:url('${escapeHtml(latest.cover_url)}')"`:""}>${latest.cover_url?"":`<span>♠</span><small>${escapeHtml(latest.edition||"EDIÇÃO 01")}</small><b>SPADE</b>`}</div><div class="journal-feature-info"><span class="journal-issue-label">${escapeHtml(latest.edition||"EDIÇÃO 01")} • ${escapeHtml(String(latest.date||""))}</span><h2>${escapeHtml(latest.title)}</h2><p>${escapeHtml(latest.description||"")}</p><div class="actions"><button class="gold" type="button" data-journal-open-latest="${latest.id}">Ler edição</button>${latest.pdf_url?`<a class="outline" href="${escapeHtml(latest.pdf_url)}" target="_blank" rel="noopener">PDF</a>`:""}</div><div class="journal-feature-foot"><span>${Number(latest.article_count||0)} matérias</span><span>EDIÇÃO DIGITAL</span></div></div>`:`<div class="panel"><h3>O jornal ainda não possui uma edição.</h3><p>As próximas edições serão publicadas pela administração.</p></div>`;
    qs("[data-journal-open-latest]")?.addEventListener("click",()=>openPublicEdition(Number(qs("[data-journal-open-latest]").dataset.journalOpenLatest)));
  }
  // Use the current edition's article list in the index; fetch asynchronously.
  renderEditorialStats(o);renderEditorialHouses(o);renderEditorialVoices(o);renderEditorialTimeline();
  if(latest){
    api(`/api/journal/editions/${latest.id}`).then(d=>{
      renderJournalContents(d.articles||[]);renderJournalStories(d.articles||[]);
      const first=d.articles?.find(a=>a.category==="EDITORIAL")||d.articles?.[0];
      if(first){qs("#journalLetterTitle").textContent=first.title;qs("#journalLetterText").textContent=first.excerpt||first.body?.slice(0,220)||"";qs("#journalReadEditorial")?.addEventListener("click",()=>openPublicArticle(Number(first.id),d.articles));}
    }).catch(()=>{});
  }else{renderJournalContents([]);renderJournalStories([])}
  if(editionEl){
    editionEl.innerHTML=editions?.length?editions.map(e=>`<article class="edition"><div class="edition-cover ${e.cover_url?"has-image":""}" ${e.cover_url?`style="background-image:url('${escapeHtml(e.cover_url)}')"`:""}>${e.cover_url?"":`<span>♠</span><small>${escapeHtml(e.edition||"EDIÇÃO")}</small><b>SPADE</b><em>${escapeHtml(String(e.date||""))}</em>`}</div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description||"")}</p><small class="edition-card-meta">${Number(e.article_count||0)} matéria(s)</small><div class="actions"><button class="gold small journal-edition-open" type="button" data-open-edition="${e.id}">Ler edição</button>${e.pdf_url?`<a class="outline small" href="${escapeHtml(e.pdf_url)}" target="_blank" rel="noopener">PDF</a>`:""}</div></article>`).join(""):`<div class="panel"><h3>Nenhuma edição publicada.</h3></div>`;
    qsa("[data-open-edition]").forEach(b=>b.onclick=()=>openPublicEdition(Number(b.dataset.openEdition)));
  }
  if(newsEl){newsEl.innerHTML=news?.length?news.map((n,i)=>`<article class="news-card ${i===0?"featured":""}"><div class="art ${n.image_url?"has-image":""}" ${n.image_url?`style="background-image:url('${escapeHtml(n.image_url)}')"`:""}>${n.image_url?"":(i===0?"♠":"◆")}</div><div><span class="tag">${escapeHtml(n.category||"RPG")} • ${escapeHtml(String(n.date||""))}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.excerpt||"")}</p></div></article>`).join(""):`<div class="panel"><h3>Nenhuma notícia publicada.</h3></div>`}
}
function openPublicArticle(id,articles){
  let a=(articles||[]).find(x=>Number(x.id)===id);
  if(!a && Array.isArray(articles))a=(articles||[]).find(x=>Number(x.id)===Number(id));
  if(!a)return;
  let wrap=qs("#journalEditionReader");
  if(!wrap){wrap=document.createElement("div");wrap.id="journalEditionReader";wrap.className="journal-public-article-wrap";document.body.appendChild(wrap)}
  wrap.style.display="block";
  wrap.innerHTML=`<div class="journal-public-article journal-article-reader"><button class="journal-close" id="closeArticleReader">×</button><div class="journal-article-reader-head"><span class="tag">${escapeHtml(a.category||"RPG")} • ${escapeHtml(String(a.date||""))}</span><h2>${escapeHtml(a.title)}</h2>${a.subtitle?`<div class="article-subtitle">${escapeHtml(a.subtitle)}</div>`:""}<div class="article-meta">Por ${escapeHtml(a.author||"Redação")}</div></div><div class="article-body article-prose">${escapeHtml(a.body||a.excerpt||"")}</div></div>`;
  qs("#closeArticleReader").onclick=()=>wrap.style.display="none";
  wrap.onclick=e=>{if(e.target===wrap)wrap.style.display="none"};
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
        ${h.motto?`<div class="house-motto">“${escapeHtml(h.motto)}”</div>`:""}
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
      ${h.motto?`<div class="house-motto house-motto-dark">“${escapeHtml(h.motto)}”</div>`:""}
      <div class="house-institution-grid">
        <div><small>HISTÓRIA</small><p>${escapeHtml(h.history||"A história desta Casa ainda está sendo registrada no Portal.")}</p></div>
        <div><small>OBJETIVOS</small><p>${escapeHtml(h.goals||"Nenhum objetivo publicado.")}</p></div>
        <div><small>CONQUISTAS</small><p>${escapeHtml(h.achievements||"Nenhuma conquista registrada ainda.")}</p></div>
      </div>
      <div class="house-timeline"><h3>Linha do tempo</h3>${(h.timeline||[]).length?h.timeline.map(x=>`<div class="house-timeline-item"><span>${escapeHtml(x.event_date||"")}</span><div><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.event_type||"REGISTRO")}</small><p>${escapeHtml(x.description||"")}</p></div></div>`).join(""):`<p style="color:#888;font-size:10px">Ainda não há registros históricos publicados.</p>`}</div>
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
  const p=qs("#publicPatents"), r=qs("#publicHierarchyRoles"), ro=qs("#publicRolesOccupants");
  const patentHtml=(d.patents||[]).map(x=>`<article class="hierarchy-item public-patent-card" data-public-patent="${x.id}" style="cursor:pointer"><div class="role-meta"><span class="role-pill">🎖️ PATENTE</span><span class="role-pill">${Number(x.occupant_count||0)} ocupante(s)</span></div><h4>${escapeHtml(x.name)}</h4><p>${escapeHtml(x.description||"")}</p></article>`).join("")||`<div class="hierarchy-item"><p>Nenhuma patente cadastrada.</p></div>`;
  if(p)p.innerHTML=patentHtml;

  const ranks=d.ranks||[],roles=d.roles||[],rankNames={"I":"ADMINISTRAÇÃO","II":"GESTÃO","III":"COORDENAÇÃO","IV":"ESPECIALIZAÇÃO","V":"OPERACIONAL"};
  if(qs("#rankSummary"))qs("#rankSummary").innerHTML=ranks.map(x=>`<button type="button" class="rank-summary-card" data-rank-scroll="${x.code}"><b>RANK ${escapeHtml(x.code)}</b><span>${escapeHtml(rankNames[x.code]||x.name)} • ${roles.filter(r=>r.rank_code===x.code).length} cargo(s)</span></button>`).join("");
  if(qs("#publicRanks"))qs("#publicRanks").innerHTML=ranks.map(x=>`<section class="public-rank-card" id="rank-${escapeHtml(x.code)}"><div class="public-rank-code">${escapeHtml(x.code)}</div><h2>${escapeHtml(x.name)}</h2><p>${escapeHtml(x.description||"")}</p><div class="public-rank-req"><b>Requisitos do Rank:</b><br>${escapeHtml(x.requirements||"")}</div></section>`).join("");
  qsa("[data-rank-scroll]").forEach(b=>b.onclick=()=>qs("#rank-"+b.dataset.rankScroll)?.scrollIntoView({behavior:"smooth",block:"start"}));

  const rolesHtml=roles.length?roles.map(x=>`<article class="public-role-card" data-public-role="${x.id}"><div class="role-meta"><span class="role-pill">RANK ${escapeHtml(x.rank_code||"—")}</span>${x.vacancies?`<span class="role-pill">${escapeHtml(x.vacancies)}</span>`:""}<span class="role-pill">${Number(x.occupant_count||0)} ocupante(s)</span>${x.scope?`<span class="role-pill">${escapeHtml(x.scope)}</span>`:""}</div><h4>${escapeHtml(x.name)}</h4><small>${escapeHtml(x.description||"Clique para ver detalhes e ocupantes.")}</small></article>`).join(""):`<div class="hierarchy-item"><p>Nenhum cargo cadastrado.</p></div>`;
  if(r)r.innerHTML=rolesHtml;
  if(ro)ro.innerHTML=rolesHtml;
  qsa("[data-public-role]").forEach(b=>b.onclick=()=>openPublicRole(Number(b.dataset.publicRole)));
  qsa("[data-public-patent]").forEach(b=>b.onclick=()=>openPublicPatent(Number(b.dataset.publicPatent)));
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
      <div class="role-detail-block role-occupants-block"><h4>Quem ocupa este cargo</h4>${(r.occupants||[]).length?`<div class="role-occupants-list">${r.occupants.map(p=>`<div class="role-occupant"><b>${escapeHtml(p.nick)}</b><small>${escapeHtml(p.house||"Sem Casa")} • ${escapeHtml(p.patent||"Sem patente")}</small></div>`).join("")}</div>`:`<p>Nenhum ocupante público cadastrado.</p>`}</div>
    </div></div>`;
    qs("#closeRoleDetail").onclick=()=>wrap.style.display="none";wrap.onclick=e=>{if(e.target===wrap)wrap.style.display="none"};
  }catch(e){wrap.innerHTML=`<div class="role-detail"><div class="role-detail-head"><button class="journal-close" id="closeRoleDetail">×</button><h2>Erro</h2><p>${escapeHtml(e.message)}</p></div></div>`;qs("#closeRoleDetail").onclick=()=>wrap.style.display="none"}
}

async function openPublicPatent(id){
  let wrap=qs("#patentDetailReader");
  if(!wrap){wrap=document.createElement("div");wrap.id="patentDetailReader";wrap.className="role-detail-modal";document.body.appendChild(wrap)}
  wrap.style.display="block";wrap.innerHTML=`<div class="role-detail"><div class="role-detail-head"><button class="journal-close" id="closePatentDetail">×</button><h2>Carregando...</h2></div></div>`;
  try{
    const d=await api(`/api/patents/${id}`),p=d.patent;
    wrap.innerHTML=`<div class="role-detail"><div class="role-detail-head"><button class="journal-close" id="closePatentDetail">×</button><div class="role-meta"><span class="role-pill">🎖️ PATENTE</span><span class="role-pill">${(p.occupants||[]).length} ocupante(s)</span></div><h2>${escapeHtml(p.name)}</h2><p>${escapeHtml(p.description||"")}</p></div><div class="role-detail-body"><div class="role-detail-block"><h4>Descrição</h4><p>${escapeHtml(p.description||"Não informada.")}</p></div><div class="role-detail-block role-occupants-block"><h4>Quem ocupa esta patente</h4>${(p.occupants||[]).length?`<div class="role-occupants-list">${p.occupants.map(x=>`<div class="role-occupant"><b>${escapeHtml(x.nick)}</b><small>${escapeHtml(x.house||"Sem Casa")} • ${escapeHtml(x.grimoire||"Grimório não informado")}</small></div>`).join("")}`:`<p>Nenhum ocupante público cadastrado.</p>`}</div></div></div>`;
    qs("#closePatentDetail").onclick=()=>wrap.style.display="none";wrap.onclick=e=>{if(e.target===wrap)wrap.style.display="none"};
  }catch(e){wrap.innerHTML=`<div class="role-detail"><div class="role-detail-head"><button class="journal-close" id="closePatentDetail">×</button><h2>Erro</h2><p>${escapeHtml(e.message)}</p></div></div>`;qs("#closePatentDetail").onclick=()=>wrap.style.display="none"}
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
    const d=await api("/api/rankings"); rankingData=d; await renderRanking(activeRanking);
    qsa(".ranking-tab").forEach(b=>{b.onclick=async()=>{activeRanking=b.dataset.rankingTab;await renderRanking(activeRanking)}});
    await loadRankingPlayerActions();
  }catch(e){qs("#rankingBody").innerHTML=`<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;}
}

async function renderRanking(type){
  const body=qs("#rankingBody"), info=qs("#rankingExplainer"); if(!body)return;
  qsa(".ranking-tab").forEach(b=>b.classList.toggle("active",b.dataset.rankingTab===type));
  const descriptions={force:"Poder é o valor atual cadastrado para o jogador. A automação pelo catálogo de Cards será consolidada no módulo de Cards.",skill_sc:"Skill em SC é um ranking independente. Batalhas só entram no placar depois de confirmação do oponente e aprovação administrativa.",skill_vt:"Skill em VT é um ranking independente. Batalhas só entram no placar depois de confirmação do oponente e aprovação administrativa.",activity:"Atividade considera missões e conquistas registradas no sistema.",missions:"Classificação pela quantidade de missões concluídas.",wealth:"Classificação pelo saldo atual de Yuls.",houses:"Classificação das Casas pelo poder somado dos seus membros."};
  info.textContent=descriptions[type]||"";
  if(type==="houses"){const rows=rankingData.houses||[];body.innerHTML=rows.length?rows.map((h,i)=>`<tr><td><span class="rank-number">${i+1}</span></td><td><div class="house-rank-main"><span class="house-rank-emblem">${escapeHtml(h.emblem||"♜")}</span><span class="rank-main">${escapeHtml(h.name)}<small>${h.members} membros</small></span></div></td><td class="rank-house">${h.leader?`Líder: ${escapeHtml(h.leader)}`:"Sem líder definida"}</td><td class="rank-secondary">⚔️ ${h.power.toLocaleString("pt-BR")}</td><td class="rank-secondary">📋 ${h.missions}</td></tr>`).join(""):`<tr><td colspan="5">Nenhuma Casa cadastrada.</td></tr>`;return;}
  const rows=rankingData[type]||[];body.innerHTML=rows.length?rows.map((p,i)=>{let main="",secondary="";if(type==="force"){main=`⚔️ ${p.power.toLocaleString("pt-BR")}`;secondary=`📋 ${p.missions} missões`;}if(type==="skill_sc"){main=`⚔️ ${p.score.toLocaleString("pt-BR")} pontos`;secondary="Skill em SC";}if(type==="skill_vt"){main=`⚡ ${p.score.toLocaleString("pt-BR")} pontos`;secondary="Skill em VT";}if(type==="activity"){main=`⭐ ${(p.missions+p.achievements*3).toLocaleString("pt-BR")}`;secondary=`🏆 ${p.achievements} conquistas`;}if(type==="missions"){main=`📋 ${p.missions}`;secondary=`🪙 ${money(p.yuls)} Yuls`;}if(type==="wealth"){main=`🪙 ${money(p.yuls)}`;secondary=`📋 ${p.missions} missões`;}return `<tr><td><span class="rank-number">${i+1}</span></td><td><div class="rank-main">${escapeHtml(displayPlayerName(p))}<small>${escapeHtml(p.identifier)}</small></div></td><td class="rank-house">${escapeHtml(p.house||"Sem Casa")}</td><td class="rank-secondary">${main}</td><td class="rank-secondary">${secondary}</td></tr>`;}).join(""):`<tr><td colspan="5">Nenhum jogador disponível.</td></tr>`;
}

async function loadRankingPlayerActions(){
  const el=qs("#rankingPlayerActions");if(!el)return;
  if(!state.me){el.innerHTML=`<div class="ranking-note">Entre no Portal para registrar e acompanhar suas batalhas de SC e VT.</div>`;return;}
  try{const d=await api("/api/ranking-players"),b=await api("/api/me/ranking-battles");state.rankingPlayers=d.players||[];state.rankingBattles=b.battles||[];const opponents=state.rankingPlayers.filter(x=>Number(x.id)!==Number(state.me.id));el.innerHTML=`<div class="ranking-battle-box"><div><p class="eyebrow">BATALHA OFICIAL</p><h3>Registrar resultado para avaliação</h3><p>O adversário deverá confirmar. Depois, a Administração define as pontuações finais — nenhuma fórmula é presumida pelo Portal.</p></div><form id="rankingBattleForm" class="ranking-battle-form"><select id="battleType" required><option value="SC">Skill em SC</option><option value="VT">Skill em VT</option></select><select id="battleOpponent" required><option value="">Escolha o adversário</option>${opponents.map(x=>`<option value="${x.id}">${escapeHtml(x.nick)}${x.house?` — ${escapeHtml(x.house)}`:""}</option>`).join("")}</select><select id="battleResult"><option value="CHALLENGER">Vitória</option><option value="OPPONENT">Derrota</option><option value="EMPATE">Empate</option></select><input id="battleProof" placeholder="Link da prova (opcional)"><input id="battleNotes" placeholder="Observações (opcional)"><button class="gold" type="submit">⚔️ Enviar batalha</button><span class="error" id="battleError"></span></form><div class="ranking-my-battles"><b>Meus registros</b>${state.rankingBattles.slice(0,8).map(x=>`<div class="my-battle-row"><span><b>${x.ranking_type}</b> • ${escapeHtml(x.challenger_nick)} × ${escapeHtml(x.opponent_nick)}</span><small>${escapeHtml(x.status)}${x.opponent_id===state.me.id&&x.status==="AGUARDANDO_OPONENTE"?` <button type="button" data-confirm-battle="${x.id}">Confirmar</button>`:""}</small></div>`).join("")||`<small>Nenhum registro ainda.</small>`}</div></div>`;qs("#rankingBattleForm").onsubmit=async e=>{e.preventDefault();const err=qs("#battleError");err.textContent="";try{await api("/api/ranking-battles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ranking_type:qs("#battleType").value,opponent_id:Number(qs("#battleOpponent").value),result:qs("#battleResult").value,proof_url:qs("#battleProof").value,notes:qs("#battleNotes").value})});await loadRanking();}catch(ex){err.textContent=ex.message;}};qsa("[data-confirm-battle]").forEach(btn=>btn.onclick=async()=>{try{await api(`/api/ranking-battles/${btn.dataset.confirmBattle}/confirm`,{method:"POST"});await loadRanking();}catch(ex){alert(ex.message)}});
  }catch(e){el.innerHTML=`<div class="ranking-note">${escapeHtml(e.message)}</div>`;}
}

async function loadAdminRankingBattles(){const list=qs("#adminRankingBattleList");if(!list)return;try{const status=qs("#adminRankingBattleStatus")?.value||"AGUARDANDO_ADMIN";const d=await adminApi(`/api/admin/ranking-battles?status=${encodeURIComponent(status)}`);state.adminRankingBattles=d.battles||[];list.innerHTML=state.adminRankingBattles.length?state.adminRankingBattles.map(x=>`<div class="admin-battle-row"><div><b>${escapeHtml(x.ranking_type)} • ${escapeHtml(x.challenger_nick)} × ${escapeHtml(x.opponent_nick)}</b><small>${escapeHtml(x.status)} • Resultado: ${escapeHtml(x.result)} • Antes: ${x.challenger_score_before} × ${x.opponent_score_before}</small>${x.proof_url?`<a href="${escapeHtml(x.proof_url)}" target="_blank" rel="noopener">Abrir prova</a>`:""}</div>${x.status==="AGUARDANDO_ADMIN"?`<div class="admin-battle-actions"><input type="number" min="0" id="cs-${x.id}" value="${x.challenger_score_before}" placeholder="SC/VT final"><input type="number" min="0" id="os-${x.id}" value="${x.opponent_score_before}" placeholder="SC/VT final"><button class="gold small" type="button" data-approve-battle="${x.id}">Aprovar</button><button class="outline danger small" type="button" data-reject-battle="${x.id}">Rejeitar</button></div>`:`<div class="admin-battle-final">${x.challenger_score_after??"—"} × ${x.opponent_score_after??"—"}</div>`}</div>`).join(""):`<div class="admin-history-empty">Nenhum registro nesta categoria.</div>`;qsa("[data-approve-battle]").forEach(b=>b.onclick=async()=>{const id=b.dataset.approveBattle;try{await adminApi(`/api/admin/ranking-battles/${id}/approve`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challenger_score_after:Number(qs(`#cs-${id}`).value),opponent_score_after:Number(qs(`#os-${id}`).value)})});await loadAdminRankingBattles();}catch(ex){alert(ex.message)}});qsa("[data-reject-battle]").forEach(b=>b.onclick=async()=>{const reason=prompt("Motivo da rejeição:")??"";try{await adminApi(`/api/admin/ranking-battles/${b.dataset.rejectBattle}/reject`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})});await loadAdminRankingBattles();}catch(ex){alert(ex.message)}});}catch(e){list.innerHTML=`<div class="admin-history-empty">${escapeHtml(e.message)}</div>`;}}


async function loadNotifications(){
  const list=qs("#notificationList"), summary=qs("#notificationSummary"); if(!list)return;
  if(!state.me){list.innerHTML=`<div class="panel"><h3>Entre para acessar suas notificações.</h3><p>Esta central é exclusiva dos jogadores.</p></div>`;return;}
  try{const d=await api("/api/me/notifications"); const items=d.notifications||[]; const unread=Number(d.unread||0);
    if(summary)summary.textContent=`${unread} não lida${unread===1?"":"s"} • ${items.length} notificações`;
    const badge=qs("#notificationBadge"); if(badge){badge.textContent=unread;badge.style.display=unread?"inline-flex":"none";}
    list.innerHTML=items.length?items.map(n=>`<article class="notification-card ${n.read?"read":"unread"}" data-notification-id="${n.id}"><div class="notification-icon">${n.type==="URGENTE"?"🔴":n.type==="IMPORTANTE"?"🟡":n.type==="SISTEMA"?"⚙️":"🔔"}</div><div class="notification-main"><div class="notification-top"><span>${escapeHtml(n.type)}</span><small>${new Date(n.created_at).toLocaleString("pt-BR")}</small></div><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.body||"")}</p>${n.link_page?`<button class="outline small notification-link" data-notification-link="${escapeHtml(n.link_page)}">Abrir conteúdo →</button>`:""}</div>${n.read?"":`<button class="notification-read" data-read-notification="${n.id}" aria-label="Marcar como lida">✓</button>`}</article>`).join(""):"<div class='panel'><h3>Nenhuma notificação.</h3><p>Quando houver um aviso direcionado a você, ele aparecerá aqui.</p></div>";
    qsa("[data-read-notification]").forEach(b=>b.onclick=async()=>{try{await api(`/api/me/notifications/${b.dataset.readNotification}/read`,{method:"POST"});await loadNotifications();}catch(e){alert(e.message)}});
    qsa("[data-notification-link]").forEach(b=>b.onclick=()=>{const pg=b.dataset.notificationLink;if(document.querySelector(`#${pg}`))go(pg);else window.location.hash=pg;});
  }catch(e){list.innerHTML=`<div class="panel"><p>${escapeHtml(e.message)}</p></div>`;}
}

async function loadNotificationBadge(){if(!state.me)return;try{const d=await api("/api/me/notifications");const b=qs("#notificationBadge");if(b){b.textContent=Number(d.unread||0);b.style.display=d.unread?"inline-flex":"none";}}catch{}}

function playerAlertStorageKey(id){
  return `spade-alert-${state.me?.identifier||"player"}-${id}`;
}

function playerAlertDismissed(id){
  try{return localStorage.getItem(playerAlertStorageKey(String(id)))==="1"}catch{return false}
}

function dismissPlayerAlert(id){
  try{localStorage.setItem(playerAlertStorageKey(String(id)),"1")}catch{}
  const el=qsa('[data-player-alert]').find(x=>x.dataset.playerAlert===String(id));
  if(el)el.remove();
}

async function loadPlayerAlerts(){
  const wrap=qs("#playerAlerts");
  if(!wrap||!state.me)return;
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
              <a class="player-alert-link" href="#${escapeHtml(a.link_page||'comunicados')}">Ver conteúdo →</a>
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
async function loadMyGrimoire(){
  if(!state.me||state.me.account_type==="ALLY")return;
  try{
    const d=await api("/api/me/grimoire");
    state.grimoireData=d; state.grimoirePages=d.pages||[];
    if(!d.available){const g=qs("#grimoireNav");if(g)g.style.display="none";go("dashboard");return;}
    const title=qs("#grimoireTitle"),intro=qs("#grimoireIntroText"),exp=qs("#grimoireExp"),pat=qs("#grimoirePatent"),count=qs("#grimoirePageCount"),level=qs("#grimoireLevel"),progress=qs("#grimoireProgressBar"),progressLabel=qs("#grimoireProgressLabel"),progressHint=qs("#grimoireProgressHint"),pages=qs("#grimoirePages");
    if(title)title.textContent=d.grimoire||"Seu Grimório";
    if(intro)intro.textContent="Seu Grimório registra a evolução do Mago. A experiência acumulada determina o próximo avanço e, a cada nível conquistado, uma nova página pode revelar a habilidade destinada àquela etapa.";
    if(exp)exp.textContent=money(d.exp||0); if(pat)pat.textContent=d.patent||"—"; if(level)level.textContent=String(d.level||1); if(count)count.textContent=String((d.pages||[]).length);
    if(progress)progress.style.width=`${Number(d.progress_percent||0)}%`;
    if(progressLabel)progressLabel.textContent=d.next_threshold?`${money(d.exp||0)}% / ${money(d.next_threshold)}%`:`Nível ${d.level||1} alcançado`;
    if(progressHint)progressHint.textContent=d.next_threshold?`Faltam ${money(Math.max(0,Number(d.next_threshold)-Number(d.exp||0)))}% para o nível ${d.next_level}. Ao alcançar o requisito, a EXP volta a zero.`:`Não há requisito de nível superior cadastrado neste momento.`;
    if(pages){pages.innerHTML=(d.pages||[]).length?(d.pages||[]).map((pg,i)=>`<article class="grimoire-magic-page"><div class="grimoire-page-number">${String(pg.level_number).padStart(2,"0")}</div><div class="grimoire-page-copy"><span class="grimoire-kind">${pg.kind==="ATIVACAO"?"✦ ATIVAÇÃO":"✧ MAGIA EXCLUSIVA"}</span><h3>${escapeHtml(pg.magic_name)}</h3><p>${escapeHtml(pg.description||"Magia registrada nesta etapa de evolução.")}</p><small>Conquistada no nível ${pg.level_number} • Página ${i+1}</small></div></article>`).join(''):'<p class="grimoire-empty">Seu Grimório foi registrado, mas ainda não possui magias preenchidas pela Administração.</p>';}
  }catch(e){const el=qs("#grimoirePages");if(el)el.innerHTML=`<p class="grimoire-empty">${escapeHtml(e.message)}</p>`;}
}

function renderPlayerCardItem(c){
  const elemental=c.element_type==="ELEMENTAL";
  const glyph={Fogo:"🔥",Água:"💧",Vento:"🌪️",Raio:"⚡",Sombra:"🌑",Cristal:"💎",Fumaça:"💨",Estrelas:"🌟",Tempo:"⏳",Ossos:"☠️"}[c.element]||"✦";
  return `<article class="card-inventory-item ${elemental?"card-elemental":"card-non-elemental"}" data-element="${escapeHtml(c.element||"")}">
    <div class="card-magic-aura" aria-hidden="true">${elemental?glyph:"✦"}</div>
    <div class="card-inventory-top"><span class="card-type-pill">${escapeHtml(c.category)}</span><span class="card-nature-pill">${elemental?"ELEMENTAL":"NÃO ELEMENTAL"}</span></div>
    <h3>${escapeHtml(c.name_pt||c.name)}</h3>
    ${c.name_jp?`<div class="card-jp-name">${escapeHtml(c.name_jp)}</div>`:""}
    <p class="card-description">${escapeHtml(c.description||"Descrição não cadastrada.")}</p>
    <div class="card-meta-line"><span>Poder: <b>${Number(c.power_value||0)}</b></span><span>Dano: <b>${Number(c.damage_value||0)}</b> <small>${escapeHtml((c.damage_type||'SEM_DANO').replaceAll('_',' '))}</small></span><span>${escapeHtml(c.origin||"Exclusivo")}</span>${elemental&&c.element?`<span>Elemento: ${escapeHtml(c.element)}</span>`:""}</div>
    ${c.cost?`<div class="card-cost">Custo: ${escapeHtml(c.cost)} ${c.cost_type&&c.cost_type!=="SEM_CUSTO"?`(${escapeHtml(c.cost_type)})`:""}</div>`:""}
    <div class="card-acquisition">Obtido por: ${escapeHtml(acquisitionLabel(c))}</div>
  </article>`;
}
function renderPlayerCards(cards){
  const grid=qs("#playerCardsGrid"),summary=qs("#playerCardsSummary");
  if(!grid)return;
  const filtered=(cards||[]).filter(c=>{
    if(state.cardFilter && c.category!==state.cardFilter)return false;
    const term=String(state.cardSearch||"").trim().toLowerCase();
    return !term || `${c.name_pt||c.name} ${c.name_jp||""} ${c.category} ${c.element||""} ${c.origin||""} ${c.description||""} ${c.acquisition_name||""}`.toLowerCase().includes(term);
  });
  if(summary)summary.textContent=`${filtered.length} cards no inventário`;
  if(!filtered.length){
    grid.innerHTML=`<div class="cards-empty"><div style="font:28px Georgia;color:#c6a45d">♠</div><b>${(cards||[]).length?"Nenhum card corresponde ao filtro.":"Seu inventário ainda está vazio."}</b><p>${(cards||[]).length?"Tente outra categoria ou pesquisa.":"Os cards serão adicionados pela administração do RPG."}</p></div>`;
    return;
  }
  const groups={}; filtered.forEach(c=>(groups[c.category]??=[]).push(c));
  grid.innerHTML=Object.entries(groups).map(([category,items])=>`<section class="player-card-group"><div class="player-card-group-head"><h2>${escapeHtml(category)}</h2><span>${items.length} card(s)</span></div><div class="player-card-grid">${items.map(renderPlayerCardItem).join("")}</div></section>`).join("");
}

async function loadAllyCards(){
  try{
    const d=await api("/api/me/ally-cards");
    state.playerCards=d.cards||[];
    renderPlayerCardFilters(state.playerCards);
    renderPlayerCards(state.playerCards);
    const summary=qs("#playerCardsSummary"); if(summary)summary.textContent=`${state.playerCards.length} cards no inventário de aliado`;
    const sub=qs("#cards .subhero p"); if(sub)sub.textContent="Consulte os Cards concedidos a esta conta de aliado.";
  }catch(e){const grid=qs("#playerCardsGrid");if(grid)grid.innerHTML=`<div class="cards-empty">${escapeHtml(e.message)}</div>`;}
}

async function loadPlayerCards(){
  if(state.me?.account_type==="ALLY") return loadAllyCards();
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
    if(state.page==="dashboard"){ await loadPlayerDashboardData(); }
  }catch{}
}

async function refreshDashboard(){
  try{
    const d=await api("/api/me");
    state.me=d.player;
    setPlayerNav();
    await loadPlayerDashboardData();
  }catch(e){
    state.me=null;
    setLoginNav();
    go("login");
  }
}

async function loadPlayerDashboardData(){
  try{
    const d=await api("/api/me/dashboard");
    state.dashboardData=d;
    state.me=d.player||state.me;
    renderDashboard();
  }catch(e){
    if(state.page==="dashboard"){
      const el=qs("#dash");
      if(el)el.innerHTML=`<div class="panel"><h3>Não foi possível carregar seu painel.</h3><p>${escapeHtml(e.message)}</p></div>`;
    }
  }
}

function dashboardDateLabel(v){
  if(!v)return "";
  const s=String(v).slice(0,10);const [y,m,d]=s.split('-');
  return y&&m&&d?`${d}/${m}`:s;
}
function dashboardTimeLabel(v){return v?String(v).slice(0,5):"";}
function renderDashboard(){
  if(!state.me)return go("login");
  if(state.me.account_type==="ALLY") return renderAllyDashboard();
  const d=state.dashboardData||{};
  const p=d.player||state.me,c=d.cards||{},r=d.rankings||{};
  qs("#dashName").textContent=`Bem-vindo, ${displayPlayerName(p)}.`;
  const active=[...(d.activeEvents||[])].map(x=>`<article class="dashboard-live-item"><div><span class="tag">🎪 ${escapeHtml(x.event_type||"EVENTO")}</span><h4>${escapeHtml(x.title)}</h4><p>Encerramento: ${escapeHtml(dashboardDateLabel(x.end_date))}</p></div><button class="outline dark-outline small" type="button" data-dashboard-page="eventos">Ver evento</button></article>`).join("");
  const upcoming=[...(d.upcoming||[])].map(x=>`<div class="dashboard-upcoming-item"><div><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.activity_type||"ATIVIDADE")}</small></div><span>${escapeHtml(dashboardDateLabel(x.activity_date))}${x.start_time?` • ${escapeHtml(dashboardTimeLabel(x.start_time))}`:""}</span></div>`).join("");
  const notes=[...(d.notifications||[])].slice(0,3).map(n=>`<div class="dashboard-note-item ${n.read?"":"unread"}"><span class="dashboard-note-dot"></span><div><b>${escapeHtml(n.title)}</b><small>${escapeHtml(n.body||"")}</small></div></div>`).join("");
  const status=d.todayStatus?.message?`<div class="dashboard-status-preview"><small>💬 SEU STATUS DE HOJE</small><p>${escapeHtml(d.todayStatus.message)}</p><button class="text-button" type="button" data-dashboard-page="status">Ver mural</button></div>`:`<div class="dashboard-status-preview empty"><small>💬 STATUS DE HOJE</small><p>Você ainda não publicou seu status de hoje.</p><button class="gold small" type="button" data-dashboard-page="status">Publicar status</button></div>`;
  qs("#dash").innerHTML=`
    <div class="dashboard-hero-grid">
      <section class="dash-main dashboard-profile-card">
        <div class="dash-ident"><div class="avatar">♠</div><div><h2>${escapeHtml(displayPlayerName(p))}</h2><p>${escapeHtml(p.patent||"Patente não definida")} • ${escapeHtml(p.house||"Casa não definida")}</p></div></div>
        <div class="dashboard-profile-tags"><span>📜 ${escapeHtml(p.grimoire||"Grimório não definido")}</span><span>👑 ${escapeHtml((p.roles||[]).map(x=>x.name).join(" • ")||"Sem cargo")}</span></div>
        <div class="profile-lines">${String(p.grimoire||"").trim()?`<div><small>✨ EXP • Nível ${Number(p.grimoire_level||1)}</small><b>${money(p.exp||0)}%</b></div>`:""}<div><small>Conquistas</small><b>${money(p.achievements||0)}</b></div></div>
      </section>
      <section class="dash-status dashboard-resource-card"><p class="eyebrow">MEUS RECURSOS</p><div class="stats"><div class="stat"><small>❤️ HP</small><b>${money(p.hp)}</b></div><div class="stat"><small>♦️ Mana</small><b>${money(p.mana)}</b></div><div class="stat yuls"><small>🪙 Yuls</small><b>${money(p.yuls)}</b></div><div class="stat"><small>🃏 Cards</small><b>${money(c.count)}</b></div></div></section>
    </div>
    <div class="dashboard-rank-grid">
      <div class="dashboard-rank-card"><small>⚡ PODER</small><strong>#${r.power||"—"}</strong><span>${money(c.power)} de Poder</span></div>
      <div class="dashboard-rank-card"><small>⚔️ SKILL SC</small><strong>#${r.sc||"—"}</strong><span>Ranking atual</span></div>
      <div class="dashboard-rank-card"><small>🏟️ SKILL VT</small><strong>#${r.vt||"—"}</strong><span>Ranking atual</span></div>
      <div class="dashboard-rank-card"><small>💬 NOTIFICAÇÕES</small><strong>${d.unreadNotifications||0}</strong><span>não lidas</span></div>
    </div>
    <section class="dashboard-live panel">
      <div class="panel-head"><div><p class="eyebrow">ACONTECENDO AGORA</p><h3>O Reino está em movimento</h3></div><button class="text-button" type="button" data-dashboard-page="cronograma">Ver cronograma</button></div>
      <div class="dashboard-live-list">${(d.activeActivities||[]).map(x=>`<article class="dashboard-live-item"><div><span class="tag">${x.source==='MISSION'?'⚔️ MISSÃO':x.source==='EVENT'?'🎪 EVENTO':'📅 CRONOGRAMA'}</span><h4>${escapeHtml(x.title)}</h4><p>${escapeHtml(x.end_label||x.description||'Em andamento')}</p></div>${x.source==='EVENT'?`<button class="outline dark-outline small" type="button" data-dashboard-event="${Number(x.event_id||x.id)}">Ver evento</button>`:`<button class="outline dark-outline small" type="button" data-dashboard-page="${x.source==='MISSION'?'missoes':'cronograma'}">Acompanhar</button>`}</article>`).join('')||`<div class="dashboard-empty-state"><span>✦</span><div><b>Nenhuma atividade ativa agora.</b><p>Você pode conferir as próximas atividades no cronograma.</p></div></div>`}</div>
    </section>
    <div class="dashboard-two-col">
      <section class="panel"><div class="panel-head"><div><p class="eyebrow">PRÓXIMOS</p><h3>Agenda pessoal</h3></div><button class="text-button" type="button" data-dashboard-page="cronograma">Tudo</button></div><div class="dashboard-upcoming-list">${upcoming||`<div class="dashboard-empty-state"><span>📅</span><div><b>Sem próximas atividades.</b><p>O calendário será atualizado pela Administração.</p></div></div>`}</div></section>
      <section class="panel"><div class="panel-head"><div><p class="eyebrow">ATENÇÃO</p><h3>Notificações</h3></div><button class="text-button" type="button" data-dashboard-page="notificacoes">Ver todas</button></div><div class="dashboard-note-list">${notes||`<div class="dashboard-empty-state"><span>✓</span><div><b>Tudo em ordem.</b><p>Nenhuma notificação recente.</p></div></div>`}</div></section>
    </div>
    ${status}
    <div class="panel" style="margin-top:12px"><p class="eyebrow">ATIVIDADE</p><h3>${money(p.missions||0)} missões registradas</h3><p>Seu painel reúne sua situação atual e os atalhos para o que importa no Reino.</p></div>`;
  qsa('[data-dashboard-page]').forEach(b=>b.onclick=()=>go(b.dataset.dashboardPage));
  qsa('[data-dashboard-event]').forEach(b=>b.onclick=()=>openPublicEvent(Number(b.dataset.dashboardEvent)));
  loadPlayerYuls();loadPlayerMissions();loadPlayerAlerts();loadTodayStatus();
}

function renderAllyDashboard(){
  const d=state.dashboardData||{}; const p=d.player||state.me, c=d.cards||{};
  qs("#dashboardEyebrow").textContent="PAINEL DO ALIADO";
  qs("#dashboardDescription").textContent="Acompanhe Spade em modo observador: conteúdo liberado, sem interações.";
  const badge=qs("#allyModeBadge"); if(badge)badge.hidden=false;
  qs("#dashName").textContent=`Bem-vindo, ${displayPlayerName(p)}.`;
  const active=(d.activeEvents||[]).map(x=>`<article class="dashboard-live-item"><div><span class="tag">🎪 ${escapeHtml(x.event_type||"EVENTO")}</span><h4>${escapeHtml(x.title)}</h4><p>Encerramento: ${escapeHtml(dashboardDateLabel(x.end_date))}</p></div><button class="outline dark-outline small" type="button" data-dashboard-page="eventos">Ver evento</button></article>`).join("");
  const upcoming=(d.upcoming||[]).map(x=>`<div class="dashboard-upcoming-item"><div><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.activity_type||"ATIVIDADE")}</small></div><span>${escapeHtml(dashboardDateLabel(x.activity_date))}${x.start_time?` • ${escapeHtml(dashboardTimeLabel(x.start_time))}`:""}</span></div>`).join("");
  qs("#dash").innerHTML=`
    <div class="dashboard-hero-grid">
      <section class="dash-main dashboard-profile-card ally-profile-card">
        <div class="dash-ident"><div class="avatar">🤝</div><div><h2>${escapeHtml(displayPlayerName(p))}</h2><p>${escapeHtml(p.origin_kingdom||"Reino aliado não informado")} • ${escapeHtml(p.origin_house||"Casa não informada")}</p></div></div>
        <div class="dashboard-profile-tags"><span>🤝 Aliado Oculto</span><span>👁️ Somente leitura</span>${p.patent?`<span>🎖️ ${escapeHtml(p.patent)}</span>`:""}${p.role?`<span>💼 ${escapeHtml(p.role)}</span>`:""}</div>
        <div class="profile-lines"><div><small>CARDS</small><b>${money(c.count)}</b></div><div><small>PODER DOS CARDS</small><b>${money(c.power)}</b></div></div>
      </section>
      <section class="dash-status dashboard-resource-card"><p class="eyebrow">ACESSO</p><div class="ally-access-copy"><b>Modo observador</b><p>Você pode acompanhar o Reino Spade, consultar seu inventário e ler o mural. Publicações e interações estão desabilitadas.</p></div></section>
    </div>
    <div class="dashboard-rank-grid">
      <div class="dashboard-rank-card"><small>🃏 MEUS CARDS</small><strong>${money(c.count)}</strong><span>Cards em seu inventário</span></div>
      <div class="dashboard-rank-card"><small>⚡ PODER DOS CARDS</small><strong>${money(c.power)}</strong><span>valor acumulado</span></div>
      <div class="dashboard-rank-card"><small>🎪 EVENTOS ATIVOS</small><strong>${(d.activeEvents||[]).length}</strong><span>para acompanhar</span></div>
      <div class="dashboard-rank-card"><small>📅 PRÓXIMAS ATIVIDADES</small><strong>${(d.upcoming||[]).length}</strong><span>no cronograma</span></div>
    </div>
    <section class="dashboard-live panel"><div class="panel-head"><div><p class="eyebrow">ACONTECENDO AGORA</p><h3>O Reino está em movimento</h3></div><button class="text-button" type="button" data-dashboard-page="cronograma">Ver cronograma</button></div><div class="dashboard-live-list">${active||`<div class="dashboard-empty-state"><span>✦</span><div><b>Nenhum evento ativo agora.</b><p>Você pode acompanhar as próximas atividades no cronograma.</p></div></div>`}</div></section>
    <div class="dashboard-two-col"><section class="panel"><div class="panel-head"><div><p class="eyebrow">PRÓXIMOS</p><h3>Agenda do Reino</h3></div><button class="text-button" type="button" data-dashboard-page="cronograma">Tudo</button></div><div class="dashboard-upcoming-list">${upcoming||`<div class="dashboard-empty-state"><span>📅</span><div><b>Sem próximas atividades.</b><p>O calendário será atualizado pela Administração.</p></div></div>`}</div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">💬 COMUNIDADE</p><h3>Status de Spade</h3></div><button class="text-button" type="button" data-dashboard-page="status">Ver mural</button></div><div class="dashboard-empty-state"><span>👁️</span><div><b>Acompanhamento em modo observador.</b><p>Leia os Status e comentários sem publicar, reagir ou comentar.</p></div></div></section></div>`;
  qsa('[data-dashboard-page]').forEach(b=>b.onclick=()=>go(b.dataset.dashboardPage));
  loadAllyCards();
}

async function tryMe(){
  try{
    const d=await api("/api/me");state.me=d.player;setPlayerNav();
  }catch{}
}
function setViewerModeUI(){
  const ally=state.me?.account_type==="ALLY";
  [".player-yuls-section",".player-missions-section",".player-status-section",".player-sheet-section"].forEach(sel=>qsa(sel).forEach(el=>el.style.display=ally?"none":""));
  const eyebrow=qs("#dashboardEyebrow"),desc=qs("#dashboardDescription");
  if(ally){if(eyebrow)eyebrow.textContent="PAINEL DO ALIADO";if(desc)desc.textContent="Acompanhe Spade em modo observador: conteúdo liberado, sem interações.";}
  const statusDesc=qs("#status .subhero p:last-child");
  if(statusDesc)statusDesc.textContent=ally?"Acompanhe os Status do Reino. Aliados Ocultos possuem acesso somente para leitura.":"Compartilhe uma mensagem por dia e acompanhe o que seus companheiros estão fazendo.";
}
function setPlayerNav(){const b=qs("#loginNav");b.textContent="Meu painel";b.dataset.page="dashboard";b.onclick=()=>go("dashboard");const c=qs("#cardsNav");if(c)c.style.display="inline-flex";const g=qs("#grimoireNav");if(g)g.style.display=(state.me?.account_type!=="ALLY"&&String(state.me?.grimoire||"").trim())?"inline-flex":"none";const badge=qs("#allyModeBadge");if(badge)badge.hidden=state.me?.account_type!=="ALLY";setViewerModeUI();}
function setLoginNav(){const b=qs("#loginNav");b.textContent="Entrar";b.dataset.page="login";b.onclick=()=>go("login");const c=qs("#cardsNav");if(c)c.style.display="none";const g=qs("#grimoireNav");if(g)g.style.display="none";const badge=qs("#allyModeBadge");if(badge)badge.hidden=true;setViewerModeUI();}

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

async function logoutPlayer(){
  const b=qs("#playerLogoutBtn");
  if(b) b.disabled=true;
  try{await api("/api/logout",{method:"POST"});}
  catch(e){ if(b) b.disabled=false; alert(e.message||"Não foi possível sair do painel."); return; }
  state.me=null; state.dashboardData=null; state.page="home";
  setLoginNav();
  go("home");
}

qs("#playerStatusMessage")?.addEventListener("input",updateStatusCounter);
qs("#playerStatusPublishBtn")?.addEventListener("click",publishPlayerStatus);
qs("#playerLogoutBtn")?.addEventListener("click",logoutPlayer);

qs("#statusRefreshBtn")?.addEventListener("click",loadStatusBoard);
qs("#playerCardSearch")?.addEventListener("input",e=>{state.cardSearch=e.target.value;renderPlayerCards(state.playerCards)});
qs("#playerCardCategoryFilter")?.addEventListener("change",e=>{state.cardFilter=e.target.value;renderPlayerCards(state.playerCards)});
document.addEventListener("click",e=>{
  const react=e.target.closest("[data-status-react]"); if(react){toggleStatusReaction(Number(react.dataset.statusReact),react);return;}
  const comments=e.target.closest("[data-status-comments]"); if(comments){toggleStatusComments(Number(comments.dataset.statusComments));return;}
});
document.addEventListener("submit",async e=>{
  const form=e.target.closest("[data-comment-form]"); if(!form)return; e.preventDefault();
  const id=Number(form.dataset.commentForm),input=form.querySelector("input"),message=(input?.value||"").trim(); if(!message)return;
  try{await api(`/api/status/${id}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})}); await toggleStatusComments(id);}
  catch(ex){alert(ex.message)}
});

qs("#adminRankingRefresh")?.addEventListener("click",loadAdminRankingBattles);qs("#adminReportsRefresh")?.addEventListener("click",loadAdminReports);qs("#adminRankingBattleStatus")?.addEventListener("change",loadAdminRankingBattles);
qs("#backToDashboard")?.addEventListener("click",()=>go("dashboard"));

function getStoredAdminKey(){
  try{return sessionStorage.getItem("spade_admin_key")||""}catch{return ""}
}
function storeAdminKey(key){
  try{sessionStorage.setItem("spade_admin_key",key)}catch{}
}
function clearStoredAdminKey(){
  try{sessionStorage.removeItem("spade_admin_key")}catch{}
}
async function adminApi(url,options={}){
  const key=state.adminKey||getStoredAdminKey();
  state.adminKey=key;
  options.headers={...(options.headers||{})};
  if(key) options.headers["x-admin-key"]=key;
  return api(url,options);
}

function hasAdminPermission(key){ return state.adminPermissions?.[key] === true || state.adminUser?.legacy === true; }
function setAdminPermissionVisibility(){
  const map={dashboard:["#adminStats"],players:[".admin-toolbar-v2",".bulk-toolbar",".admin-layout",".player-import-modal"],houses:[".admin-house-panel"],hierarchy:[".admin-hierarchy-panel"],cards:[".admin-card-catalog"],announcements:[".admin-announcement-panel"],schedule:[".admin-schedule-manager"],events:[".admin-event-manager"],missions:[".admin-mission-manager"],journal:[".journal-admin-editor"],admin_users:[".admin-users-panel","#adminPermissionsPanel"],library:["#adminLibraryPanel"],rankings:["#adminRankingPanel"],economy:["#adminEconomyPanel"],notifications:["#adminNotificationPanel"],allies:["#adminAlliesPanel"],audit:["#adminAuditPanel"],settings:["#adminSettingsPanel"]};
  Object.entries(map).forEach(([perm,selectors])=>selectors.forEach(sel=>qsa(sel).forEach(el=>el.style.display=hasAdminPermission(perm)?"":"none")));
  const bulkMap={yuls:"economy",cards:"cards",house:"houses",patent:"hierarchy",roles:"hierarchy",missions:"missions",power:"players",visibility:"players"};
  qsa("[data-bulk-action]").forEach(btn=>{const perm=bulkMap[btn.dataset.bulkAction];btn.style.display=hasAdminPermission(perm)?"":"none"});
}

async function refreshAdminSession(){
  try{
    const d=await adminApi("/api/admin/me");
    state.admin=true;state.adminUser=d.admin;state.adminPermissions=d.admin.permissions||{};setAdminNav();
    if(state.page==="admin-login") go("admin");
  }catch{
    state.admin=false;state.adminUser=null;setAdminNav();
  }
}
function setAdminNav(){
  const b=qs("#adminNav");if(!b)return;
  b.textContent=state.admin?"👑 Administração":"👑 Administração";
  b.dataset.page=state.admin?"admin":"admin-login";
}
async function adminLogin(e){
  e.preventDefault();
  const err=qs("#adminLoginError");if(err)err.textContent="";
  const username=qs("#adminUsername")?.value.trim();
  const password=qs("#adminPassword")?.value||"";
  if(!username||!password){if(err)err.textContent="Preencha usuário e senha.";return;}
  try{
    const d=await api("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
    state.admin=true;state.adminUser=d.admin;state.adminPermissions=d.admin.permissions||{};state.adminKey=null;clearStoredAdminKey();setAdminNav();
    qs("#adminLoginForm")?.reset();go("admin");
  }catch(ex){if(err)err.textContent=ex.message}
}
async function editAdminPermissions(id){
  const editor=qs("#adminPermissionEditor"); if(!editor)return;
  try{
    const [defs,data]=await Promise.all([adminApi("/api/admin/permissions/definitions"),adminApi(`/api/admin/permissions/${id}`)]);
    const admin=(state.adminUserList||[]).find(a=>Number(a.id)===Number(id));
    const permissions=data.permissions||{};
    editor.innerHTML=`<div class="admin-permission-card"><div class="admin-permission-card-head"><div><b>👑 ${escapeHtml(admin?.display_name||admin?.username||`Administrador #${id}`)}</b><small>Selecione os módulos que este administrador poderá gerenciar.</small></div><span class="permission-status" id="permissionStatus"></span></div><div class="admin-permission-grid">${Object.entries(defs.permissions||{}).map(([key,label])=>`<label class="admin-permission-item"><input type="checkbox" data-perm-key="${escapeHtml(key)}" ${permissions[key]===true?"checked":""}> ${escapeHtml(label)}</label>`).join("")}</div><div class="admin-permission-actions"><button type="button" class="outline small" id="cancelPermissionEdit">Cancelar</button><button type="button" class="gold small" id="savePermissionEdit">Salvar permissões</button></div></div>`;
    qs("#cancelPermissionEdit").onclick=()=>{editor.innerHTML=`<p class="admin-history-empty">Selecione “Permissões” em um administrador para editar.</p>`};
    qs("#savePermissionEdit").onclick=async()=>{
      const out={};qsa("[data-perm-key]").forEach(x=>out[x.dataset.permKey]=x.checked);
      const status=qs("#permissionStatus");
      try{await adminApi(`/api/admin/permissions/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({permissions:out})});if(status)status.textContent="Permissões salvas.";await loadAdminUsers();setTimeout(()=>{if(status)status.textContent=""},1800)}catch(ex){if(status)status.textContent=ex.message}
    };
  }catch(ex){editor.innerHTML=`<p class="admin-history-empty">${escapeHtml(ex.message)}</p>`}
}

async function loadAdminUsers(){
  const list=qs("#adminUserList");if(!list)return;
  try{
    const d=await adminApi("/api/admin/admins");
    state.adminUserList=d.admins||[];list.innerHTML=state.adminUserList.map(a=>`<div class="admin-user-row">
      <div><b>👑 ${escapeHtml(a.display_name||a.username)}</b><small>@${escapeHtml(a.username)} • ${a.active?"Ativo":"Desativado"}${a.last_login?` • Último acesso: ${escapeHtml(String(a.last_login))}`:""}</small></div>
      <div class="admin-user-actions">${Number(a.id)!==Number(state.adminUser?.id)?`<button type="button" class="outline small" data-admin-perms="${a.id}">Permissões</button><button type="button" class="outline small ${a.active?"danger":""}" data-admin-toggle="${a.id}" data-admin-active="${a.active?0:1}">${a.active?"Desativar":"Reativar"}</button>`:`<span class="admin-user-current">Seu acesso</span>`}</div>
    </div>`).join("")||`<div class="admin-history-empty">Nenhum administrador cadastrado.</div>`;
    qsa("[data-admin-perms]").forEach(btn=>btn.onclick=()=>editAdminPermissions(Number(btn.dataset.adminPerms)));
    qsa("[data-admin-toggle]").forEach(btn=>btn.onclick=async()=>{
      try{await adminApi(`/api/admin/admins/${btn.dataset.adminToggle}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:Number(btn.dataset.adminActive)===1})});await loadAdminUsers();}
      catch(ex){alert(ex.message)}
    });
  }catch(ex){list.innerHTML=`<div class="admin-history-empty">${escapeHtml(ex.message)}</div>`}
}

async function loadAdminHouses(){
  try{
    const d=await adminApi("/api/admin/houses");
    state.adminHouses=d.houses||[];
    const list=qs("#adminHouseList");
    if(!list)return;
    list.innerHTML=state.adminHouses.map(h=>`<div class="admin-house-item">
      <div><b>${escapeHtml(h.emblem||"♜")} ${escapeHtml(h.name)}</b><small>${h.count} membros • ${h.missions} missões • 🪙 ${money(h.yuls)}${h.leader?` • Líder: ${escapeHtml(h.leader)}`:""} • ${escapeHtml(h.status||"ATIVA")}</small></div>
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
  form.reset();qs("#houseId").value="";qs("#houseEmblem").value="♜";qs("#houseStatus").value="ATIVA";
  qs("#houseSaveBtn").textContent="Criar Casa";qs("#houseError").textContent="";
}
function editHouseForm(id){
  const h=state.adminHouses.find(x=>Number(x.id)===id);if(!h)return;
  qs("#houseId").value=h.id;qs("#houseName").value=h.name;qs("#houseEmblem").value=h.emblem||"♜";
  qs("#houseLeader").value=h.leader||"";qs("#houseVice").value=h.vice_leader||"";qs("#houseMotto").value=h.motto||"";qs("#houseColor").value=h.color||"";qs("#houseBanner").value=h.banner_url||"";qs("#houseStatus").value=h.status||"ATIVA";qs("#houseDescription").value=h.description||"";qs("#houseHistory").value=h.history||"";qs("#houseGoals").value=h.goals||"";qs("#houseAchievements").value=h.achievements||"";
  qs("#houseSaveBtn").textContent="Salvar Casa";qs("#houseError").textContent="";
  qs("#houseName").focus();
}
async function deleteHouse(id){
  const h=state.adminHouses.find(x=>Number(x.id)===id);if(!h)return;
  if(!confirm(`Arquivar ${h.name}? A Casa sairá da estrutura ativa, mas seu histórico será preservado.`))return;
  try{
    await adminApi(`/api/admin/houses/${id}`,{method:"DELETE"});
    if(Number(qs("#houseId").value)===id)resetHouseForm();
    await loadAdminHouses();await loadHouses();alert("Casa arquivada. O histórico foi preservado.");
  }catch(e){alert(e.message)}
}

function openPlayerImport(){
  const modal=qs("#playerImportModal");if(!modal)return;
  modal.hidden=false;modal.style.display="block";
  state.playerImport={file:null,preview:null};
  qs("#playerImportFile").value="";qs("#playerImportFileName").textContent="Nenhum arquivo selecionado";
  qs("#playerImportPreview").innerHTML="<p>Escolha um arquivo para começar.</p>";
  qs("#playerImportConfirm").disabled=true;qs("#playerImportStatus").textContent="";
}
function closePlayerImport(){const m=qs("#playerImportModal");if(m){m.style.display="none";m.hidden=true}}
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
async function loadAdminSchedule(){
  if(!state.admin)return;
  try{
    const d=await adminApi("/api/admin/schedule");
    state.adminSchedule=d.activities||[];
    populateScheduleEventSelect();
    populateScheduleMissionSelect();
    renderAdminSchedule();
  }catch(e){
    const er=qs("#scheduleError");if(er)er.textContent=e.message;
  }
}
function populateScheduleEventSelect(){
  const el=qs("#scheduleEvent");if(!el)return;
  const current=el.value;
  el.innerHTML=`<option value="">Sem evento vinculado</option>`+(state.adminEvents||[]).map(e=>`<option value="${e.id}">${escapeHtml(e.title)}</option>`).join("");
  if(current)el.value=current;
}
function populateScheduleMissionSelect(){
  const el=qs("#scheduleMission");if(!el)return;
  const current=el.value;
  el.innerHTML=`<option value="">Sem missão vinculada</option>`+(state.adminMissions||[]).map(m=>`<option value="${m.id}">Missão de ${escapeHtml(m.mission_type||"Missão")} — ${escapeHtml(m.start_at?new Date(m.start_at).toLocaleDateString("pt-BR"):"")}</option>`).join("");
  if(current)el.value=current;
}
function resetScheduleForm(){
  const f=qs("#scheduleForm");if(!f)return;
  f.reset();
  qs("#scheduleId").value="";
  qs("#scheduleType").value="ATIVIDADE";
  qs("#scheduleStatus").value="AGENDADA";
  qs("#scheduleFeatured").checked=false;
  qs("#schedulePublished").checked=true;
  qs("#scheduleSaveBtn").textContent="Criar atividade";
  qs("#scheduleError").textContent="";
}
function editAdminSchedule(id){
  const a=(state.adminSchedule||[]).find(x=>Number(x.id)===Number(id));if(!a)return;
  qs("#scheduleId").value=a.id;qs("#scheduleTitle").value=a.title||"";
  qs("#scheduleType").value=a.activity_type||"ATIVIDADE";qs("#scheduleStatus").value=a.status||"AGENDADA";
  qs("#scheduleDate").value=String(a.activity_date||"").slice(0,10);
  qs("#scheduleStart").value=a.start_time?String(a.start_time).slice(0,5):"";
  qs("#scheduleEnd").value=a.end_time?String(a.end_time).slice(0,5):"";
  qs("#scheduleLocation").value=a.location||"";qs("#scheduleLink").value=a.link||"";
  qs("#scheduleEvent").value=a.event_id?String(a.event_id):"";qs("#scheduleMission").value=a.mission_id?String(a.mission_id):"";
  qs("#scheduleDescription").value=a.description||"";
  qs("#scheduleFeatured").checked=Number(a.featured)===1;
  qs("#schedulePublished").checked=Number(a.published)===1;
  qs("#scheduleSaveBtn").textContent="Salvar atividade";
  qs("#scheduleError").textContent="";
  qs("#scheduleForm").scrollIntoView({behavior:"smooth",block:"center"});
}
function renderAdminSchedule(){
  const el=qs("#adminScheduleList");if(!el)return;
  el.innerHTML=(state.adminSchedule||[]).map(a=>`<div class="editorial-item">
    <div class="editorial-item-head">
      <div><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.activity_type||"ATIVIDADE")} • ${escapeHtml(scheduleDateLabel(a.activity_date))}${a.start_time?` • ${escapeHtml(String(a.start_time).slice(0,5))}`:""} • ${escapeHtml(a.status||"AGENDADA")}${Number(a.published)?"" :" • Não publicado"}</small></div>
      <div class="editorial-actions"><button type="button" data-schedule-edit="${a.id}">✎</button><button type="button" class="delete" data-schedule-delete="${a.id}">×</button></div>
    </div>
  </div>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma atividade cadastrada.</div>`;
  qsa("[data-schedule-edit]").forEach(b=>b.onclick=()=>editAdminSchedule(Number(b.dataset.scheduleEdit)));
  qsa("[data-schedule-delete]").forEach(b=>b.onclick=()=>deleteAdminSchedule(Number(b.dataset.scheduleDelete)));
}
async function deleteAdminSchedule(id){
  const a=(state.adminSchedule||[]).find(x=>Number(x.id)===Number(id));if(!a)return;
  if(!confirm(`Excluir "${a.title}" do cronograma?`))return;
  try{
    await adminApi(`/api/admin/schedule/${id}`,{method:"DELETE"});
    await loadAdminSchedule();await loadSchedule();alert("Atividade excluída.");
  }catch(e){qs("#scheduleError").textContent=e.message}
}

async function loadAdminMissions(){
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


async function loadAdminEconomy(){
  const list=qs("#adminEconomyList"); if(!list)return;
  try{
    const d=await adminApi(`/api/admin/economy${qs("#adminEconomyStatus")?.value?`?status=${encodeURIComponent(qs("#adminEconomyStatus").value)}`:""}`);
    state.adminEconomy=d.transactions||[];
    const totals=d.totals||[];
    const y=totals.find(x=>x.currency==='YULS')||{}, dr=totals.find(x=>x.currency==='DRACMAS')||{};
    qs("#adminEconomySummary").innerHTML=`<div class="admin-stat"><span>🪙 Yuls pagos</span><b>${money(y.paid||0)}</b></div><div class="admin-stat"><span>⚫ Dracmas pagos</span><b>${money(dr.paid||0)}</b></div><div class="admin-stat"><span>⏳ Pendentes</span><b>${Number(y.pending||0)+Number(dr.pending||0)}</b></div>`;
    list.innerHTML=state.adminEconomy.map(t=>{
      const st={AGUARDANDO_APROVACAO:'Aguardando aprovação',APROVADA_AGUARDANDO_PAGAMENTO:'Aguardando pagamento',PAGA:'Paga',ESTORNADA:'Estornada',REJEITADA:'Rejeitada'}[t.status]||t.status;
      const actions=t.status==='AGUARDANDO_APROVACAO'?`<button class="gold small" data-econ-approve="${t.id}">Aprovar</button><button class="outline dark-outline small" data-econ-reject="${t.id}">Rejeitar</button>`:t.status==='APROVADA_AGUARDANDO_PAGAMENTO'?`<button class="gold small" data-econ-pay="${t.id}">Efetivar pagamento</button><button class="outline dark-outline small" data-econ-reject="${t.id}">Rejeitar</button>`:t.status==='PAGA'?`<button class="outline danger small" data-econ-reverse="${t.id}">Estornar</button>`:'';
      return `<div class="economy-admin-row"><div><b>${t.currency==='YULS'?'🪙':'⚫'} ${t.amount>0?'+':''}${money(t.amount)} — ${escapeHtml(t.nick)}${escapeHtml(t.number||'')}</b><small>${escapeHtml(st)} • ${escapeHtml(t.reason||'')} • atividade: ${escapeHtml(String(t.activity_date||''))}</small><small>Origem: ${escapeHtml(t.source_type||'ADMINISTRATIVO')}${t.created_by_name?` • lançado por ${escapeHtml(t.created_by_name)}`:''}</small></div><div class="economy-admin-actions">${actions}</div></div>`;
    }).join("")||`<div class="admin-history-empty">Nenhuma transação encontrada.</div>`;
    qsa("[data-econ-approve]").forEach(b=>b.onclick=async()=>{try{await adminApi(`/api/admin/economy/transactions/${b.dataset.econApprove}/approve`,{method:'POST'});await loadAdminEconomy();}catch(e){alert(e.message)}});
    qsa("[data-econ-pay]").forEach(b=>b.onclick=async()=>{try{await adminApi(`/api/admin/economy/transactions/${b.dataset.econPay}/pay`,{method:'POST'});await loadAdminEconomy();await initAdmin();}catch(e){alert(e.message)}});
    qsa("[data-econ-reject]").forEach(b=>b.onclick=async()=>{if(!confirm('Rejeitar esta transação?'))return;try{await adminApi(`/api/admin/economy/transactions/${b.dataset.econReject}/reject`,{method:'POST'});await loadAdminEconomy();}catch(e){alert(e.message)}});
    qsa("[data-econ-reverse]").forEach(b=>b.onclick=async()=>{if(!confirm('Estornar esta transação? O saldo será revertido e o histórico será preservado.'))return;try{await adminApi(`/api/admin/economy/transactions/${b.dataset.econReverse}/reverse`,{method:'POST'});await loadAdminEconomy();await initAdmin();}catch(e){alert(e.message)}});
  }catch(e){list.innerHTML=`<div class="admin-history-empty">${escapeHtml(e.message)}</div>`}
}
function populateEconomyPlayers(){const s=qs('#economyPlayer');if(!s)return;s.innerHTML='<option value="">Jogador</option>'+(state.players||[]).filter(p=>Number(p.active)!==0).map(p=>`<option value="${p.id}">${escapeHtml(displayPlayerName(p))} • ${escapeHtml(p.house||'Sem Casa')}</option>`).join('');}


function auditSourceIcon(source){return ({AUDITORIA:'🛡️',JOGADOR:'👤',CARD:'🃏',RANKING:'🏆',CASA:'🏰'})[source]||'📜';}
function auditStatusLabel(code){const n=Number(code||0);if(n>=200&&n<300)return {label:'Concluído',cls:'ok'};if(n>=400&&n<500)return {label:'Negado',cls:'warn'};if(n>=500)return {label:'Erro',cls:'bad'};return {label:String(n||'—'),cls:'neutral'};}
function formatAuditDate(v){try{return new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}catch{return String(v||'')}}
function auditHumanAction(x){
  if(x.source==='AUDITORIA'){
    const m=String(x.action||'').match(/^(POST|PUT|PATCH|DELETE)\s+\/api\/admin\/(.+)$/i);
    if(m){const verb={POST:'Criou/alterou',PUT:'Atualizou',PATCH:'Atualizou',DELETE:'Arquivou/removou'}[m[1].toUpperCase()]||m[1];return `${verb} ${m[2]}`;}
  }
  return String(x.action||'Registro administrativo');
}
async function loadAdminAudit(){
  const list=qs('#adminAuditList');if(!list)return;
  try{
    const params=new URLSearchParams();
    const q=qs('#adminAuditSearch')?.value?.trim()||'';const source=qs('#adminAuditSource')?.value||'';const from=qs('#adminAuditFrom')?.value||'';const to=qs('#adminAuditTo')?.value||'';
    if(q)params.set('q',q);if(source)params.set('source',source);if(from)params.set('from',from);if(to)params.set('to',to);params.set('limit','100');
    const d=await adminApi(`/api/admin/audit?${params.toString()}`);state.adminAudit=d.entries||[];
    const counts=state.adminAudit.reduce((a,x)=>{const k=x.source||'OUTRO';a[k]=(a[k]||0)+1;return a},{});
    const sum=qs('#adminAuditSummary'); if(sum)sum.innerHTML=`<span>📜 ${state.adminAudit.length} registros</span><span>🛡️ ${counts.AUDITORIA||0} ações diretas</span><span>🧩 ${state.adminAudit.length-(counts.AUDITORIA||0)} históricos</span>`;
    list.innerHTML=state.adminAudit.map(x=>{const st=auditStatusLabel(x.status_code);return `<article class="audit-row"><div class="audit-icon">${auditSourceIcon(x.source)}</div><div class="audit-main"><div class="audit-top"><b>${escapeHtml(auditHumanAction(x))}</b><span class="audit-status ${st.cls}">${st.label}</span></div><small>${escapeHtml(x.actor||'Administração')} • ${escapeHtml(String(x.entity||'sistema'))}${x.entity_id?` #${escapeHtml(String(x.entity_id))}`:''} • ${escapeHtml(formatAuditDate(x.created_at))}</small>${x.detail?`<p>${escapeHtml(String(x.detail))}</p>`:''}</div></article>`}).join('')||`<div class="admin-history-empty">Nenhum registro encontrado para esses filtros.</div>`;
  }catch(e){list.innerHTML=`<div class="admin-history-empty">${escapeHtml(e.message)}</div>`;const sum=qs('#adminAuditSummary');if(sum)sum.innerHTML='';}
}

function settingRowsToMap(rows){
  const out={};(rows||[]).forEach(x=>out[x.key]=x.value);return out;
}
function prettyEventType(v){return ({JOGO:'🎮 Evento de Jogo',ESPECIAL:'🃏 Evento Especial',TEMPORADA:'🎫 Evento de Temporada',LEGIAO:'⚔️ Evento de Legião'}[v]||v)}
function renderSettingsChips(targetId,key,items){
  const el=qs('#'+targetId);if(!el)return;
  el.innerHTML=(items||[]).map(v=>`<span class="settings-chip"><span>${escapeHtml(key==='event_types'?prettyEventType(v):v)}</span><button type="button" title="Remover" data-settings-remove="${escapeHtml(key)}" data-settings-value="${escapeHtml(v)}">×</button></span>`).join('')||`<span class="admin-history-empty">Nenhum item cadastrado.</span>`;
}
function applyPortalSettingsToForms(cfg){
  const missions=cfg.mission_types||[];
  const events=cfg.event_types||[];
  const origins=cfg.card_origins||[];
  const missionSel=qs('#adminMissionType');
  if(missionSel){const current=missionSel.value;missionSel.innerHTML=missions.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');if(missions.includes(current))missionSel.value=current;else if(missions[0])missionSel.value=missions[0];}
  const eventSel=qs('#eventType');
  if(eventSel){const current=eventSel.value;eventSel.innerHTML=events.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(prettyEventType(v))}</option>`).join('');if(events.includes(current))eventSel.value=current;else if(events[0])eventSel.value=events[0];}
  state.cardOrigins=origins; if(typeof populateCardSelects==='function')populateCardSelects();
  if(qs('#settingKingdomName'))qs('#settingKingdomName').value=cfg.kingdom_name||'';
  if(qs('#settingKingdomMotto'))qs('#settingKingdomMotto').value=cfg.kingdom_motto||'';
  if(qs('#settingTimezone'))qs('#settingTimezone').value=cfg.timezone||'America/Sao_Paulo';
  if(qs('#settingFooter'))qs('#settingFooter').value=cfg.footer_text||'';
}
async function loadAdminSettings(){
  const err=qs('#settingsGlobalError');if(err)err.textContent='';
  try{
    const d=await adminApi('/api/admin/settings');
    const cfg=settingRowsToMap(d.settings||[]);state.portalSettings=cfg;applyPortalSettingsToForms(cfg);
    renderSettingsChips('settingsMissionTypes','mission_types',cfg.mission_types||[]);
    renderSettingsChips('settingsEventTypes','event_types',cfg.event_types||[]);
    renderSettingsChips('settingsCardOrigins','card_origins',cfg.card_origins||[]);
    renderSettingsChips('settingsCardElements','card_elements',cfg.card_elements||[]);
  }catch(e){if(err)err.textContent=e.message;}
}
async function updatePortalSetting(key,value){
  try{
    const d=await adminApi(`/api/admin/settings/${encodeURIComponent(key)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value})});
    state.portalSettings=state.portalSettings||{};state.portalSettings[key]=d.value;applyPortalSettingsToForms(state.portalSettings);
    renderSettingsChips('settingsMissionTypes','mission_types',state.portalSettings.mission_types||[]);
    renderSettingsChips('settingsEventTypes','event_types',state.portalSettings.event_types||[]);
    renderSettingsChips('settingsCardOrigins','card_origins',state.portalSettings.card_origins||[]);
    renderSettingsChips('settingsCardElements','card_elements',state.portalSettings.card_elements||[]);
    await loadAdminSettings();
    return true;
  }catch(e){const err=qs('#settingsGlobalError');if(err)err.textContent=e.message;else alert(e.message);return false;}
}
function addConfiguredValue(key,inputId){
  const input=qs('#'+inputId);const value=(input?.value||'').trim();if(!value)return;
  const current=Array.isArray(state.portalSettings?.[key])?state.portalSettings[key].slice():[];
  const normalized=key==='event_types'?value.toUpperCase():value;
  if(current.some(x=>String(x).toLowerCase()===normalized.toLowerCase())){alert('Esse item já existe.');return;}
  current.push(normalized);updatePortalSetting(key,current).then(ok=>{if(ok)input.value='';});
}
qsa('[data-settings-add]')?.forEach(btn=>btn.addEventListener('click',()=>{
  const key=btn.dataset.settingsAdd;const inputId={mission_types:'newMissionType',event_types:'newEventType',card_origins:'newCardOrigin',card_elements:'newCardElement'}[key];if(inputId)addConfiguredValue(key,inputId);
}));
document.addEventListener('click',e=>{const b=e.target.closest('[data-settings-remove]');if(!b)return;const key=b.dataset.settingsRemove;const value=b.dataset.settingsValue;const current=Array.isArray(state.portalSettings?.[key])?state.portalSettings[key].slice():[];if(current.length<=1){alert('A configuração precisa manter pelo menos um item.');return;}if(!confirm(`Remover "${value}" da configuração?`))return;updatePortalSetting(key,current.filter(x=>x!==value));});
qs('#portalIdentityForm')?.addEventListener('submit',async e=>{e.preventDefault();const values={kingdom_name:qs('#settingKingdomName').value,kingdom_motto:qs('#settingKingdomMotto').value,timezone:qs('#settingTimezone').value,footer_text:qs('#settingFooter').value};for(const [k,v] of Object.entries(values)){const ok=await updatePortalSetting(k,v);if(!ok)return;}alert('Identidade do Reino atualizada.');});

async function loadAdminAllies(){
  const list=qs("#adminAllyList");if(!list)return;
  try{
    const d=await adminApi("/api/admin/allies"); state.allies=d.allies||[];
    list.innerHTML=state.allies.map(a=>`<div class="admin-user-row"><div><b>🤝 ${escapeHtml(a.display_name)}</b><small>@${escapeHtml(a.username)} • ${escapeHtml(a.origin_kingdom||"Reino não informado")}${a.origin_house?` • ${escapeHtml(a.origin_house)}`:""} • ${a.active?"Ativo":"Suspenso"} • ${a.card_count||0} Cards${a.last_login?` • último acesso ${escapeHtml(new Date(a.last_login).toLocaleString("pt-BR"))}`:""}</small></div><div class="admin-user-actions"><button type="button" class="outline small" data-ally-cards="${a.id}">Cards</button><button type="button" class="outline small" data-ally-edit="${a.id}">Editar</button><button type="button" class="outline small ${a.active?"danger":""}" data-ally-toggle="${a.id}" data-ally-active="${a.active?0:1}">${a.active?"Suspender":"Reativar"}</button></div></div>`).join("")||`<div class="admin-history-empty">Nenhum Aliado Oculto cadastrado.</div>`;
    qsa("[data-ally-edit]").forEach(b=>b.onclick=()=>editAdminAlly(Number(b.dataset.allyEdit)));
    qsa("[data-ally-toggle]").forEach(b=>b.onclick=async()=>{try{await adminApi(`/api/admin/allies/${b.dataset.allyToggle}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:Number(b.dataset.allyActive)===1})});await loadAdminAllies();}catch(e){alert(e.message)}});
    qsa("[data-ally-cards]").forEach(b=>b.onclick=()=>openAllyCardManager(Number(b.dataset.allyCards)));
  }catch(e){list.innerHTML=`<div class="admin-history-empty">${escapeHtml(e.message)}</div>`}
}
function clearAdminAllyForm(){const f=qs("#adminAllyForm");if(f)f.reset();qs("#adminAllyId").value="";qs("#adminAllyActive").checked=true;qs("#adminAllyPassword").required=true;qs("#adminAllyError").textContent="";}
function editAdminAlly(id){const a=(state.allies||[]).find(x=>Number(x.id)===id);if(!a)return;qs("#adminAllyId").value=a.id;qs("#adminAllyUsername").value=a.username||"";qs("#adminAllyDisplayName").value=a.display_name||"";qs("#adminAllyPassword").value="";qs("#adminAllyPassword").required=false;qs("#adminAllyKingdom").value=a.origin_kingdom||"";qs("#adminAllyHouse").value=a.origin_house||"";qs("#adminAllyPatent").value=a.patent||"";qs("#adminAllyRole").value=a.role||"";qs("#adminAllyDescription").value=a.description||"";qs("#adminAllyActive").checked=Number(a.active)===1;qs("#adminAllyError").textContent="Editando aliado.";qs("#adminAlliesPanel")?.scrollIntoView({behavior:"smooth",block:"center"});}
async function openAllyCardManager(id){
  state.selectedAllyId=id; const a=(state.allies||[]).find(x=>Number(x.id)===id);
  qs("#allyCardManager").hidden=false; qs("#allyCardManagerTitle").textContent=`Cards de ${a?.display_name||"Aliado"}`;
  try{
    const [cards,cat]=await Promise.all([adminApi(`/api/admin/allies/${id}/cards`),adminApi("/api/admin/cards")]);
    state.allyCards=cards.cards||[]; const all=cat.cards||[]; const sel=qs("#allyCardSelect"); if(sel)sel.innerHTML='<option value="">Selecionar Card...</option>'+all.filter(c=>Number(c.active??1)!==0).map(c=>`<option value="${c.id}">${escapeHtml(c.name_pt||c.name)}${c.name_jp?` • ${escapeHtml(c.name_jp)}`:""}</option>`).join("");
    renderAllyAdminCards();
  }catch(e){qs("#allyCardList").innerHTML=`<div class="admin-history-empty">${escapeHtml(e.message)}</div>`}
}
function renderAllyAdminCards(){const el=qs("#allyCardList");if(!el)return;el.innerHTML=(state.allyCards||[]).map(c=>`<div class="editorial-item"><div class="editorial-item-head"><div><b>🃏 ${escapeHtml(c.name_pt||c.name)}</b><small>${escapeHtml(c.category||"Outros")} • ⚡ ${Number(c.power_value||0)} • ${escapeHtml(c.acquisition_name||"Administrativo")}</small></div><div class="editorial-actions"><button type="button" class="delete" data-ally-card-remove="${c.id}">×</button></div></div></div>`).join("")||`<div class="admin-history-empty">Este aliado ainda não possui Cards.</div>`;qsa("[data-ally-card-remove]").forEach(b=>b.onclick=async()=>{if(!confirm("Remover este Card do aliado?"))return;try{await adminApi(`/api/admin/allies/${state.selectedAllyId}/cards/${b.dataset.allyCardRemove}`,{method:"DELETE"});await openAllyCardManager(state.selectedAllyId);await loadAdminAllies();}catch(e){alert(e.message)}});}
qs("#closeAllyCardManager")?.addEventListener("click",()=>{qs("#allyCardManager").hidden=true;state.selectedAllyId=null;});
qs("#grantAllyCardBtn")?.addEventListener("click",async()=>{const id=state.selectedAllyId,card=Number(qs("#allyCardSelect")?.value||0);if(!id||!card)return alert("Selecione um Card.");try{await adminApi(`/api/admin/allies/${id}/cards`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({card_id:card,acquisition_name:qs("#allyCardAcquisition")?.value||"Concessão administrativa"})});qs("#allyCardSelect").value="";qs("#allyCardAcquisition").value="";await openAllyCardManager(id);await loadAdminAllies();}catch(e){alert(e.message)}});
qs("#adminAllyClear")?.addEventListener("click",clearAdminAllyForm);
qs("#adminAllyForm")?.addEventListener("submit",async e=>{e.preventDefault();const id=qs("#adminAllyId").value;const body={username:qs("#adminAllyUsername").value,display_name:qs("#adminAllyDisplayName").value,password:qs("#adminAllyPassword").value,origin_kingdom:qs("#adminAllyKingdom").value,origin_house:qs("#adminAllyHouse").value,patent:qs("#adminAllyPatent").value,role:qs("#adminAllyRole").value,description:qs("#adminAllyDescription").value,active:qs("#adminAllyActive").checked};const err=qs("#adminAllyError");err.textContent="Salvando...";try{await adminApi(id?`/api/admin/allies/${id}`:"/api/admin/allies",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});clearAdminAllyForm();await loadAdminAllies();err.textContent="Aliado salvo.";}catch(ex){err.textContent=ex.message;}});

async function initAdmin(){
  closePlayerImport();
  if(hasAdminPermission("rankings")) loadAdminRankingBattles();
  if(!state.admin)return;
  setAdminPermissionVisibility();
  try{
    if(hasAdminPermission("dashboard")){ const ov=await adminApi("/api/admin/overview"); renderAdminStats(ov); }
    if(hasAdminPermission("settings")) await loadAdminSettings();
    if(hasAdminPermission("reports")) await loadAdminReports();
    if(hasAdminPermission("players")){ const pl=await adminApi("/api/admin/players"); state.players=pl.players||[]; populateAdminFilters();renderAdminList(state.players,qs("#adminSearch")?.value||""); if(state.selectedPlayer) await selectAdminPlayer(state.selectedPlayer.id); }
    if(hasAdminPermission("cards")) await loadAdminCards();
    if(hasAdminPermission("economy")){ populateEconomyPlayers(); await loadAdminEconomy(); }
    if(hasAdminPermission("notifications")){ populateNotificationPlayers(); await loadAdminNotifications(); }
    if(hasAdminPermission("schedule")) await loadAdminSchedule();
    if(hasAdminPermission("missions")) await loadAdminMissions();
    if(hasAdminPermission("admin_users")) await loadAdminUsers();
    if(hasAdminPermission("houses")) await loadAdminHouses();
    if(hasAdminPermission("hierarchy")) await loadAdminHierarchy();
    if(hasAdminPermission("journal")) await loadAdminEditorial();
    if(hasAdminPermission("library")) await loadAdminLibrary();
    if(hasAdminPermission("events")) { try { const d=await adminApi("/api/admin/events"); state.adminEvents=d.events||[]; } catch(e){console.warn(e.message)} }
    if(hasAdminPermission("allies")) await loadAdminAllies();
    if(hasAdminPermission("audit")) await loadAdminAudit();
  }catch(e){console.error(e)}
}


async function loadAdminReports(){
  try{
    const d=await adminApi("/api/admin/reports");
    const k=[
      ["👥","Jogadores ativos",d.players.active],
      ["⏸️","Suspensos",d.players.suspended],
      ["🃏","Cards ativos",d.cards.active],
      ["🪙","Yuls em circulação",money(d.economy.yuls)],
      ["⚫","Dracmas registrados",money(d.economy.dracmas)],
      ["⚔️","Missões em andamento",d.missions.ongoing],
      ["🎪","Eventos em andamento",d.events.ongoing],
      ["⏳","Batalhas aguardando aprovação",d.battles.pending],
      ["💬","Status publicados hoje",d.statuses.today]
    ];
    qs("#adminReportsSummary").innerHTML=k.map(x=>`<div class="report-kpi"><span>${x[0]} ${x[1]}</span><b>${x[2]}</b></div>`).join("");
    const row=(p,metric)=>`<div class="report-row"><span class="report-rank">${metric.i}</span><div><b>${escapeHtml(displayPlayerName(p))}</b><small>${escapeHtml(p.house||"Sem Casa")}</small></div><strong>${metric.v}</strong></div>`;
    qs("#reportTopPower").innerHTML=d.topPower.length?d.topPower.map((p,i)=>row(p,{i:i+1,v:`⚔️ ${Number(p.power||0).toLocaleString("pt-BR")}`})).join(""):"<p class='admin-history-empty'>Sem dados.</p>";
    qs("#reportTopActivity").innerHTML=d.topActivity.length?d.topActivity.map((p,i)=>row(p,{i:i+1,v:`⭐ ${Number(p.activity||0).toLocaleString("pt-BR")}`})).join(""):"<p class='admin-history-empty'>Sem dados.</p>";
    qs("#reportHouseStats").innerHTML=d.houseStats.length?`<div class="report-house-table"><div class="report-house-head"><span>Casa</span><span>Membros</span><span>Missões</span><span>Poder</span><span>Yuls</span></div>${d.houseStats.map(h=>`<div class="report-house-row"><b>${escapeHtml(h.emblem||"♜")} ${escapeHtml(h.name)}</b><span>${h.members}</span><span>${h.missions}</span><span>${Number(h.power||0).toLocaleString("pt-BR")}</span><span>🪙 ${money(h.yuls)}</span></div>`).join("")}</div>`:"<p class='admin-history-empty'>Nenhuma Casa cadastrada.</p>";
    qs("#reportUpdatedAt").textContent=`Atualizado em ${new Date().toLocaleString("pt-BR")}`;
  }catch(e){
    const el=qs("#adminReportsSummary"); if(el) el.innerHTML=`<div class="report-error">${escapeHtml(e.message)}</div>`;
  }
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
    if(f.status!==""&&String(Number(p.active ?? 1))!==String(f.status))return false;
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
        <span><b>${escapeHtml(displayPlayerName(p))}</b><small>${escapeHtml(p.house||"Sem Casa")} · ${escapeHtml(p.patent||"Sem patente")} · ${(p.roles||[]).map(r=>escapeHtml(r.name)).join(", ")||"sem cargos"} · ${p.has_password?"🔐 senha definida":"⚠️ sem senha"} · ${Number(p.active??1)?"🟢 ativo":"⛔ suspenso"}</small></span>
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
  if(h)h.value=state.adminFilters.house||""; if(p)p.value=state.adminFilters.patent||""; if(r)r.value=state.adminFilters.role||""; const st=qs("#adminStatusFilter"); if(st)st.value=state.adminFilters.status||"";
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
  if(type==="cards"){
    const catalog=(state.adminCards||[]).filter(c=>Number(c.active)===1);
    body=`<div class="bulk-card-distribution"><div class="bulk-modal-grid">
      <select id="bulkCardSelect">${catalog.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.category)}</option>`).join("")||`<option value="">Nenhum card ativo</option>`}</select>
      <select id="bulkCardSourceType"><option value="MISSAO">🎯 Missão</option><option value="EVENTO">🎉 Evento</option><option value="LOJA">🛒 Loja</option><option value="PATENTE">🎖️ Patente</option><option value="OUTRO">◆ Outra origem</option></select>
      <input id="bulkCardSourceName" placeholder="Nome da missão/evento/origem">
    </div><p class="bulk-card-help">O mesmo card será lançado para todos os selecionados. Se algum jogador já possuir o card, ele será apenas informado como ignorado.</p></div>`;
  }
  if(type==="house")title="🏰 Alterar Casa",body=`<div class="bulk-modal-grid"><select id="bulkHouse">${(state.adminHouses||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("")}</select></div>`;
  if(type==="patent")title="🎖️ Alterar Patente",body=`<div class="bulk-modal-grid"><select id="bulkPatent">${(state.adminHierarchy?.patents||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("")}</select></div>`;
  if(type==="roles")title="👑 Definir Cargos",body=`<div class="bulk-role-options">${(state.adminHierarchy?.roles||[]).map(x=>`<label class="role-option"><input type="checkbox" name="bulkRoleIds" value="${x.id}"><span><b>${escapeHtml(x.name)}</b><small>${x.salary>0?`🪙 ${money(x.salary)}`:""}</small></span></label>`).join("")||`<span style="font-size:10px;color:#888">Nenhum cargo cadastrado.</span>`}</div>`;
  if(type==="missions")title="📋 Ajustar Missões",body=`<div class="bulk-modal-grid"><select id="bulkMissionMode"><option value="add">Adicionar missões</option><option value="set">Definir quantidade</option></select><input id="bulkMissionAmount" type="number" min="0" placeholder="Quantidade"></div>`;
  if(type==="power")title="⚔️ Definir Força",body=`<div class="bulk-modal-grid"><input id="bulkPowerAmount" type="number" min="0" placeholder="Novo valor de força"></div>`;
  if(type==="visibility")title="👁️ Visibilidade",body=`<div class="bulk-modal-grid"><select id="bulkVisibility"><option value="1">Tornar público</option><option value="0">Ocultar perfil</option></select></div>`;
  if(type==="status")title="🔐 Acesso ao Portal",body=`<div class="bulk-modal-grid"><select id="bulkActive"><option value="1">🟢 Ativar acesso</option><option value="0">⛔ Suspender acesso</option></select></div><p class="bulk-card-help">Suspender preserva o cadastro, Cards, economia, missões e histórico.</p>`;

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
  if(type==="cards"){
    payload.card_id=Number(qs("#bulkCardSelect").value||0);
    payload.acquisition_type=qs("#bulkCardSourceType").value;
    payload.acquisition_name=qs("#bulkCardSourceName").value.trim();
    try{
      const r=await adminApi("/api/admin/cards/distribute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      modal.remove();state.selectedPlayers.clear();await initAdmin();
      const skipped=(r.skipped||[]).map(x=>`${x.nick}: ${x.reason}`).join("\n");
      alert(`Card distribuído para ${r.added.length} jogador(es).${skipped?`\n\nIgnorados:\n${skipped}`:""}`);
    }catch(e){alert(e.message)}
    return;
  }
  if(type==="house"){action="set_house";payload.house_id=Number(qs("#bulkHouse").value)}
  if(type==="patent"){action="set_patent";payload.patent_id=Number(qs("#bulkPatent").value)}
  if(type==="roles"){action="set_roles";payload.role_ids=[...modal.querySelectorAll('input[name="bulkRoleIds"]:checked')].map(x=>Number(x.value))}
  if(type==="missions"){action=qs("#bulkMissionMode").value==="add"?"add_missions":"set_missions";payload.amount=Math.round(Number(qs("#bulkMissionAmount").value||0))}
  if(type==="power"){action="set_power";payload.amount=Math.round(Number(qs("#bulkPowerAmount").value||0))}
  if(type==="visibility"){action="set_public";payload.public_profile=Number(qs("#bulkVisibility").value)}
  if(type==="status"){action="set_active";payload.active=Number(qs("#bulkActive").value)}

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
    <span class="admin-status-pill ${Number(p.active??1)?"ok":"off"}">${Number(p.active??1)?"🟢 Acesso ativo":"⛔ Acesso suspenso"}</span>
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
    <div class="field full"><label>Acesso ao Portal</label><select name="active"><option value="1" ${Number(p.active??1)?"selected":""}>Ativo — pode entrar</option><option value="0" ${!Number(p.active??1)?"selected":""}>Suspenso — sem acesso</option></select></div>
    <div class="field full"><label>Perfil público</label><select name="public_profile"><option value="1" ${p.public_profile?"selected":""}>Visível</option><option value="0" ${!p.public_profile?"selected":""}>Oculto</option></select></div>
  </div><div class="editor-actions"><button class="gold" type="submit">Salvar alterações</button><button class="outline dark-outline" type="button" id="deletePlayerBtn">${Number(p.active??1)?"Suspender acesso":"Reativar acesso"}</button></div><div class="error" id="editError"></div></form>`;
}

function renderEconomyPanel(p){
  const hist=(p.history||[]).map(h=>`<div class="history-row"><span>${escapeHtml(h.reason||"Movimentação")}<br><small>${escapeHtml(String(h.created_at||""))}</small></span><b class="${h.amount>=0?"plus":"minus"}">${h.amount>=0?"+":""}${money(h.amount)} → ${money(h.balance_after)}</b></div>`).join("")||`<div class="admin-history-empty">Nenhuma movimentação registrada.</div>`;
  return `<div class="yuls-box" style="margin-top:0"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><h4>🪙 Movimentação de Yuls</h4><small>Saldo atual: <b>${money(p.yuls||0)} Yuls</b></small></div><button class="outline dark-outline small" id="zeroYulsBtn" type="button">⟲ Zerar Yuls</button></div><div class="yuls-form"><input id="yulsAmount" type="number" step="1" placeholder="+100 ou -100"><input id="yulsReason" placeholder="Motivo (pagamento, multa, recompensa...)"><button class="gold" id="yulsBtn" type="button">Lançar</button></div><p class="admin-editor-note">Zerar o saldo cria um ajuste financeiro auditável e preserva todo o histórico.</p><div class="history">${hist}</div></div>`;
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

function renderAdminGrimoirePageItem(pg){
  const kind=Number(pg.level_number)%2===1?"ATIVAÇÃO":"MAGIA EXCLUSIVA";
  return `<div class="admin-grimoire-row"><div><b>Nível ${pg.level_number} • ${kind}</b><small>${escapeHtml(pg.magic_name)}</small>${pg.description?`<p>${escapeHtml(pg.description)}</p>`:""}</div><div class="admin-grimoire-actions"><button type="button" class="outline small" data-grimoire-edit="${pg.id}">Editar</button><button type="button" class="outline danger small" data-grimoire-delete="${pg.id}">Excluir</button></div></div>`;
}
function renderAdminGrimoirePanel(p){
  const pages=p.grimoirePages||[];
  const level=Math.max(1,Number(p.grimoire_level||1)), exp=Number(p.exp||0);
  const thresholds={1:120,2:200,3:300,4:450,5:500,6:650,7:700};
  const next=thresholds[level]||null;
  const fixed=[['MISSAO_LUTA','⚔️ Missão de Luta',10],['MISSAO_RECRUTA','👥 Missão de Recruta',15],['EVENTO_PARTICIPACAO','🎪 Participação em Evento',2],['TORNEIO_PARTICIPACAO','🏆 Participação em Torneio',5],['EXAME_VENCEDOR','🎖️ Vencedor do Exame',12],['EVENTO_VITORIA','🏆 Vitória em Evento',7],['TORNEIO_VITORIA','🏆 Vitória em Torneio',20],['RANKING_VITORIA','⚔️ Vitória em Luta de Ranking',2],['JUIZ_INTER','⚖️ Juiz — Intermediário/Torneio',4],['JUIZ_SENIOR','⚖️ Juiz — Exame Sênior',8],['ORGANIZAR_EXAME','📋 Organizar Exame',10],['EMPREGO','💼 Emprego/Cargo',null],['EVENTO_ESPECIAL','✨ Premiação Especial',null]];
  const opts=fixed.map(r=>`<option value="${r[0]}">${escapeHtml(r[1])}${r[2]===null?' — valor variável':` — ${r[2]}%`}</option>`).join('');
  const list=pages.length?pages.map(renderAdminGrimoirePageItem).join(''):"<div class='admin-history-empty'>Nenhuma magia registrada no Grimório.</div>";
  const hist=(p.expHistory||[]).map(h=>`<div class="history-row"><span><b>${h.upgraded?'🔝 Upgrade de Grimório':'✨ EXP registrada'}</b><br><small>${escapeHtml(h.source_code||'AJUSTE')}${h.source_detail?` • ${escapeHtml(h.source_detail)}`:''} • ${escapeHtml(h.reason||'')}</small><br><small>${escapeHtml(String(h.created_at||''))}</small></span><b class="plus">+${money(h.amount)}% → ${money(h.exp_after)}% (N${h.level_after})</b></div>`).join('')||`<div class="admin-history-empty">Nenhuma movimentação de EXP registrada.</div>`;
  return `<div><div class="exp-box"><div class="exp-box-head"><div><p class="eyebrow">📖 PROGRESSÃO DO GRIMÓRIO</p><h4>Nível ${level} • ${money(exp)}% EXP</h4><small>${next?`Próximo nível: ${level+1} em ${money(next)}%`:'Sem próximo requisito cadastrado.'}</small></div><div class="exp-mini-progress"><span style="width:${next?Math.min(100,Math.round(exp/next*100)):100}%"></span></div></div><form id="adminExpForm" class="exp-admin-form"><select id="adminExpSource">${opts}</select><input id="adminExpCustom" type="number" min="1" step="1" placeholder="EXP (%)" disabled><input id="adminExpDetail" placeholder="Evento, missão, torneio ou referência"><input id="adminExpReason" class="wide" placeholder="Observação / motivo"><button class="gold" type="submit">＋ Registrar EXP</button><div class="error" id="adminExpError"></div></form><div class="exp-rules-grid">${fixed.map(r=>`<span><b>${escapeHtml(r[1])}</b><small>${r[2]===null?'Variável':`${r[2]}%`}</small></span>`).join('')}</div><div class="eyebrow" style="margin-top:18px">HISTÓRICO DE EXP</div><div class="history">${hist}</div></div><p class="admin-editor-note">O sistema associa automaticamente níveis ímpares a Ativações e níveis pares a Magias Exclusivas. Cadastre as páginas que o Mago conquista conforme a evolução. A EXP é acumulada em porcentagem e volta a zero quando o requisito do próximo nível é alcançado.</p><form id="adminGrimoireForm" class="admin-form"><input type="hidden" id="adminGrimoireId"><input id="adminGrimoireLevel" type="number" min="1" placeholder="Nível" required><input id="adminGrimoireName" class="full" placeholder="Nome da magia" required><textarea id="adminGrimoireDescription" class="full" placeholder="Descrição / efeito da magia"></textarea><input id="adminGrimoireOrder" type="number" value="0" placeholder="Ordem"><div class="editor-actions"><button class="gold" type="submit">＋ Salvar página</button><button class="outline dark-outline" type="button" id="adminGrimoireClear">Limpar</button></div><div class="error" id="adminGrimoireError"></div></form><div class="eyebrow" style="margin-top:18px">PÁGINAS REGISTRADAS</div><div class="admin-grimoire-list">${list}</div></div>`;
}

function renderEditor(p){
  qs("#adminEditor").innerHTML=`<div class="editor-head"><div><p class="eyebrow">EDITANDO JOGADOR</p><h3>${escapeHtml(displayPlayerName(p))}</h3><p>${escapeHtml(p.house||"Sem Casa")} · ${escapeHtml(p.patent||"Sem patente")}</p></div><button class="icon-button" type="button" id="closeEditor">×</button></div>
  <div class="admin-tabs">
    ${adminTabButton("overview","Dados",true)}
    ${adminTabButton("economy","Economia")}
    ${adminTabButton("missions","Missões")}
    ${adminTabButton("cards","Cards")}
    ${adminTabButton("roles","Cargos")}
    ${String(p.grimoire||"").trim()?adminTabButton("grimoire","📖 Grimório"):""}
    ${adminTabButton("history","Histórico")}
  </div>
  <div class="admin-tab-panel active" data-admin-tab-panel="overview">${renderOverviewPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="economy">${renderEconomyPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="missions">${renderMissionsPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="cards">${renderAdminPlayerCardsPanel(p)}</div>
  <div class="admin-tab-panel" data-admin-tab-panel="roles">${renderRolesPanel(p)}</div>
  ${String(p.grimoire||"").trim()?`<div class="admin-tab-panel" data-admin-tab-panel="grimoire">${renderAdminGrimoirePanel(p)}</div>`:""}
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
  qs("#zeroYulsBtn")?.addEventListener("click",zeroSelectedPlayerYuls);
  qs("#missionBtn").addEventListener("click",launchMission);
  qs("#adminCardApply")?.addEventListener("click",applyAdminCardChange);
  qs("#adminCardSourceType")?.addEventListener("change",updateAdminCardSourceFields);
  updateAdminCardSourceFields();
  qsa("[data-admin-card-remove]").forEach(b=>b.addEventListener("click",()=>removeAdminCard(Number(b.dataset.adminCardRemove))));
  qsa("[data-mission-delete]").forEach(b=>b.addEventListener("click",()=>deleteMission(Number(b.dataset.missionDelete))));
  qs("#adminExpSource")?.addEventListener("change",()=>{const src=qs("#adminExpSource")?.value||"",custom=qs("#adminExpCustom");const fixed={MISSAO_LUTA:10,MISSAO_RECRUTA:15,EVENTO_PARTICIPACAO:2,TORNEIO_PARTICIPACAO:5,EXAME_VENCEDOR:12,EVENTO_VITORIA:7,TORNEIO_VITORIA:20,RANKING_VITORIA:2,JUIZ_INTER:4,JUIZ_SENIOR:8,ORGANIZAR_EXAME:10};const val=fixed[src];if(custom){custom.disabled=val===undefined;custom.value=val===undefined?"":String(val);}});
  qs("#adminExpForm")?.addEventListener("submit",async e=>{e.preventDefault();const err=qs("#adminExpError");err.textContent="";const src=qs("#adminExpSource")?.value||"AJUSTE",fixed={MISSAO_LUTA:10,MISSAO_RECRUTA:15,EVENTO_PARTICIPACAO:2,TORNEIO_PARTICIPACAO:5,EXAME_VENCEDOR:12,EVENTO_VITORIA:7,TORNEIO_VITORIA:20,RANKING_VITORIA:2,JUIZ_INTER:4,JUIZ_SENIOR:8,ORGANIZAR_EXAME:10},amount=Number(fixed[src] ?? (qs("#adminExpCustom")?.value || 0));try{const d=await adminApi(`/api/admin/players/${p.id}/exp`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount,source_code:src,source_detail:qs("#adminExpDetail")?.value||"",reason:qs("#adminExpReason")?.value||""})});await selectAdminPlayer(p.id);alert(d.upgraded?`EXP registrada e Grimório elevado para o nível ${d.level}. A nova página pode ser registrada.`:"EXP registrada.");}catch(ex){err.textContent=ex.message}});
  qs("#adminGrimoireForm")?.addEventListener("submit",async e=>{e.preventDefault();const id=qs("#adminGrimoireId").value;const err=qs("#adminGrimoireError");err.textContent="";try{await adminApi(id?`/api/admin/grimoire/${id}`:`/api/admin/grimoire/${p.id}`,{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({level_number:Number(qs("#adminGrimoireLevel").value),magic_name:qs("#adminGrimoireName").value,description:qs("#adminGrimoireDescription").value,sort_order:Number(qs("#adminGrimoireOrder").value||0)})});await selectAdminPlayer(p.id);alert(id?"Página atualizada.":"Página do grimório registrada.")}catch(ex){err.textContent=ex.message}});
  qs("#adminGrimoireClear")?.addEventListener("click",()=>{qs("#adminGrimoireId").value="";qs("#adminGrimoireLevel").value="";qs("#adminGrimoireName").value="";qs("#adminGrimoireDescription").value="";qs("#adminGrimoireOrder").value="0";});
  qsa("[data-grimoire-edit]").forEach(b=>b.addEventListener("click",()=>{const pg=(p.grimoirePages||[]).find(x=>Number(x.id)===Number(b.dataset.grimoireEdit));if(!pg)return;qs("#adminGrimoireId").value=pg.id;qs("#adminGrimoireLevel").value=pg.level_number;qs("#adminGrimoireName").value=pg.magic_name;qs("#adminGrimoireDescription").value=pg.description||"";qs("#adminGrimoireOrder").value=pg.sort_order||0;qs("#adminGrimoireForm")?.scrollIntoView({behavior:"smooth",block:"center"});}));
  qsa("[data-grimoire-delete]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Excluir esta página do Grimório?"))return;try{await adminApi(`/api/admin/grimoire/${b.dataset.grimoireDelete}`,{method:"DELETE"});await selectAdminPlayer(p.id);}catch(ex){alert(ex.message)}}));
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

async function zeroSelectedPlayerYuls(){
  if(!state.selectedPlayer)return;
  const current=Number(state.selectedPlayer.yuls||0);
  if(current===0){alert("Este jogador já está com 0 Yuls.");return}
  if(!confirm(`Zerar os ${money(current)} Yuls de ${displayPlayerName(state.selectedPlayer)}?\n\nA operação será registrada no histórico financeiro e não apagará as movimentações anteriores.`))return;
  const reason=prompt("Motivo do acerto de saldo:","Acerto de saldo para transferência");
  if(reason===null)return;
  try{
    const d=await adminApi(`/api/admin/players/${state.selectedPlayer.id}/yuls/reset`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:reason.trim()||"Acerto de saldo para transferência"})});
    await selectAdminPlayer(state.selectedPlayer.id);
    alert(d.changed?`Saldo zerado. ${money(current)} Yuls foram registrados como ajuste.`:d.message);
    if(state.me&&Number(state.me.id)===Number(state.selectedPlayer.id)){await refreshDashboardStateOnly();}
  }catch(ex){alert(ex.message)}
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
  const active=Number(state.selectedPlayer.active??1);
  const next=active?0:1;
  const action=next?"reativar":"suspender";
  if(!confirm(`Deseja ${action} o acesso de ${displayPlayerName(state.selectedPlayer)}? O cadastro e o histórico serão preservados.`))return;
  try{
    await adminApi(`/api/admin/players/${state.selectedPlayer.id}/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:next})});
    await initAdmin(); await selectAdminPlayer(state.selectedPlayer.id);
    alert(next?"Acesso reativado.":"Acesso suspenso.");
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
["adminHouseFilter","adminPatentFilter","adminRoleFilter","adminVisibilityFilter","adminStatusFilter","adminSort"].forEach(id=>{
  const el=qs("#"+id);if(!el)return;
  el.onchange=()=>{
    if(id==="adminHouseFilter")state.adminFilters.house=el.value;
    if(id==="adminPatentFilter")state.adminFilters.patent=el.value;
    if(id==="adminRoleFilter")state.adminFilters.role=el.value;
    if(id==="adminVisibilityFilter")state.adminFilters.visibility=el.value;
    if(id==="adminStatusFilter")state.adminFilters.status=el.value;
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
qs("#adminAuditRefresh")?.addEventListener("click",loadAdminAudit);
["adminAuditSearch","adminAuditSource","adminAuditFrom","adminAuditTo"].forEach(id=>qs("#"+id)?.addEventListener(id==="adminAuditSearch"?"input":"change",()=>{clearTimeout(window.__auditTimer);window.__auditTimer=setTimeout(loadAdminAudit,id==="adminAuditSearch"?250:0)}));
qs("#adminEconomyRefresh")?.addEventListener("click",loadAdminEconomy);
qs("#adminEconomyStatus")?.addEventListener("change",loadAdminEconomy);
qs("#adminEconomyForm")?.addEventListener("submit",async e=>{e.preventDefault();const err=qs('#adminEconomyError');err.textContent='';const body={player_id:Number(qs('#economyPlayer').value),currency:qs('#economyCurrency').value,amount:Number(qs('#economyAmount').value),activity_date:qs('#economyDate').value,source_type:qs('#economySource').value.trim()||'ADMINISTRATIVO',reason:qs('#economyReason').value.trim()};try{await adminApi('/api/admin/economy/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});e.target.reset();await loadAdminEconomy();alert('Transação criada e enviada para aprovação.');}catch(ex){err.textContent=ex.message}});
qs("#newsForm")?.addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await adminApi("/api/admin/news",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();alert("Notícia publicada.");await loadAdminEditorial();await loadHome();if(state.page==="jornal")loadEditions();}catch(ex){alert(ex.message)}});
qs("#editionForm")?.addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await adminApi("/api/admin/editions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();alert("Edição publicada.");await loadAdminEditorial();await loadHome();if(state.page==="jornal")loadEditions();}catch(ex){alert(ex.message)}});
qs("#adminLoginForm")?.addEventListener("submit",adminLogin);
qs("#adminUserForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const err=qs("#adminUserError");if(err)err.textContent="";
  const b=Object.fromEntries(new FormData(e.target).entries());
  try{await adminApi("/api/admin/admins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();await loadAdminUsers();alert("Administrador criado com sucesso.");}
  catch(ex){if(err)err.textContent=ex.message}
});
qs("#exitAdminPanelBtn")?.addEventListener("click",()=>{go("home")});
qs("#logoutAdminBtn").addEventListener("click",async()=>{try{await api("/api/admin/logout",{method:"POST"})}catch{} state.admin=false;state.adminUser=null;state.adminKey=null;clearStoredAdminKey();state.selectedPlayer=null;setAdminNav();go("home")});

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

async function loadAdminCards(){
  try{
    const d=await adminApi("/api/admin/cards");
    state.adminCards=d.cards||[];state.cardCategories=d.categories||[];state.cardOrigins=d.origins||[];state.cardElementTypes=d.element_types||[];state.cardCostTypes=d.cost_types||[];state.cardDamageTypes=d.damage_types||[];state.cardStatuses=d.statuses||[];
    renderAdminCardCatalog();
  }catch(e){console.error(e)}
}

function populateCardSelects(){
  const cat=qs("#adminCardCategory"),origin=qs("#cardOrigin"),damageType=qs("#cardDamageType");
  if(cat)cat.innerHTML=(state.cardCategories||[]).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  if(origin)origin.innerHTML=(state.cardOrigins||[]).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  if(damageType)damageType.innerHTML=(state.cardDamageTypes||["DANO_BRUTO","DANO_CONTINUO","DANO_DIRETO","SEM_DANO"]).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x.replaceAll('_',' '))}</option>`).join("");
}
function resetCardForm(){
  const f=qs("#cardForm");if(!f)return;f.reset();qs("#cardId").value="";populateCardSelects();
  qs("#adminCardCategory").value="Outros";qs("#cardOrigin").value="Exclusivo";qs("#cardElementType").value="NAO_ELEMENTAL";qs("#cardCostType").value="SEM_CUSTO";qs("#cardDamageType").value="SEM_DANO";qs("#cardStatus").value="ATIVO";qs("#cardPower").value=0;qs("#cardDamage").value=0;qs("#cardSaveBtn").textContent="Criar card";qs("#cardError").textContent="";
}
function editCardForm(id){
  const c=state.adminCards.find(x=>Number(x.id)===id);if(!c)return;
  qs("#cardId").value=c.id;qs("#cardNamePt").value=c.name_pt||c.name||"";qs("#cardNameJp").value=c.name_jp||"";populateCardSelects();qs("#adminCardCategory").value=c.category||"Outros";qs("#cardOrigin").value=c.origin||"Exclusivo";qs("#cardElementType").value=c.element_type||"NAO_ELEMENTAL";qs("#cardElement").value=c.element||"";qs("#cardCostType").value=c.cost_type||"SEM_CUSTO";qs("#cardCost").value=c.cost||"";qs("#cardPower").value=c.power_value||0;qs("#cardDamage").value=c.damage_value||0;qs("#cardDamageType").value=c.damage_type||"SEM_DANO";qs("#cardOrder").value=c.sort_order||0;qs("#cardStatus").value=c.status||"ATIVO";qs("#cardDescription").value=c.description||"";qs("#cardSaveBtn").textContent="Salvar card";qs("#cardError").textContent="";qs("#cardNamePt").focus();
}
function renderAdminCardCatalog(){
  const list=qs("#adminCardCatalogList");if(!list)return;populateCardSelects();
  list.innerHTML=(state.adminCards||[]).map(c=>`<div class="card-catalog-item"><div><b>${escapeHtml(c.name_pt||c.name)}</b><small>${c.name_jp?escapeHtml(c.name_jp)+" • ":""}${escapeHtml(c.category)} • Poder ${Number(c.power_value||0)} • Dano ${Number(c.damage_value||0)} (${escapeHtml((c.damage_type||'SEM_DANO').replaceAll('_',' '))}) • ${escapeHtml(c.origin)} • ${c.players} jogador(es)}${c.element_type==="ELEMENTAL"&&c.element?` • ${escapeHtml(c.element)}`:""}${c.status!=="ATIVO"?" • INATIVO":""}</small></div><div class="card-catalog-actions"><button type="button" data-card-edit="${c.id}">✎</button><button type="button" class="delete" data-card-delete="${c.id}">×</button></div></div>`).join("")||`<div class="admin-history-empty">Nenhum card cadastrado.</div>`;
  qsa("[data-card-edit]").forEach(b=>b.onclick=()=>editCardForm(Number(b.dataset.cardEdit)));qsa("[data-card-delete]").forEach(b=>b.onclick=()=>deleteCard(Number(b.dataset.cardDelete)));
}
async function deleteCard(id){const c=(state.adminCards||[]).find(x=>Number(x.id)===id);if(!c)return;if(!confirm(`Excluir o card "${c.name_pt||c.name}"?`))return;try{await adminApi(`/api/admin/cards/${id}`,{method:"DELETE"});if(Number(qs("#cardId").value)===id)resetCardForm();await loadAdminCards();if(state.selectedPlayer)await selectAdminPlayer(state.selectedPlayer.id);alert("Card excluído.");}catch(e){alert(e.message)}}

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
    renderAdminEditions();
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

async function loadAdminLibrary(){try{const d=await adminApi("/api/admin/library");state.adminLibrary=d.items||[];renderAdminLibrary();}catch(e){console.error(e)}}
function clearAdminLibraryForm(){qs("#adminLibraryForm")?.reset();qs("#adminLibraryId").value="";qs("#adminLibraryIcon").value="📚";qs("#adminLibraryOrder").value="0";qs("#adminLibraryPublished").checked=true;qs("#adminLibraryError").textContent="";}
function renderAdminLibrary(){const el=qs("#adminLibraryList");if(!el)return;el.innerHTML=(state.adminLibrary||[]).map(x=>`<div class="editorial-item"><div class="editorial-item-head"><div><b>${escapeHtml(x.icon||"📚")} ${escapeHtml(x.title)}</b><small>${escapeHtml(x.category||"GERAL")} • ${x.published?"Publicado":"Arquivado"}</small></div><div class="editorial-actions"><button type="button" data-library-edit="${x.id}">✎</button><button type="button" data-library-delete="${x.id}">×</button></div></div></div>`).join("")||'<div style="font-size:10px;color:#888">Nenhum material cadastrado.</div>';qsa("[data-library-edit]").forEach(b=>b.onclick=()=>editAdminLibrary(Number(b.dataset.libraryEdit)));qsa("[data-library-delete]").forEach(b=>b.onclick=()=>deleteAdminLibrary(Number(b.dataset.libraryDelete)));}
function editAdminLibrary(id){const x=state.adminLibrary.find(i=>Number(i.id)===id);if(!x)return;qs("#adminLibraryId").value=x.id;qs("#adminLibraryTitle").value=x.title||"";qs("#adminLibraryCategory").value=x.category||"";qs("#adminLibraryIcon").value=x.icon||"📚";qs("#adminLibraryOrder").value=x.sort_order||0;qs("#adminLibraryUrl").value=x.url||"";qs("#adminLibraryDescription").value=x.description||"";qs("#adminLibraryContent").value=x.content||"";qs("#adminLibraryPublished").checked=Number(x.published)===1;}
async function deleteAdminLibrary(id){if(!confirm("Arquivar este material?"))return;try{await adminApi(`/api/admin/library/${id}`,{method:"DELETE"});await loadAdminLibrary();await loadLibrary();}catch(e){alert(e.message)}}

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
qs("#librarySearch")?.addEventListener("input",()=>loadLibrary());
qs("#libraryCategory")?.addEventListener("change",()=>loadLibrary());
qs("#adminLibraryClear")?.addEventListener("click",clearAdminLibraryForm);
qs("#adminLibraryForm")?.addEventListener("submit",async e=>{e.preventDefault();const id=qs("#adminLibraryId").value;const body={title:qs("#adminLibraryTitle").value,category:qs("#adminLibraryCategory").value,icon:qs("#adminLibraryIcon").value,sort_order:Number(qs("#adminLibraryOrder").value||0),url:qs("#adminLibraryUrl").value,description:qs("#adminLibraryDescription").value,content:qs("#adminLibraryContent").value,published:qs("#adminLibraryPublished").checked};try{await adminApi(id?`/api/admin/library/${id}`:"/api/admin/library",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});clearAdminLibraryForm();await loadAdminLibrary();await loadLibrary();alert(id?"Material atualizado.":"Material cadastrado.")}catch(ex){qs("#adminLibraryError").textContent=ex.message}});
qs("#scheduleSearch")?.addEventListener("input",()=>renderSchedule(state.schedule));
qs("#scheduleDateFilter")?.addEventListener("change",()=>renderSchedule(state.schedule));
qs("#scheduleTypeFilter")?.addEventListener("change",()=>renderSchedule(state.schedule));
qs("#scheduleForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target).entries());
  b.featured=qs("#scheduleFeatured").checked?1:0;
  b.published=qs("#schedulePublished").checked?1:0;
  b.event_id=qs("#scheduleEvent").value||null;b.mission_id=qs("#scheduleMission").value||null;
  try{
    if(b.id)await adminApi(`/api/admin/schedule/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    else await adminApi("/api/admin/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    resetScheduleForm();
    await loadAdminSchedule();
    await loadSchedule();
    alert("Cronograma salvo com sucesso.");
  }catch(ex){qs("#scheduleError").textContent=ex.message}
});
qs("#scheduleCancelBtn").addEventListener("click",resetScheduleForm);
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

function resetEditionForm(){
  const f=qs("#editionForm");if(!f)return;f.reset();
  qs("#editionId").value="";qs("#editionDate").value=new Date().toISOString().slice(0,10);
  qs("#editionPublished").checked=false;qs("#editionSaveBtn").textContent="Criar edição";qs("#editionError").textContent="";
}
function editEdition(id){
  const e=(state.adminEditions||[]).find(x=>Number(x.id)===id);if(!e)return;
  qs("#editionId").value=e.id;qs("#editionTitle").value=e.title||"";qs("#editionNumber").value=e.edition||"";
  qs("#editionDate").value=String(e.date||"").slice(0,10);qs("#editionCover").value=e.cover_url||"";qs("#editionPdf").value=e.pdf_url||"";
  qs("#editionDescription").value=e.description||"";qs("#editionPublished").checked=!!e.published;qs("#editionSaveBtn").textContent="Salvar edição";
  qs("#editionError").textContent="";qs("#editionTitle").focus();
}
function renderAdminEditions(){
  const el=qs("#adminEditionList");if(!el)return;
  el.innerHTML=(state.adminEditions||[]).map(e=>`<div class="editorial-item"><div class="editorial-item-head"><div><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.edition||"Edição")} • ${escapeHtml(String(e.date||""))} • ${e.article_count||0} matérias${e.published?"":" • Arquivada"}</small></div><div class="editorial-actions"><button type="button" data-edition-edit="${e.id}">✎</button><button type="button" class="delete" data-edition-delete="${e.id}">×</button></div></div></div>`).join("")||`<div style="font-size:10px;color:#888">Nenhuma edição cadastrada.</div>`;
  qsa("[data-edition-edit]").forEach(b=>b.onclick=()=>editEdition(Number(b.dataset.editionEdit)));
  qsa("[data-edition-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Arquivar esta edição? O histórico será preservado."))return;try{await adminApi(`/api/admin/editions/${b.dataset.editionDelete}`,{method:"DELETE"});await loadAdminArticles();alert("Edição arquivada.")}catch(e){alert(e.message)}});
}

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
qs("#editionCancelBtn").addEventListener("click",resetEditionForm);
qs("#editionForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const b={title:qs("#editionTitle").value.trim(),edition:qs("#editionNumber").value.trim(),date:qs("#editionDate").value,cover_url:qs("#editionCover").value.trim(),pdf_url:qs("#editionPdf").value.trim(),description:qs("#editionDescription").value.trim(),published:qs("#editionPublished").checked?1:0};
  const id=Number(qs("#editionId").value||0);
  try{await adminApi(id?`/api/admin/editions/${id}`:"/api/admin/editions",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});resetEditionForm();await loadAdminArticles();alert("Edição salva com sucesso.");}
  catch(ex){qs("#editionError").textContent=ex.message}
});
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
  b.power_value=Number(b.power_value||0);
  b.damage_value=Number(b.damage_value||0);b.damage_type=b.damage_type||"SEM_DANO";
  try{
    if(b.id)await adminApi(`/api/admin/cards/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    else await adminApi("/api/admin/cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    resetCardForm();await loadAdminCards();
    if(state.selectedPlayer)await selectAdminPlayer(state.selectedPlayer.id);
    alert("Card salvo com sucesso.");
  }catch(ex){qs("#cardError").textContent=ex.message}
});
qs("#cardCancelBtn").addEventListener("click",resetCardForm);
qs("#addCardCategoryBtn")?.addEventListener("click",async()=>{
  const input=qs("#newCardCategory"),name=(input?.value||"").trim();if(!name)return alert("Informe o nome da categoria.");
  try{await adminApi("/api/admin/card-categories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});input.value="";await loadAdminCards();alert("Categoria criada.");}
  catch(e){alert(e.message)}
});

qs("#announcementCancelBtn").addEventListener("click",resetAnnouncementForm);

async function tryAdminHash(){
  if(location.hash!=="#admin")return;
  history.replaceState(null,"",location.pathname+location.search);
  await refreshAdminSession();
  if(state.admin) go("admin"); else go("admin-login");
}

loadPortalPublicSettings();initGlobalSearch();initGuideNavigation();loadHome();tryMe();setAdminNav();tryAdminHash();


function populateNotificationPlayers(){const sel=qs("#notificationPlayer");if(!sel)return;const players=state.players||[];sel.innerHTML=`<option value="">Escolher jogador...</option>`+players.filter(p=>Number(p.active)!==0).map(p=>`<option value="${p.id}">${escapeHtml(displayPlayerName(p))}${p.house?` — ${escapeHtml(p.house)}`:""}</option>`).join("");}
async function loadAdminNotifications(){const list=qs("#adminNotificationList");if(!list)return;try{const d=await adminApi("/api/admin/notifications");list.innerHTML=(d.notifications||[]).map(n=>`<div class="editorial-item"><div><b>${escapeHtml(n.title)}</b><small>${escapeHtml(n.type)} • ${escapeHtml(n.nick)}${n.house?` • ${escapeHtml(n.house)}`:""} • ${new Date(n.created_at).toLocaleString("pt-BR")}</small></div></div>`).join("")||`<div class="admin-history-empty">Nenhuma notificação enviada.</div>`;}catch(e){list.innerHTML=`<div class="admin-history-empty">${escapeHtml(e.message)}</div>`;}}
qs("#adminNotificationForm")?.addEventListener("submit",async e=>{e.preventDefault();const err=qs("#notificationAdminError");err.textContent="";try{const all=qs("#notificationAllActive").checked;const pid=Number(qs("#notificationPlayer").value||0);if(!all&&!pid)throw new Error("Escolha um jogador ou marque todos os ativos.");await adminApi("/api/admin/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:qs("#notificationTitle").value,body:qs("#notificationBody").value,type:qs("#notificationType").value,link_page:qs("#notificationLink").value,all_active:all,player_id:pid})});e.target.reset();await loadAdminNotifications();alert("Notificação enviada.");}catch(ex){err.textContent=ex.message;}});
qs("#markAllNotifications")?.addEventListener("click",async()=>{try{await api("/api/me/notifications/read-all",{method:"POST"});await loadNotifications();}catch(e){alert(e.message)}});

// V53.1 ambiente
initSpadeAmbient();
setAmbientTheme(state.page);
