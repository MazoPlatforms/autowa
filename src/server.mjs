import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
import {startWhatsApp,isWhatsAppReady,sendWhatsAppOtp} from './whatsapp-otp.mjs';

const PORT=Number(process.env.PORT||8000);
const required=['APP_SECRET','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','GITHUB_DISPATCH_TOKEN','GITHUB_REPOSITORY'];
const missing=required.filter(k=>!process.env[k]);
const secret=process.env.APP_SECRET||'';
const configured=missing.length===0&&secret.length>=32;
if(!configured)console.warn('AutoWA setup incomplete: configure APP_SECRET and required storage/GitHub secrets; API will fail closed. Missing:',missing.join(', ')||'APP_SECRET length < 32');
const redisBase=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const redisToken=process.env.UPSTASH_REDIS_REST_TOKEN;
const hmac=s=>crypto.createHmac('sha256',secret).update(s).digest('hex');
const safeEq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function redis(...args){
 const r=await fetch(redisBase,{method:'POST',headers:{Authorization:'Bearer '+redisToken,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Persistent store unavailable');
 const data=await r.json();if(data.error)throw Error('Persistent store error');return data.result;
}
const telegramReady=['TELEGRAM_API_ID','TELEGRAM_API_HASH','TELEGRAM_SESSION','TELEGRAM_CHANNEL_ID'].every(k=>!!process.env[k]);
let indexing=false;
async function indexTelegram(){
 if(!configured||!telegramReady||indexing)return;
 indexing=true;
 try{
  const {stdout}=await execFileAsync('python3',['src/telegram_media.py','index'],{timeout:180000,maxBuffer:3*1024*1024,env:process.env});
  const data=JSON.parse(stdout);
  if(!Array.isArray(data.movies))throw Error('Invalid catalog');
  await redis('SET','telegram:catalog:v2',JSON.stringify(data),'EX',1200);
  console.log('Telegram catalog refreshed:',data.movies.length,'media items');
 }catch(e){console.error('Telegram catalog refresh failed:',e.message);}
 finally{indexing=false;}
}
setTimeout(()=>{void indexTelegram();setInterval(()=>void indexTelegram(),2*60*1000).unref();},3000).unref();
async function getCatalog(){
 const raw=await redis('GET','telegram:catalog:v2');
 return raw?JSON.parse(raw):null;
}
async function limit(key,max,seconds){
 const name='rate:'+hmac(key),n=Number(await redis('INCR',name));
 if(n===1)await redis('EXPIRE',name,seconds);
 return n<=max;
}
function send(res,status,data,headers={}){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...headers});
 res.end(JSON.stringify(data));
}
async function body(req){
 let text='';for await(const chunk of req){text+=chunk;if(text.length>12000)throw Error('Request too large');}
 return JSON.parse(text||'{}');
}
function phone(v){return typeof v==='string'&&/^\+[1-9]\d{7,14}$/.test(v)?v:null;}
function tokenFor(number,nonce,exp){const data=Buffer.from(JSON.stringify({number,nonce,exp})).toString('base64url');return data+'.'+hmac(data);}
function verifyToken(token){
 if(typeof token!=='string'||token.length>700)return null;
 const [data,mac,...extra]=token.split('.');if(!data||!mac||extra.length||!safeEq(hmac(data),mac))return null;
 try{const value=JSON.parse(Buffer.from(data,'base64url').toString());return value.exp>Date.now()&&phone(value.number)&&typeof value.nonce==='string'?value:null;}catch{return null;}
}
function cookieToken(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('tfw_session='))?.slice(12)||'';}
async function authenticated(req){const session=verifyToken(cookieToken(req));return session&&await redis('GET','session:'+hmac(session.nonce))===session.number?session:null;}
function sessionCookie(token,age){return 'tfw_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;}
async function profile(number){const raw=await redis('GET','profile:'+hmac(number));return raw?JSON.parse(raw):{name:'',created_at:new Date().toISOString()};}
async function sendOtp(number,code){return sendWhatsAppOtp(number,code);}
const index=fs.readFileSync(new URL('../web/index.html',import.meta.url));
const countries=fs.readFileSync(new URL('../site/countries.json',import.meta.url));
const appJs=fs.readFileSync(new URL('../web/app.js',import.meta.url));
const stylesheet=fs.readFileSync(new URL('../web/style.css',import.meta.url));
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/api/movies'){
   if(!configured||!telegramReady)return send(res,503,{error:'Movie catalog not configured'});
   if(!await limit('search-ip:'+(req.socket.remoteAddress||'unknown'),30,60))return send(res,429,{error:'Search rate limit reached'});
   let catalog=await getCatalog();
   if(!catalog){await indexTelegram();catalog=await getCatalog();}
   if(!catalog)return send(res,503,{error:'Movie catalog is syncing. Try again shortly.'});
   const query=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
   let matches=catalog.movies.filter(m=>!query||m.title.toLowerCase().includes(query)||String(m.year||'').includes(query)).slice(0,query?50:15);
   let live=false;
   if(query.length>=2){
    try{
     const {stdout}=await execFileAsync('python3',['src/telegram_media.py','search',query],{timeout:90000,maxBuffer:1024*1024,env:process.env});
     const remote=JSON.parse(stdout).movies||[];
     const validIds=new Set(catalog.movies.map(m=>m.id));
     matches=[...new Map([...remote,...matches.filter(m=>validIds.has(m.id))].map(m=>[m.id,m])).values()].slice(0,50);
     live=true;
    }catch(err){console.warn('Telegram live search unavailable:',err.message);matches=[];}

   }
   return send(res,200,{movies:matches,indexed_at:catalog.indexed_at,live});
  }
  if(req.method==='GET'&&url.pathname==='/api/me'){
   const session=await authenticated(req);
   if(!session)return send(res,401,{error:'Not signed in'});
   const user=await profile(session.number);
   const used=Number(await redis('GET','rate:'+hmac('submit:'+session.number))||0);
   return send(res,200,{number:session.number,name:user.name||'',limit:3,used:Math.min(used,3),remaining:Math.max(0,3-used),period:'rolling rate window (up to 24 hours)'});
  }
  if(req.method==='GET'&&url.pathname==='/health'){return send(res,200,{ok:true});}
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});return res.end(index);}
  if(req.method==='GET'&&url.pathname==='/style.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});return res.end(stylesheet);}
  if(req.method==='GET'&&url.pathname==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(appJs);}
  if(req.method==='GET'&&url.pathname==='/countries.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'});return res.end(countries);}
  if(req.method!=='POST'||!['/api/otp/start','/api/otp/verify','/api/request','/api/profile','/api/logout'].includes(url.pathname))return send(res,404,{error:'Not found'});
  if(!configured)return send(res,503,{error:'Service setup incomplete; contact operator'});
  if(url.pathname==='/api/otp/start'&&!isWhatsAppReady())return send(res,503,{error:'WhatsApp OTP bot is offline. Try again later.'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'JSON required'});
  const origin=req.headers.origin,host=req.headers.host;
  if(origin&&new URL(origin).host!==host)return send(res,403,{error:'Origin rejected'});
  const ip=(req.socket.remoteAddress||'unknown'); // Never trust unvalidated forwarded headers.
  if(!await limit('ip:'+ip,100,3600))return send(res,429,{error:'Too many requests'});
  const data=await body(req);
  if(url.pathname==='/api/otp/start'){
   const number=phone(data.number);
   if(!number)return send(res,400,{error:'Use an international number starting with +'});
   if(!await limit('otp:'+number,5,3600)||!await limit('otp-ip:'+ip,20,3600))return send(res,429,{error:'OTP limit reached'});
   const cooldown=await redis('SET','cool:'+hmac(number),'1','EX',60,'NX');
   if(cooldown!=='OK')return send(res,429,{error:'Wait 60 seconds before requesting another OTP'});
   const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
   await redis('SET','otp:'+hmac(number),hmac(number+':'+code),'EX',300);
   try{await sendOtp(number,code);}catch{await redis('DEL','otp:'+hmac(number));return send(res,503,{error:'OTP delivery unavailable'});}
   return send(res,200,{ok:true,message:'OTP sent'});
  }
  if(url.pathname==='/api/otp/verify'){
   const number=phone(data.number),code=data.code;
   if(!number||typeof code!=='string'||!/^\d{6}$/.test(code))return send(res,400,{error:'Invalid verification details'});
   if(!await limit('verify:'+number,5,600))return send(res,429,{error:'Too many attempts'});
   const stored=await redis('GET','otp:'+hmac(number));
   if(!stored||!safeEq(stored,hmac(number+':'+code)))return send(res,401,{error:'Invalid or expired OTP'});
   await redis('DEL','otp:'+hmac(number));
   const nonce=crypto.randomBytes(16).toString('hex'),age=30*86400,exp=Date.now()+age*1000;
   await redis('SET','session:'+hmac(nonce),number,'EX',age);
   const key='profile:'+hmac(number);
   await redis('SET',key,JSON.stringify(await profile(number)));
   return send(res,200,{ok:true,expires_in:age},{'Set-Cookie':sessionCookie(tokenFor(number,nonce,exp),age)});
  }
  const session=await authenticated(req);
  if(!session)return send(res,401,{error:'Sign in with WhatsApp first'});
  if(url.pathname==='/api/logout'){
   await redis('DEL','session:'+hmac(session.nonce));
   return send(res,200,{ok:true},{'Set-Cookie':sessionCookie('',0)});
  }
  if(url.pathname==='/api/profile'){
   if(typeof data.name!=='string'||data.name.trim().length<2||data.name.trim().length>60)return send(res,400,{error:'Name must contain 2–60 characters'});
   const name=data.name.trim().replace(/[\x00-\x1f]/g,'');
   await redis('SET','profile:'+hmac(session.number),JSON.stringify({name,updated_at:new Date().toISOString()}));
   return send(res,200,{ok:true,name});
  }
  if(data.rights_confirmed!==true||!Number.isSafeInteger(data.movie_id)||data.movie_id<=0)return send(res,400,{error:'Select a movie and confirm distribution rights'});
  const catalog=await getCatalog();
  let movie=catalog?.movies?.find(m=>m.id===data.movie_id);
  if(!movie)return send(res,400,{error:'Selected movie unavailable; refresh the catalog'});
  try{
   const {stdout}=await execFileAsync('python3',['src/telegram_media.py','check',String(data.movie_id)],{timeout:45000,maxBuffer:32768,env:process.env});
   const fresh=JSON.parse(stdout).movie;
   if(!fresh)return send(res,409,{error:'Movie was deleted or caption changed. Refresh and select another.'});
   movie=fresh;
  }catch(err){console.warn('Movie verification failed:',err.message);return send(res,503,{error:'Unable to verify movie availability right now'});}

  if(!await limit('submit:'+session.number,3,86400))return send(res,429,{error:'Daily request limit reached'});
  const claim=await redis('SET','claim:'+hmac(session.nonce),'1','EX',900,'NX');
  if(claim!=='OK')return send(res,409,{error:'Request already submitted'});
  const requestId=crypto.randomUUID();
  const [owner,repo]=process.env.GITHUB_REPOSITORY.split('/');
  if(!owner||!repo)throw Error('Invalid GITHUB_REPOSITORY');
  const payload={request_id:requestId,title:movie.title,movie_id:movie.id,year:movie.year,quality:movie.quality,recipient_jid:session.number.slice(1)+'@s.whatsapp.net',rights_confirmed:true};
  const result=await fetch('https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/dispatches',{
   method:'POST',headers:{Authorization:'Bearer '+process.env.GITHUB_DISPATCH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
   body:JSON.stringify({event_type:'autowa-verified-request',client_payload:payload}),signal:AbortSignal.timeout(15000)
  });
  if(!result.ok){await redis('DEL','claim:'+hmac(session.nonce));return send(res,503,{error:'Queue unavailable; try again later'});}
  return send(res,202,{request_id:requestId,status:'pending_review',message:'Request queued for review; delivery is not guaranteed'});
 }catch(err){console.error('API error',String(err.message));return send(res,500,{error:'Request could not be completed'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log('AutoWA API listening on',PORT));
if(configured)startWhatsApp().catch(e=>console.error('WhatsApp initialization failed',e.message));
