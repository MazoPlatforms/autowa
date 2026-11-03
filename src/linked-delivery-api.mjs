export async function linkedDeliveryApi(req,res,url,{authenticated,send,body,limit,manager,resolveMedia,reserve,refund}){
 const isLink=url.pathname.startsWith('/api/whatsapp/');
 const isDelivery=['/api/request','/api/anime-request'].includes(url.pathname);
 if(!isLink&&!isDelivery)return false;
 if(!['/api/whatsapp/status','/api/whatsapp/link','/api/whatsapp/disconnect','/api/request','/api/anime-request'].includes(url.pathname)){send(res,404,{error:'Not found'});return true;}
 const session=await authenticated(req);
 if(!session){send(res,401,{error:'Please sign in using your phone number.'});return true;}
 if(url.pathname==='/api/whatsapp/status'&&req.method==='GET'){send(res,200,await manager.status(session.number));return true;}
 if(req.method!=='POST'){send(res,405,{error:'Method not allowed'});return true;}
 try{const origin=new URL(req.headers.origin||'');if(origin.protocol!=='https:'||origin.host!==req.headers.host)throw Error();}catch{send(res,403,{error:'Origin rejected'});return true;}
 if(req.headers['content-type']?.split(';')[0]!=='application/json'){send(res,415,{error:'JSON required'});return true;}
 const data=await body(req);
 if(url.pathname==='/api/whatsapp/disconnect'){send(res,200,await manager.disconnect(session.number));return true;}
 if(url.pathname==='/api/whatsapp/link'){
  if(data.consent!==true){send(res,400,{error:'Confirm linked-device access before linking.'});return true;}
  if(data.method!==undefined&&!['code','qr'].includes(data.method)){send(res,400,{error:'Choose QR or pairing code.'});return true;}
  if(!await limit('linked-wa-pair:'+session.number,5,3600)){send(res,429,{error:'Pairing limit reached. Try again later.'});return true;}
  try{send(res,202,await manager.pair(session.number,data.method||'code',data.channel_consent===true));}catch{send(res,503,{error:'Could not start WhatsApp pairing. Try again shortly.'});}return true;
 }
 if(data.rights_confirmed!==true){send(res,400,{error:'Confirm you can receive this media.'});return true;}
 if(!await limit('linked-wa-delivery:'+session.number,20,3600)){send(res,429,{error:'Request limit reached.'});return true;}
 const state=await manager.status(session.number);
 if(state.state!=='connected'){send(res,428,{error:'Link WhatsApp in your profile before requesting a file.',code:'whatsapp_link_required',url:'/profile#linked-whatsapp'});return true;}
 const media=await resolveMedia(url.pathname==='/api/anime-request'?'anime':'movie',data);
 if(!media){send(res,404,{error:'Media unavailable. Refresh and select another quality.'});return true;}
 const reservation=await reserve(session.number,media.file_size);
 if(!reservation.allowed){send(res,429,{error:'Daily tokens exhausted. Reset is 00:00 UTC.'});return true;}
 try{const job=await manager.enqueue(session.number,{...media,reservation});send(res,202,{ok:true,request_id:job.id,status:job.status,message:'Queued for delivery to your WhatsApp Message yourself chat.'});}
 catch{await refund(reservation);send(res,409,{error:'Could not queue delivery. Check your WhatsApp connection or wait for queued requests.'});}
 return true;
}
