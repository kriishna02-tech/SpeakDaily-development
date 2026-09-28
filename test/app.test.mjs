import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../api/server.mjs';
import { nextReview, dailyPlan, DAY } from '../api/learning.mjs';
import { createOpenAITextProvider } from '../api/ai.mjs';
import { DatabaseSync } from 'node:sqlite';

async function fixture(t,options={}) {
  const dir=mkdtempSync(join(tmpdir(),'speakdaily-'));
  const {server,db}=createApp({dataDir:dir,...options});
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

test('review schedule and daily plan use explicit activity, not proficiency scores',()=>{
  const now=1_800_000_000_000;
  assert.deepEqual(nextReview({interval_days:0,repetitions:0},'good',now),{dueAt:now+DAY,intervalDays:1,repetitions:1,reviewedAt:now});
  assert.equal(nextReview({interval_days:1,repetitions:1},'good',now).intervalDays,3);
  assert.equal(nextReview({interval_days:7,repetitions:3},'again',now).repetitions,0);
  const p=dailyPlan({profile:{goal:'job interview',level:'B1',dailyMinutes:15},lessons:[{id:'one',level:'A1'},{id:'two',level:'B1'},{id:'three',level:'C1'}],scenarios:[{id:'introductions'},{id:'interview'}],completed:['one'],dueCount:2});
  assert.deepEqual(p.lessons,['two']);assert.equal(p.scenarioId,'interview');assert.equal(p.reviewDue,2);
});

test('review creation, idempotent grading, ownership, and account migration',async t=>{
  const {client,db}=await fixture(t), guest=client(), other=client();
  await guest('bootstrap');await other('bootstrap');
  await guest('lessons/complete','POST',{lessonId:'greetings'});
  await guest('lessons/complete','POST',{lessonId:'greetings'});
  const first=(await guest('bootstrap')).body;
  assert.equal(first.review.total,1);assert.equal(first.review.due.length,1);
  const item=first.review.due[0];
  const eventId='11111111-1111-4111-8111-111111111111';
  assert.equal((await other('review/grade','POST',{itemId:item.id,result:'good',eventId})).status,409);
  const graded=await guest('review/grade','POST',{itemId:item.id,result:'good',eventId});
  assert.equal(graded.status,200);assert.equal(graded.body.intervalDays,1);
  assert.equal((await guest('review/grade','POST',{itemId:item.id,result:'good',eventId})).body.duplicate,true);
  assert.equal((await guest('review/grade','POST',{itemId:item.id,result:'hard',eventId})).status,409);
  assert.equal((await guest('bootstrap')).body.review.due.length,0);
  const reg=await guest('auth/register','POST',{email:'review@example.com',password:'review-passphrase'});
  assert.equal(reg.status,201);assert.equal((await guest('bootstrap')).body.review.total,1);
  const row=db.prepare('SELECT owner_kind,result FROM review_events WHERE id=?').get(eventId);
  assert.equal(row.owner_kind,'user');assert.equal(row.result,'good');
  await guest('account/delete','POST');
  assert.equal(db.prepare('SELECT count(*) AS n FROM review_events').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM review_items').get().n,0);
});

test('login merges guest review card with existing account card',async t=>{
  const {client,db}=await fixture(t), account=client(), guest=client();
  await account('auth/register','POST',{email:'same@example.com',password:'long-enough-password'});
  await account('lessons/complete','POST',{lessonId:'names'});
  await guest('bootstrap');await guest('lessons/complete','POST',{lessonId:'names'});
  const item=(await guest('bootstrap')).body.review.due[0];
  await guest('review/grade','POST',{itemId:item.id,result:'good',eventId:'22222222-2222-4222-8222-222222222222'});
  assert.equal((await guest('auth/login','POST',{email:'same@example.com',password:'long-enough-password'})).status,200);
  assert.equal((await guest('bootstrap')).body.review.total,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM review_events WHERE owner_kind=?').get('user').n,1);
});

test('OpenAI text adapter keeps credentials server-side and rejects incomplete output',async()=>{
  let request;
  const provider=createOpenAITextProvider({apiKey:'test-secret',model:'gpt-6-luna',fetchImpl:async(url,options)=>{
    request={url,options};
    return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({reply:'Tell me more about your course.',strength:'Clear introduction.',nextStep:'Add your subject.',improvements:[]})}]}]})};
  }});
  const result=await provider.respond({input:'I am a student.',scenario:{role:'classmate',title:'College',objective:'Introduce yourself'},profile:{level:'A1',language:'Hindi'},history:[]});
  assert.equal(result.feedback.kind,'ai_text_feedback');
  assert.equal(request.url,'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization,'Bearer test-secret');
  const payload=JSON.parse(request.options.body);
  assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);assert.equal(payload.input.at(-1).content,'I am a student.');
  assert.equal(payload.reasoning.effort,'none');assert.equal(payload.max_output_tokens,450);
  assert.ok(!JSON.stringify(result).includes('test-secret'));
  assert.throws(()=>createOpenAITextProvider({apiKey:'test-secret',model:'gpt-6-sol'}),/supports only gpt-6-luna/);
  const bad=createOpenAITextProvider({apiKey:'test-secret',model:'gpt-6-luna',fetchImpl:async()=>({ok:true,json:async()=>({status:'incomplete',output:[]})})});
  await assert.rejects(bad.respond({input:'Hi',scenario:{role:'classmate',title:'College',objective:'Hi'},history:[]}),/did not complete/);
});

