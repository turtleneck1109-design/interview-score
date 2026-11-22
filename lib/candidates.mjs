import {validCampus,isMinhang,questionsFor} from './questions.mjs';
import {keysFor} from './scoring.mjs';
export const profileFields=['name','studentId','campus','experience','special','candidateNotes'];
export const profileVersion=c=>c.profileVersion||0;
export const sameProfile=(a,b)=>profileFields.every(k=>(a[k]??'')===(b[k]??''));
export const needsCandidateProfile=c=>!['new','experienced'].includes(c?.experience)||!['none','lightning','photo'].includes(c?.special);
export function candidateFields(input,{allowIncomplete=false}={}){
 const name=typeof input.name==='string'?input.name.trim():'',studentId=typeof input.studentId==='string'?input.studentId.trim():'';
 if(!name||name.length>40)throw Error('请填写 1–40 字的姓名');
 if(!studentId||studentId.length>40)throw Error('请填写 1–40 字的学号');
 if(!validCampus(input.campus))throw Error('请填写校区（最多 80 字）');
 if(!(allowIncomplete&&input.experience==='')&&!['new','experienced'].includes(input.experience)||!(allowIncomplete&&input.special==='')&&!['none','lightning','photo'].includes(input.special))throw Error('请补充是否参加过上马 / 半马，以及志愿者类型');
 if(input.special==='lightning'&&!isMinhang(input.campus))throw Error('小闪电仅限闵行校区同学');
 const candidateNotes=input.candidateNotes??'';
 if(typeof candidateNotes!=='string'||candidateNotes.length>4000)throw Error('候选人备注最多 4000 字');
 return {name,studentId,campus:input.campus.trim(),experience:input.experience,special:input.special,candidateNotes};
}
export function reclassifyEvaluation(e,previous,next,bank){
 if(previous.experience===next.experience&&previous.special===next.special)return e;
 const all=questionsFor(bank,e),applicable=id=>all.some(q=>q.id===id&&['all',next.experience,next.special].includes(q.group));
 const allScores={...(e.retained?.scores||{}),...e.scores},allResponses={...(e.retained?.responses||{}),...(e.responses||{})},allAsked=[...new Set([...(e.retained?.asked||[]),...e.asked])],keys=keysFor(next);
 return {...e,scores:Object.fromEntries(Object.entries(allScores).filter(([k])=>keys.includes(k))),asked:allAsked.filter(applicable),responses:Object.fromEntries(Object.entries(allResponses).filter(([id])=>applicable(id))),retained:{scores:Object.fromEntries(Object.entries(allScores).filter(([k])=>!keys.includes(k))),asked:allAsked.filter(id=>!applicable(id)),responses:Object.fromEntries(Object.entries(allResponses).filter(([id])=>!applicable(id)))},status:'draft',availability:'',version:e.version+1,updatedAt:new Date().toISOString()};
}
export function prepareCandidate(data,input,id,bank){
 const fields=candidateFields(input),old=data.candidates.find(c=>c.id===id);
 if(data.candidates.some(c=>c.id!==id&&c.studentId===fields.studentId))throw Error('该学号已存在，请检查是否为同一位候选人');
 const candidate={...(old||{}),...fields,id,profileVersion:profileVersion(old||{})+1,profileUpdatedAt:new Date().toISOString()};
 const evaluations=old?data.evaluations.map(e=>e.candidateId===id?reclassifyEvaluation(e,old,candidate,bank):e):data.evaluations;
 return {candidate,data:{...data,candidates:old?data.candidates.map(c=>c.id===id?candidate:c):[...data.candidates,candidate],evaluations},classificationChanged:!!old&&!needsCandidateProfile(old)&&(old.experience!==candidate.experience||old.special!==candidate.special)};
}
export function removeCandidate(data,id){
 if(!data.candidates.some(c=>c.id===id))throw Error('候选人已不存在，请刷新名单');
 return {...data,candidates:data.candidates.filter(c=>c.id!==id),evaluations:data.evaluations.filter(e=>e.candidateId!==id)};
}
