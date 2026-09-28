import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../api/server.mjs';
import { createMatching, MatchError } from '../api/matching.mjs';

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'speakdaily-match-'));
  const {db}=createApp({dataDir:dir});
  let now=1_800_000_000_000;
  const match=createMatching(db,{clock:()=>now,heartbeatMs:30_000,offerMs:20_000});
  const user=(id,level='B1',eligible=true)=>{
    db.prepare('INSERT INTO users(id,email,password_hash) VALUES(?,?,?)').run(id,`${id}@example.com`,'dev-only');
    db.prepare('INSERT INTO profiles(user_id,goal,level,language,interests,daily_minutes) VALUES(?,?,?,?,?,?)').run(id,'Practice',level,'English','',10);
    if(eligible)db.prepare('INSERT INTO match_eligibility(user_id,adult_attested_at,rules_accepted_version,microphone_ready_at) VALUES(?,?,?,?)').run(id,now,'v1',now);
  };
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true})});
  return {db,match,user,advance:ms=>{now+=ms}};
}

test('only eligible real accounts match and both accept before connecting',t=>{
  const {db,match,user}=fixture(t);
  user('a');user('b');user('c','B1',false);
  assert.throws(()=>match.join('c'),e=>e instanceof MatchError&&e.code==='NOT_ELIGIBLE');
  assert.equal(match.join('a').state,'SEARCHING');
  assert.throws(()=>match.join('a'),e=>e.code==='ALREADY_ACTIVE'); // same account, second device
  const offer=match.join('b');assert.equal(offer.state,'MATCH_OFFERED');
  const a=match.state('a'),b=match.state('b');
  assert.equal(a.match_id,b.match_id);assert.notEqual(a.user_id,b.user_id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM matches').get().n,1);
  assert.equal(match.accept('b',offer.matchId,b.version).waitingForPartner,true);
  assert.equal(match.state('b').state,'MATCH_OFFERED');
  assert.equal(match.accept('a',offer.matchId,a.version).state,'CONNECTING');
  assert.equal(match.state('a').state,'CONNECTING');
  assert.throws(()=>match.accept('a',offer.matchId,a.version),e=>e.code==='STALE_OFFER');
});

test('atomic reservation prevents double allocation, blocked pairs, and stale cancellation',t=>{
  const {db,match,user}=fixture(t);
  user('a');user('b');user('c');
  match.join('a');const offer=match.join('b');
  assert.equal(match.join('c').state,'SEARCHING');
  assert.equal(db.prepare('SELECT count(*) AS n FROM matches').get().n,1);
  const av=match.state('a').version;
  match.cancel('b',match.state('b').version);
  assert.throws(()=>match.accept('a',offer.matchId,av),e=>e.code==='STALE_OFFER');
  assert.equal(match.state('a').state,'CANCELLED');
  match.block('a','c');
  assert.equal(match.join('a').state,'SEARCHING');
  assert.equal(match.state('c').state,'SEARCHING');
  assert.equal(db.prepare('SELECT count(*) AS n FROM matches').get().n,1);
  assert.throws(()=>match.cancel('a',av),e=>e.code==='STALE_STATE');
});

test('offer expiry, heartbeat expiry, and block during offer release reservations',t=>{
  const {db,match,user,advance}=fixture(t);
  user('a');user('b');user('c');
  match.join('a',{requeueOnDecline:true});const offer=match.join('b',{requeueOnDecline:false});
  advance(20_001);match.expire();
  assert.equal(match.state('a').state,'SEARCHING');assert.equal(match.state('b').state,'EXPIRED');
  assert.equal(db.prepare('SELECT state FROM matches WHERE id=?').get(offer.matchId).state,'EXPIRED');
  const next=match.join('c');assert.equal(next.state,'MATCH_OFFERED');
  match.block('a','c');
  assert.equal(match.state('a').state,'CANCELLED');assert.equal(match.state('c').state,'CANCELLED');
  assert.equal(db.prepare('SELECT state FROM matches WHERE id=?').get(next.matchId).state,'CANCELLED');
  match.join('b');advance(30_001);match.expire();
  assert.equal(match.state('b').state,'EXPIRED');
});

test('level preference is enforced unless both opt into broader range',t=>{
  const {match,user}=fixture(t);
  user('a','A1');user('b','C1');
  match.join('a');assert.equal(match.join('b').state,'SEARCHING');
  match.cancel('a',match.state('a').version);
  match.cancel('b',match.state('b').version);
  match.join('a',{allowBroader:true});
  // A1 and C1 are still beyond the approved two-level expansion.
  assert.equal(match.join('b',{allowBroader:true}).state,'SEARCHING');
});