test('concurrent guest requests reserve allowance and provider failure releases it',async t=>{
  let release;
  const blocked=new Promise(r=>release=r);
  const provider={mode:'openai_text',respond:async()=>{await blocked;return {reply:'Hello',feedback:{kind:'ai_text_feedback',strength:'Hello',improvements:[],nextStep:'Continue',notice:'Text only'}}}};
  const {client,db}=await fixture(t,{provider}), a=client();
  await a('bootstrap');
  const requests=Array.from({length:3},(_,i)=>a('practice','POST',{scenarioId:'college',input:`Hello ${i}`}));
  await new Promise(r=>setTimeout(r,30));
  assert.equal((await a('practice','POST',{scenarioId:'college',input:'Fourth'})).status,429);
  release();
  const results=await Promise.all(requests);assert.deepEqual(results.map(r=>r.status),[201,201,201]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM ai_usage WHERE status=?').get('completed').n,3);
});

test('provider failure returns visible outage and does not consume an allowance',async t=>{
  const {client,db}=await fixture(t,{provider:{mode:'openai_text',respond:async()=>{throw new Error('secret provider detail')}}}), a=client();
  await a('bootstrap');const response=await a('practice','POST',{scenarioId:'college',input:'Hello'});
  assert.equal(response.status,503);assert.ok(!JSON.stringify(response.body).includes('secret'));
  assert.equal((await a('bootstrap')).body.guestRemaining,3);
  assert.equal(db.prepare('SELECT count(*) AS n FROM ai_usage').get().n,0);
  assert.equal(db.prepare('SELECT reserved_micro_usd FROM ai_project_budget WHERE id=1').get().reserved_micro_usd,50_000);
});

test('lifetime app budget reserves before a call and survives account deletion',async t=>{
  let calls=0;
  const provider={mode:'openai_text',respond:async()=>{calls++;return {reply:'Hi',feedback:{kind:'ai_text_feedback',strength:'Clear',nextStep:'Continue',improvements:[],notice:'Text only'}}}};
  const {client,db}=await fixture(t,{provider});
  db.prepare('UPDATE ai_project_budget SET reserved_micro_usd=? WHERE id=1').run(4_450_000);
  const a=client(),b=client();
  await a('auth/register','POST',{email:'budget@example.com',password:'longer-passphrase'});
  assert.equal((await a('practice','POST',{scenarioId:'college',input:'Hello'})).status,201);
  assert.equal(db.prepare('SELECT reserved_micro_usd FROM ai_project_budget WHERE id=1').get().reserved_micro_usd,4_500_000);
  assert.equal((await a('account/delete','POST')).status,200);
  await b('bootstrap');
  const response=await b('practice','POST',{scenarioId:'college',input:'Hello'});
  assert.equal(response.status,429);assert.equal(response.body.error.code,'AI_BUDGET_LIMIT');
  assert.equal(calls,1);
});

test('data export includes only the signed-in owner and excludes credentials',async t=>{
  const {client}=await fixture(t), a=client(), b=client();
  assert.equal((await a('account/export')).status,401);
  await a('auth/register','POST',{email:'data@example.com',password:'export-passphrase'});
  await a('practice','POST',{scenarioId:'travel',input:'Where is the station?'});
  await b('auth/register','POST',{email:'other@example.com',password:'another-passphrase'});
  const own=(await a('account/export')).body, other=(await b('account/export')).body;
  assert.equal(own.practice.length,1);assert.equal(other.practice.length,0);
  assert.ok(!JSON.stringify(own).includes('export-passphrase'));
  assert.ok(!JSON.stringify(own).includes('password_hash'));
});

test('existing phase-one database upgrades without losing learning records',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'speakdaily-upgrade-'));
  const old=new DatabaseSync(join(dir,'speakdaily.sqlite'));
  old.exec(readFileSync(new URL('../api/migrations/001_initial.sql',import.meta.url),'utf8'));
  old.prepare('INSERT INTO practice(id,owner_id,owner_kind,scenario_id,input,reply,feedback) VALUES(?,?,?,?,?,?,?)').run('old-turn','guest-1','guest','college','Hello','Hi','{}');
  old.close();
  const {server,db}=createApp({dataDir:dir});
  t.after(()=>{db.close();server.close();rmSync(dir,{recursive:true,force:true})});
  assert.equal(db.prepare('SELECT input FROM practice WHERE id=?').get('old-turn').input,'Hello');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='review_items'").get().name,'review_items');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='ai_usage'").get().name,'ai_usage');
  assert.equal(db.prepare('SELECT reserved_micro_usd FROM ai_project_budget WHERE id=1').get().reserved_micro_usd,0);
});

