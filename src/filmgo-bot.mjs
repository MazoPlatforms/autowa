import crypto from 'node:crypto';
import {logFilmGo} from './filmgo-logs.mjs';

const TOKEN=process.env.BOT_TOKEN||'';
const ADMIN_ID=String(process.env.FILMGO_BOT_ADMIN_ID||'7744742903');
const CHANNEL_ID=String(process.env.TELEGRAM_CHANNEL_ID||'');
const REDIS_URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const REDIS_TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';
const GH_TOKEN=process.env.GITHUB_DISPATCH_TOKEN||'';
const REPO=process.env.GITHUB_REPOSITORY||'';
const prefix='filmgo:bot:v1:';
const MAX_BYTES=2_000_000_000;
const REFUND_TOKEN_SCRIPT="local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local used=tonumber(raw); local cost=tonumber(ARGV[1]); if used<=cost then redis.call('DEL',KEYS[1]); return 0 end; return redis.call('INCRBY',KEYS[1],-cost)";
const QUALITY=/\b(360|480|720|1080|1440|2160)p\b|\b4k\b/i;
const DRAFT_KEY=prefix+'draft:';
const OPTIONAL_FIELDS=[['imdb_id','IMDb ID'],['poster','Poster'],['genre','Genre'],['runtime','Runtime'],['director','Director'],['cast','Cast'],['plot','Plot']];
const normalize=v=>String(v||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'');
export const filenameParts=name=>{
 const raw=String(name||'').replace(/\.[^.]+$/,'').replace(/[._]+/g,' ').replace(/\s+/g,' ').trim();
 const yearMatch=raw.match(/\b((?:19|20)\d{2})\b/);
 const qualityMatch=raw.match(QUALITY);
 const cut=Math.min(yearMatch?.index??Infinity,qualityMatch?.index??Infinity);
 let title=(Number.isFinite(cut)?raw.slice(0,cut):raw).replace(/^@\S+\s*/,'').trim();
 // Release-group prefixes such as [CC] and [MM] are tags, not part of the title.
 while(/^\[[A-Z0-9]{2,5}\]\s*/i.test(title))title=title.replace(/^\[[A-Z0-9]{2,5}\]\s*/i,'');
 title=title.replace(/[\s([{]+$/g,'').replace(/[\])}]+$/g,'').replace(/\s+/g,' ').trim();
 const quality=qualityMatch?.[0]?.toLowerCase()==='4k'?'2160p':qualityMatch?.[0]?.toLowerCase()||null;
 return {title,year:Number(yearMatch?.[1])||null,quality};
};
async function catalog(){const r=await fetch('https://raw.githubusercontent.com/'+REPO+'/main/data/movies.json?ts='+Date.now(),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error('Catalog unavailable');return (await r.json()).movies||[];}
async function draftGet(){const raw=await redis('GET',DRAFT_KEY+ADMIN_ID);return raw?JSON.parse(raw):null;}
async function draftSave(d){await redis('SET',DRAFT_KEY+ADMIN_ID,JSON.stringify(d),'EX',86400*7);}
async function askForTitle(d){d.stage='await-title';await draftSave(d);return say(ADMIN_ID,'I could not identify the movie title from the filename. Please send the movie title.');}
async function askForYear(d){d.stage='await-year';await draftSave(d);return say(ADMIN_ID,'What is the release year for "'+d.title+'"? Send the four-digit year.');}
async function askOptional(d,index=0){
 d.stage='await-optional';d.optionalIndex=index;await draftSave(d);
 const [field,label]=OPTIONAL_FIELDS[index];
 return say(ADMIN_ID,'Optional movie information — '+label+'. '+(field==='poster'?'Send a JPEG poster or type /skip.':'Send '+label.toLowerCase()+' or type /skip.')+' ('+(index+1)+'/'+OPTIONAL_FIELDS.length+')');
}
async function findCatalogMovie(d){
 const movies=await catalog();
 return movies.find(m=>Number(m.year)===Number(d.year)&&normalize(m.title)===normalize(d.title))||null;
}
async function askOmdbConfirmation(d,result){
 d.omdb_candidate=movieFields(result);d.stage='await-omdb-confirm';await draftSave(d);
 const candidate=d.omdb_candidate;
 const details=[candidate.title+' ('+candidate.year+')',candidate.imdb_id?'IMDb: '+candidate.imdb_id:'',candidate.genre?'Genre: '+candidate.genre:'',candidate.runtime?'Runtime: '+candidate.runtime:'',candidate.director?'Director: '+candidate.director:'',candidate.cast?'Cast: '+candidate.cast:'',candidate.plot?'Plot: '+candidate.plot:''].filter(Boolean).join('\n');
 return say(ADMIN_ID,'OMDb result found. Is this the correct movie?\n\n'+details,{reply_markup:{inline_keyboard:[[{text:'Yes, use this result',callback_data:'fg:omdb:yes'},{text:'No, enter details manually',callback_data:'fg:omdb:no'}]]}});
}
async function resumeDraft(d){
 if(d.stage==='await-title')return say(ADMIN_ID,'Please send the movie title for the uploaded file.');
 if(d.stage==='await-year')return say(ADMIN_ID,'What is the release year for "'+d.title+'"? Send the four-digit year.');
 if(d.stage==='await-omdb-confirm'&&d.omdb_candidate){const c=d.omdb_candidate;return say(ADMIN_ID,'OMDb result found. Is this the correct movie?\n\n'+[c.title+' ('+c.year+')',c.imdb_id?'IMDb: '+c.imdb_id:'',c.genre?'Genre: '+c.genre:'',c.runtime?'Runtime: '+c.runtime:'',c.director?'Director: '+c.director:'',c.cast?'Cast: '+c.cast:'',c.plot?'Plot: '+c.plot:''].filter(Boolean).join('\n'),{reply_markup:{inline_keyboard:[[{text:'Yes, use this result',callback_data:'fg:omdb:yes'},{text:'No, enter details manually',callback_data:'fg:omdb:no'}]]}});}
 if(d.stage==='await-optional')return askOptional(d,d.optionalIndex||0);
 if(d.stage==='looking-up')return say(ADMIN_ID,'OMDb lookup is in progress. Please wait for the result.');
 return draftPrompt(d);
}
async function startOmdbLookup(d){
 d.stage='looking-up';await draftSave(d);
 const resolved=await resolveOmdbMovie(d.title,d.year).catch(()=>null);
 if(resolved?.movie&&Number(String(resolved.movie.Year).slice(0,4))===Number(d.year))return askOmdbConfirmation(d,resolved.movie);
 delete d.omdb_candidate;
 await say(ADMIN_ID,'I could not find a matching OMDb result for '+d.title+' ('+d.year+'). You can enter the available movie details manually; unknown fields can be skipped.');
 return askOptional(d);
}
async function continueAfterIdentity(d){
 const existing=await findCatalogMovie(d).catch(()=>null);
 d.existing=!!existing;d.slug_id=existing?.slug_id;
 d.replace=!!(existing&&Object.keys(existing.qualities||{}).some(q=>q.toLowerCase()===String(d.quality).toLowerCase()));
 d.stage='await-publish';await draftSave(d);
 if(!d.replace){return publishDraft(d);}
 return draftPrompt(d);
}
async function acceptOmdbResult(d){
 Object.assign(d,d.omdb_candidate||{});delete d.omdb_candidate;
 return continueAfterIdentity(d);
}
async function finishManualMetadata(d){
 const existing=await findCatalogMovie(d).catch(()=>null);
 d.existing=!!existing;d.slug_id=existing?.slug_id;
 d.replace=!!(existing&&Object.keys(existing.qualities||{}).some(q=>q.toLowerCase()===String(d.quality).toLowerCase()));
 d.stage='await-publish';await draftSave(d);return draftPrompt(d);
}
function similarity(a,b){
 a=normalize(a);b=normalize(b);if(!a||!b)return 0;if(a===b)return 1;
 const previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){let diagonal=previous[0];previous[0]=i;for(let j=1;j<=b.length;j++){const old=previous[j];previous[j]=Math.min(previous[j]+1,previous[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=old;}}
 return 1-previous[b.length]/Math.max(a.length,b.length);
}
export function guessMovie(file,movies){
 const p=filenameParts(file.file_name||'');
 const candidates=movies.filter(m=>!p.year||Number(m.year)===p.year);
 const exact=candidates.find(m=>normalize(m.title)===normalize(p.title));
 if(exact)return {parts:p,best:exact,confidence:1};
 const scored=candidates.map(m=>{
  let score=similarity(p.title,m.title);
  for(const v of Object.values(m.qualities||{}))score=Math.max(score,similarity(p.title,filenameParts(v.file_name).title));
  return {movie:m,score};
 }).sort((a,b)=>b.score-a.score);
 const winner=scored[0];
 return {parts:p,best:winner?.score>=0.7&&(!scored[1]||winner.score-scored[1].score>=0.1)?winner.movie:null,confidence:winner?.score||0};
}
const captionValue=(value,max)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
export function telegramMovieCaption(movie,quality){
 const title=captionValue(movie.title,150),year=Number(movie.year),lines=['🎬 FilmGo','','🎞️ '+title+(Number.isInteger(year)?' ('+year+')':''),'','📺 Quality: '+captionValue(quality,30)];
 const genre=Array.isArray(movie.genre)?movie.genre.join(', '):movie.genre;
 for(const [label,value,max] of [['🎭 Genre',genre,120],['⏱ Runtime',movie.runtime,40],['🎬 Director',movie.director,100],['⭐ IMDb',movie.imdb_rating,20],['👥 Cast',Array.isArray(movie.cast)?movie.cast.join(', '):movie.cast,150]]){
  const text=captionValue(value,max);if(text)lines.push(label+': '+text);
 }
 const plot=captionValue(movie.plot,260);if(plot)lines.push('','📝 '+plot);
 lines.push('','Enjoy the movie!','','> Powered by Itz Maazin • https://mzn.is-a.dev/');
 return Array.from(lines.join('\n')).slice(0,1024).join('');
}
export function telegramMovieButtons(baseUrl,slug,quality){
 const base=new URL(baseUrl);
 if(base.protocol!=='https:'||!/^[-A-Za-z0-9_]{1,80}$/.test(String(slug||'')))throw Error('Invalid FilmGo action link');
 const id=encodeURIComponent(slug),q=encodeURIComponent(String(quality||''));
 return {inline_keyboard:[[{text:'▶️ Stream on FilmGo',url:new URL('/title/'+id,base).href},{text:'⬇️ Download',url:new URL('/download/'+id+'?quality='+q,base).href}]]};
}
async function omdbSearch(title,year){const key=process.env.OMDB_API_KEY;if(!key)return null;const url='https://www.omdbapi.com/?'+new URLSearchParams({apikey:key,t:title,...(year?{y:String(year)}:{})});const r=await fetch(url,{signal:AbortSignal.timeout(10000)});const j=await r.json();return j.Response==='True'?j:null;}
async function omdbById(imdbId){const key=process.env.OMDB_API_KEY;if(!key||!/^tt\d+$/.test(String(imdbId||'')))return null;const url='https://www.omdbapi.com/?'+new URLSearchParams({apikey:key,i:imdbId});const r=await fetch(url,{signal:AbortSignal.timeout(10000)});const j=await r.json();return j.Response==='True'?j:null;}
async function imdbSuggestionSearch(title){const query=encodeURIComponent(String(title||'').trim().replace(/\s+/g,'_'));if(!query)return[];const r=await fetch('https://v3.sg.media-imdb.com/suggestion/x/'+query+'.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)return[];const j=await r.json();return Array.isArray(j.d)?j.d.filter(x=>x.qid==='movie'&&x.id&&x.l):[];}
function sequelKey(value){return normalize(value).replace(/chapter|part|volume|season/g,'');}
function suggestionScore(input,candidate,year){if(Number(candidate.y)!==Number(year))return 0;const a=normalize(input),b=normalize(candidate.l),sa=sequelKey(input),sb=sequelKey(candidate.l);if(a===b)return 1;if(sa&&sa===sb)return .98;return similarity(input,candidate.l);}
async function resolveOmdbMovie(title,year){
 const direct=await omdbSearch(title,year).catch(()=>null);
 if(direct&&Number(String(direct.Year).slice(0,4))===Number(year))return {movie:direct,confidence:similarity(title,direct.Title),source:'omdb'};
 const candidates=[];
 for(const query of [title,...(sequelKey(title)!==normalize(title)?[sequelKey(title)]:[])]){
  const items=await imdbSuggestionSearch(query).catch(()=>[]);
  for(const item of items){const score=suggestionScore(title,item,year);if(score)candidates.push({item,score});}
 }
 const ranked=Array.from(new Map(candidates.map(x=>[x.item.id,x])).values()).sort((a,b)=>b.score-a.score);
 const winner=ranked[0];
 if(!winner||winner.score<.5||(!ranked[1]||winner.score-ranked[1].score<.1))return null;
 const movie=await omdbById(winner.item.id).catch(()=>null);
 if(!movie||Number(String(movie.Year).slice(0,4))!==Number(year))return null;
 return {movie,confidence:winner.score,source:'imdb-suggestion'};
}
function movieFields(x){return {title:x.Title,year:Number(String(x.Year).slice(0,4)),imdb_id:x.imdbID,poster:x.Poster?.startsWith('https://')?x.Poster:null,genre:x.Genre,runtime:x.Runtime,director:x.Director,cast:x.Actors,plot:x.Plot};}
async function draftPrompt(d){const text=['FilmGo movie draft',d.title+' ('+d.year+')', 'Quality: '+d.quality,'File: '+d.file_name,'Metadata: '+(d.imdb_id?'OMDb '+d.imdb_id:'manual / existing'),d.replace?'Existing quality — replacement requires confirmation':d.existing?'New quality for existing movie':'New movie', 'Use /edit to change metadata, /poster to upload a JPEG poster, /cancel to discard.'].join('\n');await say(ADMIN_ID,text,{reply_markup:{inline_keyboard:[[{text:d.replace?'Confirm replacement':'Publish movie',callback_data:'fg:publish'},{text:'Cancel',callback_data:'fg:cancel'}]]}});}
async function posterUpload(d,photo){const info=await tg('getFile',{file_id:photo.file_id});if(!info.file_path||photo.file_size>5_000_000)throw Error('Poster too large or unavailable');const file=await fetch('https://api.telegram.org/file/bot'+TOKEN+'/'+info.file_path,{signal:AbortSignal.timeout(15000)});if(!file.ok)throw Error('Poster fetch failed');const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>5_000_000||bytes[0]!==255||bytes[1]!==216)throw Error('Only JPEG posters under 5 MB');const path='web/posters/'+crypto.randomBytes(12).toString('hex')+'.jpg';const [owner,name]=REPO.split('/');const result=await fetch('https://api.github.com/repos/'+owner+'/'+name+'/contents/'+path,{method:'PUT',headers:{Authorization:'Bearer '+GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({message:'Add FilmGo movie poster',content:Buffer.from(bytes).toString('base64')}),signal:AbortSignal.timeout(20000)});if(!result.ok)throw Error('GitHub poster upload failed: '+result.status);d.poster='/posters/'+path.split('/').pop();await draftSave(d);}
async function saveMovieMetadata(id,d){
 const fields={};for(const k of ['imdb_id','poster','genre','runtime','director','cast','plot'])if(d[k])fields[k]=d[k];
 if(!Object.keys(fields).length)return;
 const [owner,name]=REPO.split('/');
 const url='https://api.github.com/repos/'+owner+'/'+name+'/contents/data/movies.json';
 const headers={Authorization:'Bearer '+GH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'};
 for(let attempt=0;attempt<6;attempt++){
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Catalog read '+response.status);
  const file=await response.json();
  const content=JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'));
  const movie=(content.movies||[]).find(m=>
   (d.slug_id&&m.slug_id===d.slug_id)||
   (Number(m.year)===Number(d.year)&&normalize(m.title)===normalize(d.title))||
   Object.values(m.qualities||{}).some(v=>Number(v.telegram_message_id)===Number(id))
  );
  if(movie){Object.assign(movie,fields);}
  else{
   // The Telegram sync will discover the new message; store metadata in the
   // canonical catalog now so the subsequent sync can preserve it.
   content.movies ||= [];
   content.movies.push({id:'telegram-'+id,slug_id:d.slug_id||crypto.randomBytes(12).toString('base64url'),title:d.title,year:Number(d.year),qualities:{[d.quality]:{telegram_message_id:id,file_name:d.file_name||'',file_size:0,mime_type:''}},telegram_message_id:id,quality:d.quality,file_name:d.file_name||'',file_size:0,mime_type:'',...fields});
  }
  const result=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Update FilmGo movie metadata in canonical movies.json',content:Buffer.from(JSON.stringify(content,null,2)+'\n').toString('base64'),sha:file.sha}),signal:AbortSignal.timeout(15000)});
  if(result.ok)return;
  if(result.status!==409&&result.status!==422)throw Error('Catalog write '+result.status);
 }
 throw Error('Catalog update conflict');
}
async function publishDraft(d){const lock=prefix+'publishing:'+ADMIN_ID;if(await redis('SET',lock,'1','NX','EX',90)!=='OK')return say(ADMIN_ID,'Publishing is already running.');try{const caption=['Movie: '+d.title,'Year: '+d.year,'Quality: '+d.quality,...(d.slug_id?['Slug ID: '+d.slug_id]:[])].join('\n');const sent=await tg('copyMessage',{chat_id:CHANNEL_ID,from_chat_id:ADMIN_ID,message_id:d.message_id,caption},30000);await saveMovieMetadata(sent.message_id,d);await redis('DEL',DRAFT_KEY+ADMIN_ID);void logFilmGo('movies','🎬 Published: '+d.title+' ('+d.year+') · '+d.quality+' · channel #'+sent.message_id);await dispatch('filmgo-catalog-sync',{message_id:sent.message_id});}finally{await redis('DEL',lock);}}

let running=false;
async function redis(...args){
 const r=await fetch(REDIS_URL,{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Bot Redis unavailable');
 const j=await r.json();if(j.error)throw Error('Bot Redis error');return j.result;
}
async function tg(method,data={},timeout=20000){
 const r=await fetch('https://api.telegram.org/bot'+TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(timeout)});
 const j=await r.json();if(!j.ok)throw Error('Telegram '+method+': '+String(j.description).slice(0,160));return j.result;
}
async function say(chat_id,text,extra={}){return tg('sendMessage',{chat_id,text,disable_web_page_preview:true,...extra});}
async function dispatch(type,payload){
 if(!/^[\w.-]+\/[\w.-]+$/.test(REPO))throw Error('GitHub repository missing');
 const [owner,name]=REPO.split('/');
 const r=await fetch('https://api.github.com/repos/'+owner+'/'+name+'/dispatches',{method:'POST',headers:{Authorization:'Bearer '+GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({event_type:type,client_payload:payload}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('GitHub dispatch rejected ('+r.status+')');
}
function source(url){
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost')return null;
 const drive=/^(drive|docs)\.google\.com$/.test(u.hostname);
 if(!drive&&!/^https?:$/.test(u.protocol))return null;
 return {url:u.href,drive};
 }catch{return null;}
}
async function probe(input){
 const u=source(input);if(!u)return {error:'Only HTTPS direct links and Google Drive links are accepted.'};
 if(u.drive)return {size:null,drive:true,url:u.url};
 // Never fetch arbitrary URLs from the Koyeb service. GitHub runner performs the download.
 return {size:null,drive:false,url:u.url};
}
async function onMessage(message,refresh){
 const from=String(message.from?.id||''),chat=message.chat?.id;
 const deep=String(message.text||'').trim().match(/^\/start(?:@\w+)?\s+m_([A-Za-z0-9_-]{16})$/);
 if(deep&&message.chat?.type==='private'){
  const key='filmgo:deeplink:'+deep[1];
  const raw=await redis('GET',key);let grant;
  try{grant=raw?JSON.parse(raw):null;}catch{}
  if(!grant||!/^[-a-f0-9]{64}$/.test(grant.account_hash||''))return say(chat,'This movie link has expired. Please sign in on FilmGo and request a new link.');
  const movie=(await catalog()).find(m=>m.slug_id===grant.slug_id);
  if(!movie)return say(chat,'Movie is no longer available.');
  const qualities=Object.keys(movie.qualities||{[movie.quality]:movie});
  const chosen=qualities.find(q=>q.toLowerCase()==='720p')||qualities[0];
  const variant=movie.qualities?.[chosen]||movie;
  if(!Number.isSafeInteger(variant.telegram_message_id))return say(chat,'Movie is unavailable.');
  const claimKey='filmgo:deeplink-claim:'+deep[1];
  if(await redis('SET',claimKey,'1','NX','EX',600)!=='OK')return say(chat,'This movie link is already being processed.');
  const now=new Date(),day=now.toISOString().slice(0,10),resetAt=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1),expireAt=Math.ceil(resetAt/1000);
  const usageKey='filmgo:daily-tokens:v1:'+grant.account_hash+':'+day;
  const size=Number(variant.file_size||movie.file_size||0);
  if(!Number.isSafeInteger(size)||size<=0){await redis('DEL',claimKey);return say(chat,'Movie file size is unavailable. Please try again later.');}
  const cost=Math.max(1,Math.ceil((size/(512*1024*1024)*0.75+1)*1000));
  const refundTokens=async()=>{if(!grant.unlimited)await redis('EVAL',REFUND_TOKEN_SCRIPT,1,usageKey,cost).catch(()=>{});};
  const script="local used=tonumber(redis.call('GET',KEYS[1]) or '0'); local cost=tonumber(ARGV[1]); if used+cost>50000 then return -1 end; local next=redis.call('INCRBY',KEYS[1],cost); if next==cost then redis.call('EXPIREAT',KEYS[1],ARGV[2]) end; return next";
  const used=grant.unlimited?0:Number(await redis('EVAL',script,1,usageKey,cost,expireAt));
  if(!grant.unlimited&&used<0){await redis('DEL',claimKey);return say(chat,'Daily token limit reached. Your tokens reset at 00:00:00 UTC.');}
  const baseUrl=grant.base_url||process.env.FILMGO_PUBLIC_URL;
  if(!baseUrl){await refundTokens();await redis('DEL',claimKey);return say(chat,'FilmGo links are temporarily unavailable. Please request a new link later.');}
  let replyMarkup;
  try{replyMarkup=telegramMovieButtons(baseUrl,movie.slug_id,chosen);}
  catch{await refundTokens();await redis('DEL',claimKey);return say(chat,'FilmGo links are temporarily unavailable. Please request a new link later.');}
  try{await tg('copyMessage',{chat_id:chat,from_chat_id:CHANNEL_ID,message_id:variant.telegram_message_id,caption:telegramMovieCaption(movie,chosen),reply_markup:replyMarkup});}
  catch(err){await refundTokens();await redis('DEL',claimKey);await say(chat,'Could not deliver this movie right now. You can open the same FilmGo link and retry.');return;}
  await redis('DEL',key);
  void logFilmGo('downloads','Telegram movie requested: '+movie.title+' ('+movie.year+')');
  return;
 }
 if(from!==ADMIN_ID||String(chat)!==ADMIN_ID)return;
 const text=String(message.text||'').trim();
 if(/^\/(start|help)(?:@\w+)?$/.test(text)){await say(chat,'Send a movie file to create a draft. If title or year is missing, I will ask for it. /draft resumes the current step, /edit field=value changes metadata, /skip skips an optional metadata field, /poster requests a JPEG poster, and /cancel discards the draft. /download URL keeps the remote import workflow.');return;}
 if(/^\/status(?:@\w+)?$/.test(text)){await say(chat,'FilmGo bot online.');return;}
 if(/^\/draft(?:@\w+)?$/.test(text)){const d=await draftGet();return d?resumeDraft(d):say(chat,'No active draft. Send a movie file.');}
 if(/^\/cancel(?:@\w+)?$/.test(text)){await redis('DEL',DRAFT_KEY+ADMIN_ID);return say(chat,'Draft cancelled.');}
 const file=message.document||message.video;
 if(file){
  const active=await draftGet();if(active)return say(chat,'There is already an active movie draft. Finish it or use /cancel before sending another file.');
  if(file.file_size>MAX_BYTES)return say(chat,'File exceeds the current 2 GB limit.');
  const name=file.file_name||'',parts=filenameParts(name);
  if(!parts.quality)return say(chat,'Cannot identify quality from filename. Rename the file with 360p, 480p, 720p, 1080p or 2160p and resend.');
  const movies=await catalog(),found=guessMovie(file,movies),existing=found.best;
  const title=existing?.title||parts.title,year=existing?.year||parts.year;
  const d={message_id:message.message_id,file_name:name,title:title||'',year:year||null,quality:parts.quality,existing:!!existing,replace:!!(existing&&Object.keys(existing.qualities||{}).some(q=>q.toLowerCase()===parts.quality)),slug_id:existing?.slug_id,manual_identity:!existing&&(!title||!year)};
  if(!title)return askForTitle(d);
  if(!year)return askForYear(d);
  const resolved=existing?null:await resolveOmdbMovie(title,year).catch(()=>null);
  const omdb=resolved?.movie;
  const omdbConfidence=omdb&&Number(String(omdb.Year).slice(0,4))===year?resolved.confidence:0;
  const trusted=!!existing||(resolved?.source==='omdb'&&omdbConfidence>=0.7);
  Object.assign(d,omdbConfidence>=0.6?movieFields(omdb):{});
  if(omdbConfidence>=0.6){d.title=omdb.Title;d.year=Number(String(omdb.Year).slice(0,4));}
  d.stage='await-publish';
  await draftSave(d);
  if(trusted&&!d.replace){
   await say(chat,'Recognized '+d.title+' ('+d.year+') at '+Math.round((existing?found.confidence:omdbConfidence)*100)+'% confidence. Publishing automatically.');
   return publishDraft(d);
  }
  return draftPrompt(d);
 }
 const d=await draftGet();
 if(message.photo?.length&&d){
  try{await posterUpload(d,message.photo.at(-1));}
  catch(err){return say(chat,err.message);}
  if(d.stage==='await-optional'&&OPTIONAL_FIELDS[d.optionalIndex]?.[0]==='poster'){
   const next=d.optionalIndex+1;
   if(next<OPTIONAL_FIELDS.length)return askOptional(d,next);
   return finishManualMetadata(d);
  }
  return resumeDraft(d);
 }
 if(/^\/poster(?:@\w+)?$/.test(text))return say(chat,'Send a JPEG photo in this chat to save it as the draft poster.');
 if(d?.stage==='await-title'){
  if(!text||text.startsWith('/'))return say(chat,'Please send the movie title as a message, or use /cancel to discard this draft.');
  d.title=text.slice(0,180).trim();
  if(!d.title)return askForTitle(d);
  if(!d.year)return askForYear(d);
  return startOmdbLookup(d);
 }
 if(d?.stage==='await-year'){
  const year=text.match(/\b(19\d{2}|20\d{2})\b/);
  if(!year)return say(chat,'Please send a valid four-digit release year, for example 2019.');
  d.year=Number(year[1]);
  if(d.manual_identity)return startOmdbLookup(d);
  const movies=await catalog(),found=guessMovie({file_name:d.file_name},movies);
  if(found.best){d.title=found.best.title;d.year=found.best.year;d.existing=true;d.slug_id=found.best.slug_id;d.replace=Object.keys(found.best.qualities||{}).some(q=>q.toLowerCase()===String(d.quality).toLowerCase());d.stage='await-publish';await draftSave(d);if(!d.replace)return publishDraft(d);return draftPrompt(d);}
  d.manual_identity=true;return startOmdbLookup(d);
 }
 if(/^\/skip(?:@\w+)?$/i.test(text)&&d?.stage==='await-optional'){
  const next=(d.optionalIndex||0)+1;
  if(next<OPTIONAL_FIELDS.length)return askOptional(d,next);
  return finishManualMetadata(d);
 }
 if(d?.stage==='await-optional'){
  const [field,label]=OPTIONAL_FIELDS[d.optionalIndex||0];
  if(field==='poster')return say(chat,'Please send a JPEG poster photo or type /skip.');
  const value=text.trim();if(!value||value.startsWith('/'))return say(chat,'Send '+label.toLowerCase()+' or type /skip.');
  d[field]=value.slice(0,field==='plot'?2000:500);
  const next=(d.optionalIndex||0)+1;
  if(next<OPTIONAL_FIELDS.length)return askOptional(d,next);
  return finishManualMetadata(d);
 }
 if(d?.stage==='await-omdb-confirm'||d?.stage==='looking-up')return say(chat,'Please use the OMDb result buttons above. Use /draft to show the current step or /cancel to discard it.');
 const edit=text.match(/^\/edit\s+(title|year|genre|runtime|director|cast|plot|poster|imdb_id|quality)=(.+)$/is);
 if(edit&&d){const field=edit[1],value=edit[2].trim();if(field==='year'&&!/^(19|20)\d{2}$/.test(value))return say(chat,'Invalid year');if(field==='quality'&&!/^(360|480|720|1080|1440|2160)p$/i.test(value))return say(chat,'Invalid quality');d[field]=field==='year'?Number(value):value.slice(0,1000);d.stage='await-publish';await draftSave(d);return draftPrompt(d);}
 const match=text.match(/^\/download(?:@\w+)?\s+(\S+)$/i);
 if(!match){if(text.startsWith('/download'))await say(chat,'Usage: /download https://example.com/movie.mp4');return;}
 const data=await probe(match[1]);if(data.error){await say(chat,data.error);return;}
 const id=crypto.randomBytes(12).toString('hex');
 await redis('SET',prefix+'pending:'+id,JSON.stringify({url:data.url,admin:from,created:Date.now()}),'EX',900);
 await say(chat,'Confirm remote file import\n\nSource: '+(data.drive?'Google Drive':'Direct HTTPS')+'\nURL: '+data.url.slice(0,400)+'\nSize: unknown\nMaximum: 2 GB',{reply_markup:{inline_keyboard:[[{text:'Confirm import',callback_data:'fg:yes:'+id},{text:'Cancel',callback_data:'fg:no:'+id}]]}});
}
async function onCallback(q){
 if(String(q.from?.id)!==ADMIN_ID||String(q.message?.chat?.id)!==ADMIN_ID)return;
 const action=String(q.data||'');
 if(action==='fg:omdb:yes'||action==='fg:omdb:no'){
  await tg('answerCallbackQuery',{callback_query_id:q.id});const d=await draftGet();
  if(!d||d.stage!=='await-omdb-confirm')return say(ADMIN_ID,'This OMDb confirmation has expired. Send the file again to start a new draft.');
  if(action==='fg:omdb:yes')return acceptOmdbResult(d);
  delete d.omdb_candidate;await say(ADMIN_ID,'Okay, I will not use that OMDb result.');return askOptional(d);
 }
 if(action==='fg:publish'||action==='fg:cancel'){await tg('answerCallbackQuery',{callback_query_id:q.id});const d=await draftGet();if(!d)return say(ADMIN_ID,'Draft expired.');if(action==='fg:cancel'){await redis('DEL',DRAFT_KEY+ADMIN_ID);return say(ADMIN_ID,'Draft cancelled.');}if(d.stage&&d.stage!=='await-publish')return say(ADMIN_ID,'This draft is not ready to publish yet. Use /draft to continue the current step.');return publishDraft(d);}
 const m=action.match(/^fg:(yes|no):([a-f0-9]{24})$/);if(!m)return;
 await tg('answerCallbackQuery',{callback_query_id:q.id});
 const key=prefix+'pending:'+m[2],raw=await redis('GET',key);
 if(!raw){await say(ADMIN_ID,'Import confirmation expired or already used.');return;}
 const data=JSON.parse(raw);if(data.admin!==ADMIN_ID)return;
 // Atomic claim prevents repeated button taps from dispatching multiple jobs.
 if(await redis('SET',prefix+'claimed:'+m[2],'1','EX',3600,'NX')!=='OK')return;
 await redis('DEL',key);
 if(m[1]==='no'){await say(ADMIN_ID,'Import cancelled.');return;}
 try{await dispatch('filmgo-admin-import',{import_id:m[2],source_url:data.url,admin_id:ADMIN_ID});void logFilmGo('movies','📥 Remote movie import queued · job '+m[2]);}
 catch(err){await say(ADMIN_ID,'Unable to queue import: '+err.message);}
}
async function onChannel(message,refresh){
 if(String(message.chat?.id)!==CHANNEL_ID)return;
 if(message.from?.id && String(message.from.id)!==String((await tg('getMe')).id)){try{await tg('deleteMessage',{chat_id:CHANNEL_ID,message_id:message.message_id});}catch(e){console.warn('Unauthorized channel post could not be deleted:',e.message);}return;}
 if(!message.document&&!message.video)return;
 const file=message.document||message.video;
 if(!file.file_id)return;
 const dedupe=prefix+'channel:'+message.chat.id+':'+message.message_id+':'+(message.edit_date||message.date||0);
 if(await redis('SET',dedupe,'1','EX',86400*30,'NX')!=='OK')return;
 try{await refresh();await dispatch('filmgo-catalog-sync',{message_id:message.message_id});void logFilmGo('movies','🎬 Channel movie '+(message.edit_date?'edited':'detected')+' · message #'+message.message_id+' · catalog sync queued');}
 catch(err){await redis('DEL',dedupe);throw err;}
}
export function startFilmGoBot(refresh){
 if(!TOKEN||!GH_TOKEN||!REPO||!REDIS_URL||!REDIS_TOKEN||!CHANNEL_ID){console.warn('FilmGo Telegram bot disabled: missing configuration');return;}
 if(running)return;running=true;
 (async()=>{
  // Koyeb is the only Bot API update consumer; retain pending updates.
  try{await tg('deleteWebhook',{drop_pending_updates:false});}catch(err){console.warn('Bot webhook cleanup:',err.message);}
  // Only one Koyeb replica can poll at a time; lease is renewed each cycle.
  const owner=crypto.randomBytes(16).toString('hex');
  while(running){
   try{
    const lease=await redis('SET',prefix+'poller',owner,'EX',45,'NX');
    if(lease!=='OK'&&await redis('GET',prefix+'poller')!==owner){await new Promise(r=>setTimeout(r,12000));continue;}
    await redis('EXPIRE',prefix+'poller',45);
    const offset=Number(await redis('GET',prefix+'offset')||0);
    const updates=await tg('getUpdates',{offset,timeout:20,limit:50,allowed_updates:['message','channel_post','edited_channel_post','callback_query']},30000);
    for(const u of updates){
     try{
      if(u.channel_post)await onChannel(u.channel_post,refresh);
      if(u.edited_channel_post)await onChannel(u.edited_channel_post,refresh);
      if(u.message)await onMessage(u.message,refresh);
      if(u.callback_query)await onCallback(u.callback_query);
     }catch(err){console.error('FilmGo bot update error:',err.message);void logFilmGo('errors','Bot update error: '+err.message);}
     await redis('SET',prefix+'offset',String(u.update_id+1));
    }
   }catch(err){console.error('FilmGo bot polling error:',err.message);await new Promise(r=>setTimeout(r,5000));}
  }
 })().catch(err=>console.error('FilmGo bot fatal:',err.message));
}
