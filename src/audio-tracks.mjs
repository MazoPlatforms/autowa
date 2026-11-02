// Multi-audio-track support for MKV / WebM streams.
//
//  * GET  /api/audio-tracks/(movie|anime)/:id   -> lists the audio tracks by reading ONLY the first
//    few hundred KB of the file (the EBML "Tracks" header). Result is cached.
//  * GET  /api/audio/(movie|anime)/:id?track=N&t=SEC -> audio-only stream (AAC/ADTS or Opus/Ogg),
//    transcoded on the fly by ffmpeg from the point the viewer is at. Used when the browser cannot
//    decode the track itself (AC3, E-AC3, DTS, TrueHD ...) or when the viewer picks another track.
//  * GET  /internal/media/...                    -> loopback-only, signed, seekable view of the file
//    for ffmpeg, so ffmpeg can jump with MKV Cues and never needs the whole file.
//
// Nothing here touches the normal video byte-range path, and MP4/other containers are never probed.
import {spawn} from 'node:child_process';
import {PassThrough} from 'node:stream';

/* ------------------------------ EBML / Matroska ------------------------------ */
const ID_EBML=0x1A45DFA3,ID_SEGMENT=0x18538067,ID_TRACKS=0x1654AE6B,ID_CLUSTER=0x1F43B675,ID_ENTRY=0xAE;
function readId(b,p){const f=b[p];if(!f)return null;let n=1;while(n<=4&&!(f&(0x80>>(n-1))))n++;if(n>4||p+n>b.length)return null;let v=0;for(let i=0;i<n;i++)v=v*256+b[p+i];return {id:v,len:n};}
function readSize(b,p){const f=b[p];if(f===undefined)return null;let n=1;while(n<=8&&!(f&(0x80>>(n-1))))n++;if(n>8||p+n>b.length)return null;let v=f&(0xFF>>n),ones=v===(0xFF>>n);for(let i=1;i<n;i++){v=v*256+b[p+i];if(b[p+i]!==0xFF)ones=false;}return {size:ones?-1:v,len:n};}
const uint=b=>{let v=0;for(const x of b)v=v*256+x;return v;};
function* children(b){let p=0;while(p<b.length){const id=readId(b,p);if(!id)return;const sz=readSize(b,p+id.len);if(!sz||sz.size<0)return;const s=p+id.len+sz.len,e=s+sz.size;if(e>b.length)return;yield {id:id.id,data:b.subarray(s,e)};p=e;}}
function parseEntry(b){
 const t={number:0,type:0,codec:'',lang:'eng',name:'',def:true,enabled:true,channels:2,hz:0};
 for(const c of children(b)){
  switch(c.id){
   case 0xD7:t.number=uint(c.data);break;
   case 0x83:t.type=uint(c.data);break;
   case 0x86:t.codec=c.data.toString('latin1').replace(/\0+$/,'');break;
   case 0x22B59C:t.lang=c.data.toString('latin1').replace(/\0+$/,'')||'eng';break;
   case 0x22B59D:t.bcp47=c.data.toString('latin1').replace(/\0+$/,'');break;
   case 0x536E:t.name=c.data.toString('utf8').replace(/\0+$/,'').slice(0,80);break;
   case 0x88:t.def=uint(c.data)!==0;break;
   case 0xB9:t.enabled=uint(c.data)!==0;break;
   case 0xE1:for(const a of children(c.data)){if(a.id===0x9F)t.channels=uint(a.data)||2;else if(a.id===0xB5)t.hz=Math.round(a.data.length===4?a.data.readFloatBE(0):a.data.length===8?a.data.readDoubleBE(0):0);}break;
  }
 }
 return t;
}
// Codecs every mainstream browser plays natively inside Matroska. Everything else needs transcoding.
const CODECS=[
 [/^A_AAC/,'AAC',true],[/^A_MPEG\/L3/,'MP3',true],[/^A_OPUS/,'Opus',true],[/^A_VORBIS/,'Vorbis',true],[/^A_FLAC/,'FLAC',true],[/^A_PCM/,'PCM',true],
 [/^A_EAC3/,'Dolby Digital+',false],[/^A_AC3/,'Dolby Digital',false],[/^A_TRUEHD/,'Dolby TrueHD',false],[/^A_MLP/,'MLP',false],
 [/^A_DTS\/LOSSLESS/,'DTS-HD MA',false],[/^A_DTS/,'DTS',false],[/^A_MPEG\/L2/,'MP2',false],[/^A_MPEG\/L1/,'MP1',false],[/^A_WAVPACK/,'WavPack',false],[/^A_ALAC/,'ALAC',false]
];
const codecInfo=id=>{for(const [re,label,native] of CODECS)if(re.test(id))return {label,native};return {label:id.replace(/^A_/,'')||'Unknown',native:false};};
// read(start,length) -> Buffer. Reads the header only; gives up on files that hide Tracks far in.
export async function probeMkv(read,total){
 let win={start:0,buf:await read(0,Math.min(total,262144))},reads=1;
 const get=async(off,n)=>{
  if(off>=win.start&&off+n<=win.start+win.buf.length)return win.buf.subarray(off-win.start,off-win.start+n);
  if(off>=total)return Buffer.alloc(0);
  if(reads++>6)throw Error('Matroska header too sparse');
  win={start:off,buf:await read(off,Math.min(Math.max(n,196608),total-off))};
  return win.buf.subarray(0,Math.min(n,win.buf.length));
 };
 let pos=0;
 while(pos<Math.min(total,48*1024*1024)){
  const h=await get(pos,16);if(h.length<2)break;
  const id=readId(h,0);if(!id)break;const sz=readSize(h,id.len);if(!sz)break;const hdr=id.len+sz.len;
  if(id.id===ID_SEGMENT){pos+=hdr;continue;}
  if(id.id===ID_CLUSTER)break;
  if(sz.size<0)break;
  if(id.id===ID_TRACKS){
   if(sz.size>4*1024*1024)break;
   const body=await get(pos+hdr,sz.size);if(body.length<sz.size)break;
   const tracks=[];for(const c of children(body))if(c.id===ID_ENTRY)tracks.push(parseEntry(c.data));
   const audio=tracks.filter(t=>t.type===2&&t.enabled!==false);
   return audio.map((t,i)=>{const c=codecInfo(t.codec);return {i,lang:(t.lang||'und').toLowerCase(),name:t.name,codec:c.label,codec_id:t.codec,native:c.native,channels:t.channels,hz:t.hz,default:!!t.def};});
  }
  pos+=hdr+sz.size;
 }
 return [];
}

