import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
const dir=process.env.WA_AUTH_DIR||'auth';
if(!fs.existsSync(path.join(dir,'creds.json'))) throw Error('Local auth directory missing creds.json. Set WA_AUTH_DIR to an existing paired Baileys auth directory.');
const {state,saveCreds}=await useMultiFileAuthState(dir);
const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false});
sock.ev.on('creds.update',saveCreds);
try{
 await new Promise((resolve,reject)=>{
  const t=setTimeout(()=>reject(Error('WhatsApp connection timed out')),90000);
  sock.ev.on('connection.update',u=>{
   if(u.connection==='open'){clearTimeout(t);resolve();}
   if(u.connection==='close'){clearTimeout(t);reject(Error('Connection closed; session may need re-pairing'));}
  });
 });
 const groups=Object.values(await sock.groupFetchAllParticipating());
 console.log('Joined groups (keep JIDs private):');
 for(const g of groups.sort((a,b)=>(a.subject||'').localeCompare(b.subject||'')))console.log((g.subject||'(unnamed)')+'  —  '+g.id);
 console.log('Total:',groups.length);
}finally{sock.end();}
