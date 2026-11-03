/* FilmGo shared video player UI. Used by the movie page (catalog.js) and the anime page (anime-watch.js).
   It builds the markup and the settings menu; playback logic stays in the host pages. */
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg';
const ICONS={
 play:['<path d="M8.6 6v12l9.4-6Z" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>',1],
 pause:['<rect x="6.4" y="5.2" width="3.8" height="13.6" rx="1.9"/><rect x="13.8" y="5.2" width="3.8" height="13.6" rx="1.9"/>',1],
 settings:['<path fill="currentColor" fill-opacity=".2" d="M21.15 12.00L20.98 12.59L20.50 13.12L19.85 13.56L19.17 13.92L18.63 14.25L18.33 14.62L18.28 15.10L18.43 15.71L18.65 16.44L18.80 17.22L18.76 17.93L18.47 18.47L17.93 18.76L17.22 18.80L16.44 18.65L15.71 18.43L15.10 18.28L14.62 18.33L14.25 18.63L13.92 19.17L13.56 19.85L13.12 20.50L12.59 20.98L12.00 21.15L11.41 20.98L10.88 20.50L10.44 19.85L10.08 19.17L9.75 18.63L9.38 18.33L8.90 18.28L8.29 18.43L7.56 18.65L6.78 18.80L6.07 18.76L5.53 18.47L5.24 17.93L5.20 17.22L5.35 16.44L5.57 15.71L5.72 15.10L5.67 14.62L5.37 14.25L4.83 13.92L4.15 13.56L3.50 13.12L3.02 12.59L2.85 12.00L3.02 11.41L3.50 10.88L4.15 10.44L4.83 10.08L5.37 9.75L5.67 9.38L5.72 8.90L5.57 8.29L5.35 7.56L5.20 6.78L5.24 6.07L5.53 5.53L6.07 5.24L6.78 5.20L7.56 5.35L8.29 5.57L8.90 5.72L9.38 5.67L9.75 5.37L10.08 4.83L10.44 4.15L10.88 3.50L11.41 3.02L12.00 2.85L12.59 3.02L13.12 3.50L13.56 4.15L13.92 4.83L14.25 5.37L14.62 5.67L15.10 5.72L15.71 5.57L16.44 5.35L17.22 5.20L17.93 5.24L18.47 5.53L18.76 6.07L18.80 6.78L18.65 7.56L18.43 8.29L18.28 8.90L18.33 9.38L18.63 9.75L19.17 10.08L19.85 10.44L20.50 10.88L20.98 11.41Z"/><circle cx="12" cy="12" r="2.9"/>',0],
 fullscreen:['<path d="M8.6 3.8H6.8a3 3 0 0 0-3 3v1.8M20.2 8.6V6.8a3 3 0 0 0-3-3h-1.8M3.8 15.4v1.8a3 3 0 0 0 3 3h1.8M15.4 20.2h1.8a3 3 0 0 0 3-3v-1.8"/><rect x="8.4" y="8.4" width="7.2" height="7.2" rx="2" fill="currentColor" fill-opacity=".2" stroke="none"/>',0],
 exitfs:['<path d="M3.8 8.6h1.8a3 3 0 0 0 3-3V3.8M20.2 8.6h-1.8a3 3 0 0 1-3-3V3.8M3.8 15.4h1.8a3 3 0 0 1 3 3v1.8M20.2 15.4h-1.8a3 3 0 0 0-3 3v1.8"/><rect x="9" y="9" width="6" height="6" rx="1.8" fill="currentColor" fill-opacity=".2" stroke="none"/>',0],
 close:['<path d="M6.5 6.5l4.3 4.3M13.2 13.2l4.3 4.3M17.5 6.5l-4.3 4.3M10.8 13.2l-4.3 4.3"/>',0],
 pip:['<rect x="3" y="5" width="18" height="14" rx="4" fill="currentColor" fill-opacity=".2"/><rect x="12" y="10.6" width="6.4" height="4.6" rx="1.7" fill="currentColor" stroke="none"/>',0],
 speed:['<path d="M3.8 16.6a8.6 8.6 0 1 1 16.4 0"/><path d="M6.8 15.6a5.5 5.5 0 0 1 10.4 0" opacity=".28"/><path d="m12 14.2 3.8-4.4"/><circle cx="12" cy="14.4" r="1.3" fill="currentColor" stroke="none"/>',0],
 audio:['<path fill="currentColor" fill-opacity=".2" d="M4 9.6v4.8h3.3l4.5 3.6a.6.6 0 0 0 1-.5V6.5a.6.6 0 0 0-1-.5L7.3 9.6H4Z"/><path d="M15.8 9.3a4 4 0 0 1 0 5.4"/><path d="M18.6 6.6a7.9 7.9 0 0 1 0 10.8" opacity=".5"/>',0],
 subtitles:['<rect x="3" y="5.2" width="18" height="13.6" rx="4" fill="currentColor" fill-opacity=".2"/><path d="M7.4 10.6h4.2M14 10.6h2.6M7.4 13.8h2.6M12.4 13.8h4.2"/>',0],
 volume:['<path fill="currentColor" fill-opacity=".2" d="M4 9.6v4.8h3.3l4.5 3.6a.6.6 0 0 0 1-.5V6.5a.6.6 0 0 0-1-.5L7.3 9.6H4Z"/><path d="M15.8 9.3a4 4 0 0 1 0 5.4"/><path d="M18.6 6.6a7.9 7.9 0 0 1 0 10.8" opacity=".5"/>',0],
 volumeLow:['<path fill="currentColor" fill-opacity=".2" d="M4 9.6v4.8h3.3l4.5 3.6a.6.6 0 0 0 1-.5V6.5a.6.6 0 0 0-1-.5L7.3 9.6H4Z"/><path d="M15.8 9.3a4 4 0 0 1 0 5.4"/>',0],
 mute:['<path fill="currentColor" fill-opacity=".2" d="M4 9.6v4.8h3.3l4.5 3.6a.6.6 0 0 0 1-.5V6.5a.6.6 0 0 0-1-.5L7.3 9.6H4Z"/><path d="M16 9.6l4.4 4.8M20.4 9.6 16 14.4"/>',0],
 quality:['<rect x="3" y="5" width="18" height="14" rx="4" fill="currentColor" fill-opacity=".2"/><path d="M7 9.8v4.4M7 12h3.2M10.2 9.8v4.4M13.4 9.8v4.4h1.3a2.2 2.2 0 0 0 0-4.4h-1.3Z"/>',0],
 aspect:['<path d="M4 8.4V7a3 3 0 0 1 3-3h1.4M15.6 4H17a3 3 0 0 1 3 3v1.4M20 15.6V17a3 3 0 0 1-3 3h-1.4M8.4 20H7a3 3 0 0 1-3-3v-1.4"/><rect x="8.2" y="8.8" width="7.6" height="6.4" rx="1.8" fill="currentColor" fill-opacity=".2"/>',0],
 moon:['<path fill="currentColor" fill-opacity=".2" d="M19.6 14.4A8 8 0 0 1 9.6 4.4a8 8 0 1 0 10 10Z"/><path d="M17.4 3.4v3M15.9 4.9h3"/>',0],
 loop:['<path d="M4.2 11V10a4 4 0 0 1 4-4h11.4M16.8 3.2l2.8 2.8-2.8 2.8M19.8 13v1a4 4 0 0 1-4 4H4.4M7.2 20.8 4.4 18l2.8-2.8"/>',0],
 chevR:['<path d="M9.4 5.9l5.3 5.3a1.2 1.2 0 0 1 0 1.7L9.4 18.1"/>',0],
 chevL:['<path d="M14.6 5.9 9.3 11.2a1.2 1.2 0 0 0 0 1.7l5.3 5.2"/>',0],
 check:['<path d="M5.5 12.6 9.7 16.8 18.5 7.4"/>',0],
 upload:['<path d="M12 15.6V5.2M7.9 9.3 12 5.2l4.1 4.1"/><path d="M5 14.6v2.1a2.8 2.8 0 0 0 2.8 2.8h8.4a2.8 2.8 0 0 0 2.8-2.8v-2.1" opacity=".55"/>',0],
 skipNext:['<path d="M6.4 6.6v10.8l8-5.4Z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M19 5.8v12.4"/>',0],
 back10:['<circle cx="12" cy="12" r="8.2" fill="currentColor" fill-opacity=".2" stroke="none"/><path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.2"/><path d="M4 4v4.2h4.2"/><text x="12" y="15.5" text-anchor="middle" font-size="7.8" font-weight="700" fill="currentColor" stroke="none" font-family="Inter,system-ui,sans-serif">10</text>',0],
 fwd10:['<circle cx="12" cy="12" r="8.2" fill="currentColor" fill-opacity=".2" stroke="none"/><path d="M20 12a8 8 0 1 1-2.6-5.9L20 8.2"/><path d="M20 4v4.2h-4.2"/><text x="12" y="15.5" text-anchor="middle" font-size="7.8" font-weight="700" fill="currentColor" stroke="none" font-family="Inter,system-ui,sans-serif">10</text>',0],
 plus:['<path d="M12 5.5v13M5.5 12h13"/>',0],
 minus:['<path d="M5.5 12h13"/>',0]
};
function icon(kind,size){
 const def=ICONS[kind]||ICONS.play,svg=document.createElementNS(NS,'svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width',size||17);svg.setAttribute('height',size||17);
 svg.setAttribute('fill',def[1]?'currentColor':'none');svg.setAttribute('stroke',def[1]?'none':'currentColor');
 svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
 svg.innerHTML=def[0];return svg;
}
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fmt=v=>{if(!Number.isFinite(v)||v<0)return'00:00';const t=Math.floor(v),h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return(h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(s).padStart(2,'0');};

/* SRT / VTT -> [{s,e,t}] */
function parseSubtitles(text){
 text=String(text).replace(/^\uFEFF/,'').replace(/\r/g,'');
 const toSec=(h,m,s,ms)=>(+h||0)*3600+(+m)*60+(+s)+Number(String(ms).padEnd(3,'0').slice(0,3))/1000;
 const re=/(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g,out=[];let m;
 while((m=re.exec(text))){
  const t=m[9].replace(/\{\\[^}]*\}/g,'').replace(/<(?!\/?(?:i|b|u)\b)[^>]*>/gi,'').trim();
  if(t)out.push({s:toSec(m[1],m[2],m[3],m[4]),e:toSec(m[5],m[6],m[7],m[8]),t});
 }
 return out;
}

function create(opts){
 opts=opts||{};
 const player=el('div','fgp');player.tabIndex=0;player.dataset.fit='contain';
 const viewport=el('div','fgp-viewport');
 const loading=el('div','fgp-loading');loading.hidden=true;loading.setAttribute('role','status');loading.setAttribute('aria-label','Loading');loading.append(el('span','fgp-spinner'));
 const feedback=el('div','fgp-feedback');feedback.setAttribute('aria-live','polite');feedback.setAttribute('aria-atomic','true');
 const bigplay=el('button','fgp-bigplay');bigplay.type='button';bigplay.setAttribute('aria-label','Play');bigplay.append(icon('play',40));
 viewport.append(loading,feedback,bigplay);

 const top=el('div','fgp-top'),heading=el('div','fgp-heading'),titleEl=el('h3','fgp-title',opts.title||''),subEl=el('p','fgp-sub',opts.subtitle||'');
 heading.append(titleEl,subEl);const badge=el('span','fgp-badge');badge.hidden=true;top.append(heading,badge);

 const controls=el('div','fgp-controls');
 const seek=el('div','fgp-seek'),progress=el('input','fgp-progress');progress.type='range';progress.min='0';progress.max='1000';progress.value='0';progress.setAttribute('aria-label','Seek');
 const tip=el('div','fgp-tip','00:00');seek.append(progress,tip);
 const mk=(cls,label,ic,size)=>{const b=el('button','fgp-btn '+cls);b.type='button';b.setAttribute('aria-label',label);b.title=label;if(ic)b.append(icon(ic,size||23));return b;};
 const row=el('div','fgp-row'),left=el('div','fgp-left'),right=el('div','fgp-right');
 const play=mk('fgp-main','Play','play',27);
 const back=mk('fgp-skip','Back 10 seconds','back10',25),fwd=mk('fgp-skip','Forward 10 seconds','fwd10',25);
 const volBox=el('div','fgp-vol'),mute=mk('fgp-mute','Mute','volume');
 const volume=el('input','fgp-volume');volume.type='range';volume.min='0';volume.max='1';volume.step='0.01';volume.value='1';volume.setAttribute('aria-label','Player volume');
 volBox.append(mute,volume);
 const time=el('span','fgp-time','00:00 / 00:00');
 left.append(play,back,fwd,volBox,time);
 const nextBtn=opts.nextUrl?mk('fgp-next','Next episode','skipNext',22):null;
 const speedChip=el('button','fgp-chip','1×');speedChip.type='button';speedChip.title='Playback speed';speedChip.setAttribute('aria-label','Playback speed');
 const cc=mk('fgp-cc','Subtitles','subtitles'),pip=mk('fgp-pip','Picture in picture','pip');
 const settingsButton=mk('fgp-settings','Player settings','settings',23);settingsButton.setAttribute('aria-expanded','false');
 const fullscreen=mk('fgp-fs-btn','Full screen','fullscreen');
 if(nextBtn)right.append(nextBtn);
 right.append(speedChip,cc,pip,settingsButton,fullscreen);
 row.append(left,right);controls.append(seek,row);

 const scrim=el('div','fgp-scrim');scrim.hidden=true;
 const menu=el('div','fgp-menu');menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Player settings');
 const head=el('div','fgp-menu-head'),backBtn=el('button','fgp-mini');backBtn.type='button';backBtn.setAttribute('aria-label','Back');backBtn.append(icon('chevL',18));
 const menuTitle=el('h4','fgp-menu-title','Settings'),menuClose=el('button','fgp-mini');menuClose.type='button';menuClose.setAttribute('aria-label','Close player settings');menuClose.append(icon('close',18));
 head.append(backBtn,menuTitle,menuClose);const body=el('div','fgp-menu-body');menu.append(head,body);
 const drop=el('div','fgp-drop','Drop subtitle file (.srt / .vtt)');drop.hidden=true;
 const fileInput=el('input');fileInput.type='file';fileInput.accept='.srt,.vtt,text/vtt,application/x-subrip';fileInput.hidden=true;
 const qualityRow=el('div','fgp-qrow');qualityRow.hidden=true;
 player.append(viewport,top,controls,scrim,menu,drop,fileInput,qualityRow);

 const getVideo=()=>viewport.querySelector('video:not(.filmgo-staging-video)');
 const selects={};
 const select=id=>selects[id]||(selects[id]=Object.assign(el('select','filmgo-setting-select'),{id}));
 const speedSel=()=>selects['filmgo-speed']||selects.speed;

 /* feedback toast */
 let toastTimer=0;
 const toast=(msg,ic)=>{feedback.replaceChildren();if(ic)feedback.append(typeof ic==='string'?icon(ic,22):ic);feedback.append(document.createTextNode(msg));feedback.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>feedback.classList.remove('visible'),1100);};

 const seekBy=s=>{const v=getVideo();if(!v)return;const d=Number.isFinite(v.duration)?v.duration:Infinity;v.currentTime=clamp(v.currentTime+s,0,d);toast((s<0?'−':'+')+Math.abs(s)+'s',s<0?'back10':'fwd10');};
 back.addEventListener('click',()=>seekBy(-10));fwd.addEventListener('click',()=>seekBy(10));
 bigplay.addEventListener('click',()=>play.click());

 /* volume / mute */
 let lastVol=1;
 const syncVol=()=>{const n=Number(volume.value)||0;volume.style.setProperty('--v',(n*100)+'%');mute.replaceChildren(icon(n===0?'mute':n<.5?'volumeLow':'volume',23));const l=n===0?'Unmute':'Mute';mute.setAttribute('aria-label',l);mute.title=l;};
 const vd=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
 Object.defineProperty(volume,'value',{configurable:true,get(){return vd.get.call(this);},set(x){vd.set.call(this,x);syncVol();}});
 const setVolume=n=>{volume.value=String(clamp(n,0,1));volume.dispatchEvent(new Event('input',{bubbles:true}));};
 volume.addEventListener('input',syncVol);
 mute.addEventListener('click',()=>{const n=Number(volume.value);if(n>0){lastVol=n;setVolume(0);}else setVolume(lastVol||1);});
 syncVol();

 /* progress: buffered bar + hover time */
 const syncBuffered=()=>{const v=getVideo();if(!v||!Number.isFinite(v.duration)||!v.duration)return;let end=0;const b=v.buffered;for(let i=0;i<b.length;i++)if(b.start(i)<=v.currentTime+.6&&b.end(i)>end)end=b.end(i);progress.style.setProperty('--buffered',Math.min(100,end/v.duration*100)+'%');};
 seek.addEventListener('pointermove',e=>{const v=getVideo();if(!v||!Number.isFinite(v.duration))return;const r=progress.getBoundingClientRect(),x=clamp((e.clientX-r.left)/r.width,0,1);tip.textContent=fmt(v.duration*x);tip.style.left=clamp(x*r.width,26,r.width-26)+'px';tip.classList.add('on');});
 seek.addEventListener('pointerleave',()=>tip.classList.remove('on'));

 /* media events (capture so they work across swapped <video> elements) */
 let sleepTimer=0,sleepMin=0,loop=false,lastV=null;
 const custom={cues:null,name:'',delay:0,on:false,tracks:new WeakMap()};
 const syncSpeed=()=>{const s=speedSel();const r=s?Number(s.value)||1:1;speedChip.textContent=(r===1?'1':String(r))+'×';};
 const syncVideo=()=>{const v=getVideo();if(v&&v!==lastV){lastV=v;v.loop=loop;if(custom.on)applyCustom(v);}if(v)initAudio(v);};
 const onMedia=e=>{
  const t=e.target;if(!(t instanceof HTMLVideoElement)||t.classList.contains('filmgo-staging-video'))return;
  if(e.type==='play'||e.type==='playing')player.classList.add('fgp-playing');
  else if(e.type==='pause'||e.type==='emptied'||e.type==='ended')player.classList.remove('fgp-playing');
  if(e.type==='loadedmetadata')syncVideo();
  if(e.type==='progress'||e.type==='timeupdate'||e.type==='loadedmetadata'||e.type==='seeked')syncBuffered();
  if(e.type==='ratechange'||e.type==='loadedmetadata')syncSpeed();
  bigplay.setAttribute('aria-label',t.paused?'Play':'Pause');
  if(t===A.video)sideMedia(e.type);
 };
 for(const n of ['play','playing','pause','emptied','ended','progress','timeupdate','loadedmetadata','seeked','seeking','waiting','ratechange'])viewport.addEventListener(n,onMedia,true);
 new MutationObserver(syncVideo).observe(viewport,{childList:true});

 /* fullscreen icon */
 const onFs=()=>{const on=document.fullscreenElement===player;player.classList.toggle('fgp-fs',on);fullscreen.replaceChildren(icon(on?'exitfs':'fullscreen',23));};
 document.addEventListener('fullscreenchange',onFs);

 /* custom subtitle file */
 function applyCustom(v){
  if(!custom.cues||!v||typeof v.addTextTrack!=='function')return null;
  let t=custom.tracks.get(v);
  if(!t){t=v.addTextTrack('subtitles',custom.name||'Loaded subtitles','und');custom.tracks.set(v,t);}
  else for(const c of Array.from(t.cues||[]))t.removeCue(c);
  for(const c of custom.cues){try{const s=Math.max(0,c.s+custom.delay);t.addCue(new VTTCue(s,Math.max(s+.05,c.e+custom.delay),c.t));}catch{}}
  t.mode=custom.on?'showing':'disabled';return t;
 }
 async function loadSubFile(file){
  if(!file)return;
  try{
   const cues=parseSubtitles(await file.text());
   if(!cues.length){toast('No subtitles found in file','subtitles');return;}
   custom.cues=cues;custom.name=file.name.replace(/\.[^.]+$/,'')||'Loaded subtitles';custom.delay=0;custom.on=true;
   const v=getVideo();for(const t of Array.from(v?.textTracks||[]))if(!(custom.tracks.get(v)===t))t.mode='disabled';
   applyCustom(v);syncCc();toast('Subtitles loaded','subtitles');if(!menu.hidden)go('subs');
  }catch{toast('Could not read subtitle file','subtitles');}
 }
 fileInput.addEventListener('change',()=>{loadSubFile(fileInput.files[0]);fileInput.value='';});
 let dragDepth=0;
 player.addEventListener('dragenter',e=>{if([...(e.dataTransfer?.types||[])].includes('Files')){dragDepth++;drop.hidden=false;}});
 player.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)drop.hidden=true;});
 player.addEventListener('dragover',e=>{e.preventDefault();});
 player.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;drop.hidden=true;const f=e.dataTransfer?.files?.[0];if(f&&/\.(srt|vtt)$/i.test(f.name))loadSubFile(f);});

 /* track helpers */
 const audioTracks=()=>{const v=getVideo(),l=v&&(v.audioTracks||v.webkitAudioTracks);return l?Array.from(l):[];};
 const textTracks=()=>{const v=getVideo();return v&&v.textTracks?Array.from(v.textTracks).filter(t=>t.kind==='subtitles'||t.kind==='captions'):[];};
 const trackName=(t,i,p)=>t.label||t.language||(p+' '+(i+1));
 const syncCc=()=>{cc.dataset.on=String(textTracks().some(t=>t.mode==='showing'));};
 const setSubs=track=>{for(const t of textTracks())t.mode=t===track?'showing':'disabled';const v=getVideo();custom.on=!!track&&custom.tracks.get(v)===track;syncCc();};

 /* ---- multi-audio (MKV): server-listed tracks + synced audio-only stream for tracks the browser cannot play ---- */
 const LANGS={eng:'English',tam:'Tamil',tel:'Telugu',mal:'Malayalam',kan:'Kannada',hin:'Hindi',jpn:'Japanese',kor:'Korean',chi:'Chinese',zho:'Chinese',spa:'Spanish',fre:'French',fra:'French',ger:'German',deu:'German',ita:'Italian',por:'Portuguese',rus:'Russian',ara:'Arabic',tha:'Thai',ind:'Indonesian',may:'Malay',msa:'Malay',ben:'Bengali',mar:'Marathi',guj:'Gujarati',pan:'Punjabi',urd:'Urdu',tur:'Turkish',vie:'Vietnamese',pol:'Polish',dut:'Dutch',nld:'Dutch',swe:'Swedish',heb:'Hebrew',per:'Persian',fas:'Persian',ukr:'Ukrainian',gre:'Greek',ell:'Greek',und:'Unknown',mul:'Multiple',zxx:'No speech'};
 const langName=c=>LANGS[String(c||'').toLowerCase()]||(c&&c!=='und'?String(c).toUpperCase():'Unknown');
 const chName=n=>n===1?'Mono':n===2?'2.0':n===6?'5.1':n===8?'7.1':n?n+'ch':'';
 const srvLabel=t=>{const l=langName(t.lang);return t.name&&!t.name.toLowerCase().includes(l.toLowerCase())?l+' · '+t.name:l;};
 const srvValue=t=>[t.codec,chName(t.channels)].filter(Boolean).join(' ');
 const prefGet=()=>{try{return localStorage.getItem('fgp-audio-lang')||'';}catch{return'';}};
 const prefSet=l=>{try{localStorage.setItem('fgp-audio-lang',l);}catch{}};
 const mdesc=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'muted'),vdesc=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'volume');
 const A={key:'',video:null,tracks:[],transcode:false,sel:-1,mode:'native',el:null,gen:0,t0:0,ready:false,parked:false,reqAt:0,latency:700,tries:0,tryAt:0,restartTimer:0,idleTimer:0,loop:0,startTimer:0,virt:null,failed:new Set()};
 player.__audio=A;
 const mediaRef=v=>{try{const u=new URL(v.currentSrc||v.src,location.href),m=u.pathname.match(/^\/api\/(anime\/)?stream\/([A-Za-z0-9_-]+)$/);return m?{kind:m[1]?'anime':'movie',id:m[2],quality:u.searchParams.get('quality')||''}:null;}catch{return null;}};
 const sideVolume=()=>{if(A.el)A.el.volume=clamp(Number(volume.value)||0,0,1);};
 {const prev=Object.getOwnPropertyDescriptor(volume,'value');Object.defineProperty(volume,'value',{configurable:true,get:prev.get,set(x){prev.set.call(this,x);sideVolume();}});volume.addEventListener('input',sideVolume);}
 function holdVideoMuted(v){
  if(A.virt&&A.virt.v===v)return;releaseVideoMuted();
  A.virt={v,muted:mdesc.get.call(v),volume:vdesc.get.call(v)};mdesc.set.call(v,true);
  Object.defineProperty(v,'muted',{configurable:true,get:()=>A.virt?A.virt.muted:mdesc.get.call(v),set:x=>{if(A.virt)A.virt.muted=!!x;sideVolume();}});
  Object.defineProperty(v,'volume',{configurable:true,get:()=>A.virt?A.virt.volume:vdesc.get.call(v),set:x=>{if(A.virt)A.virt.volume=x;sideVolume();}});
 }
 function releaseVideoMuted(){
  const r=A.virt;if(!r)return;A.virt=null;const v=r.v;
  try{delete v.muted;delete v.volume;mdesc.set.call(v,r.muted);}catch{}
 }
 function sideEl(){
  if(A.el)return A.el;const a=new Audio();a.preload='auto';a.setAttribute('playsinline','');A.el=a;
  a.addEventListener('canplay',()=>{if(A.mode!=='side'||A.ready)return;A.ready=true;A.latency=Math.min(4000,Math.max(300,performance.now()-A.reqAt));const v=A.video;if(v&&!v.paused&&!v.seeking)sideBegin();});
  a.addEventListener('ended',()=>{const v=A.video;if(A.mode==='side'&&v&&!v.ended&&!v.paused)sideRestart(0.4);});
  a.addEventListener('error',()=>{if(A.mode!=='side'||!a.getAttribute('src'))return;sideFail();});
  return a;
 }
 const sideUrl=(ref,track,t)=>'/api/audio/'+ref.kind+'/'+encodeURIComponent(ref.id)+'?quality='+encodeURIComponent(ref.quality)+'&track='+track+'&t='+t.toFixed(2);
 function sideStop(park){
  clearTimeout(A.startTimer);clearTimeout(A.restartTimer);A.gen++;A.ready=false;
  if(A.el){A.el.pause();if(A.el.getAttribute('src')){A.el.removeAttribute('src');A.el.load();}}
  A.parked=!!park;
 }
 function sideOpen(lead){
  const v=A.video,ref=v&&mediaRef(v);if(!v||!ref||A.sel<0)return;
  sideStop(false);sideEl();
  const now=performance.now();if(now-A.tryAt>30000){A.tries=0;}A.tryAt=A.tryAt&&now-A.tryAt<30000?A.tryAt:now;
  A.t0=Math.max(0,(v.currentTime||0)+lead);A.reqAt=now;const a=A.el;
  a.src=sideUrl(ref,A.sel,A.t0);a.playbackRate=v.playbackRate||1;sideVolume();a.load();
 }
 // lead = how far ahead of the video the new audio stream starts; covers the time the server needs to open it.
 const sideLead=()=>Math.min(4,Math.max(.6,A.latency/1000*1.25+.25));
 function sideRestart(delay){clearTimeout(A.restartTimer);A.restartTimer=setTimeout(()=>{if(A.mode==='side')sideOpen(sideLead());},(delay||0)*1000);}
 function sideBegin(){
  const v=A.video,a=A.el;if(!v||!a||!A.ready||v.paused)return;
  clearTimeout(A.startTimer);const gen=A.gen,wait=(A.t0-v.currentTime)/(v.playbackRate||1)*1000;
  const go=()=>{if(gen!==A.gen||v.paused)return;a.play().catch(e=>{if(e&&e.name==='NotAllowedError')toast('Tap play to enable audio','audio');});};
  if(wait>25)A.startTimer=setTimeout(go,wait);else go();
 }
 function sideFail(){
  const now=performance.now();A.tries=now-A.tryAt>30000?1:A.tries+1;
  if(A.tries<=2){sideRestart(.8);return;}
  const t=A.tracks[A.sel];if(t)A.failed.add(t.i);
  stopSideMode();toast('Audio track unavailable','audio');
 }
 function stopSideMode(){sideStop(false);A.mode='native';releaseVideoMuted();clearInterval(A.loop);A.loop=0;}
 function startSideMode(){
  A.mode='side';holdVideoMuted(A.video);sideEl();
  if(!A.loop)A.loop=setInterval(sideSync,250);
  const v=A.video;if(v&&v.paused){A.parked=true;}else sideOpen(sideLead());
 }
 function sideSync(){
  const v=A.video,a=A.el;if(A.mode!=='side'||!v||!a||!A.ready||a.paused||v.paused||v.seeking)return;
  const d=A.t0+a.currentTime-v.currentTime;                 // >0: audio is ahead of the picture
  if(Math.abs(d)>1.2){sideRestart(0);return;}
  const base=v.playbackRate||1;a.playbackRate=Math.abs(d)<.04?base:base*(1-clamp(d,-.5,.5)*.14);
 }
 // media events for the active video (called from onMedia)
 function sideMedia(type){
  const v=A.video;if(A.mode!=='side'||!v)return;
  if(type==='pause'||type==='waiting'||type==='emptied'||type==='ended'){if(A.el)A.el.pause();clearTimeout(A.startTimer);
   if(type==='pause'){clearTimeout(A.idleTimer);A.idleTimer=setTimeout(()=>{if(A.mode==='side'&&v.paused)sideStop(true);},20000);}}
  else if(type==='seeking'){if(A.el)A.el.pause();clearTimeout(A.startTimer);sideRestart(.18);}
  else if(type==='play'||type==='playing'){
   clearTimeout(A.idleTimer);
   if(A.parked){A.parked=false;sideOpen(sideLead());}
   else if(A.ready&&!v.seeking){const d=A.t0+A.el.currentTime-v.currentTime;if(A.el.paused&&Math.abs(d)<1.2&&d>-.3){if(d>0.03)sideBegin();else A.el.play().catch(()=>{});}else if(A.el.paused&&!A.restartTimer)sideRestart(0);}
  }
  else if(type==='ratechange'&&A.el)A.el.playbackRate=v.playbackRate||1;
 }
 function chooseInitial(){
  const pref=prefGet(),usable=A.tracks.filter(t=>!A.failed.has(t.i));
  return (pref&&usable.find(t=>t.lang===pref))||usable.find(t=>t.default)||usable[0]||null;
 }
 function applyTrack(t,quiet){
  if(!t)return;A.sel=t.i;
  if(t.i===0&&t.native){if(A.mode==='side')stopSideMode();return;}
  if(!A.transcode){if(!quiet)toast(t.i===0?'This audio format is not supported here':'Audio switching is not available','audio');if(A.mode==='side')stopSideMode();return;}
  if(A.mode==='side'){sideOpen(sideLead());if(!quiet)toast('Switching audio…','audio');}
  else startSideMode();
 }
 function pickTrack(t){prefSet(t.lang);A.failed.delete(t.i);applyTrack(t,false);if(t.i===0&&t.native)toast('Audio: '+srvLabel(t),'audio');if(!menu.hidden)render();}
 function initAudio(v){
  const ref=v&&mediaRef(v);
  if(!ref){if(A.video){stopSideMode();}A.video=v||null;A.key='';A.tracks=[];A.sel=-1;return;}
  const key=ref.kind+'|'+ref.id+'|'+ref.quality;
  if(v===A.video&&key===A.key)return;
  const carrying=A.mode==='side';
  stopSideMode();A.video=v;A.key=key;A.tracks=[];A.sel=-1;A.transcode=false;A.failed.clear();
  fetch('/api/audio-tracks/'+ref.kind+'/'+encodeURIComponent(ref.id)+'?quality='+encodeURIComponent(ref.quality),{credentials:'same-origin'})
   .then(r=>r.ok?r.json():null).then(j=>{
    if(!j||A.key!==key||A.video!==v)return;
    A.tracks=Array.isArray(j.tracks)?j.tracks:[];A.transcode=!!j.transcode;
    if(A.tracks.length)applyTrack(chooseInitial(),true);
    if(!menu.hidden)render();
   }).catch(()=>{});
  void carrying;
 }
 const audioList=()=>A.tracks.length?A.tracks.map(t=>({label:srvLabel(t),value:srvValue(t),sel:A.sel===t.i,pick:()=>pickTrack(t)})):null;


 /* settings menu */
 const FIT=[['contain','Fit to screen'],['cover','Fill (crop)'],['fill','Stretch']];
 let page='root',pending=null;
 const item=(o)=>{
  const b=el('button','fgp-item'+(o.sel?' sel':''));b.type='button';b.disabled=!!o.disabled;
  if(o.ico)b.append(icon(o.ico,21));
  b.append(el('span','l',o.label));
  if(o.value!==undefined)b.append(el('span','v',o.value));
  if(o.toggle!==undefined){const sw=el('span','fgp-switch'+(o.toggle?' on':''));b.append(sw);b.setAttribute('role','switch');b.setAttribute('aria-checked',String(!!o.toggle));}
  else if(o.go){const c=icon('chevR',18);c.classList.add('c');b.append(c);}
  else if(o.check!==undefined){const c=icon('check',19);c.classList.add('ck');if(!o.check)c.classList.add('off');b.append(c);}
  if(o.run)b.addEventListener('click',o.run);return b;
 };
 const stepper=(label,value,minus,plus)=>{const d=el('div','fgp-step');d.append(el('span','l',label));const m=el('button','fgp-mini');m.type='button';m.setAttribute('aria-label','Decrease '+label);m.append(icon('minus',18));m.addEventListener('click',minus);const v=el('span','v',value);const p=el('button','fgp-mini');p.type='button';p.setAttribute('aria-label','Increase '+label);p.append(icon('plus',18));p.addEventListener('click',plus);d.append(m,v,p);return d;};
 const go=name=>{page=name;render();};
 const qualityButtons=()=>Array.from(qualityRow.children);
 const activeQuality=()=>{const b=qualityButtons();return(b.find(x=>x.classList.contains('active'))||b.find(x=>x.classList.contains('pending'))||b[0])?.textContent||'';};
 const speedLabel=()=>{const s=speedSel();return s&&s.selectedOptions[0]?s.selectedOptions[0].textContent:'Normal';};
 const sleepLabel=()=>sleepMin?sleepMin+' min':'Off';

 function render(){
  body.replaceChildren();backBtn.hidden=page==='root';
  const v=getVideo();
  if(page==='root'){
   menuTitle.textContent='Settings';
   if(qualityButtons().length>1)body.append(item({ico:'quality',label:'Quality',value:activeQuality(),go:1,run:()=>go('quality')}));
   body.append(item({ico:'speed',label:'Playback speed',value:speedLabel(),go:1,run:()=>go('speed')}));
   const sl=audioList(),at=audioTracks(),act=at.find(t=>t.enabled),cur=sl&&sl.find(x=>x.sel);
   const multi=sl?sl.length>1:at.length>1;
   body.append(item({ico:'audio',label:'Audio track',value:sl?(cur?cur.label:sl[0].label):(at.length>1?(act?trackName(act,at.indexOf(act),'Audio'):'Default'):'Default'),go:multi,disabled:!multi,run:()=>go('audio')}));
   const tt=textTracks(),sh=tt.find(t=>t.mode==='showing');
   body.append(item({ico:'subtitles',label:'Subtitles',value:sh?trackName(sh,tt.indexOf(sh),'Subtitle'):'Off',go:1,run:()=>go('subs')}));
   body.append(el('div','fgp-sep'));
   body.append(item({ico:'aspect',label:'Aspect ratio',value:FIT.find(f=>f[0]===player.dataset.fit)[1],go:1,run:()=>go('aspect')}));
   body.append(item({ico:'moon',label:'Sleep timer',value:sleepLabel(),go:1,run:()=>go('sleep')}));
   body.append(item({ico:'loop',label:'Loop video',toggle:loop,run:()=>{loop=!loop;const vv=getVideo();if(vv)vv.loop=loop;render();}}));
  }else if(page==='quality'){
   menuTitle.textContent='Quality';
   for(const b of qualityButtons()){const on=b.classList.contains('active');body.append(item({label:b.textContent+(b.classList.contains('pending')&&!on?'  · switching…':''),sel:on,check:on,run:()=>{b.click();setTimeout(render,250);setTimeout(render,1500);}}));}
   body.append(el('p','fgp-note','Switching keeps your place in the video.'));
  }else if(page==='speed'){
   menuTitle.textContent='Playback speed';const s=speedSel();
   for(const o of Array.from(s?s.options:[])){const on=s.value===o.value;body.append(item({label:o.textContent,sel:on,check:on,run:()=>{s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));syncSpeed();render();}}));}
  }else if(page==='audio'){
   menuTitle.textContent='Audio track';const at=audioTracks(),sl=audioList();
   if(sl){for(const x of sl)body.append(item({label:x.label,value:x.value,sel:x.sel,check:x.sel,run:x.pick}));if(sl.some(x=>!x.sel&&A.mode==='side'))body.append(el('p','fgp-note','Converted on the fly for your browser. Switching may take a moment.'));}
   else at.forEach((t,i)=>body.append(item({label:trackName(t,i,'Audio'),sel:t.enabled,check:t.enabled,run:()=>{at.forEach(x=>{x.enabled=x===t;});render();}})));
   if(!sl&&!at.length)body.append(el('p','fgp-note','This video exposes a single audio track.'));
  }else if(page==='subs'){
   menuTitle.textContent='Subtitles';const tt=textTracks();
   body.append(item({label:'Off',sel:!tt.some(t=>t.mode==='showing'),check:!tt.some(t=>t.mode==='showing'),run:()=>{setSubs(null);render();}}));
   tt.forEach((t,i)=>{const on=t.mode==='showing';body.append(item({label:trackName(t,i,'Subtitle'),sel:on,check:on,run:()=>{setSubs(t);render();}}));});
   body.append(el('div','fgp-sep'));
   body.append(item({ico:'upload',label:'Load subtitle file…',run:()=>fileInput.click()}));
   if(custom.cues)body.append(stepper('Delay',(custom.delay>0?'+':'')+custom.delay.toFixed(1)+'s',()=>{custom.delay=Math.round((custom.delay-.5)*10)/10;applyCustom(getVideo());render();},()=>{custom.delay=Math.round((custom.delay+.5)*10)/10;applyCustom(getVideo());render();}));
   body.append(el('p','fgp-note','Supports .srt and .vtt. You can also drop a file onto the player.'));
  }else if(page==='aspect'){
   menuTitle.textContent='Aspect ratio';
   for(const [k,n] of FIT){const on=player.dataset.fit===k;body.append(item({label:n,sel:on,check:on,run:()=>{player.dataset.fit=k;render();toast(n,'aspect');}}));}
  }else if(page==='sleep'){
   menuTitle.textContent='Sleep timer';
   for(const n of [0,15,30,45,60,90]){const on=sleepMin===n;body.append(item({label:n?n+' minutes':'Off',sel:on,check:on,run:()=>{sleepMin=n;clearTimeout(sleepTimer);if(n){sleepTimer=setTimeout(()=>{const vv=getVideo();if(vv)vv.pause();sleepMin=0;toast('Sleep timer — paused','moon');},n*60000);toast('Sleep timer: '+n+' min','moon');}render();}}));}
  }
 }
 backBtn.addEventListener('click',()=>go('root'));
 scrim.addEventListener('click',()=>menuClose.click());
 new MutationObserver(()=>{scrim.hidden=menu.hidden;if(!menu.hidden){page=pending||'root';pending=null;render();}}).observe(menu,{attributes:true,attributeFilter:['hidden']});
 const openPage=name=>{if(menu.hidden){pending=name;settingsButton.click();}else go(name);};
 speedChip.addEventListener('click',()=>openPage('speed'));
 cc.addEventListener('click',()=>openPage('subs'));

 /* long-press for 2× speed */
 let lp=0,lpOn=false;
 viewport.addEventListener('pointerdown',e=>{
  if(e.target.closest('button')||(e.pointerType==='mouse'&&e.button!==0))return;
  const v=getVideo();if(!v||v.paused)return;
  clearTimeout(lp);lp=setTimeout(()=>{lpOn=true;v.playbackRate=2;toast('2× speed','speed');},480);
 });
 const endLp=()=>{clearTimeout(lp);if(lpOn){lpOn=false;const v=getVideo(),s=speedSel();if(v)v.playbackRate=s?Number(s.value)||1:1;}};
 viewport.addEventListener('pointerup',e=>{if(lpOn){e.stopPropagation();endLp();}else clearTimeout(lp);},true);
 viewport.addEventListener('pointercancel',endLp);viewport.addEventListener('pointerleave',endLp);

 /* extra shortcuts */
 player.addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea')||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key,v=getVideo();
  if(k==='Escape'&&!menu.hidden){e.preventDefault();menuClose.click();}
  else if(k==='ArrowUp'||k==='ArrowDown'){e.preventDefault();const n=clamp(Number(volume.value)+(k==='ArrowUp'?.05:-.05),0,1);setVolume(n);toast('Volume '+Math.round(n*100)+'%',n===0?'mute':'volume');}
  else if(k==='j')seekBy(-10);else if(k==='l')seekBy(10);
  else if(k==='c'){e.preventDefault();openPage('subs');}
  else if(v&&/^[0-9]$/.test(k)&&Number.isFinite(v.duration)){v.currentTime=v.duration*Number(k)/10;toast(k+'0%','fwd10');}
 });

 return {player,viewport,loading,feedback,controls,progress,play,time,settingsButton,fullscreen,menu,menuClose,volume,pip,nextBtn,back,fwd,mute,qualityRow,select,toast,seekBy,getVideo,
  setTitle(t,s){titleEl.textContent=t||'';subEl.textContent=s||'';},
  setBadge(t){badge.textContent=t||'';badge.hidden=!t;},
  syncSpeed};
}
// Request dialogs use fresh owner-only state, never a cached profile flag.
function whatsappRequest(sheet,button,title,description,close){
 let state='checking',cancelled=false;
 const heading=sheet.querySelector('h2'),copy=sheet.querySelector('.filmgo-sheet-description');
 function paint(){
  if(cancelled)return;
  const states={
   checking:['Checking WhatsApp','Checking your linked WhatsApp connection…','Checking…'],
   guest:['Sign in to continue','Sign in and link your WhatsApp to receive this file in Message yourself. No request tokens are charged until a delivery request is accepted.','Sign in'],
   disconnected:['Link WhatsApp first','Link your WhatsApp in your profile before requesting this file. Nothing has been queued and no request tokens have been charged.','Link WhatsApp'],
   reconnecting:['WhatsApp is reconnecting','Your linked device is not ready. Wait a moment and check again, or manage the connection in your profile. Nothing has been queued.','Check connection'],
   connected:[title,description+' Send it to Message yourself using your linked WhatsApp account? Daily tokens are charged by file size. Free accounts receive 50 tokens per UTC day.','Confirm & send'],
   error:['Unable to check WhatsApp','We could not verify your connection. Please try again. Nothing has been queued.','Try again']
  };
  const view=states[state];heading.textContent=view[0];copy.textContent=view[1];button.textContent=view[2];button.disabled=state==='checking';
 }
 async function refresh(){
  state='checking';paint();
  try{
   const response=await fetch('/api/whatsapp/status',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(response.status===401)state='guest';
   else{if(!response.ok)throw Error();const data=await response.json();state=data.state==='connected'?'connected':data.state==='disconnected'?'disconnected':['connecting','pairing','reconnecting'].includes(data.state)?'reconnecting':'error';}
  }catch{state='error';}
  paint();
 }
 void refresh();
 return {cancel(){cancelled=true;},async confirm(){
  if(cancelled)return false;
  if(state==='guest'||state==='disconnected'){const target=state==='guest'?'/profile?return='+encodeURIComponent(location.pathname)+'#linked-whatsapp':'/profile#linked-whatsapp';close();location.href=target;return false;}
  const previouslyConnected=state==='connected';await refresh();
  // A retry that discovers a connection still needs an explicit confirmation.
  if(cancelled||!previouslyConnected||state!=='connected')return false;
  button.disabled=true;button.textContent='Preparing…';return true;
 }};
}
window.FilmGoPlayerUI={create,icon,parseSubtitles,whatsappRequest};
})();
