import {createRemoteJWKSet,jwtVerify} from 'jose';
import {issuer,resource,scopes,transaction,callback,grant,safeCode,completedTool} from './protocol.mjs';

const base=new URL('./',location.href);
const redirect=new URL('callback.html',base).href;
const prefix='browser-oauth-probe-v1:';
const keys={host:prefix+'host',client:prefix+'client',pending:prefix+'pending',events:prefix+'events'};
const $=id=>document.getElementById(id);
let access=null,busy=false,installPrompt=null,events=[];
try{events=JSON.parse(sessionStorage.getItem(keys.events)||'[]');if(!Array.isArray(events))events=[];}catch{}
function draw(){
  $('events').replaceChildren(...events.map(e=>{const li=document.createElement('li');li.dataset.ok=String(e.ok);li.textContent=`${e.at.slice(11,19)} · ${e.stage}: ${e.detail}`;return li;}));
  $('infer').disabled=$('models').disabled=busy||!access;
  $('forget').disabled=busy||!access;
  $('login').disabled=$('check').disabled=busy;
}
function note(stage,ok,detail){
  events.push({at:new Date().toISOString(),stage,ok,detail});events=events.slice(-60);
  // Entries contain stage/status only. Never add URLs with queries, headers,
  // response bodies, codes, PKCE material, tokens or identity values here.
  try{sessionStorage.setItem(keys.events,JSON.stringify(events));}catch{}
  draw();
}
function explain(error){return error instanceof TypeError?'Browser request unavailable: possible CORS or network failure. Inspect the browser Network panel.':error.message;}
async function run(stage,work){
  if(busy)return;
  busy=true;draw();
  try{await work();}catch(e){note(stage,false,explain(e));$('result').textContent=explain(e);if(stage==='Authorization')$('auth-status').textContent='Authorization did not complete.';}
  finally{busy=false;draw();}
}
async function request(url,options={}){
  const response=await fetch(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30_000),...options});
  if(!response.ok){let body;try{body=await response.json();}catch{}throw new Error(`HTTP ${response.status} (${safeCode(body?.error?.code||body?.error)}).`);}
  return response;
}
function bearer(){
  if(!access||access.expires<=Date.now()+5000){access=null;$('auth-status').textContent='Access expired. Authorize again.';draw();throw new Error('No unexpired access token.');}
  return {Authorization:`Bearer ${access.accessToken}`};
}
$('origin').textContent=location.origin;
$('redirect').textContent=redirect;
function registrationLabel(){return localStorage.getItem(keys.client)?'Browser registration saved; native CLI registration is not used.':'New browser registration.';}
try{$('registration').textContent=registrationLabel();}catch{$('registration').textContent='Browser storage unavailable.';}
$('origin-note').textContent=['localhost','127.0.0.1','[::1]'].includes(location.hostname)
  ?'This is a localhost static-host test. It can reveal browser/CORS behavior, but does not establish that OpenAI accepts an HTTPS callback on GitHub Pages.'
  :'This tests an HTTPS callback on the current static host. No loopback listener or application backend handles authorization.';

