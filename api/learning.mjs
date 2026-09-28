export const DAY=86_400_000;

// A small transparent schedule, not a measurement of English proficiency.
export function nextReview(item,result,now) {
  if(!['again','hard','good'].includes(result)) throw new Error('Invalid review result');
  if(result==='again') return {dueAt:now+DAY,intervalDays:1,repetitions:0,reviewedAt:now};
  if(result==='hard') {
    const interval=Math.max(1,Math.min(30,Math.ceil((item.interval_days||1)*1.5)));
    return {dueAt:now+interval*DAY,intervalDays:interval,repetitions:item.repetitions,reviewedAt:now};
  }
  const sequence=[1,3,7,14,30];
  const repetitions=Math.min(item.repetitions+1,5);
  const interval=sequence[repetitions-1];
  return {dueAt:now+interval*DAY,intervalDays:interval,repetitions,reviewedAt:now};
}

export function dailyPlan({profile,lessons,scenarios,completed,dueCount}) {
  const level=profile?.level||'A1';
  const ranks={A1:0,A2:1,B1:2,B2:3,C1:4,C2:5,unsure:0};
  const minutes=profile?.dailyMinutes||10;
  const slots=Math.max(1,Math.min(3,Math.floor(minutes/5)));
  const remaining=lessons.filter(l=>!completed.includes(l.id));
  const suitable=remaining.filter(l=>ranks[l.level]<=ranks[level]);
  const selected=(suitable.length?suitable:remaining).slice(0,slots);
  const goal=(profile?.goal||'').toLowerCase();
  const scenario=scenarios.find(s=>goal.includes('interview')?s.id==='interview':goal.includes('travel')?s.id==='travel':goal.includes('work')?s.id==='project':s.id==='introductions');
  return {estimatedMinutes:minutes,reviewDue:dueCount,lessons:selected.map(l=>l.id),scenarioId:scenario?.id||scenarios[0].id,
    note:'A simple plan based on your saved goal, self-reported level, daily target, completed lessons, and due review cards.'};
}
