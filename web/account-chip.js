// Account chip for the anime pages (same behaviour as the movies catalog).
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
