const fontStylesheet=document.createElement('link');fontStylesheet.rel='stylesheet';fontStylesheet.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';document.head.append(fontStylesheet);
function actionIcon(kind){
 const paths={download:'M12 4v10.2M7.7 10 12 14.3 16.3 10M5 15.4v1.7A2.9 2.9 0 0 0 7.9 20h8.2a2.9 2.9 0 0 0 2.9-2.9v-1.7',whatsapp:'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z',telegram:'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'};
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','17');svg.setAttribute('height','17');svg.setAttribute('fill',kind==='download'?'none':'currentColor');svg.setAttribute('stroke',kind==='download'?'currentColor':'none');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}
function playerIcon(kind,size){return FilmGoPlayerUI.icon(kind,size);}
function confirmMovieRequest(movie,channel){
 const overlay=el('div','filmgo-sheet-overlay');const sheet=el('div','filmgo-sheet');
 sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
 sheet.append(el('h2','','Confirm movie request'),el('p','filmgo-sheet-description',movie.title+' ('+movie.year+') via '+(channel==='telegram'?'Telegram':'WhatsApp')+'? Daily tokens are charged by file size and delivery method. Free accounts receive 50 tokens per UTC day.'));
 const buttons=el('div','filmgo-sheet-buttons');
 const cancel=el('button','filmgo-open-button','Cancel');const confirm=el('button','filmgo-download-button','Confirm');
 const close=()=>{linkedRequest?.cancel();document.removeEventListener('keydown',esc);overlay.remove();};
 const esc=e=>{if(e.key==='Escape')close();};
 cancel.addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 const linkedRequest=channel==='telegram'?null:FilmGoPlayerUI.whatsappRequest(sheet,confirm,'Confirm movie request',movie.title+(movie.year?' ('+movie.year+')':''),close);
 confirm.addEventListener('click',async()=>{
  if(linkedRequest&&!await linkedRequest.confirm())return;
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
   if(response.status===428&&data.code==='whatsapp_link_required'){close();location.href='/profile#linked-whatsapp';return;}
   if(!response.ok)throw Error(data.error||'Request failed');
   sheet.replaceChildren(el('h2','','Request received'),el('p','filmgo-sheet-description','Your movie is queued for delivery to Message yourself on your linked WhatsApp account.'));
   const done=el('button','filmgo-download-button','Done');done.addEventListener('click',close);sheet.append(done);
  }catch(err){confirm.disabled=false;confirm.textContent='Try again';sheet.querySelector('.filmgo-sheet-error')?.remove();sheet.append(el('p','filmgo-sheet-error',err.message));}
 });
 buttons.append(cancel,confirm);sheet.append(buttons);overlay.append(sheet);document.body.append(overlay);document.addEventListener('keydown',esc);cancel.focus();
}
const $=id=>document.getElementById(id);const grid=$('catalog-grid'),search=$('catalog-search'),empty=$('catalog-empty'),home=$('catalog-home'),detail=$('catalog-detail');let movies=[];const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};const iconSvg=(inner,size)=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('width',size);s.setAttribute('height',size);s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('aria-hidden','true');s.innerHTML=inner;return s;};const STAR_INNER='<path d="M12 4.2l2.3 4.9 5.3.7-3.9 3.7 1 5.3L12 16.2l-4.7 2.6 1-5.3-3.9-3.7 5.3-.7L12 4.2Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';const CHEV_INNER={l:'<path d="M14.6 5.9 9.3 11.2a1.2 1.2 0 0 0 0 1.7l5.3 5.2"/>',r:'<path d="M9.4 5.9l5.3 5.3a1.2 1.2 0 0 1 0 1.7L9.4 18.1"/>'};const starIcon=()=>{const s=iconSvg(STAR_INNER,13);s.classList.add('fg-star');return s;};const chevIcon=dir=>iconSvg(CHEV_INNER[dir],18);const ratingTag=(tag,cls,text)=>{const e=el(tag,cls);e.append(starIcon(),document.createTextNode(text));return e;};const FALLBACK_POSTER='https://i.ibb.co/TMJ6YCC4/IMG-33a2f581-8ff4-4a5e-9e64-e43c900000c2.png';const poster=m=>m.poster&&(/^https:\/\//.test(m.poster)||/^\/posters\/[a-f0-9]{24}\.jpg$/.test(m.poster))?m.poster:FALLBACK_POSTER;function startPoster(img){const source=img.dataset.posterSrc;if(!source)return;delete img.dataset.posterSrc;img.loading='eager';img.src=source;}const posterObserver='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;posterObserver.unobserve(entry.target);startPoster(entry.target);}},{rootMargin:'1600px 0px'}):null;function image(m,cls,eager=false,priority=false){const img=el('img',cls);img.alt='';img.loading=eager?'eager':'lazy';img.decoding='async';img.classList.add('poster-loading');if(priority)img.fetchPriority='high';img.addEventListener('load',()=>{img.classList.remove('poster-loading');img.classList.add('poster-loaded');},{once:true});img.onerror=()=>{if(img.src!==FALLBACK_POSTER){img.src=FALLBACK_POSTER;}else{img.onerror=null;img.removeAttribute('src');img.classList.remove('poster-loading');img.classList.add('poster-failed');}};img.dataset.posterSrc=poster(m);if(eager||!posterObserver)startPoster(img);else posterObserver.observe(img);return img;}function skeleton(){grid.replaceChildren();grid.classList.add('movie-catalog-loading');for(let i=0;i<8;i++){const box=el('div','movie-skeleton-card');box.append(el('div','shimmer movie-skeleton-poster'),el('div','shimmer movie-skeleton-title'),el('div','shimmer movie-skeleton-meta'));grid.append(box);}}const PAGE_SIZE=()=>window.matchMedia('(min-width: 768px)').matches?24:20;let page=1,catalogLoaded=false,searchSuggestions=[],suggestionsInitialized=false;
const yearFilter=$('filter-year'),genreFilter=$('filter-genre'),sortFilter=$('filter-sort'),pagination=$('catalog-pagination');let updatingFilters=false;
// Modern low-space liquid-glass filter rail (Capsules for Sort/Year + Horizontal Genre Chips).
function initModernFilterRail(){
 const container=document.querySelector('.catalog-filters');
 if(!container)return;
 for(const s of [yearFilter,genreFilter,sortFilter]){
  s.classList.add('visually-hidden-select');
  s.setAttribute('tabindex','-1');
  s.setAttribute('aria-hidden','true');
 }
 const selects=[yearFilter,genreFilter,sortFilter];
 for(const s of selects)s.remove();
 container.replaceChildren(...selects);

 const closeAll=()=>{
  container.querySelectorAll('.fg-filter-popover-wrap').forEach(w=>{
   w.classList.remove('open');
   w.querySelector('.fg-filter-capsule')?.setAttribute('aria-expanded','false');
   const p=w.querySelector('.fg-filter-popover');
   if(p)p.hidden=true;
  });
 };

 // Sort capsule
 const sortWrap=el('div','fg-filter-popover-wrap fg-sort-wrap');
 const sortBtn=el('button','fg-filter-capsule fg-capsule-sort');
 sortBtn.type='button';sortBtn.setAttribute('aria-haspopup','listbox');sortBtn.setAttribute('aria-expanded','false');sortBtn.title='Sort order';
 const sortIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');
 sortIcon.setAttribute('viewBox','0 0 24 24');sortIcon.setAttribute('width','14');sortIcon.setAttribute('height','14');sortIcon.setAttribute('fill','none');sortIcon.setAttribute('stroke','currentColor');sortIcon.setAttribute('stroke-width','2');sortIcon.setAttribute('stroke-linecap','round');sortIcon.setAttribute('stroke-linejoin','round');sortIcon.setAttribute('aria-hidden','true');sortIcon.classList.add('fg-capsule-icon');
 sortIcon.innerHTML='<path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16"/>';
 const sortLabel=el('span','fg-capsule-label',sortFilter.selectedOptions[0]?.textContent||'Sort');
 const sortChev=document.createElementNS('http://www.w3.org/2000/svg','svg');
 sortChev.setAttribute('viewBox','0 0 24 24');sortChev.setAttribute('width','12');sortChev.setAttribute('height','12');sortChev.setAttribute('fill','none');sortChev.setAttribute('stroke','currentColor');sortChev.setAttribute('stroke-width','2.2');sortChev.setAttribute('stroke-linecap','round');sortChev.setAttribute('stroke-linejoin','round');sortChev.setAttribute('aria-hidden','true');sortChev.classList.add('fg-capsule-chevron');
 sortChev.innerHTML='<path d="M6 9l6 6 6-6"/>';
 sortBtn.append(sortIcon,sortLabel,sortChev);

 const sortPopover=el('div','fg-filter-popover fg-sort-popover');
 sortPopover.hidden=true;sortPopover.setAttribute('role','listbox');
 const renderSortOptions=()=>{
  sortPopover.replaceChildren();
  for(const opt of sortFilter.options){
   const item=el('button','fg-popover-item'+(opt.value===sortFilter.value?' is-selected':''),opt.textContent);
   item.type='button';item.setAttribute('role','option');item.setAttribute('aria-selected',String(opt.value===sortFilter.value));
   if(opt.value===sortFilter.value){
    const check=document.createElementNS('http://www.w3.org/2000/svg','svg');
    check.setAttribute('viewBox','0 0 24 24');check.setAttribute('width','13');check.setAttribute('height','13');check.setAttribute('fill','none');check.setAttribute('stroke','currentColor');check.setAttribute('stroke-width','2.4');check.setAttribute('stroke-linecap','round');check.setAttribute('stroke-linejoin','round');
    check.innerHTML='<path d="M20 6 9 17l-5-5"/>';item.append(check);
   }
   item.addEventListener('click',()=>{
    sortFilter.value=opt.value;sortFilter.dispatchEvent(new Event('change'));closeAll();sortBtn.focus();
   });
   sortPopover.append(item);
  }
 };
 renderSortOptions();
 sortBtn.addEventListener('click',e=>{
  e.stopPropagation();
  const isOpen=sortWrap.classList.contains('open');
  closeAll();
  if(!isOpen){
   sortWrap.classList.add('open');sortBtn.setAttribute('aria-expanded','true');sortPopover.hidden=false;
  }
 });
 sortWrap.append(sortBtn,sortPopover);

 // Year capsule
 const yearWrap=el('div','fg-filter-popover-wrap fg-year-wrap');
 const yearBtn=el('button','fg-filter-capsule fg-capsule-year');
 yearBtn.type='button';yearBtn.setAttribute('aria-haspopup','listbox');yearBtn.setAttribute('aria-expanded','false');yearBtn.title='Filter by release year';
 const yearIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');
 yearIcon.setAttribute('viewBox','0 0 24 24');yearIcon.setAttribute('width','14');yearIcon.setAttribute('height','14');yearIcon.setAttribute('fill','none');yearIcon.setAttribute('stroke','currentColor');yearIcon.setAttribute('stroke-width','2');yearIcon.setAttribute('stroke-linecap','round');yearIcon.setAttribute('stroke-linejoin','round');yearIcon.setAttribute('aria-hidden','true');yearIcon.classList.add('fg-capsule-icon');
 yearIcon.innerHTML='<rect width="18" height="18" x="3" y="4" rx="4"/><path d="M16 2v4M8 2v4M3 10h18"/>';
 const yearLabel=el('span','fg-capsule-label',yearFilter.value||'Year');
 const yearChev=document.createElementNS('http://www.w3.org/2000/svg','svg');
 yearChev.setAttribute('viewBox','0 0 24 24');yearChev.setAttribute('width','12');yearChev.setAttribute('height','12');yearChev.setAttribute('fill','none');yearChev.setAttribute('stroke','currentColor');yearChev.setAttribute('stroke-width','2.2');yearChev.setAttribute('stroke-linecap','round');yearChev.setAttribute('stroke-linejoin','round');yearChev.setAttribute('aria-hidden','true');yearChev.classList.add('fg-capsule-chevron');
 yearChev.innerHTML='<path d="M6 9l6 6 6-6"/>';
 yearBtn.append(yearIcon,yearLabel,yearChev);

 const yearPopover=el('div','fg-filter-popover fg-year-popover');
 yearPopover.hidden=true;yearPopover.setAttribute('role','listbox');
 const renderYearOptions=()=>{
  yearPopover.replaceChildren();
  const allItem=el('button','fg-popover-item'+(!yearFilter.value?' is-selected':''),'All years');
  allItem.type='button';allItem.setAttribute('role','option');
  allItem.addEventListener('click',()=>{
   yearFilter.value='';yearFilter.dispatchEvent(new Event('change'));closeAll();yearBtn.focus();
  });
  yearPopover.append(allItem);
  const head=el('div','fg-popover-header','Release year');
  yearPopover.append(head);
  const grid=el('div','fg-year-grid');
  for(const opt of yearFilter.options){
   if(!opt.value)continue;
   const yBtn=el('button','fg-year-item'+(opt.value===yearFilter.value?' is-selected':''),opt.textContent);
   yBtn.type='button';yBtn.setAttribute('role','option');
   yBtn.addEventListener('click',()=>{
    yearFilter.value=opt.value;yearFilter.dispatchEvent(new Event('change'));closeAll();yearBtn.focus();
   });
   grid.append(yBtn);
  }
  yearPopover.append(grid);
 };
 renderYearOptions();
 yearBtn.addEventListener('click',e=>{
  e.stopPropagation();
  const isOpen=yearWrap.classList.contains('open');
  closeAll();
  if(!isOpen){
   yearWrap.classList.add('open');yearBtn.setAttribute('aria-expanded','true');yearPopover.hidden=false;
  }
 });
 yearWrap.append(yearBtn,yearPopover);

 // Divider
 const divider=el('div','fg-rail-divider');

 // Horizontal Genre Rail
 const genreRail=el('div','fg-genre-rail');
 genreRail.setAttribute('role','tablist');genreRail.setAttribute('aria-label','Filter by genre');
 genreRail.addEventListener('wheel',e=>{
  if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){
   e.preventDefault();genreRail.scrollLeft+=e.deltaY;
  }
 },{passive:false});

 const renderGenreChips=()=>{
  genreRail.replaceChildren();
  const allChip=el('button','fg-genre-chip'+(!genreFilter.value?' is-active':''),'All');
  allChip.type='button';allChip.setAttribute('role','tab');allChip.setAttribute('aria-selected',String(!genreFilter.value));
  allChip.addEventListener('click',()=>{
   if(genreFilter.value!==''){
    genreFilter.value='';genreFilter.dispatchEvent(new Event('change'));
   }
  });
  genreRail.append(allChip);

  for(const opt of genreFilter.options){
   if(!opt.value)continue;
   const chip=el('button','fg-genre-chip'+(opt.value===genreFilter.value?' is-active':''),opt.textContent);
   chip.type='button';chip.setAttribute('role','tab');chip.setAttribute('aria-selected',String(opt.value===genreFilter.value));
   chip.addEventListener('click',()=>{
    if(genreFilter.value===opt.value){
     genreFilter.value='';
    }else{
     genreFilter.value=opt.value;
    }
    genreFilter.dispatchEvent(new Event('change'));
    chip.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
   });
   genreRail.append(chip);
  }
 };
 renderGenreChips();

 // Reset filter button
 const resetBtn=el('button','fg-filter-reset');
 resetBtn.type='button';resetBtn.hidden=true;resetBtn.title='Reset all filters';resetBtn.setAttribute('aria-label','Reset all filters');
 const resetIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');
 resetIcon.setAttribute('viewBox','0 0 24 24');resetIcon.setAttribute('width','12');resetIcon.setAttribute('height','12');resetIcon.setAttribute('fill','none');resetIcon.setAttribute('stroke','currentColor');resetIcon.setAttribute('stroke-width','2.4');resetIcon.setAttribute('stroke-linecap','round');resetIcon.setAttribute('stroke-linejoin','round');
 resetIcon.innerHTML='<path d="M18 6 6 18M6 6l12 12"/>';
 resetBtn.append(resetIcon,el('span','','Reset'));
 resetBtn.addEventListener('click',()=>{
  yearFilter.value='';genreFilter.value='';sortFilter.value='default';
  yearFilter.dispatchEvent(new Event('change'));
  genreFilter.dispatchEvent(new Event('change'));
  sortFilter.dispatchEvent(new Event('change'));
  closeAll();
 });

 const syncUI=()=>{
  sortLabel.textContent=sortFilter.selectedOptions[0]?.textContent||'Sort';
  sortBtn.classList.toggle('is-active',sortFilter.value!=='default');
  renderSortOptions();

  yearLabel.textContent=yearFilter.value||'Year';
  yearBtn.classList.toggle('is-active',Boolean(yearFilter.value));
  renderYearOptions();

  renderGenreChips();

  const isFiltered=Boolean(yearFilter.value)||Boolean(genreFilter.value)||sortFilter.value!=='default';
  resetBtn.hidden=!isFiltered;
 };

 for(const s of selects){
  s.addEventListener('change',syncUI);
 }
 document.addEventListener('click',e=>{
  if(!e.target.closest('.fg-filter-popover-wrap'))closeAll();
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeAll();
 });

 container.append(sortWrap,yearWrap,divider,genreRail,resetBtn);
 container._fgRebuild=()=>{
  renderYearOptions();
  renderGenreChips();
  syncUI();
 };
}
initModernFilterRail();
function updateFilters(){
 const oldYear=yearFilter.value,oldGenre=genreFilter.value;
 const years=[...new Set(movies.map(m=>String(m.year||'').trim()).filter(y=>/^\d{4}$/.test(y)))].sort((a,b)=>Number(b)-Number(a));
 const genres=[...new Set(movies.flatMap(m=>Array.isArray(m.genre)?m.genre:typeof m.genre==='string'?m.genre.split(','):[]).map(g=>String(g).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const fill=(select,values,label)=>{select.replaceChildren(new Option(label,''));for(const value of values)select.add(new Option(value,value));};
 fill(yearFilter,years,'All years');fill(genreFilter,genres,'All genres');
 updatingFilters=true;yearFilter.value=years.includes(oldYear)?oldYear:'';genreFilter.value=genres.includes(oldGenre)?oldGenre:'';
 updatingFilters=false;
 const rail=document.querySelector('.catalog-filters');
 if(rail?._fgRebuild)rail._fgRebuild();
 else{
  yearFilter.dispatchEvent(new Event('change'));genreFilter.dispatchEvent(new Event('change'));
 }
}
function renderPagination(total){
 pagination.replaceChildren();
 const pageSize=PAGE_SIZE(),pages=Math.ceil(total/pageSize);
 pagination.classList.toggle('hidden',pages<=1);
 if(pages<=1)return;
 const add=(label,target,disabled=false,current=false)=>{
  const button=el('button','page-button'+(current?' active':''),label);
  button.type='button';button.disabled=disabled;if(label==='‹'||label==='›'){const isPrev=label==='‹';button.textContent='';button.append(chevIcon(isPrev?'l':'r'));button.setAttribute('aria-label',isPrev?'Previous page':'Next page');}
  if(current)button.setAttribute('aria-current','page');
  button.addEventListener('click',()=>{page=target;render();$('catalog-home').scrollIntoView({behavior:'smooth',block:'start'});});
  pagination.append(button);
 };
 add('‹',page-1,page===1);
 const start=Math.max(1,page-1);
 for(let n=start;n<=Math.min(pages,start+2);n++)add(String(n),n,false,n===page);
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
  const badge=!searching&&m.imdb_rating&&m.imdb_rating!=='N/A'?ratingTag('span','absolute bottom-2 left-2 rounded-md bg-zinc-950/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur',m.imdb_rating):null;
  if(badge)wrap.append(badge);
  const info=el('div','search-result-info');info.append(el('h3','truncate text-sm font-semibold text-zinc-100',m.title));
  if(searching){
   const genres=Array.isArray(m.genre)?m.genre:typeof m.genre==='string'?m.genre.split(','):[];
   const facts=el('p','search-result-facts');facts.append(el('span','',''+(m.year||'Year unavailable')));
   if(m.runtime)facts.append(el('span','','· '+m.runtime));
   if(m.imdb_rating&&m.imdb_rating!=='N/A')facts.append(ratingTag('span','search-result-rating',m.imdb_rating));
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
function showDetail(m){const root=$('detail-content');root.replaceChildren();const layout=el('div','detail-hero');layout.append(image(m,'detail-poster',true,true));const info=el('div');info.append(el('p','mb-2 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500','MOVIE DETAILS'),el('h1','text-2xl font-extrabold leading-tight tracking-tight sm:text-5xl',m.title),el('p','mt-3 text-sm text-zinc-400',[m.year,m.runtime].filter(Boolean).join(' · ')));if(m.imdb_rating)info.append(ratingTag('p','mt-3 text-sm font-semibold text-zinc-200','IMDb '+m.imdb_rating));if(m.genre?.length)info.append(el('p','mt-3 text-sm text-zinc-400',m.genre.join(' · ')));layout.append(info);root.append(layout);const body=el('div','mt-9 max-w-3xl border-t border-zinc-800 pt-8');body.append(el('h2','text-lg font-bold','Overview'),el('p','mt-3 text-sm leading-7 text-zinc-400',m.plot||'No synopsis available yet.'));if(m.director)body.append(el('p','mt-5 text-sm text-zinc-400','Director: '+m.director));if(m.cast?.length)body.append(el('p','mt-2 text-sm text-zinc-400','Cast: '+m.cast.join(', ')));root.append(body);
const section=el('section','mt-9 max-w-3xl border-t border-zinc-800 pt-8 filmgo-watch');
section.append(el('h2','mb-4 text-lg font-bold','Watch & Download'));
const accessNotice=el('div','filmgo-token-notice filmgo-signin-notice');accessNotice.setAttribute('role','status');accessNotice.setAttribute('aria-live','polite');section.append(accessNotice);
const ui=FilmGoPlayerUI.create({title:m.title,subtitle:[m.year,m.runtime].filter(Boolean).join(' · ')});
const player=ui.player,viewport=ui.viewport;player.setAttribute('aria-label','Movie player. Single tap shows or hides controls, double tap pauses, Space plays or pauses, arrows seek, F toggles fullscreen.');
player.setAttribute('inert','');
player.addEventListener('contextmenu',event=>event.preventDefault());
let video=el('video','filmgo-player');
video.preload='auto';video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('controlsList','nodownload');
video.addEventListener('contextmenu',event=>event.preventDefault());
video.addEventListener('dragstart',event=>event.preventDefault());
video.poster='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 9%22%3E%3Crect width=%2216%22 height=%229%22 fill=%22%2309090b%22/%3E%3C/svg%3E';video.setAttribute('aria-label','FilmGo built-in movie player');
const loadingOverlay=ui.loading,seekFeedback=ui.feedback;
viewport.prepend(video);
const controls=ui.controls,progress=ui.progress,play=ui.play,time=ui.time,settingsButton=ui.settingsButton,fullscreen=ui.fullscreen,settingsPanel=ui.menu,settingsClose=ui.menuClose,volume=ui.volume,pip=ui.pip;
section.append(player);
const makeSetting=(label,id)=>ui.select(id);
pip.disabled=!(document.pictureInPictureEnabled&&video.requestPictureInPicture);
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
const qualityRow=ui.qualityRow;
for(const q of qualities){const button=el('button','filmgo-quality-button',q);button.type='button';button.addEventListener('click',()=>setQuality(q));qualityRow.append(button);}
qualityRow.hidden=qualities.length<2;
const isActive=()=>root.isConnected&&location.pathname==='/title/'+slug;
let movieAccessState='checking';
let streamAvailability=null;
const setMovieAccessState=state=>{
 movieAccessState=state;
 const locked=state!=='signed-in';
 player.toggleAttribute('inert',locked);actions.toggleAttribute('inert',locked);
 if(state==='checking'){accessNotice.hidden=true;return;}
 accessNotice.hidden=!locked;
 if(!locked)return;
 accessNotice.replaceChildren();
 const copy=el('div','filmgo-signin-copy');
 if(state==='checking')copy.append(el('strong','','Checking sign-in status'),el('span','','Sign in is required to use this movie’s player and actions.'));
 else if(state==='unavailable')copy.append(el('strong','','Unable to verify sign-in'),el('span','','Check your connection, then try again.'));
 else if(state==='no-tokens')copy.append(el('strong','','Daily streaming tokens exhausted'),el('span','','Your streaming allowance is used for today. Try again after the daily reset.'));
 else copy.append(el('strong','','Sign in required'),el('span','','Sign in using Phone before streaming, downloading, or requesting this movie.'));
 accessNotice.append(copy);
 if(state==='unavailable'){
  const retry=el('button','filmgo-signin-cta','Try again');retry.type='button';retry.addEventListener('click',checkMovieAccess);accessNotice.append(retry);
 }else if(state==='signed-out'){
  const signIn=el('a','filmgo-signin-cta','Sign in using Phone');signIn.href='/profile?return='+encodeURIComponent(location.pathname);accessNotice.append(signIn);
 }
};
async function checkMovieAccess(){
 setMovieAccessState('checking');
 try{
  const response=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});
  if(!isActive())return;
  if(response.status===401){setMovieAccessState('signed-out');startPlaybackWhenReady();return;}
  if(!response.ok){setMovieAccessState('unavailable');startPlaybackWhenReady();return;}
  const user=await response.json();
  const hasTokens=user?.unlimited===true||Number(user?.tokens_remaining)>0;
  setMovieAccessState(hasTokens?'signed-in':'no-tokens');
  startPlaybackWhenReady();
 }catch{if(isActive())setMovieAccessState('unavailable');}
}
function startPlaybackWhenReady(){
 if(!isActive()||movieAccessState!=='signed-in'||!streamAvailability)return;
 if(!streamAvailability.available){setStatus('Streaming is currently unavailable.');actions.classList.add('hidden');qualityRow.classList.add('hidden');return;}
 if(streamAvailability.signed_in===false){setMovieAccessState('signed-out');return;}
 if(!selected){setStatus('No quality available.');return;}
 accessNotice.hidden=true;
}
setMovieAccessState('checking');void checkMovieAccess();
download.addEventListener('click',async event=>{
 event.preventDefault();
 if(movieAccessState==='signed-in'){
  try{const response=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});if(!response.ok){setMovieAccessState('signed-out');location.href='/profile?return='+encodeURIComponent(location.pathname);return;}location.href=download.href;}
  catch{setMovieAccessState('unavailable');}
  return;
 }
 if(movieAccessState==='signed-out')location.href='/profile?return='+encodeURIComponent(location.pathname);
 else if(movieAccessState==='unavailable')void checkMovieAccess();
});
whatsapp.addEventListener('click',()=>{if(movieAccessState==='signed-in')confirmMovieRequest({...m,...m.qualities?.[selected],slug_id:m.slug_id,quality:selected},'whatsapp');});
telegram.addEventListener('click',()=>{if(movieAccessState==='signed-in')confirmMovieRequest(m,'telegram');});
const setStatus=value=>{if(isActive())status.textContent=value;};
const setLoading=(value,show=true)=>{if(!isActive())return;loadingOverlay.hidden=!show;};
const formatTime=value=>{if(!Number.isFinite(value)||value<0)return '00:00';const total=Math.floor(value),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60;return (hours?hours+':'+String(minutes).padStart(2,'0'):String(minutes).padStart(2,'0'))+':'+String(seconds).padStart(2,'0');};
const updateControls=(position=video.currentTime)=>{const duration=video.duration||0;time.textContent=formatTime(position)+' / '+formatTime(duration);progress.value=String(duration?Math.round(position/duration*1000):0);progress.style.setProperty('--progress',duration?((position/duration)*100)+'%':'0%');play.replaceChildren(playerIcon(video.paused?'play':'pause'));play.setAttribute('aria-label',video.paused?'Play':'Pause');player.classList.toggle('is-playing',!video.paused);};
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
play.addEventListener('click',()=>{
 if(movieAccessState!=='signed-in')return;
 if(video.paused){
  if(!video.currentSrc&&!stagedVideo){
   if(!streamAvailability)return;
   if(!streamAvailability.available){setStatus('Streaming is currently unavailable.');return;}
   setQuality(selected);
  }
  enableMobileVolume(video);video.play().catch(()=>{});
 }else video.pause();
});
progress.addEventListener('input',()=>{const duration=video.duration;if(!Number.isFinite(duration)||duration<=0)return;const target=duration*Number(progress.value)/1000;updateControls(target);});
progress.addEventListener('change',()=>{const duration=video.duration;if(!Number.isFinite(duration)||duration<=0)return;const target=duration*Number(progress.value)/1000,wasPlaying=!video.paused;video.currentTime=target;updateControls(target);if(wasPlaying)video.play().catch(()=>{});});
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
 streamAvailability=data;
 startPlaybackWhenReady();
}).catch(()=>{if(isActive()&&selected&&movieAccessState==='signed-in'){setStatus('Availability check failed. Try playback again.');}});
document.title=m.title+' — FilmGo';}
function detailSkeleton(){const wrap=el('div','detail-skeleton');wrap.append(el('div','shimmer detail-skeleton-poster'),el('div','detail-skeleton-copy'));wrap.querySelector('.detail-skeleton-copy').append(el('div','shimmer detail-skeleton-kicker'),el('div','shimmer detail-skeleton-title'),el('div','shimmer detail-skeleton-meta'),el('div','shimmer detail-skeleton-line'),el('div','shimmer detail-skeleton-line short'));$('detail-content').replaceChildren(wrap);}
function route(){
 const match=location.pathname.match(/^\/title\/([^/]+)\/?$/),searching=location.pathname==='/search';
 if(!searching){searchSuggestions=[];suggestionsInitialized=false;}
 if(searching&&!home.classList.contains('search-fullscreen'))home.scrollTop=0;
 $('catalog-back')?.classList.toggle('visible',!!match);
 document.body.classList.toggle('is-detail',!!match);
 home.classList.toggle('search-fullscreen',searching);
 document.body.classList.toggle('catalog-search-active',searching);
 $('catalog-search-close').hidden=!searching;
 if(match){document.body.classList.remove('catalog-search-active');home.classList.remove('search-fullscreen');const m=movies.find(x=>x.slug_id===decodeURIComponent(match[1])||x.id===decodeURIComponent(match[1]));home.classList.add('hidden');detail.classList.remove('hidden');if(m)showDetail(m);else if(!catalogLoaded){detailSkeleton();document.title='Loading movie — FilmGo';}else{$('detail-content').replaceChildren(el('p','text-zinc-400','Movie not found.'));document.title='Movie not found — FilmGo';}}
 else{home.classList.remove('hidden');detail.classList.add('hidden');if(searching){const query=new URLSearchParams(location.search).get('q')||'';if(search.value!==query)search.value=query;document.title='Search — FilmGo';}else{search.value='';document.title='FilmGo — Explore';}if(catalogLoaded)render();}
 window.scrollTo(0,0);
}
search.addEventListener('focus',()=>{if(location.pathname!=='/search'&&!location.pathname.startsWith('/title/')){history.pushState({},'','/search?q='+encodeURIComponent(search.value));route();}});
search.addEventListener('input',()=>{page=1;if(location.pathname==='/search')history.replaceState({},'','/search?q='+encodeURIComponent(search.value));render();});
$('catalog-search-close').addEventListener('click',()=>{search.blur();searchSuggestions=[];suggestionsInitialized=false;history.replaceState({},'','/');route();});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&location.pathname==='/search'){$('catalog-search-close').click();}});
for(const select of [yearFilter,genreFilter,sortFilter])select.addEventListener('change',()=>{if(updatingFilters)return;page=1;render();});window.addEventListener('popstate',route);const desktopPagination=window.matchMedia('(min-width: 768px)');desktopPagination.addEventListener?.('change',()=>{page=1;render();});$('catalog-back')?.addEventListener('click',e=>{if(location.pathname.startsWith('/title/')){e.preventDefault();history.pushState({},'','/');route();}});$('detail-close')?.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;if(location.pathname.startsWith('/title/')){e.preventDefault();history.pushState({},'','/');route();}});{let lastY=0;window.addEventListener('scroll',()=>{const btn=$('detail-close');if(!btn)return;const y=window.scrollY;if(y<=120||y<lastY-4)btn.classList.remove('is-tucked');else if(y>lastY+4)btn.classList.add('is-tucked');lastY=y;},{passive:true});}if(!location.pathname.startsWith('/title/'))skeleton();
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
  buildHome();
  if(location.pathname.startsWith('/title/')){const requested=decodeURIComponent(location.pathname.slice(7).replace(/\/$/,''));const movie=movies.find(item=>item.slug_id===requested||item.id===requested);if(movie)showDetail(movie);else route();}
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
 const serverAuthenticated=link.dataset.serverAuthenticated==='true';
 const guest=()=>{link.href='/profile';link.classList.remove('catalog-account-avatar');link.replaceChildren(document.createTextNode('Sign in'));link.removeAttribute('title');link.setAttribute('aria-label','Sign in');link.setAttribute('aria-busy','false');};
 if(!serverAuthenticated){guest();return;}
 try{
  const response=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok){link.setAttribute('aria-busy','false');return;}
  const user=await response.json();
  if(!user.number){link.setAttribute('aria-busy','false');return;}
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
 }catch{link.setAttribute('aria-busy','false');}
})();

