// Best-effort operational logs routed to Telegram forum topics.
// No credentials, OTP codes, phone numbers or media bytes are logged.
const TOKEN=process.env.BOT_TOKEN||'';
const CHAT_ID=-1003590056946;
const TOPICS={movies:'🎬 Movie Updates',requests:'📨 WhatsApp Requests',streams:'▶️ Movie Streams',downloads:'⬇️ Movie Downloads',errors:'⚠️ Bot Errors'};
const cache=new Map();
let queue=Promise.resolve();
async function api(method,payload){
 const response=await fetch('https://api.telegram.org/bot'+TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
 const data=await response.json();if(!data.ok)throw Error(method+': '+String(data.description||'failed').slice(0,120));return data.result;
}
async function topic(kind){
 if(cache.has(kind))return cache.get(kind);
 // Redis makes topic IDs persistent across deployments and prevents duplicates.
 const redisUrl=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
 const redisToken=process.env.UPSTASH_REDIS_REST_TOKEN||'';
 const key='filmgo:logs:topic:'+kind;
 async function redis(...args){if(!redisUrl||!redisToken)return null;const r=await fetch(redisUrl,{method:'POST',headers:{Authorization:'Bearer '+redisToken,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Redis '+r.status);const d=await r.json();if(d.error)throw Error('Redis error');return d.result;}
 const saved=await redis('GET',key);
 if(saved){cache.set(kind,Number(saved));return Number(saved);}
 const lock=await redis('SET',key+':lock','1','NX','EX',20);
 if(lock!=='OK'){await new Promise(r=>setTimeout(r,1500));const other=await redis('GET',key);if(other){cache.set(kind,Number(other));return Number(other);}throw Error('Topic initialization busy');}
 const result=await api('createForumTopic',{chat_id:CHAT_ID,name:TOPICS[kind]});
 cache.set(kind,result.message_thread_id);
 await redis('SET',key,String(result.message_thread_id));
 return result.message_thread_id;
}
export function logFilmGo(kind,message){
 if(!TOKEN||!TOPICS[kind])return Promise.resolve(false);
 const task=queue.then(async()=>{
  try{
   const thread=await topic(kind);
   await api('sendMessage',{chat_id:CHAT_ID,message_thread_id:thread,text:String(message).slice(0,3500),disable_web_page_preview:true});
   return true;
  }catch(err){console.warn('FilmGo topic log failed:',kind,err.message);return false;}
 });
 queue=task.then(()=>{});
 return task;
}
