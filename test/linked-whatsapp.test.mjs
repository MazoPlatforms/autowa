import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {sessionCipher,createLinkedWhatsApp,LINK_TEST_DOCUMENT} from '../src/linked-whatsapp.mjs';
import {linkedDeliveryApi} from '../src/linked-delivery-api.mjs';
import {createLinkedMediaDelivery} from '../src/linked-whatsapp-runtime.mjs';
import fs from 'node:fs/promises';
const secret='test-only-application-secret-0123456789';
const number='+94770000000',other='+919876543210';
const hmac=n=>crypto.createHmac('sha256',secret).update(n).digest('hex');
function fakeRedis(){
 const strings=new Map(),hashes=new Map(),sets=new Map(),lists=new Map();
 const redis=async(cmd,key,...args)=>{
  switch(cmd){
   case 'GET':return strings.get(key)||null;
   case 'SET':if(args.includes('NX')&&strings.has(key))return null;strings.set(key,args[0]);return 'OK';
   case 'DEL':for(const k of [key,...args]){strings.delete(k);hashes.delete(k);lists.delete(k);}return 1;
   case 'EXPIRE':case 'PERSIST':return 1;
   case 'HGET':return hashes.get(key)?.get(args[0])||null;
   case 'HSET':if(!hashes.has(key))hashes.set(key,new Map());hashes.get(key).set(args[0],args[1]);return 1;
   case 'HDEL':return hashes.get(key)?.delete(args[0])?1:0;
   case 'SADD':if(!sets.has(key))sets.set(key,new Set());sets.get(key).add(args[0]);return 1;
   case 'SREM':return sets.get(key)?.delete(args[0]);
   case 'SMEMBERS':return [...(sets.get(key)||[])];
   case 'LPUSH':lists.set(key,[args[0],...(lists.get(key)||[])]);return lists.get(key).length;
   case 'LLEN':return lists.get(key)?.length||0;
   case 'LRANGE':return (lists.get(key)||[]).slice(Number(args[0]),Number(args[1])<0?undefined:Number(args[1])+1);
   case 'LTRIM':lists.set(key,(lists.get(key)||[]).slice(Number(args[0]),Number(args[1])+1));return 'OK';
   case 'LREM':lists.set(key,(lists.get(key)||[]).filter(x=>x!==args[1]));return 1;
   case 'RPOPLPUSH':{const value=(lists.get(key)||[]).pop();if(!value)return null;lists.set(args[0],[value,...(lists.get(args[0])||[])]);return value;}
   case 'EVAL':{if(Number(args[0])===2){const [,_lease,target,owner,field,value]=args;if(strings.get(_lease)!==owner)return 0;if(key.includes("'HDEL'")){hashes.get(target)?.delete(field);return 1;}if(!hashes.has(target))hashes.set(target,new Map());hashes.get(target).set(field,value);return 1;}const actual=args[1],owner=args[2];if(strings.get(actual)!==owner)return 0;if(key.includes("'DEL'"))strings.delete(actual);return 1;}
   default:throw Error('Unsupported mock command '+cmd);
  }
 };return {redis,strings,hashes,lists};
}
function fixture(options={}){
 const db=options.db||fakeRedis(),sockets=[];const adapter={initCreds:()=>({registered:false,secret:'private-key'}),keyValue:(_t,v)=>v,loggedOut:e=>e?.loggedOut,
 create:auth=>{const socket={ev:new EventEmitter(),auth,user:{id:number.slice(1)+':1@s.whatsapp.net'},requestPairingCode:async()=> '12345678',logout:async()=>{},end:()=>{},sendMessage:async()=>({key:{id:'sent'}})};sockets.push(socket);return socket;}};
 const calls=[];const manager=createLinkedWhatsApp({redis:db.redis,secret,hmac,adapter,deliver:options.deliver||(async(socket,n,job,update)=>{calls.push({n,job});await update('uploading',50);}),onFailed:options.onFailed,now:options.now});
 return {db,manager,sockets,calls};
}
const delay=()=>new Promise(r=>setTimeout(r,5));
async function until(fn){for(let n=0;n<100;n++){if(await fn())return;await delay();}throw Error('Condition timed out');}
async function connect(f,n=number){await f.manager.pair(n);f.sockets.at(-1).user.id=n.slice(1)+':1@s.whatsapp.net';f.sockets.at(-1).ev.emit('connection.update',{connection:'open'});await until(async()=> (await f.manager.status(n)).state==='connected');}
const media={kind:'movie',message_id:123,file_size:100,file_name:'test.mp4',title:'Test video',quality:'720p'};

