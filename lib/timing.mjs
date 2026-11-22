// Keep the running timestamp in the evaluation; display ticks never write data.
const validTimestamp=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
export function validateTiming(value,status){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.elapsedMs)||value.elapsedMs<0||(value.startedAt!==null&&(!Number.isSafeInteger(value.startedAt)||value.startedAt<0||value.startedAt>8640000000000000))||(status==='submitted'&&value.startedAt!==null))throw Error('面试用时格式不正确');
 let periods;
 if(value.periods!==undefined){
  if(!Array.isArray(value.periods)||!value.periods.length||value.periods.length>10000)throw Error('面试时间段格式不正确');
  periods=value.periods.map((p,i)=>{
   if(!p||!validTimestamp(p.start)||(p.end!==null&&(!validTimestamp(p.end)||p.end<p.start))||(i&&p.start<value.periods[i-1].end)||(p.end===null&&(i!==value.periods.length-1||p.start!==value.startedAt)))throw Error('面试时间段格式不正确');
   return {start:p.start,end:p.end};
  });
  if((periods.at(-1).end===null)!==(value.startedAt!==null))throw Error('面试时间段与计时状态不一致');
 }
 let editPeriods=value.editPeriods;
 if(editPeriods!==undefined){
  if(!Array.isArray(editPeriods)||editPeriods.length>10000||editPeriods.some(p=>!p||!validTimestamp(p.start)||(p.end!==null&&(!validTimestamp(p.end)||p.end<p.start))))throw Error('历史修改时间段格式不正确');
  editPeriods=editPeriods.map(p=>({start:p.start,end:p.end}));
 }
 // Older versions timed post-submission edits. Preserve that history in backups,
 // while restoring the first completed interview as the authoritative timing.
 const first=periods?.[0],restoreFirst=periods?.length>1&&first.end!==null;
 if(restoreFirst)editPeriods=[...periods.slice(1),...(editPeriods||[])];
 return {elapsedMs:restoreFirst?first.end-first.start:value.elapsedMs,startedAt:restoreFirst?null:value.startedAt,...(periods?{periods:restoreFirst?[first]:periods}:{}),...(editPeriods?.length?{editPeriods}:{})};
}
export function timingIsLocked(e){return !!(e&&(e.timingLocked||e.status==='submitted'||e.timing?.startedAt===null||e.timing?.periods?.[0]?.end!=null));}
export function durationMs(timing,now=Date.now()){
 return timing?Math.min(Number.MAX_SAFE_INTEGER,timing.elapsedMs+(timing.startedAt===null?0:Math.max(0,now-timing.startedAt))):0;
}
export function startTiming(timing,now=Date.now()){
 const current=validateTiming(timing);
 if(current)return current;
 return {elapsedMs:0,startedAt:now,periods:[{start:now,end:null}]};
}
export function stopTiming(timing,now=Date.now()){
 const current=validateTiming(timing);
 if(!current||current.startedAt===null)return current;
 const periods=interviewPeriods(current),end=Math.max(now,current.startedAt);
 return {elapsedMs:durationMs(current,now),startedAt:null,periods:periods.map((p,i)=>i===periods.length-1?{...p,end}:p)};
}
export function interviewPeriods(timing){return timing?.periods||(timing?.startedAt!=null?[{start:timing.startedAt,end:null}]:[]);}
export function formatTimestamp(timestamp,date=true){
 if(timestamp==null||!validTimestamp(timestamp))return '';
 const d=new Date(timestamp),pad=n=>String(n).padStart(2,'0');
 return (date?`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} `:'')+`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function formatPeriod(period){
 const sameDay=period.end!==null&&new Date(period.start).toDateString()===new Date(period.end).toDateString();
 return `${formatTimestamp(period.start)} — ${period.end===null?'进行中':formatTimestamp(period.end,!sameDay)}`;
}
export function timingColumns(timing){
 const periods=interviewPeriods(timing);
 return [formatTimestamp(periods[0]?.start),formatTimestamp(periods.at(-1)?.end),periods.map(formatPeriod).join('\n')];
}
export function formatDuration(timing,now=Date.now()){
 const seconds=Math.floor(durationMs(timing,now)/1000),hours=Math.floor(seconds/3600);
 const mm=String(Math.floor(seconds/60)%60).padStart(2,'0'),ss=String(seconds%60).padStart(2,'0');
 return hours?`${String(hours).padStart(2,'0')}:${mm}:${ss}`:`${mm}:${ss}`;
}
const content=e=>JSON.stringify({
 scores:Object.entries(e?.scores||{}).sort(),asked:[...new Set(e?.asked||[])].sort(),
 responses:Object.entries(e?.responses||{}).sort(),notes:e?.notes||'',availability:e?.availability||'',
 customQuestions:(e?.customQuestions||[]).map(q=>[q.id,q.category,q.group,q.text,q.answer||'']).sort()
});
export const interviewChanged=(before,after)=>content(before)!==content(after);