/* ------------------------------ ffmpeg ------------------------------ */
const OUT=(process.env.FILMGO_AUDIO_CODEC||'aac').toLowerCase()==='opus'
 ?{codec:['-c:a','libopus','-b:a','160k','-vbr','on','-application','audio','-frame_duration','20'],format:['-f','ogg'],type:'audio/ogg',rate:20000}
 :{codec:['-c:a','aac','-b:a','192k','-profile:a','aac_low'],format:['-f','adts'],type:'audio/aac',rate:24000};
const FFMPEG=process.env.FFMPEG_PATH||'ffmpeg';
let ffmpegOk=null;
export function ffmpegAvailable(){
 if(ffmpegOk!==null)return Promise.resolve(ffmpegOk);
 return new Promise(resolve=>{const c=spawn(FFMPEG,['-hide_banner','-version'],{stdio:'ignore'});c.once('error',()=>{ffmpegOk=false;resolve(false);});c.once('close',code=>{ffmpegOk=code===0;resolve(ffmpegOk);});});
}
// Stereo fold-down with a stronger centre (dialogue) than ffmpeg's default so films are not quiet.
const downmix=ch=>ch===6?'pan=stereo|FL=0.8*c0+0.62*c2+0.5*c4+0.28*c3|FR=0.8*c1+0.62*c2+0.5*c5+0.28*c3,alimiter=limit=0.97'
 :ch===8?'pan=stereo|FL=0.8*c0+0.62*c2+0.36*c4+0.36*c6+0.28*c3|FR=0.8*c1+0.62*c2+0.36*c5+0.36*c7+0.28*c3,alimiter=limit=0.97':'';
function ffmpegArgs(src,track,startSec,channels){
 const args=['-hide_banner','-loglevel','error','-nostdin','-fflags','+nobuffer+discardcorrupt','-probesize','1500000','-analyzeduration','1000000'];
 if(startSec>0.5)args.push('-ss',startSec.toFixed(3));
 args.push('-i',src,'-map','0:a:'+track,'-vn','-sn','-dn','-map_metadata','-1');
 const f=downmix(channels);if(f)args.push('-af',f);else args.push('-ac','2');
 args.push('-ar','48000',...OUT.codec,'-flush_packets','1','-muxdelay','0','-muxpreload','0',...OUT.format,'pipe:1');
 return args;
}

