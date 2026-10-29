import crypto from 'node:crypto';
import {logFilmGo} from './filmgo-logs.mjs';

const TOKEN=process.env.BOT_TOKEN||'';
const ADMIN_ID=String(process.env.FILMGO_BOT_ADMIN_ID||'7744742903');
const CHANNEL_ID=String(process.env.TELEGRAM_CHANNEL_ID||'');
const REDIS_URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const REDIS_TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';
const GH_TOKEN=process.env.GITHUB_DISPATCH_TOKEN||'';
const REPO=process.env.GITHUB_REPOSITORY||'';
const prefix='filmgo:bot:v1:';
const MAX_BYTES=2_000_000_000;
const QUALITY=/\b(360|480|720|1080|1440|2160)p\b/i;
const DRAFT_KEY=prefix+'draft:';
const normalize=v=>String(v||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'');
const filenameParts=name=>{const raw=String(name||'').replace(/\.[^.]+$/,'').replace(/[._-]+/g,' ');const year=raw.match(/\b(?:19|20)\d{2}\b/)?.[0];const quality=raw.match(QUALITY)?.[0]?.toLowerCase();const title=raw.split(/\b(?:19|20)\d{2}\b|\b(?:360|480|720|1080|1440|2160)p\b/i)[0].replace(/^@\S+\s*/,'').trim();return {title,year:Number(year)||null,quality};};
async function catalog(){const r=await fetch('https://raw.githubusercontent.com/'+REPO+'/main/data/movies.json?ts='+Date.now(),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error('Catalog unavailable');return (await r.json()).movies||[];}
async function draftGet(){const raw=await redis('GET',DRAFT_KEY+ADMIN_ID);return raw?JSON.parse(raw):null;}
async function draftSave(d){await redis('SET',DRAFT_KEY+ADMIN_ID,JSON.stringify(d),'EX',86400*7);}
function similarity(a,b){
 a=normalize(a);b=normalize(b);if(!a||!b)return 0;if(a===b)return 1;
 const previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){let diagonal=previous[0];previous[0]=i;for(let j=1;j<=b.length;j++){const old=previous[j];previous[j]=Math.min(previous[j]+1,previous[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=old;}}
 return 1-previous[b.length]/Math.max(a.length,b.length);
}
function guessMovie(file,movies){
 const p=filenameParts(file.file_name||'');
 const scored=movies.filter(m=>!p.year||m.year===p.year).map(m=>{
  let score=similarity(p.title,m.title);
  for(const v of Object.values(m.qualities||{}))score=Math.max(score,similarity(p.title,filenameParts(v.file_name).title));
  return {movie:m,score};
 }).sort((a,b)=>b.score-a.score);
 const winner=scored[0];
 return {parts:p,best:winner?.score>=0.7&&(!scored[1]||winner.score-scored[1].score>=0.1)?winner.movie:null,confidence:winner?.score||0};
}
async function omdbSearch(title,year){const key=process.env.OMDB_API_KEY;if(!key)return null;const url='https://www.omdbapi.com/?'+new URLSearchParams({apikey:key,t:title,...(year?{y:String(year)}:{})});const r=await fetch(url,{signal:AbortSignal.timeout(10000)});const j=await r.json();return j.Response==='True'?j:null;}
function movieFields(x){return {title:x.Title,year:Number(String(x.Year).slice(0,4)),imdb_id:x.imdbID,poster:x.Poster?.startsWith('https://')?x.Poster:null,genre:x.Genre,runtime:x.Runtime,director:x.Director,cast:x.Actors,plot:x.Plot};}
async function draftPrompt(d){const text=['FilmGo movie draft',d.title+' ('+d.year+')', 'Quality: '+d.quality,'File: '+d.file_name,'Metadata: '+(d.imdb_id?'OMDb '+d.imdb_id:'manual / existing'),d.replace?'Existing quality — replacement requires confirmation':d.existing?'New quality for existing movie':'New movie', 'Use /edit to change metadata, /poster to upload a poster, /cancel to discard.'].join('\n');await say(ADMIN_ID,text,{reply_markup:{inline_keyboard:[[{text:d.replace?'Confirm replacement':'Publish movie',callback_data:'fg:publish'},{text:'Cancel',callback_data:'fg:cancel'}]]}});}
async function posterUpload(d,photo){const info=await tg('getFile',{file_id:photo.file_id});if(!info.file_path||photo.file_size>5_000_000)throw Error('Poster too large or unavailable');const file=await fetch('https://api.telegram.org/file/bot'+TOKEN+'/'+info.file_path,{signal:AbortSignal.timeout(15000)});if(!file.ok)throw Error('Poster fetch failed');const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>5_000_000||bytes[0]!==255||bytes[1]!==216)throw Error('Only JPEG posters under 5 MB');const path='web/posters/'+crypto.randomBytes(12).toString('hex')+'.jpg';const [owner,name]=REPO.split('/');const result=await fetch('https://api.github.com/repos/'+owner+'/'+name+'/contents/'+path,{method:'PUT',headers:{Authorization:'Bearer '+GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({message:'Add FilmGo movie poster',content:Buffer.from(bytes).toString('base64')}),signal:AbortSignal.timeout(20000)});if(!result.ok)throw Error('GitHub poster upload failed: '+result.status);d.poster='/posters/'+path.split('/').pop();await draftSave(d);}
async function saveMovieMetadata(id,d){
 const fields={};for(const k of ['imdb_id','poster','genre','runtime','director','cast','plot'])if(d[k])fields[k]=d[k];
 if(!Object.keys(fields).length)return;
 const [owner,name]=REPO.split('/');
 const url='https://api.github.com/repos/'+owner+'/'+name+'/contents/data/movies.json';
 const headers={Authorization:'Bearer '+GH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'};
 for(let attempt=0;attempt<6;attempt++){
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Catalog read '+response.status);
  const file=await response.json();
  const content=JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'));
  const movie=(content.movies||[]).find(m=>
   (d.slug_id&&m.slug_id===d.slug_id)||
   (Number(m.year)===Number(d.year)&&normalize(m.title)===normalize(d.title))||
   Object.values(m.qualities||{}).some(v=>Number(v.telegram_message_id)===Number(id))
  );
  if(movie){Object.assign(movie,fields);}
  else{
   // The Telegram sync will discover the new message; store metadata in the
   // canonical catalog now so the subsequent sync can preserve it.
   content.movies ||= [];
   content.movies.push({id:'telegram-'+id,slug_id:d.slug_id||crypto.randomBytes(12).toString('base64url'),title:d.title,year:Number(d.year),qualities:{[d.quality]:{telegram_message_id:id,file_name:d.file_name||'',file_size:0,mime_type:''}},telegram_message_id:id,quality:d.quality,file_name:d.file_name||'',file_size:0,mime_type:'',...fields});
  }
  const result=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Update FilmGo movie metadata in canonical movies.json',content:Buffer.from(JSON.stringify(content,null,2)+'\n').toString('base64'),sha:file.sha}),signal:AbortSignal.timeout(15000)});
  if(result.ok)return;
  if(result.status!==409&&result.status!==422)throw Error('Catalog write '+result.status);
 }
 throw Error('Catalog update conflict');
}
async function publishDraft(d){const lock=prefix+'publishing:'+ADMIN_ID;if(await redis('SET',lock,'1','NX','EX',90)!=='OK')return say(ADMIN_ID,'Publishing is already running.');try{const caption=['Movie: '+d.title,'Year: '+d.year,'Quality: '+d.quality,...(d.slug_id?['Slug ID: '+d.slug_id]:[])].join('\n');const sent=await tg('copyMessage',{chat_id:CHANNEL_ID,from_chat_id:ADMIN_ID,message_id:d.message_id,caption},30000);await saveMovieMetadata(sent.message_id,d);await redis('DEL',DRAFT_KEY+ADMIN_ID);void logFilmGo('movies','🎬 Published: '+d.title+' ('+d.year+') · '+d.quality+' · channel #'+sent.message_id);await dispatch('filmgo-catalog-sync',{message_id:sent.message_id});}finally{await redis('DEL',lock);}}

let running=false;
async function redis(...args){
 const r=await fetch(REDIS_URL,{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Bot Redis unavailable');
 const j=await r.json();if(j.error)throw Error('Bot Redis error');return j.result;
}
async function tg(method,data={},timeout=20000){
 const r=await fetch('https://api.telegram.org/bot'+TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(timeout)});
 const j=await r.json();if(!j.ok)throw Error('Telegram '+method+': '+String(j.description).slice(0,160));return j.result;
}
async function say(chat_id,text,extra={}){return tg('sendMessage',{chat_id,text,disable_web_page_preview:true,...extra});}
async function dispatch(type,payload){
 if(!/^[\w.-]+\/[\w.-]+$/.test(REPO))throw Error('GitHub repository missing');
 const [owner,name]=REPO.split('/');
 const r=await fetch('https://api.github.com/repos/'+owner+'/'+name+'/dispatches',{method:'POST',headers:{Authorization:'Bearer '+GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({event_type:type,client_payload:payload}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('GitHub dispatch rejected ('+r.status+')');
}
function source(url){
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost')return null;
 const drive=/^(drive|docs)\.google\.com$/.test(u.hostname);
 if(!drive&&!/^https?:$/.test(u.protocol))return null;
 return {url:u.href,drive};
 }catch{return null;}
}
async function probe(input){
 const u=source(input);if(!u)return {error:'Only HTTPS direct links and Google Drive links are accepted.'};
 if(u.drive)return {size:null,drive:true,url:u.url};
 // Never fetch arbitrary URLs from the Koyeb service. GitHub runner performs the download.
 return {size:null,drive:false,url:u.url};
}
async function onMessage(message,refresh){
 const from=String(message.from?.id||''),chat=message.chat?.id;
 const deep=String(message.text||'').trim().match(/^\/start(?:@\\w+)?\\s+m_([A-Za-z0-9_-]{16})$/);
 if(deep&&message.chat?.type==='private'){
  const key='filmgo:deeplink:'+deep[1];
  const slug=await redis('GET',key);
  if(!slug)return say(chat,'This movie link has expired. Please open FilmGo and request a new link.');
  const movie=(await catalog()).find(m=>m.slug_id===slug);
  if(!movie)return say(chat,'Movie is no longer available.');
  const qualities=Object.keys(movie.qualities||{[movie.quality]:movie});
  const chosen=qualities.find(q=>q.toLowerCase()==='720p')||qualities[0];
  const variant=movie.qualities?.[chosen]||movie;
  if(!Number.isSafeInteger(variant.telegram_message_id))return say(chat,'Movie is unavailable.');
  await tg('copyMessage',{chat_id:chat,from_chat_id:CHANNEL_ID,message_id:variant.telegram_message_id});
  await redis('DEL',key);
  void logFilmGo('downloads','Telegram movie requested: '+movie.title+' ('+movie.year+')');
  return;
 }
 if(from!==ADMIN_ID||String(chat)!==ADMIN_ID)return;
 const text=String(message.text||'').trim();
 if(/^\/(start|help)(?:@\w+)?$/.test(text)){await say(chat,'Send a movie file to create a draft. /draft shows current draft, /edit field=value changes metadata, /poster requests a JPEG poster, /cancel discards it. /download URL keeps the remote import workflow.');return;}
 if(/^\/status(?:@\w+)?$/.test(text)){await say(chat,'FilmGo bot online.');return;}
 if(/^\/draft(?:@\w+)?$/.test(text)){const d=await draftGet();return d?draftPrompt(d):say(chat,'No active draft. Send a movie file.');}
 if(/^\/cancel(?:@\w+)?$/.test(text)){await redis('DEL',DRAFT_KEY+ADMIN_ID);return say(chat,'Draft cancelled.');}
 const file=message.document||message.video;
 if(file){
  if(file.file_size>MAX_BYTES)return say(chat,'File exceeds the current 2 GB limit.');
  const name=file.file_name||'',parts=filenameParts(name);
  if(!parts.quality)return say(chat,'Cannot identify quality from filename. Rename the file with 360p, 480p, 720p, 1080p or 2160p and resend.');
  const movies=await catalog(),found=guessMovie(file,movies),existing=found.best;
  const title=existing?.title||parts.title,year=existing?.year||parts.year;
  if(!title||!year)return say(chat,'Unable to identify title and year. Rename the file with movie title and release year, then resend.');
  const omdb=existing?null:await omdbSearch(title,year).catch(()=>null);
  const omdbConfidence=omdb&&Number(String(omdb.Year).slice(0,4))===year?similarity(title,omdb.Title):0;
  const trusted=!!existing||omdbConfidence>=0.7;
  const d={message_id:message.message_id,file_name:name,title,year,quality:parts.quality,existing:!!existing,replace:!!(existing&&Object.keys(existing.qualities||{}).some(q=>q.toLowerCase()===parts.quality)),slug_id:existing?.slug_id,...(omdbConfidence>=0.7?movieFields(omdb):{})};
  if(omdbConfidence>=0.7){d.title=omdb.Title;d.year=Number(String(omdb.Year).slice(0,4));}
  await draftSave(d);
  if(trusted&&!d.replace){
   await say(chat,'Recognized '+d.title+' ('+d.year+') at '+Math.round((existing?found.confidence:omdbConfidence)*100)+'% confidence. Publishing automatically.');
   return publishDraft(d);
  }
  return draftPrompt(d);
 }
 const d=await draftGet();
 if(message.photo?.length&&d){await posterUpload(d,message.photo.at(-1));return draftPrompt(d);}
 if(/^\/poster(?:@\w+)?$/.test(text))return say(chat,'Send a JPEG photo in this chat to save it as the draft poster.');
 const edit=text.match(/^\/edit\s+(title|year|genre|runtime|director|cast|plot|poster|imdb_id|quality)=(.+)$/is);
 if(edit&&d){const field=edit[1],value=edit[2].trim();if(field==='year'&&!/^(19|20)\d{2}$/.test(value))return say(chat,'Invalid year');if(field==='quality'&&!/^(360|480|720|1080|1440|2160)p$/i.test(value))return say(chat,'Invalid quality');d[field]=field==='year'?Number(value):value.slice(0,1000);await draftSave(d);return draftPrompt(d);}
 const match=text.match(/^\/download(?:@\w+)?\s+(\S+)$/i);
 if(!match){if(text.startsWith('/download'))await say(chat,'Usage: /download https://example.com/movie.mp4');return;}
 const data=await probe(match[1]);if(data.error){await say(chat,data.error);return;}
 const id=crypto.randomBytes(12).toString('hex');
 await redis('SET',prefix+'pending:'+id,JSON.stringify({url:data.url,admin:from,created:Date.now()}),'EX',900);
 await say(chat,'Confirm remote file import\n\nSource: '+(data.drive?'Google Drive':'Direct HTTPS')+'\nURL: '+data.url.slice(0,400)+'\nSize: unknown\nMaximum: 2 GB',{reply_markup:{inline_keyboard:[[{text:'Confirm import',callback_data:'fg:yes:'+id},{text:'Cancel',callback_data:'fg:no:'+id}]]}});
}
async function onCallback(q){
 if(String(q.from?.id)!==ADMIN_ID||String(q.message?.chat?.id)!==ADMIN_ID)return;
 const action=String(q.data||'');
 if(action==='fg:publish'||action==='fg:cancel'){await tg('answerCallbackQuery',{callback_query_id:q.id});const d=await draftGet();if(!d)return say(ADMIN_ID,'Draft expired.');if(action==='fg:cancel'){await redis('DEL',DRAFT_KEY+ADMIN_ID);return say(ADMIN_ID,'Draft cancelled.');}return publishDraft(d);}
 const m=action.match(/^fg:(yes|no):([a-f0-9]{24})$/);if(!m)return;
 await tg('answerCallbackQuery',{callback_query_id:q.id});
 const key=prefix+'pending:'+m[2],raw=await redis('GET',key);
 if(!raw){await say(ADMIN_ID,'Import confirmation expired or already used.');return;}
 const data=JSON.parse(raw);if(data.admin!==ADMIN_ID)return;
 // Atomic claim prevents repeated button taps from dispatching multiple jobs.
 if(await redis('SET',prefix+'claimed:'+m[2],'1','EX',3600,'NX')!=='OK')return;
 await redis('DEL',key);
 if(m[1]==='no'){await say(ADMIN_ID,'Import cancelled.');return;}
 try{await dispatch('filmgo-admin-import',{import_id:m[2],source_url:data.url,admin_id:ADMIN_ID});void logFilmGo('movies','📥 Remote movie import queued · job '+m[2]);}
 catch(err){await say(ADMIN_ID,'Unable to queue import: '+err.message);}
}
async function onChannel(message,refresh){
 if(String(message.chat?.id)!==CHANNEL_ID)return;
 if(message.from?.id && String(message.from.id)!==String((await tg('getMe')).id)){try{await tg('deleteMessage',{chat_id:CHANNEL_ID,message_id:message.message_id});}catch(e){console.warn('Unauthorized channel post could not be deleted:',e.message);}return;}
 if(!message.document&&!message.video)return;
 const file=message.document||message.video;
 if(!file.file_id)return;
 const dedupe=prefix+'channel:'+message.chat.id+':'+message.message_id+':'+(message.edit_date||message.date||0);
 if(await redis('SET',dedupe,'1','EX',86400*30,'NX')!=='OK')return;
 try{await refresh();await dispatch('filmgo-catalog-sync',{message_id:message.message_id});void logFilmGo('movies','🎬 Channel movie '+(message.edit_date?'edited':'detected')+' · message #'+message.message_id+' · catalog sync queued');}
 catch(err){await redis('DEL',dedupe);throw err;}
}
export function startFilmGoBot(refresh){
 if(!TOKEN||!GH_TOKEN||!REPO||!REDIS_URL||!REDIS_TOKEN||!CHANNEL_ID){console.warn('FilmGo Telegram bot disabled: missing configuration');return;}
 if(running)return;running=true;
 (async()=>{
  // Koyeb is the only Bot API update consumer; retain pending updates.
  try{await tg('deleteWebhook',{drop_pending_updates:false});}catch(err){console.warn('Bot webhook cleanup:',err.message);}
  // Only one Koyeb replica can poll at a time; lease is renewed each cycle.
  const owner=crypto.randomBytes(16).toString('hex');
  while(running){
   try{
    const lease=await redis('SET',prefix+'poller',owner,'EX',45,'NX');
    if(lease!=='OK'&&await redis('GET',prefix+'poller')!==owner){await new Promise(r=>setTimeout(r,12000));continue;}
    await redis('EXPIRE',prefix+'poller',45);
    const offset=Number(await redis('GET',prefix+'offset')||0);
    const updates=await tg('getUpdates',{offset,timeout:20,limit:50,allowed_updates:['message','channel_post','edited_channel_post','callback_query']},30000);
    for(const u of updates){
     try{
      if(u.channel_post)await onChannel(u.channel_post,refresh);
      if(u.edited_channel_post)await onChannel(u.edited_channel_post,refresh);
      if(u.message)await onMessage(u.message,refresh);
      if(u.callback_query)await onCallback(u.callback_query);
     }catch(err){console.error('FilmGo bot update error:',err.message);void logFilmGo('errors','Bot update error: '+err.message);}
     await redis('SET',prefix+'offset',String(u.update_id+1));
    }
   }catch(err){console.error('FilmGo bot polling error:',err.message);await new Promise(r=>setTimeout(r,5000));}
  }
 })().catch(err=>console.error('FilmGo bot fatal:',err.message));
}
