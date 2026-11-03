import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/player-ui.js',import.meta.url),'utf8');
const pause=()=>new Promise(r=>setImmediate(r));
function dialog(responses){
 const heading={},copy={},button={},location={pathname:'/anime/watch/sample'},calls=[];let closed=false;
 const context={window:{},location,AbortSignal,fetch:async(path,options)=>{calls.push({path,options});const next=responses.shift();if(next instanceof Error)throw next;if(typeof next==='function')return next();return {status:next.status||200,ok:!next.status||next.status===200,json:async()=>({state:next.state})};}};
 vm.runInNewContext(source,context);
 const gate=context.window.FilmGoPlayerUI.whatsappRequest({querySelector:s=>s==='h2'?heading:copy},button,'Confirm anime request','Example · Episode 1',()=>{closed=true;});
 return {gate,heading,copy,button,calls,location,get closed(){return closed;}};
}
test('unlinked request offers linking without queuing media',async()=>{
 const d=dialog([{state:'disconnected'}]);assert.equal(d.button.disabled,true);await pause();assert.equal(d.button.textContent,'Link WhatsApp');assert.match(d.copy.textContent,/no request tokens/);assert.equal(await d.gate.confirm(),false);assert.equal(d.location.href,'/profile#linked-whatsapp');assert.equal(d.closed,true);assert.equal(d.calls.length,1);
});
test('guest request offers sign in with return path',async()=>{
 const d=dialog([{status:401}]);await pause();assert.equal(d.button.textContent,'Sign in');assert.equal(await d.gate.confirm(),false);assert.match(d.location.href,/return=%2Fanime%2Fwatch%2Fsample#linked-whatsapp/);
});
test('linked request describes self delivery and rechecks before sending',async()=>{
 const d=dialog([{state:'connected'},{state:'connected'}]);await pause();assert.equal(d.button.textContent,'Confirm & send');assert.match(d.copy.textContent,/Message yourself/);assert.equal(await d.gate.confirm(),true);assert.equal(d.calls.length,2);for(const c of d.calls)assert.equal(c.options.cache,'no-store');
});
test('disconnect between opening and confirming blocks delivery',async()=>{
 const d=dialog([{state:'connected'},{state:'disconnected'}]);await pause();assert.equal(await d.gate.confirm(),false);assert.equal(d.button.textContent,'Link WhatsApp');
});
test('reconnecting request requires a separate confirmation once ready',async()=>{
 const d=dialog([{state:'reconnecting'},{state:'connected'},{state:'connected'}]);await pause();assert.equal(d.button.textContent,'Check connection');assert.equal(await d.gate.confirm(),false);assert.equal(d.button.textContent,'Confirm & send');assert.equal(await d.gate.confirm(),true);
});
test('status errors fail closed and allow retries',async()=>{
 const d=dialog([new Error('offline'),{state:'connected'}]);await pause();assert.equal(d.button.textContent,'Try again');assert.equal(await d.gate.confirm(),false);assert.equal(d.button.textContent,'Confirm & send');
});
test('closing during a status recheck never submits media',async()=>{
 let finish;const d=dialog([{state:'connected'},()=>new Promise(r=>finish=r)]);await pause();const pending=d.gate.confirm();d.gate.cancel();finish({ok:true,status:200,json:async()=>({state:'connected'})});assert.equal(await pending,false);
});