test('AES-GCM roundtrip, tamper rejection, account/key isolation',()=>{
 const a=sessionCipher(secret,'alice'),b=sessionCipher(secret,'bob');const encrypted=a.encrypt({key:'sensitive'});assert.deepEqual(a.decrypt(encrypted),{key:'sensitive'});assert(!encrypted.includes('sensitive'));assert.throws(()=>b.decrypt(encrypted));const data=Buffer.from(encrypted,'base64');data[data.length-1]^=1;assert.throws(()=>a.decrypt(data.toString('base64')));assert.throws(()=>sessionCipher('short','alice'));
});
test('pairing code is owner-only and private keys are encrypted',async()=>{
 const f=fixture();try{await f.manager.pair(number);f.sockets[0].ev.emit('connection.update',{qr:'internal-qr'});await until(async()=>(await f.manager.status(number)).pairing_code==='12345678');assert.equal((await f.manager.status(other)).pairing_code,null);for(const fields of f.db.hashes.values())for(const v of fields.values())assert(!v.includes('private-key'));}finally{await f.manager.stop();}
});
test('delivery uses only owning account and history stays isolated',async()=>{
 const f=fixture();try{await connect(f);const job=await f.manager.enqueue(number,media);await until(async()=>(await f.manager.history(number))[0]?.status==='submitted');assert.equal(f.calls[0].n,number);assert.equal(f.calls[0].job.id,job.id);assert.deepEqual(await f.manager.history(other),[]);assert(!(await f.manager.history(number))[0].message_id);}finally{await f.manager.stop();}
});
test('unlinked, oversized and invalid media are rejected',async()=>{
 const f=fixture();try{await assert.rejects(()=>f.manager.enqueue(number,media));await connect(f);await assert.rejects(()=>f.manager.enqueue(number,{...media,file_size:2000000001}));await assert.rejects(()=>f.manager.enqueue(number,{...media,message_id:-1}));}finally{await f.manager.stop();}
});
test('a second worker cannot own the same session',async()=>{
 const a=fixture(),b=fixture({db:a.db});try{await connect(a);await assert.rejects(()=>b.manager.pair(number));assert.equal(b.sockets.length,0);}finally{await a.manager.stop();await b.manager.stop();}
});
test('registered sessions restore after restart without a new code',async()=>{
 const a=fixture();await connect(a);await a.manager.stop();const b=fixture({db:a.db});try{await b.manager.start();assert.equal(b.sockets.length,1);assert.equal(b.sockets[0].auth.creds.registered,true);assert.equal((await b.manager.status(number)).pairing_code,null);}finally{await b.manager.stop();}
});
test('offline disconnect reports that device must also be removed in WhatsApp',async()=>{
 const a=fixture();await connect(a);await a.manager.stop();const b=fixture({db:a.db});const result=await b.manager.disconnect(number);assert.equal(result.device_revoked,false);assert.equal((await b.manager.status(number)).state,'disconnected');await b.manager.stop();
});
test('disconnect erases credentials and prevents future delivery',async()=>{
 const f=fixture();await connect(f);await f.manager.disconnect(number);assert.equal((await f.manager.status(number)).state,'disconnected');assert(!f.db.hashes.has('filmgo:linked-wa:v1:'+hmac(number)+':auth'));await assert.rejects(()=>f.manager.enqueue(number,media));await f.manager.stop();
});
test('pairing expires and erases unregistered state',async()=>{
 let clock=0;const f=fixture({now:()=>clock});await f.manager.pair(number);clock=300001;await f.manager.tick();assert.equal((await f.manager.status(number)).state,'disconnected');await f.manager.stop();
});
test('wrong account pairing is disconnected and erased',async()=>{
 const f=fixture();await f.manager.pair(number);f.sockets[0].user.id=other.slice(1)+'@s.whatsapp.net';f.sockets[0].ev.emit('connection.update',{connection:'open'});await until(async()=>(await f.manager.status(number)).state==='disconnected');await f.manager.stop();
});
test('delivery failure is stored without exposing original errors',async()=>{
 let refunds=0;const f=fixture({deliver:async()=>{throw Error('token=private');},onFailed:async()=>refunds++});try{await connect(f);await f.manager.enqueue(number,media);await until(async()=>(await f.manager.history(number))[0]?.status==='failed');const [job]=await f.manager.history(number);assert(!job.error.includes('private'));assert.equal(refunds,1);}finally{await f.manager.stop();}
});
test('lease loss immediately closes socket',async()=>{
 const f=fixture();await connect(f);await f.db.redis('SET','filmgo:linked-wa:v1:'+hmac(number)+':lease','other-worker');await f.manager.tick();assert.equal((await f.manager.status(number)).state,'reconnecting');await f.manager.stop();
});
test('Signal keys persist encrypted and stale owners cannot rewrite auth',async()=>{
 const f=fixture();try{await connect(f);const auth=f.sockets[0].auth;await auth.keys.set({'session':{device:{secret:'signal-private'}}});assert.deepEqual(await auth.keys.get('session',['device']),{device:{secret:'signal-private'}});await f.manager.disconnect(number);await assert.rejects(()=>auth.keys.set({'session':{device:{secret:'stale'}}}));assert(!f.db.hashes.has('filmgo:linked-wa:v1:'+hmac(number)+':auth'));}finally{await f.manager.stop();}
});
test('bounded queue and FIFO processing',async()=>{
 let release;const order=[];const blocked=new Promise(r=>release=r);const f=fixture({deliver:async(_s,_n,job)=>{order.push(job.title);if(order.length===1)await blocked;}});
 try{await connect(f);await f.manager.enqueue(number,{...media,title:'one'});await until(()=>order.length===1);for(const title of ['two','three','four'])await f.manager.enqueue(number,{...media,title});await assert.rejects(()=>f.manager.enqueue(number,{...media,title:'five'}));release();await until(async()=>(await f.manager.history(number)).some(j=>j.title==='one'&&j.status==='submitted'));for(let i=0;i<3;i++)await f.manager.tick();assert.deepEqual(order,['one','two','three','four']);}finally{release();await f.manager.stop();}
});
test('interrupted upload is not resent after recovery',async()=>{
 const f=fixture();try{await connect(f);const id=hmac(number),job={...media,id:'interrupted',status:'uploading',created_at:new Date().toISOString()};await f.db.redis('HSET','filmgo:linked-wa:v1:'+id+':jobs',job.id,sessionCipher(secret,id).encrypt(job));await f.db.redis('LPUSH','filmgo:linked-wa:v1:'+id+':history',job.id);await f.db.redis('LPUSH','filmgo:linked-wa:v1:'+id+':active',job.id);await f.manager.tick();assert.equal(f.calls.length,0);assert.equal((await f.manager.history(number))[0].status,'failed');}finally{await f.manager.stop();}
});
test('document transport targets self, selects source channel and removes temp files',async()=>{
 for(const kind of ['movie','anime']){let file;const sent=[];const deliver=createLinkedMediaDelivery(async(_cmd,args)=>{assert.equal(args[1],kind==='anime'?'download-anime':'download');file=args[3];await fs.writeFile(file,'hello');});await deliver({sendMessage:async(jid,data)=>{sent.push(jid);assert.equal((await fs.readFile(data.document.url)).toString(),'hello');}},number,{...media,kind,file_size:5,recipient_jid:other+'@s.whatsapp.net'},async()=>{},new AbortController().signal);assert.deepEqual(sent,[number.slice(1)+'@s.whatsapp.net']);await assert.rejects(()=>fs.stat(file));}
});
test('failed transport removes temporary file',async()=>{
 let file;const deliver=createLinkedMediaDelivery(async(_cmd,args)=>{file=args[3];await fs.writeFile(file,'hello');});await assert.rejects(()=>deliver({sendMessage:async()=>{throw Error('upload failed');}},number,{...media,file_size:5},async()=>{},new AbortController().signal));await assert.rejects(()=>fs.stat(file));
});
test('connection test sends generated text document without downloading media',async()=>{
 let file;const deliver=createLinkedMediaDelivery(async()=>{throw Error('Test files must not download Telegram media');});await deliver({sendMessage:async(jid,data)=>{file=data.document.url;assert.equal(jid,number.slice(1)+'@s.whatsapp.net');assert.equal(data.mimetype,'text/plain');assert.equal(await fs.readFile(file,'utf8'),LINK_TEST_DOCUMENT);}},number,{...media,kind:'test',file_name:'FilmGo-test.txt',file_size:Buffer.byteLength(LINK_TEST_DOCUMENT)},async()=>{},new AbortController().signal);await assert.rejects(()=>fs.stat(file));
});

