import {DEFAULT_INTERVIEW_NAME,validInterviewName} from './workspace.mjs';
import {validateQuestionList,questionSignature,validCampus,isMinhang} from './questions.mjs';
import {validateEvaluation} from './scoring.mjs';
import {reviewerState} from './reviewers.mjs';
import {validateInstructions} from './instructions.mjs';
import {validateTiming,timingIsLocked} from './timing.mjs';
import {candidateFields,profileVersion,sameProfile,reclassifyEvaluation,profileFields,needsCandidateProfile} from './candidates.mjs';
export const APP='shangma-score-offline';
export const KEY='shangma-interview-offline-v1';
export const uid=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
export const empty=()=>{const id=uid();return {revision:0,interviewName:DEFAULT_INTERVIEW_NAME,reviewerNameConfirmed:false,activeId:id,members:[{id,name:'面试官 1',role:'admin'}],candidates:[],evaluations:[],questions:[]};};
export const view=d=>({...d,evaluations:d.evaluations.map(e=>({...e,...(e.timing?{timing:validateTiming(e.timing)}:{}),timingLocked:timingIsLocked(e)})),interviewName:validInterviewName(d.interviewName)?d.interviewName:DEFAULT_INTERVIEW_NAME,questions:d.questions||[],access:[],me:d.members.find(m=>m.id===d.activeId&&!m.archived)||d.members.find(m=>!m.archived)});
let memory=null,memoryOnly=false;
export function storageAvailable(){return !memoryOnly;}
export function readLocal(){if(memoryOnly)return structuredClone(memory||empty());let raw;try{raw=localStorage.getItem(KEY);}catch{memoryOnly=true;memory=memory||empty();return structuredClone(memory);}if(raw){try{return JSON.parse(raw);}catch{throw Error('本机评分数据无法读取，请通过之前导出的备份恢复。');}}const d=empty();writeLocal(d,undefined);return d;}
export function writeLocal(data,expected){if(expected!==undefined&&readLocal().revision!==expected)throw Error('数据已被另一个页面更新。请先备份当前评分，再刷新页面。');const d=structuredClone(data);delete d.me;delete d.access;d.revision=(expected??-1)+1;memory=d;if(!memoryOnly){try{localStorage.setItem(KEY,JSON.stringify(d));}catch{memoryOnly=true;}}return view(d);}
export function resetLocal(expected,confirmation){
 if(confirmation!=='确认清空')throw Error('请输入“确认清空”');
 const current=readLocal();
 if(current.revision!==expected)throw Error('数据已被另一个页面更新，未清空。请刷新后重新确认。');
 if(memoryOnly)throw Error('当前浏览器无法访问本机保存的数据，未清空。请恢复保存权限并刷新后重试。');
 const next={...empty(),revision:current.revision+1};
 try{localStorage.setItem(KEY,JSON.stringify(next));}catch{throw Error('清空失败，原有数据保留。请检查浏览器保存权限后重试。');}
 memory=next;
 return view(next);
}
export function pack(data,type='all'){
 const noRatings=['roster','bank'].includes(type);
 const candidates=(type==='bank'?[]:data.candidates).filter(c=>type!=='own'||reviewerState(data,c.id).ownerId===data.me.id).map(c=>{const ownerId=reviewerState(data,c.id).ownerId;return ownerId?{...c,reviewerId:ownerId}:c;});
 const members=type==='bank'?[]:type==='own'?data.members.filter(m=>m.id===data.me.id):type==='roster'?data.members.filter(m=>candidates.some(c=>c.reviewerId===m.id)):data.members;
 return {app:APP,formatVersion:2,type,...(type==='bank'?{}:{interviewName:data.interviewName||DEFAULT_INTERVIEW_NAME}),...(['all','roster'].includes(type)&&data.interviewInstructions?{interviewInstructions:data.interviewInstructions}:{}),exportedAt:new Date().toISOString(),questions:data.questions||[],members,candidates,evaluations:noRatings?[]:type==='own'?data.evaluations.filter(e=>e.userId===data.me.id&&candidates.some(c=>c.id===e.candidateId)):data.evaluations};
}
export function completeBankPack(data,bank){return {...pack(data,'bank'),questions:[...bank,...(data.questions||[])]};}
const str=(v,n=200)=>typeof v==='string'&&v.length>0&&v.length<=n;
function assert(v,msg){if(!v)throw Error(msg);}
export function validatePackage(p,bank){
 assert(p&&p.app===APP&&[1,2].includes(p.formatVersion),'请选择本页面导出的 JSON 评分包、名单、题库或备份文件。');
 assert(Array.isArray(p.members)&&p.members.length<=1000&&Array.isArray(p.candidates)&&p.candidates.length<=10000&&Array.isArray(p.evaluations)&&p.evaluations.length<=50000,'文件内容或数量不正确。');
 if(p.interviewName!==undefined)assert(validInterviewName(p.interviewName),'面试名称格式不正确');
 const interviewInstructions=p.interviewInstructions===undefined?undefined:validateInstructions(p.interviewInstructions);
 const questions=validateQuestionList(p.questions||[]).filter(q=>{const builtIn=bank.find(b=>b.id===q.id);if(!builtIn)return true;assert(questionSignature(q)===questionSignature(builtIn),'内置题目内容不同：'+q.id+'；修改题目后请使用新的 custom- 编号');return false;}),fullBank=[...bank,...questions];
 const members=p.members.map(m=>{assert(m&&str(m.id)&&str(m.name,40)&&(m.archived===undefined||typeof m.archived==='boolean'),'面试官信息不正确');return {id:m.id,name:m.name,role:'admin',...(m.archived!==undefined?{archived:m.archived}:{})};});
 const candidates=p.candidates.map(c=>{assert(c&&str(c.id),'候选人信息不正确');const fields=candidateFields(c,{allowIncomplete:true});if(c.profileVersion!==undefined)assert(Number.isInteger(c.profileVersion)&&c.profileVersion>=0,'候选人资料版本不正确');if(c.profileUpdatedAt!==undefined)assert(str(c.profileUpdatedAt)&&Number.isFinite(Date.parse(c.profileUpdatedAt)),'候选人更新时间不正确');return {id:c.id,...fields,...(c.profileVersion!==undefined?{profileVersion:c.profileVersion}:{}),...(c.profileUpdatedAt?{profileUpdatedAt:c.profileUpdatedAt}:{}),...(c.reviewerId!==undefined?{reviewerId:c.reviewerId}:{})};});
 for(const c of candidates)if(c.reviewerId!==undefined)assert(str(c.reviewerId)&&members.some(m=>m.id===c.reviewerId),'候选人负责面试官不存在');
 assert(new Set(members.map(m=>m.id)).size===members.length,'面试官编号重复');assert(new Set(candidates.map(c=>c.id)).size===candidates.length&&new Set(candidates.map(c=>c.studentId)).size===candidates.length,'候选人编号或学号重复');
 const evaluations=p.evaluations.map(e=>{const c=candidates.find(c=>c.id===e?.candidateId);assert(c&&members.some(m=>m.id===e.userId),'评分对应的候选人或面试官不存在');assert(e.scores&&typeof e.scores==='object'&&!Array.isArray(e.scores)&&Array.isArray(e.asked)&&e.asked.length<=5200&&typeof e.notes==='string'&&e.notes.length<=4000&&['draft','submitted'].includes(e.status)&&['','yes','no'].includes(e.availability)&&Number.isInteger(e.version)&&e.version>0&&str(e.updatedAt)&&Number.isFinite(Date.parse(e.updatedAt)),'评分记录格式不正确');assert(e.timingLocked===undefined||typeof e.timingLocked==='boolean','面试计时状态不正确');const timing=validateTiming(e.timing,e.status);if(e.timingLocked&&timing?.startedAt!=null)throw Error('已结束的面试不能继续计时');const customQuestions=validateQuestionList(e.customQuestions||[],fullBank);const errs=validateEvaluation({...e,customQuestions},c,fullBank,e.status==='submitted');assert(!errs.length,`${c.name}：${errs.join('；')}`);return {id:e.userId+':'+e.candidateId,userId:e.userId,candidateId:e.candidateId,scores:e.scores,timingLocked:timingIsLocked(e),...(timing?{timing}:{}),...(e.retained?{retained:e.retained}:{}),responses:{...(e.responses||{})},customQuestions,asked:[...new Set(e.asked)],notes:e.notes,availability:e.availability,status:e.status,version:e.version,updatedAt:e.updatedAt};});
 assert(new Set(evaluations.map(e=>e.id)).size===evaluations.length,'同一面试官对同一候选人的评分重复');return {members,candidates,evaluations,questions,interviewName:p.interviewName?.trim(),interviewInstructions};
}
const signature=e=>JSON.stringify({timingLocked:timingIsLocked(e),timing:validateTiming(e.timing),scores:Object.entries(e.scores).sort(),retained:{scores:Object.entries(e.retained?.scores||{}).sort(),asked:[...(e.retained?.asked||[])].sort(),responses:Object.entries(e.retained?.responses||{}).sort()},responses:Object.entries(e.responses||{}).sort(),asked:[...e.asked].sort(),notes:e.notes,availability:e.availability,status:e.status,customQuestions:(e.customQuestions||[]).map(q=>[q.id,questionSignature(q)]).sort()});
export function mergePackage(current,p,bank){const input=validatePackage(p,bank),out=structuredClone(current),ids=new Map();let added=0,updated=0,skipped=0,questionsAdded=0,instructionsKept=false;out.questions=out.questions||[];
 if(input.interviewName&&!out.candidates.length&&!out.evaluations.length&&(!out.interviewName||out.interviewName===DEFAULT_INTERVIEW_NAME))out.interviewName=input.interviewName;
 if(input.interviewInstructions){const incoming=input.interviewInstructions,old=out.interviewInstructions,sameInterview=!input.interviewName||input.interviewName===(out.interviewName||DEFAULT_INTERVIEW_NAME);if(sameInterview&&(!old||incoming.version>old.version))out.interviewInstructions=incoming;else if(!sameInterview||(old&&incoming.version===old.version&&(incoming.activity!==old.activity||incoming.notice!==old.notice)))instructionsKept=true;}
 for(const q of input.questions){const old=out.questions.find(v=>v.id===q.id);if(old){assert(questionSignature(old)===questionSignature(q),'同编号题目内容冲突，未导入：'+q.text.slice(0,30));}else{out.questions.push(q);questionsAdded++;}}
 for(const m of input.members){const old=out.members.find(v=>v.id===m.id);if(old){assert(old.name===m.name,`面试官姓名冲突：${old.name} / ${m.name}，请确认来自同一人。`);}else out.members.push(m);}
 for(const c of input.candidates){
  const byId=out.candidates.find(v=>v.id===c.id),byStudent=out.candidates.find(v=>v.studentId===c.studentId);
  assert(!(byId&&byStudent&&byId.id!==byStudent.id),`学号 ${c.studentId} 已被另一位候选人使用，未导入`);
  const old=byId||byStudent;
  if(old){
   if(profileVersion(c)===profileVersion(old))assert(sameProfile(old,c),`学号 ${c.studentId} 的资料不一致且版本相同，请先统一名单。`);
   const previous=reviewerState(out,old.id),incoming=reviewerState(input,c.id);
   assert(!(previous.ownerId&&incoming.ownerId&&previous.ownerId!==incoming.ownerId)&&!(previous.ownerId&&incoming.conflict),`学号 ${c.studentId} 已由 ${out.members.find(m=>m.id===previous.ownerId)?.name||'另一位面试官'} 负责，不能合并其他面试官的评分；请统一负责面试官。`);
   if(profileVersion(c)>profileVersion(old)&&!(needsCandidateProfile(c)&&!needsCandidateProfile(old))){const next={...old,...Object.fromEntries(profileFields.map(k=>[k,c[k]])),profileVersion:c.profileVersion,profileUpdatedAt:c.profileUpdatedAt};out.evaluations=out.evaluations.map(e=>e.candidateId===old.id?reclassifyEvaluation(e,old,next,[...bank,...out.questions]):e);Object.assign(old,next);}
   if(incoming.ownerId&&(!previous.conflict||c.reviewerId))old.reviewerId=incoming.ownerId;ids.set(c.id,old.id);
  }else{out.candidates.push(c);ids.set(c.id,c.id);}
 }
 for(const item of input.evaluations){const candidateId=ids.get(item.candidateId),adjusted=reclassifyEvaluation(item,input.candidates.find(c=>c.id===item.candidateId),out.candidates.find(c=>c.id===candidateId),[...bank,...out.questions]),e={...adjusted,candidateId,id:item.userId+':'+candidateId};const i=out.evaluations.findIndex(v=>v.userId===e.userId&&v.candidateId===candidateId);if(i<0){out.evaluations.push(e);added++;}else{const old=out.evaluations[i];if(e.version<old.version){skipped++;continue;}if(e.version===old.version){assert(signature(e)===signature(old),`同版本评分冲突（${input.members.find(m=>m.id===e.userId).name} / ${out.candidates.find(c=>c.id===candidateId).name}），未导入，请核对两个文件。`);skipped++;continue;}out.evaluations[i]=e;updated++;}}
 return {data:out,added,updated,skipped,questionsAdded,instructionsKept};
}
