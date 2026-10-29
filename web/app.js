const $=id=>document.getElementById(id);let number='',token='',signedIn=false,authVersion=0;const loginHintKey='tfw_login_hint_v1';const storedLogin=()=>{try{return localStorage.getItem(loginHintKey)==='1';}catch{return false;}};const saveLoginHint=value=>{try{if(value)localStorage.setItem(loginHintKey,'1');else localStorage.removeItem(loginHintKey);}catch{}};const msg=t=>{$('message').textContent=t;};async function api(route,payload){const r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}function phoneNumber(){let raw=$('phone').value.replace(/[^0-9+]/g,'');if(raw.startsWith('+'))return raw;if(raw.startsWith('00'))return '+'+raw.slice(2);raw=raw.replace(/^0+/,'');const dial=$('country').value;return '+'+(raw.startsWith(dial)?raw:dial+raw);}fetch('/countries.json').then(r=>r.json()).then(d=>{const sel=$('country');sel.replaceChildren();for(const c of d.countries){const o=document.createElement('option');o.value=c.dial;o.textContent=c.name+' (+'+c.dial+')';if(c.iso==='LK')o.selected=true;sel.append(o);}}).catch(()=>msg('Country list unavailable; Sri Lanka is the default.'));
$('start').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{number=phoneNumber();const version=authVersion;await api('otp/start',{number});if(version!==authVersion)return;$('start').classList.add('hidden');$('verify').classList.remove('hidden');msg('Verification code sent to '+number);}catch(err){msg(err.message)}finally{btn.disabled=false;}});
$('verify').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{const d=await api('otp/verify',{number,code:$('code').value});authVersion++;await showAccount();saveLoginHint(true);msg('Signed in successfully.');}catch(err){msg(err.message)}finally{btn.disabled=false;}});
const avatarCacheKey=n=>'filmgo-avatar:'+n;
function paintAvatar(url){
 for(const id of ['profile-avatar','profile-monogram']){
  const root=$(id);if(!root)continue;
  root.querySelector('.wa-avatar-image')?.remove();
  if(!url)continue;
  const img=document.createElement('img');img.className='wa-avatar-image';img.alt='WhatsApp profile picture';img.referrerPolicy='no-referrer';
  img.onerror=()=>{img.remove();};
  img.src=url;root.append(img);
 }
}
async function refreshAvatar(number){
 let cached=null;
 try{cached=sessionStorage.getItem(avatarCacheKey(number));}catch{}
 if(cached){paintAvatar(cached);return;}
 try{
  const response=await fetch('/api/avatar',{cache:'no-store'});
  if(!response.ok)return;
  const data=await response.json();
  if(typeof data.url==='string'&&data.url.startsWith('https://')){
   try{sessionStorage.setItem(avatarCacheKey(number),data.url);}catch{}
   paintAvatar(data.url);
  }
 }catch{/* Letter avatar is the privacy-safe fallback. */}
}
async function refreshAccount(){
 const response=await fetch('/api/me',{cache:'no-store'});
 if(!response.ok)throw Error('Session expired');
 const user=await response.json();
 applyPricingCountry(user.number);
 $('account-number').textContent='WhatsApp: '+user.number;
 $('profile-name').value=user.name||'';
 $('profile-display-name').textContent=user.name||'FilmGo member';
 $('usage-stats').replaceChildren();
 for(const [label,value] of [['Used today',user.unlimited?'—':user.used],['Remaining',user.unlimited?'∞':user.remaining],['Daily limit',user.unlimited?'∞':user.limit]]){const tile=document.createElement('div');tile.className='usage-tile';const n=document.createElement('strong');n.textContent=String(value);const t=document.createElement('span');t.textContent=label;tile.append(n,t);$('usage-stats').append(tile);}
 $('avatar-initials').textContent=(user.name||user.number||'?').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
 $('profile-monogram').textContent=$('avatar-initials').textContent;
 void refreshAvatar(user.number);
 $('account-limits').textContent=user.unlimited?'Requests: Unlimited · No daily quota':'Requests: '+user.used+' / '+user.limit+' used · '+user.remaining+' remaining ('+user.period+')';
 return user;
}
function routeView(){
 $('plans').classList.toggle('hidden',!signedIn||location.pathname!=='/plans');
 $('start').classList.toggle('hidden',signedIn);
 $('verify').classList.add('hidden');
 $('account').classList.toggle('hidden',!signedIn||location.pathname!=='/profile');
 $('history').classList.toggle('hidden',!signedIn||location.pathname!=='/history');
 $('profile-avatar').classList.toggle('hidden',!signedIn||location.pathname==='/profile');
 $('profile-back').classList.toggle('hidden',!signedIn||!['/profile','/history','/plans'].includes(location.pathname));
 $('auth-intro').classList.toggle('hidden',signedIn);
}
let pricingCountry='OTHER';
const planPrices={
 LK:{currency:'LKR',plus:890,premium:1790,label:'Sri Lanka'},
 IN:{currency:'INR',plus:249,premium:499,label:'India'},
 OTHER:{currency:'USD',plus:2.99,premium:5.99,label:'Other countries'}
};
function regionForNumber(value){
 const digits=String(value||'').replace(/[^0-9+]/g,'');
 if(/^\\+94\\d{9}$/.test(digits))return 'LK';
 if(/^\\+91\\d{10}$/.test(digits))return 'IN';
 return 'OTHER';
}
function applyPricingCountry(value){
 pricingCountry=regionForNumber(value);
 updatePlanPrices();
}
function planQuote(tier){
 const region=planPrices[pricingCountry];
 return {region,price:region[tier],formatted:new Intl.NumberFormat('en',{style:'currency',currency:region.currency,maximumFractionDigits:region.currency==='USD'?2:0}).format(region[tier])};
}
function updatePlanPrices(){
 $('price-free').textContent='Free';
 for(const tier of ['plus','premium'])$('price-'+tier).textContent=planQuote(tier).formatted+' / month';
}
updatePlanPrices();
$('continue-free').addEventListener('click',async()=>{
 const button=$('continue-free');button.disabled=true;
 try{await api('plans/continue',{});navigate('/profile');msg('You are continuing with the Free plan.');}
 catch(err){msg(err.message);}
 finally{button.disabled=false;}
});
for(const tier of ['plus','premium'])$('upgrade-'+tier).addEventListener('click',()=>{
 const quote=planQuote(tier);
 const message=['Hello FilmGo!','I would like to enquire about upgrading my account.','Plan: '+(tier==='plus'?'Plus':'Premium'),'Displayed price: '+quote.formatted+' per month','Please confirm availability, benefits and payment instructions.'].join('\n');
 window.open('https://wa.me/94779290433?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
});

let historyLoading=false,historyPage=1;const HISTORY_PAGE_SIZE=10;
async function loadHistory(){
 if(historyLoading)return;
 historyLoading=true;
 const root=$('history-list');
 if(!root.childElementCount){root.innerHTML='<div class="history-skeleton"><div class="history-shimmer"></div><div class="history-shimmer"></div><div class="history-shimmer"></div></div>';}
 try{
  const response=await fetch('/api/request-history',{cache:'no-store'});
  if(!response.ok)throw Error(response.status===401?'Please sign in again.':'Could not load request history.');
  const data=await response.json();root.replaceChildren();
  if(!Array.isArray(data.requests)||!data.requests.length){
   const empty=document.createElement('div');empty.className='history-empty';
   const title=document.createElement('strong');title.textContent='No requests yet';
   const description=document.createElement('p');description.textContent='Movies you request will appear here after they are queued.';
   empty.append(title,description);root.append(empty);return;
  }
  const pages=Math.max(1,Math.ceil(data.requests.length/HISTORY_PAGE_SIZE));historyPage=Math.min(historyPage,pages);
  const nav=$('history-pagination');nav.replaceChildren();
  for(let p=1;p<=pages;p++){const button=document.createElement('button');button.type='button';button.className='history-page-button'+(p===historyPage?' active':'');button.textContent=String(p);button.setAttribute('aria-label','Page '+p);button.disabled=p===historyPage;button.addEventListener('click',()=>{historyPage=p;void loadHistory();});nav.append(button);}
  for(const item of data.requests.slice((historyPage-1)*HISTORY_PAGE_SIZE,historyPage*HISTORY_PAGE_SIZE)){
   const card=document.createElement('article');card.className='history-card';
   const top=document.createElement('div');top.className='history-card-top';
   const title=document.createElement('strong');title.textContent=item.title||'Movie request';
   const badge=document.createElement('span');badge.className='history-status history-status-'+(item.status==='submitted'?'submitted':item.status==='failed'?'failed':item.status==='processing'||item.status==='downloading'?'processing':'pending');badge.textContent=item.status==='submitted'?'Submitted':item.status==='failed'?'Failed':item.status==='processing'?'Processing':item.status==='downloading'?'Downloading':item.status==='pending_review'?'Queued':String(item.status||'Queued').replaceAll('_',' ');
   top.append(title,badge);
   const meta=document.createElement('p');meta.className='small history-meta';meta.textContent=[item.year,item.quality,item.created_at?new Date(item.created_at).toLocaleString():null].filter(Boolean).join(' · ');
   const id=document.createElement('p');id.className='history-id';id.textContent='Request ID: '+item.id;
   card.append(top,meta,id);if(item.finished_at){const done=document.createElement('p');done.className='small';done.textContent='Last updated: '+new Date(item.finished_at).toLocaleString();card.append(done);}root.append(card);
  }
 }catch(err){root.replaceChildren();const error=document.createElement('p');error.className='small';error.textContent=err.message;root.append(error);}finally{historyLoading=false;}
}
async function showAccount(){
 const account=await refreshAccount();
 signedIn=true;
 if(!account.plan_onboarded&&location.pathname!=='/plans')history.replaceState({},'','/plans');
 routeView();

 if(location.pathname==='/history')await loadHistory();
}
function navigate(path){history.pushState({},'',path);routeView();if(path==='/profile'&&signedIn)refreshAccount().catch(e=>msg(e.message));if(path==='/history'&&signedIn)void loadHistory();}
$('profile-avatar').addEventListener('click',()=>navigate('/profile'));
$('profile-back').addEventListener('click',()=>navigate(location.pathname==='/history'||location.pathname==='/plans'?'/profile':'/'));
$('open-plans').addEventListener('click',()=>navigate('/plans'));

$('open-history').addEventListener('click',()=>navigate('/history'));
$('edit-display-name').addEventListener('click',()=>{$('profile-name-editor').classList.toggle('hidden');if(!$('profile-name-editor').classList.contains('hidden'))$('profile-name').focus();});
window.addEventListener('popstate',()=>{routeView();if(location.pathname==='/history'&&signedIn)void loadHistory();});
$('save-profile').addEventListener('click',async()=>{
 const btn=$('save-profile');btn.disabled=true;
 try{await api('profile',{name:$('profile-name').value});await refreshAccount();$('profile-name-editor').classList.add('hidden');msg('Profile saved.');}
 catch(e){msg(e.message);}finally{btn.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
 try{await api('logout',{});authVersion++;signedIn=false;saveLoginHint(false);paintAvatar(null);try{for(const key of Object.keys(sessionStorage)){if(key.startsWith('filmgo-avatar:'))sessionStorage.removeItem(key);}}catch{}navigate('/profile');msg('Signed out.');}
 catch(e){msg(e.message);}
});
setInterval(()=>{if(signedIn&&location.pathname==='/history'&&!document.hidden)void loadHistory();},12000);
const initialAuthVersion=authVersion;
if(storedLogin()){
 signedIn=true;
 routeView();
 document.documentElement.classList.add('auth-ready');
}
showAccount().then(()=>{
 if(initialAuthVersion!==authVersion)return;
 saveLoginHint(true);
}).catch(()=>{
 if(initialAuthVersion!==authVersion)return;
 signedIn=false;
 saveLoginHint(false);
 routeView();
 msg('Please sign in to continue.');
}).finally(()=>document.documentElement.classList.add('auth-ready'));
