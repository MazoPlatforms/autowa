const $=id=>document.getElementById(id);const grid=$('catalog-grid'),search=$('catalog-search'),empty=$('catalog-empty'),home=$('catalog-home'),detail=$('catalog-detail');let movies=[];const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};const poster=m=>m.poster&&/^https:\/\//.test(m.poster)?m.poster:null;function image(m,cls){const img=el('img',cls);img.alt=m.title+' poster';img.loading='lazy';if(poster(m))img.src=poster(m);img.onerror=()=>{img.removeAttribute('src');img.onerror=null};return img;}function skeleton(){grid.replaceChildren();for(let i=0;i<8;i++){const box=el('div');box.append(el('div','shimmer aspect-[2/3] rounded-2xl'),el('div','shimmer mt-3 h-4 w-3/4 rounded-md'),el('div','shimmer mt-2 h-3 w-1/2 rounded-md'));grid.append(box);}}function render(){const q=search.value.trim().toLowerCase();const rows=movies.filter(m=>(m.title+' '+m.year+' '+(m.genre||[]).join(' ')).toLowerCase().includes(q));grid.replaceChildren();$('movie-count').textContent=rows.length+' '+(rows.length===1?'title':'titles');empty.classList.toggle('hidden',rows.length>0);empty.textContent=movies.length?'No matching movies found.':'No movies available yet.';for(const m of rows){const a=el('a','movie-card group block min-w-0');a.href='/title/'+encodeURIComponent(m.slug_id||m.id);const wrap=el('div','poster-wrap');wrap.append(image(m,'poster'));const rating=m.imdb_rating&&m.imdb_rating!=='N/A'?el('span','absolute bottom-2 left-2 rounded-md bg-zinc-950/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur','★ '+m.imdb_rating):null;if(rating)wrap.append(rating);a.append(wrap,el('h3','mt-3 truncate text-sm font-semibold text-zinc-100',m.title),el('p','mt-1 text-xs text-zinc-500',m.year+' · '+m.quality));a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState({},'',a.href);route();});grid.append(a);}}function showDetail(m){const root=$('detail-content');root.replaceChildren();const layout=el('div','detail-hero');layout.append(image(m,'detail-poster'));const info=el('div');info.append(el('p','mb-2 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500','MOVIE DETAILS'),el('h1','text-2xl font-extrabold leading-tight tracking-tight sm:text-5xl',m.title),el('p','mt-3 text-sm text-zinc-400',[m.year,m.runtime,m.quality].filter(Boolean).join(' · ')));if(m.imdb_rating)info.append(el('p','mt-3 text-sm font-semibold text-zinc-200','★ IMDb '+m.imdb_rating));if(m.genre?.length)info.append(el('p','mt-3 text-sm text-zinc-400',m.genre.join(' · ')));layout.append(info);root.append(layout);const body=el('div','mt-9 max-w-3xl border-t border-zinc-800 pt-8');body.append(el('h2','text-lg font-bold','Overview'),el('p','mt-3 text-sm leading-7 text-zinc-400',m.plot||'No synopsis available yet.'));if(m.director)body.append(el('p','mt-5 text-sm text-zinc-400','Director: '+m.director));if(m.cast?.length)body.append(el('p','mt-2 text-sm text-zinc-400','Cast: '+m.cast.join(', ')));const a=el('a','mt-8 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 hover:bg-zinc-200','Request via WhatsApp');a.href='/request';body.append(a);root.append(body);
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
document.title=m.title+' — FilmGo';}function route(){const match=location.pathname.match(/^\/title\/([^/]+)\/?$/);if(match){const m=movies.find(x=>x.slug_id===decodeURIComponent(match[1])||x.id===decodeURIComponent(match[1]));home.classList.add('hidden');detail.classList.remove('hidden');if(m)showDetail(m);else{$('detail-content').replaceChildren(el('p','text-zinc-400','Movie not found.'));document.title='Movie not found — FilmGo';}}else{home.classList.remove('hidden');detail.classList.add('hidden');document.title='FilmGo — Explore';render();}window.scrollTo(0,0);}search.addEventListener('input',render);window.addEventListener('popstate',route);$('detail-back').addEventListener('click',e=>{e.preventDefault();history.pushState({},'','/');route();});skeleton();
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
  if(fingerprint!==catalogFingerprint){
   catalogFingerprint=fingerprint;movies=data.movies;
   if(!location.pathname.startsWith('/title/'))render();
   else if(!document.querySelector('#detail-content video'))route();
  }
 }catch(err){
  if(!catalogFingerprint){grid.replaceChildren();empty.textContent='Movie catalog is temporarily unavailable.';empty.classList.remove('hidden');}
 }finally{catalogLoading=false;}
}
route();void refreshCatalog();
setInterval(()=>{void refreshCatalog();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCatalog();});