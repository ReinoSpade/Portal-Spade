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
  if(page==="dashboard") renderDashboard();
  if(page==="admin" && state.admin) initAdmin();
}

qsa("[data-page]").forEach(el=>el.addEventListener("click",()=>go(el.dataset.page)));
qs("#hamb").addEventListener("click",()=>qs("#nav").classList.toggle("open"));

async function api(url,options={}){
  const r=await fetch(url,options);let d={};
  try{d=await r.json()}catch{}
  if(!r.ok)throw new Error(d.error||"Ocorreu um erro.");
  return d;
}

async function loadHome(){
  try{
    const d=await api("/api/home");state.data=d;
    qs("#newsGrid").innerHTML=d.news.length?d.news.map((n,i)=>`<article class="news-card ${i===0?"featured":""}"><div class="art">${i===0?"♠":"◆"}</div><div><span class="tag">${escapeHtml(n.category)}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.excerpt)}</p></div></article>`).join(""):`<div class="panel"><h3>Nenhuma notícia publicada</h3><p>Use o painel administrativo para publicar a primeira.</p></div>`;
    const e=d.editions[0];qs("#editionTitle").textContent=e?e.title:"Nenhuma edição publicada";qs("#editionDesc").textContent=e?e.description:"Adicione uma edição pelo painel administrativo.";
  }catch(e){qs("#newsGrid").innerHTML=`<div class="panel"><h3>Erro ao carregar</h3><p>${escapeHtml(e.message)}</p></div>`}
}

async function loadEditions(){
  const d=state.data||await api("/api/home");const el=qs("#editions");
  el.innerHTML=d.editions.length?d.editions.map(e=>`<article class="edition"><div class="edition-cover"><span>♠</span><small>${escapeHtml(e.edition||"EDIÇÃO")}</small><b>SPADE</b><em>${escapeHtml(e.date||"")}</em></div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description)}</p>${e.pdf_url?`<a class="gold small" href="${escapeHtml(e.pdf_url)}" target="_blank" rel="noopener">Abrir PDF</a>`:`<span class="tag">PDF AINDA NÃO ADICIONADO</span>`}</article>`).join(""):`<div class="panel"><h3>Sem edições</h3><p>Publique a primeira pelo painel.</p></div>`;
}
async function loadPlayers(){
  const d=await api("/api/players");state.players=d.players;renderPlayers("");
  qs("#playerSearch").oninput=e=>renderPlayers(e.target.value);
}
function renderPlayers(term){
  const t=term.trim().toLowerCase();const p=(state.players||[]).filter(x=>`${x.nick} ${x.identifier} ${x.house}`.toLowerCase().includes(t));
  qs("#playerGrid").innerHTML=p.map(x=>`<article class="player-card"><h3>${escapeHtml(x.nick)}${escapeHtml(x.number)}</h3><p><b>Casa:</b> ${escapeHtml(x.house||"—")}<br><b>Patente:</b> ${escapeHtml(x.patent)}<br><b>Missões:</b> ${x.missions}<br><b>Yuls:</b> 🪙 ${money(x.yuls)}</p></article>`).join("")||`<div class="panel"><h3>Nenhum jogador encontrado.</h3></div>`;
}
async function loadHouses(){
  const d=state.data||await api("/api/home");state.data=d;
  qs("#houseGrid").innerHTML=d.houses.length?d.houses.map(h=>`<article class="house-card"><h3>🏰 ${escapeHtml(h.house)}</h3><p><b>${h.count}</b> jogadores cadastrados<br><b>${h.missions}</b> missões somadas</p></article>`).join(""):`<div class="panel"><h3>Nenhuma Casa cadastrada.</h3></div>`;
}
async function loadRanking(){
  const d=await api("/api/ranking");qs("#rankingBody").innerHTML=d.ranking.map((x,i)=>`<tr><td>${x.ranking||i+1}</td><td><b>${escapeHtml(x.nick)}</b></td><td>${escapeHtml(x.house||"—")}</td><td>${x.missions}</td><td>🪙 ${money(x.yuls)}</td></tr>`).join("")||`<tr><td colspan="5">Nenhum ranking cadastrado.</td></tr>`;
}

