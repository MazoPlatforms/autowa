const $=id=>document.getElementById(id);let number='',token='';const msg=t=>{$('message').textContent=t;};async function api(route,payload){const r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}function phoneNumber(){let raw=$('phone').value.replace(/[^0-9+]/g,'');if(raw.startsWith('+'))return raw;if(raw.startsWith('00'))return '+'+raw.slice(2);raw=raw.replace(/^0+/,'');const dial=$('country').value;return '+'+(raw.startsWith(dial)?raw:dial+raw);}fetch('/countries.json').then(r=>r.json()).then(d=>{const sel=$('country');sel.replaceChildren();for(const c of d.countries){const o=document.createElement('option');o.value=c.dial;o.textContent=c.name+' (+'+c.dial+')';if(c.iso==='LK')o.selected=true;sel.append(o);}}).catch(()=>msg('Country list unavailable; Sri Lanka is the default.'));
$('start').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{number=phoneNumber();await api('otp/start',{number});$('start').classList.add('hidden');$('verify').classList.remove('hidden');msg('Verification code sent to '+number);}catch(err){msg(err.message)}finally{btn.disabled=false;}});
$('verify').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{const d=await api('otp/verify',{number,code:$('code').value});token=d.token;loadMovies();$('verify').classList.add('hidden');$('request').classList.remove('hidden');msg('Number verified. You may submit one request.');}catch(err){msg(err.message)}finally{btn.disabled=false;}});
$('request').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{const d=await api('request',{token,movie_id:Number($('movie-id').value),rights_confirmed:$('rights').checked});token='';$('request').classList.add('hidden');msg('Request '+d.request_id+' submitted for review. This does not guarantee delivery.');}catch(err){msg(err.message)}finally{btn.disabled=false;}});

let movieResults=[];
const movieSearch=$('movie-search'),movieOptions=$('movie-options');
function renderMovies(){
 const q=movieSearch.value.trim().toLowerCase();
 const rows=movieResults.filter(m=>m.title.toLowerCase().includes(q)||m.filename.toLowerCase().includes(q)).slice(0,30);
 movieOptions.replaceChildren();
 for(const movie of rows){
  const option=document.createElement('button');
  option.type='button';option.className='movie-option';option.setAttribute('role','option');
  const title=document.createElement('strong');title.textContent=movie.title;
  const meta=document.createElement('span');meta.textContent=(movie.size/1048576).toFixed(1)+' MiB';
  option.append(title,meta);
  option.addEventListener('click',()=>{movieSearch.value=movie.title;$('movie-id').value=String(movie.id);movieOptions.classList.add('hidden');movieSearch.setAttribute('aria-expanded','false');$('movie-hint').textContent='Selected movie · '+meta.textContent;});
  movieOptions.append(option);
 }
 if(!rows.length){const empty=document.createElement('p');empty.className='small';empty.textContent='No matching movies';movieOptions.append(empty);}
 movieOptions.classList.remove('hidden');movieSearch.setAttribute('aria-expanded','true');
}
async function loadMovies(){
 $('movie-hint').textContent='Loading available movies…';
 try{
  const response=await fetch('/api/movies',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Catalog unavailable');
  movieResults=data.movies||[];
  $('movie-hint').textContent=movieResults.length+' movies available · Select a movie from the dropdown';
 }catch(e){$('movie-hint').textContent=e.message;}
}
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
  }catch(e){$('movie-hint').textContent=e.message;}
 },250);
});
movieSearch.addEventListener('focus',()=>{if(movieResults.length)renderMovies();});
movieSearch.addEventListener('keydown',e=>{if(e.key==='Escape'){movieOptions.classList.add('hidden');movieSearch.setAttribute('aria-expanded','false');}});
document.addEventListener('click',e=>{if(!e.target.closest('.movie-picker')){movieOptions.classList.add('hidden');movieSearch.setAttribute('aria-expanded','false');}});
$('request').addEventListener('submit',e=>{if(!$('movie-id').value){e.preventDefault();msg('Please select a movie from the dropdown.');}},true);
