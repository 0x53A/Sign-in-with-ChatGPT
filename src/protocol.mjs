export const issuer = 'https://auth.openai.com';
export const resource = 'https://api.openai.com/v1';
export const scopes = Object.freeze(['openid','resource.invoke','chatgpt.tokens.use.direct']);
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
export async function transaction({redirect,host,client='dynamic_agent_client'}) {
  const verifier=random();
  const value={state:random(),nonce:random(),verifier,redirect,client,created:Date.now()};
  const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  const url=new URL(`${issuer}/api/accounts/authorize`);
  url.search=new URLSearchParams({client_id:client,ext_agent_host_id:host,
    ...(client==='dynamic_agent_client'?{agent_name_hint:'Apteronotus PWA Probe'}:{}),
    response_type:'code',redirect_uri:redirect,scope:scopes.join(' '),resource,
    state:value.state,nonce:value.nonce,code_challenge_method:'S256',code_challenge:challenge,
  }).toString();
  return {value,url:url.toString()};
}
export function callback(query,pending,redirect) {
  const params=new URLSearchParams(query);
  if(!pending || !params.get('state') || params.get('state')!==pending.state || pending.redirect!==redirect || Date.now()-pending.created>10*60*1000) {
    throw new Error('Callback did not match an active authorization attempt. Start again from this tab.');
  }
  if(params.has('error')) throw new Error(`Provider declined authorization (${safeCode(params.get('error'))}).`);
  const client=params.get('client_id')||pending.client;
  if(!client || client==='dynamic_agent_client' || (pending.client!=='dynamic_agent_client'&&client!==pending.client)) throw new Error('Callback has a missing or mismatched issued client ID.');
  const code=params.get('code');
  if(!code)throw new Error('Callback did not contain an authorization code.');
  return {client,code};
}
export function grant(tokens) {
  const actual=typeof tokens.scope==='string'?tokens.scope.trim().split(/\s+/):[];
  if(!scopes.every(s=>actual.includes(s)) || actual.some(s=>!scopes.includes(s)) || tokens.refresh_token) {
    throw new Error('Provider returned unexpected permissions or renewable access; the grant was discarded.');
  }
  if(typeof tokens.access_token!=='string'||!tokens.access_token||tokens.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0) throw new Error('Invalid access-token response.');
  return {accessToken:tokens.access_token,expires:Date.now()+tokens.expires_in*1000,scopes:actual};
}
export function safeCode(value) { return typeof value==='string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value)?value:'unspecified'; }

export async function completedTool(body) {
  let buffer='',terminal;
  const items=new Map(),decoder=new TextDecoder();
  function consume(final=false){
    const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop();
    if(final&&buffer.trim()){blocks.push(buffer);buffer='';}
    for(const block of blocks){
      const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
      if(!data||data==='[DONE]')continue;
      const event=JSON.parse(data);
      if(['response.failed','response.incomplete','error'].includes(event.type))throw new Error(`Inference failed (${safeCode(event.response?.error?.code||event.code||event.type)}).`);
      if(event.type==='response.output_item.done')items.set(event.output_index,event.item);
      if(event.type==='response.completed')terminal=event.response;
    }
  }
  for await(const bytes of body){buffer+=decoder.decode(bytes,{stream:true});if(buffer.length>1024*1024)throw new Error('Response event exceeds probe limit.');consume();}
  buffer+=decoder.decode();consume(true);
  if(terminal?.status!=='completed')throw new Error('Stream ended without a completed response.');
  const output=terminal.output?.length?terminal.output:[...items.values()];
  const calls=output.filter(o=>o.type==='function_call');
  if(calls.length!==1||calls[0].name!=='report'||JSON.parse(calls[0].arguments).result!=='ok')throw new Error('The model did not return the expected test tool result.');
  return 'ok';
}