async function loadPlayerYuls(){
  const balanceEl=qs("#playerYulsBalance");
  const historyEl=qs("#playerYulsHistory");
  if(!balanceEl||!historyEl)return;
  try{
    const d=await api("/api/me/yuls");
    balanceEl.textContent=`🪙 ${money(d.balance)}`;
    historyEl.innerHTML=d.history.length
      ? d.history.map(h=>`<div class="player-yuls-row"><div class="reason"><b>${escapeHtml(h.reason||"Movimentação")}</b><small>${new Date(h.created_at).toLocaleString("pt-BR")}</small></div><div class="change ${h.amount>=0?"plus":"minus"}">${h.amount>=0?"+":""}${money(h.amount)}<small>Saldo: ${money(h.balance_after)}</small></div></div>`).join("")
      : `<div class="yuls-empty">Nenhuma movimentação registrada.</div>`;
  }catch(e){
    historyEl.innerHTML=`<div class="yuls-empty">${escapeHtml(e.message)}</div>`;
  }
}

function renderDashboard(){
 if(!state.me)return go("login");
 qs("#dashName").textContent=`Bem-vindo, ${state.me.nick}.`;
 qs("#dash").innerHTML=`<div class="dash-grid"><div class="dash-main"><div class="dash-ident"><div class="avatar">♠</div><div><h2>${escapeHtml(state.me.nick)}${escapeHtml(state.me.number)}</h2><p>${escapeHtml(state.me.patent)} • ${escapeHtml(state.me.house||"Casa não definida")}</p></div></div><div class="profile-lines"><div><small>Cargo</small><b>${escapeHtml(state.me.role||"Não definido")}</b></div><div><small>Grimório</small><b>${escapeHtml(state.me.grimoire||"Não definido")}</b></div></div><div class="profile-lines"><div><small>Casa</small><b>${escapeHtml(state.me.house||"Não definida")}</b></div><div><small>Ranking</small><b>${state.me.ranking||"—"}</b></div></div></div><div class="dash-status"><p class="eyebrow">STATUS</p><div class="stats"><div class="stat"><small>❤️ HP</small><b>${state.me.hp}</b></div><div class="stat"><small>♦️ Mana</small><b>${state.me.mana}</b></div><div class="stat"><small>📋 Missões</small><b>${state.me.missions}</b></div><div class="stat yuls"><small>🪙 Yuls</small><b>${money(state.me.yuls)}</b></div></div></div></div><div class="panel" style="margin-top:12px"><p class="eyebrow">CONQUISTAS</p><h3>${state.me.achievements} conquistas registradas</h3><p>Os dados serão atualizados pela administração do RPG.</p></div>`;
 loadPlayerYuls();
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
  qs("#adminPlayerList").innerHTML=filtered.map(p=>`<button class="admin-player ${state.selectedPlayer?.id===p.id?"selected":""}" data-player-id="${p.id}" type="button"><span><b>${escapeHtml(p.nick)}${escapeHtml(p.number)}</b><small>${escapeHtml(p.house||"Sem Casa")} · ${escapeHtml(p.patent)} · ${p.has_password?"🔐 senha definida":"⚠️ sem senha"}</small></span><span class="player-yuls">🪙 ${money(p.yuls)}</span></button>`).join("")||`<div style="padding:30px;text-align:center;color:#888;font-size:11px">Nenhum jogador encontrado.</div>`;
  qsa(".admin-player").forEach(b=>b.addEventListener("click",()=>selectAdminPlayer(Number(b.dataset.playerId))));
}

async function selectAdminPlayer(id){
  try{
    const d=await adminApi(`/api/admin/players/${id}`);state.selectedPlayer={...d.player,history:d.history};
    renderAdminList(state.players,qs("#adminSearch").value);
    renderEditor(state.selectedPlayer);
  }catch(e){alert(e.message)}
}

