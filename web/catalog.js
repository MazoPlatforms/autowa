const fontStylesheet=document.createElement('link');fontStylesheet.rel='stylesheet';fontStylesheet.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';document.head.append(fontStylesheet);
function actionIcon(kind){
 const paths={download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',whatsapp:'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z',telegram:'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'};
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','17');svg.setAttribute('height','17');svg.setAttribute('fill',kind==='download'?'none':'currentColor');svg.setAttribute('stroke',kind==='download'?'currentColor':'none');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}
function playerIcon(kind){
 const paths={play:'M8 5v14l11-7L8 5Z',pause:'M7 5h3v14H7V5Zm7 0h3v14h-3V5Z',settings:'M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98L14.5 2.42C14.47 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.5.42L9.12 5.07c-.61.25-1.18.59-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z',fullscreen:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',close:'M6 6l12 12M18 6 6 18',pip:'M4 6h16v12H4zM12 12h6v4h-6z',speed:'M4 14h16M7 10h10M10 6h4',audio:'M4 10v4h3l5 3V7l-5 3H4Zm12 1a3 3 0 0 1 0 2M18 8a6 6 0 0 1 0 8',subtitles:'M4 6h16v12H4zM7 14h4m2 0h4M7 10h10',volume:'M4 10v4h3l5 3V7l-5 3H4Z',quality:'M4 6h16v12H4zM8 10h8M8 14h5'};
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','17');svg.setAttribute('height','17');svg.setAttribute('fill',kind==='play'||kind==='pause'||kind==='settings'?'currentColor':'none');svg.setAttribute('stroke',kind==='play'||kind==='pause'||kind==='settings'?'none':'currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}
function confirmMovieRequest(movie,channel){
 const overlay=el('div','filmgo-sheet-overlay');const sheet=el('div','filmgo-sheet');
 sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
 sheet.append(el('h2','','Confirm movie request'),el('p','filmgo-sheet-description',movie.title+' ('+movie.year+') via '+(channel==='telegram'?'Telegram':'WhatsApp')+'? Daily tokens are charged by file size and delivery method. Free accounts receive 50 tokens per UTC day.'));
 const buttons=el('div','filmgo-sheet-buttons');
 const cancel=el('button','filmgo-open-button','Cancel');const confirm=el('button','filmgo-download-button','Confirm');
 const close=()=>{document.removeEventListener('keydown',esc);overlay.remove();};
 const esc=e=>{if(e.key==='Escape')close();};
 cancel.addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 confirm.addEventListener('click',async()=>{
  confirm.disabled=true;confirm.textContent='Preparing…';
  try{
   if(channel==='telegram'){
    const response=await fetch('/api/telegram-link',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug_id:movie.slug_id})});
    if(response.status===401){close();location.href='/profile?return='+encodeURIComponent(location.pathname);return;}
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to create Telegram link');
    close();location.href=data.url;return;
   }
   const response=await fetch('/api/request',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({movie_id:movie.telegram_message_id,rights_confirmed:true})});
   const data=await response.json();if(response.status===401){close();location.href='/profile?return='+encodeURIComponent(location.pathname);return;}
   if(!response.ok)throw Error(data.error||'Request failed');
   sheet.replaceChildren(el('h2','','Request received'),el('p','filmgo-sheet-description','Your WhatsApp movie request has been queued.'));
   const done=el('button','filmgo-download-button','Done');done.addEventListener('click',close);sheet.append(done);
  }catch(err){confirm.disabled=false;confirm.textContent='Try again';sheet.querySelector('.filmgo-sheet-error')?.remove();sheet.append(el('p','filmgo-sheet-error',err.message));}
 });
 buttons.append(cancel,confirm);sheet.append(buttons);overlay.append(sheet);document.body.append(overlay);document.addEventListener('keydown',esc);cancel.focus();
}
const $=id=>document.getElementById(id);const grid=$('catalog-grid'),search=$('catalog-search'),empty=$('catalog-empty'),home=$('catalog-home'),detail=$('catalog-detail');let movies=[];const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};const FALLBACK_POSTER='https://i.ibb.co/TMJ6YCC4/IMG-33a2f581-8ff4-4a5e-9e64-e43c900000c2.png';const poster=m=>m.poster&&(/^https:\/\//.test(m.poster)||/^\/posters\/[a-f0-9]{24}\.jpg$/.test(m.poster))?m.poster:FALLBACK_POSTER;function startPoster(img){const source=img.dataset.posterSrc;if(!source)return;delete img.dataset.posterSrc;img.loading='eager';img.src=source;}const posterObserver='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;posterObserver.unobserve(entry.target);startPoster(entry.target);}},{rootMargin:'1600px 0px'}):null;function image(m,cls,eager=false,priority=false){const img=el('img',cls);img.alt='';img.loading=eager?'eager':'lazy';img.decoding='async';img.classList.add('poster-loading');if(priority)img.fetchPriority='high';img.addEventListener('load',()=>{img.classList.remove('poster-loading');img.classList.add('poster-loaded');},{once:true});img.onerror=()=>{if(img.src!==FALLBACK_POSTER){img.src=FALLBACK_POSTER;}else{img.onerror=null;img.removeAttribute('src');img.classList.remove('poster-loading');img.classList.add('poster-failed');}};img.dataset.posterSrc=poster(m);if(eager||!posterObserver)startPoster(img);else posterObserver.observe(img);return img;}function skeleton(){grid.replaceChildren();for(let i=0;i<8;i++){const box=el('div');box.append(el('div','shimmer aspect-[2/3] rounded-2xl'),el('div','shimmer mt-3 h-4 w-3/4 rounded-md'),el('div','shimmer mt-2 h-3 w-1/2 rounded-md'));grid.append(box);}}const PAGE_SIZE=()=>window.matchMedia('(min-width: 768px)').matches?24:20;let page=1,catalogLoaded=false,searchSuggestions=[],suggestionsInitialized=false;
const yearFilter=$('filter-year'),genreFilter=$('filter-genre'),sortFilter=$('filter-sort'),pagination=$('catalog-pagination');let updatingFilters=false;
// Accessible custom popovers; native selects remain as the state source.
function initCustomFilters(){
 const filters=[yearFilter,genreFilter,sortFilter];
 const closeAll=()=>{for(const select of filters){const box=select.closest('.catalog-filter');box.classList.remove('open');box.querySelector('.filter-trigger').setAttribute('aria-expanded','false');}};
 for(const select of filters){
  const box=select.closest('.catalog-filter');
  select.classList.add('visually-hidden-select');
  const trigger=el('button','filter-trigger');trigger.type='button';trigger.setAttribute('aria-label',select.getAttribute('aria-label')||'Filter options');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
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
 updatingFilters=true;yearFilter.value=years.includes(oldYear)?oldYear:'';genreFilter.value=genres.includes(oldGenre)?oldGenre:'';
 yearFilter.dispatchEvent(new Event('change'));genreFilter.dispatchEvent(new Event('change'));
 updatingFilters=false;
}
function renderPagination(total){
 pagination.replaceChildren();
 const pageSize=PAGE_SIZE(),pages=Math.ceil(total/pageSize);
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
 const searching=location.pathname==='/search',query=search.value.trim(),q=query.toLowerCase(),year=yearFilter.value,genre=genreFilter.value;
 if(searching&&!query&&!suggestionsInitialized){const pool=movies.slice();for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}searchSuggestions=pool.slice(0,8);suggestionsInitialized=true;}
 const rows=searching&&!query?searchSuggestions:movies.filter(m=>{
  const genres=Array.isArray(m.genre)?m.genre:typeof m.genre==='string'?m.genre.split(','):[];
  return (!q||(String(m.title||'')+' '+m.year+' '+genres.join(' ')).toLowerCase().includes(q))
   &&(searching||!year||String(m.year)===year)
   &&(searching||!genre||genres.some(g=>String(g).trim().toLowerCase()===genre.toLowerCase()));
 });
 const rating=m=>{const n=Number(m.imdb_rating);return Number.isFinite(n)?n:-1;};
 if(!searching||query)rows.sort((a,b)=>{
  switch(sortFilter.value){
   case 'year-asc':return (Number(a.year)||0)-(Number(b.year)||0)||String(a.title).localeCompare(String(b.title));
   case 'year-desc':return (Number(b.year)||0)-(Number(a.year)||0)||String(a.title).localeCompare(String(b.title));
   case 'title-asc':return String(a.title).localeCompare(String(b.title));
   case 'title-desc':return String(b.title).localeCompare(String(a.title));
   case 'rating-desc':return rating(b)-rating(a)||String(a.title).localeCompare(String(b.title));
   default:{const latestId=movie=>Math.max(Number(movie.telegram_message_id)||0,...Object.values(movie.qualities||{}).map(file=>Number(file.telegram_message_id)||0));return latestId(b)-latestId(a)||String(a.title).localeCompare(String(b.title));}
  }
 });
 const pageSize=PAGE_SIZE();
 page=Math.max(1,Math.min(page,Math.ceil(rows.length/pageSize)||1));
 posterObserver?.disconnect();grid.replaceChildren();
 $('movie-count').textContent=searching&&!query?'':rows.length+' '+(rows.length===1?'title':'titles');
 $('catalog-results-title').textContent=searching?(query?'Search results':'Suggestions'):'All movies';
 empty.classList.toggle('hidden',rows.length>0);
 empty.textContent=searching?'No movies match your search.':movies.length?'No movies match your filters.':'No movies available yet.';
 const visibleRows=rows.slice((page-1)*pageSize,page*pageSize);
 const eagerCount=window.matchMedia('(min-width: 1280px)').matches?6:window.matchMedia('(min-width: 768px)').matches?4:2;
 for(const [visibleIndex,m] of visibleRows.entries()){
  const a=el('a','movie-card group block min-w-0'+(searching?' search-result-card':''));a.href='/title/'+encodeURIComponent(m.slug_id||m.id);
  const wrap=el('div','poster-wrap');wrap.append(image(m,'poster',visibleIndex<eagerCount,visibleIndex===0));
  const badge=!searching&&m.imdb_rating&&m.imdb_rating!=='N/A'?el('span','absolute bottom-2 left-2 rounded-md bg-zinc-950/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur','★ '+m.imdb_rating):null;
  if(badge)wrap.append(badge);
  const info=el('div','search-result-info');info.append(el('h3','truncate text-sm font-semibold text-zinc-100',m.title));
  if(searching){
   const genres=Array.isArray(m.genre)?m.genre:typeof m.genre==='string'?m.genre.split(','):[];
   const facts=el('p','search-result-facts');facts.append(el('span','',''+(m.year||'Year unavailable')));
   if(m.runtime)facts.append(el('span','','· '+m.runtime));
   if(m.imdb_rating&&m.imdb_rating!=='N/A')facts.append(el('span','search-result-rating','★ '+m.imdb_rating));
   info.append(facts);
   const genreText=genres.map(value=>String(value).trim()).filter(Boolean).join(' · ');
   if(genreText)info.append(el('p','search-result-genres',genreText));
   if(m.director)info.append(el('p','search-result-director','Directed by '+m.director));
   if(Array.isArray(m.cast)&&m.cast.length)info.append(el('p','search-result-cast','Cast: '+m.cast.slice(0,4).join(', ')));
   if(m.plot)info.append(el('p','search-result-plot',m.plot));
  }else info.append(el('p','mt-1 text-xs text-zinc-500',String(m.year)));
  a.append(wrap,info);
  a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState({},'',a.href);route();});
  grid.append(a);
 }
 renderPagination(searching&&!query?0:rows.length);
}
function showDetail(m){const root=$('detail-content');root.replaceChildren();const layout=el('div','detail-hero');layout.append(image(m,'detail-poster',true,true));const info=el('div');info.append(el('p','mb-2 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500','MOVIE DETAILS'),el('h1','text-2xl font-extrabold leading-tight tracking-tight sm:text-5xl',m.title),el('p','mt-3 text-sm text-zinc-400',[m.year,m.runtime].filter(Boolean).join(' · ')));if(m.imdb_rating)info.append(el('p','mt-3 text-sm font-semibold text-zinc-200','★ IMDb '+m.imdb_rating));if(m.genre?.length)info.append(el('p','mt-3 text-sm text-zinc-400',m.genre.join(' · ')));layout.append(info);root.append(layout);const body=el('div','mt-9 max-w-3xl border-t border-zinc-800 pt-8');body.append(el('h2','text-lg font-bold','Overview'),el('p','mt-3 text-sm leading-7 text-zinc-400',m.plot||'No synopsis available yet.'));if(m.director)body.append(el('p','mt-5 text-sm text-zinc-400','Director: '+m.director));if(m.cast?.length)body.append(el('p','mt-2 text-sm text-zinc-400','Cast: '+m.cast.join(', ')));root.append(body);
const section=el('section','mt-9 max-w-3xl border-t border-zinc-800 pt-8 filmgo-watch');
section.append(el('h2','mb-4 text-lg font-bold','Watch & download'));
const accessNotice=el('div','filmgo-token-notice filmgo-signin-notice');accessNotice.setAttribute('role','status');accessNotice.setAttribute('aria-live','polite');section.append(accessNotice);
const player=el('div','filmgo-player-shell');player.tabIndex=0;player.setAttribute('aria-label','Movie player. Single tap shows or hides controls, double tap pauses, Space plays or pauses, arrows seek, F toggles fullscreen.');
player.setAttribute('inert','');
const viewport=el('div','filmgo-player-viewport');
let video=el('video','filmgo-player');
video.preload='none';video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('controlsList','nodownload');
video.poster='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 9%22%3E%3Crect width=%2216%22 height=%229%22 fill=%22%2309090b%22/%3E%3C/svg%3E';video.setAttribute('aria-label','FilmGo built-in movie player');
const loadingOverlay=el('div','filmgo-loading-overlay');loadingOverlay.hidden=true;loadingOverlay.setAttribute('role','status');loadingOverlay.setAttribute('aria-live','polite');loadingOverlay.append(el('span','filmgo-loading-spinner'),el('span','filmgo-loading-label','Loading video…'));
const seekFeedback=el('div','filmgo-seek-feedback','');seekFeedback.setAttribute('aria-live','polite');seekFeedback.setAttribute('aria-atomic','true');
viewport.append(video,loadingOverlay,seekFeedback);
const controls=el('div','filmgo-controls');
const progress=el('input','filmgo-progress');progress.type='range';progress.min='0';progress.max='1000';progress.value='0';progress.setAttribute('aria-label','Seek');
const controlRow=el('div','filmgo-control-row');
const play=el('button','filmgo-control-button filmgo-play');play.type='button';play.setAttribute('aria-label','Play');play.append(playerIcon('play'));
const time=el('span','filmgo-time','00:00:00 / 00:00:00');
const settingsButton=el('button','filmgo-control-button filmgo-settings-toggle');settingsButton.type='button';settingsButton.setAttribute('aria-label','Player settings');settingsButton.setAttribute('aria-expanded','false');settingsButton.append(playerIcon('settings'));
const fullscreen=el('button','filmgo-control-button filmgo-fullscreen');fullscreen.type='button';fullscreen.setAttribute('aria-label','Full screen');fullscreen.append(playerIcon('fullscreen'));
const settingsPanel=el('div','filmgo-settings-panel');settingsPanel.hidden=true;settingsPanel.setAttribute('aria-label','Player settings');settingsPanel.setAttribute('role','group');
const settingsClose=el('button','filmgo-settings-close');settingsClose.type='button';settingsClose.setAttribute('aria-label','Close player settings');settingsClose.append(playerIcon('close'));settingsPanel.append(settingsClose);
const controlLeft=el('div','filmgo-control-left'),controlRight=el('div','filmgo-control-right');
controlLeft.append(play,time);controlRight.append(settingsButton,fullscreen);controlRow.append(controlLeft,controlRight);controls.append(progress,controlRow);player.append(viewport,settingsPanel,controls);section.append(player);
const makeSetting=(label,id)=>{const wrap=el('label','filmgo-setting');const iconKind=id==='filmgo-speed'?'speed':id==='filmgo-audio-track'?'audio':'subtitles';wrap.append(playerIcon(iconKind),el('span','',label));const select=el('select','filmgo-setting-select');select.id=id;wrap.append(select);settingsPanel.append(wrap);return select;};
const volumeWrap=el('label','filmgo-setting');volumeWrap.append(playerIcon('volume'),el('span','','Player volume'));const volume=el('input','filmgo-setting-range');volume.type='range';volume.min='0';volume.max='1';volume.step='0.01';volume.value='1';volume.setAttribute('aria-label','Player volume');volumeWrap.append(volume);settingsPanel.append(volumeWrap);
const pip=el('button','filmgo-settings-action');pip.type='button';pip.setAttribute('aria-label','Picture in picture');pip.append(playerIcon('pip'),el('span','', 'Picture in picture'));pip.disabled=!(document.pictureInPictureEnabled&&video.requestPictureInPicture);settingsPanel.append(pip);
const speedSelect=makeSetting('Playback speed','filmgo-speed');for(const rate of [0.25,0.5,0.75,1,1.25,1.5,1.75,2]){const option=el('option','',rate===1?'Normal':rate+'×');option.value=String(rate);if(rate===1)option.selected=true;speedSelect.append(option);}
speedSelect.addEventListener('change',()=>{video.playbackRate=Number(speedSelect.value);});
const audioSelect=makeSetting('Audio track','filmgo-audio-track');const subtitleSelect=makeSetting('Subtitles','filmgo-subtitles');
const status=el('p','filmgo-stream-status sr-only','');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
const actions=el('div','filmgo-player-actions');
actions.setAttribute('inert','');
const download=el('a','filmgo-download-button','Download');download.setAttribute('download','');download.setAttribute('aria-label','Download '+m.title);
const whatsapp=el('button','filmgo-open-button','WhatsApp');whatsapp.type='button';
const telegram=el('button','filmgo-open-button','Telegram');telegram.type='button';
for(const [button,kind] of [[download,'download'],[whatsapp,'whatsapp'],[telegram,'telegram']]){button.prepend(actionIcon(kind));button.style.gap='8px';}
actions.append(download,whatsapp,telegram);section.append(actions,status);root.append(section);
const slug=encodeURIComponent(m.slug_id||'');const qualities=Object.keys(m.qualities||{[m.quality]:m}).filter(Boolean).sort((a,b)=>parseInt(a)-parseInt(b));
let selected=qualities.find(q=>q.toLowerCase()==='720p')||qualities[0],activeQuality=null,stagedVideo=null;
const qualityRow=el('div','filmgo-quality-options');const qualityLabel=el('p','filmgo-quality-label');qualityLabel.append(playerIcon('quality'),el('span','', 'Quality'));
if(qualities.length>1)settingsPanel.prepend(qualityLabel,qualityRow);
for(const q of qualities){const button=el('button','filmgo-quality-button',q);button.type='button';button.addEventListener('click',()=>setQuality(q));qualityRow.append(button);}
const isActive=()=>root.isConnected&&location.pathname==='/title/'+slug;
let movieAccessState='checking';
const setMovieAccessState=state=>{
 movieAccessState=state;
 const locked=state!=='signed-in';
 player.toggleAttribute('inert',locked);actions.toggleAttribute('inert',locked);
 accessNotice.hidden=!locked;
 if(!locked)return;
 accessNotice.replaceChildren();
 const copy=el('div','filmgo-signin-copy');
 if(state==='checking')copy.append(el('strong','','Checking sign-in status'),el('span','','Sign in is required to use this movie’s player and actions.'));
 else if(state==='unavailable')copy.append(el('strong','','Unable to verify sign-in'),el('span','','Check your connection, then try again.'));
 else copy.append(el('strong','','Sign in required'),el('span','','Sign in before streaming, downloading, or requesting this movie through WhatsApp or Telegram.'));
 accessNotice.append(copy);
 if(state==='unavailable'){
  const retry=el('button','filmgo-signin-cta','Try again');retry.type='button';retry.addEventListener('click',checkMovieAccess);accessNotice.append(retry);
 }else if(state==='signed-out'){
  const signIn=el('a','filmgo-signin-cta','Sign in with WhatsApp');signIn.href='/profile?return='+encodeURIComponent(location.pathname);accessNotice.append(signIn);
 }
};
async function checkMovieAccess(){
 setMovieAccessState('checking');
 try{
  const response=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});
  if(!isActive())return;
  setMovieAccessState(response.status===401?'signed-out':response.ok?'signed-in':'unavailable');
 }catch{if(isActive())setMovieAccessState('unavailable');}
}
setMovieAccessState('checking');void checkMovieAccess();
download.addEventListener('click',event=>{
 event.preventDefault();
 if(movieAccessState==='signed-in'){location.href=download.href;return;}
 if(movieAccessState==='signed-out')location.href='/profile?return='+encodeURIComponent(location.pathname);
 else if(movieAccessState==='unavailable')void checkMovieAccess();
});
whatsapp.addEventListener('click',()=>{if(movieAccessState==='signed-in')confirmMovieRequest(m,'whatsapp');});
telegram.addEventListener('click',()=>{if(movieAccessState==='signed-in')confirmMovieRequest(m,'telegram');});
const setStatus=value=>{if(isActive())status.textContent=value;};
const setLoading=(value,show=true)=>{if(!isActive())return;loadingOverlay.hidden=!show;loadingOverlay.querySelector('.filmgo-loading-label').textContent=value||'';};
const formatTime=value=>{if(!Number.isFinite(value)||value<0)return '--:--:--';const total=Math.floor(value),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60;return String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');};
const updateControls=()=>{const duration=video.duration||0;time.textContent=formatTime(video.currentTime)+' / '+formatTime(duration);progress.value=String(duration?Math.round(video.currentTime/duration*1000):0);progress.style.setProperty('--progress',duration?((video.currentTime/duration)*100)+'%':'0%');play.replaceChildren(playerIcon(video.paused?'play':'pause'));play.setAttribute('aria-label',video.paused?'Play':'Pause');player.classList.toggle('is-playing',!video.paused);};
let tapTimer=0,lastTap=0,feedbackTimer=0,controlsTimer=0;
const showFeedback=message=>{seekFeedback.textContent=message;seekFeedback.classList.add('visible');clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>seekFeedback.classList.remove('visible'),650);};
const showControls=()=>{player.classList.remove('controls-hidden');clearTimeout(controlsTimer);if(!video.paused&&!settingsPanel.hidden)return;if(!video.paused)controlsTimer=setTimeout(()=>{if(settingsPanel.hidden)player.classList.add('controls-hidden');},3200);};
const toggleControls=()=>{if(!settingsPanel.hidden){settingsPanel.hidden=true;settingsButton.setAttribute('aria-expanded','false');player.classList.remove('settings-open');}else if(player.classList.contains('controls-hidden'))showControls();else player.classList.add('controls-hidden');};
settingsClose.addEventListener('click',()=>{settingsPanel.hidden=true;settingsButton.setAttribute('aria-expanded','false');player.classList.remove('settings-open');showControls();});
player.addEventListener('pointermove',showControls);player.addEventListener('pointerdown',showControls);
let volumeValue=1,audioContext=null,selectedAudioId='',selectedSubtitleId='off';const audioGains=new WeakMap(),trackListeners=new WeakSet();
const applyPlayerVolume=target=>{const node=audioGains.get(target);if(node)node.gain.gain.value=volumeValue;else{try{target.volume=volumeValue;target.muted=volumeValue===0;}catch{}}volume.value=String(volumeValue);};
const enableMobileVolume=target=>{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;try{if(!audioContext)audioContext=new AudioContextClass();if(!audioGains.has(target)){const source=audioContext.createMediaElementSource(target),gain=audioContext.createGain();source.connect(gain);gain.connect(audioContext.destination);audioGains.set(target,{source,gain});}audioContext.resume().catch(()=>{});target.volume=1;target.muted=false;applyPlayerVolume(target);}catch{applyPlayerVolume(target);}};
volume.addEventListener('input',()=>{volumeValue=Number(volume.value);applyPlayerVolume(video);});
const refreshTracks=()=>{
 const list=video.audioTracks||video.webkitAudioTracks||video.mozAudioTracks;const audioTracks=list?Array.from(list):[];if(selectedAudioId&&!audioTracks.some((track,index)=>(track.language||track.label||String(index))===selectedAudioId))selectedAudioId='';audioSelect.replaceChildren();const audioNone=el('option','',audioTracks.length?'Select audio track':'No audio tracks exposed by this browser');audioNone.value='';audioSelect.append(audioNone);audioSelect.disabled=!audioTracks.length;
 audioTracks.forEach((track,index)=>{const option=el('option','',track.label||track.language||'Audio '+(index+1));option.value=track.language||track.label||String(index);const enabled=selectedAudioId?option.value===selectedAudioId:!!track.enabled;option.selected=enabled;track.enabled=enabled;audioSelect.append(option);});audioSelect.onchange=()=>{selectedAudioId=audioSelect.value;audioTracks.forEach((track,index)=>{track.enabled=(track.language||track.label||String(index))===selectedAudioId;});};
 const textTracks=video.textTracks?Array.from(video.textTracks).filter(track=>['subtitles','captions'].includes(track.kind)):[];if(selectedSubtitleId!=='off'&&!textTracks.some((track,index)=>(track.language||track.label||String(index))===selectedSubtitleId))selectedSubtitleId='off';subtitleSelect.replaceChildren();const off=el('option','','Off');off.value='off';off.selected=selectedSubtitleId==='off';subtitleSelect.append(off);
 if(!textTracks.length){const unavailable=el('option','','No subtitle tracks exposed by this browser');unavailable.value='';unavailable.disabled=true;subtitleSelect.append(unavailable);subtitleSelect.value='off';subtitleSelect.disabled=true;}else{subtitleSelect.disabled=false;textTracks.forEach((track,index)=>{const option=el('option','',track.label||track.language||'Subtitle '+(index+1));option.value=track.language||track.label||String(index);option.selected=selectedSubtitleId===option.value||(!selectedSubtitleId&&track.mode==='showing');subtitleSelect.append(option);});}
 subtitleSelect.onchange=()=>{selectedSubtitleId=subtitleSelect.value;textTracks.forEach((track,index)=>{track.mode=selectedSubtitleId==='off'?'disabled':(track.language||track.label||String(index))===selectedSubtitleId?'showing':'disabled';});};
};
const registerTrackListeners=target=>{if(trackListeners.has(target))return;const list=target.audioTracks||target.webkitAudioTracks||target.mozAudioTracks;list?.addEventListener?.('addtrack',refreshTracks);list?.addEventListener?.('change',refreshTracks);target.textTracks?.addEventListener?.('addtrack',refreshTracks);trackListeners.add(target);};
const attachVideoListeners=target=>{
 registerTrackListeners(target);
 target.addEventListener('play',()=>{if(target!==video)return;enableMobileVolume(target);updateControls();showControls();});
 target.addEventListener('pause',()=>{if(target===video){updateControls();player.classList.remove('controls-hidden');}});
 for(const eventName of ['timeupdate','durationchange'])target.addEventListener(eventName,()=>{if(target===video)updateControls();});
 target.addEventListener('volumechange',()=>{if(target===video&&!audioGains.has(target)&&Number.isFinite(target.volume)){volumeValue=target.muted?0:target.volume;volume.value=String(volumeValue);}});
 target.addEventListener('loadedmetadata',()=>{if(target===video){registerTrackListeners(target);updateControls();refreshTracks();}});
 target.addEventListener('canplay',()=>{if(target===video&&!stagedVideo)setLoading('',false);});
 target.addEventListener('playing',()=>{if(target===video){setLoading('',false);updateControls();}});
 for(const eventName of ['waiting','stalled'])target.addEventListener(eventName,()=>{if(target===video)setLoading('Buffering…');});
 target.addEventListener('error',()=>{if(target===video){setLoading('',false);const file=m.qualities?.[selected]||m,ext=String(file.file_name||'').toLowerCase(),code=target.error?.code;setStatus(/\.mkv(?:$|\?)/.test(ext)?'This video is MKV, which this browser cannot decode. Download it to watch in a compatible player.':code===2?'The stream was interrupted. Check your connection and try again.':code===3||code===4?'This video format is not supported by your browser. Try another quality or download it.':'Playback failed. Please retry or download the movie.');}});
 target.addEventListener('pointerup',()=>{if(target!==video)return;const now=Date.now();if(now-lastTap<320){clearTimeout(tapTimer);lastTap=0;if(!target.paused){target.pause();showFeedback('Pause');}else showControls();return;}lastTap=now;clearTimeout(tapTimer);tapTimer=setTimeout(()=>{if(target===video)toggleControls();},320);});
};
attachVideoListeners(video);
play.addEventListener('click',()=>{if(movieAccessState!=='signed-in')return;if(video.paused){enableMobileVolume(video);video.play().catch(()=>{});}else video.pause();});
progress.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=video.duration*Number(progress.value)/1000;});
settingsButton.addEventListener('click',()=>{settingsPanel.hidden=!settingsPanel.hidden;settingsButton.setAttribute('aria-expanded',String(!settingsPanel.hidden));player.classList.toggle('settings-open',!settingsPanel.hidden);showControls();});
pip.addEventListener('click',async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await video.requestPictureInPicture();}catch{}});
const syncOrientation=async()=>{if(document.fullscreenElement===player){try{await screen.orientation?.lock?.('landscape');}catch{}}else{try{screen.orientation?.unlock?.();}catch{}}};
fullscreen.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen?.();else if(player.requestFullscreen){await player.requestFullscreen();await syncOrientation();}else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();}catch{}});
player.addEventListener('fullscreenchange',()=>{const active=document.fullscreenElement===player;fullscreen.setAttribute('aria-label',active?'Exit full screen':'Full screen');void syncOrientation();});
player.addEventListener('keydown',event=>{if(event.target.matches('input,select,button'))return;const key=event.key.toLowerCase();if(key===' '||key==='k'){event.preventDefault();if(video.paused){enableMobileVolume(video);video.play().catch(()=>{});}else video.pause();}else if(key==='arrowleft'||key==='arrowright'){event.preventDefault();const delta=key==='arrowleft'?-10:10;video.currentTime=Math.max(0,Math.min(video.duration||Infinity,video.currentTime+delta));showFeedback((delta<0?'−':'+')+'10 seconds');}else if(key==='f'){event.preventDefault();fullscreen.click();}else if(key==='m'){volumeValue=volumeValue===0?1:0;applyPlayerVolume(video);}else if(key==='['||key===']'){const rates=[.25,.5,.75,1,1.25,1.5,1.75,2],index=rates.indexOf(video.playbackRate),next=Math.max(0,Math.min(rates.length-1,index+(key==='['?-1:1)));video.playbackRate=rates[next];speedSelect.value=String(rates[next]);showFeedback(rates[next]+'×');}});
pip.title='Picture in picture';
const updateQualityButtons=()=>{for(const button of qualityRow.children){const q=button.textContent;button.classList.toggle('active',q===activeQuality);button.classList.toggle('pending',q===selected&&q!==activeQuality);button.setAttribute('aria-pressed',String(q===activeQuality));}};
const streamUrl=q=>'/api/stream/'+slug+'?quality='+encodeURIComponent(q);
const cancelStaging=()=>{if(stagedVideo){stagedVideo.pause();stagedVideo.removeAttribute('src');stagedVideo.load();stagedVideo.remove();stagedVideo=null;}};
const switchToStaged=(stage,q,wasPlaying)=>{if(stage!==stagedVideo)return;const desired=video.currentTime;if(Number.isFinite(desired)&&Math.abs((stage.currentTime||0)-desired)>2&&desired<(stage.duration||Infinity)){if(!stage.seeking){stage.currentTime=desired;stage.addEventListener('seeked',()=>switchToStaged(stage,q,wasPlaying),{once:true});}return;}if(stage.seeking||stage.readyState<2)return;const old=video;old.pause();const oldAudio=audioGains.get(old);if(oldAudio){oldAudio.source.disconnect();oldAudio.gain.disconnect();audioGains.delete(old);}stage.className='filmgo-player';stage.muted=false;stage.playbackRate=Number(speedSelect.value)||1;viewport.replaceChild(stage,old);video=stage;stagedVideo=null;activeQuality=q;attachVideoListeners(video);enableMobileVolume(video);refreshTracks();updateQualityButtons();setLoading('',false);updateControls();if(wasPlaying)video.play().catch(()=>{});};
const setQuality=q=>{if(movieAccessState!=='signed-in'||!qualities.includes(q))return;const targetUrl=streamUrl(q);selected=q;download.href='/api/download/'+slug+'?quality='+encodeURIComponent(q);download.removeAttribute('download');if(q===activeQuality){if(stagedVideo){cancelStaging();selected=activeQuality;updateQualityButtons();setLoading('',false);}return;}updateQualityButtons();cancelStaging();const file=m.qualities?.[q]||m,format=String(file.file_name||'').split('.').pop().toLowerCase();setStatus(format==='mkv'?'MKV playback depends on your browser and video codec.':'');
 if(!activeQuality||!video.currentSrc){activeQuality=q;updateQualityButtons();video.src=targetUrl;video.load();setLoading('Loading video…');return;}
 const old=video,position=old.currentTime||0,wasPlaying=!old.paused,stage=el('video','filmgo-player filmgo-staging-video');stage.preload='auto';stage.playsInline=true;stage.muted=true;stage.setAttribute('playsinline','');stage.setAttribute('controlsList','nodownload');stage.poster=video.poster;stage.src=targetUrl;stagedVideo=stage;viewport.append(stage);setLoading('Switching to '+q+'…');let canPlay=false;
 const maybeSwitch=()=>{canPlay=stage.readyState>=2;if(canPlay&&!stage.seeking)switchToStaged(stage,q,wasPlaying);};
 stage.addEventListener('loadedmetadata',()=>{if(stage!==stagedVideo)return;if(position>0&&position<stage.duration){stage.currentTime=position;stage.addEventListener('seeked',maybeSwitch,{once:true});}maybeSwitch();},{once:true});stage.addEventListener('canplay',maybeSwitch);stage.addEventListener('seeked',maybeSwitch);stage.addEventListener('error',()=>{if(stage!==stagedVideo)return;cancelStaging();selected=activeQuality;updateQualityButtons();setLoading('',false);setStatus('Could not switch quality. Playback continues at '+activeQuality+'.');},{once:true});stage.load();
};
fetch('/api/stream-availability/'+slug,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
 if(!isActive())return;
if(!data?.available){setStatus('Streaming is currently unavailable.');actions.classList.add('hidden');qualityRow.classList.add('hidden');if(data?.signed_in===false)setMovieAccessState('signed-out');return;}
 if(!selected){setStatus('No quality available.');return;}
 if(data.signed_in===false){setMovieAccessState('signed-out');return;}
 if(movieAccessState!=='signed-in')return;
 accessNotice.hidden=true;
 setQuality(selected);
}).catch(()=>{if(isActive()&&selected&&movieAccessState==='signed-in'){setQuality(selected);setStatus('Availability check failed. You can still try streaming or downloading.');}});
document.title=m.title+' — FilmGo';}function route(){
 const match=location.pathname.match(/^\/title\/([^/]+)\/?$/),searching=location.pathname==='/search';
 if(!searching){searchSuggestions=[];suggestionsInitialized=false;}
 if(searching&&!home.classList.contains('search-fullscreen'))home.scrollTop=0;
 $('catalog-back')?.classList.toggle('visible',!!match);
 home.classList.toggle('search-fullscreen',searching);
 document.body.classList.toggle('catalog-search-active',searching);
 $('catalog-search-close').hidden=!searching;
 if(match){document.body.classList.remove('catalog-search-active');home.classList.remove('search-fullscreen');const m=movies.find(x=>x.slug_id===decodeURIComponent(match[1])||x.id===decodeURIComponent(match[1]));home.classList.add('hidden');detail.classList.remove('hidden');if(m)showDetail(m);else if(!catalogLoaded){$('detail-content').replaceChildren(el('div','detail-loading','Loading movie details…'));document.title='Loading movie — FilmGo';}else{$('detail-content').replaceChildren(el('p','text-zinc-400','Movie not found.'));document.title='Movie not found — FilmGo';}}
 else{home.classList.remove('hidden');detail.classList.add('hidden');if(searching){const query=new URLSearchParams(location.search).get('q')||'';if(search.value!==query)search.value=query;document.title='Search — FilmGo';}else{search.value='';document.title='FilmGo — Explore';}if(catalogLoaded)render();}
 window.scrollTo(0,0);
}
search.addEventListener('focus',()=>{if(location.pathname!=='/search'&&!location.pathname.startsWith('/title/')){history.pushState({},'','/search?q='+encodeURIComponent(search.value));route();}});
search.addEventListener('input',()=>{page=1;if(location.pathname==='/search')history.replaceState({},'','/search?q='+encodeURIComponent(search.value));render();});
$('catalog-search-close').addEventListener('click',()=>{search.blur();searchSuggestions=[];suggestionsInitialized=false;history.replaceState({},'','/');route();});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&location.pathname==='/search'){$('catalog-search-close').click();}});
for(const select of [yearFilter,genreFilter,sortFilter])select.addEventListener('change',()=>{if(updatingFilters)return;page=1;render();});window.addEventListener('popstate',route);const desktopPagination=window.matchMedia('(min-width: 768px)');desktopPagination.addEventListener?.('change',()=>{page=1;render();});$('catalog-back')?.addEventListener('click',e=>{if(location.pathname.startsWith('/title/')){e.preventDefault();history.pushState({},'','/');route();}});skeleton();
let catalogEtag='',catalogLoading=false;
async function refreshCatalog(){
 if(catalogLoading||document.hidden)return;
 catalogLoading=true;
 try{
  const response=await fetch('/movies.json',{cache:'no-cache'});
  if(response.status===304)return;
  if(!response.ok)throw Error('Catalog unavailable');
  const etag=response.headers.get('ETag')||'';
  if(catalogLoaded&&etag&&etag===catalogEtag)return;
  const data=await response.json();
  if(!Array.isArray(data.movies))throw Error('Invalid catalog');
  catalogEtag=etag;movies=data.movies;catalogLoaded=true;if(location.pathname==='/search'&&!search.value.trim())suggestionsInitialized=false;updateFilters();
  if(!location.pathname.startsWith('/title/'))render();
  else{const requested=decodeURIComponent(location.pathname.slice(7).replace(/\/$/,''));const movie=movies.find(item=>item.slug_id===requested||item.id===requested);if(movie)showDetail(movie);else route();}
 }catch(err){
  if(!catalogLoaded){$('movie-count').textContent='Unable to load movies. Retrying…';}
 }finally{catalogLoading=false;}
}
route();void refreshCatalog();
setInterval(()=>{void refreshCatalog();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCatalog();});
// Resolve the existing server session before showing the account control.
// No localStorage login hint is trusted as authentication.
(async()=>{
 const AVATAR_PLACEHOLDER='https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original';
 const link=document.getElementById('catalog-account-link');
 if(!link)return;
 const guest=()=>{link.href='/profile';link.classList.remove('catalog-account-avatar');link.replaceChildren(document.createTextNode('Sign in'));link.removeAttribute('title');link.setAttribute('aria-label','Sign in');link.setAttribute('aria-busy','false');};
 try{
  const response=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok){guest();return;}
  const user=await response.json();
  if(!user.number){guest();return;}
  link.href='/profile';link.classList.add('catalog-account-avatar');
  link.replaceChildren(document.createTextNode((user.name||'FG').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()));
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
  const img=document.createElement('img');img.alt='';img.className='catalog-avatar-image';img.referrerPolicy='no-referrer';img.decoding='async';
  img.onerror=()=>{if(img.dataset.fallbackApplied!=='true'&&img.src!==AVATAR_PLACEHOLDER){img.dataset.fallbackApplied='true';img.src=AVATAR_PLACEHOLDER;return;}img.remove();};
  img.src=avatar||AVATAR_PLACEHOLDER;link.append(img);
 }catch{guest();}
})();
