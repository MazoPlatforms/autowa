const episodeSlug=decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1)||'');
const $=id=>document.getElementById(id);const loading=$('watch-loading'),error=$('watch-error'),content=$('watch-content'),video=$('watch-video');
const showError=text=>{loading.hidden=true;error.hidden=false;error.replaceChildren(document.createTextNode(text));};
const signIn=()=>{const link=document.createElement('a');link.href='/profile?return='+encodeURIComponent(location.pathname);link.textContent='Sign in using Phone';error.append(document.createTextNode(' '),link);};
(async()=>{
 try{
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(episodeSlug))throw Error('Episode unavailable.');
  const response=await fetch('/api/anime/episode/'+encodeURIComponent(episodeSlug),{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Episode unavailable.');const data=await response.json(),episode=data.episode,anime=data.anime;
  $('watch-title').textContent=anime.title+' · Episode '+episode.episode;$('watch-meta').textContent=['Season '+episode.season,episode.part&&'Part '+episode.part,episode.quality].filter(Boolean).join(' · ');$('watch-back').href='/anime/title/'+encodeURIComponent(anime.slug_id);document.title=anime.title+' · Episode '+episode.episode+' — FilmGo';if(anime.poster)video.poster=anime.poster;
  const me=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});if(me.status===401){showError('Sign in is required to watch this episode.');signIn();return;}if(!me.ok)throw Error('Unable to verify your sign-in.');
  video.src='/api/anime/stream/'+encodeURIComponent(episode.slug_id);video.addEventListener('error',()=>{$('watch-status').textContent='This episode could not be played in your browser.'},{once:true});loading.hidden=true;content.hidden=false;video.load();
 }catch(err){showError(err.message||'Episode unavailable.');}
})();
