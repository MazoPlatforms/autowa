import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { setTimeout as sleep } from 'node:timers/promises';
const ALWAYS_SEND_GROUP_IDS=Object.freeze(['120363024245545077@g.us','120363328126166173@g.us']);
const SPECIAL_GROUP_REQUESTER='94779290433@s.whatsapp.net';
const targetsForJob=j=>{
  const recipients=Array.isArray(j.recipient_jids)?j.recipient_jids:[];
  const groups=Array.isArray(j.group_ids)?j.group_ids:[];
  return [...new Set(recipients.includes(SPECIAL_GROUP_REQUESTER)
    ? ALWAYS_SEND_GROUP_IDS
    : [...groups,...recipients])];
};
const jobs=fs.readdirSync('movies').filter(f=>f.endsWith('.json')).sort()
  .map(f=>JSON.parse(fs.readFileSync(path.join('movies',f),'utf8')))
  .filter(j=>j.enabled!==false && j.license_confirmed===true);
const selected=process.env.JOB_ID;
const queue=selected?jobs.filter(j=>j.id===selected || j.job_id===selected):jobs.filter(j=>!j.job_id);
if(selected&&!queue.length) throw Error('No eligible movie with ID '+selected);
if(!queue.length){console.log('No enabled jobs');process.exit(0);}
if(process.env.DRY_RUN==='1'){
  for(const j of queue) console.log(`DRY RUN: ${j.id} => ${targetsForJob(j).length} recipient(s), Telegram message ${j.telegram_message_id}`);
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
let sock,connectionClosed=true;
const logger=pino({level:'silent'});
async function connectWhatsApp(){
 const next=makeWASocket({auth:state,logger,markOnlineOnConnect:false,syncFullHistory:false,connectTimeoutMs:120000,defaultQueryTimeoutMs:120000});
 next.ev.on('creds.update',saveCreds);
 next.ev.on('connection.update',u=>{
  if(u.connection==='close'){
   if(sock===next)connectionClosed=true;
   console.error('WhatsApp disconnected during publishing:',u.lastDisconnect?.error?.message||'unknown','status:',u.lastDisconnect?.error?.output?.statusCode||'unknown');
  }
 });
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('WhatsApp connection timed out')),130000);
  const listener=u=>{
   if(u.connection==='open'){clearTimeout(timer);resolve();}
   if(u.connection==='close'){clearTimeout(timer);reject(Error('WhatsApp connection closed: '+(u.lastDisconnect?.error?.message||'unknown')));}
  };
  next.ev.on('connection.update',listener);
 }).catch(err=>{try{next.end();}catch{}throw err;});
 sock=next;connectionClosed=false;
 return next;
}
await connectWhatsApp();
async function reconnectWhatsApp(){
 for(let attempt=1;attempt<=5;attempt++){
  console.warn('WhatsApp reconnect attempt',attempt,'of 5');
  try{
   try{sock?.end();}catch{}
   await connectWhatsApp();
   console.log('WhatsApp reconnected successfully');
   return true;
  }catch(err){
   console.warn('WhatsApp reconnect failed:',err.message);
   if(attempt<5)await sleep(Math.min(30000,3000*2**(attempt-1)));
  }
 }
 return false;
}
// ARCHIVED REFERENCE — FAKE QUOTED REPLY / FORWARDING (INACTIVE).
// Kept solely as historical project notes. This block is not executed,
// imported, or attached to the WhatsApp message payload.
// These values do not establish a real participant request or forwarding history.
/*
const FAKE_REPLY_ENABLED = true;
const FAKE_REPLY_TEXT = "This movie was requested by our group participant.";
const FAKE_REPLY_PARTICIPANT = "94779290433@s.whatsapp.net";
const FORWARDING_ENABLED = true;
const FORWARDING_SCORE = 127;

// Historical metadata sketch (intentionally not wired to sendMessage):
const archivedMetadata = {
  quotedMessage: { conversation: FAKE_REPLY_TEXT },
  participant: FAKE_REPLY_PARTICIPANT,
  isForwarded: FORWARDING_ENABLED,
  forwardingScore: FORWARDING_SCORE
};
*/

let groups=await sock.groupFetchAllParticipating();

