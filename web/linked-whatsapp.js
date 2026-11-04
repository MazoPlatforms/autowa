(() => {
 const account=document.getElementById('account');if(!account)return;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 const panel=node('section','profile-panel linked-whatsapp');panel.id='linked-whatsapp';
 const header=node('div','panel-heading');header.append(node('h3','','WhatsApp delivery'),node('span','linked-wa-badge','LINKED DEVICE'));
 const status=node('p','linked-wa-status','Checking connection…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const copy=node('div','linked-wa-copy');copy.append(node('p','small','Receive files in Message yourself using your own WhatsApp account.'));
 const details=node('details','linked-wa-details');details.append(node('summary','','Connection details'),node('p','small','This creates a linked device with access to your WhatsApp account. Credentials are encrypted. Your account sends a connection notification to +94 77 122 7821 and follows the channel below. FilmGo checks membership on reconnect and follows again if needed. Disconnect FilmGo to stop this automation.'));
 const channel=node('a','linked-wa-channel','View WhatsApp channel ↗');channel.href='https://whatsapp.com/channel/0029VbEKmhg6buMOZpncsK1G';channel.target='_blank';channel.rel='noopener noreferrer';details.append(channel);copy.append(details);
 const label=node('label','linked-wa-consent');const consent=document.createElement('input');consent.type='checkbox';label.append(consent,document.createTextNode('I agree to link my WhatsApp, send the connection notification, and follow this channel, including re-following on reconnect.'));
 const link=node('button','secondary-button linked-wa-link','Link WhatsApp');link.type='button';link.disabled=true;
 const code=node('output','linked-wa-code');code.hidden=true;code.setAttribute('aria-label','WhatsApp pairing code');
 const instructions=node('p','small','Open WhatsApp → Linked devices → Link a device → Link with phone number instead. Enter this code there.');instructions.hidden=true;
 const disconnect=node('button','secondary-button linked-wa-disconnect','Disconnect WhatsApp');disconnect.type='button';disconnect.hidden=true;
 let method='code';
 const methods=node('div','linked-wa-methods');methods.setAttribute('role','group');methods.setAttribute('aria-label','Link using');
 for(const [value,text] of [['code','Pairing code'],['qr','QR code']]){const button=node('button','linked-wa-method',text);button.type='button';button.dataset.method=value;button.setAttribute('aria-pressed',String(value===method));button.addEventListener('click',()=>{method=value;for(const item of methods.children)item.setAttribute('aria-pressed',String(item===button));});methods.append(button);}
 const qr=node('img','linked-wa-qr');qr.hidden=true;qr.alt='Scan with WhatsApp Linked devices';qr.width=280;qr.height=280;
 const jobs=node('div','recent-activity');jobs.setAttribute('aria-live','polite');
 panel.append(header,status,copy,methods,label,link,code,qr,instructions,disconnect,jobs);document.getElementById('logout').before(panel);
 let timer,busy=false,visible=false,version=0;
 const active=()=>!account.classList.contains('hidden')&&!document.hidden;
 const call=async(path,body)=>{const response=await fetch('/api/whatsapp/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'WhatsApp connection unavailable.');return data;};
 function paint(data){
  const connected=data.state==='connected',pending=['pairing','connecting','reconnecting'].includes(data.state);
  panel.dataset.state=data.state||'unavailable';header.lastElementChild.textContent=connected?'CONNECTED':pending?'CONNECTING':'LINKED DEVICE';
  status.textContent=({connected:'Bot connected · files go to Message yourself',pairing:data.method==='qr'?'Scan the QR with WhatsApp':'Enter the pairing code in WhatsApp',connecting:'Preparing connection…',reconnecting:'Reconnecting…',disconnected:'WhatsApp is not linked'})[data.state]||'Connection unavailable';
  if(connected&&data.channel_follow==='failed')status.textContent+=' · Channel follow unavailable; reconnect to retry.';
  label.hidden=methods.hidden=connected||pending;link.hidden=connected||pending;copy.hidden=connected;
  disconnect.hidden=!connected&&!pending;link.disabled=!consent.checked||busy;

  code.hidden=instructions.hidden=!data.pairing_code||Number(data.expires_at)<=Date.now();code.textContent=code.hidden?'':String(data.pairing_code);
  qr.hidden=true;qr.removeAttribute('src');
  if(data.state==='pairing'&&data.method==='qr'&&Number(data.expires_at)>Date.now()&&/^data:image\/png;base64,/.test(data.qr_image||'')){qr.src=data.qr_image;qr.hidden=false;instructions.hidden=false;instructions.textContent='On your phone: WhatsApp → Linked devices → Link a device. Scan this QR from another screen.';}
  else instructions.textContent='Open WhatsApp → Linked devices → Link a device → Link with phone number instead. Enter FILMGOWA there.';
  jobs.replaceChildren();for(const job of (data.jobs||[]).slice(0,3)){const row=node('article','activity-request');row.append(node('strong','',job.title),node('span','activity-request-status',job.status==='submitted'?'Sent':job.status==='uploading'?'Uploading 50%':job.status==='downloading'?'Downloading':job.status==='failed'?'Failed':'Queued'));if(job.error)row.title=job.error;jobs.append(row);}
 }
 async function poll(){clearTimeout(timer);if(!active())return;const current=version;try{const data=await call('status');if(current!==version||!active())return;paint(data);timer=setTimeout(poll,data.state==='connected'?5000:1000);}catch(error){if(current!==version)return;status.textContent=error.message;link.hidden=methods.hidden=label.hidden=false;link.disabled=!consent.checked;timer=setTimeout(poll,3000);}}
 consent.addEventListener('change',()=>{link.disabled=!consent.checked||busy;});
 link.addEventListener('click',async()=>{if(!consent.checked||busy)return;busy=true;link.disabled=true;for(const button of methods.children)button.disabled=true;status.textContent=method==='qr'?'Preparing QR code…':'Preparing pairing code…';try{paint(await call('link',{consent:true,channel_consent:true,method}));}catch(error){status.textContent=error.message;}finally{busy=false;for(const button of methods.children)button.disabled=false;link.disabled=!consent.checked;clearTimeout(timer);timer=setTimeout(poll,1500);}});
 disconnect.addEventListener('click',async()=>{if(busy)return;busy=true;disconnect.disabled=true;try{const result=await call('disconnect',{});paint({state:'disconnected',jobs:[]});if(!result.device_revoked)status.textContent='Credentials removed. Also remove FilmGo in WhatsApp → Linked devices.';consent.checked=false;link.disabled=true;}catch(error){status.textContent=error.message;}finally{busy=false;disconnect.disabled=false;}});
 function visibility(){const next=active();if(next===visible)return;visible=next;version++;clearTimeout(timer);if(next)void poll();else{qr.hidden=true;qr.removeAttribute('src');code.textContent='';code.hidden=true;consent.checked=false;link.disabled=true;jobs.replaceChildren();}}
 new MutationObserver(visibility).observe(account,{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',visibility);visibility();
})();
