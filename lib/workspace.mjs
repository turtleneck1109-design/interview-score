import {validateEvaluation} from './scoring.mjs';
import {reviewerState} from './reviewers.mjs';
import {needsCandidateProfile} from './candidates.mjs';
import {interviewChanged,startTiming,stopTiming,validateTiming,timingIsLocked} from './timing.mjs';
export const DEFAULT_INTERVIEW_NAME='2026 上海马拉松';
export function validInterviewName(name){return typeof name==='string'&&name.trim().length>0&&name.length<=80;}
export function fileLabel(name){return String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').trim().slice(0,150)||'面试评分';}
export function responsePatch(draft,questionId,text){const responses={...(draft.responses||{})};if(text)responses[questionId]=text;else delete responses[questionId];return {responses,asked:text.trim()&&!draft.asked.includes(questionId)?[...draft.asked,questionId]:draft.asked};}
export function removeQuestionPatch(draft,questionId){const responses={...(draft.responses||{})};delete responses[questionId];const retained=draft.retained?{...draft.retained,responses:Object.fromEntries(Object.entries(draft.retained.responses||{}).filter(([id])=>id!==questionId)),asked:(draft.retained.asked||[]).filter(id=>id!==questionId)}:undefined;return {responses,...(retained?{retained}:{}),customQuestions:(draft.customQuestions||[]).filter(q=>q.id!==questionId),asked:draft.asked.filter(id=>id!==questionId)};}
export function prepareEvaluation(data,draft,candidateId,userId,bank,submit=false,now=Date.now()){
 const candidate=data.candidates.find(c=>c.id===candidateId);if(!candidate||!data.members.some(m=>m.id===userId&&!m.archived))throw Error('请先选择候选人和可用面试官');
 if(needsCandidateProfile(candidate))throw Error('请先补充候选人的参与经历和志愿者类型');
 const owner=reviewerState(data,candidateId);
 if(owner.conflict)throw Error('此候选人有多位面试官的历史评分，请先选择采用哪位面试官的记录');
 if(owner.ownerId&&owner.ownerId!==userId)throw Error('此候选人已由'+(data.members.find(m=>m.id===owner.ownerId)?.name||'其他面试官')+'负责，请切换到该面试官');
 const old=data.evaluations.find(e=>e.userId===userId&&e.candidateId===candidateId);
 if((old?.version||0)!==draft.version)throw Error('评分已更新，请备份当前修改并重新读取');
 const locked=timingIsLocked(old)||timingIsLocked(draft);
 const previous=validateTiming(timingIsLocked(old)?old.timing:draft.timing??old?.timing);
 const timing=locked?previous:submit?stopTiming(previous,now):interviewChanged(old,draft)?startTiming(previous,now):previous;
 const evaluation={...draft,timing,timingLocked:locked||submit,status:submit?'submitted':'draft'};const errors=validateEvaluation(evaluation,candidate,bank,submit);if(errors.length)throw Error(errors.join('；'));
 const saved={...evaluation,id:userId+':'+candidateId,userId,candidateId,version:draft.version+1,updatedAt:new Date(now).toISOString()};
 return {saved,data:{...data,candidates:data.candidates.map(c=>c.id===candidateId?{...c,reviewerId:userId}:c),evaluations:[...data.evaluations.filter(e=>!(e.userId===userId&&e.candidateId===candidateId)),saved]}};
}
