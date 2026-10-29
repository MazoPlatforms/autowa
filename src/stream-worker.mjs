import net from 'node:net';
import {spawn} from 'node:child_process';

const PORT=Number(process.env.STREAM_WORKER_PORT||8765);
let worker=null;
let state='stopped';
let lastError=null;
let stopping=false;
let retryTimer=null;
let restartCount=0;
const MAX_RESTARTS=8;

export function streamWorkerState(){return {state,restarts:restartCount,error:lastError};}

export function startStreamWorker(){
 if(worker||stopping||!['TELEGRAM_API_ID','TELEGRAM_API_HASH','TELEGRAM_SESSION','TELEGRAM_CHANNEL_ID'].every(k=>process.env[k]))return;
 state='starting';
 const child=spawn('python3',['-u','src/telegram_stream_server.py'],{env:process.env,stdio:['ignore','pipe','pipe']});
 worker=child;
 let stdout='';
 child.stdout.on('data',chunk=>{
  stdout=(stdout+chunk.toString()).slice(-1024);
  if(stdout.includes('READY')){state='ready';lastError=null;restartCount=0;}
  if(stdout.includes('AUTH_FAILED')){state='auth_failed';stopping=true;}
 });
 child.stderr.on('data',chunk=>{const line=chunk.toString().trim();if(line)console.warn('Stream worker:',line.slice(0,400));});
 child.on('error',err=>{lastError=err.message;state='error';});
 child.on('close',(code,signal)=>{
  if(worker!==child)return;
  worker=null;
  if(stopping||state==='auth_failed')return;
  state='stopped';lastError='Worker exited: '+code+' '+(signal||'');
  if(restartCount++>=MAX_RESTARTS){state='failed';return;}
  retryTimer=setTimeout(startStreamWorker,Math.min(30000,2000*restartCount));
  retryTimer.unref();
 });
}
process.once('SIGTERM',()=>{stopping=true;if(retryTimer)clearTimeout(retryTimer);worker?.kill('SIGTERM');});
process.once('SIGINT',()=>{stopping=true;if(retryTimer)clearTimeout(retryTimer);worker?.kill('SIGINT');});

export async function proxyRange(res,headers,{messageId,start,length,onChunk},send){
 if(state!=='ready')return false;
 let socket;
 try{
  socket=await new Promise((resolve,reject)=>{
   const conn=net.createConnection({host:'127.0.0.1',port:PORT});
   const timer=setTimeout(()=>conn.destroy(new Error('Worker connection timed out')),3000);
   conn.once('connect',()=>{clearTimeout(timer);resolve(conn);});
   conn.once('error',err=>{clearTimeout(timer);reject(err);});
  });
 }catch(err){lastError=err.message;return false;}
 return new Promise(resolve=>{
  let settled=false,headerParsed=false,bytes=0,buffer=Buffer.alloc(0),timer;
  const done=(success)=>{
   if(settled)return;settled=true;
   clearTimeout(timer);
   socket.destroy();
   resolve(success);
  };
  timer=setTimeout(()=>{
   if(!headerParsed)done(false);
   else {res.destroy(new Error('Stream worker timeout'));done(true);}
  },40000);
  socket.on('data',chunk=>{
   if(settled)return;
   if(!headerParsed){
    buffer=Buffer.concat([buffer,chunk]);
    const end=buffer.indexOf(10);
    if(end<0){if(buffer.length>512)done(false);return;}
    const response=buffer.subarray(0,end).toString('utf8').trim();
    chunk=buffer.subarray(end+1);buffer=Buffer.alloc(0);
    if(response!=='OK'){lastError=response.slice(0,160);done(false);return;}
    headerParsed=true;
    res.writeHead(206,headers);
   }
   if(chunk.length){
    bytes+=chunk.length;
    if(bytes>length){res.destroy(new Error('Worker sent excess data'));done(true);return;}
    onChunk?.(chunk.length);
    if(!res.write(chunk))socket.pause();
   }
   clearTimeout(timer);
   timer=setTimeout(()=>{res.destroy(new Error('Stream stalled'));done(true);},40000);
   if(bytes===length){res.end();done(true);}
  });
  res.on('drain',()=>socket.resume());
  res.once('close',()=>{if(!settled)done(true);});
  socket.on('error',err=>{lastError=err.message;if(headerParsed){res.destroy();done(true);}else done(false);});
  socket.on('end',()=>{if(!settled){if(headerParsed){res.destroy();done(true);}else done(false);}});
  socket.write(messageId+' '+start+' '+length+'\n');
 });
}

export async function downloadFile(res,{messageId,total,onChunk}){
 if(state!=='ready')return false;
 // Use a single HTTP response, but request bounded 32 MiB segments from the
 // persistent Telegram gateway. Never buffer the complete movie in memory.
 const SIZE=32*1024*1024;
 let sent=0;
 try{
  while(sent<total&&!res.destroyed){
   const expected=Math.min(SIZE,total-sent);
   await new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port:PORT});
    let header=Buffer.alloc(0),accepted=false,count=0,finished=false;
    const timeout=setTimeout(()=>fail(Error('Download segment timeout')),45000);
    const cleanup=()=>{clearTimeout(timeout);socket.destroy();res.off('close',abort);res.off('drain',resume);};
    const fail=err=>{if(finished)return;finished=true;cleanup();reject(err);};
    const abort=()=>fail(Error('Download cancelled'));
    const resume=()=>socket.resume();
    res.once('close',abort);res.on('drain',resume);
    socket.once('connect',()=>socket.write(messageId+' '+sent+' '+expected+'\\n'));
    socket.on('data',chunk=>{
     if(finished)return;
     if(!accepted){
      header=Buffer.concat([header,chunk]);
      const index=header.indexOf(10);
      if(index<0){if(header.length>512)fail(Error('Invalid worker response'));return;}
      const response=header.subarray(0,index).toString().trim();
      if(response!=='OK'){fail(Error('Worker rejected segment: '+response));return;}
      accepted=true;chunk=header.subarray(index+1);header=Buffer.alloc(0);
     }
     if(chunk.length){
      if(count+chunk.length>expected){fail(Error('Worker sent excess bytes'));return;}
      count+=chunk.length;
      onChunk?.(chunk.length);
      if(!res.write(chunk))socket.pause();
      if(count===expected){finished=true;cleanup();resolve();}
     }
    });
    socket.on('error',fail);
    socket.on('end',()=>{if(!finished)fail(Error('Incomplete download segment'));});
   });
   sent+=expected;
  }
  if(sent!==total)throw Error('Download incomplete');
  res.end();return true;
 }catch(err){
  lastError=err.message;
  if(res.headersSent)res.destroy(err);
  else{res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Download unavailable'}));}
  return true;
 }
}
