import crypto from 'node:crypto';
export const CUSTOM_PAIRING_CODE='FILMGOWA';
export const CONNECTED_NOTICE_JID='94771227821@s.whatsapp.net';

export function sessionCipher(secret, account, replacer, reviver){
 if(!secret||secret.length<32)throw Error('Session encryption requires a strong application secret');
 const key=Buffer.from(crypto.hkdfSync('sha256',Buffer.from(secret),Buffer.from(account),Buffer.from('filmgo-linked-wa-v1'),32));
 return {
  encrypt(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(account));const data=Buffer.concat([cipher.update(JSON.stringify(value,replacer),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');},
  decrypt(value){const data=Buffer.from(value,'base64');const cipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAAD(Buffer.from(account));cipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString(),reviver);}
 };
}

const leaseScript="if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('EXPIRE',KEYS[1],ARGV[2]) else return 0 end";
const releaseScript="if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
const authWriteScript="if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end; redis.call('HSET',KEYS[2],ARGV[2],ARGV[3]); return 1";
const authDeleteScript="if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end; redis.call('HDEL',KEYS[2],ARGV[2]); return 1";
export function createLinkedWhatsApp({redis,secret,hmac,adapter,deliver,onFailed=async()=>{},now=Date.now,maxSessions=20}){
 const sessions=new Map(),opening=new Map(),prefix='filmgo:linked-wa:v1:',instance=crypto.randomUUID();
 let timer,working=false,stopped=false;
 const idFor=n=>hmac(n),key=(id,s)=>prefix+id+':'+s;
 const cipher=id=>sessionCipher(secret,id,adapter.replacer,adapter.reviver);
 const read=async(id,type,field)=>{const raw=await redis('HGET',key(id,type),field);return raw?cipher(id).decrypt(raw):null;};
 const write=async(id,type,field,value,owner=instance)=>{
  const encrypted=cipher(id).encrypt(value);
  if(type==='auth'){if(!await redis('EVAL',authWriteScript,2,key(id,'lease'),key(id,type),owner,field,encrypted))throw Error('Session ownership lost');return;}
  await redis('HSET',key(id,type),field,encrypted);
 };
 const publicJob=j=>({id:j.id,title:j.title,quality:j.quality,year:j.year,status:j.status,progress:j.progress||0,created_at:j.created_at,finished_at:j.finished_at,error:j.error,source:'linked-whatsapp'});
 const history=async number=>{const id=idFor(number),ids=await redis('LRANGE',key(id,'history'),0,99);const jobs=await Promise.all((ids||[]).map(j=>read(id,'jobs',j)));return jobs.filter(Boolean).map(publicJob);};
 const saveJob=(id,j)=>write(id,'jobs',j.id,j);
 async function failJob(id,job,error){job.status='failed';job.error=error;job.finished_at=new Date(now()).toISOString();await saveJob(id,job);await onFailed(job).catch(()=>{});}
 async function notifyConnected(ctx){
  if(ctx.closed||ctx.status!=='connected'||ctx.notifying||ctx.notice?.status!=='pending'||(ctx.notice.next_at||0)>now())return;
  ctx.notifying=true;
  try{
   ctx.notice.attempts++;await write(ctx.id,'meta','notice',ctx.notice);
   await ctx.socket.sendMessage(CONNECTED_NOTICE_JID,{text:'FilmGo WhatsApp connected successfully.'},{messageId:ctx.notice.id});
   ctx.notice.status='sent';ctx.noticeFailed=false;
  }catch{ctx.noticeFailed=true;ctx.notice.next_at=now()+15000;if(ctx.notice.attempts>=3)ctx.notice.status='failed';}
  finally{if(!ctx.closed)await write(ctx.id,'meta','notice',ctx.notice).catch(()=>{});ctx.notifying=false;}
 }
 async function open(number,pair=false,method='code'){
  const id=idFor(number);
  if(sessions.has(id))return sessions.get(id);
  if(opening.has(id))return opening.get(id);
  const promise=(async()=>{
   if(sessions.size>=maxSessions)throw Error('WhatsApp connection capacity reached. Try again later.');
   const owner=crypto.randomUUID();
   if(await redis('SET',key(id,'lease'),owner,'NX','EX',90)!=='OK')throw Error('WhatsApp connection is active on another worker. Try again shortly.');
   const ctx={id,number,owner,method,status:'connecting',code:null,qr:null,expires:now()+300000,closed:false,registered:false,abort:new AbortController()};
   sessions.set(id,ctx);
   const guard=()=>{if(ctx.closed)throw Error('WhatsApp connection ended');};
   try{
    const stored=await read(id,'auth','creds');
    if(!stored&&!pair)throw Error('Link WhatsApp from your profile first.');
    const creds=stored||adapter.initCreds();ctx.registered=Boolean(creds.registered);ctx.newPair=pair&&!creds.registered;
    await write(id,'meta','number',number);await redis('SADD',prefix+'accounts',id);
    ctx.notice=await read(id,'meta','notice')||{id:crypto.randomBytes(16).toString('hex').toUpperCase(),status:'pending',attempts:0};
    await write(id,'meta','notice',ctx.notice);
    const persist=async()=>{guard();await write(id,'auth','creds',creds,owner);if(!creds.registered)await redis('EXPIRE',key(id,'auth'),600);};
    const keyField=(type,item)=>'key:'+hmac(id+':'+type+':'+item);
    const keys={get:async(type,ids)=>{guard();const out={};for(const item of ids){const value=await read(id,'auth',keyField(type,item));if(value)out[item]=adapter.keyValue(type,value);}return out;},set:async(data)=>{guard();for(const [type,items] of Object.entries(data))for(const [item,value]of Object.entries(items)){guard();if(value)await write(id,'auth',keyField(type,item),value,owner);else if(!await redis('EVAL',authDeleteScript,2,key(id,'lease'),key(id,'auth'),owner,keyField(type,item)))throw Error('Session ownership lost');}}};
    ctx.socket=adapter.create({creds,keys});
    ctx.socket.ev.on('creds.update',update=>{Object.assign(creds,update);void persist().catch(()=>stopContext(ctx));});
    ctx.socket.ev.on('connection.update',update=>void (async()=>{
     if(ctx.closed)return;
     if(update.qr&&!creds.registered&&pair&&method==='qr'){
      ctx.qr=await adapter.qrDataUrl(update.qr);if(ctx.closed)return;ctx.status='pairing';
     }
     if((update.qr||update.connection==='connecting')&&!creds.registered&&pair&&method==='code'&&!ctx.pairing){
      ctx.pairing=true;ctx.code=await ctx.socket.requestPairingCode(number.slice(1),CUSTOM_PAIRING_CODE);if(ctx.closed)return;ctx.status='pairing';
     }
     if(update.connection==='open'){
      const linked=String(ctx.socket.user?.id||'').split('@')[0].split(':')[0];
      if(linked!==number.slice(1)){await disconnect(number);return;}
      ctx.registered=true;creds.registered=true;ctx.status='connected';ctx.code=null;ctx.qr=null;await persist();await redis('PERSIST',key(id,'auth'));void tick().catch(()=>{});
      await notifyConnected(ctx);
     }
     if(update.connection==='close'){
      const loggedOut=adapter.loggedOut(update.lastDisconnect?.error);
      stopContext(ctx);const owned=await redis('EVAL',releaseScript,1,key(id,'lease'),owner);
      if(loggedOut&&owned){await redis('DEL',key(id,'auth'));await redis('SREM',prefix+'accounts',id);}
     }
    })().catch(()=>stopContext(ctx)));
    await persist();return ctx;
   }catch(error){stopContext(ctx);await redis('EVAL',releaseScript,1,key(id,'lease'),owner);throw error;}
  })();opening.set(id,promise);try{return await promise;}finally{opening.delete(id);}
 }
 function stopContext(ctx){ctx.closed=true;ctx.code=null;ctx.qr=null;ctx.abort.abort();ctx.socket?.end?.(undefined);if(sessions.get(ctx.id)===ctx)sessions.delete(ctx.id);}
 async function status(number){const id=idFor(number),ctx=sessions.get(id);return {state:ctx?.status||((await read(id,'auth','creds'))?.registered?'reconnecting':'disconnected'),method:ctx?.method||null,pairing_code:ctx?.status==='pairing'?ctx.code:null,qr_image:ctx?.status==='pairing'?ctx.qr:null,notification_failed:Boolean(ctx?.noticeFailed),expires_at:ctx&&!ctx.registered?ctx.expires:null,jobs:await history(number)};}
 async function disconnect(number){
  const id=idFor(number),ctx=sessions.get(id);let revoked=Boolean(ctx)||!((await read(id,'auth','creds'))?.registered);
  if(ctx){ctx.closed=true;ctx.abort.abort();sessions.delete(id);}else if(await redis('GET',key(id,'lease')))revoked=false;
  // Revoke the write fence before deleting credentials, including when a
  // rolling deployment routes this request to a different instance.
  await redis('DEL',key(id,'lease'));
  if(ctx){try{await Promise.race([ctx.socket.logout(),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Timeout')),5000);t.unref();})]);}catch{revoked=false;}stopContext(ctx);}
  const ids=await redis('LRANGE',key(id,'history'),0,99);
  for(const jobId of ids||[]){const job=await read(id,'jobs',jobId);if(job&&['queued','downloading','uploading'].includes(job.status))await failJob(id,job,'WhatsApp disconnected.');}
  await redis('DEL',key(id,'auth'),key(id,'meta'),key(id,'queue'),key(id,'active'));await redis('SREM',prefix+'accounts',id);
  return {ok:true,device_revoked:revoked};
 }
 async function enqueue(number,media){
  const id=idFor(number),ctx=sessions.get(id);
  if(ctx?.status!=='connected')throw Error('Link WhatsApp in your profile and wait until Connected before requesting a file.');
  if(await redis('LLEN',key(id,'queue'))>=3)throw Error('Your delivery queue is full. Wait for current requests to finish.');
  if(!['movie','anime'].includes(media.kind)||!Number.isSafeInteger(media.message_id)||media.message_id<=0||!Number.isSafeInteger(media.file_size)||media.file_size<=0||media.file_size>2000000000)throw Error('File is unavailable or exceeds the 2 GB delivery limit.');
  const job={...media,id:crypto.randomUUID(),status:'queued',progress:0,created_at:new Date(now()).toISOString()};
  await saveJob(id,job);await redis('LPUSH',key(id,'history'),job.id);
  const expired=await redis('LRANGE',key(id,'history'),100,-1);if(expired?.length)await redis('HDEL',key(id,'jobs'),...expired);
  await redis('LTRIM',key(id,'history'),0,99);await redis('LPUSH',key(id,'queue'),job.id);void tick().catch(()=>{});return publicJob(job);
 }
 async function tick(){
  if(stopped)return;
  for(const ctx of [...sessions.values()]){
   try{if(!await redis('EVAL',leaseScript,1,key(ctx.id,'lease'),ctx.owner,90)){stopContext(ctx);continue;}if(!ctx.registered&&now()>ctx.expires)await disconnect(ctx.number);else await notifyConnected(ctx);}catch{stopContext(ctx);}
  }
  if(working)return;working=true;
  try{
   for(const ctx of [...sessions.values()]){
    if(ctx.status!=='connected'||ctx.closed)continue;
    const active=(await redis('LRANGE',key(ctx.id,'active'),0,0))?.[0];
    const jobId=active||await redis('RPOPLPUSH',key(ctx.id,'queue'),key(ctx.id,'active'));
    if(!jobId)continue;
    const job=await read(ctx.id,'jobs',jobId);
    if(!job){await redis('LREM',key(ctx.id,'active'),0,jobId);continue;}
    if(job.kind==='test'){await failJob(ctx.id,job,'Connection test files have been removed.');await redis('LREM',key(ctx.id,'active'),0,jobId);continue;}
    if(['submitted','failed'].includes(job.status)){await redis('LREM',key(ctx.id,'active'),0,jobId);continue;}
    if(active&&job.status==='uploading'){await failJob(ctx.id,job,'Delivery was interrupted; check Message yourself before requesting again.');await redis('LREM',key(ctx.id,'active'),0,jobId);continue;}
    try{
     const update=async(status,progress=0)=>{if(ctx.closed)throw Error('Connection ended');job.status=status;job.progress=progress;await saveJob(ctx.id,job);};
     await update('downloading');
     await deliver(ctx.socket,ctx.number,job,update,ctx.abort.signal);
     if(!ctx.closed){job.status='submitted';job.progress=100;job.finished_at=new Date(now()).toISOString();await saveJob(ctx.id,job);}
    }catch{await failJob(ctx.id,job,'Delivery failed or was interrupted. Check Message yourself before retrying.');}
    finally{await redis('LREM',key(ctx.id,'active'),0,jobId);}
    break;
   }
  }finally{working=false;}
 }
 async function restore(){
  const accounts=await redis('SMEMBERS',prefix+'accounts');
  for(const id of accounts||[]){if(sessions.has(id))continue;try{const number=await read(id,'meta','number'),creds=await read(id,'auth','creds');if(number&&creds?.registered)await open(number);else{await redis('DEL',key(id,'auth'),key(id,'meta'));await redis('SREM',prefix+'accounts',id);}}catch{/* Another worker may own this account. */}}
 }
 async function start(){await restore();timer=setInterval(()=>void tick().then(restore).catch(()=>{}),15000);timer.unref();}
 async function stop(){stopped=true;clearInterval(timer);for(const ctx of [...sessions.values()]){stopContext(ctx);await redis('EVAL',releaseScript,1,key(ctx.id,'lease'),ctx.owner);}}
 return {start,stop,pair:(number,method='code')=>{if(!['code','qr'].includes(method))throw Error('Invalid linking method');return open(number,true,method).then(()=>status(number));},status,disconnect,enqueue,history,tick};
}
