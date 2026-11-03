import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {Writable,finished as streamFinished} from 'node:stream';
const execFileAsync=promisify(execFile);
import {startWhatsApp,sendWhatsAppOtp,deleteWhatsAppOtp,getWhatsAppProfilePicture,getWhatsAppBotNumber,isWhatsAppNumber} from './whatsapp-otp.mjs';
import {startFilmGoBot} from './filmgo-bot.mjs';
import {logFilmGo} from './filmgo-logs.mjs';
import {startStreamWorker,proxyRange,downloadFile,streamWorkerState} from './stream-worker.mjs';
import {startFastStreamWorker,fastProxyRange,fastWarm} from './fast-stream-worker.mjs';
import {createAudioService,telegramRangeReader} from './audio-tracks.mjs';
import {DAILY_TOKEN_LIMIT,DAILY_TOKEN_LIMIT_MILLI,tokenCostMilli,tokenAmount,reserveDailyTokens,releaseDailyTokens,dailyTokenUsage} from './daily-tokens.mjs';
import {createLinkedWhatsApp} from './linked-whatsapp.mjs';
import {linkedWhatsAppAdapter,deliverLinkedMedia} from './linked-whatsapp-runtime.mjs';
import {linkedDeliveryApi} from './linked-delivery-api.mjs';

