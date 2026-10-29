const $=id=>document.getElementById(id);let number='',token='',signedIn=false,authVersion=0;const loginHintKey='tfw_login_hint_v1';const storedLogin=()=>{try{return localStorage.getItem(loginHintKey)==='1';}catch{return false;}};const saveLoginHint=value=>{try{if(value)localStorage.setItem(loginHintKey,'1');else localStorage.removeItem(loginHintKey);}catch{}};const msg=t=>{$('message').textContent=t;};async function api(route,payload){const r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}function phoneNumber(){let raw=$('phone').value.replace(/[^0-9+]/g,'');if(raw.startsWith('+'))return raw;if(raw.startsWith('00'))return '+'+raw.slice(2);raw=raw.replace(/^0+/,'');const dial=$('country').value;return '+'+(raw.startsWith(dial)?raw:dial+raw);}fetch('/countries.json').then(r=>r.json()).then(d=>{const sel=$('country');sel.replaceChildren();for(const c of d.countries){const o=document.createElement('option');o.value=c.dial;o.textContent=c.name+' (+'+c.dial+')';if(c.iso==='LK')o.selected=true;sel.append(o);}}).catch(()=>msg('Country list unavailable; Sri Lanka is the default.'));
$('start').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{number=phoneNumber();const version=authVersion;await api('otp/start',{number});if(version!==authVersion)return;$('start').classList.add('hidden');$('verify').classList.remove('hidden');msg('Verification code sent to '+number);}catch(err){msg(err.message)}finally{btn.disabled=false;}});
$('verify').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{const d=await api('otp/verify',{number,code:$('code').value});authVersion++;await showAccount();saveLoginHint(true);msg('Signed in successfully.');}catch(err){msg(err.message)}finally{btn.disabled=false;}});
$('request').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{const d=await api('request',{movie_id:Number($('movie-id').value),rights_confirmed:$('rights').checked});await refreshAccount();msg('Request '+d.request_id+' submitted for review. This does not guarantee delivery.');}catch(err){msg(err.message)}finally{btn.disabled=false;}});

let movieResults=[];
const movieSearch=$('movie-search'),movieOptions=$('movie-options');
function renderMovies(){
 const q=movieSearch.value.trim().toLowerCase();
 const rows=movieResults.filter(m=>m.title.toLowerCase().includes(q)||String(m.year||'').includes(q)).slice(0,30);
 movieOptions.replaceChildren();
 for(const movie of rows){
  const option=document.createElement('button');
  option.type='button';option.className='movie-option';option.setAttribute('role','option');
  const title=document.createElement('strong');title.textContent=movie.title;
  const meta=document.createElement('span');meta.textContent=movie.year+' · '+movie.quality+' · '+(movie.size/1048576).toFixed(1)+' MiB';
  option.append(title,meta);
  option.addEventListener('click',()=>{movieSearch.value=movie.title;$('movie-id').value=String(movie.id);movieOptions.classList.add('hidden');movieSearch.setAttribute('aria-expanded','false');});
  movieOptions.append(option);
 }
 if(!rows.length){const empty=document.createElement('p');empty.className='small';empty.textContent='No matching movies';movieOptions.append(empty);}
 movieOptions.classList.remove('hidden');movieSearch.setAttribute('aria-expanded','true');
}
let catalogLoading=false;
async function loadMovies(){
 if(catalogLoading)return;
 catalogLoading=true;
 try{
  const response=await fetch('/api/movies',{cache:'no-store'});
  if(!response.ok)return;
  const data=await response.json();
  if(!movieSearch.value.trim())movieResults=Array.isArray(data.movies)?data.movies:[];
 }catch{/* Background catalog refresh is intentionally silent. */}
 finally{catalogLoading=false;}
}

setInterval(()=>{if(!document.hidden&&!movieSearch.value.trim())void loadMovies();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!movieSearch.value.trim())void loadMovies();});
let movieTimer=0,movieQuerySequence=0;
movieSearch.addEventListener('input',()=>{
 $('movie-id').value='';
 clearTimeout(movieTimer);
 const query=movieSearch.value.trim(),sequence=++movieQuerySequence;
 movieTimer=setTimeout(async()=>{
  try{
   const response=await fetch('/api/movies?q='+encodeURIComponent(query),{cache:'no-store'});
   if(!response.ok)throw Error('Catalog search unavailable');
   const data=await response.json();
   if(sequence!==movieQuerySequence)return;
   movieResults=data.movies||[];renderMovies();
  }catch(e){movieOptions.replaceChildren();movieOptions.classList.add('hidden');}
 },250);
});
movieSearch.addEventListener('focus',()=>{if(movieResults.length)renderMovies();else if(!movieSearch.value.trim())void loadMovies();});
movieSearch.addEventListener('keydown',e=>{if(e.key==='Escape'){movieOptions.classList.add('hidden');movieSearch.setAttribute('aria-expanded','false');}});
document.addEventListener('click',e=>{if(!e.target.closest('.movie-picker')){movieOptions.classList.add('hidden');movieSearch.setAttribute('aria-expanded','false');}});
$('request').addEventListener('submit',e=>{if(!$('movie-id').value){e.preventDefault();msg('Please select a movie from the dropdown.');}},true);

async function refreshAccount(){
 const response=await fetch('/api/me',{cache:'no-store'});
 if(!response.ok)throw Error('Session expired');
 const user=await response.json();
 $('account-number').textContent='WhatsApp: '+user.number;
 $('profile-name').value=user.name||'';
 $('avatar-initials').textContent=(user.name||user.number||'?').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
 $('account-limits').textContent=user.unlimited?'Requests: Unlimited · No daily quota':'Requests: '+user.used+' / '+user.limit+' used · '+user.remaining+' remaining ('+user.period+')';
 return user;
}
function routeView(){
 $('start').classList.toggle('hidden',signedIn);
 $('verify').classList.add('hidden');
 $('account').classList.toggle('hidden',!signedIn||location.pathname!=='/profile');
 $('request').classList.toggle('hidden',!signedIn||location.pathname==='/profile');
 $('profile-avatar').classList.toggle('hidden',!signedIn||location.pathname==='/profile');
 $('profile-back').classList.toggle('hidden',!signedIn||location.pathname!=='/profile');
 $('auth-intro').classList.toggle('hidden',signedIn);
}
async function showAccount(){
 await refreshAccount();
 signedIn=true;
 routeView();
 await loadMovies();
}
function navigate(path){history.pushState({},'',path);routeView();if(path==='/profile'&&signedIn)refreshAccount().catch(e=>msg(e.message));}
$('profile-avatar').addEventListener('click',()=>navigate('/profile'));
$('profile-back').addEventListener('click',()=>navigate('/request'));
window.addEventListener('popstate',routeView);
$('save-profile').addEventListener('click',async()=>{
 const btn=$('save-profile');btn.disabled=true;
 try{await api('profile',{name:$('profile-name').value});await refreshAccount();msg('Profile saved.');}
 catch(e){msg(e.message);}finally{btn.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
 try{await api('logout',{});authVersion++;signedIn=false;saveLoginHint(false);navigate('/request');msg('Signed out.');}
 catch(e){msg(e.message);}
});
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