/* ------------------------------ service ------------------------------ */
const isLoopback=a=>a==='127.0.0.1'||a==='::1'||a==='::ffff:127.0.0.1';
const MAX_PROCS=Number(process.env.AUDIO_MAX_PROCS||10);
const LEAD_SECONDS=Number(process.env.AUDIO_LEAD_SECONDS||30);   // how far ahead of real time ffmpeg may run
const PACE=Number(process.env.AUDIO_PACE||1.5);                  // catch-up speed once the lead is used up

/**
 * ctx = {
 *   port, hmac(str)->hex, authenticated(req)->session|null,
 *   resolve(kind,id,quality)->{ext,total,name,open(start,length)->Readable}|null,
 *   reserve(session)->{allowed,settle(deliveredBytes)}|null, send(res,status,json,headers)
 * }
 */
export function createAudioService(ctx){
 const cache=new Map(),inflight=new Map(),active=new Map(),files=new Map();
 // First 1 MiB + last 2 MiB of recently used files stay in memory. They hold the Matroska header and Cues,
 // which ffmpeg re-reads on every start/seek, so a start costs one Telegram read instead of three or four.
 const HEAD=1<<20,TAIL=2<<20;
 const collect=stream=>new Promise((resolve,reject)=>{const chunks=[];const t=setTimeout(()=>stream.destroy(Error('read timeout')),20000);stream.on('data',c=>chunks.push(c));stream.once('error',e=>{clearTimeout(t);reject(e);});stream.once('close',()=>{clearTimeout(t);resolve(Buffer.concat(chunks));});});
 const fileEntry=key=>{let f=files.get(key);if(f){files.delete(key);}else{f={};if(files.size>=12)files.delete(files.keys().next().value);}files.set(key,f);return f;};
 const headOf=(m,key)=>{const f=fileEntry(key);return f.head||(f.head=collect(m.open(0,Math.min(HEAD,m.total))).then(b=>{if(b.length<Math.min(HEAD,m.total))throw Error('short head');return b;}).catch(e=>{f.head=null;throw e;}));};
 const tailOf=(m,key)=>{const f=fileEntry(key),base=Math.max(0,m.total-TAIL);return f.tail||(f.tail=collect(m.open(base,m.total-base)).then(b=>{if(b.length<m.total-base)throw Error('short tail');return b;}).catch(e=>{f.tail=null;throw e;}));};
 function openCached(m,key,start,end){
  const pt=new PassThrough({highWaterMark:64*1024}),headEnd=Math.min(HEAD,m.total),tailBase=Math.max(0,m.total-TAIL);
  (async()=>{
   try{
    if(end<headEnd){const h=await headOf(m,key);if(!pt.destroyed)pt.end(h.subarray(start,end+1));return;}
    if(start>=tailBase&&tailBase>headEnd){const tl=await tailOf(m,key);if(!pt.destroyed)pt.end(tl.subarray(start-tailBase,end-tailBase+1));return;}
    if(start<headEnd){const h=await headOf(m,key);if(pt.destroyed)return;if(!pt.write(h.subarray(start,headEnd)))await new Promise(r=>{pt.once('drain',r);pt.once('close',r);});if(pt.destroyed)return;}
    const from=Math.max(start,headEnd),src=m.open(from,end-from+1);   // only opened once the viewer really reads past the header
    pt.once('close',()=>src.destroy());src.on('error',e=>pt.destroy(e));src.pipe(pt);
   }catch(e){pt.destroy(e);}
  })();
  return pt;
 }
 const sig=(kind,id,q,exp)=>ctx.hmac('audio-src|'+kind+'|'+id+'|'+q+'|'+exp).slice(0,32);
 const mediaOk=m=>m&&/^(mkv|webm|mka)$/.test(m.ext||'');

 async function tracksFor(kind,id,quality){
  const m=await ctx.resolve(kind,id,quality);
  if(!m||!mediaOk(m))return {media:m,tracks:[]};
  const key=kind+':'+id+':'+(quality||'')+':'+m.total,hit=cache.get(key);
  if(hit&&hit.until>Date.now())return {media:m,tracks:hit.tracks};
  let p=inflight.get(key);
  if(!p){
   p=(async()=>{
    const fk=kind+':'+id+':'+(quality||'')+':'+m.total;
    const read=async(start,length)=>{if(start+length<=Math.min(HEAD,m.total)){const h=await headOf(m,fk);return h.subarray(start,start+length);}return collect(m.open(start,length));};
    try{const tracks=await probeMkv(read,m.total);cache.set(key,{tracks,until:Date.now()+6*3600e3});}
    catch(e){cache.set(key,{tracks:[],until:Date.now()+30e3});console.warn('Audio probe failed',kind,id,e.message);}
    if(cache.size>600){const now=Date.now();for(const [k,v] of cache)if(v.until<now||cache.size>500)cache.delete(k);}
    inflight.delete(key);return cache.get(key).tracks;
   })();inflight.set(key,p);
  }
  return {media:m,tracks:await p};
 }

 async function listTracks(req,res,kind,id,quality){
  const session=await ctx.authenticated(req);if(!session)return ctx.send(res,401,{error:'Please sign in using your phone number.'});
  const {tracks}=await tracksFor(kind,id,quality);
  const can=tracks.length>0&&await ffmpegAvailable();
  return ctx.send(res,200,{tracks,transcode:can,mime:OUT.type},{'Cache-Control':'private, max-age=120'});
 }

 async function streamAudio(req,res,kind,id,quality,track,startSec){
  const session=await ctx.authenticated(req);if(!session)return ctx.send(res,401,{error:'Please sign in using your phone number.'});
  const {media,tracks}=await tracksFor(kind,id,quality);
  const t=tracks[track];if(!media||!t)return ctx.send(res,404,{error:'Audio track unavailable'});
  if(!await ffmpegAvailable())return ctx.send(res,501,{error:'Audio conversion is not installed on this server'});
  if(active.size>=MAX_PROCS&&![...active.keys()].includes(session.number))return ctx.send(res,503,{error:'Audio converter busy; retry shortly'});
  const reservation=await ctx.reserve(session);if(reservation&&!reservation.allowed)return ctx.send(res,429,{error:'Daily tokens exhausted; reset is 00:00:00 UTC'});
  // One live converter per viewer: a seek or track change replaces the previous one.
  const prev=active.get(session.number);if(prev)prev.kill('SIGKILL');
  const exp=Date.now()+6*3600e3,src='http://127.0.0.1:'+ctx.port+'/internal/media/'+kind+'/'+encodeURIComponent(id)+'?quality='+encodeURIComponent(quality||'')+'&exp='+exp+'&sig='+sig(kind,id,quality||'',exp);
  const child=spawn(FFMPEG,ffmpegArgs(src,track,startSec,t.channels),{stdio:['ignore','pipe','pipe']});
  active.set(session.number,child);
  let delivered=0,started=false,errLog='',settled=false;const t0=Date.now();
  const settle=()=>{if(settled)return;settled=true;if(active.get(session.number)===child)active.delete(session.number);reservation?.settle?.(delivered);};
  const stop=()=>{if(!child.killed)child.kill('SIGKILL');};
  res.once('close',()=>{stop();settle();});
  child.stderr.on('data',c=>{errLog=(errLog+c).slice(-400);});
  let timer=0,blocked=false;
  const allowed=()=>delivered<=((Date.now()-t0)/1000*PACE+LEAD_SECONDS)*OUT.rate;
  const pump=()=>{
   if(res.destroyed||blocked)return;
   if(res.writableNeedDrain)return;                       // 'drain' resumes us
   if(!allowed()){clearTimeout(timer);const wait=Math.max(50,((delivered/OUT.rate-LEAD_SECONDS)/PACE*1000)-(Date.now()-t0));timer=setTimeout(pump,Math.min(wait,2000));return;}
   child.stdout.resume();
  };
  res.on('drain',pump);
  child.stdout.on('data',chunk=>{
   if(!started){started=true;res.writeHead(200,{'Content-Type':OUT.type,'Cache-Control':'no-store','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff','Accept-Ranges':'none','X-Audio-Start':String(startSec)});}
   delivered+=chunk.length;
   if(!res.write(chunk)||!allowed()){child.stdout.pause();if(!res.writableNeedDrain)pump();}
  });
  child.once('error',()=>{if(!started&&!res.headersSent)ctx.send(res,501,{error:'Audio conversion unavailable'});else res.destroy();settle();});
  child.once('close',code=>{clearTimeout(timer);if(!started){if(!res.headersSent&&!res.destroyed){console.warn('Audio converter failed',kind,id,track,code,errLog.trim());ctx.send(res,502,{error:'Audio could not be converted'});}}else if(!res.destroyed)res.end();settle();});
 }

 // Seekable loopback view of the file for ffmpeg (HTTP Range, open-ended ranges stream to EOF).
 async function serveInternal(req,res,kind,id,url){
  const quality=url.searchParams.get('quality')||'',exp=Number(url.searchParams.get('exp')),s=String(url.searchParams.get('sig')||'');
  if(!isLoopback(req.socket.remoteAddress)||!(exp>Date.now())||s.length!==32||s!==sig(kind,id,quality,exp)){res.writeHead(403);return res.end();}
  const m=await ctx.resolve(kind,id,quality);if(!m){res.writeHead(404);return res.end();}
  const total=m.total;let start=0,end=total-1;const r=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
  if(r){if(r[1]===''){start=Math.max(0,total-Number(r[2]));}else{start=Number(r[1]);if(r[2])end=Math.min(end,Number(r[2]));}}
  if(!(start<total)||end<start){res.writeHead(416,{'Content-Range':'bytes */'+total});return res.end();}
  const headers={'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':'no-store'};
  if(r)headers['Content-Range']='bytes '+start+'-'+end+'/'+total;
  res.writeHead(r?206:200,headers);if(req.method==='HEAD')return res.end();
  const src=openCached(m,kind+':'+id+':'+quality+':'+total,start,end);
  res.once('close',()=>src.destroy());
  src.on('error',()=>res.destroy());
  src.pipe(res);
 }

 return async function handle(req,res,url){
  const p=url.pathname;
  let m=p.match(/^\/api\/audio-tracks\/(movie|anime)\/([A-Za-z0-9_-]{1,80})$/);
  if(m&&req.method==='GET'){await listTracks(req,res,m[1],m[2],url.searchParams.get('quality')||'');return true;}
  m=p.match(/^\/api\/audio\/(movie|anime)\/([A-Za-z0-9_-]{1,80})$/);
  if(m&&req.method==='GET'){
   const track=Number(url.searchParams.get('track')),startSec=Math.min(Math.max(Number(url.searchParams.get('t'))||0,0),86400);
   if(!Number.isInteger(track)||track<0||track>31){ctx.send(res,400,{error:'Invalid audio track'});return true;}
   await streamAudio(req,res,m[1],m[2],url.searchParams.get('quality')||'',track,startSec);return true;
  }
  m=p.match(/^\/internal\/media\/(movie|anime)\/([A-Za-z0-9_%-]{1,120})$/);
  if(m&&(req.method==='GET'||req.method==='HEAD')){await serveInternal(req,res,m[1],decodeURIComponent(m[2]),url);return true;}
  return false;
 };
}