test('real text mode enforces configured account and project reservation caps',async t=>{
  const beforeUser=process.env.AI_TEXT_USER_DAILY_LIMIT,beforeProject=process.env.AI_TEXT_PROJECT_DAILY_LIMIT;
  process.env.AI_TEXT_USER_DAILY_LIMIT='1';process.env.AI_TEXT_PROJECT_DAILY_LIMIT='1';
  const provider={mode:'openai_text',respond:async()=>({reply:'Hi',feedback:{kind:'ai_text_feedback',strength:'Clear',nextStep:'Continue',improvements:[],notice:'Text only'}})};
  const {client}=await fixture(t,{provider});
  if(beforeUser===undefined)delete process.env.AI_TEXT_USER_DAILY_LIMIT;else process.env.AI_TEXT_USER_DAILY_LIMIT=beforeUser;
  if(beforeProject===undefined)delete process.env.AI_TEXT_PROJECT_DAILY_LIMIT;else process.env.AI_TEXT_PROJECT_DAILY_LIMIT=beforeProject;
  const a=client(),b=client();
  await a('auth/register','POST',{email:'cap1@example.com',password:'longer-passphrase'});
  await b('auth/register','POST',{email:'cap2@example.com',password:'longer-passphrase'});
  assert.equal((await a('practice','POST',{scenarioId:'college',input:'Hello'})).status,201);
  assert.equal((await a('practice','POST',{scenarioId:'college',input:'Again'})).status,429);
  assert.equal((await b('practice','POST',{scenarioId:'college',input:'Hello'})).status,429);
});

test('guest can clear local learning records without affecting another guest',async t=>{
  const {client}=await fixture(t), a=client(), b=client();
  await a('bootstrap');await b('bootstrap');
  await a('practice','POST',{scenarioId:'college',input:'I study computing.'});
  await a('lessons/complete','POST',{lessonId:'greetings'});
  await b('lessons/complete','POST',{lessonId:'names'});
  assert.equal((await a('guest/clear','POST')).status,200);
  const after=(await a('bootstrap')).body;
  assert.equal(after.practiceCount,0);assert.equal(after.review.total,0);assert.deepEqual(after.completed,[]);
  assert.deepEqual((await b('bootstrap')).body.completed,['names']);
});
