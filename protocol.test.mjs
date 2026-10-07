import test from 'node:test';
import assert from 'node:assert/strict';
import {transaction,callback,grant,scopes,completedTool} from './src/protocol.mjs';

test('browser PKCE preserves static callback and exact minimal scopes',async()=>{
 const redirect='https://example.github.io/browser-oauth-probe/callback.html';
 const {value,url}=await transaction({redirect,host:'urn:uuid:test'});
 const parsed=new URL(url);
 assert.equal(parsed.searchParams.get('redirect_uri'),redirect);
 assert.equal(parsed.searchParams.get('scope'),scopes.join(' '));
 assert.equal(parsed.searchParams.get('code_challenge_method'),'S256');
 assert.notEqual(parsed.searchParams.get('code_challenge'),value.verifier);
 assert.equal(parsed.searchParams.has('client_secret'),false);
 assert.equal(callback(`state=${value.state}&code=test&client_id=oaiapp_test`,value,redirect).client,'oaiapp_test');
 for(const [query,pending,target] of [
  ['state=wrong&code=test&client_id=oaiapp_test',value,redirect],
  [`state=${value.state}&code=test`,value,redirect],
  [`state=${value.state}&code=test&client_id=other`,{...value,client:'oaiapp_test'},redirect],
  [`state=${value.state}&code=test&client_id=oaiapp_test`,{...value,created:0},redirect],
  [`state=${value.state}&code=test&client_id=oaiapp_test`,value,'https://wrong.invalid/callback.html'],
  [`state=${value.state}&error=access_denied`,value,redirect],
 ])assert.throws(()=>callback(query,pending,target));
});
test('browser grant never accepts extra scopes or renewable access',()=>{
 const token={scope:scopes.join(' '),access_token:'fake',token_type:'Bearer',expires_in:3600};
 assert.deepEqual(Object.keys(grant({...token,id_token:'private',email:'private'})).sort(),['accessToken','expires','scopes']);
 assert.throws(()=>grant({...token,scope:token.scope+' email'}));
 assert.throws(()=>grant({...token,refresh_token:'fake-refresh'}));
});
test('browser streaming waits for terminal success',async()=>{
 const item={type:'response.output_item.done',output_index:0,item:{type:'function_call',name:'report',arguments:'{"result":"ok"}'}};
 const complete={type:'response.completed',response:{status:'completed',output:[]}};
 async function* stream(events){for(const e of events)yield Buffer.from(`data: ${JSON.stringify(e)}\n\n`);}
 assert.equal(await completedTool(stream([item,complete])),'ok');
 await assert.rejects(completedTool(stream([item])));
 await assert.rejects(completedTool(stream([item,{type:'response.failed'}])));
});
