import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../api/server.mjs';

async function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'speakdaily-'));
  const {server,db}=createApp({dataDir:dir});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${server.address().port}`;
  const client=()=>{
    let jar={};
    return async (path,method='GET',data,headers={})=>{
      const res=await fetch(base+'/api/'+path,{method,headers:{...headers,...(data?{'Content-Type':'application/json'}:{}),Cookie:Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')},body:data?JSON.stringify(data):undefined});
      for(const raw of res.headers.getSetCookie()) { const [k,v]=raw.split(';')[0].split('=');jar[k]=v; }
      return {status:res.status,body:await res.json()};
    };
  };
  return {client,db,base};
}

test('guest practice limit, account migration, and ownership',async t=>{
  const {client}=await fixture(t), a=client(), b=client();
  const boot=await a('bootstrap');assert.equal(boot.body.guestRemaining,3);
  for(let i=0;i<3;i++) assert.equal((await a('practice','POST',{scenarioId:'introductions',input:`Hello ${i}`})).status,201);
  assert.equal((await a('practice','POST',{scenarioId:'introductions',input:'One more'})).status,429);
  assert.equal((await b('bootstrap')).body.practiceCount,0);
  assert.equal((await a('lessons/complete','POST',{lessonId:'greetings'})).status,200);
  await a('lessons/complete','POST',{lessonId:'greetings'});
  const reg=await a('auth/register','POST',{email:'Learner@Example.com',password:'correct-horse-42'});
  assert.equal(reg.status,201);
  const after=await a('bootstrap');assert.equal(after.body.practiceCount,3);assert.deepEqual(after.body.completed,['greetings']);
  assert.equal((await b('bootstrap')).body.practiceCount,0);
  assert.equal((await a('profile','POST',{goal:'Job interviews',level:'B1',language:'Hinglish',interests:'technology',dailyMinutes:15})).status,200);
  assert.equal((await a('bootstrap')).body.profile.goal,'Job interviews');
  await a('account/delete','POST');assert.equal((await a('bootstrap')).body.practiceCount,0);
});

test('auth checks, cookie isolation, and input validation',async t=>{
  const {client}=await fixture(t), a=client(), b=client();
  assert.equal((await a('profile','POST',{goal:'Hi'})).status,401);
  assert.equal((await a('practice','POST',{scenarioId:'unknown',input:'Hello'})).status,400);
  assert.equal((await a('practice','POST',{scenarioId:'introductions',input:'<script>alert(1)</script>'})).status,201);
  assert.equal((await a('auth/register','POST',{email:'x@example.com',password:'short'})).status,400);
  assert.equal((await a('auth/register','POST',{email:'x@example.com',password:'a-strong-passphrase'})).status,201);
  assert.equal((await b('auth/login','POST',{email:'x@example.com',password:'wrong-passphrase'})).status,401);
  assert.equal((await b('auth/login','POST',{email:'x@example.com',password:'a-strong-passphrase'})).status,200);
  assert.equal((await b('bootstrap')).body.practiceCount,1);
  assert.equal((await b('profile','POST',{goal:'Work',level:'B1',language:'English',interests:'',dailyMinutes:70})).status,400);
  assert.equal((await b('profile','POST',{goal:'Work',level:'B1',language:'English',interests:'',dailyMinutes:10},{Origin:'https://evil.example'})).status,403);
  await b('auth/logout','POST');assert.equal((await b('bootstrap')).body.user,null);
});

test('guest work migrates on login without duplicate lesson completion',async t=>{
  const {client}=await fixture(t), owner=client(), returning=client();
  await owner('auth/register','POST',{email:'return@example.com',password:'a-long-passphrase'});
  await owner('lessons/complete','POST',{lessonId:'greetings'});
  await returning('bootstrap');
  await returning('lessons/complete','POST',{lessonId:'greetings'});
  await returning('lessons/complete','POST',{lessonId:'names'});
  await returning('practice','POST',{scenarioId:'college',input:'I study engineering.'});
  assert.equal((await returning('auth/login','POST',{email:'return@example.com',password:'a-long-passphrase'})).status,200);
  const data=(await returning('bootstrap')).body;
  assert.deepEqual(data.completed.sort(),['greetings','names']);
  assert.equal(data.practiceCount,1);
});

test('production cannot run with development simulation',()=>{
  const before=process.env.APP_ENV;process.env.APP_ENV='production';
  try { assert.throws(()=>createApp(),/Refusing to start/); }
  finally { if(before===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=before; }
});
