// FilmGo anime catalog. The server indexes the separate Telegram anime channel.
const fontStylesheet=document.createElement('link');fontStylesheet.rel='stylesheet';fontStylesheet.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';document.head.append(fontStylesheet);
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};const iconSvg=(inner,size)=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('width',size);s.setAttribute('height',size);s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('aria-hidden','true');s.innerHTML=inner;return s;};const STAR_INNER='<path d="M12 4.2l2.3 4.9 5.3.7-3.9 3.7 1 5.3L12 16.2l-4.7 2.6 1-5.3-3.9-3.7 5.3-.7L12 4.2Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';const CHEV_INNER={l:'<path d="M14.6 5.9 9.3 11.2a1.2 1.2 0 0 0 0 1.7l5.3 5.2"/>',r:'<path d="M9.4 5.9l5.3 5.3a1.2 1.2 0 0 1 0 1.7L9.4 18.1"/>'};const starIcon=()=>{const s=iconSvg(STAR_INNER,13);s.classList.add('fg-star');return s;};const chevIcon=dir=>iconSvg(CHEV_INNER[dir],18);const ratingTag=(tag,cls,text)=>{const e=el(tag,cls);e.append(starIcon(),document.createTextNode(text));return e;};
const FALLBACK_POSTER='https://i.ibb.co/TMJ6YCC4/IMG-33a2f581-8ff4-4a5e-9e64-e43c900000c2.png';
const SEASON_BANNERS={'naruto':{1:'/banners/naruto-season-1.webp',2:'/banners/naruto-season-2.webp',3:'/banners/naruto-season-3.webp',4:'/banners/naruto-season-4.webp',5:'/banners/naruto-season-5.webp',6:'/banners/naruto-season-6.webp',7:'/banners/naruto-season-7.webp',8:'/banners/naruto-season-8.webp',9:'/banners/naruto-season-9.webp',10:'/banners/naruto-season-10.webp',11:'/banners/naruto-season-11.webp'},'naruto-shippuden':{1:'/banners/naruto-shippuden-season-1.webp',2:'/banners/naruto-shippuden-season-2.webp',3:'/banners/naruto-shippuden-season-3.webp',4:'/banners/naruto-shippuden-season-4.webp',5:'/banners/naruto-shippuden-season-5.webp',6:'/banners/naruto-shippuden-season-6.webp',7:'/banners/naruto-shippuden-season-7.webp',8:'/banners/naruto-shippuden-season-8.webp',9:'/banners/naruto-shippuden-season-9.webp',10:'/banners/naruto-shippuden-season-10.webp',11:'/banners/naruto-shippuden-season-11.webp',12:'/banners/naruto-shippuden-season-12.webp',13:'/banners/naruto-shippuden-season-13.webp',14:'/banners/naruto-shippuden-season-14.webp',15:'/banners/naruto-shippuden-season-15.webp',16:'/banners/naruto-shippuden-season-16.webp',17:'/banners/naruto-shippuden-season-17.webp',18:'/banners/naruto-shippuden-season-18.webp'}};
const poster=a=>a.poster&&(/^https:\/\//.test(a.poster)||/^\/posters\/[a-f0-9]{24}\.jpg$/.test(a.poster))?a.poster:FALLBACK_POSTER;
SEASON_BANNERS['jujutsu-kaisen']={1:'/banners/jujutsu-kaisen-season-1.webp',2:'/banners/jujutsu-kaisen-season-2.webp',3:'/banners/jujutsu-kaisen-season-3.webp'};
function startPoster(img){const source=img.dataset.posterSrc;if(!source)return;delete img.dataset.posterSrc;img.loading='eager';img.src=source;}
const posterObserver='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;posterObserver.unobserve(entry.target);startPoster(entry.target);}},{rootMargin:'1600px 0px'}):null;
function image(a,cls,eager=false,priority=false){const img=el('img',cls);img.alt='';img.loading=eager?'eager':'lazy';img.decoding='async';img.classList.add('poster-loading');if(priority)img.fetchPriority='high';img.addEventListener('load',()=>{img.classList.remove('poster-loading');img.classList.add('poster-loaded');},{once:true});img.onerror=()=>{if(img.src!==FALLBACK_POSTER){img.src=FALLBACK_POSTER;}else{img.onerror=null;img.removeAttribute('src');img.classList.remove('poster-loading');img.classList.add('poster-failed');}};img.dataset.posterSrc=poster(a);if(eager||!posterObserver)startPoster(img);else posterObserver.observe(img);return img;}
function playIcon(){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','17');svg.setAttribute('height','17');svg.setAttribute('fill','currentColor');svg.setAttribute('aria-hidden','true');const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M8.6 6v12l9.4-6Z');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','2.6');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;}
function chevronIcon(){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','20');svg.setAttribute('height','20');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M6.5 9.5 11 14a1.4 1.4 0 0 0 2 0l4.5-4.5');svg.append(path);return svg;}

