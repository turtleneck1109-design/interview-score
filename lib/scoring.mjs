import {questionsFor,validateQuestionList} from './questions.mjs';
export const baseKeys=['feeling','thinking','response','dialogue','impression'];
export const maxScores={feeling:3,thinking:4,response:3,dialogue:3,impression:2,work:4,scene1:3,scene2:3,photography:10};
export const specialName={none:'普通志愿者',lightning:'小闪电',photo:'摄影志愿者'};
export function keysFor(c){return [...baseKeys,...(c.special==='lightning'?['work','scene1','scene2']:c.special==='photo'?['photography']:[])];}
export function total(scores,keys){return keys.every(k=>typeof scores[k]==='number')?keys.reduce((n,k)=>n+scores[k],0):null;}
export function totals(e,c){return {base:total(e?.scores||{},baseKeys),extra:c.special==='none'?null:total(e?.scores||{},keysFor(c).filter(k=>!baseKeys.includes(k)))};}
// Live subtotals are separate from complete totals used for submitted results.
export function scoreProgress(scores,keys){const filled=keys.filter(k=>typeof scores[k]==='number'&&Number.isFinite(scores[k]));return {sum:filled.reduce((n,k)=>n+scores[k],0),filled:filled.length,required:keys.length,complete:filled.length===keys.length};}
export function liveTotals(e,c){const scores=e?.scores||{};return {base:scoreProgress(scores,baseKeys),extra:c.special==='none'?null:scoreProgress(scores,keysFor(c).filter(k=>!baseKeys.includes(k)))};}
export function validateEvaluation(e,c,bank,submitted){
 const errors=[],keys=keysFor(c);let all=bank;try{const custom=validateQuestionList(e.customQuestions||[],bank);if(custom.length>200)throw Error('本次自拟题过多');all=questionsFor(bank,{customQuestions:custom});}catch(err){errors.push(err.message);}
 for(const [k,v] of Object.entries(e.scores||{}))if(!keys.includes(k)||typeof v!=='number'||!Number.isFinite(v)||v<0||v>maxScores[k]||!Number.isInteger(v*2))errors.push('分数须在各项上限内，且以 0.5 分递增');
 if(!Array.isArray(e.asked)||e.asked.some(id=>!all.some(q=>q.id===id&&(['all',c.experience,c.special].includes(q.group)))))errors.push('所选题目与候选人类型不符');
 if(e.responses!==undefined){const validMap=e.responses&&typeof e.responses==='object'&&!Array.isArray(e.responses);if(!validMap||Object.entries(e.responses).length>5200||Object.entries(e.responses).some(([id,text])=>typeof text!=='string'||text.length>4000||!all.some(q=>q.id===id&&['all',c.experience,c.special].includes(q.group))))errors.push('回答格式不正确，每题最多 4000 字且须对应适用的题目');}
 if(e.retained!==undefined){const r=e.retained,object=v=>v&&typeof v==='object'&&!Array.isArray(v);if(!object(r)||!object(r.scores)||!object(r.responses)||!Array.isArray(r.asked)||r.asked.length>5200||Object.keys(r.responses).length>5200||Object.entries(r.scores).some(([k,v])=>!Object.prototype.hasOwnProperty.call(maxScores,k)||typeof v!=='number'||!Number.isFinite(v)||v<0||v>maxScores[k]||!Number.isInteger(v*2))||r.asked.some(id=>!all.some(q=>q.id===id))||Object.entries(r.responses).some(([id,text])=>typeof text!=='string'||text.length>4000||!all.some(q=>q.id===id)))errors.push('保留的历史记录格式不正确');}
 if(submitted){
  if(keys.some(k=>typeof e.scores?.[k]!=='number'))errors.push('请完成全部适用项目的评分');
  if(!['yes','no'].includes(e.availability))errors.push('请确认活动时间是否可以参加');
  if(e.availability==='no'&&!e.notes?.trim())errors.push('不能到场时，请在备注中记录具体情况');
 }
 return [...new Set(errors)];
}
// Matches the supplied workbook: count positive totals; blank and zero totals are not in its mean.
export function templateNormalize(value,peerValues){const xs=peerValues.filter(x=>typeof x==='number'&&x>0);if(value===null||!xs.length)return null;const mean=xs.reduce((a,b)=>a+b,0)/xs.length;return value===0?0:(value-mean)/mean;}
export function enrich(evaluations,candidates){const done=evaluations.filter(e=>e.status==='submitted');return done.map(e=>{const c=candidates.find(x=>x.id===e.candidateId);if(!c)return null;const t=totals(e,c);const own=done.filter(p=>p.userId===e.userId);const bases=own.map(p=>totals(p,candidates.find(x=>x.id===p.candidateId)||{special:'none'}).base);const extras=own.filter(p=>candidates.find(x=>x.id===p.candidateId)?.special===c.special).map(p=>totals(p,c).extra);return {...e,...t,normal:templateNormalize(t.base,bases),extraNormal:templateNormalize(t.extra,extras)};}).filter(Boolean);}
export function mean(xs){const values=xs.filter(x=>typeof x==='number'&&Number.isFinite(x));return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
export function csvCell(value){let s=value==null?'':String(value);if(/^[=+@\-\t\r]/.test(s)&&typeof value!=='number')s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
