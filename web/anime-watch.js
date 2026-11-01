// FilmGo anime watch page. Player markup and styles are shared with the movies player (.filmgo-* in catalog.css).
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

const slug=decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1)||'');
const $=id=>document.getElementById(id),root=$('watch-root');
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const SVG='http://www.w3.org/2000/svg';
const glyph=(inner,size=18,label='')=>{const s=document.createElementNS(SVG,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('width',size);s.setAttribute('height',size);s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('aria-hidden','true');s.innerHTML=inner;return s;};
const G={
 back10:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.4" text-anchor="middle" font-size="7.6" font-weight="700" fill="currentColor" stroke="none">10</text>',
 fwd10:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.4" text-anchor="middle" font-size="7.6" font-weight="700" fill="currentColor" stroke="none">10</text>',
 prev:'<path d="m15 18-6-6 6-6"/>',next:'<path d="m9 18 6-6-6-6"/>',
 skipNext:'<path d="M6 5l9 7-9 7V5Z"/><path d="M19 5v14"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 volume:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
 mute:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m22 9-6 6m0-6 6 6"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'
};
const g=(k,s)=>glyph(G[k],s);
const fail=(text,signin=false)=>{const box=el('section','anime-watch-state');box.setAttribute('role','alert');box.append(document.createTextNode(text));if(signin){const a=el('a','','Sign in using Phone');a.href='/profile?return='+encodeURIComponent(location.pathname);box.append(document.createTextNode(' '),a);}root.replaceChildren(box);};
const formatTime=v=>{if(!Number.isFinite(v)||v<0)return'00:00';const t=Math.floor(v),h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
const dateLabel=v=>{if(!v)return'';const d=new Date(String(v).slice(0,10)+'T00:00:00Z');return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(d);};
const numOf=e=>Number(e?.episode??e?.number)||0;
const seasonOf=e=>Number(e?.season)||1;
const watchUrl=e=>e?.slug_id?'/anime/watch/'+encodeURIComponent(e.slug_id):'';
const sortEps=list=>[...(list||[])].sort((a,b)=>seasonOf(a)-seasonOf(b)||numOf(a)-numOf(b));
const FALLBACK_POSTER='https://i.ibb.co/TMJ6YCC4/IMG-33a2f581-8ff4-4a5e-9e64-e43c900000c2.png';
const safePoster=p=>typeof p==='string'&&(/^https:\/\//.test(p)||/^\/posters\/[a-f0-9]{24}\.jpg$/.test(p))?p:FALLBACK_POSTER;

function buildPlayer(src,posterUrl,hooks){
 const player=el('div','filmgo-player-shell');player.tabIndex=0;player.setAttribute('aria-label','Anime player. Tap to show or hide controls, Space plays or pauses, arrows seek, F toggles fullscreen.');player.setAttribute('inert','');
 player.addEventListener('contextmenu',e=>e.preventDefault());
 const viewport=el('div','filmgo-player-viewport');
 const video=el('video','filmgo-player');video.preload='metadata';video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('controlsList','nodownload');video.setAttribute('aria-label','FilmGo built-in anime player');video.addEventListener('contextmenu',e=>e.preventDefault());video.addEventListener('dragstart',e=>e.preventDefault());
 if(posterUrl)video.poster=posterUrl;
 const loading=el('div','filmgo-loading-overlay');loading.hidden=true;loading.setAttribute('role','status');loading.setAttribute('aria-label','Loading');loading.append(el('span','filmgo-loading-spinner'));
 const feedback=el('div','filmgo-seek-feedback');feedback.setAttribute('aria-live','polite');feedback.setAttribute('aria-atomic','true');
 viewport.append(video,loading,feedback);
 const controls=el('div','filmgo-controls');
 const progress=el('input','filmgo-progress');progress.type='range';progress.min='0';progress.max='1000';progress.value='0';progress.setAttribute('aria-label','Seek');
 const row=el('div','filmgo-control-row'),left=el('div','filmgo-control-left'),right=el('div','filmgo-control-right');
 const btn=(cls,label,icon)=>{const b=el('button','filmgo-control-button '+cls);b.type='button';b.setAttribute('aria-label',label);b.title=label;b.append(icon);return b;};
 const play=btn('filmgo-play','Play',playerIcon('play')),back=btn('anime-skip','Back 10 seconds',g('back10',22)),fwd=btn('anime-skip','Forward 10 seconds',g('fwd10',22));
 const time=el('span','filmgo-time','00:00 / 00:00');
 const mute=btn('anime-mute','Mute',g('volume',20));
 const nextBtn=hooks.nextUrl?btn('anime-next-ep','Next episode',g('skipNext',20)):null;
 const settingsButton=btn('filmgo-settings-toggle','Player settings',playerIcon('settings'));settingsButton.setAttribute('aria-expanded','false');
 const fullscreen=btn('filmgo-fullscreen','Full screen',playerIcon('fullscreen'));
 left.append(play,back,fwd,time);right.append(mute);if(nextBtn)right.append(nextBtn);right.append(settingsButton,fullscreen);row.append(left,right);controls.append(progress,row);
 const panel=el('div','filmgo-settings-panel');panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','Player settings');
 const close=el('button','filmgo-settings-close');close.type='button';close.setAttribute('aria-label','Close player settings');close.append(playerIcon('close'));panel.append(close);
 const speedWrap=el('label','filmgo-setting');speedWrap.append(playerIcon('speed'),el('span','','Playback speed'));const speed=el('select','filmgo-setting-select');for(const r of [.5,.75,1,1.25,1.5,1.75,2]){const o=el('option','',r===1?'Normal':r+'×');o.value=String(r);if(r===1)o.selected=true;speed.append(o);}speedWrap.append(speed);
 const volWrap=el('label','filmgo-setting');volWrap.append(playerIcon('volume'),el('span','','Player volume'));const vol=el('input','filmgo-setting-range');vol.type='range';vol.min='0';vol.max='1';vol.step='0.01';vol.value='1';vol.setAttribute('aria-label','Player volume');volWrap.append(vol);
 const pip=el('button','filmgo-settings-action');pip.type='button';pip.setAttribute('aria-label','Picture in picture');pip.append(playerIcon('pip'),el('span','','Picture in picture'));pip.disabled=!(document.pictureInPictureEnabled&&video.requestPictureInPicture);
 panel.append(speedWrap,volWrap,pip);
 player.append(viewport,panel,controls);

 let controlsTimer=0,feedbackTimer=0,tapTimer=0,lastTap=0,lastSave=0;
 const showFeedback=(msg,icon)=>{feedback.replaceChildren();if(icon)feedback.append(icon);feedback.append(document.createTextNode(msg));feedback.classList.add('visible');clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>feedback.classList.remove('visible'),650);};
 const showControls=()=>{player.classList.remove('controls-hidden');clearTimeout(controlsTimer);if(!video.paused)controlsTimer=setTimeout(()=>{if(panel.hidden)player.classList.add('controls-hidden');},3200);};
 const update=(pos=video.currentTime)=>{const d=Number.isFinite(video.duration)?video.duration:0;time.textContent=formatTime(pos)+' / '+formatTime(d);progress.value=String(d?Math.round(pos/d*1000):0);progress.style.setProperty('--progress',d?(pos/d*100)+'%':'0%');play.replaceChildren(playerIcon(video.paused?'play':'pause'));const l=video.paused?'Play':'Pause';play.setAttribute('aria-label',l);play.title=l;player.classList.toggle('is-playing',!video.paused);};
 const syncMute=()=>{const m=video.muted||video.volume===0;mute.replaceChildren(g(m?'mute':'volume',20));mute.setAttribute('aria-label',m?'Unmute':'Mute');mute.title=m?'Unmute':'Mute';vol.value=String(video.muted?0:video.volume);};
 const seekBy=s=>{const d=Number.isFinite(video.duration)?video.duration:Infinity;video.currentTime=Math.max(0,Math.min(d,video.currentTime+s));showFeedback((s<0?'−':'+')+Math.abs(s)+'s',g(s<0?'back10':'fwd10',26));showControls();};
 const toggle=()=>{if(video.paused)video.play().catch(()=>{});else video.pause();};
 play.addEventListener('click',()=>{showControls();toggle();});back.addEventListener('click',()=>seekBy(-10));fwd.addEventListener('click',()=>seekBy(10));
 if(nextBtn)nextBtn.addEventListener('click',()=>{location.href=hooks.nextUrl;});
 mute.addEventListener('click',()=>{video.muted=!video.muted;if(!video.muted&&video.volume===0)video.volume=1;syncMute();});
 vol.addEventListener('input',()=>{video.volume=Number(vol.value);video.muted=video.volume===0;syncMute();});
 speed.addEventListener('change',()=>{video.playbackRate=Number(speed.value);});
 pip.addEventListener('click',async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await video.requestPictureInPicture();}catch{}});
 settingsButton.addEventListener('click',()=>{panel.hidden=!panel.hidden;settingsButton.setAttribute('aria-expanded',String(!panel.hidden));player.classList.toggle('settings-open',!panel.hidden);showControls();});
 close.addEventListener('click',()=>{panel.hidden=true;settingsButton.setAttribute('aria-expanded','false');player.classList.remove('settings-open');showControls();});
 progress.addEventListener('input',()=>{const d=video.duration;if(Number.isFinite(d)&&d>0)update(d*Number(progress.value)/1000);});
 progress.addEventListener('change',()=>{const d=video.duration;if(Number.isFinite(d)&&d>0){video.currentTime=d*Number(progress.value)/1000;update();}});
 const syncOrientation=async()=>{if(document.fullscreenElement===player){try{await screen.orientation?.lock?.('landscape');}catch{}}else{try{screen.orientation?.unlock?.();}catch{}}};
 fullscreen.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen?.();else if(player.requestFullscreen){await player.requestFullscreen();await syncOrientation();}else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();}catch{}});
 player.addEventListener('fullscreenchange',()=>{const on=document.fullscreenElement===player;fullscreen.setAttribute('aria-label',on?'Exit full screen':'Full screen');fullscreen.title=on?'Exit full screen':'Full screen';void syncOrientation();});
 player.addEventListener('pointermove',showControls);
 video.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;const now=Date.now(),box=video.getBoundingClientRect(),x=(e.clientX-box.left)/box.width;
  if(now-lastTap<320){clearTimeout(tapTimer);lastTap=0;if(x<.33)seekBy(-10);else if(x>.67)seekBy(10);else{toggle();showFeedback(video.paused?'Play':'Pause',playerIcon(video.paused?'play':'pause'));}return;}
  lastTap=now;clearTimeout(tapTimer);tapTimer=setTimeout(()=>{if(!panel.hidden){panel.hidden=true;settingsButton.setAttribute('aria-expanded','false');player.classList.remove('settings-open');}else if(player.classList.contains('controls-hidden')||video.paused)showControls();else player.classList.add('controls-hidden');},320);});
 player.addEventListener('keydown',e=>{if(e.target.matches('input,select,button'))return;const k=e.key.toLowerCase();
  if(k===' '||k==='k'){e.preventDefault();toggle();showControls();}else if(k==='arrowleft'){e.preventDefault();seekBy(-10);}else if(k==='arrowright'){e.preventDefault();seekBy(10);}else if(k==='f'){e.preventDefault();fullscreen.click();}else if(k==='m'){e.preventDefault();mute.click();}else if(k==='n'&&hooks.nextUrl){location.href=hooks.nextUrl;}});
 video.addEventListener('play',()=>{update();showControls();});video.addEventListener('pause',()=>{update();showControls();});
 video.addEventListener('timeupdate',()=>{update();const now=Date.now();if(now-lastSave>5000&&video.currentTime>5){lastSave=now;hooks.save?.(video.currentTime,video.duration);}});
 video.addEventListener('loadedmetadata',()=>{update();const at=hooks.resume?.();if(at&&Number.isFinite(video.duration)&&at<video.duration-20)video.currentTime=at;});
 video.addEventListener('durationchange',()=>update());video.addEventListener('volumechange',syncMute);
 video.addEventListener('waiting',()=>{loading.hidden=false;});video.addEventListener('playing',()=>{loading.hidden=true;});video.addEventListener('canplay',()=>{loading.hidden=true;});video.addEventListener('seeked',()=>{loading.hidden=true;});
 video.addEventListener('ended',()=>{update();showControls();hooks.clear?.();hooks.ended?.();});
 video.addEventListener('error',()=>{loading.hidden=true;hooks.error?.(video.error);});
 update();syncMute();
 return {player,video,loading,start(){video.src=src;video.load();}};
}