const PORT=Number(process.env.PORT||8000);
const STREAM_RANGE_SIZE=32*1024*1024;
const fastStreaming=process.env.FILMGO_FAST_STREAM==='1';
const required=['APP_SECRET','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','GITHUB_DISPATCH_TOKEN','GITHUB_REPOSITORY'];
const missing=required.filter(k=>!process.env[k]);
const secret=process.env.APP_SECRET||'';
const configured=missing.length===0&&secret.length>=32;
if(!configured)console.warn('FilmGo setup incomplete: configure APP_SECRET and required storage/GitHub secrets; API will fail closed. Missing:',missing.join(', ')||'APP_SECRET length < 32');
const redisBase=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const redisToken=process.env.UPSTASH_REDIS_REST_TOKEN;
const hmac=s=>crypto.createHmac('sha256',secret).update(s).digest('hex');
const safeEq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function redis(...args){
 const r=await fetch(redisBase,{method:'POST',headers:{Authorization:'Bearer '+redisToken,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Persistent store unavailable');
 const data=await r.json();if(data.error)throw Error('Persistent store error');return data.result;
}
const OTP_TTL=300;
const OTP_MESSAGE_PREFIX='otp-message:';
const recurringWarningAt=new Map();
function recurringWarn(key,message,interval=300000){
 const now=Date.now(),last=recurringWarningAt.get(key)||0;
 if(now-last<interval)return;
 recurringWarningAt.set(key,now);
 console.warn(message);
}
const otpMessageKey=number=>OTP_MESSAGE_PREFIX+hmac(number);
const WA_VERIFY_TTL=300;
const WA_VERIFY_PREFIX='wa-verify:';
const waVerifyKey=value=>WA_VERIFY_PREFIX+hmac(value);
async function removeOtpMessage(recordKey,raw){
 if(!raw)return true;
 try{
  const record=JSON.parse(raw);
  if(!record?.message_key?.id||!record.message_key.remoteJid){await redis('DEL',recordKey);return true;}
  const removed=await deleteWhatsAppOtp(record.message_key);
  if(removed)await redis('DEL',recordKey);
  return removed;
 }catch(error){
  const detail=error?.message||error?.data?.message||error?.output?.payload?.message||(typeof error==='string'?error:'unknown error');
  console.warn('OTP message cleanup deferred:',detail);
  return false;
 }
}
async function cleanupExpiredOtpMessages(){
 let cursor='0';
 do{
  const result=await redis('SCAN',cursor,'MATCH',OTP_MESSAGE_PREFIX+'*','COUNT','100');
  cursor=String(result?.[0]??'0');
  for(const recordKey of result?.[1]||[]){
   const raw=await redis('GET',recordKey);
   if(!raw){continue;}
   let record;
   try{record=JSON.parse(raw);}catch{await redis('DEL',recordKey);continue;}
   if(Number(record.expires_at)>Date.now())continue;
   await removeOtpMessage(recordKey,raw);
  }
 }while(cursor!=='0');
}
function startOtpMessageCleanup(){
 const timer=setInterval(()=>{void cleanupExpiredOtpMessages().catch(error=>recurringWarn('otp-cleanup','OTP cleanup scan failed: '+error.message));},30000);
 timer.unref();
}
const UNLIMITED_REQUEST_NUMBER="+94779290433";
const unlimitedRequests=number=>number===UNLIMITED_REQUEST_NUMBER;
const linkedWhatsApp=configured?createLinkedWhatsApp({redis,secret:process.env.WHATSAPP_LINK_SECRET||secret,hmac,adapter:linkedWhatsAppAdapter,deliver:deliverLinkedMedia,onFailed:async job=>{
 if(await redis('SET','linked-wa-refunded:'+job.id,'1','NX','EX',2592000)==='OK')await releaseDailyTokens(redis,job.reservation);
}}):null;
const telegramReady=['TELEGRAM_API_ID','TELEGRAM_API_HASH','TELEGRAM_SESSION','TELEGRAM_CHANNEL_ID'].every(k=>!!process.env[k]);
const telegramAnimeReady=['TELEGRAM_API_ID','TELEGRAM_API_HASH','TELEGRAM_SESSION','TELEGRAM_ANIME_CHANNEL_ID'].every(k=>!!process.env[k]);
let syncPromise=null;
let animeSyncPromise=null;
let telegramAuthBlocked=false;
let telegramCatalogStatus={state:'starting',updated_at:null,error:null};
let telegramAnimeStatus={state:telegramAnimeReady?'starting':'disabled',updated_at:null,error:null};
function telegramError(err){
 const stderr=String(err.stderr||'').trim();
 const lines=stderr.split('\n').filter(Boolean);
 return ['exit='+String(err.code??'unknown'),'signal='+String(err.signal??'none'),lines.slice(-5).join(' | ')||String(err.message)].join('; ').slice(0,700);
}
async function refreshCatalog(){
 if(!configured||!telegramReady||telegramAuthBlocked)return;
 if(syncPromise)return syncPromise;
 syncPromise=(async()=>{
  telegramCatalogStatus={...telegramCatalogStatus,state:'syncing'};
  try{
   const {stdout}=await execFileAsync('python3',['src/telegram_media.py','index'],{timeout:60000,maxBuffer:3*1024*1024,env:process.env});
   const data=JSON.parse(stdout);
   if(!Array.isArray(data.movies))throw Error('Invalid Telegram catalog response');
   await redis('SET','telegram:catalog:v2',JSON.stringify(data));
   await redis('SET','telegram:recent:v1',JSON.stringify({...data,movies:data.movies.slice(0,15)}));
   telegramCatalogStatus={state:'ready',updated_at:Date.now(),error:null};
   console.log('Telegram catalog refreshed:',data.movies.length,'media items');
  }catch(err){
   const error=telegramError(err);
   if(/AuthKeyUnregisteredError|AuthKeyInvalidError|SessionRevokedError|SessionExpiredError|UnauthorizedError/i.test(error)){
    telegramAuthBlocked=true;
    telegramCatalogStatus={state:'auth_required',updated_at:Date.now(),error:'Telegram authentication expired or revoked; update TELEGRAM_SESSION and redeploy'};
    console.error('Telegram authorization rejected; automatic retries suspended until restart with a renewed session');
    return;
   }
   telegramCatalogStatus={state:'error',updated_at:Date.now(),error};
   console.error('Telegram catalog refresh failed:',error);
  }
 })();
 try{await syncPromise;}finally{syncPromise=null;}
}
async function refreshAnimeCatalog(){
 if(!configured||!telegramAnimeReady||telegramAuthBlocked)return;
 if(animeSyncPromise)return animeSyncPromise;
 animeSyncPromise=(async()=>{
  telegramAnimeStatus={...telegramAnimeStatus,state:'syncing'};
  try{
   const {stdout}=await execFileAsync('python3',['src/telegram_media.py','index-anime'],{timeout:180000,maxBuffer:10*1024*1024,env:process.env});
   const data=JSON.parse(stdout);
   if(!Array.isArray(data.anime))throw Error('Invalid anime catalog response');
   const previous=await redis('GET','telegram:anime:v1').catch(()=>null);
   if(previous){
    try{
     const oldEpisodes=new Map((JSON.parse(previous).anime||[]).flatMap(item=>(item.episodes||[]).flatMap(episode=>[episode,...Object.values(episode.qualities||{})])).filter(item=>item.telegram_message_id&&item.slug_id).map(item=>[String(item.telegram_message_id),item.slug_id]));
     for(const show of data.anime)for(const episode of show.episodes||[]){const old=oldEpisodes.get(String(episode.telegram_message_id));if(old)episode.slug_id=old;}
    }catch{}
   }
   await redis('SET','telegram:anime:v1',JSON.stringify(data));
   telegramAnimeStatus={state:'ready',updated_at:Date.now(),error:null};
   console.log('Telegram anime catalog refreshed:',data.anime.length,'series');
  }catch(err){
   const error=telegramError(err);telegramAnimeStatus={state:'error',updated_at:Date.now(),error};
   console.error('Telegram anime catalog refresh failed:',error);
  }
 })();
 try{await animeSyncPromise;}finally{animeSyncPromise=null;}
}
if(configured&&telegramReady){
 void refreshCatalog();
 setInterval(()=>{void refreshCatalog();},120000).unref();
 startStreamWorker();
 if(fastStreaming)startFastStreamWorker();
}
if(configured&&telegramAnimeReady){
 void refreshAnimeCatalog();
 setInterval(()=>{void refreshAnimeCatalog();},120000).unref();
}
async function getCatalog(){
 const raw=await redis('GET','telegram:catalog:v2');
 return raw?JSON.parse(raw):null;
}
async function getAnimeCatalog(){
 const raw=await redis('GET','telegram:anime:v1');
 const data=raw?JSON.parse(raw):{anime:[],indexed_at:null};let changed=false;
 for(const anime of data.anime||[])for(const episode of anime.episodes||[]){if(!episode.slug_id){episode.slug_id=crypto.randomBytes(12).toString('base64url');changed=true;}}
 if(changed)await redis('SET','telegram:anime:v1',JSON.stringify(data));
 return data;
}
function findAnimeEpisode(catalog, requestedId){
 const id=String(requestedId);
 for(const anime of catalog.anime||[])for(const episode of anime.episodes||[]){
  const matches=item=>String(item?.slug_id)===id||String(item?.telegram_message_id)===id;
  if(matches(episode))return {anime,episode};
  for(const variant of Object.values(episode.qualities||{}))if(matches(variant))return {anime,episode:{...episode,...variant,qualities:episode.qualities}};
 }
 return null;
}
function selectAnimeVariant(episode, quality){
 if(!episode)return null;
 const variants=episode.qualities||{[String(episode.quality||'720P').toUpperCase()]:episode};
 const key=quality?Object.keys(variants).find(value=>value.toLowerCase()===String(quality).toLowerCase()):Object.keys(variants).find(value=>value.toLowerCase()==='720p')||Object.keys(variants)[0];
 return key?{...episode,...variants[key],slug_id:episode.slug_id,quality:key,qualities:episode.qualities||variants}:null;
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
async function issueSession(number){
 const nonce=crypto.randomBytes(18).toString('base64url'),age=30*24*60*60,exp=Date.now()+age*1000;
 await redis('SET','session:'+hmac(nonce),number,'EX',age);
 const key='profile:'+hmac(number),existing=await redis('GET',key);
 if(!existing)await redis('SET',key,JSON.stringify({name:'',created_at:new Date().toISOString(),plan_onboarded:false}));
 return {first_registration:!existing,expires_in:age,cookie:sessionCookie(tokenFor(number,nonce,exp),age)};
}
function verifyToken(token){
 if(typeof token!=='string'||token.length>700)return null;
 const [data,mac,...extra]=token.split('.');if(!data||!mac||extra.length||!safeEq(hmac(data),mac))return null;
 try{const value=JSON.parse(Buffer.from(data,'base64url').toString());return value.exp>Date.now()&&phone(value.number)&&typeof value.nonce==='string'?value:null;}catch{return null;}
}
function cookieToken(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('tfw_session='))?.slice(12)||'';}
async function authenticated(req){const session=verifyToken(cookieToken(req));return session&&await redis('GET','session:'+hmac(session.nonce))===session.number?session:null;}
// Every seek is a new Range request; without this each one waited for an Upstash
// round trip just to re-check the session. The signed token is still verified on
// every request; only the "not revoked" lookup is cached (default 30 s, 0 = off).
// Logout clears the entry immediately.
const AUTH_STREAM_CACHE_MS=Number(process.env.AUTH_STREAM_CACHE_MS??30000);
const authStreamCache=new Map();
async function authenticatedStream(req){
 const session=verifyToken(cookieToken(req));if(!session)return null;
 const key=hmac(session.nonce),hit=authStreamCache.get(key);
 if(hit&&hit.number===session.number&&hit.until>Date.now())return session;
 if(await redis('GET','session:'+key)!==session.number){authStreamCache.delete(key);return null;}
 if(AUTH_STREAM_CACHE_MS>0){
  authStreamCache.set(key,{number:session.number,until:Date.now()+AUTH_STREAM_CACHE_MS});
  if(authStreamCache.size>2000){const now=Date.now();for(const [k,v] of authStreamCache)if(v.until<=now)authStreamCache.delete(k);if(authStreamCache.size>2000)authStreamCache.clear();}
 }
 return session;
}
function sessionCookie(token,age){return 'tfw_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;}
// Private per-account request history. Never expose a public phone-indexed endpoint.
const historyKey=number=>'request-history:'+hmac(number);
async function requestHistory(number){
 const raw=await redis('LRANGE',historyKey(number),0,99);
 const records=(Array.isArray(raw)?raw:[]).map(value=>{try{return JSON.parse(value);}catch{return null;}}).filter(Boolean);
 // Workflow completion is stored in sanitized repository files; never look it up by phone.
 // Only check request IDs already present in this authenticated user's Redis list.
 const token=process.env.GITHUB_DISPATCH_TOKEN,repository=process.env.GITHUB_REPOSITORY;
 if(!token||!repository||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))return records;
 await Promise.all(records.slice(0,30).map(async record=>{
  if(!/^[a-f0-9-]{36}$/.test(record.id||''))return;
  try{
   const response=await fetch('https://api.github.com/repos/'+repository+'/contents/movies/request-'+record.id+'.json',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(3000)});
   if(!response.ok)return;
   const saved=await response.json();
   if(['processing','downloading','submitted','failed'].includes(saved.status)){record.status=saved.status;record.finished_at=saved.finished_at||null;}
  }catch{/* Keep last known status when GitHub is unavailable. */}
 }));
 const linked=linkedWhatsApp?await linkedWhatsApp.history(number):[];
 return [...linked,...records].sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)).slice(0,100);
}
async function profile(number){const raw=await redis('GET','profile:'+hmac(number));return raw?JSON.parse(raw):{name:'',created_at:new Date().toISOString()};}
async function sendOtp(number,code){return sendWhatsAppOtp(number,code);}
const index=fs.readFileSync(new URL('../web/index.html',import.meta.url)).toString('utf8').replace('<script src="/poster-wall.js','<script src="/phone-format.js?v=20261103-1" defer></script><script src="/poster-wall.js').replace('</body>','<script src="/linked-whatsapp.js?v=20261103-1" defer></script></body>');
const catalogHtml=fs.readFileSync(new URL('../web/catalog.html',import.meta.url),'utf8').replaceAll('v=20261102-i1','v=20261103-wa2');
const catalogJs=fs.readFileSync(new URL('../web/catalog.js',import.meta.url));
const catalogCss=fs.readFileSync(new URL('../web/catalog.css',import.meta.url));
const playerUiJs=fs.readFileSync(new URL('../web/player-ui.js',import.meta.url));
const playerCss=fs.readFileSync(new URL('../web/player.css',import.meta.url));
// Anime metadata is rebuilt on startup so season-aware episode titles replace stale Redis data.
const animeHtml=fs.readFileSync(new URL('../web/anime.html',import.meta.url));
const animeWatchHtml=fs.readFileSync(new URL('../web/anime-watch.html',import.meta.url),'utf8').replaceAll('v=20261102-i1','v=20261103-wa2');
const animeSoonHtml=fs.readFileSync(new URL('../web/anime-soon.html',import.meta.url));
const animeJs=fs.readFileSync(new URL('../web/anime.js',import.meta.url));
const animeCss=fs.readFileSync(new URL('../web/anime.css',import.meta.url));
const animeWatchCss=fs.readFileSync(new URL('../web/anime-watch.css',import.meta.url));
const animeWatchJs=fs.readFileSync(new URL('../web/anime-watch.js',import.meta.url));
const animeSoonCss=fs.readFileSync(new URL('../web/anime-soon.css',import.meta.url));
const adminHtml=fs.readFileSync(new URL('../web/admin.html',import.meta.url));
const adminCss=fs.readFileSync(new URL('../web/admin.css',import.meta.url));
const adminJs=fs.readFileSync(new URL('../web/admin.js',import.meta.url));
const homeCss=fs.readFileSync(new URL('../web/home.css',import.meta.url));
const accountChipJs=fs.readFileSync(new URL('../web/account-chip.js',import.meta.url));
const tailwindCss=fs.readFileSync(new URL('../web/tailwind.css',import.meta.url));
const brandAssets=new Map([
 ['/manifest.webmanifest',{body:fs.readFileSync(new URL('../web/manifest.webmanifest',import.meta.url)),type:'application/manifest+json',cache:'public, max-age=86400'}],
 ['/icons/favicon.ico',{body:fs.readFileSync(new URL('../web/icons/favicon.ico',import.meta.url)),type:'image/x-icon',cache:'public, max-age=31536000, immutable'}],
 ['/icons/favicon-16.png',{body:fs.readFileSync(new URL('../web/icons/favicon-16.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/favicon-32.png',{body:fs.readFileSync(new URL('../web/icons/favicon-32.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/favicon-64.png',{body:fs.readFileSync(new URL('../web/icons/favicon-64.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/apple-touch-icon.png',{body:fs.readFileSync(new URL('../web/icons/apple-touch-icon.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/filmgo-mark.png',{body:fs.readFileSync(new URL('../web/icons/filmgo-mark.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/filmgo-wordmark.png',{body:fs.readFileSync(new URL('../web/icons/filmgo-wordmark.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/filmgo-lockup.png',{body:fs.readFileSync(new URL('../web/icons/filmgo-lockup.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/filmgo-app.png',{body:fs.readFileSync(new URL('../web/icons/filmgo-app.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/filmgo-192.png',{body:fs.readFileSync(new URL('../web/icons/filmgo-192.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/filmgo-512.png',{body:fs.readFileSync(new URL('../web/icons/filmgo-512.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}],
 ['/icons/filmgo-maskable.png',{body:fs.readFileSync(new URL('../web/icons/filmgo-maskable.png',import.meta.url)),type:'image/png',cache:'public, max-age=31536000, immutable'}]
]);
const animeBanners=new Map([
 ...Array.from({length:11},(_,i)=>'naruto-season-'+(i+1)+'.webp'),
 ...Array.from({length:18},(_,i)=>'naruto-shippuden-season-'+(i+1)+'.webp'),
 'attack-on-titan-oad.webp',
 ...Array.from({length:4},(_,i)=>'attack-on-titan-season-'+(i+1)+'.webp'),
 ...Array.from({length:3},(_,i)=>'jujutsu-kaisen-season-'+(i+1)+'.webp'),
 'solo-leveling-season-1.webp',
 'solo-leveling-season-2.webp'
].map(name=>[
 '/banners/'+name,
 fs.readFileSync(new URL('../web/banners/'+name,import.meta.url))
]));
let publicCatalog=JSON.parse(fs.readFileSync(new URL('../data/movies.json',import.meta.url),'utf8'));
let publicCatalogEtag='"'+crypto.createHash('sha256').update(JSON.stringify(publicCatalog)).digest('base64url')+'"';
let catalogChecked=0,catalogPending=null;
function refreshPublicCatalog(){
 if(catalogPending)return catalogPending;
 catalogPending=(async()=>{
  try{
   const response=await fetch('https://raw.githubusercontent.com/MazoPlatforms/autowa/main/data/movies.json?ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(6000)});
   if(!response.ok)throw Error('Catalog HTTP '+response.status);
   const data=await response.json();
   if(!Array.isArray(data.movies)||data.movies.some(m=>!m||typeof m.slug_id!=='string'||!Number.isSafeInteger(m.telegram_message_id)))throw Error('Invalid catalog');
   publicCatalog=data;
   publicCatalogEtag='"'+crypto.createHash('sha256').update(JSON.stringify(publicCatalog)).digest('base64url')+'"';
  }catch(err){recurringWarn('public-catalog','FilmGo catalog update failed; serving last valid copy: '+err.message);}
  finally{catalogChecked=Date.now();catalogPending=null;}
  return publicCatalog;
 })();
 return catalogPending;
}
function getPublicCatalog(){
 if(Date.now()-catalogChecked>=60000)void refreshPublicCatalog();
 return Promise.resolve(publicCatalog);
}
void refreshPublicCatalog();
setInterval(()=>{void refreshPublicCatalog();},120000).unref();
function selectMovieVariant(movie, quality){
 if(!movie)return null;
 const entries=movie.qualities||{[movie.quality]:movie};
 if(quality){
  const key=Object.keys(entries).find(k=>k.toLowerCase()===quality.toLowerCase());
  return key?{...entries[key],quality:key}:null;
 }
 const key=Object.keys(entries).find(k=>k.toLowerCase()==='720p')||Object.keys(entries)[0];
 return key?{...entries[key],quality:key}:null;
}
const countries=fs.readFileSync(new URL('../site/countries.json',import.meta.url));
const appJs=fs.readFileSync(new URL('../web/app.js',import.meta.url));
const stylesheet=fs.readFileSync(new URL('../web/style.css',import.meta.url));
const posterWallJs=fs.readFileSync(new URL('../web/poster-wall.js',import.meta.url));
const phoneFormatJs=fs.readFileSync(new URL('../web/phone-format.js',import.meta.url));
const linkedWhatsAppJs=fs.readFileSync(new URL('../web/linked-whatsapp.js',import.meta.url));
const posterBackgrounds=new Map(['bg-04.webp','bg-05.webp','bg-06.webp','bg-28.webp','bg-30.webp'].map(name=>[
 '/posters/background/'+name,
 fs.readFileSync(new URL('../web/posters/background/'+name,import.meta.url))
]));
async function renderCatalogPage(req,source=catalogHtml){
 let session=null,user=null;
 try{session=await authenticated(req);if(session)user=await profile(session.number);}catch{}
 const authenticatedState=Boolean(session);
 const name=String(user?.name||'').trim();
 const label=authenticatedState?(name?name.split(/\s+/).slice(0,2).map(value=>value[0]||'').join('').toUpperCase():'Account'):'Sign in';
 const fallbackAvatar='https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original';
 const accountContent=authenticatedState?'<img class="catalog-avatar-image" src="'+fallbackAvatar+'" alt="Profile" referrerpolicy="no-referrer" decoding="async">':label;
 const accountLink='<a href="/profile" class="tv-account'+(authenticatedState?' catalog-account-avatar':'')+'" id="catalog-account-link" aria-live="polite" aria-busy="false" aria-label="'+(authenticatedState?'Open profile':'Sign in')+'" data-server-authenticated="'+String(authenticatedState)+'">'+accountContent+'</a>';
 // Keep authentication server-rendered so the redesign cannot briefly show
 // the guest label for an already authenticated user.
 return source.toString('utf8').replace(/<a\b[^>]*\bid="catalog-account-link"[^>]*>[\s\S]*?<\/a>/,accountLink);
}
// ---- MKV multi-audio: track list + on-the-fly audio conversion (see src/audio-tracks.mjs) ----
const noopSend=()=>{};
async function movieGatewayPart(out,messageId,size,off,setCurrent){
 if(!fastStreaming&&streamWorkerState().state!=='ready')return null;
 const part=new Writable({highWaterMark:1<<20,write(chunk,_enc,cb){if(out.destroyed)return cb();if(out.write(chunk))cb();else out.once('drain',cb);}});
 part.writeHead=()=>{};setCurrent(part);
 let got=0;const onChunk=n=>{got+=n;};let handled=false;
 if(fastStreaming)handled=await fastProxyRange(part,{},{messageId,start:off,length:size,onChunk},noopSend);
 if(!handled)handled=await proxyRange(part,{},{messageId,start:off,length:size,onChunk},noopSend);
 if(!handled)return null;
 await new Promise(done=>streamFinished(part,()=>done()));
 return got===size;
}
function mediaExt(name,mime){const e=/\.(mp4|mkv|webm|mov|avi|m4v|mka)$/i.exec(String(name||''))?.[1]?.toLowerCase();if(e)return e;mime=String(mime||'').toLowerCase();return mime.includes('matroska')?'mkv':mime.includes('webm')?'webm':'';}
const audioService=createAudioService({
 port:PORT,hmac,
 authenticated:authenticatedStream,
 send:(res,status,data,headers)=>send(res,status,data,headers),
 async resolve(kind,id,quality){
  if(kind==='movie'){
   if(!telegramReady)return null;
   const record=((await getPublicCatalog()).movies||[]).find(m=>m.slug_id===id),movie=selectMovieVariant(record,quality||null);
   if(!movie||!Number.isSafeInteger(movie.telegram_message_id)||!Number.isSafeInteger(movie.file_size)||movie.file_size<=0)return null;
   const mid=movie.telegram_message_id;
   return {ext:mediaExt(movie.file_name,movie.mime_type),total:movie.file_size,open:telegramRangeReader({
    spawnPython:(s,l)=>spawn('python3',['src/telegram_stream.py',String(mid),String(s),String(l)],{env:process.env,stdio:['ignore','pipe','ignore']}),
    gatewayRange:(out,size,off,setCurrent)=>movieGatewayPart(out,mid,size,off,setCurrent)})};
  }
  if(!telegramAnimeReady)return null;
  const found=findAnimeEpisode(await getAnimeCatalog(),id),episode=selectAnimeVariant(found?.episode,quality||null),mid=Number(episode?.telegram_message_id),total=Number(episode?.file_size);
  if(!episode||!Number.isSafeInteger(mid)||!Number.isSafeInteger(total)||total<=0)return null;
  return {ext:mediaExt(episode.file_name,episode.mime_type),total,open:telegramRangeReader({
   spawnPython:(s,l)=>spawn('python3',['src/telegram_stream.py',String(mid),String(s),String(l),String(process.env.TELEGRAM_ANIME_CHANNEL_ID)],{env:process.env,stdio:['ignore','pipe','ignore']}),
   partSize:STREAM_RANGE_SIZE,firstPart:8*1024*1024})};
 },
 // Only the small converted audio is charged (not the file bytes ffmpeg reads), so watching with a
 // converted track costs the same tokens as watching with the original track.
 async reserve(session){
  const exempt=unlimitedRequests(session.number),reservation=await reserveDailyTokens(redis,hmac(session.number),tokenCostMilli(2*1024*1024,'stream'),{unlimited:exempt});
  return {allowed:reservation.allowed,async settle(delivered){const actual=delivered?tokenCostMilli(delivered,'stream'):0;if(!exempt&&reservation.allowed&&reservation.costMilli>actual)await releaseDailyTokens(redis,reservation,reservation.costMilli-actual).catch(()=>{});}};
 }
});
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/linked-whatsapp.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(linkedWhatsAppJs);}
  if(configured&&await linkedDeliveryApi(req,res,url,{authenticated,send,body,limit,manager:linkedWhatsApp,
   resolveMedia:async(kind,input)=>{
    if(kind==='anime'){
     if(typeof input.episode_slug_id!=='string')return null;
     const found=findAnimeEpisode(await getAnimeCatalog(),input.episode_slug_id),episode=selectAnimeVariant(found?.episode,input.quality);
     if(!episode)return null;
     return {kind,title:found.anime.title+' · Season '+episode.season+' · Episode '+episode.episode,quality:episode.quality,file_size:Number(episode.file_size),message_id:Number(episode.telegram_message_id),file_name:episode.file_name};
    }
    const catalog=await getPublicCatalog();
    for(const movie of catalog.movies||[]){const variant=Object.entries(movie.qualities||{[movie.quality]:movie}).find(([,item])=>Number(item.telegram_message_id)===input.movie_id);if(variant){const [quality,item]=variant;return {kind,title:movie.title,year:movie.year,quality,file_size:Number(item.file_size),message_id:Number(item.telegram_message_id),file_name:item.file_name};}}
    return null;
   },
   reserve:(number,size)=>reserveDailyTokens(redis,hmac(number),tokenCostMilli(size,'whatsapp'),{unlimited:unlimitedRequests(number)}),
   refund:reservation=>releaseDailyTokens(redis,reservation)
  }))return;
  if(url.pathname==='/admin'||url.pathname==='/admin.css'||url.pathname==='/admin.js'){
   const session=await authenticated(req);
   if(!session||session.number!=='+94779290433')return send(res,404,{error:'Not found'});
   if(url.pathname==='/admin'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});return res.end(adminHtml);}
   const asset=url.pathname==='/admin.css'?{body:adminCss,type:'text/css; charset=utf-8'}:{body:adminJs,type:'text/javascript; charset=utf-8'};
   res.writeHead(200,{'Content-Type':asset.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
   return res.end(asset.body);
  }
  if((url.pathname.startsWith('/api/audio')||url.pathname.startsWith('/internal/media/'))&&await audioService(req,res,url))return;
  const brandAsset=brandAssets.get(url.pathname);
  if(req.method==='GET'&&brandAsset){res.writeHead(200,{'Content-Type':brandAsset.type,'Cache-Control':brandAsset.cache,'X-Content-Type-Options':'nosniff'});return res.end(brandAsset.body);}
  const animeBanner=animeBanners.get(url.pathname);
  if(req.method==='GET'&&animeBanner){res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});return res.end(animeBanner);}
  const directDownload=url.pathname.match(/^\/download\/([A-Za-z0-9_-]{1,80})$/);
  if(req.method==='GET'&&directDownload){
   const quality=url.searchParams.get('quality')||'';
   if(quality&&!/^[A-Za-z0-9._+-]{1,40}$/.test(quality))return send(res,400,{error:'Invalid quality'});
   const returnPath='/download/'+directDownload[1]+(quality?'?quality='+encodeURIComponent(quality):'');
   if(!await authenticated(req)){res.writeHead(302,{'Location':'/profile?return='+encodeURIComponent(returnPath),'Cache-Control':'no-store'});return res.end();}
   res.writeHead(302,{'Location':'/api/download/'+directDownload[1]+(quality?'?quality='+encodeURIComponent(quality):''),'Cache-Control':'no-store'});return res.end();
  }
  const directAnimeDownload=url.pathname.match(/^\/anime\/download\/([A-Za-z0-9_-]{8,80})$/);
  if(req.method==='GET'&&directAnimeDownload){
   const returnPath='/anime/download/'+directAnimeDownload[1];
   if(!await authenticated(req)){res.writeHead(302,{'Location':'/profile?return='+encodeURIComponent(returnPath),'Cache-Control':'no-store'});return res.end();}
   res.writeHead(302,{'Location':'/api/anime/download/'+directAnimeDownload[1],'Cache-Control':'no-store'});return res.end();
  }
  if(req.method==='GET'&&/^\/posters\/[a-f0-9]{24}\.jpg$/.test(url.pathname)){
   const upstream=await fetch('https://raw.githubusercontent.com/MazoPlatforms/autowa/main/web'+url.pathname,{signal:AbortSignal.timeout(8000)});
   if(!upstream.ok)return send(res,404,{error:'Poster unavailable'});
   res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400, stale-while-revalidate=604800','X-Content-Type-Options':'nosniff'});
   return res.end(Buffer.from(await upstream.arrayBuffer()));
  }
  if(req.method==='POST'&&url.pathname==='/api/telegram-link'){
   if(!configured)return send(res,503,{error:'Service setup incomplete'});
   const session=await authenticated(req);
   if(!session)return send(res,401,{error:'Please sign in using your phone number.'});
   let publicBase;
   try{const origin=new URL(req.headers.origin||'');if(origin.protocol!=='https:'||origin.host!==req.headers.host||origin.username||origin.password)return send(res,403,{error:'Origin rejected'});publicBase=origin.origin;}catch{return send(res,403,{error:'Origin rejected'});}
   if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'JSON required'});
   const input=await body(req);
   const slug=String(input.slug_id||'');
   if(!/^[A-Za-z0-9_-]{1,80}$/.test(slug))return send(res,400,{error:'Invalid movie'});
   const movie=(await getPublicCatalog()).movies.find(m=>m.slug_id===slug);
   if(!movie)return send(res,404,{error:'Movie unavailable'});
   const token=crypto.randomBytes(12).toString('base64url');
   await redis('SET','filmgo:deeplink:'+token,JSON.stringify({slug_id:slug,account_hash:hmac(session.number),unlimited:unlimitedRequests(session.number),base_url:publicBase}),'EX',600);
   return send(res,200,{url:'https://t.me/mzn_filmgobot?start=m_'+token});
  }
  if(req.method==='POST'&&url.pathname==='/api/anime-telegram-link'){
   if(!configured||!telegramAnimeReady)return send(res,503,{error:'Anime delivery is temporarily unavailable'});
   const session=await authenticated(req);if(!session)return send(res,401,{error:'Please sign in using your phone number.'});
   let publicBase;try{const origin=new URL(req.headers.origin||'');if(origin.protocol!=='https:'||origin.host!==req.headers.host||origin.username||origin.password)return send(res,403,{error:'Origin rejected'});publicBase=origin.origin;}catch{return send(res,403,{error:'Origin rejected'});}
   if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'JSON required'});
   const input=await body(req),slug=String(input.episode_slug_id||'');if(!/^[A-Za-z0-9_-]{8,80}$/.test(slug))return send(res,400,{error:'Invalid anime episode'});
   const catalog=await getAnimeCatalog(),found=findAnimeEpisode(catalog,slug),anime=found?.anime,episode=selectAnimeVariant(found?.episode,input.quality);
   if(!episode||!anime)return send(res,404,{error:'Anime episode unavailable'});
   const token=crypto.randomBytes(12).toString('base64url');await redis('SET','filmgo:anime-deeplink:'+token,JSON.stringify({episode_slug_id:slug,telegram_message_id:Number(episode.telegram_message_id),anime_title:anime.title,anime_year:anime.year||null,episode_title:episode.title||'',special_type:episode.special_type||null,season:Number(episode.season)||1,episode:Number(episode.episode??episode.number)||0,quality:episode.quality||'720p',file_size:Number(episode.file_size||0),account_hash:hmac(session.number),unlimited:unlimitedRequests(session.number),base_url:publicBase}),'EX',600);
   return send(res,200,{url:'https://t.me/mzn_filmgobot?start=a_'+token});
  }
  if(req.method==='GET'&&url.pathname==='/api/movies'){
    const query=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
    const catalog=await getPublicCatalog();
    const matches=catalog.movies.filter(m=>!query||String(m.title||'').toLowerCase().includes(query)||String(m.year||'').includes(query))
      .slice(0,query?50:100).map(m=>({id:m.telegram_message_id,title:m.title,year:m.year,quality:m.quality,qualities:Object.keys(m.qualities||{[m.quality]:m}),size:m.file_size,slug_id:m.slug_id}));
    return send(res,200,{movies:matches,indexed_at:catalog.updated_at||null,source:'published'});
   }
   if(req.method==='GET'&&url.pathname==='/api/me'){
   const session=await authenticated(req);
   if(!session)return send(res,401,{error:'Not signed in'});
   const user=await profile(session.number);
    const exempt=unlimitedRequests(session.number);
    const usage=exempt?null:await dailyTokenUsage(redis,hmac(session.number));
   const month=new Date().toISOString().slice(0,7);
   const monthlyUsed=Number(await redis('GET','monthly-requests:'+hmac(session.number)+':'+month)||0);
   return send(res,200,{number:session.number,name:user.name||'',plan_onboarded:user.plan_onboarded!==false,plan:user.plan||'free',limit:exempt?null:DAILY_TOKEN_LIMIT,used:exempt?0:tokenAmount(usage.usedMilli),remaining:exempt?null:tokenAmount(usage.remainingMilli),token_limit:exempt?null:DAILY_TOKEN_LIMIT,tokens_used:exempt?0:tokenAmount(usage.usedMilli),tokens_remaining:exempt?null:tokenAmount(usage.remainingMilli),token_reset_at:exempt?null:usage.resetAt,period:exempt?'unlimited':'UTC day · resets 00:00:00 UTC',unlimited:exempt,monthly_used:monthlyUsed,monthly_period:month});
  }
  if(req.method==='GET'&&url.pathname==='/api/avatar'){
   const session=await authenticated(req);
   if(!session)return send(res,401,{error:'Not signed in'});
   const url=await getWhatsAppProfilePicture(session.number);
   return send(res,200,{url});
  }
  if(req.method==='GET'&&url.pathname==='/api/request-history'){
   const session=await authenticated(req);
   if(!session)return send(res,401,{error:'Not signed in'});
   const requests=await requestHistory(session.number);
   return send(res,200,{requests});
  }
  if(req.method==='GET'&&url.pathname==='/api/version')return send(res,200,{version:'20261028-3',catalog_sync:'single-flight'});
  if(req.method==='GET'&&url.pathname==='/api/catalog-status')return send(res,200,{state:telegramCatalogStatus.state,updated_at:telegramCatalogStatus.updated_at,error:telegramCatalogStatus.error,telegram_configured:telegramReady,anime:{...telegramAnimeStatus,telegram_configured:telegramAnimeReady}});
  if(req.method==='GET'&&url.pathname==='/api/anime'){
   const catalog=await getAnimeCatalog();
   const query=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
   const anime=(catalog.anime||[]).filter(item=>!query||[item.title,item.title_alt,...(item.genre||[])].filter(Boolean).join(' ').toLowerCase().includes(query));
   const summaries=anime.map(item=>({...item,episodes:undefined,episodes_released:Math.max(0,...(item.episodes||[]).map(ep=>Number(ep.episode??ep.number)||0))}));
   return send(res,200,{anime:summaries,indexed_at:catalog.indexed_at||null,source:'telegram'});
  }
  const animeTitleApi=url.pathname.match(/^\/api\/anime\/title\/([-a-zA-Z0-9_]+)$/);
  if(req.method==='GET'&&animeTitleApi){
   const catalog=await getAnimeCatalog(),anime=(catalog.anime||[]).find(item=>item.slug_id===animeTitleApi[1]);
   if(!anime)return send(res,404,{error:'Anime not found'});
   const suggestions=(catalog.anime||[]).filter(item=>item.slug_id!==anime.slug_id).slice(0,8).map(item=>({...item,episodes:undefined,episodes_released:Math.max(0,...(item.episodes||[]).map(ep=>Number(ep.episode??ep.number)||0))}));
   return send(res,200,{anime,suggestions,indexed_at:catalog.indexed_at||null,source:'telegram'});
  }
  const animeEpisodeApi=url.pathname.match(/^\/api\/anime\/episode\/([A-Za-z0-9_-]{8,80})$/);
  if(req.method==='GET'&&animeEpisodeApi){
   const catalog=await getAnimeCatalog(),episodeSlug=animeEpisodeApi[1];
   const found=findAnimeEpisode(catalog,episodeSlug);if(found){const {anime}=found;const episode=selectAnimeVariant(found.episode,url.searchParams.get('quality'));return send(res,200,{anime:{slug_id:anime.slug_id,title:anime.title,poster:anime.poster||null,year:anime.year||null,plot:anime.plot||'',episodes:(anime.episodes||[]).map(item=>({slug_id:item.slug_id,qualities:item.qualities||{},season:item.season,episode:item.episode,number:item.number,title:item.title,released:item.released,special_type:item.special_type}))},suggestions:(catalog.anime||[]).filter(item=>item.slug_id!==anime.slug_id).slice(0,8).map(item=>({slug_id:item.slug_id,title:item.title,poster:item.poster||null,year:item.year||null})),episode});}
   return send(res,404,{error:'Anime episode unavailable'});
  }
  const animeDownload=url.pathname.match(/^\/api\/anime\/download\/([A-Za-z0-9_-]{8,80})$/);
  if((req.method==='GET'||req.method==='HEAD')&&animeDownload){
   const requestedId=animeDownload[1],catalog=await getAnimeCatalog();
   const found=findAnimeEpisode(catalog,requestedId),episode=selectAnimeVariant(found?.episode,url.searchParams.get('quality'));
   const messageId=Number(episode?.telegram_message_id),total=Number(episode?.file_size||0);
   if(!episode||!Number.isSafeInteger(messageId)||!Number.isSafeInteger(total)||total<=0)return send(res,404,{error:'Anime episode unavailable'});
   const session=await authenticatedStream(req);if(!session)return send(res,401,{error:'Please sign in using your phone number.'});
   if(!telegramAnimeReady)return send(res,503,{error:'Anime channel unavailable'});
   if(req.method==='HEAD')return send(res,405,{error:'HEAD is not available'});
   const exempt=unlimitedRequests(session.number),reservation=await reserveDailyTokens(redis,hmac(session.number),tokenCostMilli(total,'download'),{unlimited:exempt});
   if(!reservation.allowed)return send(res,429,{error:'Daily tokens exhausted; reset is 00:00:00 UTC'});
   let delivered=0,settled=false;const settle=async()=>{if(settled)return;settled=true;const actual=delivered?tokenCostMilli(delivered,'download'):0;if(!exempt&&reservation.costMilli>actual)await releaseDailyTokens(redis,reservation,reservation.costMilli-actual).catch(()=>{});};res.once('finish',()=>{void settle()});res.once('close',()=>{void settle()});
   const original=String(episode.file_name||'').trim(),ext=original.toLowerCase().match(/\.(mkv|mp4|webm|mov|avi|m4v)$/)?.[1]||'mp4',safe=(original||'anime-episode.'+ext).replace(/[\r\n"\\/]/g,'_').slice(0,180);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':String(total),'Content-Disposition':'attachment; filename="'+safe.replace(/[^\x20-\x7e]/g,'_')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
   // telegram_stream.py refuses ranges above 32 MB, so fetch the file in sequential parts.
   let current=null,offset=0;res.once('close',()=>{if(current&&!current.killed)current.kill('SIGTERM')});
   const fetchPart=(start,length)=>new Promise(resolve=>{let got=0,done=false;const finish=ok=>{if(done)return;done=true;resolve(ok&&got===length)};const child=spawn('python3',['src/telegram_stream.py',String(messageId),String(start),String(length),String(process.env.TELEGRAM_ANIME_CHANNEL_ID)],{env:process.env,stdio:['ignore','pipe','ignore']});current=child;child.stdout.on('data',chunk=>{if(res.destroyed)return;got+=chunk.length;delivered+=chunk.length;if(!res.write(chunk)){child.stdout.pause();res.once('drain',()=>child.stdout.resume());}});child.on('error',()=>finish(false));child.on('close',code=>finish(code===0));});
   void (async()=>{while(offset<total&&!res.destroyed){const length=Math.min(STREAM_RANGE_SIZE,total-offset);if(!await fetchPart(offset,length)){res.destroy();return;}offset+=length;}if(!res.destroyed)res.end();})();return;
  }
  const animeStream=url.pathname.match(/^\/api\/anime\/stream\/([A-Za-z0-9_-]{8,80})$/);
  if((req.method==='GET'||req.method==='HEAD')&&animeStream){
   const requestedId=animeStream[1],catalog=await getAnimeCatalog();
   const found=findAnimeEpisode(catalog,requestedId),episode=selectAnimeVariant(found?.episode,url.searchParams.get('quality'));
   const messageId=Number(episode?.telegram_message_id);
   const total=Number(episode?.file_size);
   if(!episode||!Number.isSafeInteger(messageId)||!Number.isSafeInteger(total)||total<=0)return send(res,404,{error:'Anime episode unavailable'});
   const session=await authenticatedStream(req);
   if(!session)return send(res,401,{error:'Please sign in using your phone number.'});
   if(!telegramAnimeReady)return send(res,503,{error:'Anime channel unavailable'});
   const range=req.headers.range;let start=0,end=Math.min(total-1,STREAM_RANGE_SIZE-1);
   if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2]))return send(res,416,{error:'Invalid byte range'},{'Content-Range':'bytes */'+total});let requested;if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return send(res,416,{error:'Range unavailable'},{'Content-Range':'bytes */'+total});start=Math.max(0,total-suffix);requested=total-1;}else{start=Number(match[1]);requested=match[2]?Number(match[2]):total-1;}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(requested)||start>=total||requested<start)return send(res,416,{error:'Range unavailable'},{'Content-Range':'bytes */'+total});end=Math.min(requested,total-1,start+STREAM_RANGE_SIZE-1);}
   const length=end-start+1;if(req.method==='HEAD')return send(res,405,{error:'HEAD is not available'});
   const exempt=unlimitedRequests(session.number),reservation=await reserveDailyTokens(redis,hmac(session.number),tokenCostMilli(length,'stream'),{unlimited:exempt});
   if(!reservation.allowed)return send(res,429,{error:'Daily tokens exhausted; reset is 00:00:00 UTC'});
   let delivered=0,settled=false;const settle=async()=>{if(settled)return;settled=true;const actual=delivered?tokenCostMilli(delivered,'stream'):0;if(!exempt&&reservation.costMilli>actual)await releaseDailyTokens(redis,reservation,reservation.costMilli-actual).catch(()=>{});};res.once('finish',()=>{void settle()});res.once('close',()=>{void settle()});
   const original=String(episode.file_name||'').trim(),ext=original.toLowerCase().match(/\.(mkv|mp4|webm|mov|avi|m4v)$/)?.[1]||'mp4',mime=String(episode.mime_type||'').toLowerCase();
   const type=ext==='mkv'?'video/x-matroska':ext==='webm'?'video/webm':['mp4','m4v','mov'].includes(ext)||mime.includes('mp4')?'video/mp4':'application/octet-stream';const safe=(original||'anime-episode.'+ext).replace(/[^a-zA-Z0-9 ._()-]/g,'_').slice(0,180);const headers={'Content-Type':type,'Content-Length':String(length),'Content-Range':'bytes '+start+'-'+end+'/'+total,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Accel-Buffering':'no','Content-Disposition':'inline; filename="'+safe+'"'};
   const child=spawn('python3',['src/telegram_stream.py',String(messageId),String(start),String(length),String(process.env.TELEGRAM_ANIME_CHANNEL_ID)],{env:process.env,stdio:['ignore','pipe','pipe']});let started=false,bytes=0,closed=false;const abort=()=>{if(!child.killed)child.kill('SIGTERM')};res.once('close',abort);child.stdout.on('data',chunk=>{if(closed)return;if(!started){res.writeHead(206,headers);started=true}bytes+=chunk.length;delivered+=chunk.length;if(!res.write(chunk))child.stdout.pause()});res.on('drain',()=>child.stdout.resume());let error='';child.stderr.on('data',chunk=>{error=(error+chunk.toString()).slice(-500)});child.on('error',()=>{closed=true;if(res.destroyed)return;if(!res.headersSent)send(res,502,{error:'Anime media gateway unavailable'});else res.destroy()});child.on('close',code=>{if(closed)return;closed=true;if(!started){if(res.destroyed||res.writableEnded)return;return send(res,502,{error:'Anime episode could not be retrieved'});}if(code!==0||bytes!==length)return res.destroy();res.end()});return;
  }
  if(req.method==='GET'&&url.pathname==='/health'){return send(res,200,{ok:true});}
  if(req.method==='GET'&&url.pathname.startsWith('/api/stream-availability/')){
   const id=url.pathname.slice('/api/stream-availability/'.length);
   const [catalog,session]=await Promise.all([getPublicCatalog(),authenticated(req)]);
   const movie=(catalog.movies||[]).find(m=>m.slug_id===id);
   const variant=movie?selectMovieVariant(movie,url.searchParams.get('quality')):null;
   const ext=String(variant?.file_name||'').toLowerCase();
   const format=ext.endsWith('.mkv')?'mkv':ext.endsWith('.webm')?'webm':ext.endsWith('.mp4')?'mp4':'unknown';
   return send(res,200,{available:telegramReady&&!!variant,signed_in:!!session,format,qualities:movie?Object.keys(movie.qualities||{[movie.quality]:movie}):[]});
  }
  if((req.method==='GET'||req.method==='HEAD')&&url.pathname.startsWith('/api/download/')){
   const slug=url.pathname.slice('/api/download/'.length);
   const catalog=await getPublicCatalog();
   const record=(catalog.movies||[]).find(m=>m.slug_id===slug);
   const movie=selectMovieVariant(record,url.searchParams.get('quality'));
   if(!movie||!Number.isSafeInteger(movie.telegram_message_id)||!Number.isSafeInteger(movie.file_size)||movie.file_size<=0)return send(res,404,{error:'Movie unavailable'});
   const session=await authenticated(req);
   if(!session)return send(res,401,{error:'Please sign in using your phone number.'});
   if(!telegramReady)return send(res,503,{error:'Telegram unavailable'});
   if(streamWorkerState().state!=='ready')return send(res,503,{error:'Download gateway warming up; retry shortly'});
   if(req.method==='HEAD')return send(res,405,{error:'HEAD is not available'});
   const exempt=unlimitedRequests(session.number),cost=tokenCostMilli(movie.file_size,'download');
   const reservation=await reserveDailyTokens(redis,hmac(session.number),cost,{unlimited:exempt});
   if(!reservation.allowed)return send(res,429,{error:'Daily tokens exhausted; reset is 00:00:00 UTC'});
   let delivered=0,settled=false;
   const settle=async()=>{if(settled)return;settled=true;const actual=delivered?tokenCostMilli(delivered,'download'):0;if(!exempt&&reservation.costMilli>actual)await releaseDailyTokens(redis,reservation,reservation.costMilli-actual).catch(()=>{});};
   res.once('finish',()=>{void settle();});res.once('close',()=>{void settle();});
   const original=String(movie.file_name||'').trim();
   const ext=original.toLowerCase().match(/\\.(mkv|mp4|webm|mov|avi|m4v)$/)?.[0]||'.mp4';
   const filename=(original||[movie.title,movie.year,movie.quality].filter(Boolean).join(' ')+ext).replace(/[\\r\\n"\\/]/g,'_').slice(0,180);
   const ascii=filename.replace(/[^\\x20-\\x7e]/g,'_');
   const headers={'Content-Type':'application/octet-stream','Content-Length':String(movie.file_size),'Content-Disposition':'attachment; filename="'+ascii+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
   res.writeHead(200,headers);
   void logFilmGo('downloads','⬇️ Download started · '+record.title+' ('+record.year+') · '+(movie.quality||url.searchParams.get('quality')||'default'));
   await downloadFile(res,{messageId:movie.telegram_message_id,total:movie.file_size,onChunk:n=>{delivered+=n;}});
   await settle();
   return;
  }
  if((req.method==='GET'||req.method==='HEAD')&&url.pathname.startsWith('/api/stream/')){
   const publicId=url.pathname.slice('/api/stream/'.length);
   const tReq=Date.now();
   const catalog=await getPublicCatalog();
   const record=(catalog.movies||[]).find(m=>m.slug_id===publicId);
   const movie=selectMovieVariant(record,url.searchParams.get('quality'));
   if(!movie||!Number.isSafeInteger(movie.telegram_message_id)||!Number.isSafeInteger(movie.file_size)||movie.file_size<=0)return send(res,404,{error:'Video unavailable'});
   if(fastStreaming)fastWarm(movie.telegram_message_id); // prepare Telegram side while auth/token checks run
   const session=await authenticatedStream(req);
   const tAuth=Date.now();
   if(!session)return send(res,401,{error:'Please sign in using your phone number.'});
   if(!telegramReady)return send(res,503,{error:'Telegram not configured'});
   const total=movie.file_size;
   const range=req.headers.range;
   let start=0,end=Math.min(total-1,STREAM_RANGE_SIZE-1);
   if(range){
    const match=/^bytes=(\d+)-(\d*)$/.exec(range);
    if(!match)return send(res,416,{error:'Invalid byte range'},{'Content-Range':'bytes */'+total});
    start=Number(match[1]);
    if(!Number.isSafeInteger(start)||start>=total)return send(res,416,{error:'Range unavailable'},{'Content-Range':'bytes */'+total});
    const requested=match[2]?Number(match[2]):total-1;
    if(!Number.isSafeInteger(requested)||requested<start)return send(res,416,{error:'Invalid byte range'},{'Content-Range':'bytes */'+total});
    end=Math.min(requested,total-1,start+STREAM_RANGE_SIZE-1);
   }
   const length=end-start+1;
   if(req.method==='HEAD')return send(res,405,{error:'HEAD is not available'});
   const exempt=unlimitedRequests(session.number),reservation=await reserveDailyTokens(redis,hmac(session.number),tokenCostMilli(length,'stream'),{unlimited:exempt});
   const tReserve=Date.now();
   if(!reservation.allowed)return send(res,429,{error:'Daily tokens exhausted; reset is 00:00:00 UTC'});
   let delivered=0,settled=false,firstAt=0;
   // One line per range request: where the time before the first byte goes.
   const onChunk=n=>{if(!firstAt){firstAt=Date.now();console.info('FilmGo stream timing',JSON.stringify({id:publicId,start,len:length,auth_ms:tAuth-tReq,reserve_ms:tReserve-tAuth,gateway_ms:firstAt-tReserve,first_byte_ms:firstAt-tReq,path:fastStreaming?'fast':'telethon'}));}delivered+=n;};
   const settle=async()=>{if(settled)return;settled=true;const actual=delivered?tokenCostMilli(delivered,'stream'):0;if(!exempt&&reservation.costMilli>actual)await releaseDailyTokens(redis,reservation,reservation.costMilli-actual).catch(()=>{});};
   res.once('finish',()=>{void settle();});res.once('close',()=>{void settle();});
   const originalName=String(movie.file_name||'').trim();
   const originalExt=/\\.(mp4|mkv|webm|mov|avi|m4v)$/i.exec(originalName)?.[1]?.toLowerCase();
   const mime=String(movie.mime_type||'').toLowerCase();
   const extension=originalExt||(mime.includes('matroska')?'mkv':mime.includes('webm')?'webm':mime.includes('mp4')?'mp4':'mp4');
   const mediaType=extension==='mkv'?'video/x-matroska':extension==='webm'?'video/webm':extension==='mp4'||extension==='m4v'?'video/mp4':extension==='mov'?'video/quicktime':'application/octet-stream';
   const baseName=originalName||[movie.title,movie.year,movie.quality].filter(Boolean).join(' ')+'.'+extension;
   const safeName=baseName.replace(/[^a-zA-Z0-9 ._()-]/g,'_').slice(0,180);
   const asciiName=safeName.replace(/[^\\x20-\\x7e]/g,'_');
   const disposition='inline; filename="'+asciiName+'"; filename*=UTF-8\'\''+encodeURIComponent(safeName);
   const headers={'Content-Type':mediaType,'Content-Length':String(length),'Content-Range':'bytes '+start+'-'+end+'/'+total,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff','Content-Disposition':disposition};
   if(req.method==='HEAD'){res.writeHead(206,headers);return res.end();}
   if(start===0)void logFilmGo('streams','▶️ Stream started · '+record.title+' ('+record.year+') · '+(movie.quality||url.searchParams.get('quality')||'default'));
   // Prefer one persistent Telethon connection; legacy subprocess remains a fallback.
   const rangeProxy=fastStreaming?fastProxyRange:proxyRange;
   if(await rangeProxy(res,headers,{messageId:movie.telegram_message_id,start,length,onChunk},send)){await settle();return;}
   // If the experimental Pyrogram path is unavailable before response
   // headers are sent, reuse FilmGo's persistent Telethon gateway before
   // falling back to the legacy per-range subprocess.
   if(fastStreaming&&await proxyRange(res,headers,{messageId:movie.telegram_message_id,start,length,onChunk},send)){await settle();return;}
   const child=spawn('python3',['src/telegram_stream.py',String(movie.telegram_message_id),String(start),String(length)],{env:process.env,stdio:['ignore','pipe','pipe']});
   let started=false,bytes=0,closed=false;
   const startedAt=Date.now();
   const abort=()=>{if(!child.killed)child.kill('SIGTERM');};
   res.once('close',abort);
   child.stdout.on('data',chunk=>{
    if(closed)return;
    if(!started){res.writeHead(206,headers);started=true;console.info('Telegram stream first byte',movie.slug_id,Date.now()-startedAt,'ms');}
    bytes+=chunk.length;
    delivered+=chunk.length;
    if(!res.write(chunk))child.stdout.pause();
   });
   res.on('drain',()=>child.stdout.resume());
   let errLog='';
   child.stderr.on('data',chunk=>{errLog=(errLog+chunk.toString()).slice(-500);});
   child.on('error',()=>{closed=true;if(!res.headersSent)send(res,502,{error:'Media gateway unavailable'});else res.destroy();});
   child.on('close',code=>{
    if(closed)return;
    closed=true;
    if(!started){console.warn('Telegram stream failed before first byte',movie.slug_id,code,errLog.replace(/TELEGRAM_SESSION=\\S+/g,'TELEGRAM_SESSION=[redacted]'));return send(res,502,{error:'Telegram media could not be retrieved'});}
    if(code!==0||bytes!==length){console.warn('Media range incomplete',movie.slug_id,code,bytes,length);return res.destroy();}
    res.end();
   });
   return;
  }
   if(req.method==='GET'&&url.pathname==='/movies.json'){
    const catalog=await getPublicCatalog();
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=30, stale-while-revalidate=120','ETag':publicCatalogEtag,'X-Content-Type-Options':'nosniff'};
    if(req.headers['if-none-match']===publicCatalogEtag){res.writeHead(304,headers);return res.end();}
    res.writeHead(200,headers);return res.end(JSON.stringify(catalog));
   }
  if(req.method==='GET'&&url.pathname==='/anime-soon.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=300'});return res.end(animeSoonCss);}
  if(req.method==='GET'&&url.pathname==='/home.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=300'});return res.end(homeCss);}
  if(req.method==='GET'&&url.pathname==='/account-chip.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=300'});return res.end(accountChipJs);}
  if(req.method==='GET'&&url.pathname==='/anime.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=300'});return res.end(animeCss);}
  if(req.method==='GET'&&url.pathname==='/anime.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=300'});return res.end(animeJs);}
  if(req.method==='GET'&&url.pathname==='/anime-watch.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=300'});return res.end(animeWatchCss);}
  if(req.method==='GET'&&url.pathname==='/anime-watch.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=300'});return res.end(animeWatchJs);}
  const animeWatchPage=url.pathname.match(/^\/anime\/watch\/([A-Za-z0-9_-]{8,80})\/?$/);
  if(req.method==='GET'&&animeWatchPage){
   const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex','Content-Security-Policy':"default-src 'self'; img-src 'self' https: data:; media-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none'"};
   res.writeHead(200,headers);return res.end(await renderCatalogPage(req,animeWatchHtml));
  }
  if(req.method==='GET'&&(url.pathname==='/anime'||url.pathname==='/anime/'||(url.pathname.startsWith('/anime/title/')&&/^[-a-zA-Z0-9_]+$/.test(url.pathname.slice(13).replace(/\/$/,''))))){
   const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex','Content-Security-Policy':"default-src 'self'; img-src 'self' https: data:; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none'"};
   res.writeHead(200,headers);return res.end(await renderCatalogPage(req,animeHtml));
  }
  if(req.method==='GET'&&url.pathname==='/tailwind.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});return res.end(tailwindCss);}
  if(req.method==='GET'&&url.pathname==='/player.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(playerCss);}
  if(req.method==='GET'&&url.pathname==='/player-ui.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(playerUiJs);}
  if(req.method==='GET'&&url.pathname==='/catalog.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(catalogCss);}
  if(req.method==='GET'&&url.pathname==='/catalog.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(catalogJs);}
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/search'||(url.pathname.startsWith('/title/')&&/^[-a-zA-Z0-9_]+$/.test(url.pathname.slice(7).replace(/\/$/,''))))){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' https: data:; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});return res.end(await renderCatalogPage(req));}
  if(req.method==='GET'&&(url.pathname==='/profile'||url.pathname==='/history'||url.pathname==='/plans')){
   let serverAuthenticated=false;
   try{serverAuthenticated=Boolean(await authenticated(req));}catch{}
   const page=index.toString('utf8').replace('/app.js?v=20261031-2','/app.js?v=20261031-3').replace('<html','<html data-server-authenticated="'+String(serverAuthenticated)+'"');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' https: data:; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});
   return res.end(page);
  }
  if(req.method==='GET'&&url.pathname==='/style.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(stylesheet);}
  if(req.method==='GET'&&url.pathname==='/poster-wall.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(posterWallJs);}
  if(req.method==='GET'&&url.pathname==='/phone-format.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(phoneFormatJs);}
  if(req.method==='GET'&&posterBackgrounds.has(url.pathname)){res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});return res.end(posterBackgrounds.get(url.pathname));}
  if(req.method==='GET'&&animeBanners.has(url.pathname)){res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});return res.end(animeBanners.get(url.pathname));}
  if(req.method==='GET'&&url.pathname==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(appJs);}
  if(req.method==='GET'&&url.pathname==='/countries.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'});return res.end(countries);}
  if(req.method!=='POST'||!['/api/otp/start','/api/otp/verify','/api/otp/whatsapp/start','/api/otp/whatsapp/status','/api/request','/api/anime-request','/api/profile','/api/plans/continue','/api/logout'].includes(url.pathname))return send(res,404,{error:'Not found'});
  if(!configured)return send(res,503,{error:'Service setup incomplete; contact operator'});
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
   const cooldownKey='cool:'+hmac(number);
   const cooldown=await redis('SET',cooldownKey,'1','EX',60,'NX');
   if(cooldown!=='OK'){
    const ttl=Number(await redis('TTL',cooldownKey));
    const retryAfter=ttl>0?ttl:60;
    return send(res,429,{error:`Wait ${retryAfter} seconds before requesting another verification code`,retry_after:retryAfter});
   }
   const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
   const otpKey='otp:'+hmac(number);
   let messageKey=null;
   try{
    await redis('SET',otpKey,hmac(number+':'+code),'EX',OTP_TTL);
    messageKey=await sendOtp(number,code);
    await redis('SET',otpMessageKey(number),JSON.stringify({message_key:messageKey,expires_at:Date.now()+OTP_TTL*1000}),'EX',OTP_TTL+300);
   }catch(error){
    if(messageKey)await deleteWhatsAppOtp(messageKey).catch(()=>{});
    await Promise.allSettled([redis('DEL',otpKey),redis('DEL',cooldownKey),redis('DEL',otpMessageKey(number))]);
    if(error?.code==='WHATSAPP_NOT_AVAILABLE')return send(res,422,{error:'WhatsApp is not available for this number, so FilmGo cannot deliver the OTP.'});
    if(error?.code==='WHATSAPP_CHECK_UNAVAILABLE')return send(res,503,{error:'WhatsApp number verification is temporarily unavailable. Please try again.'});
    return send(res,503,{error:'Could not send the verification code. Please try again.'});
   }
   return send(res,200,{ok:true,message:'OTP sent'});
  }
  if(url.pathname==='/api/otp/verify'){
   const number=phone(data.number),code=data.code;
   if(!number||typeof code!=='string'||!/^\d{6}$/.test(code))return send(res,400,{error:'Invalid verification details'});
   if(!await limit('verify:'+number,5,600))return send(res,429,{error:'Too many attempts'});
   const stored=await redis('GET','otp:'+hmac(number));
   if(!stored||!safeEq(stored,hmac(number+':'+code)))return send(res,401,{error:'Invalid or expired OTP'});
   const messageRecordKey=otpMessageKey(number),messageRecord=await redis('GET',messageRecordKey);
   await redis('DEL','otp:'+hmac(number));
   if(messageRecord)void removeOtpMessage(messageRecordKey,messageRecord);
   const session=await issueSession(number);
   return send(res,200,{ok:true,first_registration:session.first_registration,expires_in:session.expires_in},{'Set-Cookie':session.cookie});
  }
  if(url.pathname==='/api/otp/whatsapp/start'){
   const number=phone(data.number);
   if(!number)return send(res,400,{error:'Invalid phone number'});
   if(!await limit('wa-verify-start:'+number,5,3600))return send(res,429,{error:'WhatsApp verification limit reached'});
   const botNumber=getWhatsAppBotNumber();
   if(!botNumber)return send(res,503,{error:'WhatsApp verification is temporarily unavailable'});
   let available;
   try{available=await isWhatsAppNumber(number);}catch(error){if(error.code==='WHATSAPP_CHECK_UNAVAILABLE')return send(res,503,{error:'WhatsApp number verification is temporarily unavailable'});throw error;}
   if(!available)return send(res,422,{error:'WhatsApp is not available for this number, so FilmGo cannot deliver verification messages.'});
   const requestId=crypto.randomBytes(24).toString('base64url');
   await redis('SET',waVerifyKey(requestId),JSON.stringify({number,status:'pending',created_at:Date.now()}),'EX',WA_VERIFY_TTL);
   const verifyUrl='https://wa.me/+'+botNumber+'?text='+encodeURIComponent(requestId);
   return send(res,200,{ok:true,request_id:requestId,url:verifyUrl,expires_in:WA_VERIFY_TTL});
  }
  if(url.pathname==='/api/otp/whatsapp/status'){
   const number=phone(data.number),requestId=typeof data.request_id==='string'&&/^[A-Za-z0-9_-]{20,80}$/.test(data.request_id)?data.request_id:null;
   if(!number||!requestId)return send(res,400,{error:'Invalid WhatsApp verification request'});
   if(!await limit('wa-verify-status:'+requestId,90,300))return send(res,429,{error:'Verification polling limit reached'});
   const raw=await redis('GET',waVerifyKey(requestId));let record=null;
   try{record=raw?JSON.parse(raw):null;}catch{}
   if(!record||record.number!==number)return send(res,404,{error:'WhatsApp verification expired'});
   if(record.status!=='verified')return send(res,200,{ok:true,verified:false});
   await redis('DEL','otp:'+hmac(number));
   const messageRecordKey=otpMessageKey(number),messageRecord=await redis('GET',messageRecordKey);
   if(messageRecord)void removeOtpMessage(messageRecordKey,messageRecord);
   const session=await issueSession(number);
   return send(res,200,{ok:true,verified:true,first_registration:session.first_registration,expires_in:session.expires_in},{'Set-Cookie':session.cookie});
  }
  const session=await authenticated(req);
  if(!session)return send(res,401,{error:'Please sign in using your phone number.'});
  if(url.pathname==='/api/logout'){
   authStreamCache.delete(hmac(session.nonce));
   await redis('DEL','session:'+hmac(session.nonce));
   return send(res,200,{ok:true},{'Set-Cookie':sessionCookie('',0)});
  }
  if(url.pathname==='/api/plans/continue'){
   const existing=await profile(session.number);
   await redis('SET','profile:'+hmac(session.number),JSON.stringify({...existing,plan:'free',plan_onboarded:true}));
   return send(res,200,{ok:true,plan:'free'});
  }
  if(url.pathname==='/api/profile'){
   if(typeof data.name!=='string'||data.name.trim().length<2||data.name.trim().length>60)return send(res,400,{error:'Name must contain 2–60 characters'});
   const name=data.name.trim().replace(/[\x00-\x1f]/g,'');
   await redis('SET','profile:'+hmac(session.number),JSON.stringify({...await profile(session.number),name,updated_at:new Date().toISOString()}));
   return send(res,200,{ok:true,name});
  }
  return send(res,404,{error:'Not found'});
 }catch(err){console.error('API error',String(err.message));return send(res,500,{error:'Request could not be completed'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log('FilmGo API listening on',PORT));
if(configured){
 linkedWhatsApp.start().catch(()=>console.error('Linked WhatsApp initialization deferred'));
 startOtpMessageCleanup();
 startWhatsApp().catch(e=>console.error('WhatsApp initialization failed',e.message));
 startFilmGoBot(refreshCatalog);
}