const miB=n=>(n/1048576).toFixed(1);
const FALLBACK_POSTER='https://i.ibb.co/TMJ6YCC4/IMG-33a2f581-8ff4-4a5e-9e64-e43c900000c2.png';
const STATUS_FOOTER='> Powered by Itz Maazin • https://mzn.is-a.dev/';
const formatDuration=seconds=>!Number.isFinite(seconds)||seconds<0?'Calculating…':seconds<60?Math.ceil(seconds)+'s':Math.floor(seconds/3600)?Math.floor(seconds/3600)+'h '+Math.floor(seconds%3600/60)+'m':Math.ceil(seconds/60)+'m';
const asciiBar=(done,total)=>{const pct=total>0?Math.max(0,Math.min(1,done/total)):0;const count=Math.round(pct*16);return '▏'+'▰'.repeat(count)+'▱'.repeat(16-count)+'▕ '+Math.round(pct*100)+'%';};
let posterCatalog=[];
try{const catalog=JSON.parse(fs.readFileSync('data/movies.json','utf8'));posterCatalog=Array.isArray(catalog)?catalog:Array.isArray(catalog.movies)?catalog.movies:[];}catch(err){console.warn('Poster catalog unavailable:',err.message);}
function requesterProgress(j){
 const jid=(j.recipient_jids||[]).find(v=>/^\d{8,15}@s\.whatsapp\.net$/.test(v));
 const movie=posterCatalog.find(m=>m.telegram_message_id===j.telegram_message_id)||{};
 const poster=String(j.poster||j.poster_url||movie.poster||'');
 const posterUrl=/^https:\/\/[^\s]+$/i.test(poster)?poster:FALLBACK_POSTER;
 const title=String(j.title||movie.title||'Movie').slice(0,130);
 const year=String(j.year||movie.year||'—'),quality=String(j.quality||movie.quality||'—');
 const size=Number(j.file_size||movie.file_size||0);
 const details=['*FilmGo*','', '*'+title+'*','Year: '+year,'Quality: '+quality,...(movie.genre?.length?['Genre: '+(Array.isArray(movie.genre)?movie.genre.join(', '):movie.genre)]:[]),''];
 let key=null,posterSent=false,last='',lastAt=0,chain=Promise.resolve();
 // Keep exactly one editable status message. It is intentionally state-only:
 // processing, downloading, and uploading. Never expose byte-level progress.
 const render=message=>details.join('\n')+message+(size?'\nFile size: '+miB(size)+' MiB':'')+'\n\n'+STATUS_FOOTER;
 const update=(message,force=false,stats=null)=>{
  if(!jid)return Promise.resolve();
  chain=chain.then(async()=>{
   const caption=render(message);
   if(!force&&(caption===last||Date.now()-lastAt<12000))return;
   try{
    if(!key){
     // Send the poster only once; keep a separate editable text message.
     // This also ensures the first "Preparing" update is the message edited later.
     if(!posterSent){
      try{await sock.sendMessage(jid,{image:{url:posterUrl},caption:'FilmGo · '+title+(year!=='—'?' ('+year+')':'')});}
      catch(err){
       if(posterUrl!==FALLBACK_POSTER){
        console.warn('Movie poster unavailable, trying fallback:',err.message);
        try{await sock.sendMessage(jid,{image:{url:FALLBACK_POSTER},caption:'FilmGo · '+title});}
        catch(fallbackErr){console.warn('Fallback poster unavailable:',fallbackErr.message);}
       }else console.warn('Fallback poster unavailable:',err.message);
      }
      posterSent=true;
     }
     const sent=await sock.sendMessage(jid,{text:caption});
     if(!sent?.key?.id)throw Error('Requester progress message has no message ID');
     key=sent.key;
    }else{
     await sock.sendMessage(jid,{text:caption,edit:key});
    }
    last=caption;lastAt=Date.now();
   }catch(err){console.warn('Requester status update unavailable:',err.message);if(/connection closed|socket.*closed/i.test(String(err.message)))connectionClosed=true;}
  });
  return chain;
 };
 const remove=()=>chain.then(async()=>{
  if(!jid||!key)return false;
  try{
   await sock.sendMessage(jid,{delete:key});
   key=null;
   return true;
  }catch(err){console.warn('Requester status cleanup unavailable:',err.message);return false;}
 });
 return {update,flush:()=>chain,remove};
}
async function downloadWithProgress(args,onProgress){
 await new Promise((resolve,reject)=>{
  const child=spawn('python3',args[0]==='telegram'?['src/telegram_media.py','download',...args.slice(1)]:['src/download.py',...args],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
   stdout+=chunk;
   const lines=stdout.split('\n');stdout=lines.pop();
   for(const line of lines){
    const match=/^PROGRESS (\d+) (\d+)$/.exec(line.trim());
    if(match)onProgress(Number(match[1]),Number(match[2]));
    else if(line.trim())console.log(line.trim());
   }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-5000);process.stderr.write(chunk);});
  child.on('error',reject);
  child.on('close',code=>code===0?resolve():reject(Error('Download failed (exit '+code+'): '+stderr.slice(-500))));
 });
}