const grid=$('anime-grid'),searchInput=$('anime-search'),empty=$('anime-empty'),home=$('anime-home'),detail=$('anime-detail'),pagination=$('anime-pagination');
const yearFilter=$('filter-year'),genreFilter=$('filter-genre'),sortFilter=$('filter-sort');
const heroEl=$('anime-hero'),shelvesEl=$('anime-shelves'),introEl=$('anime-intro');
let items=[],loaded=false,page=1,updatingFilters=false,detailLoad=0;
const PAGE_SIZE=()=>window.matchMedia('(min-width: 768px)').matches?24:20;
const genresOf=a=>(Array.isArray(a.genre)?a.genre:typeof a.genre==='string'?a.genre.split(','):[]).map(g=>String(g).trim()).filter(Boolean);
const ratingOf=a=>{const r=parseFloat(a.rating);return Number.isFinite(r)?r:0;};
const updatedOf=a=>Number(a.updated_at)||Date.parse(a.updated_at)||0;
const slugOf=a=>'/anime/title/'+encodeURIComponent(a.slug_id||a.id);
const episodeNumber=e=>Number(e.number??e.episode)||0;
const episodeDate=value=>{if(!value)return '';const date=new Date(value+'T00:00:00Z');return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date);};
const latestEp=a=>Array.isArray(a.episodes)&&a.episodes.length?Math.max(...a.episodes.map(episodeNumber)):Number(a.episodes_released)||0;
const goTo=(link)=>link.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState({},'',link.href);route();});
function skeleton(){grid.replaceChildren();grid.classList.add('anime-catalog-loading');for(let i=0;i<8;i++){const box=el('div','anime-skeleton-card');box.append(el('div','shimmer anime-skeleton-poster'),el('div','shimmer anime-skeleton-title'),el('div','shimmer anime-skeleton-meta'));grid.append(box);}}

