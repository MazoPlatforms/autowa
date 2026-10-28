import crypto from 'node:crypto';
import makeWASocket,{initAuthCreds,BufferJSON,proto,DisconnectReason} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

const base=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const token=process.env.UPSTASH_REDIS_REST_TOKEN;
const key=crypto.createHash('sha256').update(process.env.APP_SECRET||'').digest();
const prefix='autowa:otp-wa:';
async function redis(...args){
 const r=await fetch(base,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('WhatsApp auth store unavailable');
 const j=await r.json();if(j.error)throw Error('WhatsApp auth store error');return j.result;
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
 if(stored)creds=decrypt(stored);
 else if(process.env.WA_OTP_AUTH_CREDS){
  try{creds=JSON.parse(process.env.WA_OTP_AUTH_CREDS,BufferJSON.reviver);}
  catch{throw Error('WA_OTP_AUTH_CREDS is not valid JSON');}
  // A standalone registered creds.json cannot restore Signal sessions without matching keys.
  // Start a fresh QR pairing instead of accepting an unusable partial session.
  if(creds.registered===true){
   console.warn('WA_OTP_AUTH_CREDS contains registered creds without Signal keys; fresh QR pairing required. Existing seed ignored.');
   creds=initAuthCreds();
  }
  await redis('SET',prefix+'creds',encrypt(creds));
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
export async function startWhatsApp(){
 if(connecting||socket)return;
 connecting=true;
 try{
  const {state,saveCreds}=await authState();
  const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false,connectTimeoutMs:30000});
  socket=sock;
  sock.ev.on('creds.update',()=>saveCreds().catch(e=>console.error('Credential persistence failed',e.message)));
  sock.ev.on('connection.update',({connection,qr,lastDisconnect})=>{
   if(qr){console.warn('OTP WhatsApp device pairing required. Scan QR from private Koyeb logs.');qrcode.generate(qr,{small:true});}
   if(connection==='open'){ready=true;tries=0;console.log('OTP WhatsApp session connected');}
   if(connection==='close'){
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
 if(!ready||!socket)throw Error('OTP WhatsApp is offline');
 const jid=number.slice(1)+'@s.whatsapp.net';
 const result=await socket.sendMessage(jid,{text:'Your AutoWA verification code is: '+code+'\nExpires in 5 minutes. Never share this code.'});
 if(!result?.key?.id)throw Error('WhatsApp did not acknowledge OTP submission');
}
