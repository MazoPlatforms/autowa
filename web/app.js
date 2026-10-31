const whatsappSheet=document.createElement('div');whatsappSheet.id='whatsapp-sheet';whatsappSheet.className='auth-sheet hidden';whatsappSheet.setAttribute('role','dialog');whatsappSheet.setAttribute('aria-modal','true');whatsappSheet.setAttribute('aria-labelledby','whatsapp-sheet-title');whatsappSheet.innerHTML='<div class="auth-sheet-backdrop" data-close-whatsapp-sheet></div><section class="auth-sheet-panel"><button id="close-whatsapp-sheet" class="auth-sheet-close" type="button" aria-label="Close">×</button><p class="sheet-kicker">CHOOSE A METHOD</p><h2 id="whatsapp-sheet-title">Verify your number</h2><p id="whatsapp-sheet-copy">Choose a secure way to verify your phone number.</p><button id="verify-via-whatsapp" class="primary-button" type="button">Verify via WhatsApp</button><button id="send-otp-fallback" class="auth-reset-button" type="button">Can’t access WhatsApp? Send OTP</button><a id="whatsapp-verify-link" class="hidden" href="#" target="_blank" rel="noopener">Open WhatsApp manually</a><p id="whatsapp-sheet-status" class="small" role="status" aria-live="polite"></p></section>';document.body.append(whatsappSheet);
const fontStylesheet=document.createElement('link');fontStylesheet.rel='stylesheet';fontStylesheet.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';document.head.append(fontStylesheet);
const $=id=>document.getElementById(id);let number='',token='',signedIn=false,authVersion=0,otpRequestPending=false,otpRequestStartedFor='',otpCooldownInterval=null;const loginHintKey='tfw_login_hint_v1',OTP_COOLDOWN_SECONDS=60;const saveLoginHint=value=>{try{if(value)localStorage.setItem(loginHintKey,'1');else localStorage.removeItem(loginHintKey);}catch{}};const msg=t=>{$('message').textContent=t;};async function api(route,payload){const r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok){const error=Error(d.error||'Request failed');error.retryAfter=Number(d.retry_after)||0;throw error;}return d;}function phoneNumber(){let raw=$('phone').value.replace(/[^0-9+]/g,'');if(raw.startsWith('+'))return raw;if(raw.startsWith('00'))return '+'+raw.slice(2);raw=raw.replace(/^0+/,'');const dial=$('country').value;return '+'+(raw.startsWith(dial)?raw:dial+raw);}
const otpCooldownKey=value=>'filmgo-otp-cooldown:'+value;
function cooldownPhone(){return !$('start').classList.contains('hidden')&&$('phone').value.trim()?phoneNumber():number;}
function cooldownRemaining(value=cooldownPhone()){if(!value)return 0;try{return Math.max(0,Math.ceil((Number(sessionStorage.getItem(otpCooldownKey(value))||0)-Date.now())/1000));}catch{return 0;}}
function hasRequestedCode(value=cooldownPhone()){if(!value)return false;if(otpRequestStartedFor===value)return true;try{return sessionStorage.getItem(otpCooldownKey(value))!==null;}catch{return false;}}
function countdownText(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
function refreshOtpTimers(){
 const phone=cooldownPhone(),remaining=cooldownRemaining(phone),requested=hasRequestedCode(phone),time=countdownText(remaining),send=$('send-code'),phoneTimer=$('phone-otp-timer'),resend=$('resend-otp'),otpTimer=$('otp-timer');
 if(send){send.disabled=otpRequestPending||remaining>0;send.textContent=otpRequestPending?'Sending code…':remaining?`Request another code in ${time}`:requested?'Request a new code':'Send verification code';}
 if(phoneTimer){phoneTimer.hidden=!remaining;phoneTimer.textContent=remaining?`You can request another code in ${time}.`:'';}
 if(resend){resend.disabled=otpRequestPending||remaining>0;resend.textContent=otpRequestPending?'Sending…':remaining?'Resend code':'Request new code';}
 if(otpTimer)otpTimer.textContent=remaining?`You can request another code in ${time}.`:'You can request a new code now.';
 if(remaining>0&&!otpCooldownInterval)otpCooldownInterval=setInterval(refreshOtpTimers,1000);
 if(!remaining&&otpCooldownInterval){clearInterval(otpCooldownInterval);otpCooldownInterval=null;}
}
function startOtpCooldown(value,seconds=OTP_COOLDOWN_SECONDS){
 otpRequestStartedFor=value;
 try{sessionStorage.setItem(otpCooldownKey(value),String(Date.now()+Math.max(0,seconds)*1000));}catch{}
 refreshOtpTimers();
}
function applyRetryCooldown(error,value){
 const match=String(error?.message||'').match(/wait\s+(\d+)\s+seconds?/i);
 const seconds=Number(error?.retryAfter)||Number(match?.[1])||0;
 if(seconds>0)startOtpCooldown(value,seconds);
}
let waVerifyId='',waPollTimer=null,waPollInFlight=false,waVerificationCompleted=false;
const waPendingKey='filmgo-wa-verify-v1';
function saveWhatsAppPending(data){try{localStorage.setItem(waPendingKey,JSON.stringify(data));}catch{}}
function clearWhatsAppPending(){try{localStorage.removeItem(waPendingKey);}catch{}}
function closeWhatsAppSheet(){whatsappSheet.classList.add('hidden');if(waPollTimer){clearInterval(waPollTimer);waPollTimer=null;}}
function resetVerification(){closeWhatsAppSheet();clearWhatsAppPending();waVerifyId='';waVerificationCompleted=false;otpFields.forEach(field=>field.value='');syncOtpCode();$('verify').classList.add('hidden');$('start').classList.remove('hidden');msg('Verification reset. Enter your phone number to start again.');refreshOtpTimers();$('phone').focus();}
function beginWhatsAppPolling(){
 if(waPollTimer)clearInterval(waPollTimer);
 waPollInFlight=false;waVerificationCompleted=false;
 const poll=async()=>{
  if(!waVerifyId||!number||waPollInFlight||waVerificationCompleted)return;
  waPollInFlight=true;
  try{
   const result=await api('otp/whatsapp/status',{number,request_id:waVerifyId});
   if(!result.verified)return;
   waVerificationCompleted=true;clearWhatsAppPending();
   if(waPollTimer){clearInterval(waPollTimer);waPollTimer=null;}
   $('whatsapp-sheet-copy').textContent='Your WhatsApp number was verified successfully.';
   $('verify-via-whatsapp').classList.add('hidden');$('send-otp-fallback').classList.add('hidden');$('whatsapp-verify-link').classList.add('hidden');
   $('whatsapp-sheet-status').textContent='Verification complete. Tap below to return to FilmGo.';
   let done=document.getElementById('wa-verify-done');if(!done){done=document.createElement('button');done.id='wa-verify-done';done.type='button';done.className='primary-button';done.addEventListener('click',()=>location.assign('/'));document.querySelector('.auth-sheet-panel').append(done);}done.textContent='Continue to FilmGo';
   authVersion++;signedIn=true;saveLoginHint(true);
  }catch(err){if(/expired/i.test(err.message)){clearWhatsAppPending();closeWhatsAppSheet();msg('WhatsApp verification expired. Please send a new code.');}}
  finally{waPollInFlight=false;}
 };
 void poll();waPollTimer=setInterval(()=>void poll(),2000);
}
async function startWhatsAppVerification(){
 const button=$('verify-via-whatsapp');button.disabled=true;button.textContent='Preparing WhatsApp verification…';
 try{
  const result=await api('otp/whatsapp/start',{number});waVerifyId=result.request_id;saveWhatsAppPending({request_id:waVerifyId,number,url:result.url,expires_at:Date.now()+Number(result.expires_in||300)*1000});
  const link=$('whatsapp-verify-link');link.href=result.url;link.classList.remove('hidden');link.textContent='Open WhatsApp manually';
  $('whatsapp-sheet-status').textContent='Opening WhatsApp… Send the pre-filled message, then return here.';
  button.textContent='WhatsApp opened — send the message';const popup=window.open('about:blank','_blank','noopener,noreferrer');if(popup)popup.location.href=result.url;else location.href=result.url;
  beginWhatsAppPolling();
 }catch(err){$('whatsapp-sheet-status').textContent=err.message;button.disabled=false;button.textContent='Verify via WhatsApp';}
}
async function sendOtpFallback(){
 const button=$('send-otp-fallback');button.disabled=true;button.textContent='Sending OTP…';otpRequestPending=true;refreshOtpTimers();
 try{clearWhatsAppPending();await api('otp/start',{number});startOtpCooldown(number);otpFields.forEach(field=>field.value='');syncOtpCode();closeWhatsAppSheet();$('auth-intro').textContent='We sent a verification code to '+number+'.';$('start').classList.add('hidden');$('verify').classList.remove('hidden');msg('Verification code sent to '+number);otpFields[0].focus();}
 catch(err){applyRetryCooldown(err,number);$('whatsapp-sheet-status').textContent=err.message;button.disabled=false;button.textContent='Can’t access WhatsApp? Send OTP';}
 finally{otpRequestPending=false;refreshOtpTimers();}
}
function openWhatsAppSheet(){whatsappSheet.classList.remove('hidden');waVerificationCompleted=false;document.getElementById('wa-verify-done')?.remove();$('whatsapp-sheet-status').textContent='';$('whatsapp-sheet-copy').textContent='Choose a secure way to verify your phone number.';$('verify-via-whatsapp').classList.remove('hidden');$('verify-via-whatsapp').disabled=false;$('verify-via-whatsapp').textContent='Verify via WhatsApp';$('send-otp-fallback').classList.remove('hidden');$('send-otp-fallback').disabled=false;$('send-otp-fallback').textContent='Can’t access WhatsApp? Send OTP';$('whatsapp-verify-link').classList.add('hidden');$('whatsapp-verify-link').removeAttribute('href');}
function restorePendingWhatsAppVerification(){
 let pending=null;try{pending=JSON.parse(localStorage.getItem(waPendingKey)||'null');}catch{}
 if(!pending||typeof pending.request_id!=='string'||typeof pending.number!=='string'||!pending.url||Number(pending.expires_at)<=Date.now()){clearWhatsAppPending();return;}
 number=pending.number;waVerifyId=pending.request_id;$('phone').value=number;openWhatsAppSheet();
 const link=$('whatsapp-verify-link');link.href=pending.url;link.textContent='Open WhatsApp manually';link.classList.remove('hidden');
 $('verify-via-whatsapp').disabled=true;$('verify-via-whatsapp').textContent='Waiting for WhatsApp verification…';$('whatsapp-sheet-status').textContent='Previous verification request restored. Send the message or return here after sending it.';
 beginWhatsAppPolling();
}
$('close-whatsapp-sheet').addEventListener('click',closeWhatsAppSheet);document.querySelector('[data-close-whatsapp-sheet]').addEventListener('click',closeWhatsAppSheet);$('send-otp-fallback').addEventListener('click',sendOtpFallback);$('verify-via-whatsapp').addEventListener('click',startWhatsAppVerification);
let countriesLoaded=false,countriesFailed=false,countriesPromise=null,countryList=[];
function flagFor(iso){return String.fromCodePoint(...String(iso||'').toUpperCase().split('').map(ch=>127397+ch.charCodeAt(0)));}
function closeCountryPicker(){const panel=$('country-panel');panel.hidden=true;$('country-trigger').setAttribute('aria-expanded','false');}
function renderCountryOptions(query=''){
 const term=query.trim().toLowerCase(),root=$('country-options');root.replaceChildren();
 const matches=countryList.filter(c=>c.name.toLowerCase().includes(term)||c.iso.toLowerCase().includes(term)||('+'+c.dial).includes(term)).slice(0,80);
 if(!matches.length){root.append(Object.assign(document.createElement('p'),{className:'country-no-results',textContent:countryList.length?'No matching countries':countriesFailed?'Country list unavailable':'Loading countries…'}));return;}
 for(const country of matches){
  const option=document.createElement('button');option.type='button';option.className='country-option';option.setAttribute('role','option');option.setAttribute('aria-selected',String($('country').value===country.dial));
  const name=document.createElement('span');name.textContent=flagFor(country.iso)+' '+country.name;const dial=document.createElement('span');dial.className='country-option-dial';dial.textContent='+'+country.dial;option.append(name,dial);
  option.addEventListener('click',()=>{const select=$('country');select.value=country.dial;for(const item of select.options)item.selected=item.value===country.dial;$('country-value').textContent=flagFor(country.iso)+' '+country.name+' (+'+country.dial+')';closeCountryPicker();refreshOtpTimers();$('country-trigger').focus();});root.append(option);
 }
}
function loadCountries(){if(countriesLoaded||countriesPromise)return countriesPromise;countriesPromise=fetch('/countries.json',{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('Country list unavailable');return r.json();}).then(data=>{countryList=(data.countries||[]).filter(c=>c&&/^[A-Z]{2}$/.test(c.iso)&&/^\d{1,5}$/.test(c.dial));const select=$('country');select.replaceChildren();for(const country of countryList){const option=document.createElement('option');option.value=country.dial;option.dataset.iso=country.iso;option.textContent=flagFor(country.iso)+' '+country.name+' (+'+country.dial+')';if(country.iso==='LK')option.selected=true;select.append(option);}const sriLanka=countryList.find(c=>c.iso==='LK');if(sriLanka){select.value=sriLanka.dial;$('country-value').textContent=flagFor(sriLanka.iso)+' '+sriLanka.name+' (+'+sriLanka.dial+')';}countriesLoaded=true;if(!$('country-panel').hidden)renderCountryOptions($('country-search').value);}).catch(()=>{countriesFailed=true;msg('Country list unavailable; Sri Lanka is the default.');}).finally(()=>{countriesPromise=null;});return countriesPromise;}
$('country-trigger').addEventListener('click',async()=>{const panel=$('country-panel');if(!panel.hidden){closeCountryPicker();return;}panel.hidden=false;$('country-trigger').setAttribute('aria-expanded','true');await loadCountries();if(panel.hidden)return;renderCountryOptions($('country-search').value);$('country-search').focus();});
$('country-search').addEventListener('input',()=>renderCountryOptions($('country-search').value));
$('country-search').addEventListener('keydown',event=>{if(event.key==='Escape'){closeCountryPicker();$('country-trigger').focus();}if(event.key==='Enter'){event.preventDefault();$('country-options').querySelector('.country-option')?.click();}});
$('country-trigger').addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();$('country-trigger').click();}});
$('country-picker').addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('country-panel').hidden){closeCountryPicker();$('country-trigger').focus();}});
document.addEventListener('click',event=>{if(!event.target.closest('#country-picker'))closeCountryPicker();});
$('phone').addEventListener('focus',()=>{void loadCountries();});
$('phone').addEventListener('input',refreshOtpTimers);
refreshOtpTimers();
const otpFields=Array.from({length:6},(_,i)=>$('code-'+(i+1)));
function syncOtpCode(){ $('code').value=otpFields.map(field=>field.value).join(''); return $('code').value; }
function fillOtpFrom(value,startAt=0){
 const digits=String(value||'').replace(/\D/g,'');
 if(!digits)return;
 const start=digits.length>=6?0:startAt;
 otpFields.forEach((field,index)=>{if(index>=start)field.value='';});
 [...digits].slice(0,6-start).forEach((digit,offset)=>{otpFields[start+offset].value=digit;});
 syncOtpCode();
 const next=otpFields.findIndex(field=>!field.value);
 otpFields[next<0?5:next].focus();
 if(next<0)otpFields[5].select();
}
otpFields.forEach((field,index)=>{
 field.addEventListener('input',()=>{
  const value=field.value;
  if(value.length>1){fillOtpFrom(value,index);return;}
  field.value=value.replace(/\D/g,'').slice(-1);
  syncOtpCode();
  if(field.value&&index<otpFields.length-1)otpFields[index+1].focus();
 });
 field.addEventListener('paste',event=>{
  const pasted=event.clipboardData?.getData('text')||'';
  if(!/\d/.test(pasted))return;
  event.preventDefault();
  fillOtpFrom(pasted,index);
 });
 field.addEventListener('keydown',event=>{
  if(event.key==='Backspace'&&!field.value&&index>0){event.preventDefault();otpFields[index-1].value='';syncOtpCode();otpFields[index-1].focus();}
  else if(event.key==='ArrowLeft'&&index>0){event.preventDefault();otpFields[index-1].focus();}
  else if(event.key==='ArrowRight'&&index<otpFields.length-1){event.preventDefault();otpFields[index+1].focus();}
 });
});
$('start').addEventListener('submit',async e=>{e.preventDefault();number=phoneNumber();if(!number)return;openWhatsAppSheet();});
$('resend-otp').addEventListener('click',async()=>{if(!number||cooldownRemaining(number)||otpRequestPending)return;otpRequestPending=true;refreshOtpTimers();try{await api('otp/start',{number});startOtpCooldown(number);otpFields.forEach(field=>field.value='');syncOtpCode();otpFields[0].focus();msg('A new verification code was sent.');}catch(err){applyRetryCooldown(err,number);msg(err.message)}finally{otpRequestPending=false;refreshOtpTimers();}});
$('change-phone').addEventListener('click',()=>{otpFields.forEach(field=>field.value='');syncOtpCode();$('auth-intro').textContent='Sign in using Phone to manage your FilmGo account.';$('verify').classList.add('hidden');$('start').classList.remove('hidden');refreshOtpTimers();$('phone').focus();});
$('verify').addEventListener('submit',async e=>{e.preventDefault();const code=syncOtpCode();if(!/^\d{6}$/.test(code)){otpFields.find(field=>!field.value)?.focus();return;}const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;try{const back=new URLSearchParams(location.search).get('return');const safeBack=back&&(/^\/title\/[A-Za-z0-9_-]+\/?$/.test(back)||/^\/download\/[A-Za-z0-9_-]{1,80}(?:\?quality=[A-Za-z0-9._+-]{1,40})?$/.test(back));await api('otp/verify',{number,code});authVersion++;await showAccount();saveLoginHint(true);if(safeBack){location.assign(back);return;}msg('Signed in successfully.');}catch(err){msg(err.message)}finally{btn.disabled=false;}});
const AVATAR_PLACEHOLDER='https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original';
const avatarCacheKey=n=>'filmgo-avatar:'+n;
function paintAvatar(url){
 const source=typeof url==='string'&&url.startsWith('https://')?url:AVATAR_PLACEHOLDER;
 for(const id of ['profile-avatar','profile-monogram']){
  const root=$(id);if(!root)continue;
  root.querySelector('.wa-avatar-image')?.remove();
  const img=document.createElement('img');img.className='wa-avatar-image';img.alt='Profile picture';img.referrerPolicy='no-referrer';
  img.onerror=()=>{if(img.dataset.fallbackApplied!=='true'&&img.src!==AVATAR_PLACEHOLDER){img.dataset.fallbackApplied='true';img.src=AVATAR_PLACEHOLDER;return;}img.remove();};
  img.src=source;root.append(img);
 }
}
async function refreshAvatar(number){
 let cached=null;
 try{cached=sessionStorage.getItem(avatarCacheKey(number));}catch{}
 if(cached){paintAvatar(cached);return;}
 try{
  const response=await fetch('/api/avatar',{cache:'no-store'});
  if(!response.ok){paintAvatar(AVATAR_PLACEHOLDER);return;}
  const data=await response.json();
  if(typeof data.url==='string'&&data.url.startsWith('https://')){
   try{sessionStorage.setItem(avatarCacheKey(number),data.url);}catch{}
   paintAvatar(data.url);return;
  }
  paintAvatar(AVATAR_PLACEHOLDER);
 }catch{paintAvatar(AVATAR_PLACEHOLDER);}
}
async function refreshAccount(){
 const response=await fetch('/api/me',{cache:'no-store'});
 if(!response.ok)throw Error('Session expired');
 const user=await response.json();
 applyPricingCountry(user.number);
 $('account-number').textContent=user.number;
 $('profile-name').value=user.name||'';
 $('profile-display-name').textContent=user.name||'FilmGo member';
 $('usage-stats').replaceChildren();
 for(const [label,value] of [['Tokens used',user.unlimited?'—':user.tokens_used],['Tokens remaining',user.unlimited?'∞':user.tokens_remaining],['Daily tokens',user.unlimited?'∞':user.token_limit]]){const tile=document.createElement('div');tile.className='usage-tile';const n=document.createElement('strong');n.textContent=String(value);const t=document.createElement('span');t.textContent=label;tile.append(n,t);$('usage-stats').append(tile);}
 $('avatar-initials').textContent=(user.name||'FG').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
 $('profile-monogram').textContent=$('avatar-initials').textContent;
 void refreshAvatar(user.number);
 $('account-limits').textContent=user.unlimited?'Tokens: Unlimited · No daily quota':'Tokens: '+user.tokens_used+' / '+user.token_limit+' used · '+user.tokens_remaining+' remaining · Resets 00:00:00 UTC';
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
// The server has already checked the session for direct profile navigation.
// Paint the correct shell immediately, then showAccount() revalidates /api/me.
const serverAuthenticated=document.documentElement.dataset.serverAuthenticated==='true';
signedIn=serverAuthenticated;
routeView();
document.documentElement.classList.add('auth-ready');
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
 $('price-free').textContent='Basic';
 for(const tier of ['plus','premium'])$('price-'+tier).textContent=planQuote(tier).formatted+' / month';
}
updatePlanPrices();
$('continue-free').addEventListener('click',async()=>{
 const button=$('continue-free');button.disabled=true;
 try{await api('plans/continue',{});navigate('/profile');msg('You are continuing with the Basic plan.');}
 catch(err){msg(err.message);}
 finally{button.disabled=false;}
});
for(const tier of ['plus','premium'])$('upgrade-'+tier).addEventListener('click',()=>{
 const quote=planQuote(tier);
 const message=['Hello FilmGo!','I would like to enquire about upgrading my account.','Plan: '+(tier==='plus'?'Plus':'Premium'),'Displayed price: '+quote.formatted+' per month','Please confirm availability, benefits and payment instructions.'].join('\n');
 window.open('https://wa.me/94779290433?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
});

let historyLoading=false,historyHasSnapshot=false,historyPage=1;const HISTORY_PAGE_SIZE=10;
async function loadHistory(){
 if(historyLoading)return;
 historyLoading=true;
 const root=$('history-list');
 if(!historyHasSnapshot){root.replaceChildren();const loading=document.createElement('div');loading.className='history-skeleton';loading.setAttribute('aria-label','Loading request history');loading.setAttribute('role','status');for(let i=0;i<3;i++){const shimmer=document.createElement('div');shimmer.className='history-shimmer';loading.append(shimmer);}root.append(loading);}
 try{
  const response=await fetch('/api/request-history',{cache:'no-store'});
  if(!response.ok)throw Error(response.status===401?'Please sign in again.':'Could not load request history.');
  const data=await response.json();historyHasSnapshot=true;root.replaceChildren();
  const nav=$('history-pagination');nav.replaceChildren();nav.classList.add('hidden');
  if(!Array.isArray(data.requests)||!data.requests.length){
   const empty=document.createElement('div');empty.className='history-empty';
   const title=document.createElement('strong');title.textContent='No requests yet';
   const description=document.createElement('p');description.textContent='Movies you request will appear here after they are queued.';
   empty.append(title,description);root.append(empty);return;
  }
  const pages=Math.max(1,Math.ceil(data.requests.length/HISTORY_PAGE_SIZE));historyPage=Math.min(historyPage,pages);
  nav.classList.toggle('hidden',pages<=1);
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
 }catch(err){if(!historyHasSnapshot){root.replaceChildren();const error=document.createElement('p');error.className='small';error.textContent=err.message;root.append(error);}}finally{historyLoading=false;}
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
$('profile-back').addEventListener('click',()=>{
 if(location.pathname==='/history'||location.pathname==='/plans'){navigate('/profile');return;}
 // The catalog is served as a different document at `/`; do a document
 // navigation instead of leaving the account shell with every panel hidden.
 window.location.assign('/');
});
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
 try{await api('logout',{});authVersion++;signedIn=false;historyHasSnapshot=false;$('history-list').replaceChildren();saveLoginHint(false);paintAvatar(null);try{for(const key of Object.keys(sessionStorage)){if(key.startsWith('filmgo-avatar:'))sessionStorage.removeItem(key);}}catch{}navigate('/profile');msg('Signed out.');}
 catch(e){msg(e.message);}
});
setInterval(()=>{if(signedIn&&location.pathname==='/history'&&!document.hidden)void loadHistory();},12000);
const initialAuthVersion=authVersion;
showAccount().then(()=>{
 if(initialAuthVersion!==authVersion)return;
 clearWhatsAppPending();
 saveLoginHint(true);
}).catch(()=>{
 if(initialAuthVersion!==authVersion)return;
 signedIn=false;
 saveLoginHint(false);
 routeView();
 msg('Please sign in to continue.');
 restorePendingWhatsAppVerification();
}).finally(()=>document.documentElement.classList.add('auth-ready'));