// Accessible custom popovers; native selects remain as the state source.
function initCustomFilters(){
 const filters=[yearFilter,genreFilter,sortFilter];
 const closeAll=()=>{for(const select of filters){const box=select.closest('.catalog-filter');box.classList.remove('open');box.querySelector('.filter-trigger').setAttribute('aria-expanded','false');}};
 for(const select of filters){
  const box=select.closest('.catalog-filter');
  select.classList.add('visually-hidden-select');
  const trigger=el('button','filter-trigger');trigger.type='button';trigger.setAttribute('aria-label',select.getAttribute('aria-label')||'Filter options');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  const label=el('span','filter-trigger-label');const arrow=el('span','filter-chevron');arrow.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 9.5 11 14a1.4 1.4 0 0 0 2 0l4.5-4.5"/></svg>';trigger.append(label,arrow);
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
 const years=[...new Set(items.map(a=>String(a.year||'').trim()).filter(y=>/^\d{4}$/.test(y)))].sort((a,b)=>Number(b)-Number(a));
 const genres=[...new Set(items.flatMap(genresOf))].sort((a,b)=>a.localeCompare(b));
 const fill=(select,values,label)=>{select.replaceChildren(new Option(label,''));for(const value of values)select.add(new Option(value,value));};
 fill(yearFilter,years,'All years');fill(genreFilter,genres,'All genres');
 updatingFilters=true;yearFilter.value=years.includes(oldYear)?oldYear:'';genreFilter.value=genres.includes(oldGenre)?oldGenre:'';
 yearFilter.dispatchEvent(new Event('change'));genreFilter.dispatchEvent(new Event('change'));
 updatingFilters=false;
}
function card(a,i,eager=2){
 const link=el('a','movie-card group block min-w-0');link.href=slugOf(a);
 const wrap=el('div','poster-wrap');wrap.append(image(a,'poster',i<eager));
 const ep=latestEp(a);
 if(a.status==='Airing'&&a.type!=='Movie'&&ep)wrap.append(el('span','anime-badge','EP '+ep));
 if(a.rating)wrap.append(ratingTag('span','absolute bottom-2 left-2 rounded-md bg-zinc-950/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur',a.rating));
 const info=el('div','search-result-info');info.append(el('h3','truncate text-sm font-semibold text-zinc-100',a.title),el('p','mt-1 text-xs text-zinc-500',[a.year,a.type].filter(Boolean).join(' · ')));
 link.append(wrap,info);goTo(link);return link;
}
function shelf(title,list){
 const sec=el('section','tv-shelf');const head=el('div','tv-shelf-head');head.append(el('h2','tv-section-title',title));
 const ctrl=el('div','tv-shelf-ctrl');const prev=el('button','tv-arrow'),next=el('button','tv-arrow');prev.append(chevIcon('l'));next.append(chevIcon('r'));prev.type=next.type='button';prev.setAttribute('aria-label','Scroll left');next.setAttribute('aria-label','Scroll right');ctrl.append(prev,next);head.append(ctrl);
 const row=el('div','tv-row');list.forEach((a,i)=>row.append(card(a,i,4)));
 const by=dir=>row.scrollBy({left:dir*row.clientWidth*.85,behavior:'smooth'});prev.onclick=()=>by(-1);next.onclick=()=>by(1);
 sec.append(head,row);return sec;
}
function buildHome(){
 if(!items.length){heroEl.hidden=true;shelvesEl.hidden=true;return;}
 const pool=items.filter(a=>a.poster);
 const featured=[...pool].sort((a,b)=>updatedOf(b)-updatedOf(a)).slice(0,24).sort((a,b)=>ratingOf(b)-ratingOf(a))[0]||pool[0];
 if(featured){
  const bg=el('div','tv-hero-bg');bg.style.backgroundImage='url("'+poster(featured).replace(/"/g,'%22')+'")';
  const body=el('div','tv-hero-body');body.append(el('span','tv-eyebrow','Featured'),el('h1','tv-hero-title',featured.title));
  const bits=[];if(featured.year)bits.push(String(featured.year));if(featured.episodes_total)bits.push(featured.episodes_total+' eps');const g=genresOf(featured);if(g.length)bits.push(g.slice(0,2).join(' · '));
  const metaEl=el('p','tv-hero-meta');if(featured.rating)metaEl.append(starIcon(),document.createTextNode(' '+featured.rating+(bits.length?'  ·  ':'')));metaEl.append(document.createTextNode(bits.join('  ·  ')));body.append(metaEl);
  if(featured.plot)body.append(el('p','tv-hero-plot',featured.plot));
  const actions=el('div','tv-hero-actions');const play=el('a','tv-btn tv-btn-primary');play.append(playIcon(),document.createTextNode('Watch now'));play.href=slugOf(featured);goTo(play);
  const more=el('a','tv-btn tv-btn-ghost','Browse library');more.href='#anime-results-title';more.addEventListener('click',e=>{e.preventDefault();$('anime-results-title').scrollIntoView({behavior:'smooth',block:'start'});});
  actions.append(play,more);body.append(actions);
  const art=el('a','tv-hero-art');art.href=slugOf(featured);art.setAttribute('aria-label',featured.title);art.append(image(featured,'poster',true,true));goTo(art);
  heroEl.replaceChildren(bg,body,art);
 }
 const fresh=[...pool].filter(a=>a.status==='Airing').sort((a,b)=>updatedOf(b)-updatedOf(a)).slice(0,14);
 const top=[...pool].filter(a=>ratingOf(a)>0).sort((a,b)=>ratingOf(b)-ratingOf(a)).slice(0,14);
 const shelves=[];if(fresh.length)shelves.push(shelf('New episodes',fresh));if(top.length)shelves.push(shelf('Top rated',top));
 shelvesEl.replaceChildren(...shelves);syncHome();
}
function syncHome(){
 const onHome=location.pathname.replace(/\/$/,'')==='/anime'&&loaded&&!searchInput.value.trim()&&!yearFilter.value&&!genreFilter.value&&sortFilter.value==='default'&&page===1;
 heroEl.hidden=shelvesEl.hidden=!onHome||!heroEl.childElementCount;introEl.hidden=!!onHome;
}
function renderPagination(total){
 pagination.replaceChildren();
 const pages=Math.ceil(total/PAGE_SIZE());
 pagination.classList.toggle('hidden',pages<=1);
 if(pages<=1)return;
 const add=(label,target,disabled=false,current=false)=>{
  const button=el('button','page-button'+(current?' active':''),label);button.type='button';button.disabled=disabled;if(label==='‹'||label==='›'){const isPrev=label==='‹';button.textContent='';button.append(chevIcon(isPrev?'l':'r'));button.setAttribute('aria-label',isPrev?'Previous page':'Next page');}
  if(current)button.setAttribute('aria-current','page');
  button.addEventListener('click',()=>{page=target;render();home.scrollIntoView({behavior:'smooth',block:'start'});});
  pagination.append(button);
 };
 add('‹',page-1,page===1);for(let n=1;n<=pages;n++)add(String(n),n,false,n===page);add('›',page+1,page===pages);
}
function render(){
 if(!loaded)return;
 const q=searchInput.value.trim().toLowerCase(),year=yearFilter.value,genre=genreFilter.value;
 const rows=items.filter(a=>(!q||(a.title+' '+(a.title_alt||'')+' '+a.year+' '+genresOf(a).join(' ')).toLowerCase().includes(q))&&(!year||String(a.year)===year)&&(!genre||genresOf(a).some(g=>g.toLowerCase()===genre.toLowerCase())));
 rows.sort((a,b)=>{
  switch(sortFilter.value){
   case 'year-asc':return (Number(a.year)||0)-(Number(b.year)||0)||String(a.title).localeCompare(String(b.title));
   case 'year-desc':return (Number(b.year)||0)-(Number(a.year)||0)||String(a.title).localeCompare(String(b.title));
   case 'title-asc':return String(a.title).localeCompare(String(b.title));
   case 'title-desc':return String(b.title).localeCompare(String(a.title));
   case 'rating-desc':return ratingOf(b)-ratingOf(a)||String(a.title).localeCompare(String(b.title));
   default:return updatedOf(b)-updatedOf(a)||String(a.title).localeCompare(String(b.title));
  }
 });
 const size=PAGE_SIZE();page=Math.max(1,Math.min(page,Math.ceil(rows.length/size)||1));
 posterObserver?.disconnect();grid.replaceChildren();
 $('anime-count').textContent=rows.length+' '+(rows.length===1?'title':'titles');
 empty.classList.toggle('hidden',rows.length>0);
 empty.textContent=q||year||genre?'No anime match your filters.':items.length?'No anime match your filters.':'No anime available yet.';
 const eager=window.matchMedia('(min-width: 1280px)').matches?6:window.matchMedia('(min-width: 768px)').matches?4:2;
 rows.slice((page-1)*size,page*size).forEach((a,i)=>grid.append(card(a,i,eager)));
 renderPagination(rows.length);syncHome();
}
function showDetail(a){
 const root=$('detail-content');root.replaceChildren();
 const bg=el('div','tv-detail-bg');bg.setAttribute('aria-hidden','true');bg.style.setProperty('--bg-img','url("'+poster(a).replace(/"/g,'%22')+'")');root.append(bg);
 const layout=el('div','detail-hero');layout.append(image(a,'detail-poster',true,true));
 const info=el('div');info.append(el('p','anime-kicker','Anime details'),el('h1','anime-detail-title',a.title));
 info.append(el('p','anime-detail-meta',[a.year,a.episodes_total?a.episodes_total+' episodes':''].filter(Boolean).join(' · ')));
 if(a.rating)info.append(ratingTag('p','anime-detail-rating',a.rating));
 const g=genresOf(a);if(g.length)info.append(el('p','anime-detail-line',g.join(' · ')));
 layout.append(info);root.append(layout);
 const overview=el('div','anime-overview');overview.append(el('h2','','Overview'),el('p','',a.plot||'No synopsis available yet.'));if(a.studio)overview.append(el('p','anime-detail-line','Studio: '+a.studio));root.append(overview);
 const eps=el('div','anime-eps');const head=el('div','anime-eps-head');const list=Array.isArray(a.episodes)?[...a.episodes].sort((x,y)=>(Number(x.season)||1)-(Number(y.season)||1)||episodeNumber(x)-episodeNumber(y)):[];
 head.append(el('h2','','Episodes'),el('span','',list.length?list.length+' available':''));eps.append(head);
 if(!list.length)eps.append(el('div','anime-empty-eps','Episodes will appear here once they are added.'));
 const seasons=new Map();for(const episode of list){const collection=String(episode.special_type||'').trim();const season=collection||String(Number(episode.season)||1);if(!seasons.has(season))seasons.set(season,[]);seasons.get(season).push(episode);}
 let firstSeason=true;for(const [season,seasonEpisodes] of seasons){
  const numericSeason=Number(season)||1,banner=SEASON_BANNERS[a.slug_id]?.[numericSeason]||a.season_banners?.[String(numericSeason)],frame=banner||seasonEpisodes.map(e=>e.frame).find(Boolean)||((season==='OAD'||season==='OVA'||season==='Special')?'':a.poster||'');const group=el('section','anime-season-group');const divider=el('section','anime-season-divider');divider.setAttribute('aria-label',season==='OAD'||season==='OVA'||season==='Special'?season:`Season ${season}`);if(frame)divider.style.backgroundImage='url("'+frame.replaceAll('"','%22')+'")';const episodesId='anime-season-episodes-'+season;const toggle=el('button','anime-season-toggle');toggle.type='button';toggle.setAttribute('aria-label',`Toggle ${season==='OAD'||season==='OVA'||season==='Special'?season:`Season ${season}`}`);toggle.setAttribute('aria-expanded',String(firstSeason));toggle.setAttribute('aria-controls',episodesId);toggle.append(chevronIcon());divider.append(toggle);const episodeGroup=el('div','anime-season-episodes');episodeGroup.id=episodesId;episodeGroup.hidden=!firstSeason;firstSeason=false;toggle.addEventListener('click',()=>{const open=!episodeGroup.hidden;episodeGroup.hidden=open;toggle.setAttribute('aria-expanded',String(!open));});group.append(divider,episodeGroup);
  for(const e of seasonEpisodes){
   const number=episodeNumber(e),row=el('div','anime-ep');if(e.frame){const thumb=el('img','anime-ep-frame');thumb.src=e.frame;thumb.alt='';thumb.loading='lazy';row.append(thumb);}else row.append(el('div','anime-ep-num',String(number).padStart(2,'0')));
   const text=el('div','anime-ep-copy');const title=String(e.title||'').trim();const collection=String(e.special_type||'').trim();const subtitle=[collection?collection+' Episode '+number:'Episode '+number,episodeDate(e.released),e.duration,e.part&&'Part '+e.part].filter(Boolean).join(' · ');if(title)text.append(el('p','anime-ep-title',title));text.append(el('p',title?'anime-ep-sub':'anime-ep-sub anime-ep-sub-only',subtitle));
   const episodeSlug=typeof e.slug_id==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(e.slug_id)?e.slug_id:'';
   const play=el('a','anime-ep-play');play.href=episodeSlug?'/anime/watch/'+encodeURIComponent(episodeSlug):'#';play.title=episodeSlug?'Watch episode':'Episode link unavailable';if(!episodeSlug)play.setAttribute('aria-disabled','true');play.append(playIcon(),document.createTextNode('Play'));
   row.append(text,play);episodeGroup.append(row);
  }
  eps.append(group);
 }
 root.append(eps);document.title=a.title+' — FilmGo';
}
function detailSkeleton(){const wrap=el('div','detail-skeleton');wrap.append(el('div','shimmer detail-skeleton-banner'),el('div','detail-skeleton-copy'));wrap.querySelector('.detail-skeleton-copy').append(el('div','shimmer detail-skeleton-kicker'),el('div','shimmer detail-skeleton-title'),el('div','shimmer detail-skeleton-meta'),el('div','shimmer detail-skeleton-line'),el('div','shimmer detail-skeleton-line short'));detail.querySelector('#detail-content').replaceChildren(wrap);}
async function loadAnimeDetail(key){
 const token=++detailLoad;
 try{const response=await fetch('/api/anime/title/'+encodeURIComponent(key),{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Anime unavailable');const data=await response.json();if(token===detailLoad)showDetail(data.anime);}
 catch{if(token===detailLoad)$('detail-content').replaceChildren(el('p','text-zinc-400','Anime unavailable.'));}
}
function route(){
 const match=location.pathname.match(/^\/anime\/title\/([^/]+)\/?$/);
 $('anime-back')?.classList.toggle('visible',!!match);
 document.body.classList.toggle('is-detail',!!match);
 if(match){
  const key=decodeURIComponent(match[1]),a=items.find(x=>x.slug_id===key||x.id===key);
  home.classList.add('hidden');detail.classList.remove('hidden');
  if(a&&Array.isArray(a.episodes))showDetail(a);else if(!loaded){detailSkeleton();document.title='Loading anime — FilmGo';}
  else if(a){detailSkeleton();document.title='Loading '+a.title+' — FilmGo';void loadAnimeDetail(key);}
  else if(!loaded){detailSkeleton();document.title='Loading anime — FilmGo';}
  else{$('detail-content').replaceChildren(el('p','text-zinc-400','Anime not found.'));document.title='Anime not found — FilmGo';}
 }else{home.classList.remove('hidden');detail.classList.add('hidden');document.title='FilmGo — Anime';if(loaded)render();}
 window.scrollTo(0,0);
}
searchInput.addEventListener('input',()=>{page=1;render();});
for(const select of [yearFilter,genreFilter,sortFilter])select.addEventListener('change',()=>{if(updatingFilters)return;page=1;render();});
window.addEventListener('popstate',route);
$('detail-close')?.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;if(location.pathname.startsWith('/anime/title/')){e.preventDefault();history.pushState({},'','/anime');route();}});
{let lastY=0;window.addEventListener('scroll',()=>{const btn=$('detail-close');if(!btn)return;const y=window.scrollY;if(y<=120||y<lastY-4)btn.classList.remove('is-tucked');else if(y>lastY+4)btn.classList.add('is-tucked');lastY=y;},{passive:true});}
(async()=>{
 if(location.pathname.startsWith('/anime/title/'))route();else skeleton();
 try{const response=await fetch('/api/anime?summary=1',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Anime unavailable');const data=await response.json();items=Array.isArray(data.anime)?data.anime:[];}
 catch{items=[];}
 loaded=true;updateFilters();buildHome();route();
})();
