(()=>{
 try{
  const tiles=[...document.querySelectorAll('.poster-wall i')];
  if(!tiles.length)return;
  fetch('/movies.json',{cache:'force-cache'}).then(r=>r.ok?r.json():null).then(data=>{
   if(!data)return;
   const list=(Array.isArray(data)?data:data.movies||Object.values(data)).map(m=>m&&m.poster).filter(p=>typeof p==='string'&&(/^https:\/\//.test(p)||/^\/posters\/[a-f0-9]{24}\.jpg$/.test(p)));
   if(!list.length)return;
   for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
   tiles.forEach((tile,i)=>{const src=list[i%list.length];const img=new Image();img.referrerPolicy='no-referrer';img.onload=()=>{tile.style.backgroundImage='url("'+src.replace(/"/g,'%22')+'")'};img.src=src});
  }).catch(()=>{});
 }catch{}
})();