let failures=0;
try{
 for(const j of queue){
  const file=path.join('movies',j.id+'.json');
  j.job_id=j.job_id || ('job-'+(process.env.GITHUB_RUN_ID||Date.now())+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1')+'-'+j.id);
  j.status='processing';
  j.started_at=new Date().toISOString();
  fs.writeFileSync(file,JSON.stringify(j,null,2)+'\n');
  let movieFailures=0;
  const progress=requesterProgress(j);
  try {
  await progress.update('⏳ Processing your request…',true);
  const dest=path.join('downloads',j.id+'.download');
  fs.mkdirSync('downloads',{recursive:true});
  console.log('Downloading',j.id);
  await progress.update('📥 Downloading your movie…',true);
  if(!Number.isSafeInteger(j.telegram_message_id)||j.telegram_message_id<=0)throw Error('Telegram media ID required');
  await downloadWithProgress(['telegram',String(j.telegram_message_id),dest],()=>{});
  const mediaBytes=fs.statSync(dest).size;
  console.log('Media ready:',mediaBytes,'bytes /',(mediaBytes/1048576).toFixed(2),'MiB (thumbnail excluded)');
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=format_name:stream=codec_type,codec_name','-of','json',dest],{encoding:'utf8',timeout:120000}));
  const formats=String(probe.format?.format_name||'').split(',');
  const isMkv=formats.includes('matroska')||formats.includes('webm');
  const isMp4=formats.includes('mov')||formats.includes('mp4')||formats.includes('m4a')||formats.includes('3gp')||formats.includes('3g2')||formats.includes('mj2');
  if(!isMkv&&!isMp4)throw Error('Unsupported downloaded media container: '+formats.join(','));
  const type=isMkv?'mkv':'mp4';
  const movieName=String(j.title||'Untitled').trim();
  const year=/^(19|20)\d{2}$/.test(String(j.year||''))?String(j.year):'';
  const quality=String(j.quality||'Unknown Quality');
  const filename=('mzn.is-a.dev - '+movieName+(year?' ('+year+')':'')+' - '+quality+'.'+type).split('').filter(ch=>ch!=='/'&&ch!=='\\'&&ch.charCodeAt(0)>=32).join('').slice(0,180);
  const caption=['🎬 FilmGo','','🎞️ '+movieName+(year?' ('+year+')':''),'','Enjoy the movie!','','> Powered by Itz Maazin • https://mzn.is-a.dev/'].join('\n');
  j.file_type=type;j.filename=filename;j.caption=caption;
  const thumbUrl='https://i.ibb.co/8L3RB6Qh/Itz-Maazin-20261027-155011.jpg';
  let thumbnail;
  if(thumbUrl){
   try{execFileSync('python3',['src/download.py',thumbUrl,'downloads/thumb.jpg','5000000'],{stdio:'inherit',timeout:120000});thumbnail=fs.readFileSync('downloads/thumb.jpg');}catch(e){console.warn('Thumbnail URL failed');}
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
  const targets=targetsForJob(j);
  let sentCount=0;
  await progress.update('📤 Uploading your movie…',true);
  for(const groupId of targets){
   if(groupId.endsWith('@g.us')&&!groups[groupId]){console.error('Not a member of group',groupId);failures++;movieFailures++;continue;}
   let ok=false;
   for(let attempt=1;attempt<=5;attempt++){
    if(connectionClosed){
     if(!await reconnectWhatsApp())break;
     if(groupId.endsWith('@g.us')){try{groups=await sock.groupFetchAllParticipating();}catch(err){console.warn('Group membership refresh failed:',err.message);}}
    }
    try{
     const result=await sock.sendMessage(groupId,{
      document:{url:path.resolve(dest)},mimetype:type==='mp4'?'video/mp4':'video/x-matroska',
      fileName:filename,caption,...(thumbnail?{jpegThumbnail:thumbnail}:{})
     });
     if(!result?.key?.id)throw Error('No message ID');
     console.log('Submitted',j.id,groupId,result.key.id);ok=true;sentCount++;break;
    }catch(e){console.error('Send failed',j.id,groupId,attempt,e.message);if(/connection closed|socket.*closed|connection lost|not connected/i.test(String(e.message)))connectionClosed=true;if(attempt<5){if(connectionClosed){console.warn('Reconnecting before retry');}else await sleep(Math.min(30000,5000*attempt));}}
   }
   if(!ok){failures++;movieFailures++;}
   await sleep(3000);
  }
  fs.rmSync(dest,{force:true});
  j.status=movieFailures?'failed':'submitted';
  } catch(err) { j.status='failed'; j.error=String(err.message).slice(0,250); failures++; console.error('Job failed',j.id,err.message); }
  if(j.status==='submitted') await progress.remove();
  else { await progress.update('❌ Processing failed. Please contact support with your request ID.',true); await progress.flush(); }
  j.finished_at=new Date().toISOString();
  fs.writeFileSync(file,JSON.stringify(j,null,2)+'\n');
 }
}finally{
 sock.end();
 fs.rmSync('.auth',{recursive:true,force:true});
}
if(failures)process.exitCode=1;
