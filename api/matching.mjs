import { randomUUID } from 'node:crypto';

const LEVELS=['A1','A2','B1','B2','C1','C2'];
const ACTIVE=new Set(['SEARCHING','MATCH_OFFERED','CONNECTING','IN_CALL','RECONNECTING']);
export class MatchError extends Error {constructor(code){super(code);this.code=code}}

// Development-only queue domain. No RTC room credentials or public join endpoint.
export function createMatching(db,{clock=()=>Date.now(),heartbeatMs=30_000,offerMs=20_000}={}) {
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
  const presence=id=>db.prepare('SELECT * FROM match_presence WHERE user_id=?').get(id);
  const eligible=id=>{
    const row=db.prepare('SELECT adult_attested_at,rules_accepted_version,microphone_ready_at,suspended_at FROM match_eligibility WHERE user_id=?').get(id);
    return !!(row?.adult_attested_at && row.rules_accepted_version && row.microphone_ready_at && !row.suspended_at);
  };
  const blocked=(a,b)=>!!db.prepare('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').get(a,b,b,a);
  const setState=(id,state,matchId=null,now=clock())=>db.prepare('UPDATE match_presence SET state=?,match_id=?,version=version+1,heartbeat_at=? WHERE user_id=?').run(state,matchId,now,id);
  const levelCompatible=(a,b,broad)=>a==='unsure'||b==='unsure'||Math.abs(LEVELS.indexOf(a)-LEVELS.indexOf(b))<=(broad?2:1);
  function expireInside(now) {
    for(const row of db.prepare('SELECT user_id FROM match_presence WHERE state=? AND heartbeat_at<?').all('SEARCHING',now-heartbeatMs)) setState(row.user_id,'EXPIRED',null,now);
    for(const m of db.prepare('SELECT * FROM matches WHERE state=? AND expires_at<=?').all('MATCH_OFFERED',now)) {
      db.prepare('UPDATE matches SET state=? WHERE id=?').run('EXPIRED',m.id);
      for(const id of [m.a_user_id,m.b_user_id]) {
        const p=presence(id);
        if(p?.match_id===m.id&&p.state==='MATCH_OFFERED') setState(id,p.requeue_on_decline&&eligible(id)?'SEARCHING':'EXPIRED',null,now);
      }
    }
  }
  return {
    expire:()=>tx(()=>expireInside(clock())),
    state:id=>presence(id)||{user_id:id,state:'IDLE',version:0,match_id:null},
    join(id,{allowBroader=false,requeueOnDecline=false}={}) {return tx(()=>{
      const now=clock();expireInside(now);
      if(!eligible(id)) throw new MatchError('NOT_ELIGIBLE');
      const current=presence(id);
      if(current&&ACTIVE.has(current.state)) throw new MatchError('ALREADY_ACTIVE');
      const level=db.prepare('SELECT level FROM profiles WHERE user_id=?').get(id)?.level||'unsure';
      db.prepare(`INSERT INTO match_presence(user_id,state,version,match_id,joined_at,heartbeat_at,allow_broader,requeue_on_decline,level) VALUES(?, 'SEARCHING',1,NULL,?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET state='SEARCHING',version=version+1,match_id=NULL,joined_at=excluded.joined_at,heartbeat_at=excluded.heartbeat_at,allow_broader=excluded.allow_broader,requeue_on_decline=excluded.requeue_on_decline,level=excluded.level`).run(id,now,now,Number(allowBroader),Number(requeueOnDecline),level);
      const waiting=db.prepare('SELECT * FROM match_presence WHERE state=? AND user_id<>? ORDER BY joined_at,user_id').all('SEARCHING',id);
      const options=waiting.filter(p=>p.heartbeat_at>=now-heartbeatMs&&eligible(p.user_id)&&!blocked(id,p.user_id)&&levelCompatible(level,p.level,allowBroader&&!!p.allow_broader));
      if(!options.length) return {state:'SEARCHING',version:presence(id).version};
      // Prefer the oldest suitable waiter; avoid an immediate repeat when alternatives exist.
      const last=db.prepare('SELECT a_user_id,b_user_id FROM matches WHERE a_user_id=? OR b_user_id=? ORDER BY offered_at DESC,id DESC LIMIT 1').get(id,id);
      const lastPartner=last?(last.a_user_id===id?last.b_user_id:last.a_user_id):null;
      const candidate=options.find(p=>p.user_id!==lastPartner)||options[0];
      const matchId=randomUUID();
      db.prepare('INSERT INTO matches(id,a_user_id,b_user_id,state,offered_at,expires_at) VALUES(?,?,?,?,?,?)').run(matchId,candidate.user_id,id,'MATCH_OFFERED',now,now+offerMs);
      setState(id,'MATCH_OFFERED',matchId,now);setState(candidate.user_id,'MATCH_OFFERED',matchId,now);
      return {state:'MATCH_OFFERED',matchId,expiresAt:now+offerMs,version:presence(id).version};
    })},
    heartbeat(id,expectedVersion) {return tx(()=>{
      const p=presence(id);if(!p||p.version!==expectedVersion||p.state!=='SEARCHING') throw new MatchError('STALE_STATE');
      db.prepare('UPDATE match_presence SET heartbeat_at=? WHERE user_id=?').run(clock(),id);
      return {state:p.state,version:p.version};
    })},
    accept(id,matchId,expectedVersion) {return tx(()=>{
      const now=clock();expireInside(now);
      const p=presence(id),m=db.prepare('SELECT * FROM matches WHERE id=?').get(matchId);
      if(!p||p.version!==expectedVersion||p.state!=='MATCH_OFFERED'||p.match_id!==matchId||!m||m.state!=='MATCH_OFFERED'||m.expires_at<=now) throw new MatchError('STALE_OFFER');
      if(blocked(m.a_user_id,m.b_user_id)||!eligible(m.a_user_id)||!eligible(m.b_user_id)) throw new MatchError('NOT_ELIGIBLE');
      const column=m.a_user_id===id?'a_accepted':m.b_user_id===id?'b_accepted':null;
      if(!column) throw new MatchError('NOT_MEMBER');
      db.prepare(`UPDATE matches SET ${column}=1 WHERE id=?`).run(matchId);
      const updated=db.prepare('SELECT a_accepted,b_accepted FROM matches WHERE id=?').get(matchId);
      if(updated.a_accepted&&updated.b_accepted) {
        db.prepare('UPDATE matches SET state=? WHERE id=?').run('CONNECTING',matchId);
        setState(m.a_user_id,'CONNECTING',matchId,now);setState(m.b_user_id,'CONNECTING',matchId,now);
        return {state:'CONNECTING',matchId};
      }
      return {state:'MATCH_OFFERED',matchId,waitingForPartner:true,version:p.version};
    })},
    cancel(id,expectedVersion) {return tx(()=>{
      const p=presence(id),now=clock();if(!p||p.version!==expectedVersion||!ACTIVE.has(p.state)) throw new MatchError('STALE_STATE');
      if(p.match_id) {
        const m=db.prepare('SELECT * FROM matches WHERE id=?').get(p.match_id);
        if(m&&['MATCH_OFFERED','CONNECTING','IN_CALL','RECONNECTING'].includes(m.state)) {
          db.prepare('UPDATE matches SET state=? WHERE id=?').run('CANCELLED',m.id);
          const other=m.a_user_id===id?m.b_user_id:m.a_user_id;
          const op=presence(other);
          if(op?.match_id===m.id) setState(other,op.requeue_on_decline&&m.state==='MATCH_OFFERED'&&eligible(other)?'SEARCHING':'CANCELLED',null,now);
        }
      }
      setState(id,'CANCELLED',null,now);return {state:'CANCELLED'};
    })},
    block(id,other) {return tx(()=>{
      if(id===other||!db.prepare('SELECT id FROM users WHERE id=?').get(id)||!db.prepare('SELECT id FROM users WHERE id=?').get(other)) throw new MatchError('INVALID_BLOCK');
      const now=clock();db.prepare('INSERT OR IGNORE INTO blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').run(id,other,now);
      const p=presence(id),op=presence(other);
      if(p?.match_id&&p.match_id===op?.match_id) {
        db.prepare('UPDATE matches SET state=? WHERE id=?').run('CANCELLED',p.match_id);
        setState(id,'CANCELLED',null,now);setState(other,'CANCELLED',null,now);
      }
      return {blocked:true};
    })}
  };
}
