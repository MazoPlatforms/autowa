import makeWASocket,{initAuthCreds,BufferJSON,proto,DisconnectReason,Browsers} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {LINK_TEST_DOCUMENT} from './linked-whatsapp.mjs';
const exec=promisify(execFile);
export const linkedWhatsAppAdapter={
 replacer:BufferJSON.replacer,reviver:BufferJSON.reviver,initCreds:initAuthCreds,
 keyValue:(type,value)=>type==='app-state-sync-key'?proto.Message.AppStateSyncKeyData.fromObject(value):value,
 loggedOut:error=>error?.output?.statusCode===DisconnectReason.loggedOut,
 create:auth=>makeWASocket({auth,logger:pino({level:'silent'}),browser:Browsers.ubuntu('Chrome'),printQRInTerminal:false,markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>false,connectTimeoutMs:30000,defaultQueryTimeoutMs:60000})
};
export function createLinkedMediaDelivery(run=exec){return async function(socket,number,job,update,signal){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'filmgo-delivery-'));
 try{
  const rawName=String(job.file_name||'FilmGo.mp4').replace(/[/\\\x00-\x1f]/g,'_'),extension=job.kind==='test'?'.txt':/\.mkv$/i.test(rawName)?'.mkv':'.mp4';
  const filename=rawName.replace(/\.(?:mkv|mp4|txt)$/i,'').slice(0,170)+extension,file=path.join(directory,filename);
  if(job.kind==='test')await fs.writeFile(file,LINK_TEST_DOCUMENT,{mode:0o600});
  else await run('python3',['src/telegram_media.py',job.kind==='anime'?'download-anime':'download',String(job.message_id),file],{env:process.env,timeout:1800000,maxBuffer:1024*1024,signal});
  const stat=await fs.stat(file);if(stat.size!==job.file_size||signal.aborted)throw Error('Incomplete file');await fs.chmod(file,0o600);
  await update('uploading',50);
  // The recipient is always derived from the authenticated account, never input.
  await socket.sendMessage(number.slice(1)+'@s.whatsapp.net',{document:{url:file},fileName:filename,mimetype:job.kind==='test'?'text/plain':filename.toLowerCase().endsWith('.mkv')?'video/x-matroska':'video/mp4',caption:job.title+' · '+job.quality},{mediaUploadTimeoutMs:900000});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
};}
export const deliverLinkedMedia=createLinkedMediaDelivery();
