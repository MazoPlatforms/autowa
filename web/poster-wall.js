(()=>{
 try{
  const tiles=[...document.querySelectorAll('.poster-wall i')];
  if(!tiles.length)return;
  const list=[...Array.from({length:25},(_,i)=>`/posters/background/bg-${String(i+1).padStart(2,'0')}.webp`),'/posters/background/bg-28.webp','/posters/background/bg-29.webp','/posters/background/bg-30.webp'];
  if(!list.length)return;
  Promise.resolve().then(()=>{
   for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
   tiles.forEach((tile,i)=>{const src=list[i%list.length];const img=new Image();img.referrerPolicy='no-referrer';img.onload=()=>{tile.style.backgroundImage='url("'+src.replace(/"/g,'%22')+'")'};img.src=src});
  }).catch(()=>{});
 }catch{}
})();
