import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { setTimeout as sleep } from 'node:timers/promises';
const jobs=JSON.parse(fs.readFileSync('movies/jobs.json','utf8')).jobs.filter(j=>j.enabled);
const selected=process.env.JOB_ID;
const queue=selected?jobs.filter(j=>j.id===selected):jobs;
if(selected&&!queue.length) throw Error('No enabled job with ID '+selected);
if(!queue.length){console.log('No enabled jobs');process.exit(0);}
if(process.env.DRY_RUN==='1'){
  for(const j of queue) console.log(`DRY RUN: ${j.id} => ${j.group_ids.length} group(s), ${j.source_url}`);
  process.exit(0);
}
if(!process.env.WA_AUTH_B64) throw Error('WA_AUTH_B64 missing. See README.');
fs.mkdirSync('.auth',{recursive:true,mode:0o700});
const auth=JSON.parse(Buffer.from(process.env.WA_AUTH_B64,'base64').toString('utf8'));
if(!auth||typeof auth!=='object'||Array.isArray(auth)||!auth['creds.json']) throw Error('WA_AUTH_B64 must contain a filename-to-JSON auth bundle');
for(const [name,obj] of Object.entries(auth)){
  if(!/^[a-zA-Z0-9_.-]+\.json$/.test(name)) throw Error('Invalid auth filename');
  fs.writeFileSync(path.join('.auth',name),JSON.stringify(obj),{mode:0o600});
}
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
   if(!groups[groupId]){console.error('Not a member of group',groupId);failures++;continue;}
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
   if(!ok)failures++;
   await sleep(3000);
  }
  fs.rmSync(dest,{force:true});
 }
}finally{
 sock.end();
 fs.rmSync('.auth',{recursive:true,force:true});
}
if(failures)process.exitCode=1;
