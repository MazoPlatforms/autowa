import crypto from 'node:crypto';
import fs from 'node:fs';
import {logFilmGo} from './filmgo-logs.mjs';

const TOKEN=process.env.BOT_TOKEN||'';
const ADMIN_ID=String(process.env.FILMGO_BOT_ADMIN_ID||'7744742903');
const CHANNEL_ID=String(process.env.TELEGRAM_CHANNEL_ID||'');
const ANIME_CHANNEL_ID=String(process.env.TELEGRAM_ANIME_CHANNEL_ID||'');
const REDIS_URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const REDIS_TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';
const GH_TOKEN=process.env.GITHUB_DISPATCH_TOKEN||'';
const REPO=process.env.GITHUB_REPOSITORY||'';
const prefix='filmgo:bot:v1:';
const MAX_BYTES=2_000_000_000;
const REFUND_TOKEN_SCRIPT="local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local used=tonumber(raw); local cost=tonumber(ARGV[1]); if used<=cost then redis.call('DEL',KEYS[1]); return 0 end; return redis.call('INCRBY',KEYS[1],-cost)";
const QUALITY=/\b(360|480|720|1080|1440|2160)p\b|\b4k\b/i;
const DRAFT_KEY=prefix+'draft:';
const MEDIA_CHOICE_KEY=prefix+'media-choice:';
const OPTIONAL_FIELDS=[['imdb_id','IMDb ID'],['poster','Poster'],['genre','Genre'],['runtime','Runtime'],['director','Director'],['cast','Cast'],['plot','Plot']];
const normalize=v=>String(v||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'');
const TITLE_STOP_WORDS=new Set(['tamil','telugu','malayalam','kannada','hindi','english','movie','film','web','series','dual','audio','proper','repack','hdrip','webrip','bluray','brrip','dvdrip','hdtv','x264','x265','hevc','aac','esub','esubs','subtitles']);
const ANIME_QUALITY=/\b(360|480|720|1080|1440|2160)l?p\b|\b4k\b/i;
function titleCandidates(title){
 const clean=String(title||'').replace(/\s+/g,' ').trim();
 const tokens=clean.split(' ').filter(Boolean),out=[];
 const add=(value,allowNumeric=false)=>{
  const candidate=String(value||'').replace(/\s+/g,' ').trim();
  if(!candidate||candidate.length<2||TITLE_STOP_WORDS.has(candidate.toLowerCase())||(!allowNumeric&&!/[a-z]/i.test(candidate))||out.some(x=>normalize(x)===normalize(candidate)))return;
  out.push(candidate);
 };
 add(clean,true);
 const contentTokens=[...tokens];
 while(contentTokens.length&&TITLE_STOP_WORDS.has(contentTokens.at(-1).toLowerCase()))contentTokens.pop();
 add(contentTokens.join(' '));
 for(let start=1;start<tokens.length;start++)add(tokens.slice(start).join(' '));
 return out;
}
function titleCoverage(full,candidate){
 const fullTokens=String(full||'').match(/[a-z0-9]+/gi)||[];
 const candidateTokens=String(candidate||'').match(/[a-z0-9]+/gi)||[];
 return Math.min(1,candidateTokens.length/Math.max(1,fullTokens.length));
}
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
 return {title,titleCandidates:titleCandidates(title),year:Number(yearMatch?.[1])||null,quality};
};
export const animeFilenameParts=name=>{
 let raw=String(name||'').replace(/\.[^.]+$/,'').replace(/[._]+/g,' ').replace(/\s+/g,' ').trim();
 // Telegram release uploads may start with a channel/uploader tag such as
 // "@TamilMob_LinkZz -". It is metadata, not part of the anime title.
 raw=raw.replace(/^@\s*[\w-]+(?:\s+[\w-]+){0,3}\s*[-–—:]\s*/u,'');
 raw=raw.replace(/(?:tamil|telugu|malayalam|kannada|hindi|english|தமிழ்|tam|mal|hin|eng|jap)/giu,' ').replace(/\s+/g,' ').trim();
 let season=null,episode=null,part=null;
 let match=raw.match(/\bS(\d{1,2})\s*(?:-|x)?\s*E[O0]?(\d{1,4})\b/i);
 if(match){season=Number(match[1]);episode=Number(match[2]);raw=raw.slice(0,match.index)+' '+raw.slice(match.index+match[0].length);}
 else{match=raw.match(/\b(?:season|s)\s*[- ]?(\d{1,2})\b/i);if(match){season=Number(match[1]);raw=raw.slice(0,match.index)+' '+raw.slice(match.index+match[0].length);}}
 match=raw.match(/\b(?:episode|ep|e[o0]?)\s*[:#-]?\s*(\d{1,4})\b/i);if(match){episode=Number(match[1]);raw=raw.slice(0,match.index)+' '+raw.slice(match.index+match[0].length);}
 if(!episode){match=raw.match(/(?<!\d)[- ]0*(\d{1,4})(?=\s*(?:\[[^\]]*\]|\([^)]*\)|(?:360|480|720|1080|2160|4k)p?|tamil|telugu|malayalam|kannada|hindi|english|தமிழ்|hdrip|webrip|bluray|web-dl|$))/iu);if(match&&!(Number(match[1])>=1900&&Number(match[1])<=2099)){episode=Number(match[1]);raw=raw.slice(0,match.index)+' '+raw.slice(match.index+match[0].length);}}
 match=raw.match(/\bpart\s*[- ]?(\d{1,2})\b/i);if(match){part=Number(match[1]);raw=raw.slice(0,match.index)+' '+raw.slice(match.index+match[0].length);}
 const qualityMatch=raw.match(ANIME_QUALITY),quality=qualityMatch?.[0]?.toLowerCase()==='4k'?'2160p':qualityMatch?.[0]?.toLowerCase().replace('lp','p')||'720p';
 const cut=qualityMatch?.index??Infinity;let title=(Number.isFinite(cut)?raw.slice(0,cut):raw).replace(/\s+(?:தமிழ்|tamil|telugu|malayalam|kannada|hindi|english|hdrip|webrip|blu[- ]?ray|bluray|web[- ]?dl|proper|repack|dub|dual(?:\s+audio)?).*$/iu,'').replace(/\b(?:OAD|OVA|specials?)\b/giu,' ').replace(/\s+@.*$/,'').replace(/\s*(?:\[[^\]]*\]|\{[^}]*\}|\([^)]*\))+/g,' ').replace(/\b(?:multi(?:\s+audio)?|audio|esub|esubs)\b/giu,' ').replace(/\s*\+\s*/g,' ').replace(/^[\s\[({]+|[\s\-\[\]({})]+$/g,'').replace(/\s+/g,' ').trim();
 if(normalize(title).startsWith('narutoshippud'))title='Naruto Shippuden';
 if(normalize(title)==='attackontitack')title='Attack on Titan';
 const specialMatch=raw.match(/\b(OAD|OVA|specials?)\b/i),special_type=specialMatch?(specialMatch[1].toUpperCase()==='OAD'?'OAD':specialMatch[1].toUpperCase()==='OVA'?'OVA':'Special'):null;
 return {title:title||'Untitled anime',titleCandidates:titleCandidates(title),season,episode,part,quality,special_type};
};
function seasonFromCaption(caption){
 const match=String(caption||'').match(/\b(?:season|s)\s*[:#-]?\s*(\d{1,2})\b/i);
 return match?Number(match[1]):null;
}
function animeCaptionParts(caption){
 const value=String(caption||'');
 const pick=(pattern)=>value.match(pattern)?.[1]?.trim()||null;
 const title=pick(/^\s*(?:anime|series|title)\s*:\s*(.+)$/im);
 const season=seasonFromCaption(value);
 const episode=Number(pick(/\b(?:episode|ep)\s*[:#-]?\s*(\d{1,4})\b/i))||null;
 const rawQuality=pick(/\bquality\s*:\s*(2160l?p|1080l?p|720l?p|480l?p|360l?p|4k)\b/i)||pick(/\b(2160l?p|1080l?p|720l?p|480l?p|360l?p|4k)\b/i);
 const quality=rawQuality?.toLowerCase()==='4k'?'2160p':rawQuality?.toLowerCase()||null;
 const part=Number(pick(/\bpart\s*[:#-]?\s*(\d{1,2})\b/i))||null;
 return {title,season,episode,quality,part};
}
function animePartsFromMessage(file,caption){
 const parts=animeFilenameParts(file.file_name||''),fromCaption=animeCaptionParts(caption);
 if(fromCaption.title){parts.title=fromCaption.title;parts.titleCandidates=titleCandidates(parts.title);}
 if(!parts.season)parts.season=fromCaption.season;
 if(!parts.episode)parts.episode=fromCaption.episode;
 if(!parts.quality||parts.quality==='auto')parts.quality=fromCaption.quality||parts.quality;
 if(!parts.part)parts.part=fromCaption.part;
 return parts;
}
async function catalog(){const r=await fetch('https://raw.githubusercontent.com/'+REPO+'/main/data/movies.json?ts='+Date.now(),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error('Catalog unavailable');return (await r.json()).movies||[];}
async function animeCatalog(){const r=await fetch('https://raw.githubusercontent.com/'+REPO+'/main/data/anime.json?ts='+Date.now(),{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error('Anime catalog unavailable');return (await r.json()).anime||[];}
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
 const exact=movies.find(m=>Number(m.year)===Number(d.year)&&normalize(m.title)===normalize(d.title));
 if(exact)return exact;
 const resolved=await resolveOmdbMovie(d.title,d.year,d.titleCandidates||titleCandidates(d.title)).catch(()=>null);
 const imdbId=resolved?.movie?.imdbID;
 return imdbId?movies.find(m=>m.imdb_id===imdbId)||null:null;
}
async function askOmdbConfirmation(d,result){
 d.omdb_candidate=movieFields(result);d.stage='await-omdb-confirm';await draftSave(d);
 const candidate=d.omdb_candidate;
 const details=[candidate.title+' ('+candidate.year+')',candidate.imdb_id?'IMDb: '+candidate.imdb_id:'',candidate.genre?'Genre: '+candidate.genre:'',candidate.runtime?'Runtime: '+candidate.runtime:'',candidate.director?'Director: '+candidate.director:'',candidate.cast?'Cast: '+candidate.cast:'',candidate.plot?'Plot: '+candidate.plot:''].filter(Boolean).join('\n');
 return say(ADMIN_ID,'OMDb result found. Is this the correct movie?\n\n'+details,{reply_markup:{inline_keyboard:[[{text:'Yes, use this result',callback_data:'fg:omdb:yes'},{text:'No, enter details manually',callback_data:'fg:omdb:no'}]]}});
}
async function resumeDraft(d){
 if(d.kind==='anime'&&d.stage==='await-publish')return animeDraftPrompt(d);
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
  const titleOptions=p.titleCandidates.length?p.titleCandidates:[p.title];
  let score=Math.max(...titleOptions.map(title=>similarity(title,m.title)*titleCoverage(p.title,title)));
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
export function telegramAnimeDeliveryCaption(anime,episode){
 const title=captionValue(anime.title,150),number=Number(episode.episode??episode.number)||0,season=Number(episode.season)||1;
 return ['🍥 FilmGo Anime','',title,'Season '+season+' · Episode '+number,episode.title?'Episode: '+captionValue(episode.title,150):'',episode.quality?'Quality: '+captionValue(episode.quality,30):'','', '> Powered by Itz Maazin • https://mzn.is-a.dev/'].filter(Boolean).join('\n');
}
export function telegramAnimeButtons(baseUrl,slug){
 const base=new URL(baseUrl);if(base.protocol!=='https:'||!/^[A-Za-z0-9_-]{8,80}$/.test(String(slug||'')))throw Error('Invalid FilmGo anime action link');
 const id=encodeURIComponent(slug);return {inline_keyboard:[[{text:'▶️ Stream on FilmGo',url:new URL('/anime/watch/'+id,base).href},{text:'⬇️ Download',url:new URL('/anime/download/'+id,base).href}]]};
}
async function omdbSearch(title,year){const key=process.env.OMDB_API_KEY;if(!key)return null;const url='https://www.omdbapi.com/?'+new URLSearchParams({apikey:key,t:title,...(year?{y:String(year)}:{})});const r=await fetch(url,{signal:AbortSignal.timeout(10000)});const j=await r.json();return j.Response==='True'?j:null;}
async function omdbById(imdbId){const key=process.env.OMDB_API_KEY;if(!key||!/^tt\d+$/.test(String(imdbId||'')))return null;const url='https://www.omdbapi.com/?'+new URLSearchParams({apikey:key,i:imdbId});const r=await fetch(url,{signal:AbortSignal.timeout(10000)});const j=await r.json();return j.Response==='True'?j:null;}
async function imdbSuggestionSearch(title){const query=encodeURIComponent(String(title||'').trim().replace(/\s+/g,'_'));if(!query)return[];const r=await fetch('https://v3.sg.media-imdb.com/suggestion/x/'+query+'.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)return[];const j=await r.json();return Array.isArray(j.d)?j.d.filter(x=>x.qid==='movie'&&x.id&&x.l):[];}
function sequelKey(value){
 const tokens=String(value||'').toLowerCase().match(/[a-z0-9]+/g)||[];
 const suffixes=new Set(['chapter','part','volume','season']);
 const roman={i:'1',ii:'2',iii:'3',iv:'4',v:'5',vi:'6',vii:'7',viii:'8',ix:'9',x:'10'};
 const last=tokens.at(-1),before=tokens.at(-2);
 if(tokens.length>1&&suffixes.has(before)&&(/^(?:\d+|i{1,3}|iv|v|vi|vii|viii|ix|x)$/i.test(last)))return tokens.slice(0,-2).join('')+(roman[last]||last);
 return tokens.join('');
}
function suggestionScore(input,candidate,year){if(Number(candidate.y)!==Number(year))return 0;const a=normalize(input),b=normalize(candidate.l),sa=sequelKey(input),sb=sequelKey(candidate.l);if(a===b)return 1;if(sa&&sa===sb)return .98;return similarity(input,candidate.l);}
async function resolveOmdbMovie(title,year,extraCandidates=[]){
 const direct=await omdbSearch(title,year).catch(()=>null);
 if(direct&&Number(String(direct.Year).slice(0,4))===Number(year))return {movie:direct,confidence:similarity(title,direct.Title),source:'omdb'};
 const candidates=[];
 const queries=Array.from(new Set([title,...extraCandidates,...(sequelKey(title)!==normalize(title)?[sequelKey(title)]:[])].filter(Boolean)));
 for(const query of queries){
  const items=await imdbSuggestionSearch(query).catch(()=>[]);
  for(const item of items){const score=suggestionScore(title,item,year);if(score)candidates.push({item,score});}
 }
 const bestById=new Map();
 for(const candidate of candidates){const previous=bestById.get(candidate.item.id);if(!previous||candidate.score>previous.score)bestById.set(candidate.item.id,candidate);}
 const ranked=Array.from(bestById.values()).sort((a,b)=>b.score-a.score);
 const winner=ranked[0];
 if(!winner||winner.score<.5||(ranked[1]&&winner.score-ranked[1].score<.1))return null;
 const movie=await omdbById(winner.item.id).catch(()=>null);
 if(!movie||Number(String(movie.Year).slice(0,4))!==Number(year))return null;
 return {movie,confidence:winner.score,source:'imdb-suggestion'};
}
function movieFields(x){return {title:x.Title,year:Number(String(x.Year).slice(0,4)),imdb_id:x.imdbID,poster:x.Poster?.startsWith('https://')?x.Poster:null,genre:x.Genre,runtime:x.Runtime,director:x.Director,cast:x.Actors,plot:x.Plot};}
async function anilistSearch(title){
 const query='query ($search: String) { Media(search: $search, type: ANIME) { id title { romaji english native } coverImage { large } description(asHtml: false) genres averageScore status episodes startDate { year } studios { nodes { name } } } }';
 const response=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'FilmGo/1.0'},body:JSON.stringify({query,variables:{search:title}}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)return null;const media=(await response.json()).data?.Media;if(!media)return null;
 const names=[media.title?.english,media.title?.romaji,media.title?.native].filter(Boolean);
 return {title:String(names[0]||title).slice(0,150),poster:media.coverImage?.large||null,plot:String(media.description||'').replace(/<[^>]+>/g,'').slice(0,900),genre:Array.isArray(media.genres)?media.genres:[],rating:Number(media.averageScore||0)?Number(media.averageScore)/10:null,status:media.status?String(media.status).toLowerCase().replace(/^./,c=>c.toUpperCase()):null,episodes_total:media.episodes||null,year:media.startDate?.year||null,studio:media.studios?.nodes?.[0]?.name||null};
}
async function jikanSearch(title){
 try{const response=await fetch('https://api.jikan.moe/v4/anime?'+new URLSearchParams({q:title,limit:'5',sfw:'true'}),{headers:{'User-Agent':'FilmGo/1.0'},signal:AbortSignal.timeout(8000)});if(!response.ok)return null;const item=(await response.json()).data?.[0];if(!item)return null;return {title:String(item.title_english||item.title||title).slice(0,150),poster:item.images?.jpg?.large_image_url||null,plot:String(item.synopsis||'').slice(0,900),genre:(item.genres||[]).map(x=>x.name).filter(Boolean),rating:Number(item.score||0)||null,status:item.status==='Currently Airing'?'Airing':item.status==='Finished Airing'?'Finished':item.status||null,episodes_total:item.episodes||null,year:String(item.aired?.from||'').slice(0,4)||null,studio:item.studios?.[0]?.name||null};}catch{return null;}
}
async function tmdbAnimeSearch(title){
 const key=process.env.TMDB_API_KEY;if(!key)return null;
 try{const query=new URLSearchParams({api_key:key,query:title,language:'en-US',include_adult:'false'});const search=await fetch('https://api.themoviedb.org/3/search/tv?'+query,{signal:AbortSignal.timeout(8000)});if(!search.ok)return null;const result=(await search.json()).results?.[0];if(!result?.id)return null;const detail=await fetch('https://api.themoviedb.org/3/tv/'+result.id+'?'+new URLSearchParams({api_key:key,language:'en-US'}),{signal:AbortSignal.timeout(8000)});if(!detail.ok)return null;const item=await detail.json();return {title:String(item.name||result.name||title).slice(0,150),poster:item.poster_path?'https://image.tmdb.org/t/p/w780'+item.poster_path:null,plot:String(item.overview||'').slice(0,900),genre:(item.genres||[]).map(x=>x.name).filter(Boolean),rating:Number(item.vote_average||0)||null,status:item.status||null,episodes_total:(item.seasons||[]).filter(x=>Number(x.season_number)>0).reduce((sum,x)=>sum+Number(x.episode_count||0),0)||null,year:String(item.first_air_date||'').slice(0,4)||null,studio:item.production_companies?.[0]?.name||null};}catch{return null;}
}
async function wikipediaSearch(title){
 try{const query=new URLSearchParams({action:'query',list:'search',srsearch:title+' anime',format:'json',utf8:'1',srlimit:'1'});const search=await fetch('https://en.wikipedia.org/w/api.php?'+query,{headers:{'User-Agent':'FilmGo/1.0 (metadata; contact: admin@mzn.is-a.dev)'},signal:AbortSignal.timeout(8000)});if(!search.ok)return null;const result=(await search.json()).query?.search?.[0];if(!result?.title)return null;const page=encodeURIComponent(result.title.replaceAll(' ','_'));const summary=await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+page,{headers:{'User-Agent':'FilmGo/1.0 (metadata; contact: admin@mzn.is-a.dev)'},signal:AbortSignal.timeout(8000)});if(!summary.ok)return null;const item=await summary.json();return {plot:String(item.extract||'').slice(0,900),poster:item.thumbnail?.source||null,year:String(item.timestamp||'').slice(0,4)||null,wikipedia_url:item.content_urls?.desktop?.page||null};}catch{return null;}
}
async function animeMetadata(title){
 const [ani,jikan,tmdb,wikipedia]=await Promise.all([anilistSearch(title).catch(()=>null),jikanSearch(title).catch(()=>null),tmdbAnimeSearch(title).catch(()=>null),wikipediaSearch(title).catch(()=>null)]);const primary=ani||jikan||tmdb||wikipedia;if(!primary)return null;const fallbacks=[jikan,tmdb,wikipedia].filter(Boolean);return Object.fromEntries(Object.entries(primary).map(([key,value])=>[key,value===null||value===''||(Array.isArray(value)&&!value.length)?(fallbacks.find(item=>item[key]!==null&&item[key]!==''&&(!Array.isArray(item[key])||item[key].length))?.[key]??value):value]));
}
let KNOWN_ANIME_TITLES=new Set(),KNOWN_ANIME_RECORDS=new Map();
try{
 const catalog=JSON.parse(fs.readFileSync(new URL('../data/anime/index.json',import.meta.url),'utf8'));
 for(const item of catalog.anime||[]){for(const value of [item.title,item.title_alt,item.slug_id].filter(Boolean)){const key=normalize(value);KNOWN_ANIME_TITLES.add(key);if(!KNOWN_ANIME_RECORDS.has(key))KNOWN_ANIME_RECORDS.set(key,item);}}
}catch(error){console.warn('Anime catalog fast-path unavailable:',error.message);}
const isKnownAnimeTitle=title=>titleCandidates(title).some(value=>KNOWN_ANIME_TITLES.has(normalize(value)));
const knownAnimeRecord=title=>titleCandidates(title).map(value=>KNOWN_ANIME_RECORDS.get(normalize(value))).find(Boolean)||null;
async function detectAnimeType(file,caption=''){
 const parts=animePartsFromMessage(file,caption);const name=String(file.file_name||'')+'\n'+caption;
 if(isKnownAnimeTitle(parts.title))return {anime:true,confidence:1,parts,known:true,metadata:null};
 const explicitEpisode=/\b(?:S\d{1,2}\s*(?:-|x)?\s*E\d{1,4}|season\s*\d+\s*(?:episode|ep)\s*\d+|episode|ep)\b/i.test(name);
 const metadata=await animeMetadata(parts.title).catch(()=>null);const titleScore=metadata?.title?similarity(parts.title,metadata.title):0;
 let confidence=0;if(explicitEpisode)confidence=.95;else if(parts.episode)confidence=.82;if(titleScore>=.7)confidence=Math.max(confidence,Math.min(.92,titleScore));
 const ambiguous=Boolean(parts.episode&&!explicitEpisode);
 if(ambiguous){
  const movieParts=filenameParts(file.file_name||'');
  const movie=await resolveOmdbMovie(movieParts.title||parts.title,movieParts.year,movieParts.titleCandidates||parts.titleCandidates).catch(()=>null);
  if(movie?.movie&&Number(movie.confidence||0)>=.65)return {anime:false,confidence:Number(movie.confidence),parts,metadata,movie:movie.movie,ambiguous:false};
  if(metadata?.title&&titleScore>=.8)return {anime:true,confidence:Math.min(.95,titleScore),parts,metadata,ambiguous:false};
  return {anime:false,confidence,parts,metadata,ambiguous:true};
 }
 return {anime:confidence>=.7,confidence,parts,metadata,ambiguous:false};
}
function animeSlug(title){return String(title||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'anime';}
function animeParentSlug(title,season,episode,special='',part=0){const identity=[normalize(title),String(special||'').toLowerCase(),Number(season)||1,Number(episode)||0,Number(part)||0].join(':');return crypto.createHash('sha256').update('filmgo-anime-parent:'+identity).digest().subarray(0,12).toString('base64url');}
async function tmdbAnimeSeason(title,episode){
 const key=process.env.TMDB_API_KEY;if(!key||!episode){if(!key)console.warn('Anime season mapping skipped: TMDB_API_KEY is missing');return null;}
 try{
  const search=await fetch('https://api.themoviedb.org/3/search/tv?'+new URLSearchParams({api_key:key,query:title,language:'en-US'}),{signal:AbortSignal.timeout(8000)});
  if(!search.ok)return null;const results=(await search.json()).results||[];const result=[...results].sort((a,b)=>Math.max(similarity(title,a.name),similarity(title,a.original_name))-Math.max(similarity(title,b.name),similarity(title,b.original_name)))[0];if(!result?.id)return null;
  const detail=await fetch('https://api.themoviedb.org/3/tv/'+result.id+'?'+new URLSearchParams({api_key:key,language:'en-US'}),{signal:AbortSignal.timeout(8000)});if(!detail.ok)return null;
  const seasons=(await detail.json()).seasons||[];let offset=0;
  for(const season of seasons.filter(item=>Number(item.season_number)>0).sort((a,b)=>a.season_number-b.season_number)){
   const count=Number(season.episode_count)||0;if(Number(episode)<=offset+count)return Number(season.season_number);offset+=count;
  }
 }catch(error){console.warn('Anime season mapping failed:',error?.message||'unknown error');}
 return null;
}
function manualAnimeSeason(title,episode){
 const normalized=normalize(title);
 if(!['narutoshippuden','narutoshippuuden'].includes(normalized))return null;
 const boundaries=[[1,32],[2,53],[3,71],[4,88],[5,112],[6,143],[7,151],[8,175],[9,196],[10,221],[11,242],[12,275],[13,295],[14,320],[15,348],[16,361],[17,379],[18,405],[19,431],[20,458],[21,479],[22,500]];
 return boundaries.find(([,last])=>Number(episode)<=last)?.[0]||22;
}
function animeDraftPrompt(d){
 const lines=['FilmGo anime draft',d.title,d.special_type?(d.special_type+' · Episode: '+d.episode+(d.part?' · Part: '+d.part:'')):'Season: '+d.season+' · Episode: '+d.episode+(d.part?' · Part: '+d.part:''),'Quality: '+d.quality,'File: '+d.file_name,d.replace?'Existing episode and quality found — replacement requires confirmation':d.poster?'Poster: ready':'Poster: '+(d.poster_error||'AniList / fallback'),'Use /edit to change metadata or /cancel to discard.'];
 return say(ADMIN_ID,lines.join('\n'),{reply_markup:{inline_keyboard:[[{text:d.replace?'Replace existing':'Publish anime',callback_data:'fg:publish'},{text:'Cancel',callback_data:'fg:cancel'}]]}});
}
async function findAnimeDuplicate(d){
 const [owner,name]=REPO.split('/');if(!owner||!name||!GH_TOKEN)return null;
 const response=await fetch('https://api.github.com/repos/'+owner+'/'+name+'/contents/data/anime.json',{headers:{Authorization:'Bearer '+GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)return null;
 const file=await response.json();const content=JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'));
 const show=(content.anime||[]).find(item=>item.slug_id===d.slug_id||normalize(item.title)===normalize(d.title));
 if(!show)return null;
 const episode=(show.episodes||[]).find(item=>Number(item.episode)===Number(d.episode)&&Number(item.season||1)===Number(d.season||1)&&String(item.special_type||'')===String(d.special_type||''));
 if(!episode)return null;
 const requestedQuality=String(d.quality||'').toUpperCase();
 const variant=episode.qualities?.[requestedQuality]||((String(episode.quality||'').toUpperCase()===requestedQuality)?episode:null);
 // A matching episode at another quality still owns the same parent slug.
 // Only the matching quality is a replacement; a missing quality is a new
 // variant that must inherit the existing episode slug.
 const parentSlug=episode.slug_id||d.episode_slug_id;
 if(!variant)return {slug_id:parentSlug,episode_slug_id:parentSlug,same_quality:false};
 return {...variant,slug_id:parentSlug,episode_slug_id:parentSlug,same_quality:true};
}

function selectAnimeVariant(episode, quality){
 if(!episode)return null;
 const variants=episode.qualities||{[String(episode.quality||'720P').toUpperCase()]:episode};
 const key=quality?Object.keys(variants).find(value=>value.toLowerCase()===String(quality).toLowerCase()):Object.keys(variants).find(value=>value.toLowerCase()==='720p')||Object.keys(variants)[0];
 if(!key)return null;
 return {...episode,...variants[key],slug_id:episode.slug_id,quality:key};
}
async function saveAnimeMetadata(id,d){
 const [owner,name]=REPO.split('/');const url='https://api.github.com/repos/'+owner+'/'+name+'/contents/data/anime.json';const headers={Authorization:'Bearer '+GH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
 for(let attempt=0;attempt<6;attempt++){
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});let content,sha;
  if(response.status===404){content={schema_version:1,updated_at:null,anime:[]};sha=undefined;}else{if(!response.ok)throw Error('Anime catalog read '+response.status);const file=await response.json();sha=file.sha;content=JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'));}
  content.anime ||= [];const show=content.anime.find(item=>item.slug_id===d.slug_id)||content.anime.find(item=>normalize(item.title)===normalize(d.title));
  const episode={slug_id:d.episode_slug_id||crypto.randomBytes(12).toString('base64url'),telegram_message_id:Number(id),episode:Number(d.episode),season:Number(d.season||1),special_type:d.special_type||null,part:d.part?Number(d.part):null,quality:d.quality,file_size:Number(d.file_size||0),file_name:d.file_name||'',mime_type:d.mime_type||''};
  const target=show||{slug_id:d.slug_id,title:d.title,episodes:[]};if(!Array.isArray(target.episodes))target.episodes=[];const index=target.episodes.findIndex(e=>Number(e.episode)===episode.episode&&Number(e.season||1)===episode.season&&String(e.special_type||'')===String(episode.special_type||''));if(index>=0){const current=target.episodes[index],parentSlug=current.slug_id||episode.slug_id,variants={...(current.qualities||{[String(current.quality||'720P').toUpperCase()]:current}),[String(episode.quality||'720P').toUpperCase()]:episode};for(const variant of Object.values(variants)){delete variant.slug_id;delete variant.slug_aliases;}const preferred=Object.keys(variants).find(key=>key.toLowerCase()==='720p')||Object.keys(variants)[0];target.episodes[index]={...variants[preferred],slug_id:parentSlug,qualities:variants};}else{const variant={...episode};delete variant.slug_id;target.episodes.push({...variant,qualities:{[String(episode.quality||'720P').toUpperCase()]:variant}});}
  Object.assign(target,{slug_id:d.slug_id,title:d.title,year:d.year||target.year,poster:d.poster||target.poster||null,plot:d.plot||target.plot||'',genre:d.genre||target.genre||[],rating:d.rating||target.rating||null,status:d.status||target.status||null,episodes_total:d.episodes_total||target.episodes_total||null,studio:d.studio||target.studio||null,updated_at:new Date().toISOString()});if(!show)content.anime.push(target);content.updated_at=new Date().toISOString();
  const body={message:'Update FilmGo anime metadata in canonical anime.json',content:Buffer.from(JSON.stringify(content,null,2)+'\n').toString('base64')};if(sha)body.sha=sha;const write=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(write.ok)return; if(write.status!==409&&write.status!==422)throw Error('Anime catalog write '+write.status);
 }
 throw Error('Anime catalog update conflict');
}
function telegramAnimeCaption(d){
 const lines=['Anime: '+captionValue(d.title,150),'Anime Slug ID: '+captionValue(d.slug_id,80),d.special_type?'Collection: '+d.special_type:'Season: '+d.season,'Episode: '+d.episode+(d.part?' · Part: '+d.part:''),'Quality: '+captionValue(d.quality,30),'Episode Slug ID: '+captionValue(d.episode_slug_id,80)];
 return lines.join('\n').slice(0,1024);
}
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
async function publishDraft(d){if(d.kind==='anime')return publishAnimeDraft(d);const lock=prefix+'publishing:'+ADMIN_ID;if(await redis('SET',lock,'1','NX','EX',90)!=='OK')return say(ADMIN_ID,'Publishing is already running.');try{const caption=['Movie: '+d.title,'Year: '+d.year,'Quality: '+d.quality,...(d.slug_id?['Slug ID: '+d.slug_id]:[])].join('\n');const sent=await tg('copyMessage',{chat_id:CHANNEL_ID,from_chat_id:ADMIN_ID,message_id:d.message_id,caption},30000);await saveMovieMetadata(sent.message_id,d);await redis('DEL',DRAFT_KEY+ADMIN_ID);void logFilmGo('movies','🎬 Published: '+d.title+' ('+d.year+') · '+d.quality+' · channel #'+sent.message_id);await dispatch('filmgo-catalog-sync',{message_id:sent.message_id});await say(ADMIN_ID,'✅ Movie published successfully\n\n🎬 '+d.title+' ('+d.year+')\n📺 Quality: '+d.quality);}finally{await redis('DEL',lock);}}

async function publishAnimeDraft(d){const lock=prefix+'publishing:'+ADMIN_ID;if(await redis('SET',lock,'1','NX','EX',90)!=='OK')return say(ADMIN_ID,'Publishing is already running.');try{const sent=await tg('copyMessage',{chat_id:ANIME_CHANNEL_ID,from_chat_id:ADMIN_ID,message_id:d.message_id,caption:telegramAnimeCaption(d)},30000);const posted=sent.document||sent.video||{};await saveAnimeMetadata(sent.message_id,{...d,file_size:posted.file_size||d.file_size,mime_type:posted.mime_type||d.mime_type});if(d.replace&&d.existing_episode_message_id&&Number(d.existing_episode_message_id)!==Number(sent.message_id)){try{await tg('deleteMessage',{chat_id:ANIME_CHANNEL_ID,message_id:Number(d.existing_episode_message_id)});}catch(error){console.warn('Anime replacement cleanup failed:',error?.message||'unknown error');}}await redis('DEL',DRAFT_KEY+ADMIN_ID);void logFilmGo('anime','🍥 Published: '+d.title+' S'+d.season+'E'+d.episode+' · '+d.quality+' · channel #'+sent.message_id+(d.replace?' · replaced #'+d.existing_episode_message_id:''));await dispatch('filmgo-anime-catalog-sync',{message_id:sent.message_id});await say(ADMIN_ID,(d.replace?'✅ Anime replacement published successfully':'✅ Anime published successfully')+'\n\n🍥 '+d.title+'\n🎞️ Season '+d.season+' · Episode '+d.episode+'\n📺 '+d.quality);}finally{await redis('DEL',lock);}}
let running=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function redis(...args){
 if(!REDIS_URL||!REDIS_TOKEN)throw Error('Bot Redis configuration missing');
 const command=args.map((value,index)=>{
  if(value===undefined||value===null)throw Error('Redis argument '+index+' is missing');
  return String(value);
 });
 let lastError=null;
 for(let attempt=0;attempt<4;attempt++){
  try{
   const r=await fetch(REDIS_URL,{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});
   if(!r.ok){const detail=(await r.text()).replace(/\s+/g,' ').slice(0,180);lastError=Error('HTTP '+r.status+(detail?': '+detail:''));if(![400,408,425,429].includes(r.status)&&r.status<500)break;}
   else{const j=await r.json();if(j.error){lastError=Error('Redis command failed');}else return j.result;}
  }catch(error){lastError=error;}
  if(attempt<3)await sleep(250*(2**attempt)+Math.floor(Math.random()*150));
 }
 throw Error('Bot Redis unavailable'+(lastError?.message?': '+lastError.message:''));
}
async function tg(method,data={},timeout=20000){
 const r=await fetch('https://api.telegram.org/bot'+TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(timeout)});
 const j=await r.json();
 // Telegram callback queries expire quickly. A user can still tap an old
 // inline button after the update was already handled; that is harmless and
 // must not turn into a bot-update error or block the remaining action.
 if(!j.ok&&method==='answerCallbackQuery'&&/query is too old|query ID is invalid|response timeout expired/i.test(String(j.description||'')))return null;
 if(!j.ok)throw Error('Telegram '+method+': '+String(j.description).slice(0,160));return j.result;
}
async function say(chat_id,text,extra={}){return tg('sendMessage',{chat_id,text,disable_web_page_preview:true,...extra});}
async function deleteConfirmation(q){const chatId=q.message?.chat?.id,messageId=q.message?.message_id;if(chatId==null||!Number.isInteger(messageId))return;try{await tg('deleteMessage',{chat_id:chatId,message_id:messageId});}catch{}}
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
async function startAnimeDraft(file,messageId,detected=null,caption=''){
 const parts=animePartsFromMessage(file,caption);
 if(!parts.episode)return say(ADMIN_ID,'I could not identify the anime episode. Use a filename such as Naruto Shippuden - 001 [720p].mkv.');
 const known=isKnownAnimeTitle(parts.title),knownRecord=knownAnimeRecord(parts.title);
 parts.season=parts.season||(parts.special_type?1:(known?manualAnimeSeason(parts.title,parts.episode)||1:await tmdbAnimeSeason(parts.title,parts.episode)||1));
 const d={kind:'anime',message_id:messageId,file_name:file.file_name||'',file_size:Number(file.file_size||0),mime_type:file.mime_type||'',title:parts.title,titleCandidates:parts.titleCandidates,season:parts.season,episode:parts.episode,part:parts.part,special_type:parts.special_type,quality:parts.quality,slug_id:animeSlug(parts.title),episode_slug_id:animeParentSlug(parts.title,parts.season,parts.episode,parts.special_type,parts.part)};
 const duplicate=await findAnimeDuplicate(d).catch(error=>{console.warn('Anime duplicate check failed:',error?.message||'unknown error');return null;});
 if(duplicate){d.episode_slug_id=duplicate.episode_slug_id||duplicate.slug_id;if(duplicate.same_quality){d.existing=true;d.replace=true;d.existing_episode_message_id=Number(duplicate.telegram_message_id)||null;}}
 const metadata=known?(knownRecord?{poster:knownRecord.poster||null,plot:knownRecord.plot||'',genre:knownRecord.genre||[],rating:knownRecord.rating||null,status:knownRecord.status||null,episodes_total:knownRecord.episodes_total||null,year:knownRecord.year||null,studio:knownRecord.studio||null}:null):(detected?.metadata||await animeMetadata(parts.title).catch(()=>null));
 // Metadata providers may return an all-caps display title. Keep the title
 // parsed from the release filename for drafts, captions, and the catalog;
 // provider metadata is still used for poster, plot, rating, and other fields.
 if(metadata){const releaseTitle=d.title;Object.assign(d,metadata,{title:releaseTitle});d.titleCandidates=titleCandidates(releaseTitle);d.slug_id=animeSlug(releaseTitle);}
 d.stage='await-publish';await draftSave(d);
 if(detected?.confidence>=.7&&!d.replace){await say(ADMIN_ID,'Recognized '+d.title+' as anime ('+Math.round(detected.confidence*100)+'% confidence). Publishing automatically.');return publishAnimeDraft(d);}
 return animeDraftPrompt(d);
}
async function startMovieDraft(file,messageId,chat){
 const name=file.file_name||'',parts=filenameParts(name);
 if(!parts.quality)return say(chat,'Cannot identify quality from filename. Rename the file with 360p, 480p, 720p, 1080p or 2160p and resend.');
 const movies=await catalog(),found=guessMovie(file,movies);let existing=found.best;
 const title=existing?.title||parts.title,year=existing?.year||parts.year;
 const d={message_id:messageId,file_name:name,title:title||'',titleCandidates:parts.titleCandidates,year:year||null,quality:parts.quality,existing:!!existing,replace:!!(existing&&Object.keys(existing.qualities||{}).some(q=>q.toLowerCase()===parts.quality)),slug_id:existing?.slug_id,manual_identity:!existing&&(!title||!year)};
 if(!title)return askForTitle(d);if(!year)return askForYear(d);
 const resolved=existing?null:await resolveOmdbMovie(title,year,parts.titleCandidates).catch(()=>null),omdb=resolved?.movie,omdbConfidence=omdb&&Number(String(omdb.Year).slice(0,4))===year?resolved.confidence:0;
 if(resolved?.source==='imdb-suggestion'&&omdb&&omdbConfidence>=0.5&&omdbConfidence<0.7)return askOmdbConfirmation(d,omdb);
 Object.assign(d,omdbConfidence>=0.6?movieFields(omdb):{});
 if(omdbConfidence>=0.6){d.title=omdb.Title;d.year=Number(String(omdb.Year).slice(0,4));if(!existing&&omdb.imdbID)existing=movies.find(m=>m.imdb_id===omdb.imdbID)||null;if(existing){d.existing=true;d.slug_id=existing.slug_id;d.replace=Object.keys(existing.qualities||{}).some(q=>q.toLowerCase()===String(d.quality).toLowerCase());}}
 const trusted=!!existing||omdbConfidence>=0.7;d.stage='await-publish';await draftSave(d);
 if(trusted&&!d.replace){await say(chat,'Recognized '+d.title+' ('+d.year+') at '+Math.round((existing?found.confidence:omdbConfidence)*100)+'% confidence. Publishing automatically.');return publishDraft(d);}
 return draftPrompt(d);
}
async function askMediaType(file,messageId,detected){
 const id=crypto.randomBytes(12).toString('hex');
 await redis('SET',MEDIA_CHOICE_KEY+id,JSON.stringify({file,message_id:messageId}),'EX',900);
 const label=String(file.file_name||'file').slice(0,180);
 return say(ADMIN_ID,'The filename contains an episode-like number, but it may be a movie sequel or an anime episode. Choose the media type for:\n\n'+label+'\n\nDetected confidence: '+Math.round(Number(detected.confidence||0)*100)+'%.',{reply_markup:{inline_keyboard:[[{text:'Movie',callback_data:'fg:type:movie:'+id},{text:'Anime',callback_data:'fg:type:anime:'+id}],[{text:'Cancel',callback_data:'fg:type:cancel:'+id}]]}});
}
async function onMessage(message,refresh){
 const from=String(message.from?.id||''),chat=message.chat?.id;
 const animeDeep=String(message.text||'').trim().match(/^\/start(?:@\w+)?\s+a_([A-Za-z0-9_-]{16})$/);
 if(animeDeep&&message.chat?.type==='private'){
  const key='filmgo:anime-deeplink:'+animeDeep[1],raw=await redis('GET',key);let grant;try{grant=raw?JSON.parse(raw):null;}catch{}
  if(!grant||!/^[-a-f0-9]{64}$/.test(grant.account_hash||''))return say(chat,'This anime link has expired. Please sign in on FilmGo and request a new link.');
  let anime=null,episode=null;
  if(Number.isSafeInteger(Number(grant.telegram_message_id))&&Number(grant.telegram_message_id)>0&&grant.anime_title){
   anime={title:String(grant.anime_title),year:grant.anime_year||null};episode={slug_id:String(grant.episode_slug_id||''),telegram_message_id:Number(grant.telegram_message_id),title:String(grant.episode_title||''),season:Number(grant.season)||1,episode:Number(grant.episode)||0,quality:String(grant.quality||'720p'),file_size:Number(grant.file_size||0)};
  }else{
   let animeList=[];try{animeList=await animeCatalog();}catch{}
   for(const item of animeList){const found=(item.episodes||[]).find(ep=>ep.slug_id===grant.episode_slug_id);if(found){anime=item;episode=found;break;}}
   if((!anime||!episode)&&grant.base_url){try{const response=await fetch(new URL('/api/anime/episode/'+encodeURIComponent(String(grant.episode_slug_id||'')),grant.base_url),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok){const data=await response.json();anime=data.anime||null;episode=data.episode||null;}}catch{}}
  }
  if(!anime||!episode)return say(chat,'This anime episode link has expired. Please request it again from FilmGo.');
  const messageId=Number(episode.telegram_message_id),size=Number(episode.file_size||0);if(!Number.isSafeInteger(messageId)||!Number.isSafeInteger(size)||size<=0)return say(chat,'Anime episode is unavailable.');
  const claimKey='filmgo:anime-deeplink-claim:'+animeDeep[1];if(await redis('SET',claimKey,'1','NX','EX',600)!=='OK')return say(chat,'This anime link is already being processed.');
  const now=new Date(),day=now.toISOString().slice(0,10),resetAt=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1),expireAt=Math.ceil(resetAt/1000),usageKey='filmgo:daily-tokens:v1:'+grant.account_hash+':'+day,cost=Math.max(1,Math.ceil((size/(512*1024*1024)*0.75+1)*1000));
  const refund=async()=>{if(!grant.unlimited)await redis('EVAL',REFUND_TOKEN_SCRIPT,1,usageKey,cost).catch(()=>{});};const script="local used=tonumber(redis.call('GET',KEYS[1]) or '0'); local cost=tonumber(ARGV[1]); if used+cost>50000 then return -1 end; local next=redis.call('INCRBY',KEYS[1],cost); if next==cost then redis.call('EXPIREAT',KEYS[1],ARGV[2]) end; return next";const used=grant.unlimited?0:Number(await redis('EVAL',script,1,usageKey,cost,expireAt));
  if(!grant.unlimited&&used<0){await redis('DEL',claimKey);return say(chat,'Daily token limit reached. Your tokens reset at 00:00:00 UTC.');}
  const baseUrl=grant.base_url||process.env.FILMGO_PUBLIC_URL;let replyMarkup;try{replyMarkup=telegramAnimeButtons(baseUrl,episode.slug_id);}catch{await refund();await redis('DEL',claimKey);return say(chat,'FilmGo links are temporarily unavailable.');}
  try{await tg('copyMessage',{chat_id:chat,from_chat_id:ANIME_CHANNEL_ID,message_id:messageId,caption:telegramAnimeDeliveryCaption(anime,episode),reply_markup:replyMarkup});}catch(error){await refund();await redis('DEL',claimKey);await say(chat,'Could not deliver this anime episode right now. Please retry.');return;}
  await redis('DEL',key);void logFilmGo('downloads','Telegram anime requested: '+anime.title+' S'+(episode.season||1)+'E'+(episode.episode||episode.number||0));return;
 }
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
 if(/^\/(start|help)(?:@\w+)?$/.test(text)){await say(chat,'Send a movie or anime file to create a draft. I will identify the media type from the filename and metadata, then fetch details and show a publish button. /draft resumes the current step, /edit changes metadata, /poster requests a JPEG poster, and /cancel discards the draft. /download URL keeps the remote import workflow.');return;}
 if(/^\/status(?:@\w+)?$/.test(text)){await say(chat,'FilmGo bot online.');return;}
 if(/^\/draft(?:@\w+)?$/.test(text)){const d=await draftGet();return d?resumeDraft(d):say(chat,'No active draft. Send a movie file.');}
 if(/^\/cancel(?:@\w+)?$/.test(text)){await redis('DEL',DRAFT_KEY+ADMIN_ID);return say(chat,'Draft cancelled.');}
 const file=message.document||message.video;
 if(file){
  const active=await draftGet();if(active)return say(chat,'There is already an active draft. Finish it or use /cancel before sending another file.');
  if(file.file_size>MAX_BYTES)return say(chat,'File exceeds the current 2 GB limit.');
  const detected=await detectAnimeType(file,message.caption||'');
  if(detected.ambiguous)return askMediaType(file,message.message_id,detected);
  if(detected.anime){if(!ANIME_CHANNEL_ID)return say(chat,'Anime channel is not configured yet. Add TELEGRAM_ANIME_CHANNEL_ID and resend the file.');return startAnimeDraft(file,message.message_id,detected,message.caption||'');}
  return startMovieDraft(file,message.message_id,chat);
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
  d.title=text.slice(0,180).trim();d.titleCandidates=titleCandidates(d.title);
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
 if(edit&&d){const field=edit[1],value=edit[2].trim();if(field==='year'&&!/^(19|20)\d{2}$/.test(value))return say(chat,'Invalid year');if(field==='quality'&&!/^(360|480|720|1080|1440|2160)p$/i.test(value))return say(chat,'Invalid quality');d[field]=field==='year'?Number(value):value.slice(0,1000);if(field==='title')d.titleCandidates=titleCandidates(d.title);d.stage='await-publish';await draftSave(d);return draftPrompt(d);}
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
 const typeCancel=action.match(/^fg:type:cancel:([a-f0-9]{24})$/);
 if(typeCancel){await tg('answerCallbackQuery',{callback_query_id:q.id});await redis('DEL',MEDIA_CHOICE_KEY+typeCancel[1]);await deleteConfirmation(q);return say(ADMIN_ID,'Media selection cancelled.');}
 const typeChoice=action.match(/^fg:type:(movie|anime):([a-f0-9]{24})$/);
 if(typeChoice){
  await tg('answerCallbackQuery',{callback_query_id:q.id});const key=MEDIA_CHOICE_KEY+typeChoice[2],raw=await redis('GET',key);if(!raw){await deleteConfirmation(q);return say(ADMIN_ID,'Media selection expired. Send the file again.');}
  if(await redis('SET',MEDIA_CHOICE_KEY+'claimed:'+typeChoice[2],'1','EX',900,'NX')!=='OK'){await deleteConfirmation(q);return say(ADMIN_ID,'This file was already selected.');}
  const choice=JSON.parse(raw);await redis('DEL',key);await deleteConfirmation(q);
  if(typeChoice[1]==='anime')return startAnimeDraft(choice.file,choice.message_id);
  return startMovieDraft(choice.file,choice.message_id,ADMIN_ID);
 }
 if(action==='fg:omdb:yes'||action==='fg:omdb:no'){
  await tg('answerCallbackQuery',{callback_query_id:q.id});const d=await draftGet();
  if(!d||d.stage!=='await-omdb-confirm'){await deleteConfirmation(q);return say(ADMIN_ID,'This OMDb confirmation has expired. Send the file again to start a new draft.');}
  await deleteConfirmation(q);
  if(action==='fg:omdb:yes'){await acceptOmdbResult(d);return;}
  delete d.omdb_candidate;await say(ADMIN_ID,'✅ OMDb result declined. I will collect the movie details manually.');return askOptional(d);
 }
 if(action==='fg:publish'||action==='fg:cancel'){await tg('answerCallbackQuery',{callback_query_id:q.id});const d=await draftGet();if(!d){await deleteConfirmation(q);return say(ADMIN_ID,'Draft expired.');}if(action==='fg:cancel'){await redis('DEL',DRAFT_KEY+ADMIN_ID);await deleteConfirmation(q);return say(ADMIN_ID,'Draft cancelled.');}if(d.stage&&d.stage!=='await-publish')return say(ADMIN_ID,'This draft is not ready to publish yet. Use /draft to continue the current step.');try{await publishDraft(d);}finally{await deleteConfirmation(q);}return;}
 const m=action.match(/^fg:(yes|no):([a-f0-9]{24})$/);if(!m)return;
 await tg('answerCallbackQuery',{callback_query_id:q.id});
 const key=prefix+'pending:'+m[2],raw=await redis('GET',key);
 if(!raw){await deleteConfirmation(q);await say(ADMIN_ID,'Import confirmation expired or already used.');return;}
 const data=JSON.parse(raw);if(data.admin!==ADMIN_ID)return;
 // Atomic claim prevents repeated button taps from dispatching multiple jobs.
 if(await redis('SET',prefix+'claimed:'+m[2],'1','EX',3600,'NX')!=='OK'){await deleteConfirmation(q);await say(ADMIN_ID,'This import was already handled.');return;}
 await redis('DEL',key);
 if(m[1]==='no'){await deleteConfirmation(q);await say(ADMIN_ID,'Import cancelled.');return;}
 try{await dispatch('filmgo-admin-import',{import_id:m[2],source_url:data.url,admin_id:ADMIN_ID});void logFilmGo('movies','📥 Remote movie import queued · job '+m[2]);await deleteConfirmation(q);await say(ADMIN_ID,'✅ Remote movie import queued successfully.');}
 catch(err){await deleteConfirmation(q);await say(ADMIN_ID,'Unable to queue import: '+err.message);}
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
