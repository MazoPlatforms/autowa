import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { setTimeout as sleep } from 'node:timers/promises';
const jobs=fs.readdirSync('movies').filter(f=>f.endsWith('.json')).sort()
  .map(f=>JSON.parse(fs.readFileSync(path.join('movies',f),'utf8')))
  .filter(j=>j.enabled && j.license_confirmed);
const selected=process.env.JOB_ID;
const queue=selected?jobs.filter(j=>j.id===selected || j.job_id===selected):jobs.filter(j=>!j.job_id);
if(selected&&!queue.length) throw Error('No eligible movie with ID '+selected);
if(!queue.length){console.log('No enabled jobs');process.exit(0);}
if(process.env.DRY_RUN==='1'){
  for(const j of queue) console.log(`DRY RUN: ${j.id} => ${j.group_ids.length} group(s), ${j.source_url}`);
  process.exit(0);
}
const raw=process.env.WA_AUTH_CREDS;
if(!raw) throw Error('WA_AUTH_CREDS missing from production environment');
let creds;
try { creds=JSON.parse(raw); } catch { throw Error('WA_AUTH_CREDS is not valid JSON'); }
if(!creds || typeof creds!=='object' || Array.isArray(creds) || creds.registered!==true || !creds.noiseKey) {
  throw Error('WA_AUTH_CREDS must be the plain-text contents of a registered Baileys creds.json');
}
fs.mkdirSync('.auth',{recursive:true,mode:0o700});
fs.writeFileSync(path.join('.auth','creds.json'),JSON.stringify(creds),{mode:0o600});
console.warn('Using creds.json-only auth: missing Signal key files or rotated session keys may cause authentication failures.');
const {state,saveCreds}=await useMultiFileAuthState('.auth');
const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false});
sock.ev.on('creds.update',saveCreds);
await new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('WhatsApp connection timed out')),90000);
 sock.ev.on('connection.update',u=>{
  if(u.connection==='open'){clearTimeout(timeout);resolve();}
  if(u.connection==='close'){clearTimeout(timeout);reject(Error('WhatsApp connection closed: '+(u.lastDisconnect?.error?.message||'unknown')));}
 });
});
const groups=await sock.groupFetchAllParticipating();
let failures=0;
try{
 for(const j of queue){
  const file=path.join('movies',j.id+'.json');
  j.job_id=j.job_id || ('job-'+(process.env.GITHUB_RUN_ID||Date.now())+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1')+'-'+j.id);
  j.status='processing';
  j.started_at=new Date().toISOString();
  fs.writeFileSync(file,JSON.stringify(j,null,2)+'\n');
  let movieFailures=0;
  try {
  const dest=path.join('downloads',j.id+'.'+j.file_type);
  fs.mkdirSync('downloads',{recursive:true});
  console.log('Downloading',j.id);
  execFileSync('python3',['src/download.py',j.source_url,dest],{stdio:'inherit',timeout:90*60*1000});
  let thumbnail;
  if(j.thumbnail_url){
   try{execFileSync('python3',['src/download.py',j.thumbnail_url,'downloads/thumb.jpg','5000000'],{stdio:'inherit',timeout:120000});thumbnail=fs.readFileSync('downloads/thumb.jpg');}catch(e){console.warn('Thumbnail URL failed');}
  }
  if(!thumbnail){
   try{
    const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',dest],{encoding:'utf8'}).trim());
    const seek=Math.max(0,Math.min(duration*.5,duration-1));
    execFileSync('ffmpeg',['-y','-v','error','-ss',String(seek),'-i',dest,'-frames:v','1','-vf','scale=320:-2','downloads/thumb.jpg'],{timeout:120000});
    thumbnail=fs.readFileSync('downloads/thumb.jpg');
   }catch(e){console.warn('Automatic thumbnail unavailable');}
  }
  if(thumbnail && !(thumbnail[0]===255&&thumbnail[1]===216&&thumbnail[2]===255)) thumbnail=undefined;
  for(const groupId of [...new Set(j.group_ids)]){
   if(!groups[groupId]){console.error('Not a member of group',groupId);failures++;movieFailures++;continue;}
   let ok=false;
   for(let attempt=1;attempt<=3;attempt++){
    try{
     const result=await sock.sendMessage(groupId,{
      document:{url:path.resolve(dest)},mimetype:j.file_type==='mp4'?'video/mp4':'video/x-matroska',
      fileName:j.filename,caption:j.caption,...(thumbnail?{jpegThumbnail:thumbnail}:{})
     });
     if(!result?.key?.id)throw Error('No message ID');
     console.log('Submitted',j.id,groupId,result.key.id);ok=true;break;
    }catch(e){console.error('Send failed',j.id,groupId,attempt,e.message);if(attempt<3)await sleep(10000*attempt);}
   }
   if(!ok){failures++;movieFailures++;}
   await sleep(3000);
  }
  fs.rmSync(dest,{force:true});
  j.status=movieFailures?'failed':'submitted';
  } catch(err) { j.status='failed'; j.error=String(err.message).slice(0,250); failures++; console.error('Job failed',j.id,err.message); }
  j.finished_at=new Date().toISOString();
  fs.writeFileSync(file,JSON.stringify(j,null,2)+'\n');
 }
}finally{
 sock.end();
 fs.rmSync('.auth',{recursive:true,force:true});
}
if(failures)process.exitCode=1;
