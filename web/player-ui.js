/* FilmGo shared video player UI. Used by the movie page (catalog.js) and the anime page (anime-watch.js).
   It builds the markup and the settings menu; playback logic stays in the host pages. */
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg';
const ICONS={
 play:['<path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.3-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6Z"/>',1],
 pause:['<rect x="6" y="5" width="4.2" height="14" rx="1.3"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.3"/>',1],
 settings:['<path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98L14.5 2.42C14.47 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.5.42L9.12 5.07c-.61.25-1.18.59-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/>',1],
 fullscreen:['<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'],
 exitfs:['<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'],
 close:['<path d="M6 6l12 12M18 6 6 18"/>'],
 pip:['<rect x="3" y="5" width="18" height="14" rx="2.6"/><rect x="12" y="11" width="6.5" height="5" rx="1.2" fill="currentColor" stroke="none"/>'],
 speed:['<path d="M3.3 17a9 9 0 1 1 17.4 0"/><path d="m12 14 4-4.5"/><circle cx="12" cy="14.5" r="1" fill="currentColor"/>'],
 audio:['<path d="M3 10v4h3.5l5 3.8V6.2L6.5 10H3Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>'],
 subtitles:['<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.4 10.3a2.3 2.3 0 1 0 0 3.4M17 10.3a2.3 2.3 0 1 0 0 3.4"/>'],
 volume:['<path d="M3 10v4h3.5l5 3.8V6.2L6.5 10H3Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>'],
 volumeLow:['<path d="M3 10v4h3.5l5 3.8V6.2L6.5 10H3Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/>'],
 mute:['<path d="M3 10v4h3.5l5 3.8V6.2L6.5 10H3Z"/><path d="m16 9.5 5 5m0-5-5 5"/>'],
 quality:['<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7.2 9.8v4.4M7.2 12h3.2M10.4 9.8v4.4M13.6 9.8v4.4h1.3a2.2 2.2 0 0 0 0-4.4h-1.3Z"/>'],
 aspect:['<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3"/><rect x="8.5" y="9" width="7" height="6" rx="1.2"/>'],
 moon:['<path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z"/>'],
 loop:['<path d="m17 2 3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="m7 22-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'],
 chevR:['<path d="m9 18 6-6-6-6"/>'],
 chevL:['<path d="m15 18-6-6 6-6"/>'],
 check:['<path d="m5 12.5 4.6 4.6L19 7.4"/>'],
 upload:['<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'],
 skipNext:['<path d="M6 5.2v13.6a.8.8 0 0 0 1.25.66l9-6.8a.8.8 0 0 0 0-1.32l-9-6.8A.8.8 0 0 0 6 5.2Z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>'],
 back10:['<path d="M3 12a9 9 0 1 0 2.9-6.6L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.5" text-anchor="middle" font-size="7.8" font-weight="700" fill="currentColor" stroke="none" font-family="Inter,system-ui,sans-serif">10</text>'],
 fwd10:['<path d="M21 12a9 9 0 1 1-2.9-6.6L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" text-anchor="middle" font-size="7.8" font-weight="700" fill="currentColor" stroke="none" font-family="Inter,system-ui,sans-serif">10</text>'],
 plus:['<path d="M12 5v14M5 12h14"/>'],
 minus:['<path d="M5 12h14"/>']
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
 const syncVideo=()=>{const v=getVideo();if(v&&v!==lastV){lastV=v;v.loop=loop;if(custom.on)applyCustom(v);}};
 const onMedia=e=>{
  const t=e.target;if(!(t instanceof HTMLVideoElement)||t.classList.contains('filmgo-staging-video'))return;
  if(e.type==='play'||e.type==='playing')player.classList.add('fgp-playing');
  else if(e.type==='pause'||e.type==='emptied'||e.type==='ended')player.classList.remove('fgp-playing');
  if(e.type==='loadedmetadata')syncVideo();
  if(e.type==='progress'||e.type==='timeupdate'||e.type==='loadedmetadata'||e.type==='seeked')syncBuffered();
  if(e.type==='ratechange'||e.type==='loadedmetadata')syncSpeed();
  bigplay.setAttribute('aria-label',t.paused?'Play':'Pause');
 };
 for(const n of ['play','playing','pause','emptied','ended','progress','timeupdate','loadedmetadata','seeked','ratechange'])viewport.addEventListener(n,onMedia,true);
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
   const at=audioTracks(),act=at.find(t=>t.enabled);
   body.append(item({ico:'audio',label:'Audio track',value:at.length>1?(act?trackName(act,at.indexOf(act),'Audio'):'Default'):'Default',go:at.length>1,disabled:at.length<2,run:()=>go('audio')}));
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
   menuTitle.textContent='Audio track';const at=audioTracks();
   at.forEach((t,i)=>body.append(item({label:trackName(t,i,'Audio'),sel:t.enabled,check:t.enabled,run:()=>{at.forEach(x=>{x.enabled=x===t;});render();}})));
   if(!at.length)body.append(el('p','fgp-note','This video exposes a single audio track.'));
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
window.FilmGoPlayerUI={create,icon,parseSubtitles};
})();