/* ---- TV-style home: hero + shelves (additive; reuses the same data, cards and poster loader) ---- */
const homeEls={hero:$('tv-hero'),shelves:$('tv-shelves'),intro:$('tv-intro')};
const ratingOf=m=>{const r=parseFloat(m.imdb_rating);return Number.isFinite(r)?r:0;};
const slugOf=m=>'/title/'+encodeURIComponent(m.slug_id||m.id);
function homeCard(m,i){const a=el('a','movie-card group block min-w-0');a.href=slugOf(m);const wrap=el('div','poster-wrap');wrap.append(image(m,'poster',i<4));if(m.imdb_rating&&m.imdb_rating!=='N/A')wrap.append(ratingTag('span','absolute bottom-2 left-2 rounded-md bg-zinc-950/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur',m.imdb_rating));const info=el('div','search-result-info');info.append(el('h3','truncate text-sm font-semibold text-zinc-100',m.title));info.append(el('p','mt-1 text-xs text-zinc-500',String(m.year||'')));a.append(wrap,info);return a;}
function shelf(title,list){const sec=el('section','tv-shelf');const head=el('div','tv-shelf-head');head.append(el('h2','tv-section-title',title));const ctrl=el('div','tv-shelf-ctrl');const prev=el('button','tv-arrow'),next=el('button','tv-arrow');prev.append(chevIcon('l'));next.append(chevIcon('r'));prev.type=next.type='button';prev.setAttribute('aria-label','Scroll left');next.setAttribute('aria-label','Scroll right');ctrl.append(prev,next);head.append(ctrl);const row=el('div','tv-row');list.forEach((m,i)=>row.append(homeCard(m,i)));const by=dir=>row.scrollBy({left:dir*row.clientWidth*.85,behavior:'smooth'});prev.onclick=()=>by(-1);next.onclick=()=>by(1);sec.append(head,row);return sec;}
function buildHome(){
 if(!movies.length){homeEls.hero.hidden=true;homeEls.shelves.hidden=true;return;}
 const pool=movies.filter(m=>m.poster);const recent=pool.slice(0,14);
 const featured=[...pool.slice(0,24)].sort((a,b)=>ratingOf(b)-ratingOf(a))[0]||pool[0];
 if(featured){
  const bg=el('div','tv-hero-bg');bg.style.backgroundImage='url("'+poster(featured).replace(/"/g,'%22')+'")';
  const body=el('div','tv-hero-body');body.append(el('span','tv-eyebrow','Featured'));body.append(el('h1','tv-hero-title',featured.title));
  const meta=el('p','tv-hero-meta');const bits=[];if(featured.imdb_rating&&featured.imdb_rating!=='N/A')if(featured.year)bits.push(String(featured.year));if(featured.runtime)bits.push(featured.runtime);const g=Array.isArray(featured.genre)?featured.genre:typeof featured.genre==='string'?featured.genre.split(','):[];if(g.length)bits.push(g.slice(0,2).map(x=>x.trim()).join(' · '));if(featured.imdb_rating&&featured.imdb_rating!=='N/A')meta.append(starIcon(),document.createTextNode(' '+featured.imdb_rating+(bits.length?'  ·  ':'')));meta.append(document.createTextNode(bits.join('  ·  ')));body.append(meta);
  if(featured.plot&&featured.plot!=='N/A')body.append(el('p','tv-hero-plot',featured.plot));
  const actions=el('div','tv-hero-actions');const play=el('a','tv-btn tv-btn-primary');play.append(playerIcon('play'),document.createTextNode('Watch now'));play.href=slugOf(featured);const more=el('a','tv-btn tv-btn-ghost','Browse library');more.href='#catalog-results-title';more.addEventListener('click',e=>{e.preventDefault();$('catalog-results-title').scrollIntoView({behavior:'smooth',block:'start'});});actions.append(play,more);body.append(actions);
  const art=el('a','tv-hero-art');art.href=slugOf(featured);art.setAttribute('aria-label',featured.title);art.append(image(featured,'poster',true,true));
  homeEls.hero.replaceChildren(bg,body,art);
 }
 const top=[...pool].filter(m=>ratingOf(m)>0).sort((a,b)=>ratingOf(b)-ratingOf(a)).slice(0,14);
 homeEls.shelves.replaceChildren(shelf('Recently added',recent),shelf('Top rated',top));
 syncHome();
}
function syncHome(){
 const onHome=location.pathname==='/'&&catalogLoaded&&!search.value.trim()&&!$('filter-year').value&&!$('filter-genre').value&&$('filter-sort').value==='default'&&page===1;
 homeEls.hero.hidden=homeEls.shelves.hidden=!onHome||!homeEls.hero.childElementCount;homeEls.intro.hidden=!!onHome;
}
new MutationObserver(syncHome).observe(grid,{childList:true});
window.addEventListener('popstate',()=>setTimeout(syncHome,0));

/* Detail backdrop: blurred poster behind the hero (additive wrapper) */
(function(){const original=showDetail;showDetail=function(m){original(m);const root=$('detail-content');const bg=el('div','tv-detail-bg');bg.setAttribute('aria-hidden','true');bg.style.setProperty('--bg-img','url("'+poster(m).replace(/"/g,'%22')+'")');root.prepend(bg);};})();
