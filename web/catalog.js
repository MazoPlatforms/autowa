function actionIcon(kind){
 const paths={download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',whatsapp:'M20.52 3.48A11.87 11.87 0 0 0 12.05 0C5.5 0 .16 5.34.15 11.9c0 2.1.55 4.14 1.6 5.94L.05 24l6.32-1.66a11.9 11.9 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9a11.82 11.82 0 0 0-3.43-8.41ZM12.06 21.8a9.88 9.88 0 0 1-5.03-1.38l-.36-.21-3.75.98 1-3.65-.24-.38a9.85 9.85 0 0 1-1.52-5.26c0-5.45 4.44-9.89 9.9-9.89a9.8 9.8 0 0 1 7 2.9 9.83 9.83 0 0 1 2.89 7c0 5.45-4.44 9.89-9.89 9.89Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z',telegram:'M21.94 4.66c.3-1.45-.52-2.02-1.69-1.6L2.07 10.1c-1.24.49-1.22 1.18-.22 1.49l4.66 1.46L17.3 6.24c.51-.31.97-.14.59.2l-8.74 7.89-.33 4.96c.48 0 .69-.22.95-.48l2.28-2.22 4.75 3.51c.88.49 1.51.24 1.73-.82l3.41-14.62Z'};
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','17');svg.setAttribute('height','17');svg.setAttribute('fill',kind==='download'?'none':'currentColor');svg.setAttribute('stroke',kind==='download'?'currentColor':'none');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}
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
  a.append(wrap,el('h3','mt-3 truncate text-sm font-semibold text-zinc-100',m.title),el('p','mt-1 text-xs text-zinc-500',String(m.year)));
  a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState({},'',a.href);route();});
  grid.append(a);
 }
 renderPagination(rows.length);
}
function showDetail(m){const root=$('detail-content');root.replaceChildren();const layout=el('div','detail-hero');layout.append(image(m,'detail-poster'));const info=el('div');info.append(el('p','mb-2 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500','MOVIE DETAILS'),el('h1','text-2xl font-extrabold leading-tight tracking-tight sm:text-5xl',m.title),el('p','mt-3 text-sm text-zinc-400',[m.year,m.runtime].filter(Boolean).join(' · ')));if(m.imdb_rating)info.append(el('p','mt-3 text-sm font-semibold text-zinc-200','★ IMDb '+m.imdb_rating));if(m.genre?.length)info.append(el('p','mt-3 text-sm text-zinc-400',m.genre.join(' · ')));layout.append(info);root.append(layout);const body=el('div','mt-9 max-w-3xl border-t border-zinc-800 pt-8');body.append(el('h2','text-lg font-bold','Overview'),el('p','mt-3 text-sm leading-7 text-zinc-400',m.plot||'No synopsis available yet.'));if(m.director)body.append(el('p','mt-5 text-sm text-zinc-400','Director: '+m.director));if(m.cast?.length)body.append(el('p','mt-2 text-sm text-zinc-400','Cast: '+m.cast.join(', ')));root.append(body);
const section=el('section','mt-9 max-w-3xl border-t border-zinc-800 pt-8 filmgo-watch');
section.append(el('h2','mb-4 text-lg font-bold','Watch & download'));
const video=el('video','filmgo-player');
video.controls=true;video.preload='metadata';video.playsInline=true;video.setAttribute('playsinline','');video.style.backgroundColor='#09090b';
video.setAttribute('controlsList','nodownload');
video.removeAttribute('poster');video.setAttribute('aria-label','FilmGo built-in movie player');
section.append(video);
const status=el('p','filmgo-stream-status','Checking streaming availability…');
status.setAttribute('role','status');
const actions=el('div','filmgo-player-actions');
const download=el('a','filmgo-download-button','Download');
download.setAttribute('download','');
download.setAttribute('aria-label','Download '+m.title);
const whatsapp=el('button','filmgo-open-button','WhatsApp');
whatsapp.type='button';whatsapp.addEventListener('click',()=>confirmMovieRequest(m,'whatsapp'));
const telegram=el('button','filmgo-open-button','Telegram');
telegram.type='button';telegram.addEventListener('click',()=>confirmMovieRequest(m,'telegram'));
for(const [button,kind] of [[download,'download'],[whatsapp,'whatsapp'],[telegram,'telegram']]){button.prepend(actionIcon(kind));button.style.gap='8px';}
actions.append(download,whatsapp,telegram);
section.append(actions,status);
root.append(section);
const slug=encodeURIComponent(m.slug_id||'');
const streamBase='';
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
 video.src=streamBase+'/api/stream/'+slug+suffix;
 video.load();
 download.href=streamBase+'/api/download/'+slug+suffix;
 download.removeAttribute('download');

 const file=m.qualities?.[q]||m;
 const format=String(file.file_name||'').split('.').pop().toLowerCase();
 setStatus(format==='mkv'?'MKV playback depends on your browser and video codec.':'Press play to watch.');
 if(position>0)video.addEventListener('loadedmetadata',()=>{if(Number.isFinite(video.duration)&&position<video.duration)video.currentTime=position;if(wasPlaying)video.play().catch(()=>{});},{once:true});
};
for(const q of qualities){
 const button=el('button','filmgo-quality-button',q);
 button.type='button';
 button.addEventListener('click',()=>setQuality(q));
 qualityRow.append(button);
}
video.addEventListener('error',()=>{const file=m.qualities?.[selected]||m;const ext=String(file.file_name||'').toLowerCase();setStatus(/\\.mkv(?:$|\\?)/.test(ext)?'This MKV video cannot play directly in this browser. Browser-compatible streaming requires server-side conversion. Download to watch in a compatible player.':'Playback failed. Please retry or download the movie.');});
video.addEventListener('stalled',()=>setStatus('Buffering video…'));
video.addEventListener('loadedmetadata',()=>setStatus('Ready to play.'));
video.addEventListener('canplay',()=>setStatus('Ready to play.'));
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
