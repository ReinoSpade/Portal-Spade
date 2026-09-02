const state={page:"home",me:null,admin:false,data:null};
const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
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
}
qsa("[data-page]").forEach(el=>el.addEventListener("click",()=>go(el.dataset.page)));
qs("#hamb").addEventListener("click",()=>qs("#nav").classList.toggle("open"));

async function api(url,options={}){const r=await fetch(url,options);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Ocorreu um erro.");return d}
function escapeHtml(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

async function loadHome(){
  try{
    const d=await api("/api/home"); state.data=d;
    qs("#newsGrid").innerHTML=d.news.length?d.news.map((n,i)=>`<article class="news-card ${i===0?"featured":""}"><div class="art">${i===0?"♠":"◆"}</div><div><span class="tag">${escapeHtml(n.category)}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.excerpt)}</p></div></article>`).join(""):`<div class="panel"><h3>Nenhuma notícia publicada</h3><p>Use o painel administrativo para publicar a primeira.</p></div>`;
    const e=d.editions[0]; qs("#editionTitle").textContent=e?e.title:"Nenhuma edição publicada";qs("#editionDesc").textContent=e?e.description:"Adicione uma edição pelo painel administrativo.";
  }catch(e){qs("#newsGrid").innerHTML=`<div class="panel"><h3>Erro ao carregar</h3><p>${escapeHtml(e.message)}</p></div>`}
}
async function loadEditions(){
  const d=state.data||await api("/api/home"); const el=qs("#editions");
  el.innerHTML=d.editions.length?d.editions.map(e=>`<article class="edition"><div class="edition-cover"><span>♠</span><small>${escapeHtml(e.edition||"EDIÇÃO")}</small><b>SPADE</b><em>${escapeHtml(e.date||"")}</em></div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description)}</p>${e.pdf_url?`<a class="gold small" href="${escapeHtml(e.pdf_url)}" target="_blank" rel="noopener">Abrir PDF</a>`:`<span class="tag">PDF AINDA NÃO ADICIONADO</span>`}</article>`).join(""):`<div class="panel"><h3>Sem edições</h3><p>Publique a primeira pelo painel.</p></div>`;
}
async function loadPlayers(){
  const d=await api("/api/players");state.players=d.players;renderPlayers("");
  qs("#playerSearch").oninput=e=>renderPlayers(e.target.value);
}
function renderPlayers(term){
  const t=term.trim().toLowerCase(); const p=(state.players||[]).filter(x=>`${x.nick} ${x.house}`.toLowerCase().includes(t));
  qs("#playerGrid").innerHTML=p.map(x=>`<article class="player-card"><h3>${escapeHtml(x.nick)}${escapeHtml(x.number)}</h3><p><b>Casa:</b> ${escapeHtml(x.house||"—")}<br><b>Patente:</b> ${escapeHtml(x.patent)}<br><b>Missões:</b> ${x.missions}<br><b>Yuls:</b> 🪙 ${Number(x.yuls).toLocaleString("pt-BR")}</p></article>`).join("")||`<div class="panel"><h3>Nenhum jogador encontrado.</h3></div>`;
}
async function loadHouses(){
  const d=state.data||await api("/api/home"); state.data=d;
  qs("#houseGrid").innerHTML=d.houses.length?d.houses.map(h=>`<article class="house-card"><h3>🏰 ${escapeHtml(h.house)}</h3><p><b>${h.count}</b> jogadores cadastrados<br><b>${h.missions}</b> missões somadas</p></article>`).join(""):`<div class="panel"><h3>Nenhuma Casa cadastrada.</h3></div>`;
}
async function loadRanking(){
 const d=await api("/api/ranking"); qs("#rankingBody").innerHTML=d.ranking.map((x,i)=>`<tr><td>${x.ranking||i+1}</td><td><b>${escapeHtml(x.nick)}${escapeHtml(x.identifier.slice(x.nick.length))}</b></td><td>${escapeHtml(x.house||"—")}</td><td>${x.missions}</td><td>🪙 ${Number(x.yuls).toLocaleString("pt-BR")}</td></tr>`).join("")||`<tr><td colspan="5">Nenhum ranking cadastrado.</td></tr>`;
}
function renderDashboard(){
 if(!state.me)return go("login");
 qs("#dashName").textContent=`Bem-vindo, ${state.me.nick}.`;
 qs("#dash").innerHTML=`<div class="dash-grid"><div class="dash-main"><div class="dash-ident"><div class="avatar">♠</div><div><h2>${escapeHtml(state.me.nick)}${escapeHtml(state.me.number)}</h2><p>${escapeHtml(state.me.patent)} • ${escapeHtml(state.me.house||"Casa não definida")}</p></div></div><div class="profile-lines"><div><small>Cargo</small><b>${escapeHtml(state.me.role||"Não definido")}</b></div><div><small>Grimório</small><b>${escapeHtml(state.me.grimoire||"Não definido")}</b></div></div><div class="profile-lines"><div><small>Casa</small><b>${escapeHtml(state.me.house||"Não definida")}</b></div><div><small>Ranking</small><b>${state.me.ranking||"—"}</b></div></div></div><div class="dash-status"><p class="eyebrow">STATUS</p><div class="stats"><div class="stat"><small>❤️ HP</small><b>${state.me.hp}</b></div><div class="stat"><small>♦️ Mana</small><b>${state.me.mana}</b></div><div class="stat"><small>📋 Missões</small><b>${state.me.missions}</b></div><div class="stat yuls"><small>🪙 Yuls</small><b>${Number(state.me.yuls).toLocaleString("pt-BR")}</b></div></div></div></div><div class="panel" style="margin-top:12px"><p class="eyebrow">CONQUISTAS</p><h3>${state.me.achievements} conquistas registradas</h3><p>Os dados serão atualizados pela administração do RPG.</p></div>`;
}
qs("#loginForm").addEventListener("submit",async e=>{
 e.preventDefault();const err=qs("#loginError");err.textContent="";
 try{const d=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:qs("#identifier").value.trim()})});state.me=d.player;qs("#loginNav").textContent="Meu painel";qs("#loginNav").dataset.page="dashboard";go("dashboard")}catch(ex){err.textContent=ex.message}
});
async function tryMe(){try{const d=await api("/api/me");state.me=d.player;qs("#loginNav").textContent="Meu painel";qs("#loginNav").dataset.page="dashboard";qs("#loginNav").onclick=()=>go("dashboard")}catch{}}
async function admin(key){
 state.adminKey=key;
 try{const d=await api("/api/admin/overview",{headers:{"x-admin-key":key}});state.admin=true;return d}catch(e){throw e}
}
async function initAdmin(){
 if(!state.admin)return;
 const d=await api("/api/admin/players",{headers:{"x-admin-key":state.adminKey}});
 qs("#adminPlayers").innerHTML=d.players.map(p=>`<tr><td>${escapeHtml(p.nick)}${escapeHtml(p.number)}</td><td>${escapeHtml(p.identifier)}</td><td>${escapeHtml(p.house)}</td><td>🪙 ${Number(p.yuls).toLocaleString("pt-BR")}</td><td>${p.missions}</td></tr>`).join("");
}
qs("#playerForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=new FormData(e.target),b=Object.fromEntries(f.entries());try{await api("/api/admin/players",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":state.adminKey},body:JSON.stringify(b)});e.target.reset();alert("Jogador cadastrado.");initAdmin()}catch(ex){qs("#playerError").textContent=ex.message}
});
qs("#newsForm").addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await api("/api/admin/news",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":state.adminKey},body:JSON.stringify(b)});e.target.reset();alert("Notícia publicada.");loadHome()}catch(ex){alert(ex.message)}});
qs("#editionForm").addEventListener("submit",async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{await api("/api/admin/editions",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":state.adminKey},body:JSON.stringify(b)});e.target.reset();alert("Edição publicada.");loadEditions()}catch(ex){alert(ex.message)}});
qs("#seedBtn").addEventListener("click",async()=>{try{await api("/api/admin/seed",{method:"POST",headers:{"x-admin-key":state.adminKey}});alert("Dados iniciais verificados/criados.");loadHome();initAdmin()}catch(e){alert(e.message)}});
qs("#logoutBtn").addEventListener("click",async()=>{await api("/api/logout",{method:"POST"});state.me=null;qs("#loginNav").textContent="Entrar";qs("#loginNav").dataset.page="login";go("login")});
loadHome();tryMe();

if(location.hash==="#admin"){
  setTimeout(async()=>{
    const key=prompt("Chave administrativa:");
    if(!key){go("home");return}
    try{
      await admin(key);
      go("admin");
      initAdmin();
    }catch(e){alert("Chave inválida.");go("home")}
  },50);
}
