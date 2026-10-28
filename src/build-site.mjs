import fs from 'node:fs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const movies=fs.readdirSync('movies').filter(x=>x.endsWith('.json')).sort().map(x=>JSON.parse(fs.readFileSync('movies/'+x,'utf8')));
const rows=movies.map(m=>'<tr><td>'+escape(m.title)+'</td><td>'+escape(m.job_id||'Not started')+'</td><td>'+escape(m.status||(m.enabled?'Pending':'Disabled'))+'</td><td>'+escape(m.started_at||'—')+'</td></tr>').join('');
fs.mkdirSync('site',{recursive:true});
fs.writeFileSync('site/index.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoWA Jobs</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:0 16px;background:#10121a;color:#f1f3ff}table{width:100%;border-collapse:collapse}td,th{padding:14px;text-align:left;border-bottom:1px solid #343744}h1{color:#aaa0ff}small{color:#a8abbc}</style><h1>AutoWA — Job Status</h1><small>Public status dashboard. Message delivery is not guaranteed by submission status.</small><table><thead><tr><th>Media</th><th>Job ID</th><th>Status</th><th>Started (UTC)</th></tr></thead><tbody>'+rows+'</tbody></table></html>');
console.log('Generated site/index.html');
