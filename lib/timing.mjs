// Keep the running timestamp in the evaluation; display ticks never write data.
export function validateTiming(value,status){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.elapsedMs)||value.elapsedMs<0||(value.startedAt!==null&&(!Number.isSafeInteger(value.startedAt)||value.startedAt<0||value.startedAt>8640000000000000))||(status==='submitted'&&value.startedAt!==null))throw Error('面试用时格式不正确');
 return {elapsedMs:value.elapsedMs,startedAt:value.startedAt};
}
export function durationMs(timing,now=Date.now()){
 return timing?Math.min(Number.MAX_SAFE_INTEGER,timing.elapsedMs+(timing.startedAt===null?0:Math.max(0,now-timing.startedAt))):0;
}
export function startTiming(timing,now=Date.now()){
 const current=validateTiming(timing);
 return current?.startedAt!=null?current:{elapsedMs:current?.elapsedMs||0,startedAt:now};
}
export function stopTiming(timing,now=Date.now()){
 const current=validateTiming(timing);
 return current?{elapsedMs:durationMs(current,now),startedAt:null}:undefined;
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
