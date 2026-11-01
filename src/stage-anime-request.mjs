import fs from 'node:fs';

const payload=JSON.parse(process.env.REQUEST_PAYLOAD_JSON||'null');
if(!payload||typeof payload!=='object')throw Error('Missing request payload');
const {request_id,media_type,title,telegram_message_id,season,episode,quality,recipient_jid,rights_confirmed}=payload;
if(media_type!=='anime')throw Error('Invalid media type');
if(typeof request_id!=='string'||!/^[-a-f0-9]{36}$/.test(request_id))throw Error('Invalid request ID');
if(typeof title!=='string'||title.trim().length<2||title.length>140)throw Error('Invalid anime title');
if(typeof recipient_jid!=='string'||!/^[0-9]{8,15}@s\.whatsapp\.net$/.test(recipient_jid))throw Error('Invalid verified recipient');
if(rights_confirmed!==true)throw Error('Rights confirmation required');
if(!Number.isSafeInteger(telegram_message_id)||telegram_message_id<=0)throw Error('Invalid Telegram message ID');
if(!Number.isSafeInteger(Number(season))||Number(season)<1||!Number.isSafeInteger(Number(episode))||Number(episode)<1)throw Error('Invalid anime episode');
if(typeof quality!=='string'||!/^[\w .+-]{2,40}$/.test(quality))throw Error('Invalid anime quality');
const id='request-'+request_id;
fs.writeFileSync('movies/'+id+'.json',JSON.stringify({id,media_type:'anime',title:title.trim(),telegram_message_id,season:Number(season),episode:Number(episode),quality:quality.trim(),group_ids:[],recipient_jids:[recipient_jid],license_confirmed:true,enabled:true},null,2)+'\n',{mode:0o600});
console.log('Private anime job staged for reviewed request',request_id);
