// Run the static server first: npm run serve
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const output=new URL('./target/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp(new URL('chrome-',output));
const browser=spawn(process.env.CHROMIUM||'/run/current-system/sw/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){try{const r=await fn();if(r)return r;}catch{}await delay(100);}throw Error('Browser check timed out');}
let ws;
try{
 const port=await until(async()=>Number((await fs.readFile(`${profile}/DevToolsActivePort`,'utf8')).split('\n')[0]));
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let seq=0;const pending=new Map(),networkFailures=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(m.method==='Network.loadingFailed')networkFailures.push({error:m.params.errorText,cors:m.params.corsErrorStatus?.corsError});if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},35000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
 await call('Page.enable');await call('Network.enable');
 const base=process.env.PROBE_URL||'http://127.0.0.1:8766/';
 await call('Page.navigate',{url:base+'index.html'});
 await until(()=>evaluate("document.getElementById('offline-status')?.textContent.includes('cached')"));
 await until(()=>evaluate('!!navigator.serviceWorker.controller'));
 assert.equal(await evaluate("document.getElementById('infer').disabled"),true);
 await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await call('Page.navigate',{url:base+'callback.html?code=fixture-secret&state=invalid'});
 await until(()=>evaluate("document.getElementById('auth-status')?.textContent==='Authorization did not complete.'"));
 assert.equal(await evaluate('location.search'),'');
 assert.equal(await evaluate("JSON.stringify({...localStorage,...sessionStorage}).includes('fixture-secret')"),false);
 assert.equal(await evaluate("(async()=>{const names=await caches.keys();const keys=(await Promise.all(names.map(async n=>(await(await caches.open(n)).keys()).map(r=>r.url)))).flat();return keys.some(k=>k.includes('?')||k.includes('openai.com'));})()"),false);
 await call('Page.navigate',{url:base+'index.html'});
 await until(()=>evaluate("document.getElementById('offline-status')?.textContent.includes('cached')"));
 assert.equal(await evaluate("document.getElementById('connection').textContent"),'Offline shell');
 await call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await evaluate("document.getElementById('check').click()");
 await until(()=>evaluate("!document.getElementById('check').disabled"));
 const diagnostics=await evaluate("document.getElementById('events').innerText");
 console.log('PASS: offline index and callback; invalid callback rejected; callback query stripped; no code persisted or cached; inference disabled without grant.');
 console.log('Actual public-endpoint browser diagnostics:\n'+diagnostics);console.log('Browser network failures:',JSON.stringify(networkFailures));
 const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
 await fs.writeFile(new URL('screenshot.png',output),Buffer.from(screenshot.data,'base64'));
}finally{ws?.close();browser.kill();}
