from pathlib import Path
root=Path('/mnt/data/v72_work')
server=root/'server.js'; appjs=root/'public/app.js'; html=root/'public/index.html'; pkg=root/'package.json'
s=server.read_text()
# Make emblem records optionally include inactive (admin needs them)
s=s.replace('async function getEmblemRecords(){\n  const [e,s]=await Promise.all([\n    pool.query(`SELECT * FROM emblems WHERE active=1 ORDER BY category COLLATE "C", name COLLATE "C", id`),', 'async function getEmblemRecords({includeInactive=false}={}){\n  const [e,s]=await Promise.all([\n    pool.query(`SELECT * FROM emblems ${includeInactive?"":"WHERE active=1"} ORDER BY category COLLATE "C", name COLLATE "C", id`),', 1)
s=s.replace("    const emblems=await getEmblemRecords();\n    for(const e of emblems)e.owners=Number", "    const emblems=await getEmblemRecords({includeInactive:true});\n    for(const e of emblems)e.owners=Number", 1)
server.write_text(s)

j=appjs.read_text()
j=j.replace('simulator_trainings:["#adminSimulatorPanel"]};', 'simulator_trainings:["#adminSimulatorPanel"],emblems:["#adminEmblemsPanel"]};')
# Add revoke action to admin emblem rows
old="<div class=\"emblem-admin-actions\"><button type=\"button\" data-emblem-edit=\"${e.id}\">✎</button><button type=\"button\" data-emblem-grant=\"${e.id}\">🎁</button><button type=\"button\" class=\"delete\" data-emblem-delete=\"${e.id}\">×</button></div>"
new="<div class=\"emblem-admin-actions\"><button type=\"button\" data-emblem-edit=\"${e.id}\">✎</button><button type=\"button\" data-emblem-grant=\"${e.id}\">🎁</button><button type=\"button\" data-emblem-revoke=\"${e.id}\">↩</button><button type=\"button\" class=\"delete\" data-emblem-delete=\"${e.id}\">×</button></div>"
j=j.replace(old,new,1)
# Add revoke handler and change grant prompt? keep existing grant input + add revoke prompt
oldfn="qsa('[data-emblem-grant]').forEach(b=>b.onclick=()=>grantAdminEmblem(Number(b.dataset.emblemGrant)));}catch(e){list.innerHTML=`<div class=\"admin-history-empty\">${escapeHtml(e.message)}</div>`;}}"
newfn="qsa('[data-emblem-grant]').forEach(b=>b.onclick=()=>grantAdminEmblem(Number(b.dataset.emblemGrant)));qsa('[data-emblem-revoke]').forEach(b=>b.onclick=()=>revokeAdminEmblem(Number(b.dataset.emblemRevoke)));}catch(e){list.innerHTML=`<div class=\"admin-history-empty\">${escapeHtml(e.message)}</div>`;}}"
j=j.replace(oldfn,newfn,1)
insert="""async function revokeAdminEmblem(id){const playerId=Number(prompt('ID do jogador que perderá este Emblem:')||0);if(!playerId)return;if(!confirm('Revogar este Emblem deste jogador?'))return;try{await adminApi(`/api/admin/emblems/${id}/grant/${playerId}`,{method:'DELETE'});await loadAdminEmblems();alert('Emblem revogado.');}catch(e){alert(e.message)}}\n"""
j=j.replace('async function grantAdminEmblem(id)',insert+'async function grantAdminEmblem(id)',1)
appjs.write_text(j)

# Version + cache bust
import json
p=json.loads(pkg.read_text());p['version']='72.0.0';pkg.write_text(json.dumps(p,ensure_ascii=False,indent=2)+"\n")
h=html.read_text().replace('app.js?v=70.0.0-global-search','app.js?v=72.0.0-emblems')
html.write_text(h)
# update README version
readme=root/'README_V72_EMBLEMS.md'
r=readme.read_text(); readme.write_text(r+'\n## Interface\n- Área de Emblems para jogadores autenticados.\n- Até 5 Emblems em destaque por jogador.\n- Perfil público mostra apenas Emblems em destaque já conquistados.\n- Administração pode criar, editar, desativar, conceder e revogar Emblems.\n')
print('patched2')