function episodePicker(episodes,currentSlug){
 const sec=el('section','anime-section');const head=el('div','anime-section-head');head.append(el('h2','','Episodes'),el('span','',episodes.length+(episodes.length===1?' episode':' episodes')));sec.append(head);
 const seasons=[...new Set(episodes.map(seasonOf))];
 for(const s of seasons){
  if(seasons.length>1)sec.append(el('p','anime-season','Season '+s));
  const grid=el('div','anime-ep-grid');
  for(const e of episodes.filter(x=>seasonOf(x)===s)){const a=el('a','anime-ep-chip'+(e.slug_id===currentSlug?' current':''),String(numOf(e)||'•'));a.href=watchUrl(e)||'#';a.title=e.title||'Episode '+numOf(e);a.setAttribute('aria-label','Episode '+numOf(e)+(e.title?': '+e.title:''));if(e.slug_id===currentSlug)a.setAttribute('aria-current','page');grid.append(a);}
  sec.append(grid);
 }
 return sec;
}

function suggestions(items){
 const list=(items||[]).filter(i=>i&&i.slug_id&&i.title);if(!list.length)return null;
 const sec=el('section','anime-section anime-suggestions');const head=el('div','anime-section-head');head.append(el('h2','','You may also like'));sec.append(head);
 const row=el('div','tv-row');
 for(const it of list){
  const a=el('a','movie-card group block min-w-0');a.href='/anime/title/'+encodeURIComponent(it.slug_id);
  const wrap=el('div','poster-wrap');const img=el('img','poster');img.alt='';img.loading='lazy';img.decoding='async';img.src=safePoster(it.poster);img.onerror=()=>{if(img.src!==FALLBACK_POSTER)img.src=FALLBACK_POSTER;else img.removeAttribute('src');};wrap.append(img);
  const info=el('div','search-result-info');info.append(el('h3','truncate text-sm font-semibold text-zinc-100',it.title));if(it.year)info.append(el('p','mt-1 text-xs text-zinc-500',String(it.year)));
  a.append(wrap,info);row.append(a);
 }
 sec.append(row);return sec;
}

