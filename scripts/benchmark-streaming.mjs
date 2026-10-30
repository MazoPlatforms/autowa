import net from 'node:net';
import {performance} from 'node:perf_hooks';

const TOTAL=64*1024*1024;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function mockGateway({chunkSize,partDelay,connectionDelay}){
 return net.createServer(async socket=>{
  await sleep(connectionDelay);
  let header='';socket.on('data',async data=>{
   header+=data.toString();const end=header.indexOf('\n');if(end<0)return;
   const [,startText,lengthText]=header.slice(0,end).trim().split(' ');header='';let left=Number(lengthText);let offset=Number(startText);
   socket.write('OK\n');
   while(left>0){const size=Math.min(chunkSize,left);await sleep(partDelay);socket.write(Buffer.alloc(size,offset%251));offset+=size;left-=size;}
  });
 });
}

async function transfer({port,rangeSize,oneConnection}){
 const started=performance.now();let transferred=0,start=0;
 const getRange=(offset,length)=>new Promise((resolve,reject)=>{
  const socket=net.createConnection({host:'127.0.0.1',port});let accepted=false,received=0,header=Buffer.alloc(0);
  socket.on('connect',()=>socket.write(`1 ${offset} ${length}\n`));
  socket.on('data',chunk=>{if(!accepted){header=Buffer.concat([header,chunk]);const end=header.indexOf(10);if(end<0)return;const rest=header.subarray(end+1);accepted=true;chunk=rest;}if(accepted){received+=chunk.length;if(received>=length){socket.destroy();resolve();}}});socket.on('error',reject);
 });
 if(oneConnection){await getRange(0,TOTAL);transferred=TOTAL;}else{while(start<TOTAL){const length=Math.min(rangeSize,TOTAL-start);await getRange(start,length);start+=length;transferred+=length;}}
 const seconds=(performance.now()-started)/1000;return {bytes:transferred,seconds,mbps:transferred/1048576/seconds};
}

async function run(){
 const baselineServer=mockGateway({chunkSize:512*1024,partDelay:2,connectionDelay:4});await new Promise(r=>baselineServer.listen(0,'127.0.0.1',r));
 const baseline=await transfer({port:baselineServer.address().port,rangeSize:32*1024*1024,oneConnection:false});baselineServer.close();
 const fastServer=mockGateway({chunkSize:1024*1024,partDelay:2,connectionDelay:0});await new Promise(r=>fastServer.listen(0,'127.0.0.1',r));
 const fast=await transfer({port:fastServer.address().port,rangeSize:32*1024*1024,oneConnection:true});fastServer.close();
 const report={generated_at:new Date().toISOString(),bytes:TOTAL,model:'Local loopback synthetic gateway; not Telegram throughput.',existing_like:baseline,biisal_like:fast,speedup:fast.mbps/baseline.mbps};console.log(JSON.stringify(report,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
