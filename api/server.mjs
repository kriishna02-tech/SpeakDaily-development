import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { scenarios, lessons } from './content.mjs';
import { nextReview, dailyPlan } from './learning.mjs';
import { createOpenAITextProvider } from './ai.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webRoot = resolve(root, 'web');
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(body));
};
const fail = (res, code, message, status=400) => json(res,status,{error:{code,message}});
const sha = s => createHash('sha256').update(s).digest('hex');
const hashPassword = password => {
  const salt=randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;
};
const verifyPassword = (password, stored) => {
  const [salt,digest]=stored.split(':');
  return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(digest,'hex'));
};
const cookies = req => Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=').map(decodeURIComponent)).filter(a=>a.length===2));
const cookie = (res,name,value,maxAge) => res.setHeader('Set-Cookie',[...(res.getHeader('Set-Cookie')||[]),`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`]);
async function body(req) {
  let chunks=[], size=0;
  for await (const part of req) { size+=part.length; if(size>8192) { const e=new Error('Request is too large'); e.status=413; throw e; } chunks.push(part); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { const e=new Error('Valid JSON is required'); e.status=400; throw e; }
}
const valid = (v,max=120) => typeof v==='string' && v.trim().length>0 && v.length<=max;
const positiveLimit = (value,fallback) => Number.isInteger(Number(value)) && Number(value)>0 && Number(value)<=1000 ? Number(value) : fallback;
const profileFields = p => p && valid(p.goal,80) && ['A1','A2','B1','B2','C1','C2','unsure'].includes(p.level)
  && ['English','Hindi','Hinglish'].includes(p.language) && typeof p.interests==='string' && p.interests.length<=200
  && Number.isInteger(p.dailyMinutes) && p.dailyMinutes>=5 && p.dailyMinutes<=60;

function responseFor(input,scenario) {
  const clean=input.trim();
  const question=/\?$/.test(clean);
  const reply=question ? `That is a good question about ${scenario.title.toLowerCase()}. What would you say next?`
    : `I heard you say: “${clean.slice(0,100)}”. Can you tell me one more detail?`;
  return {reply,feedback:{kind:'practice_prompt',strength:'You completed a speaking or writing turn.',improvements:[],nextStep:'Add one specific detail to your answer.',notice:'Development simulation. No AI analysis or pronunciation measurement was performed.'}};
}

export function createApp({dataDir=resolve(root,'data'),provider}={}) {
  if(process.env.APP_ENV==='production') throw new Error('Production adapters are not configured. Refusing to start with simulation.');
  const ai=provider||(process.env.AI_PROVIDER==='openai'
    ?createOpenAITextProvider({apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_TEXT_MODEL})
    :{mode:'simulation',respond:async({input,scenario})=>responseFor(input,scenario)});
  const userDailyLimit=positiveLimit(process.env.AI_TEXT_USER_DAILY_LIMIT,10);
  const projectDailyLimit=positiveLimit(process.env.AI_TEXT_PROJECT_DAILY_LIMIT,100);
  mkdirSync(dataDir,{recursive:true});
  const db=new DatabaseSync(resolve(dataDir,'speakdaily.sqlite'));
  db.exec(readFileSync(resolve(root,'api/migrations/001_initial.sql'),'utf8'));
  db.exec(readFileSync(resolve(root,'api/migrations/002_review.sql'),'utf8'));
  db.exec(readFileSync(resolve(root,'api/migrations/003_usage.sql'),'utf8'));
  const findUser=db.prepare('SELECT u.id,u.email,u.password_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?');
  const reviewFor=db.prepare('SELECT id,lesson_id,due_at,interval_days,repetitions,reviewed_at FROM review_items WHERE owner_kind=? AND owner_id=? AND id=?');
  const moveReviews=(fromKind,fromId,toId)=>{
    for(const item of db.prepare('SELECT id,lesson_id FROM review_items WHERE owner_kind=? AND owner_id=?').all(fromKind,fromId)) {
      const existing=db.prepare('SELECT id FROM review_items WHERE owner_kind=? AND owner_id=? AND lesson_id=?').get('user',toId,item.lesson_id);
      if(existing) {
        db.prepare('UPDATE review_events SET item_id=?,owner_kind=?,owner_id=? WHERE item_id=?').run(existing.id,'user',toId,item.id);
        db.prepare('DELETE FROM review_items WHERE id=?').run(item.id);
      } else {
        db.prepare('UPDATE review_items SET owner_kind=?,owner_id=? WHERE id=?').run('user',toId,item.id);
        db.prepare('UPDATE review_events SET owner_kind=?,owner_id=? WHERE item_id=?').run('user',toId,item.id);
      }
    }
  };
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      const method=req.method;
      if(method==='GET' && url.pathname==='/api/health') return json(res,200,{status:'ok',mode:ai.mode});
      if(url.pathname.startsWith('/api/')) {
        if(!['GET','POST'].includes(method)) return fail(res,'METHOD_NOT_ALLOWED','Method not allowed',405);
        const origin=req.headers.origin;
        const host=req.headers.host;
        if(method==='POST' && origin && new URL(origin).host!==host) return fail(res,'ORIGIN_DENIED','Request origin not allowed',403);
        const c=cookies(req);
        let guest=c.sd_guest;
        if(!guest || !/^[a-f0-9-]{36}$/.test(guest)) { guest=randomUUID(); cookie(res,'sd_guest',guest,60*60*24*30); }
        const user=c.sd_session ? findUser.get(sha(c.sd_session),Date.now()) : null;
        const owner=user?.id||guest, kind=user?'user':'guest';
        if(method==='GET' && url.pathname==='/api/bootstrap') {
          const profile=user?db.prepare('SELECT goal,level,language,interests,daily_minutes AS dailyMinutes FROM profiles WHERE user_id=?').get(user.id):null;
          const count=db.prepare('SELECT count(*) AS n FROM practice WHERE owner_kind=? AND owner_id=?').get(kind,owner).n;
          const completed=db.prepare('SELECT lesson_id FROM lesson_progress WHERE owner_kind=? AND owner_id=? ORDER BY completed_at').all(kind,owner).map(x=>x.lesson_id);
          const dueRows=db.prepare('SELECT id,lesson_id,due_at,interval_days,repetitions FROM review_items WHERE owner_kind=? AND owner_id=? AND due_at<=? ORDER BY due_at,id LIMIT 20').all(kind,owner,Date.now());
          const due=dueRows.map(x=>({id:x.id,lessonId:x.lesson_id,prompt:lessons.find(l=>l.id===x.lesson_id)?.objective,answer:lessons.find(l=>l.id===x.lesson_id)?.example,dueAt:x.due_at}));
          const reviewTotal=db.prepare('SELECT count(*) AS n FROM review_items WHERE owner_kind=? AND owner_id=?').get(kind,owner).n;
          return json(res,200,{mode:ai.mode,user:user?{id:user.id,email:user.email}:null,profile,practiceCount:count,completed,scenarios,lessons,guestRemaining:user?null:Math.max(0,3-count),review:{due,total:reviewTotal},dailyPlan:dailyPlan({profile,lessons,scenarios,completed,dueCount:due.length})});
        }
        if(method==='POST' && url.pathname==='/api/auth/register') {
          const p=await body(req), email=String(p.email||'').trim().toLowerCase(), password=p.password;
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128) return fail(res,'INVALID_CREDENTIALS','Use a valid email and a password of 12–128 characters');
          if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) return fail(res,'EMAIL_EXISTS','An account with this email exists',409);
          const id=randomUUID(), token=randomBytes(32).toString('hex');
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('INSERT INTO users(id,email,password_hash) VALUES(?,?,?)').run(id,email,hashPassword(password));
            db.prepare('UPDATE practice SET owner_kind=?,owner_id=? WHERE owner_kind=? AND owner_id=?').run('user',id,'guest',guest);
            db.prepare('UPDATE lesson_progress SET owner_kind=?,owner_id=? WHERE owner_kind=? AND owner_id=?').run('user',id,'guest',guest);
            moveReviews('guest',guest,id);
            db.prepare('UPDATE ai_usage SET owner_kind=?,owner_id=? WHERE owner_kind=? AND owner_id=?').run('user',id,'guest',guest);
            db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token),id,Date.now()+30*86400e3);
            db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          cookie(res,'sd_session',token,30*86400); cookie(res,'sd_guest',randomUUID(),30*86400);
          return json(res,201,{user:{id,email}});
        }
        if(method==='POST' && url.pathname==='/api/auth/login') {
          const p=await body(req), email=String(p.email||'').trim().toLowerCase();
          const found=db.prepare('SELECT id,email,password_hash FROM users WHERE email=?').get(email);
          if(!found||typeof p.password!=='string'||!verifyPassword(p.password,found.password_hash)) return fail(res,'INVALID_CREDENTIALS','Email or password is incorrect',401);
          const token=randomBytes(32).toString('hex');
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('UPDATE practice SET owner_kind=?,owner_id=? WHERE owner_kind=? AND owner_id=?').run('user',found.id,'guest',guest);
            db.prepare('UPDATE OR IGNORE lesson_progress SET owner_kind=?,owner_id=? WHERE owner_kind=? AND owner_id=?').run('user',found.id,'guest',guest);
            db.prepare('DELETE FROM lesson_progress WHERE owner_kind=? AND owner_id=?').run('guest',guest);
            moveReviews('guest',guest,found.id);
            db.prepare('UPDATE ai_usage SET owner_kind=?,owner_id=? WHERE owner_kind=? AND owner_id=?').run('user',found.id,'guest',guest);
            db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token),found.id,Date.now()+30*86400e3);
            db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          cookie(res,'sd_session',token,30*86400); cookie(res,'sd_guest',randomUUID(),30*86400);
          return json(res,200,{user:{id:found.id,email:found.email}});
        }
        if(method==='POST' && url.pathname==='/api/auth/logout') {
          if(c.sd_session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(c.sd_session));
          cookie(res,'sd_session','',0); return json(res,200,{ok:true});
        }
        if(method==='POST' && url.pathname==='/api/guest/clear') {
          if(user) return fail(res,'GUEST_ONLY','Signed-in progress is managed with your account',409);
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('DELETE FROM review_events WHERE owner_kind=? AND owner_id=?').run('guest',guest);
            db.prepare('DELETE FROM review_items WHERE owner_kind=? AND owner_id=?').run('guest',guest);
            db.prepare('DELETE FROM lesson_progress WHERE owner_kind=? AND owner_id=?').run('guest',guest);
            db.prepare('DELETE FROM practice WHERE owner_kind=? AND owner_id=?').run('guest',guest);
            db.prepare('DELETE FROM ai_usage WHERE owner_kind=? AND owner_id=?').run('guest',guest);
            db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          cookie(res,'sd_guest',randomUUID(),30*86400);return json(res,200,{ok:true});
        }
        if(method==='GET' && url.pathname==='/api/account/export') {
          if(!user) return fail(res,'AUTH_REQUIRED','Sign in to export your data',401);
          const profile=db.prepare('SELECT goal,level,language,interests,daily_minutes AS dailyMinutes,updated_at FROM profiles WHERE user_id=?').get(user.id)||null;
          const practice=db.prepare('SELECT id,scenario_id,input,reply,feedback,created_at FROM practice WHERE owner_kind=? AND owner_id=? ORDER BY created_at,id').all('user',user.id).map(x=>({...x,feedback:JSON.parse(x.feedback)}));
          const completed=db.prepare('SELECT lesson_id,completed_at FROM lesson_progress WHERE owner_kind=? AND owner_id=?').all('user',user.id);
          const review=db.prepare('SELECT lesson_id,due_at,interval_days,repetitions,reviewed_at FROM review_items WHERE owner_kind=? AND owner_id=?').all('user',user.id);
          return json(res,200,{account:{email:user.email},profile,practice,completed,review});
        }
        if(method==='POST' && url.pathname==='/api/profile') {
          if(!user) return fail(res,'AUTH_REQUIRED','Create an account to save your profile',401);
          const p=await body(req);
          if(!profileFields(p)) return fail(res,'INVALID_PROFILE','Check goal, level, language, interests, and daily target');
          db.prepare(`INSERT INTO profiles(user_id,goal,level,language,interests,daily_minutes) VALUES(?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET goal=excluded.goal,level=excluded.level,language=excluded.language,interests=excluded.interests,daily_minutes=excluded.daily_minutes,updated_at=datetime('now')`).run(user.id,p.goal.trim(),p.level,p.language,p.interests.trim(),p.dailyMinutes);
          return json(res,200,{ok:true});
        }
        if(method==='POST' && url.pathname==='/api/practice') {
          const p=await body(req), scenario=scenarios.find(s=>s.id===p.scenarioId);
          if(!scenario||!valid(p.input,500)) return fail(res,'INVALID_PRACTICE','Choose a scenario and write 1–500 characters');
          const count=db.prepare('SELECT count(*) AS n FROM practice WHERE owner_kind=? AND owner_id=?').get(kind,owner).n;
          if(!user && count>=3) return fail(res,'GUEST_LIMIT','Create an account to continue practicing',429);
          const reservation=randomUUID(), day=new Date().toISOString().slice(0,10), now=Date.now();
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('DELETE FROM ai_usage WHERE status=? AND created_at<?').run('reserved',now-60_000);
            const outstanding=db.prepare('SELECT count(*) AS n FROM ai_usage WHERE owner_kind=? AND owner_id=? AND status=?').get(kind,owner,'reserved').n;
            const current=db.prepare('SELECT count(*) AS n FROM practice WHERE owner_kind=? AND owner_id=?').get(kind,owner).n;
            if(!user&&current+outstanding>=3) { db.exec('COMMIT'); return fail(res,'GUEST_LIMIT','Create an account to continue practicing',429); }
            if(ai.mode==='openai_text') {
              const personal=db.prepare('SELECT count(*) AS n FROM ai_usage WHERE owner_kind=? AND owner_id=? AND utc_day=? AND provider=?').get(kind,owner,day,ai.mode).n;
              const project=db.prepare('SELECT count(*) AS n FROM ai_usage WHERE utc_day=? AND provider=?').get(day,ai.mode).n;
              if(personal>=userDailyLimit||project>=projectDailyLimit) { db.exec('COMMIT'); return fail(res,'AI_DAILY_LIMIT','Today’s AI text allowance is used. Lessons and review remain available.',429); }
            }
            db.prepare('INSERT INTO ai_usage(id,owner_kind,owner_id,utc_day,provider,status,created_at) VALUES(?,?,?,?,?,?,?)').run(reservation,kind,owner,day,ai.mode,'reserved',now);
            db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          const profile=user?db.prepare('SELECT goal,level,language,interests,daily_minutes AS dailyMinutes FROM profiles WHERE user_id=?').get(user.id):null;
          const history=db.prepare('SELECT input,reply FROM practice WHERE owner_kind=? AND owner_id=? AND scenario_id=? ORDER BY created_at DESC,id DESC LIMIT 6').all(kind,owner,scenario.id).reverse();
          let result;
          try { result=await ai.respond({input:p.input.trim(),scenario,profile,history}); }
          catch { db.prepare('DELETE FROM ai_usage WHERE id=?').run(reservation);return fail(res,'AI_UNAVAILABLE','Tutor is unavailable right now. Try a lesson or review card.',503); }
          const id=randomUUID();
          db.exec('BEGIN IMMEDIATE');
          try {
            if(user&&!db.prepare('SELECT id FROM users WHERE id=?').get(user.id)) {db.prepare('DELETE FROM ai_usage WHERE id=?').run(reservation);db.exec('COMMIT');return fail(res,'AUTH_REQUIRED','Account is no longer active',401)}
            db.prepare('INSERT INTO practice(id,owner_id,owner_kind,scenario_id,input,reply,feedback) VALUES(?,?,?,?,?,?,?)').run(id,owner,kind,scenario.id,p.input.trim(),result.reply,JSON.stringify(result.feedback));
            db.prepare('UPDATE ai_usage SET status=? WHERE id=?').run('completed',reservation);
            db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          return json(res,201,{id,...result,mode:ai.mode});
        }
        if(method==='POST' && url.pathname==='/api/lessons/complete') {
          const p=await body(req);
          if(!lessons.some(l=>l.id===p.lessonId)) return fail(res,'INVALID_LESSON','Lesson not found',404);
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('INSERT OR IGNORE INTO lesson_progress(id,owner_kind,owner_id,lesson_id) VALUES(?,?,?,?)').run(randomUUID(),kind,owner,p.lessonId);
            db.prepare('INSERT OR IGNORE INTO review_items(id,owner_kind,owner_id,lesson_id,due_at) VALUES(?,?,?,?,?)').run(randomUUID(),kind,owner,p.lessonId,Date.now());
            db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          return json(res,200,{ok:true});
        }
        if(method==='POST' && url.pathname==='/api/review/grade') {
          const p=await body(req), eventId=typeof p.eventId==='string'?p.eventId.toLowerCase():'';
          if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(eventId)||!valid(p.itemId,36)||!['again','hard','good'].includes(p.result)) return fail(res,'INVALID_REVIEW','Valid item, result, and event ID are required');
          db.exec('BEGIN IMMEDIATE');
          try {
            const old=db.prepare('SELECT item_id,owner_kind,owner_id,result FROM review_events WHERE id=?').get(eventId);
            if(old) {
              db.exec('COMMIT');
              if(old.owner_kind!==kind||old.owner_id!==owner||old.item_id!==p.itemId||old.result!==p.result) return fail(res,'EVENT_CONFLICT','Review event ID was already used',409);
              return json(res,200,{ok:true,duplicate:true});
            }
            const item=reviewFor.get(kind,owner,p.itemId), now=Date.now();
            if(!item||item.due_at>now) { db.exec('COMMIT'); return fail(res,'REVIEW_NOT_DUE','Review card is missing or not due',409); }
            const next=nextReview(item,p.result,now);
            db.prepare('UPDATE review_items SET due_at=?,interval_days=?,repetitions=?,reviewed_at=? WHERE id=?').run(next.dueAt,next.intervalDays,next.repetitions,next.reviewedAt,item.id);
            db.prepare('INSERT INTO review_events(id,item_id,owner_kind,owner_id,result,reviewed_at) VALUES(?,?,?,?,?,?)').run(eventId,item.id,kind,owner,p.result,now);
            db.exec('COMMIT'); return json(res,200,{ok:true,dueAt:next.dueAt,intervalDays:next.intervalDays});
          } catch(e) { db.exec('ROLLBACK'); throw e; }
        }
        if(method==='POST' && url.pathname==='/api/account/delete') {
          if(!user) return fail(res,'AUTH_REQUIRED','Sign in to delete your account',401);
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('DELETE FROM practice WHERE owner_kind=? AND owner_id=?').run('user',user.id);
            db.prepare('DELETE FROM lesson_progress WHERE owner_kind=? AND owner_id=?').run('user',user.id);
            db.prepare('DELETE FROM review_events WHERE owner_kind=? AND owner_id=?').run('user',user.id);
            db.prepare('DELETE FROM review_items WHERE owner_kind=? AND owner_id=?').run('user',user.id);
            db.prepare('DELETE FROM ai_usage WHERE owner_kind=? AND owner_id=?').run('user',user.id);
            db.prepare('DELETE FROM users WHERE id=?').run(user.id);
            db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          cookie(res,'sd_session','',0); return json(res,200,{ok:true});
        }
        return fail(res,'NOT_FOUND','Endpoint not found',404);
      }
      if(method!=='GET' && method!=='HEAD') return fail(res,'METHOD_NOT_ALLOWED','Method not allowed',405);
      const path=url.pathname==='/'?'/index.html':url.pathname;
      if(!['/index.html','/app.js','/style.css'].includes(path)) return fail(res,'NOT_FOUND','File not found',404);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
      const data=readFileSync(resolve(webRoot,path.slice(1)));
      res.writeHead(200,{'Content-Type':types[extname(path)],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'"});
      res.end(method==='HEAD'?undefined:data);
    } catch(e) { if(e.status) return fail(res,'BAD_REQUEST',e.message,e.status); console.error('request_failed',e.message); return fail(res,'INTERNAL','Something went wrong',500); }
  });
  return {server,db};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server}=createApp({dataDir:resolve(process.env.DATA_DIR||resolve(root,'data'))});
  const port=Number(process.env.PORT||3000), host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log(`SpeakDaily development server: http://${host}:${port}`));
}
