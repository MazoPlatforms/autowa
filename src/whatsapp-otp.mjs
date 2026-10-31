import crypto from 'node:crypto';
import makeWASocket,{initAuthCreds,BufferJSON,proto,DisconnectReason} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

// libsignal writes recoverable stale-session decrypt noise directly with
// console.error, bypassing Baileys' silent logger. Keep application errors
// visible while suppressing only that known Bad MAC message and its repeated
// companion line.
const nativeConsoleError=console.error.bind(console);
console.error=(...args)=>{
 const first=String(args[0]??'');
 if(first==='Failed to decrypt message with any known session...')return;
 if(first.startsWith('Session error:')&&/Bad MAC/i.test(first))return;
 nativeConsoleError(...args);
};

const base=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const token=process.env.UPSTASH_REDIS_REST_TOKEN;
const key=crypto.createHash('sha256').update(process.env.APP_SECRET||'').digest();
const prefix='autowa:otp-wa:';
async function redis(...args){
 const r=await fetch(base,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('WhatsApp auth store unavailable');
 const j=await r.json();if(j.error)throw Error('WhatsApp auth store error');return j.result;
}
function verificationRedisKey(value){return 'wa-verify:'+crypto.createHmac('sha256',process.env.APP_SECRET||'').update(value).digest('hex');}
function verificationClaimKey(value){return 'wa-verify-claim:'+crypto.createHmac('sha256',process.env.APP_SECRET||'').update(value).digest('hex');}
function verificationText(message){
 const content=message?.message||{};
 const nested=content.ephemeralMessage?.message||content.viewOnceMessage?.message||content.viewOnceMessageV2?.message||content;
 return String(nested.conversation||nested.extendedTextMessage?.text||'').trim();
}
async function handleWhatsAppVerification(message,client){
 if(message?.key?.fromMe)return;
 const remoteJid=String(message?.key?.remoteJid||'');
 if(!/^\d+(?::\d+)?@s\.whatsapp\.net$/.test(remoteJid))return;
 const sender='+'+remoteJid.split('@')[0].split(':')[0];
 const text=verificationText(message);
 if(!/^[A-Za-z0-9_-]{32}$/.test(text))return;
 const recordKey=verificationRedisKey(text),raw=await redis('GET',recordKey);let record;
 try{record=raw?JSON.parse(raw):null;}catch{return;}
 if(!record||record.status!=='pending'||record.number!==sender){console.warn('WhatsApp verification key rejected: expired, already used, or sender mismatch');return;}
 if(await redis('SET',verificationClaimKey(text),'1','NX','EX',30)!=='OK')return;
 await redis('SET',recordKey,JSON.stringify({...record,status:'verified',verified_at:Date.now()}),'EX',300);
 await client.sendMessage(remoteJid,{text:'✅ FilmGo WhatsApp verification successful. Return to the website to continue.'});
}
function encrypt(obj){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const raw=Buffer.from(JSON.stringify(obj,BufferJSON.replacer));
 const data=Buffer.concat([cipher.update(raw),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
}
function decrypt(str){
 const b=Buffer.from(str,'base64'),iv=b.subarray(0,12),tag=b.subarray(12,28);
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString(),BufferJSON.reviver);
}
async function authState(){
 let stored=await redis('GET',prefix+'creds');
 let creds;
 const seed=process.env.WA_OTP_AUTH_CREDS;
 let provided=null;
 if(seed){
  try{provided=JSON.parse(seed,BufferJSON.reviver);}
  catch{throw Error('WA_OTP_AUTH_CREDS is not valid JSON');}
  if(!provided||typeof provided!=='object'||typeof provided.registered!=='boolean')throw Error('WA_OTP_AUTH_CREDS is not a valid Baileys creds object');
 }
 if(stored){
  creds=decrypt(stored);
  // A previous first boot may have persisted an unregistered placeholder.
  // Prefer the operator's registered creds.json in that specific case only.
  if(!creds.registered&&provided?.registered){
   console.log('Replacing unregistered Redis auth seed with registered WA_OTP_AUTH_CREDS');
   creds=provided;
   await redis('SET',prefix+'creds',encrypt(creds));
  }
 }else if(provided){
  creds=provided;
  await redis('SET',prefix+'creds',encrypt(creds));
  console.log('Bootstrapped WhatsApp OTP credentials from Koyeb secret');
 }else creds=initAuthCreds();
 const keys={
  get:async(type,ids)=>{
   const result={};
   await Promise.all(ids.map(async id=>{
    const raw=await redis('GET',prefix+'key:'+type+':'+id);
    if(raw){let value=decrypt(raw);if(type==='app-state-sync-key')value=proto.Message.AppStateSyncKeyData.fromObject(value);result[id]=value;}
   }));
   return result;
  },
  set:async(data)=>{
   for(const [type,entries] of Object.entries(data)){
    for(const [id,value] of Object.entries(entries)){
     const name=prefix+'key:'+type+':'+id;
     if(value)await redis('SET',name,encrypt(value));
     else await redis('DEL',name);
    }
   }
  }
 };
 return {state:{creds,keys},saveCreds:async()=>redis('SET',prefix+'creds',encrypt(creds))};
}
let socket=null,ready=false,connecting=false,tries=0,retryTimer=null;
export const isWhatsAppReady=()=>ready;
export function getWhatsAppBotNumber(){
 const raw=String(socket?.user?.id||'').split('@')[0].split(':')[0];
 return /^\d{8,15}$/.test(raw)?raw:null;
}
export async function startWhatsApp(){
 if(connecting||socket)return;
 connecting=true;
 try{
  const {state,saveCreds}=await authState();
  const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false,connectTimeoutMs:30000});
  socket=sock;
  sock.ev.on('messages.upsert',({messages})=>{for(const message of messages||[])void handleWhatsAppVerification(message,sock).catch(error=>console.warn('WhatsApp verification handler failed:',error.message));});
  sock.ev.on('creds.update',()=>saveCreds().catch(e=>console.error('Credential persistence failed',e.message)));
  sock.ev.on('connection.update',({connection,qr,lastDisconnect})=>{
   if(qr){console.warn('OTP WhatsApp device pairing required. Scan QR from private Koyeb logs.');qrcode.generate(qr,{small:true});}
   if(connection==='open'){if(socket!==sock)return;ready=true;tries=0;console.log('OTP WhatsApp session connected');}
   if(connection==='close'){
    // A stale socket may close after a replacement socket has connected.
    // Never let that old event clear the active socket or schedule a second
    // auth session; concurrent sessions can corrupt Signal message keys.
    if(socket!==sock)return;
    ready=false;socket=null;
    const code=lastDisconnect?.error?.output?.statusCode;
    if(code===DisconnectReason.loggedOut){console.error('OTP WhatsApp logged out. Clear Redis auth keys and pair again; do not reuse stale creds.json.');return;}
    const delay=Math.min(120000,Math.pow(2,Math.min(++tries,6))*1000);
    retryTimer=setTimeout(()=>{retryTimer=null;startWhatsApp().catch(e=>console.error('OTP reconnect failed',e.message));},delay);
   }
  });
 }catch(e){console.error('OTP WhatsApp startup failed',e.message);socket=null;const delay=Math.min(120000,Math.pow(2,Math.min(++tries,6))*1000);retryTimer=setTimeout(()=>{retryTimer=null;startWhatsApp().catch(err=>console.error('OTP retry failed',err.message));},delay);}
 finally{connecting=false;}
}
export async function sendWhatsAppOtp(number,code){
 // Try the active Baileys socket directly. The open flag can lag during
 // transient connection updates and must not reject a send pre-emptively.
 if(!socket)throw Error('OTP WhatsApp socket is unavailable');
 const jid=number.slice(1)+'@s.whatsapp.net';
 const result=await socket.sendMessage(jid,{text:'Your FilmGo verification code is: '+code+'\nExpires in 5 minutes. Never share this code.'});
 if(!result?.key?.id)throw Error('WhatsApp did not acknowledge OTP submission');
 return result.key;
}

export async function deleteWhatsAppOtp(messageKey){
 if(!socket||!messageKey?.id||!messageKey?.remoteJid)return false;
 try{
  await socket.sendMessage(messageKey.remoteJid,{delete:messageKey});
  return true;
 }catch(error){
  console.warn('OTP WhatsApp message cleanup deferred:',error?.message||'unknown');
  return false;
 }
}

export async function getWhatsAppProfilePicture(number){
 if(!ready||!socket)return null;
 if(typeof number!=='string'||!/^\+[1-9]\d{7,14}$/.test(number))return null;
 try{
  const url=await socket.profilePictureUrl(number.slice(1)+'@s.whatsapp.net','image');
  if(typeof url!=='string')return null;
  const parsed=new URL(url);
  if(parsed.protocol!=='https:')return null;
  return url;
 }catch(err){
  // A missing picture, privacy settings, or disconnected socket is not an auth failure.
  console.warn('WhatsApp profile picture unavailable:',err?.message||'unknown');
  return null;
 }
}
