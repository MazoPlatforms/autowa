function confirmMovieRequest(movie,channel){
 const overlay=el('div','filmgo-sheet-overlay');const sheet=el('div','filmgo-sheet');
 sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
 sheet.append(el('h2','','Confirm movie request'),el('p','filmgo-sheet-description',movie.title+' ('+movie.year+') via '+(channel==='telegram'?'Telegram':'WhatsApp')+'?'));
 const buttons=el('div','filmgo-sheet-buttons');
 const cancel=el('button','filmgo-open-button','Cancel');const confirm=el('button','filmgo-download-button','Confirm');
 const close=()=>{document.removeEventListener('keydown',esc);overlay.remove();};
 const esc=e=>{if(e.key==='Escape')close();};
 cancel.addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 confirm.addEventListener('click',async()=>{
  confirm.disabled=true;confirm.textContent='Preparing…';
  try{
   if(channel==='telegram'){
    const response=await fetch('/api/telegram-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug_id:movie.slug_id})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to create Telegram link');
    close();location.href=data.url;return;
   }
   const response=await fetch('/api/request',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({movie_id:movie.telegram_message_id,rights_confirmed:true})});
   const data=await response.json();if(response.status===401){close();location.href='/profile';return;}
   if(!response.ok)throw Error(data.error||'Request failed');
   sheet.replaceChildren(el('h2','','Request received'),el('p','filmgo-sheet-description','Your WhatsApp movie request has been queued.'));
   const done=el('button','filmgo-download-button','Done');done.addEventListener('click',close);sheet.append(done);
  }catch(err){confirm.disabled=false;confirm.textContent='Try again';sheet.querySelector('.filmgo-sheet-error')?.remove();sheet.append(el('p','filmgo-sheet-error',err.message));}
 });
 buttons.append(cancel,confirm);sheet.append(buttons);overlay.append(sheet);document.body.append(overlay);document.addEventListener('keydown',esc);cancel.focus();
}
const $=id=>document.getElementById(id);const grid=$('catalog-grid'),search=$('catalog-search'),empty=$('catalog-empty'),home=$('catalog-home'),detail=$('catalog-detail');let movies=[];const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};const FALLBACK_POSTER='https://i.ibb.co/TMJ6YCC4/IMG-33a2f581-8ff4-4a5e-9e64-e43c900000c2.png';const poster=m=>m.poster&&(/^https:\/\//.test(m.poster)||/^\/posters\/[a-f0-9]{24}\.jpg$/.test(m.poster))?m.poster:FALLBACK_POSTER;function image(m,cls){const img=el('img',cls);img.alt=m.title+' poster';img.loading='lazy';img.src=poster(m);img.onerror=()=>{if(img.src!==FALLBACK_POSTER){img.src=FALLBACK_POSTER;}else{img.onerror=null;img.removeAttribute('src');}};return img;}function skeleton(){grid.replaceChildren();for(let i=0;i<8;i++){const box=el('div');box.append(el('div','shimmer aspect-[2/3] rounded-2xl'),el('div','shimmer mt-3 h-4 w-3/4 rounded-md'),el('div','shimmer mt-2 h-3 w-1/2 rounded-md'));grid.append(box);}}const PAGE_SIZE=20;let page=1,catalogLoaded=false;
const yearFilter=$('filter-year'),genreFilter=$('filter-genre'),sortFilter=$('filter-sort'),pagination=$('catalog-pagination');
// Accessible custom popovers; native selects remain as the state source.
function initCustomFilters(){
 const filters=[yearFilter,genreFilter,sortFilter];
 const closeAll=()=>{for(const select of filters){const box=select.closest('.catalog-filter');box.classList.remove('open');box.querySelector('.filter-trigger').setAttribute('aria-expanded','false');}};
 for(const select of filters){
  const box=select.closest('.catalog-filter');
  select.classList.add('visually-hidden-select');
  const trigger=el('button','filter-trigger');trigger.type='button';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  const label=el('span','filter-trigger-label');const arrow=el('span','filter-chevron');arrow.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';trigger.append(label,arrow);
  const panel=el('div','filter-panel');panel.setAttribute('role','listbox');panel.setAttribute('aria-label',select.getAttribute('aria-label')||'Filter options');
  box.append(trigger,panel);
  const refresh=()=>{
   label.textContent=select.selectedOptions[0]?.textContent||'All';
   panel.replaceChildren();
   for(const option of select.options){
    const item=el('button','filter-option'+(option.value===select.value?' selected':''),option.textContent);
    item.type='button';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.value===select.value));
    item.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change'));closeAll();trigger.focus();});
    panel.append(item);
   }
  };
  select.addEventListener('change',refresh);
  trigger.addEventListener('click',()=>{const open=box.classList.contains('open');closeAll();if(!open){box.classList.add('open');trigger.setAttribute('aria-expanded','true');}});
  trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='Enter'&& !box.classList.contains('open')){event.preventDefault();closeAll();box.classList.add('open');trigger.setAttribute('aria-expanded','true');panel.querySelector('button')?.focus();}});
  panel.addEventListener('keydown',event=>{const buttons=[...panel.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(event.key==='Escape'){closeAll();trigger.focus();}});
  refresh();
 }
 document.addEventListener('click',event=>{if(!event.target.closest('.catalog-filter'))closeAll();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAll();});
}
initCustomFilters();
function updateFilters(){
 const oldYear=yearFilter.value,oldGenre=genreFilter.value;
 const years=[...new Set(movies.map(m=>String(m.year||'').trim()).filter(y=>/^\d{4}$/.test(y)))].sort((a,b)=>Number(b)-Number(a));
 const genres=[...new Set(movies.flatMap(m=>Array.isArray(m.genre)?m.genre:typeof m.genre==='string'?m.genre.split(','):[]).map(g=>String(g).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const fill=(select,values,label)=>{select.replaceChildren(new Option(label,''));for(const value of values)select.add(new Option(value,value));};
 fill(yearFilter,years,'All years');fill(genreFilter,genres,'All genres');
 yearFilter.value=years.includes(oldYear)?oldYear:'';genreFilter.value=genres.includes(oldGenre)?oldGenre:'';
 yearFilter.dispatchEvent(new Event('change'));genreFilter.dispatchEvent(new Event('change'));
}
function renderPagination(total){
 pagination.replaceChildren();
 const pages=Math.ceil(total/PAGE_SIZE);
 pagination.classList.toggle('hidden',pages<=1);
 if(pages<=1)return;
 const add=(label,target,disabled=false,current=false)=>{
  const button=el('button','page-button'+(current?' active':''),label);
  button.type='button';button.disabled=disabled;
  if(current)button.setAttribute('aria-current','page');
  button.addEventListener('click',()=>{page=target;render();$('catalog-home').scrollIntoView({behavior:'smooth',block:'start'});});
  pagination.append(button);
 };
 add('‹',page-1,page===1);
 const shown=new Set([1,pages,page-1,page,page+1].filter(n=>n>=1&&n<=pages));
 let last=0;
 for(const n of [...shown].sort((a,b)=>a-b)){
  if(n-last>1)pagination.append(el('span','page-ellipsis','…'));
  add(String(n),n,false,n===page);last=n;
 }
 add('›',page+1,page===pages);
}
function render(){
 if(!catalogLoaded)return;
 const q=search.value.trim().toLowerCase(),year=yearFilter.value,genre=genreFilter.value;
 const rows=movies.filter(m=>{
  const genres=Array.isArray(m.genre)?m.genre:typeof m.genre==='string'?m.genre.split(','):[];
  return (!q||(String(m.title||'')+' '+m.year+' '+genres.join(' ')).toLowerCase().includes(q))
   &&(!year||String(m.year)===year)
   &&(!genre||genres.some(g=>String(g).trim().toLowerCase()===genre.toLowerCase()));
 });
 const rating=m=>{const n=Number(m.imdb_rating);return Number.isFinite(n)?n:-1;};
 rows.sort((a,b)=>{
  switch(sortFilter.value){
   case 'year-asc':return (Number(a.year)||0)-(Number(b.year)||0)||String(a.title).localeCompare(String(b.title));
   case 'year-desc':return (Number(b.year)||0)-(Number(a.year)||0)||String(a.title).localeCompare(String(b.title));
   case 'title-asc':return String(a.title).localeCompare(String(b.title));
   case 'title-desc':return String(b.title).localeCompare(String(a.title));
   case 'rating-desc':return rating(b)-rating(a)||String(a.title).localeCompare(String(b.title));
   default:return 0;
  }
 });
 page=Math.max(1,Math.min(page,Math.ceil(rows.length/PAGE_SIZE)||1));
 grid.replaceChildren();
 $('movie-count').textContent=rows.length+' '+(rows.length===1?'title':'titles');
 empty.classList.toggle('hidden',rows.length>0);
 empty.textContent=movies.length?'No movies match your filters.':'No movies available yet.';
 for(const m of rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)){
  const a=el('a','movie-card group block min-w-0');a.href='/title/'+encodeURIComponent(m.slug_id||m.id);
  const wrap=el('div','poster-wrap');wrap.append(image(m,'poster'));
  const badge=m.imdb_rating&&m.imdb_rating!=='N/A'?el('span','absolute bottom-2 left-2 rounded-md bg-zinc-950/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur','★ '+m.imdb_rating):null;
  if(badge)wrap.append(badge);
  a.append(wrap,el('h3','mt-3 truncate text-sm font-semibold text-zinc-100',m.title),el('p','mt-1 text-xs text-zinc-500',m.year+' · '+m.quality));
  a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState({},'',a.href);route();});
  grid.append(a);
 }
 renderPagination(rows.length);
}
function showDetail(m){const root=$('detail-content');root.replaceChildren();const layout=el('div','detail-hero');layout.append(image(m,'detail-poster'));const info=el('div');info.append(el('p','mb-2 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500','MOVIE DETAILS'),el('h1','text-2xl font-extrabold leading-tight tracking-tight sm:text-5xl',m.title),el('p','mt-3 text-sm text-zinc-400',[m.year,m.runtime].filter(Boolean).join(' · ')));if(m.imdb_rating)info.append(el('p','mt-3 text-sm font-semibold text-zinc-200','★ IMDb '+m.imdb_rating));if(m.genre?.length)info.append(el('p','mt-3 text-sm text-zinc-400',m.genre.join(' · ')));layout.append(info);root.append(layout);const body=el('div','mt-9 max-w-3xl border-t border-zinc-800 pt-8');body.append(el('h2','text-lg font-bold','Overview'),el('p','mt-3 text-sm leading-7 text-zinc-400',m.plot||'No synopsis available yet.'));if(m.director)body.append(el('p','mt-5 text-sm text-zinc-400','Director: '+m.director));if(m.cast?.length)body.append(el('p','mt-2 text-sm text-zinc-400','Cast: '+m.cast.join(', ')));root.append(body);
const section=el('section','mt-9 max-w-3xl border-t border-zinc-800 pt-8 filmgo-watch');
section.append(el('h2','mb-4 text-lg font-bold','Watch & download'));
const video=el('video','filmgo-player');
video.controls=true;video.preload='none';video.playsInline=true;
video.setAttribute('controlsList','nodownload');
video.poster=poster(m);
section.append(video);
const status=el('p','filmgo-stream-status','Checking streaming availability…');
status.setAttribute('role','status');
const actions=el('div','filmgo-player-actions');
const download=el('a','filmgo-download-button','Download movie');
download.setAttribute('download','');
download.setAttribute('aria-label','Download '+m.title);
const whatsapp=el('button','filmgo-open-button','WhatsApp');
whatsapp.type='button';whatsapp.addEventListener('click',()=>confirmMovieRequest(m,'whatsapp'));
const telegram=el('button','filmgo-open-button','Telegram');
telegram.type='button';telegram.addEventListener('click',()=>confirmMovieRequest(m,'telegram'));
actions.append(download,whatsapp,telegram);
section.append(actions,status);
root.append(section);
const slug=encodeURIComponent(m.slug_id||'');
const streamBase='https://filmgo-streamer.mazo.workers.dev';
const qualities=Object.keys(m.qualities||{[m.quality]:m}).filter(Boolean).sort((a,b)=>parseInt(a)-parseInt(b));
let selected=qualities.find(q=>q.toLowerCase()==='720p')||qualities[0];
const qualityRow=el('div','filmgo-quality-options');
const qualityLabel=el('p','filmgo-stream-status','Choose quality');
if(qualities.length>1){section.insertBefore(qualityLabel,actions);section.insertBefore(qualityRow,actions);}
const isActive=()=>root.isConnected&&location.pathname==='/title/'+slug;
const setStatus=value=>{if(isActive())status.textContent=value;};
const setQuality=q=>{
 if(!qualities.includes(q))return;
 const position=video.currentTime||0,wasPlaying=!video.paused;
 selected=q;
 for(const button of qualityRow.children){
  const active=button.textContent===q;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 }
 const suffix='?quality='+encodeURIComponent(q);
 video.pause();
 video.src=streamBase+'/stream/'+slug+suffix;
 video.load();
 download.href=streamBase+'/download/'+slug+suffix;
 download.removeAttribute('download');

 const file=m.qualities?.[q]||m;
 const format=String(file.file_name||'').split('.').pop().toLowerCase();
 setStatus(format==='mkv'?'MKV may not play in this browser. Download and open with VLC if needed.':'Selected '+q+'. Press play to stream.');
 if(position>0)video.addEventListener('loadedmetadata',()=>{if(Number.isFinite(video.duration)&&position<video.duration)video.currentTime=position;if(wasPlaying)video.play().catch(()=>{});},{once:true});
};
for(const q of qualities){
 const button=el('button','filmgo-quality-button',q);
 button.type='button';
 button.addEventListener('click',()=>setQuality(q));
 qualityRow.append(button);
}
video.addEventListener('error',()=>setStatus('Playback failed. Try downloading this quality and opening it with VLC.'));
video.addEventListener('stalled',()=>setStatus('Buffering video…'));
video.addEventListener('playing',()=>setStatus('Now playing.'));
video.addEventListener('waiting',()=>setStatus('Buffering…'));
fetch('/api/stream-availability/'+slug,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
 if(!isActive())return;
 if(!data?.available){setStatus('Streaming is currently unavailable.');actions.classList.add('hidden');qualityRow.classList.add('hidden');return;}
 if(!selected){setStatus('No quality available.');return;}
 setQuality(selected);
}).catch(()=>{if(isActive()&&selected){setQuality(selected);setStatus('Availability check failed. You can still try streaming or downloading.');}});
document.title=m.title+' — FilmGo';}function route(){const match=location.pathname.match(/^\/title\/([^/]+)\/?$/);if(match){const m=movies.find(x=>x.slug_id===decodeURIComponent(match[1])||x.id===decodeURIComponent(match[1]));home.classList.add('hidden');detail.classList.remove('hidden');if(m)showDetail(m);else{$('detail-content').replaceChildren(el('p','text-zinc-400','Movie not found.'));document.title='Movie not found — FilmGo';}}else{home.classList.remove('hidden');detail.classList.add('hidden');document.title='FilmGo — Explore';if(catalogLoaded)render();}window.scrollTo(0,0);}search.addEventListener('input',()=>{page=1;render();});for(const select of [yearFilter,genreFilter,sortFilter])select.addEventListener('change',()=>{page=1;render();});window.addEventListener('popstate',route);$('detail-back').addEventListener('click',e=>{e.preventDefault();history.pushState({},'','/');route();});skeleton();
let catalogFingerprint='',catalogLoading=false;
async function refreshCatalog(){
 if(catalogLoading||document.hidden)return;
 catalogLoading=true;
 try{
  const response=await fetch('/movies.json',{cache:'no-store'});
  if(!response.ok)throw Error('Catalog unavailable');
  const data=await response.json();
  if(!Array.isArray(data.movies))throw Error('Invalid catalog');
  const fingerprint=JSON.stringify(data.movies.map(m=>[m.slug_id,m.title,m.poster,m.file_size,m.metadata_status,JSON.stringify(m.qualities)]));
  if(fingerprint!==catalogFingerprint||!catalogLoaded){
   catalogFingerprint=fingerprint;movies=data.movies;catalogLoaded=true;updateFilters();
   if(!location.pathname.startsWith('/title/'))render();
   else if(!document.querySelector('#detail-content video'))route();
  }
 }catch(err){
  if(!catalogLoaded){$('movie-count').textContent='Unable to load movies. Retrying…';}
 }finally{catalogLoading=false;}
}
route();void refreshCatalog();
setInterval(()=>{void refreshCatalog();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCatalog();});
// Resolve the existing server session before showing the account control.
// No localStorage login hint is trusted as authentication.
(async()=>{
 const link=document.getElementById('catalog-account-link');
 if(!link)return;
 const guest=()=>{link.href='/profile';link.classList.remove('catalog-account-avatar');link.replaceChildren(document.createTextNode('Sign in'));link.removeAttribute('title');link.setAttribute('aria-label','Sign in');link.setAttribute('aria-busy','false');};
 try{
  const response=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok){guest();return;}
  const user=await response.json();
  if(!user.number){guest();return;}
  link.href='/profile';link.classList.add('catalog-account-avatar');
  link.replaceChildren(document.createTextNode((user.name||user.number||'?').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()));
  link.setAttribute('aria-label','Open profile');link.title=user.name||'My profile';
  link.setAttribute('aria-busy','false');
  const cacheKey='filmgo-avatar:'+user.number;
  let avatar=null;
  try{avatar=sessionStorage.getItem(cacheKey);}catch{}
  if(!avatar){
   try{
    const result=await fetch('/api/avatar',{credentials:'same-origin',cache:'no-store'});
    if(result.ok){const data=await result.json();if(typeof data.url==='string'&&data.url.startsWith('https://')){avatar=data.url;try{sessionStorage.setItem(cacheKey,avatar);}catch{}}}
   }catch{}
  }
  if(avatar){
   const img=document.createElement('img');img.alt='';img.className='catalog-avatar-image';img.referrerPolicy='no-referrer';img.decoding='async';
   img.onerror=()=>img.remove();img.src=avatar;link.append(img);
  }
 }catch{guest();}
})();
