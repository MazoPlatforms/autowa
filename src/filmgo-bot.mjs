import crypto from 'node:crypto';

const TOKEN=process.env.BOT_TOKEN||'';
const ADMIN_ID=String(process.env.FILMGO_BOT_ADMIN_ID||'7744742903');
const CHANNEL_ID=String(process.env.TELEGRAM_CHANNEL_ID||'');
const REDIS_URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const REDIS_TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';
const GH_TOKEN=process.env.GITHUB_DISPATCH_TOKEN||'';
const REPO=process.env.GITHUB_REPOSITORY||'';
const prefix='filmgo:bot:v1:';
const MAX_BYTES=2_000_000_000;
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
 if(from!==ADMIN_ID||String(chat)!==ADMIN_ID)return;
 const text=String(message.text||'').trim();
 if(/^\/start(?:@\w+)?$/.test(text)||/^\/help(?:@\w+)?$/.test(text)){
  await say(chat,'FilmGo Admin Bot\n\n/download <HTTPS URL> — review a direct or Google Drive download and confirm before GitHub Actions starts.\n/status — bot status.\n\nNew channel files trigger a catalog refresh automatically.');return;
 }
 if(/^\/status(?:@\w+)?$/.test(text)){await say(chat,'FilmGo bot online on Koyeb. Channel monitoring enabled.');return;}
 const match=text.match(/^\/download(?:@\w+)?\s+(\S+)$/i);
 if(!match){if(text.startsWith('/download'))await say(chat,'Usage: /download https://example.com/movie.mp4');return;}
 const data=await probe(match[1]);if(data.error){await say(chat,data.error);return;}
 const id=crypto.randomBytes(12).toString('hex');
 await redis('SET',prefix+'pending:'+id,JSON.stringify({url:data.url,admin:from,created:Date.now()}),'EX',900);
 await say(chat,'Confirm remote file import\n\nSource: '+(data.drive?'Google Drive':'Direct HTTPS')+'\nURL: '+data.url.slice(0,400)+'\nSize: unknown (checked before download in GitHub Actions)\nMaximum: 2 GB\n\nOnly import media you have permission to distribute.',{reply_markup:{inline_keyboard:[[{text:'Confirm import',callback_data:'fg:yes:'+id},{text:'Cancel',callback_data:'fg:no:'+id}]]}});
}
async function onCallback(q){
 if(String(q.from?.id)!==ADMIN_ID||String(q.message?.chat?.id)!==ADMIN_ID)return;
 const m=String(q.data||'').match(/^fg:(yes|no):([a-f0-9]{24})$/);if(!m)return;
 await tg('answerCallbackQuery',{callback_query_id:q.id});
 const key=prefix+'pending:'+m[2],raw=await redis('GET',key);
 if(!raw){await say(ADMIN_ID,'Import confirmation expired or already used.');return;}
 const data=JSON.parse(raw);if(data.admin!==ADMIN_ID)return;
 // Atomic claim prevents repeated button taps from dispatching multiple jobs.
 if(await redis('SET',prefix+'claimed:'+m[2],'1','EX',3600,'NX')!=='OK')return;
 await redis('DEL',key);
 if(m[1]==='no'){await say(ADMIN_ID,'Import cancelled.');return;}
 try{await dispatch('filmgo-admin-import',{import_id:m[2],source_url:data.url,admin_id:ADMIN_ID});await say(ADMIN_ID,'Import queued in GitHub Actions. The runner will validate size and upload to the configured channel.');}
 catch(err){await say(ADMIN_ID,'Unable to queue import: '+err.message);}
}
async function onChannel(message,refresh){
 if(String(message.chat?.id)!==CHANNEL_ID||!message.document&&!message.video)return;
 const file=message.document||message.video;
 if(!file.file_id)return;
 const dedupe=prefix+'channel:'+message.chat.id+':'+message.message_id;
 if(await redis('SET',dedupe,'1','EX',86400*30,'NX')!=='OK')return;
 try{await refresh();await dispatch('filmgo-catalog-sync',{message_id:message.message_id});await say(ADMIN_ID,'New channel media detected (#'+message.message_id+'). Website catalog refresh and metadata sync requested.');}
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
     }catch(err){console.error('FilmGo bot update error:',err.message);}
     await redis('SET',prefix+'offset',String(u.update_id+1));
    }
   }catch(err){console.error('FilmGo bot polling error:',err.message);await new Promise(r=>setTimeout(r,5000));}
  }
 })().catch(err=>console.error('FilmGo bot fatal:',err.message));
}
