const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = __dirname;

function patchFile(file, replacements) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, 'utf8');
  let changed = false;
  for (const item of replacements) {
    const { name, find, replace } = item;
    if (text.includes(replace)) continue;
    if (!text.includes(find)) {
      console.warn(`[V73] Âncora não encontrada em ${file}: ${name}. A alteração foi ignorada.`);
      continue;
    }
    text = text.replace(find, replace);
    changed = true;
  }
  if (changed) fs.writeFileSync(full, text, 'utf8');
  return changed;
}

const serverChanges = [
  {
    name: 'helper de data de São Paulo + contador de missões',
    find: `function spadeToday(){\n  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());\n}\n\nfunction eventIsLiveSql(alias="events")`,
    replace: `function spadeToday(){\n  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());\n}\n\nfunction saoPauloTodaySql(){\n  return \`(NOW() AT TIME ZONE 'America/Sao_Paulo')::date\`;\n}\n\nasync function refreshMissionCounters(executor=pool){\n  await executor.query(\`\n    UPDATE players p\n    SET missions = COALESCE((\n      SELECT COUNT(*)::int\n      FROM missions m\n      WHERE m.player_id=p.id\n        AND lower(trim(m.status)) IN ('concluída','concluida','concluído','concluido')\n    ),0),\n    updated_at=NOW()\`);\n}\n\nfunction eventIsLiveSql(alias="events")`
  },
  {
    name: 'quadro de Status público',
    find: `app.get("/api/status-board", async (req,res)=>{\n  const viewer=await resolveViewer(req);\n  if(!viewer)return res.status(401).json({error:"Faça login para visualizar o quadro de status."});\n  const viewerId=viewer.type==="PLAYER"?viewer.id:null;`,
    replace: `app.get("/api/status-board", async (req,res)=>{\n  const viewer=await resolveViewer(req);\n  const viewerId=viewer?.type==="PLAYER"?viewer.id:null;`
  },
  {
    name: 'Status respeitando perfil público',
    find: `      WHERE ps.status_date >= (${saoPauloTodaySql()} - $1::int) AND COALESCE(p.active,1)=1\n      ORDER BY ps.status_date DESC,ps.updated_at DESC,ps.id DESC`,
    replace: `      WHERE ps.status_date >= (${saoPauloTodaySql()} - $1::int)\n        AND COALESCE(p.active,1)=1\n        AND COALESCE(p.public_profile,1)=1\n      ORDER BY ps.status_date DESC,ps.updated_at DESC,ps.id DESC`
  },
  {
    name: 'datas padrão no servidor em horário de São Paulo',
    find: 'new Date().toISOString().slice(0,10)',
    replace: 'spadeToday()'
  },
  {
    name: 'sincronização de missão ao registrar',
    find: `    let newMissionCount=Number(player.missions||0);\n    let newYuls=Number(player.yuls||0);\n    if(status==='Concluída'){\n      newMissionCount+=1;\n      newYuls+=rewardYuls;\n      await client.query('UPDATE players SET missions=$1,yuls=$2,updated_at=NOW() WHERE id=$3',[newMissionCount,newYuls,id]);\n      if(rewardYuls>0){\n        await client.query(\n          \`INSERT INTO yuls_history(player_id,amount,reason,balance_after) VALUES ($1,$2,$3,$4)\`,\n          [id,rewardYuls,\`Recompensa da missão: ${title}\`,newYuls]\n        );\n      }\n    }\n\n    await client.query('COMMIT');`,
    replace: `    let newYuls=Number(player.yuls||0);\n    if(status==='Concluída'){\n      newYuls+=rewardYuls;\n      await client.query('UPDATE players SET yuls=$1,updated_at=NOW() WHERE id=$2',[newYuls,id]);\n      if(rewardYuls>0){\n        await client.query(\n          \`INSERT INTO yuls_history(player_id,amount,reason,balance_after) VALUES ($1,$2,$3,$4)\`,\n          [id,rewardYuls,\`Recompensa da missão: ${title}\`,newYuls]\n        );\n      }\n    }\n    await refreshMissionCounters(client);\n\n    await client.query('COMMIT');`
  },
  {
    name: 'sincronização de missão ao excluir',
    find: `    if(mission.status==='Concluída'){\n      const pr=await client.query('SELECT * FROM players WHERE id=$1 FOR UPDATE',[mission.player_id]);\n      const player=pr.rows[0];\n      if(player){\n        const newMissionCount=Math.max(0,Number(player.missions||0)-1);\n        const newYuls=Math.max(0,Number(player.yuls||0)-Number(mission.reward_yuls||0));\n        await client.query('UPDATE players SET missions=$1,yuls=$2,updated_at=NOW() WHERE id=$3',[newMissionCount,newYuls,mission.player_id]);\n      }\n    }\n    await client.query('DELETE FROM missions WHERE id=$1 AND player_id=$2',[missionId,playerId]);\n    await client.query('COMMIT');`,
    replace: `    if(mission.status==='Concluída'){\n      const pr=await client.query('SELECT * FROM players WHERE id=$1 FOR UPDATE',[mission.player_id]);\n      const player=pr.rows[0];\n      if(player){\n        const newYuls=Math.max(0,Number(player.yuls||0)-Number(mission.reward_yuls||0));\n        await client.query('UPDATE players SET yuls=$1,updated_at=NOW() WHERE id=$2',[newYuls,mission.player_id]);\n      }\n    }\n    await client.query('DELETE FROM missions WHERE id=$1 AND player_id=$2',[missionId,playerId]);\n    await refreshMissionCounters(client);\n    await client.query('COMMIT');`
  },
  {
    name: 'sincronização das missões na inicialização',
    find: `initDatabase()\n  .then(async () => {\n    await seedOfficialLibrary();`,
    replace: `initDatabase()\n  .then(async () => {\n    await refreshMissionCounters();\n    await seedOfficialLibrary();`
  }
];

const appChanges = [
  {
    name: 'datas padrão no navegador em horário de São Paulo',
    find: `function statusDateLabel(value){`,
    replace: `function spadeTodayClient(){\n  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());\n  const get=k=>parts.find(p=>p.type===k)?.value||"";\n  return \`${get("year")}-${get("month")}-${get("day")}\`;\n}\n\nfunction statusDateLabel(value){`
  },
  {
    name: 'uso do helper de data no front-end',
    find: 'new Date().toISOString().slice(0,10)',
    replace: 'spadeTodayClient()'
  },
  {
    name: 'uso do helper de mês no front-end',
    find: 'new Date().toISOString().slice(0,7)',
    replace: 'spadeTodayClient().slice(0,7)'
  }
];

const serverChanged = patchFile('server.js', serverChanges);
const appChanged = patchFile(path.join('public','app.js'), appChanges);

for (const file of ['server.js','public/app.js']) {
  try {
    cp.execFileSync(process.execPath, ['--check', path.join(root,file)], { stdio:'inherit' });
  } catch (err) {
    console.error(`[V73] Falha de sintaxe em ${file}. O servidor não será iniciado.`);
    process.exit(1);
  }
}

console.log(`[V73] Runtime patch aplicado. server.js=${serverChanged?'alterado':'já atualizado'} app.js=${appChanged?'alterado':'já atualizado'}`);
