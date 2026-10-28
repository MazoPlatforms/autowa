import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT=Number(process.env.PORT||8000);
const required=['APP_SECRET','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','WHATSAPP_CLOUD_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_OTP_TEMPLATE','GITHUB_DISPATCH_TOKEN','GITHUB_REPOSITORY'];
const missing=required.filter(k=>!process.env[k]);
if(missing.length)throw Error('Missing required environment variables: '+missing.join(', '));
const secret=process.env.APP_SECRET;
if(secret.length<32)throw Error('APP_SECRET must be at least 32 characters');
const redisBase=process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/,'');
const redisToken=process.env.UPSTASH_REDIS_REST_TOKEN;
const hmac=s=>crypto.createHmac('sha256',secret).update(s).digest('hex');
const safeEq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function redis(...args){
 const r=await fetch(redisBase,{method:'POST',headers:{Authorization:'Bearer '+redisToken,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Persistent store unavailable');
 const data=await r.json();if(data.error)throw Error('Persistent store error');return data.result;
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
async function sendOtp(number,code){
 const version=process.env.WHATSAPP_GRAPH_VERSION||'v22.0';
 const r=await fetch('https://graph.facebook.com/'+version+'/'+encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)+'/messages',{
  method:'POST',headers:{Authorization:'Bearer '+process.env.WHATSAPP_CLOUD_TOKEN,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',to:number.slice(1),type:'template',template:{name:process.env.WHATSAPP_OTP_TEMPLATE,language:{code:process.env.WHATSAPP_OTP_LANGUAGE||'en_US'},components:[{type:'body',parameters:[{type:'text',text:code}]}]}}),signal:AbortSignal.timeout(15000)
 });
 if(!r.ok)throw Error('WhatsApp OTP provider rejected request');
}
const index=fs.readFileSync(new URL('../web/index.html',import.meta.url));
const countries=fs.readFileSync(new URL('../site/countries.json',import.meta.url));
const appJs=fs.readFileSync(new URL('../web/app.js',import.meta.url));
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health'){return send(res,200,{ok:true});}
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});return res.end(index);}
  if(req.method==='GET'&&url.pathname==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(appJs);}
  if(req.method==='GET'&&url.pathname==='/countries.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'});return res.end(countries);}
  if(req.method!=='POST'||!['/api/otp/start','/api/otp/verify','/api/request'].includes(url.pathname))return send(res,404,{error:'Not found'});
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
   const nonce=crypto.randomBytes(16).toString('hex'),exp=Date.now()+15*60*1000;
   await redis('SET','session:'+hmac(nonce),number,'EX',900);
   return send(res,200,{token:tokenFor(number,nonce,exp),expires_in:900});
  }
  const session=verifyToken(data.token);
  if(!session||await redis('GET','session:'+hmac(session.nonce))!==session.number)return send(res,401,{error:'Verify your WhatsApp number first'});
  if(!await limit('submit:'+session.number,3,86400))return send(res,429,{error:'Daily request limit reached'});
  if(typeof data.title!=='string'||data.title.trim().length<2||data.title.length>140||typeof data.source_url!=='string'||data.source_url.length>2048||data.rights_confirmed!==true)return send(res,400,{error:'Title, HTTPS URL and rights confirmation required'});
  let source;try{source=new URL(data.source_url);}catch{return send(res,400,{error:'Invalid URL'});}
  if(source.protocol!=='https:'||source.username||source.password||source.port||source.hostname==='localhost')return send(res,400,{error:'Public HTTPS URL required'});
  const claim=await redis('SET','claim:'+hmac(session.nonce),'1','EX',900,'NX');
  if(claim!=='OK')return send(res,409,{error:'Request already submitted'});
  const requestId=crypto.randomUUID();
  const [owner,repo]=process.env.GITHUB_REPOSITORY.split('/');
  if(!owner||!repo)throw Error('Invalid GITHUB_REPOSITORY');
  const payload={request_id:requestId,title:data.title.trim(),source_url:source.toString(),recipient_jid:session.number.slice(1)+'@s.whatsapp.net',rights_confirmed:true};
  const result=await fetch('https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/dispatches',{
   method:'POST',headers:{Authorization:'Bearer '+process.env.GITHUB_DISPATCH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
   body:JSON.stringify({event_type:'autowa-verified-request',client_payload:payload}),signal:AbortSignal.timeout(15000)
  });
  if(!result.ok){await redis('DEL','claim:'+hmac(session.nonce));return send(res,503,{error:'Queue unavailable; try again later'});}
  await redis('DEL','session:'+hmac(session.nonce));
  return send(res,202,{request_id:requestId,status:'pending_review',message:'Request queued for review; delivery is not guaranteed'});
 }catch(err){console.error('API error',String(err.message));return send(res,500,{error:'Request could not be completed'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log('AutoWA API listening on',PORT));
