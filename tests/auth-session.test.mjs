import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth} from '../src/google/auth.js';

const CLIENT = 'session-test.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
function fixture() {
  const values = new Map();
  const storage = {getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key)};
  let time = 100000, requests = 0, config, prompt;
  const google = {accounts:{oauth2:{initTokenClient(value) {
    config=value;
    return {requestAccessToken(options){requests++;prompt=options.prompt;}};
  }}}};
  const create = () => createAuth({getGoogle:()=>google,getStorage:()=>storage,now:()=>time});
  return {values,storage,create,get requests(){return requests;},get prompt(){return prompt;},
    advance:ms=>{time+=ms;},
    async authorize(auth) {
      await auth.prepare(CLIENT);
      const pending=auth.connect(CLIENT);
      config.callback({access_token:'SESSION_FIXTURE',expires_in:3600,scope:SCOPE});
      await pending;
    }};
}

test('reload restores the same client session without GIS or another prompt; expiry is not extended', async()=>{
  const f=fixture(), first=f.create();
  await f.authorize(first);
  assert.equal(f.prompt,'');
  await first.connect(CLIENT);
  assert.equal(f.requests,1);
  f.advance(1000);
  const reloaded=f.create();
  assert.equal(reloaded.restore(CLIENT),true);
  assert.equal(reloaded.token(),'SESSION_FIXTURE');
  await reloaded.connect(CLIENT);
  assert.equal(f.requests,1);
  f.advance(3570000);
  assert.equal(reloaded.isConnected(),false);
  assert.equal(f.values.size,0);
  assert.equal(f.create().restore(CLIENT),false);
});

test('disconnect and client changes remove resumable authorization',async()=>{
  const f=fixture(), auth=f.create();
  await f.authorize(auth);
  auth.disconnect();
  assert.equal(f.values.size,0);
  assert.equal(f.create().restore(CLIENT),false);
  await f.authorize(auth);
  assert.equal(f.create().restore('another.apps.googleusercontent.com'),false);
  assert.equal(f.values.size,0);
  await f.authorize(auth);
  await auth.prepare('another.apps.googleusercontent.com');
  assert.equal(auth.isConnected(),false);
  assert.equal(f.values.size,0);
});

test('corrupt, wrong-scope and expired stored sessions are discarded',async()=>{
  for(const mutate of [()=>'{invalid',v=>JSON.stringify({...v,scope:'openid'}),v=>JSON.stringify({...v,expiresAt:1}),v=>JSON.stringify({...v,accessToken:42})]) {
    const f=fixture();await f.authorize(f.create());
    const [key,value]=[...f.values][0];
    f.values.set(key,mutate(JSON.parse(value)));
    assert.equal(f.create().restore(CLIENT),false);
    assert.equal(f.values.size,0);
  }
});

test('unavailable session storage preserves current authorization but reports reload cannot resume',async()=>{
  let config;
  const auth=createAuth({getStorage:()=>{throw new Error('blocked');},getGoogle:()=>({accounts:{oauth2:{initTokenClient(c){config=c;return {requestAccessToken(){}};}}}})});
  assert.equal(auth.restore(CLIENT),false);
  await auth.prepare(CLIENT);
  const pending=auth.connect(CLIENT);
  config.callback({access_token:'MEMORY_FIXTURE',expires_in:3600,scope:SCOPE});
  await pending;
  assert.equal(auth.isConnected(),true);
  assert.equal(auth.sessionSaved(),false);
  auth.disconnect();
});
