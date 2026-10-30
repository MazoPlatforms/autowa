import net from 'node:net';
import {spawn} from 'node:child_process';

const PORT=Number(process.env.FAST_STREAM_WORKER_PORT||8766);
let worker=null,state='stopped',lastError=null,retryTimer=null,stopping=false,restartCount=0;

export function fastStreamWorkerState(){return {state,restarts:restartCount,error:lastError};}
export function startFastStreamWorker(){
 if(worker||stopping||!['TELEGRAM_API_ID','TELEGRAM_API_HASH','TELEGRAM_CHANNEL_ID'].every(k=>process.env[k])||!(process.env.STREAM_BOT_TOKEN||process.env.BOT_TOKEN||Object.keys(process.env).some(k=>k.startsWith('STREAM_MULTI_TOKEN'))))return;
 state='starting';worker=spawn('python3',['-u','src/telegram_stream_fast_server.py'],{env:{...process.env,FAST_STREAM_WORKER_PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
 worker.stdout.on('data',chunk=>{if(chunk.toString().includes('READY')){state='ready';lastError=null;restartCount=0;}});
 worker.stderr.on('data',chunk=>{const line=chunk.toString().trim();if(line)console.warn('Fast stream worker:',line.slice(0,400));});
 worker.on('error',err=>{lastError=err.message;state='error';});
 worker.on('close',(code,signal)=>{worker=null;if(stopping)return;state='stopped';lastError='Worker exited: '+code+' '+(signal||'');if(restartCount++<8){retryTimer=setTimeout(startFastStreamWorker,Math.min(30000,2000*restartCount));retryTimer.unref();}else state='failed';});
}
process.once('SIGTERM',()=>{stopping=true;if(retryTimer)clearTimeout(retryTimer);worker?.kill('SIGTERM');});
process.once('SIGINT',()=>{stopping=true;if(retryTimer)clearTimeout(retryTimer);worker?.kill('SIGINT');});

export async function fastProxyRange(res,headers,{messageId,start,length,onChunk},send){
 if(state!=='ready')return false;let socket;
 try{socket=await new Promise((resolve,reject)=>{const conn=net.createConnection({host:'127.0.0.1',port:PORT});const timer=setTimeout(()=>conn.destroy(new Error('Fast worker connection timeout')),3000);conn.once('connect',()=>{clearTimeout(timer);resolve(conn);});conn.once('error',e=>{clearTimeout(timer);reject(e);});});}catch(error){lastError=error.message;return false;}
 return new Promise(resolve=>{let settled=false,header=false,buffer=Buffer.alloc(0),bytes=0,timer;const done=ok=>{if(settled)return;settled=true;clearTimeout(timer);socket.destroy();resolve(ok);};timer=setTimeout(()=>{if(!header)done(false);else{res.destroy(new Error('Fast worker timeout'));done(true);}},40000);socket.on('data',chunk=>{if(settled)return;if(!header){buffer=Buffer.concat([buffer,chunk]);const end=buffer.indexOf(10);if(end<0){if(buffer.length>512)done(false);return;}const reply=buffer.subarray(0,end).toString().trim();chunk=buffer.subarray(end+1);buffer=Buffer.alloc(0);if(reply!=='OK'){lastError=reply;done(false);return;}header=true;res.writeHead(206,headers);}if(chunk.length){bytes+=chunk.length;if(bytes>length){res.destroy();done(true);return;}onChunk?.(chunk.length);if(!res.write(chunk))socket.pause();}clearTimeout(timer);timer=setTimeout(()=>{res.destroy();done(true);},40000);if(bytes===length){res.end();done(true);}});res.on('drain',()=>socket.resume());res.once('close',()=>{if(!settled)done(true);});socket.on('error',error=>{lastError=error.message;if(header){res.destroy();done(true);}else done(false);});socket.on('end',()=>{if(!settled){if(header){res.destroy();done(true);}else done(false);}});socket.write(`${messageId} ${start} ${length}\n`);});
}