async function apiCase({method='POST',route='/api/request',session={number},origin='https://filmgo.test',data={rights_confirmed:true},state='connected',resolve=media}={}){
 let response,queued,refunded=0;const request={method,headers:{origin,host:'filmgo.test','content-type':'application/json'}};
 await linkedDeliveryApi(request,{},new URL('https://filmgo.test'+route),{authenticated:async()=>session,send:(_r,status,body)=>response={status,body},body:async()=>data,limit:async()=>true,manager:{status:async()=>({state}),pair:async n=>({state:'connecting',number:n}),disconnect:async()=>({ok:true}),enqueue:async(n,m)=>{queued={n,m};return {id:'test-job',status:'queued'};}},resolveMedia:async()=>resolve,reserve:async()=>({allowed:true}),refund:async()=>refunded++});return {response,queued,refunded};
}
test('API rejects guests, foreign/missing origin and missing consent',async()=>{
 assert.equal((await apiCase({session:null})).response.status,401);assert.equal((await apiCase({origin:'https://evil.test'})).response.status,403);assert.equal((await apiCase({origin:''})).response.status,403);assert.equal((await apiCase({route:'/api/whatsapp/link',data:{}})).response.status,400);
});
test('API requires connected session; user cannot supply recipient',async()=>{
 assert.equal((await apiCase({state:'disconnected'})).response.status,428);const r=await apiCase({data:{rights_confirmed:true,number:other,recipient_jid:'evil@s.whatsapp.net'}});assert.equal(r.response.status,202);assert.equal(r.queued.n,number);assert.equal(r.queued.m.recipient_jid,undefined);
});
test('API rejects missing media and exposes no credentials',async()=>{
 assert.equal((await apiCase({resolve:null})).response.status,404);const r=await apiCase({method:'GET',route:'/api/whatsapp/status'});assert.deepEqual(r.response.body,{state:'connected'});
});
test('connection test endpoint uses authenticated owner and generated document only',async()=>{
 const r=await apiCase({route:'/api/whatsapp/test',data:{recipient_jid:other,file_name:'attacker.txt'}});assert.equal(r.response.status,202);assert.equal(r.queued.n,number);assert.equal(r.queued.m.kind,'test');assert.equal(r.queued.m.file_size,Buffer.byteLength(LINK_TEST_DOCUMENT));assert.equal(r.queued.m.file_name,'FilmGo-connection-test.txt');assert.equal(r.queued.m.recipient_jid,undefined);
});
