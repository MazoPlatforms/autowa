import fs from 'node:fs';
import makeWASocket,{useMultiFileAuthState} from '@whiskeysockets/baileys';
import pino from 'pino';
const raw=process.env.WA_AUTH_CREDS;
if(!raw)throw Error('WA_AUTH_CREDS is missing');
const creds=JSON.parse(raw);
fs.mkdirSync('.auth',{recursive:true,mode:0o700});
fs.writeFileSync('.auth/creds.json',JSON.stringify(creds),{mode:0o600});
try{
 const {state,saveCreds}=await useMultiFileAuthState('.auth');
 const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false});
 sock.ev.on('creds.update',saveCreds);
 try{
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Connection timed out')),90000);
   sock.ev.on('connection.update',u=>{
    if(u.connection==='open'){clearTimeout(timeout);resolve();}
    if(u.connection==='close'){clearTimeout(timeout);reject(Error('WhatsApp session unavailable'));}
   });
  });
  const joined=Object.values(await sock.groupFetchAllParticipating());
  const hidden=new Set(['120363024245545077@g.us','120363328126166173@g.us']);
  const botNumber=String(sock.user?.id||'').split('@')[0].split(':')[0];
  if(!botNumber)throw Error('Cannot identify WhatsApp bot account');
  const groups=joined.filter(g=>{
    if(hidden.has(g.id))return false;
    const bot=g.participants?.find(p=>String(p.id||'').split('@')[0].split(':')[0]===botNumber);
    return bot && (bot.admin==='admin'||bot.admin==='superadmin');
  }).map(g=>({name:g.subject||'Unnamed group',jid:g.id,is_bot_admin:true})).sort((a,b)=>a.name.localeCompare(b.name));
  fs.mkdirSync('site',{recursive:true});
  fs.writeFileSync('site/groups.json',JSON.stringify({groups,updated_at:new Date().toISOString()},null,2));
  console.log('Published',groups.length,'bot-admin groups (excluded hidden destinations)');
 }finally{sock.end();}
}finally{fs.rmSync('.auth',{recursive:true,force:true});}
