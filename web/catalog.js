const $=id=>document.getElementById(id);const grid=$('catalog-grid'),search=$('catalog-search'),empty=$('catalog-empty'),home=$('catalog-home'),detail=$('catalog-detail');let movies=[];const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};const FALLBACK_POSTER='https://i.ibb.co/TMJ6YCC4/IMG-33a2f581-8ff4-4a5e-9e64-e43c900000c2.png';const poster=m=>m.poster&&/^https:\/\//.test(m.poster)?m.poster:FALLBACK_POSTER;function image(m,cls){const img=el('img',cls);img.alt=m.title+' poster';img.loading='lazy';img.src=poster(m);img.onerror=()=>{if(img.src!==FALLBACK_POSTER){img.src=FALLBACK_POSTER;}else{img.onerror=null;img.removeAttribute('src');}};return img;}function skeleton(){grid.replaceChildren();for(let i=0;i<8;i++){const box=el('div');box.append(el('div','shimmer aspect-[2/3] rounded-2xl'),el('div','shimmer mt-3 h-4 w-3/4 rounded-md'),el('div','shimmer mt-2 h-3 w-1/2 rounded-md'));grid.append(box);}}const PAGE_SIZE=20;let page=1,catalogLoaded=false;
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
function showDetail(m){const root=$('detail-content');root.replaceChildren();const layout=el('div','detail-hero');layout.append(image(m,'detail-poster'));const info=el('div');info.append(el('p','mb-2 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500','MOVIE DETAILS'),el('h1','text-2xl font-extrabold leading-tight tracking-tight sm:text-5xl',m.title),el('p','mt-3 text-sm text-zinc-400',[m.year,m.runtime,m.quality].filter(Boolean).join(' · ')));if(m.imdb_rating)info.append(el('p','mt-3 text-sm font-semibold text-zinc-200','★ IMDb '+m.imdb_rating));if(m.genre?.length)info.append(el('p','mt-3 text-sm text-zinc-400',m.genre.join(' · ')));layout.append(info);root.append(layout);const body=el('div','mt-9 max-w-3xl border-t border-zinc-800 pt-8');body.append(el('h2','text-lg font-bold','Overview'),el('p','mt-3 text-sm leading-7 text-zinc-400',m.plot||'No synopsis available yet.'));if(m.director)body.append(el('p','mt-5 text-sm text-zinc-400','Director: '+m.director));if(m.cast?.length)body.append(el('p','mt-2 text-sm text-zinc-400','Cast: '+m.cast.join(', ')));const a=el('a','mt-8 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 hover:bg-zinc-200','Request via WhatsApp');a.href='/request';body.append(a);root.append(body);
const section=el('section','mt-9 max-w-3xl border-t border-zinc-800 pt-8');
section.append(el('h2','mb-4 text-lg font-bold','Watch movie'));
const video=el('video','w-full rounded-xl bg-black');
video.controls=true;video.preload='metadata';video.playsInline=true;
video.removeAttribute('poster');
section.append(video);
video.addEventListener('error',()=>{status.textContent='Playback failed. The video format may be unsupported or the Telegram media stream may have stopped.';});
video.addEventListener('stalled',()=>{status.textContent='Video stalled while loading. Check the Telegram streaming connection.';});
const status=el('p','mt-3 text-xs text-zinc-500','Checking playback availability…');
section.append(status);
root.append(section);
fetch('/api/stream-availability/'+encodeURIComponent(m.slug_id||''),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
 if(!root.isConnected||location.pathname!=='/title/'+encodeURIComponent(m.slug_id))return;
 if(data?.available){
  video.src='/api/stream/'+encodeURIComponent(m.slug_id);
  status.textContent=data.format==='mkv'?'This is an MKV file. Many mobile browsers cannot decode MKV video. Use a compatible external player or provide an MP4 (H.264/AAC) source.':data.format==='unknown'?'Video format is unknown. Playback depends on the file container and codecs.':'Press play to stream. Playback requires browser-compatible video codecs.';
  const open=el('a','mt-4 inline-flex rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-100','Open video');
  open.href=video.src;open.target='_blank';open.rel='noopener';section.append(open);
 }else{status.textContent='Streaming is not available for this title.';}
}).catch(()=>{status.textContent='Streaming availability could not be checked.';});
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
  const fingerprint=JSON.stringify(data.movies.map(m=>[m.slug_id,m.title,m.poster,m.file_size,m.metadata_status]));
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
 const guest=()=>{link.href='/request';link.classList.remove('catalog-account-avatar');link.replaceChildren(document.createTextNode('Sign in'));link.removeAttribute('title');link.setAttribute('aria-label','Sign in');link.setAttribute('aria-busy','false');};
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