/* ------------------------------ Telegram range reader ------------------------------ */
// Turns "give me bytes S..S+L" into a Readable by chaining bounded gateway requests.
export function telegramRangeReader({spawnPython,gatewayRange,partSize=16*1024*1024,firstPart=4*1024*1024}){
 return function open(start,length){
  const out=new PassThrough({highWaterMark:1<<20});let current=null,child=null;
  out.once('close',()=>{current?.destroy();if(child&&!child.killed)child.kill('SIGTERM');});
  (async()=>{
   let off=start,remaining=length,first=true;
   while(remaining>0&&!out.destroyed){
    const size=Math.min(remaining,first?firstPart:partSize);first=false;
    let ok=null;
    if(gatewayRange){
     ok=await gatewayRange(out,size,off,p=>{current=p;});current=null;
    }
    if(ok===null){
     ok=await new Promise(resolve=>{let got=0,done=false;const fin=v=>{if(!done){done=true;resolve(v&&got===size);}};
      child=spawnPython(off,size);
      child.stdout.on('data',c=>{if(out.destroyed)return;got+=c.length;if(!out.write(c)){child.stdout.pause();out.once('drain',()=>child.stdout.resume());}});
      child.on('error',()=>fin(false));child.on('close',code=>fin(code===0));});
     child=null;
    }
    if(!ok){out.destroy(Error('Telegram range failed'));return;}
    off+=size;remaining-=size;
   }
   if(!out.destroyed)out.end();
  })();
  return out;
 };
}