$('login').onclick=()=>run('Authorization',async()=>{
  if(!isSecureContext)throw new Error('Use HTTPS or localhost so Web Crypto and service workers are available.');
  access=null;
  let host=localStorage.getItem(keys.host);
  if(!host){host=`urn:uuid:${crypto.randomUUID()}`;localStorage.setItem(keys.host,host);}
  const client=localStorage.getItem(keys.client)||'dynamic_agent_client';
  const tx=await transaction({redirect,host,client});
  sessionStorage.setItem(keys.pending,JSON.stringify(tx.value));
  note('Authorization',true,`Opening OpenAI with ${scopes.join(' ')}; callback is a static HTML page.`);
  location.assign(tx.url);
});
$('forget').onclick=()=>{
  access=null;$('auth-status').textContent='Access token forgotten locally. Use ChatGPT settings to revoke the grant.';$('result').textContent='Waiting for authorization.';draw();
};
$('models').onclick=()=>run('Model catalog',async()=>{
  const response=await request(`${resource}/models`,{headers:bearer()});
  const data=await response.json();
  if(!Array.isArray(data.models))throw new Error('Unexpected model catalog shape.');
  const models=data.models.filter(m=>m.visibility==='list');
  note('Model catalog',true,`HTTP 200; ${models.length} available models.`);
  $('result').textContent=models.map(m=>m.slug).join('\n');
});
$('infer').onclick=()=>run('Inference',async()=>{
  const model=$('model').value.trim();
  if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(model))throw new Error('Enter a model ID, for example gpt-6-astra.');
  const start=performance.now();$('result').textContent='Waiting for a complete tool response…';
  const response=await request(`${resource}/responses`,{method:'POST',headers:{...bearer(),'Content-Type':'application/json'},signal:AbortSignal.timeout(90_000),body:JSON.stringify({
    model,store:false,stream:true,reasoning:{effort:'low'},
    instructions:'This is a browser authorization test. Call report with result set to ok.',input:[{role:'user',content:'Verify inference works.'}],
    tools:[{type:'function',name:'report',description:'Report authorization test success.',strict:true,parameters:{type:'object',properties:{result:{type:'string',enum:['ok']}},required:['result'],additionalProperties:false}}],
    tool_choice:'required',parallel_tool_calls:false,
  })});
  await completedTool(response.body);
  const seconds=((performance.now()-start)/1000).toFixed(2);
  note('Inference',true,`Completed ${model} tool call in ${seconds}s.`);$('result').textContent=`Success: ${model} returned report({ result: "ok" }) in ${seconds}s.`;
});
$('check').onclick=()=>run('Public endpoints',async()=>{
  for(const [label,url] of [['OIDC discovery',`${issuer}/.well-known/openid-configuration`],['Signing keys',`${issuer}/.well-known/jwks.json`]]){
    try{const response=await request(url);const data=await response.json();if(label==='Signing keys'&&!Array.isArray(data.keys))throw new Error('Invalid signing-key document.');note(label,true,`HTTP ${response.status}; readable from this browser origin.`);}
    catch(e){note(label,false,explain(e));}
  }
});
$('export').onclick=()=>{
  const report={version:1,origin:location.origin,callback:redirect,scopes,online:navigator.onLine,service_worker:!!navigator.serviceWorker?.controller,events};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='browser-auth-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false;});
$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}};
function connection(){$('connection').textContent=navigator.onLine?'Browser only':'Offline shell';}
addEventListener('online',connection);addEventListener('offline',connection);connection();draw();

const query=window.browserOAuthArrival;
delete window.browserOAuthArrival;
if(query){
  await run('Authorization',async()=>{
    const pending=JSON.parse(sessionStorage.getItem(keys.pending)||'null');
    sessionStorage.removeItem(keys.pending);
    const {client,code}=callback(query,pending,redirect);
    note('Callback',true,'Static callback loaded; state and issued client ID accepted. Code removed from the address bar.');
    // Save registration, not credentials. A failed exchange can be retried only
    // through a fresh authorization; the one-time code is never reused.
    localStorage.setItem(keys.client,client);$('registration').textContent=registrationLabel();
    const response=await request(`${issuer}/api/accounts/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,code,code_verifier:pending.verifier,redirect_uri:pending.redirect,resource})});
    const tokens=await response.json();
    const candidate=grant(tokens);
    note('Token exchange',true,`HTTP 200; exact scopes: ${candidate.scopes.join(' ')}. No refresh token.`);
    const jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`),{timeoutDuration:15000});
    const {payload}=await jwtVerify(tokens.id_token,jwks,{issuer,audience:client,algorithms:['RS256'],requiredClaims:['sub','iat','exp'],clockTolerance:5});
    if(typeof payload.sub!=='string'||!payload.sub||payload.nonce!==pending.nonce)throw new Error('Identity-token subject or nonce is invalid.');
    note('Identity verification',true,'Signature, issuer, audience, expiry and nonce verified. Identity values discarded.');
    access=candidate;$('auth-status').textContent='Authorized. Access lives only in this page until expiry or reload.';$('result').textContent='Ready to test inference.';
  });
}
if('serviceWorker' in navigator){
  try{await navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname});await navigator.serviceWorker.ready;$('offline-status').textContent='Offline shell cached. Authorization and inference still need the network.';}
  catch{$('offline-status').textContent='Offline cache unavailable. Use HTTPS or localhost.';}
}else $('offline-status').textContent='Service workers are unavailable in this browser.';
