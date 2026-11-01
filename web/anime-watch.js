const episodeSlug=decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1)||'');
const $=id=>document.getElementById(id);
const icon=(kind)=>{const paths={play:'<path d="m9 6 10 6-10 6V6Z"/>',pause:'<path d="M8 6v12M16 6v12"/>',volume:'<path d="M4 10v4h3l4 3V7l-4 3H4Zm10.5-2a5 5 0 0 1 0 8M17 5a9 9 0 0 1 0 14"/>',mute:'<path d="m4 10 4 4m0-4-4 4M11 7v10"/>',fullscreen:'<path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"/>'};const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.innerHTML=paths[kind]||paths.play;return svg;};
const showError=text=>{$('watch-loading').hidden=true;$('watch-error').hidden=false;$('watch-error').replaceChildren(document.createTextNode(text));const link=document.createElement('a');link.href='/profile?return='+encodeURIComponent(location.pathname);link.textContent='Sign in using Phone';$('watch-error').append(document.createTextNode(' '),link);};
const formatTime=value=>{if(!Number.isFinite(value)||value<0)return'00:00';const total=Math.floor(value),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
const dateLabel=value=>{if(!value)return'';const date=new Date(value+'T00:00:00Z');return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(date);};
const episodeNumber=e=>Number(e?.episode??e?.number)||0;
const episodeUrl=e=>e?.slug_id?'/anime/watch/'+encodeURIComponent(e.slug_id):'#';
const sortEpisodes=episodes=>[...(episodes||[])].sort((a,b)=>(Number(a.season)||1)-(Number(b.season)||1)||episodeNumber(a)-episodeNumber(b));
const setButtonIcon=(button,kind)=>{button.replaceChildren(icon(kind));};

function setupPlayer(video){
 const shell=document.querySelector('.anime-player-shell'),play=$('player-play'),progress=$('player-progress'),time=$('player-time'),loading=$('player-loading'),volume=$('player-volume'),volumeButton=$('player-volume-button'),speed=$('player-speed'),pip=$('player-pip'),fullscreen=$('player-fullscreen'),feedback=$('seek-feedback');
 setButtonIcon(play,'play');setButtonIcon(volumeButton,'volume');setButtonIcon(fullscreen,'fullscreen');
 const update=()=>{const duration=Number.isFinite(video.duration)?video.duration:0;time.textContent=formatTime(video.currentTime)+' / '+formatTime(duration);progress.value=duration?String(Math.round(video.currentTime/duration*1000)):'0';setButtonIcon(play,video.paused?'play':'pause');play.setAttribute('aria-label',video.paused?'Play':'Pause');};
 const toggle=()=>video.paused?video.play().catch(()=>{}):video.pause();
 play.onclick=toggle;video.addEventListener('click',toggle);video.addEventListener('play',update);video.addEventListener('pause',update);video.addEventListener('timeupdate',update);video.addEventListener('loadedmetadata',update);
 progress.oninput=()=>{if(Number.isFinite(video.duration))video.currentTime=Number(progress.value)/1000*video.duration;};
 volume.oninput=()=>{video.volume=Number(volume.value);video.muted=video.volume===0;setButtonIcon(volumeButton,video.muted?'mute':'volume');};volumeButton.onclick=()=>{video.muted=!video.muted;setButtonIcon(volumeButton,video.muted?'mute':'volume');};
 const speeds=[1,1.25,1.5,2,.75];let speedIndex=0;speed.onclick=()=>{speedIndex=(speedIndex+1)%speeds.length;video.playbackRate=speeds[speedIndex];speed.textContent=speeds[speedIndex]+'×';};
 pip.onclick=()=>video.requestPictureInPicture?.().catch(()=>{});pip.disabled=!(document.pictureInPictureEnabled&&video.requestPictureInPicture);
 fullscreen.onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else shell.requestFullscreen?.().catch(()=>{});};
 video.addEventListener('waiting',()=>{loading.hidden=false;});video.addEventListener('playing',()=>{loading.hidden=true;});video.addEventListener('canplay',()=>{loading.hidden=true;});
 let feedbackTimer;const seekBy=seconds=>{video.currentTime=Math.max(0,Math.min(video.duration||0,video.currentTime+seconds));feedback.textContent=(seconds>0?'+':'')+seconds+'s';clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>feedback.textContent='',700);};
 shell.addEventListener('dblclick',event=>{const box=shell.getBoundingClientRect();seekBy(event.clientX-box.left<box.width/2?-10:10);});shell.addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();toggle();}if(event.key==='ArrowLeft')seekBy(-10);if(event.key==='ArrowRight')seekBy(10);if(event.key.toLowerCase()==='f')fullscreen.click();});
 return {setLoading:value=>{loading.hidden=!value;},setStatus:value=>{$('watch-status').textContent=value||'';}};
}

function renderSuggestions(items){if(!items?.length)return;const section=$('anime-suggestions'),grid=$('anime-suggestion-grid');section.hidden=false;for(const item of items){const link=document.createElement('a');link.className='anime-suggestion';link.href='/anime/title/'+encodeURIComponent(item.slug_id);const image=document.createElement('img');image.src=item.poster||'';image.alt='';image.loading='lazy';const label=document.createElement('span');label.textContent=item.title;link.append(image,label);grid.append(link);}}

(async()=>{
 try{
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(episodeSlug))throw Error('Episode unavailable.');
  const response=await fetch('/api/anime/episode/'+encodeURIComponent(episodeSlug),{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Episode unavailable.');const data=await response.json(),episode=data.episode,anime=data.anime;
  const episodes=sortEpisodes(anime.episodes),index=episodes.findIndex(item=>item.slug_id===episode.slug_id);$('watch-title').textContent=(episode.title?episode.title+' · ':'')+anime.title+' · Episode '+episode.episode;$('watch-meta').textContent=['Season '+episode.season,'Episode '+episode.episode,dateLabel(episode.released)].filter(Boolean).join(' · ');$('watch-back').href='/anime/title/'+encodeURIComponent(anime.slug_id);document.title=(episode.title||anime.title)+' · FilmGo';
  const video=$('watch-video');video.poster=episode.frame||anime.poster||'';const player=setupPlayer(video);
  const previous=$('episode-previous'),next=$('episode-next');if(index>0){previous.href=episodeUrl(episodes[index-1]);previous.hidden=false;}if(index>=0&&index<episodes.length-1){next.href=episodeUrl(episodes[index+1]);next.hidden=false;}
  const pageUrl=location.href,shareText=encodeURIComponent((episode.title||anime.title)+' · Episode '+episode.episode+'\n'+pageUrl);$('anime-whatsapp').href='https://wa.me/?text='+shareText;$('anime-telegram').href='https://t.me/share/url?url='+encodeURIComponent(pageUrl)+'&text='+encodeURIComponent(episode.title||anime.title+' · Episode '+episode.episode);$('anime-download').href='/api/anime/download/'+encodeURIComponent(episode.slug_id);$('anime-download').setAttribute('download','');renderSuggestions(data.suggestions);
  const me=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});if(me.status===401){showError('Sign in is required to watch this episode.');return;}if(!me.ok)throw Error('Unable to verify your sign-in.');
  video.src='/api/anime/stream/'+encodeURIComponent(episode.slug_id);video.addEventListener('error',()=>player.setStatus('This episode could not be played in your browser.'),{once:true});$('watch-loading').hidden=true;$('watch-content').hidden=false;video.load();
 }catch(err){showError(err.message||'Episode unavailable.');}
})();