async function main(){
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(slug))return fail('Episode unavailable.');
 let data;
 try{const r=await fetch('/api/anime/episode/'+encodeURIComponent(slug),{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error();data=await r.json();}catch{return fail('Episode unavailable.');}
 const episode=data.episode,anime=data.anime||{};if(!episode||!episode.slug_id)return fail('Episode unavailable.');
 const episodes=sortEps(anime.episodes),index=episodes.findIndex(e=>e.slug_id===episode.slug_id);
 const prevEp=index>0?episodes[index-1]:null,nextEp=index>=0&&index<episodes.length-1?episodes[index+1]:null;
 const epLabel=episode.episode!=null||episode.number!=null?'Episode '+numOf(episode):'Episode';
 const epTitle=episode.title&&episode.title!==epLabel?episode.title:'';
 document.title=(anime.title?anime.title+' · ':'')+epLabel+' · FilmGo';
 $('watch-back').href='/anime/title/'+encodeURIComponent(anime.slug_id||'');
 const posterUrl=safePoster(anime.poster);

 const hero=el('section','anime-watch-hero');hero.style.setProperty('--hero-art','url("'+posterUrl.replace(/"/g,'%22')+'")');
 const layout=el('div','detail-hero');const img=el('img','detail-poster');img.alt='';img.decoding='async';img.src=posterUrl;img.onerror=()=>{if(img.src!==FALLBACK_POSTER)img.src=FALLBACK_POSTER;};layout.append(img);
 const info=el('div');info.append(el('p','mb-2 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500','NOW WATCHING'),el('h1','text-2xl font-extrabold leading-tight tracking-tight sm:text-5xl',anime.title||'Anime'));
 const meta=[epLabel,episodes.some(e=>seasonOf(e)>1)||episode.season?'Season '+seasonOf(episode):'',epTitle].filter(Boolean).join(' · ');info.append(el('p','mt-3 text-sm text-zinc-300',meta));
 const badges=el('div','anime-watch-badges');for(const b of [anime.year,dateLabel(episode.released)]){if(b)badges.append(el('span','anime-watch-badge',String(b)));}if(badges.childElementCount)info.append(badges);
 const all=el('a','anime-watch-link');all.href='/anime/title/'+encodeURIComponent(anime.slug_id||'');all.append(g('list',16),document.createTextNode('All episodes'));info.append(all);
 layout.append(info);hero.append(layout);

 const section=el('section','mt-9 border-t border-zinc-800 pt-8 filmgo-watch');section.append(el('h2','mb-4 text-lg font-bold','Watch & download'));
 const notice=el('div','filmgo-token-notice filmgo-signin-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;section.append(notice);
 const status=el('p','filmgo-stream-status','');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='min-height:0;margin:10px 0 0;font-size:13px;color:#a1a1aa';

 const KEY='filmgo-anime-pos:'+episode.slug_id;
 const ui=buildPlayer('/api/anime/stream/'+encodeURIComponent(episode.slug_id),episode.frame&&/^https:\/\//.test(episode.frame)?episode.frame:'',{
  nextUrl:nextEp?watchUrl(nextEp):'',
  save:(t,d)=>{try{localStorage.setItem(KEY,String(Math.floor(t)));}catch{}},
  resume:()=>{try{return Number(localStorage.getItem(KEY))||0;}catch{return 0;}},
  clear:()=>{try{localStorage.removeItem(KEY);}catch{}},
  ended:()=>{status.textContent=nextEp?'Episode finished. Use the next episode button to continue.':'Episode finished.';},
  error:err=>{status.textContent=err&&err.code===4?'This episode could not be played in your browser. Try downloading it instead.':'Playback was interrupted. Check your connection and press play to retry.';}
 });
 section.append(ui.player);

 const actions=el('div','filmgo-player-actions');actions.setAttribute('inert','');
 const dl=el('a','filmgo-download-button','Download');dl.href='/api/anime/download/'+encodeURIComponent(episode.slug_id);dl.setAttribute('download','');dl.setAttribute('aria-label','Download '+(anime.title||'episode')+' '+epLabel);
 const shareTitle=(anime.title?anime.title+' · ':'')+epLabel;
 const wa=el('a','filmgo-open-button','WhatsApp');wa.target='_blank';wa.rel='noopener';wa.href='https://wa.me/?text='+encodeURIComponent(shareTitle+'\n'+location.href);wa.setAttribute('aria-label','Share on WhatsApp');
 const tg=el('a','filmgo-open-button','Telegram');tg.target='_blank';tg.rel='noopener';tg.href='https://t.me/share/url?url='+encodeURIComponent(location.href)+'&text='+encodeURIComponent(shareTitle);tg.setAttribute('aria-label','Share on Telegram');
 for(const [b,k] of [[dl,'download'],[wa,'whatsapp'],[tg,'telegram']]){b.prepend(actionIcon(k));b.style.gap='8px';}
 actions.append(dl,wa,tg);section.append(actions,status);

 const nav=el('nav','anime-episode-nav');nav.setAttribute('aria-label','Episode navigation');
 if(prevEp){const a=el('a','anime-nav-button');a.href=watchUrl(prevEp);a.setAttribute('aria-label','Previous episode');a.append(g('prev',18),document.createTextNode('Ep '+numOf(prevEp)));nav.append(a);}
 if(nextEp){const a=el('a','anime-nav-button anime-nav-next');a.href=watchUrl(nextEp);a.setAttribute('aria-label','Next episode');a.append(document.createTextNode('Ep '+numOf(nextEp)),g('next',18));nav.append(a);}
 if(nav.childElementCount)section.append(nav);

 root.replaceChildren(hero,section);
 if(episodes.length>1)root.append(episodePicker(episodes,episode.slug_id));
 if(anime.plot){const ov=el('section','anime-section');ov.style.maxWidth='760px';ov.append(el('h2','text-lg font-bold','Overview'),el('p','mt-3 text-sm leading-7 text-zinc-400',anime.plot));root.append(ov);}
 const sug=suggestions(data.suggestions);if(sug)root.append(sug);

 const lock=(on)=>{ui.player.toggleAttribute('inert',on);actions.toggleAttribute('inert',on);};
 const showNotice=(title,text,cta)=>{notice.hidden=false;notice.replaceChildren();const c=el('div','filmgo-signin-copy');c.append(el('strong','',title),el('span','',text));notice.append(c);if(cta)notice.append(cta);};
 const checkAccess=async()=>{
  notice.hidden=true;
  try{
   const r=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});
   if(r.status===401){lock(true);const a=el('a','filmgo-signin-cta','Sign in using Phone');a.href='/profile?return='+encodeURIComponent(location.pathname);showNotice('Sign in required','Sign in using Phone before streaming or downloading this episode.',a);return;}
   if(!r.ok)throw Error();
   const u=await r.json();
   if(!(u?.unlimited===true||Number(u?.tokens_remaining)>0)){lock(true);showNotice('Daily streaming tokens exhausted','Your streaming allowance is used for today. Try again after the daily reset.');return;}
   lock(false);ui.start();
  }catch{lock(true);const b=el('button','filmgo-signin-cta','Try again');b.type='button';b.addEventListener('click',checkAccess);showNotice('Unable to verify sign-in','Check your connection, then try again.',b);}
 };
 void checkAccess();
}
main();