function renderEditor(p){
  const hist=(p.history||[]).map(h=>`<div class="history-row"><span>${escapeHtml(h.reason||"Movimentação")}<br><small>${escapeHtml(h.created_at||"")}</small></span><b class="${h.amount>=0?"plus":"minus"}">${h.amount>=0?"+":""}${money(h.amount)} → ${money(h.balance_after)}</b></div>`).join("")||`<div style="font-size:10px;color:#888;padding:8px 0">Nenhuma movimentação registrada.</div>`;
  qs("#adminEditor").innerHTML=`<div class="editor-head"><div><p class="eyebrow">EDITANDO JOGADOR</p><h3>${escapeHtml(p.nick)}${escapeHtml(p.number)}</h3><p>${escapeHtml(p.identifier)}</p></div><button class="icon-button" type="button" id="closeEditor">×</button></div>
  <form id="editPlayerForm"><div class="form-grid">
  ${field("Nick","nick",p.nick)}${field("Número","number",p.number)}${field("Nova senha","password","","password")}${field("Casa","house",p.house)}${field("Patente","patent",p.patent)}${field("Cargo","role",p.role)}${field("Grimório","grimoire",p.grimoire)}
  ${field("❤️ HP","hp",p.hp,"number")}${field("♦️ Mana","mana",p.mana,"number")}${field("🪙 Yuls","yuls",p.yuls,"number")}${field("📋 Missões","missions",p.missions,"number")}${field("🏆 Conquistas","achievements",p.achievements,"number")}${field("Ranking","ranking",p.ranking,"number")}
  <div class="field full"><label>Perfil público</label><select name="public_profile"><option value="1" ${p.public_profile?"selected":""}>Visível</option><option value="0" ${!p.public_profile?"selected":""}>Oculto</option></select></div>
  </div><div class="editor-actions"><button class="gold" type="submit">Salvar alterações</button><button class="outline dark-outline" type="button" id="deletePlayerBtn">Excluir jogador</button></div><div class="error" id="editError"></div></form>
  <div class="yuls-box"><h4>🪙 Movimentação de Yuls</h4><p style="font-size:10px;color:#777;margin:0 0 12px">Use valor positivo para crédito e negativo para débito.</p><div class="yuls-form"><input id="yulsAmount" type="number" step="1" placeholder="+100 ou -100"><input id="yulsReason" placeholder="Motivo (pagamento, multa, recompensa...)"><button class="gold" id="yulsBtn" type="button">Lançar</button></div><div class="history">${hist}</div></div>`;
  qs("#closeEditor").addEventListener("click",()=>{state.selectedPlayer=null;renderAdminList(state.players,qs("#adminSearch").value);qs("#adminEditor").innerHTML=`<div class="empty-editor"><div class="empty-icon">♠</div><p class="eyebrow">SELECIONE UM JOGADOR</p><h3>Pronto para administrar</h3><p>Escolha um jogador ao lado para editar os dados ou lançar uma movimentação de Yuls.</p></div>`});
  qs("#editPlayerForm").addEventListener("submit",savePlayer);
  qs("#deletePlayerBtn").addEventListener("click",deleteSelectedPlayer);
  qs("#yulsBtn").addEventListener("click",launchYuls);
}
function field(label,name,value,type="text"){
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${escapeHtml(value??"")}"></div>`;
}
async function savePlayer(e){
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());
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
    await selectAdminPlayer(state.selectedPlayer.id);alert("Movimentação registrada."); if(state.me && Number(state.me.id)===Number(state.selectedPlayer.id)){ await tryMe(); if(state.page==="dashboard") loadPlayerYuls(); }
  }catch(ex){alert(ex.message)}
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
  ${field("Nick","nick","")}${field("Número","number","01")}${field("Senha inicial","password","","password")}${field("Casa","house","")}${field("Patente","patent","Cavaleiro Mágico Junior")}${field("Cargo","role","")}${field("Grimório","grimoire","")}${field("❤️ HP","hp",200,"number")}${field("♦️ Mana","mana",400,"number")}${field("🪙 Yuls","yuls",0,"number")}${field("📋 Missões","missions",0,"number")}${field("🏆 Conquistas","achievements",0,"number")}${field("Ranking","ranking",0,"number")}
  </div><div class="editor-actions"><button class="gold" type="submit">Cadastrar jogador</button></div><div class="error" id="newPlayerError"></div></form>`;
  qs("#closeEditor").addEventListener("click",()=>renderEditor({nick:"",number:"",history:[],public_profile:1}));
  qs("#newAdminPlayerForm").addEventListener("submit",async e=>{
    e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());
    try{const d=await adminApi("/api/admin/players",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});await initAdmin();await selectAdminPlayer(d.player.id);alert("Jogador cadastrado.");}
    catch(ex){qs("#newPlayerError").textContent=ex.message}
  });
}

qs("#adminSearch").addEventListener("input",e=>renderAdminList(state.players,e.target.value));
qs("#newPlayerBtn").addEventListener("click",openNewPlayer);
qs("#refreshAdminBtn").addEventListener("click",initAdmin);
qs("#newsForm").addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await adminApi("/api/admin/news",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();alert("Notícia publicada.");loadHome();}catch(ex){alert(ex.message)}});
qs("#editionForm").addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await adminApi("/api/admin/editions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});e.target.reset();alert("Edição publicada.");loadEditions();}catch(ex){alert(ex.message)}});
qs("#logoutAdminBtn").addEventListener("click",()=>{state.admin=false;state.adminKey=null;state.selectedPlayer=null;go("home")});

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
