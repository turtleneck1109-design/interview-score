import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {empty,view,pack,completeBankPack,mergePackage,readLocal,writeLocal,KEY} from './lib/offline.mjs';
import {enrich} from './lib/scoring.mjs';
import {prepareEvaluation,responsePatch,removeQuestionPatch} from './lib/workspace.mjs';
import {prepareInstructions} from './lib/instructions.mjs';
import {durationMs,formatDuration,interviewChanged,startTiming,stopTiming} from './lib/timing.mjs';
import {surveyResponses,questionResponses} from './lib/questions.mjs';
import {prepareCandidate,removeCandidate} from './lib/candidates.mjs';
import {reviewerState,activeEvaluations,chooseReviewer,availableMembers,removeMember,restoreMember} from './lib/reviewers.mjs';
test('first scoring edit starts the timer, autosave keeps its start, and submission freezes the duration',()=>{
 const ds=fixture();ds.evaluations=[];
 const initial={scores:{feeling:2},asked:[],responses:{},customQuestions:[],notes:'',availability:'',status:'draft',version:0};
 const first=prepareEvaluation(ds,initial,'c','a',bank,false,1000);
 assert.deepEqual(first.saved.timing,{elapsedMs:0,startedAt:1000});
 const completed=prepareEvaluation(first.data,{...first.saved,scores:fixture().evaluations[0].scores,availability:'yes'},'c','a',bank,false,5000);
 assert.deepEqual(completed.saved.timing,first.saved.timing);assert.equal(durationMs(completed.saved.timing,5000),4000);
 const submitted=prepareEvaluation(completed.data,completed.saved,'c','a',bank,true,9000);
 assert.equal(submitted.saved.status,'submitted');assert.deepEqual(submitted.saved.timing,{elapsedMs:8000,startedAt:null});assert.equal(durationMs(submitted.saved.timing,60000),8000);
 assert.equal(completed.saved.timing.startedAt,1000);
 const repeated=prepareEvaluation(submitted.data,submitted.saved,'c','a',bank,true,10000);assert.deepEqual(repeated.saved.timing,submitted.saved.timing);
 const revised=prepareEvaluation(repeated.data,{...repeated.saved,notes:'补充说明'},'c','a',bank,false,20000);
 assert.equal(revised.saved.status,'draft');assert.deepEqual(revised.saved.timing,{elapsedMs:8000,startedAt:20000});
 assert.deepEqual(prepareEvaluation(revised.data,revised.saved,'c','a',bank,true,23000).saved.timing,{elapsedMs:11000,startedAt:null});
});
test('failed submission and a failed storage commit do not stop or mutate the current timer',()=>{
 const ds=fixture();ds.evaluations=[];
 const initial={scores:{feeling:2},asked:[],notes:'',availability:'',status:'draft',version:0};
 const running=prepareEvaluation(ds,initial,'c','a',bank,false,1000),before=structuredClone(running);
 assert.throws(()=>prepareEvaluation(running.data,running.saved,'c','a',bank,true,6000));assert.deepEqual(running,before);assert.equal(durationMs(running.saved.timing,6000),5000);
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const stored=writeLocal(running.data),ready=prepareEvaluation(stored,{...running.saved,scores:fixture().evaluations[0].scores,availability:'yes'},'c','a',bank,false,7000);
 const saved=writeLocal(ready.data,stored.revision),submitted=prepareEvaluation(saved,ready.saved,'c','a',bank,true,9000);
 writeLocal(saved,saved.revision);assert.throws(()=>writeLocal(submitted.data,saved.revision),/另一个页面/);
 assert.equal(readLocal().evaluations[0].timing.startedAt,1000);assert.equal(ready.saved.timing.startedAt,1000);
});
test('only substantive interview changes trigger timing and identical values or metadata do not',()=>{
 const original=fixture().evaluations[0];
 assert.equal(interviewChanged(original,{...original,status:'draft',version:2,updatedAt:'new',timing:startTiming(undefined,1000)}),false);
 assert.equal(interviewChanged(original,{...original,scores:Object.fromEntries(Object.entries(original.scores).reverse()),asked:[...original.asked].reverse(),responses:{},customQuestions:[]}),false);
 assert.equal(interviewChanged(undefined,{scores:{},asked:[],notes:'',availability:'',status:'draft'}),false);
 for(const patch of [{scores:{...original.scores,feeling:2.5}},{responses:{q01:'回答'}},{asked:[]},{notes:'备注'},{availability:'no'},{customQuestions:[{id:'custom-time',category:'intro',group:'all',text:'自拟问题',answer:''}]}])assert.equal(interviewChanged(original,{...original,...patch}),true);
});
test('candidate timers remain independent across switching, storage reload and backup import',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 let ds=fixture();ds.evaluations=[];ds.candidates.push({...candidate('second'),studentId:'000456'});ds=writeLocal(ds);
 const initial={scores:{feeling:2},asked:[],notes:'',availability:'',status:'draft',version:0};
 const first=prepareEvaluation(ds,initial,'c','a',bank,false,1000);ds=writeLocal(first.data,ds.revision);
 const second=prepareEvaluation(ds,initial,'second','a',bank,false,5000);writeLocal(second.data,ds.revision);
 const restored=view(readLocal());assert.equal(durationMs(restored.evaluations.find(e=>e.candidateId==='c').timing,7000),6000);assert.equal(durationMs(restored.evaluations.find(e=>e.candidateId==='second').timing,7000),2000);
 for(const type of ['all','own']){const copied=mergePackage(empty(),pack(restored,type),bank).data;assert.deepEqual(copied.evaluations.map(e=>e.timing),restored.evaluations.map(e=>e.timing));}
});
test('completed durations survive backups and conflicting or malformed timing is rejected',()=>{
 const ds=fixture();ds.evaluations[0].timing={elapsedMs:65000,startedAt:null};
 const copied=mergePackage(empty(),pack(ds),bank).data;assert.deepEqual(copied.evaluations[0].timing,ds.evaluations[0].timing);assert.equal(mergePackage(copied,pack(ds),bank).skipped,1);
 const conflict=structuredClone(pack(ds));conflict.evaluations[0].timing.elapsedMs++;assert.throws(()=>mergePackage(ds,conflict,bank),/同版本评分冲突/);
 for(const timing of [null,[],{}, {elapsedMs:-1,startedAt:null},{elapsedMs:1.5,startedAt:null},{elapsedMs:0,startedAt:'1000'},{elapsedMs:0,startedAt:1000},{elapsedMs:0,startedAt:Infinity}]){const packet=structuredClone(pack(ds));packet.evaluations[0].timing=timing;assert.throws(()=>mergePackage(ds,packet,bank),/面试用时格式/);}
 assert.deepEqual(ds.evaluations[0].timing,{elapsedMs:65000,startedAt:null});
});
test('legacy records have no invented duration and start timing only when edited',()=>{
 const ds=fixture(),copy=mergePackage(empty(),pack(ds),bank).data;
 assert.equal(copy.evaluations[0].timing,undefined);
 assert.equal(prepareEvaluation(ds,ds.evaluations[0],'c','a',bank,true,1000).saved.timing,undefined);
 const revised=prepareEvaluation(ds,{...ds.evaluations[0],notes:'本次修改'},'c','a',bank,false,2000);assert.deepEqual(revised.saved.timing,{elapsedMs:0,startedAt:2000});
});
test('duration display supports hours and does not count backwards after a clock correction',()=>{
 assert.equal(formatDuration(undefined,0),'00:00');assert.equal(formatDuration({elapsedMs:65000,startedAt:null}),'01:05');assert.equal(formatDuration({elapsedMs:3661000,startedAt:null}),'01:01:01');
 const timing={elapsedMs:3000,startedAt:5000};assert.equal(durationMs(timing,4000),3000);assert.deepEqual(stopTiming(timing,6000),{elapsedMs:4000,startedAt:null});assert.deepEqual(startTiming(timing,6000),timing);
});
test('custom arrangements and notices persist without changing candidates or submitted scores',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const source=writeLocal(fixture()),before=structuredClone(source);const next=writeLocal(prepareInstructions(source,{activity:'周六上午集合\n地点：校园广场',notice:'结果通过邮件通知'}),source.revision);
 assert.equal(readLocal().interviewInstructions.activity,'周六上午集合\n地点：校园广场');assert.equal(next.interviewInstructions.notice,'结果通过邮件通知');assert.equal(next.interviewInstructions.version,1);assert.deepEqual(next.candidates,before.candidates);assert.deepEqual(next.evaluations,before.evaluations);assert.deepEqual(source,before);
 const cleared=writeLocal(prepareInstructions(next,{activity:'',notice:''}),next.revision);assert.equal(cleared.interviewInstructions.version,2);assert.equal(view(readLocal()).interviewInstructions.notice,'');
});
test('rosters and full backups preserve instructions while personal scores and question banks do not override them',()=>{
 const configured=prepareInstructions(fixture(),{activity:'自备设备',notice:'短信通知'});
 for(const type of ['all','roster']){const restored=mergePackage(empty(),pack(configured,type),bank).data;assert.deepEqual(restored.interviewInstructions,configured.interviewInstructions);}
 for(const type of ['own','bank'])assert.equal(pack(configured,type).interviewInstructions,undefined);
 assert.equal(completeBankPack(configured,bank).interviewInstructions,undefined);
 const original=pack(fixture());assert.equal(mergePackage(empty(),original,bank).data.interviewInstructions,undefined);assert.deepEqual(mergePackage(configured,original,bank).data.interviewInstructions,configured.interviewInstructions);
 const cleared=prepareInstructions(configured,{activity:'',notice:''});const restored=mergePackage(configured,pack(cleared,'roster'),bank).data;assert.equal(restored.interviewInstructions.activity,'');assert.equal(mergePackage(restored,pack(configured,'roster'),bank).data.interviewInstructions.activity,'');
});
test('instruction imports keep local settings on conflicting versions or different interview names',()=>{
 const original=prepareInstructions(fixture(),{activity:'当前安排',notice:'当前通知'}),conflict=prepareInstructions(fixture(),{activity:'另一份安排',notice:'另一份通知'});const merged=mergePackage(original,pack(conflict,'roster'),bank);assert.equal(merged.instructionsKept,true);assert.deepEqual(merged.data.interviewInstructions,original.interviewInstructions);
 const different=prepareInstructions({...original,interviewName:'另一场面试'},{activity:'另一场活动',notice:'新的渠道'});const result=mergePackage(original,pack(different,'roster'),bank);assert.equal(result.instructionsKept,true);assert.deepEqual(result.data.interviewInstructions,original.interviewInstructions);
 const fresh=mergePackage(empty(),pack(different,'roster'),bank).data;assert.equal(fresh.interviewName,'另一场面试');assert.deepEqual(fresh.interviewInstructions,different.interviewInstructions);
});
test('invalid instructions cannot be saved or imported and leave existing data intact',()=>{
 const original=fixture(),before=structuredClone(original);assert.throws(()=>prepareInstructions(original,{activity:'字'.repeat(4001),notice:''}),/4000/);assert.deepEqual(original,before);
 const packet=pack(prepareInstructions(original,{activity:'集合说明',notice:''}));for(const invalid of [{...packet.interviewInstructions,notice:1},{...packet.interviewInstructions,version:0},{...packet.interviewInstructions,updatedAt:'bad'},{...packet.interviewInstructions,activity:'字'.repeat(4001)}]){assert.throws(()=>mergePackage(original,{...packet,interviewInstructions:invalid},bank),/格式不正确/);assert.deepEqual(original,before);}
});
test('removing the current interviewer preserves scores, ownership and answers and selects an available interviewer',()=>{
 const ds=fixture();ds.members.push({id:'b',name:'面试官b'});ds.candidates[0].reviewerId='a';ds.evaluations[0].responses={q01:'保留回答'};const before=structuredClone(ds),scores=enrich(activeEvaluations(ds),ds.candidates);
 const removed=removeMember(ds,'a');assert.equal(removed.me.id,'b');assert.equal(removed.activeId,'b');assert.deepEqual(availableMembers(removed).map(m=>m.id),['b']);assert.deepEqual(removed.candidates,ds.candidates);assert.deepEqual(removed.evaluations,ds.evaluations);assert.deepEqual(enrich(activeEvaluations(removed),removed.candidates),scores);assert.deepEqual(ds,before);
 assert.throws(()=>prepareEvaluation(removed,removed.evaluations[0],'c','a',bank),/可用面试官/);
 const restored=restoreMember(removed,'a');assert.equal(availableMembers(restored).length,2);assert.equal(restored.me.id,'b');assert.equal(prepareEvaluation(restored,restored.evaluations[0],'c','a',bank).saved.userId,'a');
});
test('removing other interviewers keeps the active selection and protects the last available interviewer',()=>{
 const ds=fixture();ds.members.push({id:'b',name:'面试官b'},{id:'old',name:'已移除',archived:true});const removed=removeMember(ds,'b');assert.equal(removed.me.id,'a');assert.throws(()=>removeMember(removed,'a'),/至少保留/);assert.throws(()=>removeMember(removed,'b'),/已移除/);assert.throws(()=>restoreMember(removed,'a'),/无需恢复/);assert.equal(view({...removed,activeId:'b'}).me.id,'a');
});
test('removed interviewers survive backup import and old packages do not reactivate locally removed people',()=>{
 const ds=fixture();ds.members.push({id:'b',name:'面试官b'});ds.evaluations[0].responses={q01:'备份保留回答'};ds.evaluations[0].customQuestions=[];const removed=removeMember(ds,'a'),backup=pack(removed);
 const copy=mergePackage(empty(),backup,bank).data;assert.equal(copy.members.find(m=>m.id==='a').archived,true);assert.deepEqual(copy.evaluations,removed.evaluations);assert.equal(enrich(activeEvaluations(copy),copy.candidates)[0].base,10);
 assert.equal(mergePackage(removed,pack(ds),bank).data.members.find(m=>m.id==='a').archived,true);
 const restored=restoreMember(removed,'a');assert.equal(mergePackage(restored,backup,bank).data.members.find(m=>m.id==='a').archived,false);
 backup.members[0].archived='yes';assert.throws(()=>mergePackage(empty(),backup,bank),/面试官信息/);
});
test('interviewer removal and recovery persist through browser storage',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};const ds=fixture();ds.members.push({id:'b',name:'面试官b'});
 const initial=writeLocal(ds),removed=writeLocal(removeMember(initial,'a'),initial.revision);assert.equal(view(readLocal()).me.id,'b');assert.equal(availableMembers(readLocal()).length,1);assert.equal(readLocal().evaluations.length,1);
 writeLocal(restoreMember(removed,'a'),removed.revision);assert.equal(availableMembers(readLocal()).length,2);
});
test('deleting a candidate removes every related evaluation while preserving other candidates and the question bank',()=>{
 const ds=fixture(),other=fixture('b','other');other.candidates[0].studentId='000456';
 ds.candidates.push(...other.candidates);ds.members.push(...other.members);ds.evaluations.push(...other.evaluations,{...ds.evaluations[0],id:'b:c',userId:'b',responses:{q01:'历史回答'}});
 ds.questions=[{id:'custom-keep',category:'survey',group:'all',text:'题库保留题',answer:''}];const before=structuredClone(ds);
 const result=removeCandidate(ds,'c');assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].id,'other');assert.equal(result.evaluations.length,1);assert.equal(result.evaluations[0].candidateId,'other');assert.deepEqual(result.questions,ds.questions);assert.deepEqual(result.members,ds.members);assert.deepEqual(ds,before);
 const restored=mergePackage(empty(),pack(result),bank).data;assert.equal(restored.candidates.length,1);assert.equal(restored.evaluations.length,1);assert.throws(()=>removeCandidate(result,'missing'),/已不存在/);
});
test('deleting the last candidate persists an empty roster and excludes the removed score from results',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const saved=writeLocal(fixture()),removed=writeLocal(removeCandidate(saved,'c'),saved.revision);
 assert.equal(readLocal().candidates.length,0);assert.equal(readLocal().evaluations.length,0);assert.deepEqual(enrich(activeEvaluations(removed),removed.candidates),[]);assert.equal(removed.members.length,1);
});
test('editing candidate profile keeps the stable identity, reviewer and saved scores',()=>{
 const ds=fixture();ds.candidates[0].reviewerId='a';const before=structuredClone(ds.evaluations);
 const result=prepareCandidate(ds,{...ds.candidates[0],name:'修改后的姓名',studentId:'000999',campus:'徐汇',candidateNotes:'报名备注\n需跟进时间'},'c',bank);
 assert.equal(result.candidate.id,'c');assert.equal(result.candidate.reviewerId,'a');assert.equal(result.candidate.profileVersion,1);assert.deepEqual(result.data.evaluations,before);assert.equal(result.classificationChanged,false);
 const original=structuredClone(ds);const merged=mergePackage(original,pack(result.data),bank).data;assert.equal(merged.candidates.length,1);assert.equal(merged.candidates[0].studentId,'000999');assert.equal(merged.candidates[0].candidateNotes,'报名备注\n需跟进时间');assert.equal(merged.evaluations.length,1);
 const older=mergePackage(merged,pack(ds),bank).data;assert.equal(older.candidates[0].studentId,'000999');assert.equal(older.candidates[0].name,'修改后的姓名');assert.equal(ds.candidates[0].studentId,'000123');
});
test('candidate creation and editing validate duplicate student IDs and optional notes',()=>{
 const ds=fixture();const added=prepareCandidate(ds,{...candidate('new'),studentId:'000456',candidateNotes:'添加时的备注'},'new',bank).data;
 assert.equal(added.candidates[1].candidateNotes,'添加时的备注');assert.throws(()=>prepareCandidate(added,{...added.candidates[1],studentId:'000123'},'new',bank),/学号已存在/);
 assert.throws(()=>prepareCandidate(ds,{...ds.candidates[0],name:'  '},'c',bank),/姓名/);assert.throws(()=>prepareCandidate(ds,{...ds.candidates[0],candidateNotes:'字'.repeat(4001)},'c',bank),/备注/);
 const restored=mergePackage(empty(),pack(added,'roster'),bank).data;assert.equal(restored.candidates.find(c=>c.id==='new').candidateNotes,'添加时的备注');
});
test('changing type preserves inactive scores and answers, requires review, and restores them when changed back',()=>{
 const ds=fixture(),c=ds.candidates[0],e=ds.evaluations[0],q=bank.find(q=>q.category==='photography');c.special='photo';e.scores.photography=7;e.responses={[q.id]:'曾拍摄校园活动'};e.asked.push(q.id);
 const switched=prepareCandidate(ds,{...c,special:'none'},'c',bank);const next=switched.data.evaluations[0];assert.equal(switched.classificationChanged,true);assert.equal(next.status,'draft');assert.equal(next.availability,'');assert.equal(next.scores.photography,undefined);assert.equal(next.retained.scores.photography,7);assert.equal(next.retained.responses[q.id],'曾拍摄校园活动');assert.ok(next.retained.asked.includes(q.id));
 const restored=mergePackage(empty(),pack(switched.data),bank).data;assert.deepEqual(restored.evaluations[0].retained,next.retained);
 const back=prepareCandidate(restored,{...restored.candidates[0],special:'photo'},'c',bank).data.evaluations[0];assert.equal(back.scores.photography,7);assert.equal(back.responses[q.id],'曾拍摄校园活动');assert.ok(back.asked.includes(q.id));assert.deepEqual(back.retained.scores,{});assert.equal(back.status,'draft');
 const propagated=mergePackage(ds,pack(switched.data),bank).data;assert.equal(propagated.candidates[0].special,'none');assert.equal(propagated.evaluations.length,1);assert.equal(propagated.evaluations[0].retained.scores.photography,7);
});
test('all question categories accept answers and preserve them through export, including custom questions',()=>{
 for(const special of ['none','lightning','photo']){const ds=fixture(),c=ds.candidates[0],e=ds.evaluations[0];c.special=special;e.status='draft';e.customQuestions=[{id:'custom-impression',category:'impression',group:'all',text:'补充印象问题',answer:''}];const applicable=[...bank,...e.customQuestions].filter(q=>['all',c.experience,c.special].includes(q.group));e.responses=Object.fromEntries(applicable.map(q=>[q.id,'面试者的回答：'+q.category+'\n补充细节']));
 const roundTrip=mergePackage(empty(),pack(ds),bank).data.evaluations[0];assert.deepEqual(roundTrip.responses,e.responses);assert.equal(questionResponses(bank,roundTrip).length,applicable.length);assert.equal(questionResponses(bank,roundTrip).find(q=>q.id==='custom-impression').category,'impression');}
});
test('first edit claims a candidate and a second interviewer cannot create a draft or submit',()=>{
 const ds=fixture();ds.evaluations=[];ds.members.push({id:'b',name:'面试官b'});const draft={scores:{feeling:2},asked:[],responses:{},customQuestions:[],notes:'',availability:'',status:'draft',version:0};
 const first=prepareEvaluation(ds,draft,'c','a',bank);assert.equal(first.data.candidates[0].reviewerId,'a');
 assert.throws(()=>prepareEvaluation(first.data,draft,'c','b',bank),/已由面试官a负责/);
 assert.throws(()=>prepareEvaluation(first.data,draft,'c','b',bank,true),/已由面试官a负责/);
 const continued=prepareEvaluation(first.data,{...first.saved,notes:'继续记录'},'c','a',bank);assert.equal(continued.data.evaluations.length,1);assert.equal(continued.saved.notes,'继续记录');
});
test('cross-device scoring by another reviewer rejects without changing existing data',()=>{
 const current=fixture(),before=JSON.stringify(current),other=fixture('b','other-device');
 assert.throws(()=>mergePackage(current,pack(other),bank),/不能合并其他面试官/);assert.equal(JSON.stringify(current),before);
 const roster=pack(current,'roster');const ds=mergePackage(empty(),roster,bank).data;
 assert.equal(reviewerState(ds,'c').ownerId,'a');assert.throws(()=>prepareEvaluation(view(ds),{scores:{},asked:[],version:0},'c',ds.activeId,bank),/已由/);
});
test('legacy multiple-reviewer records remain preserved and are excluded until a reviewer is chosen',()=>{
 const a=fixture(),b=fixture('b');const legacy={app:'shangma-score-offline',formatVersion:2,members:[...a.members,...b.members],candidates:a.candidates,evaluations:[...a.evaluations,...b.evaluations],questions:[]};
 const restored=mergePackage(empty(),legacy,bank).data;assert.equal(reviewerState(restored,'c').conflict,true);assert.equal(activeEvaluations(restored).length,0);
 assert.throws(()=>prepareEvaluation(restored,a.evaluations[0],'c','a',bank),/多位面试官/);
 const chosen=chooseReviewer(restored,'c','a');assert.equal(chosen.evaluations.length,2);assert.equal(activeEvaluations(chosen).length,1);assert.equal(activeEvaluations(chosen)[0].userId,'a');
 const roundTrip=mergePackage(empty(),pack(chosen),bank).data;assert.equal(roundTrip.evaluations.length,2);assert.equal(activeEvaluations(roundTrip)[0].userId,'a');
 const reversed=chooseReviewer(roundTrip,'c','b');assert.equal(activeEvaluations(reversed)[0].userId,'b');assert.equal(reversed.evaluations.length,2);
});
test('whole-bank export includes all built-ins and custom questions and can be re-imported without duplicates',()=>{
 const ds=fixture();ds.questions=[{id:'custom-complete',category:'survey',group:'all',text:'新增调查题',answer:''}];const p=completeBankPack(ds,bank);
 assert.equal(p.questions.length,49);assert.equal(p.members.length,0);assert.equal(p.candidates.length,0);assert.equal(p.evaluations.length,0);
 const imported=mergePackage(empty(),p,bank);assert.equal(imported.questionsAdded,1);assert.equal(imported.data.questions.length,1);assert.equal(mergePackage(imported.data,p,bank).questionsAdded,0);
 const bad=structuredClone(p);bad.questions[0].text='改动内置题';assert.throws(()=>mergePackage(empty(),bad,bank),/新的 custom-/);
 bad.questions[0].id='custom-revised-builtin';assert.equal(mergePackage(empty(),bad,bank).questionsAdded,2);
});
test('downloadable template is compatible with the same importer used in the website',()=>{
 const template=JSON.parse(readFileSync(new URL('./lib/bank-template.json',import.meta.url)));const result=mergePackage(empty(),template,bank);assert.equal(result.questionsAdded,3);assert.equal(mergePackage(result.data,template,bank).questionsAdded,0);
});
const bank=JSON.parse(readFileSync(new URL('./lib/questions.json',import.meta.url)));
const candidate=(id)=>({id,name:'测试候选人',studentId:'000123',campus:'闵行',experience:'new',special:'none'});
test('survey responses autosave independently for each interviewer and survive backup/import',()=>{
 const mem=new Map();globalThis.localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
 const q=bank.find(q=>q.category==='survey');let ds=writeLocal(fixture());let draft=ds.evaluations[0];
 for(const text of ['通过同学','通过同学介绍\n也看到了学院通知']){const r=prepareEvaluation(ds,{...draft,...responsePatch(draft,q.id,text)},'c','a',bank);ds=writeLocal(r.data,ds.revision);draft=r.saved;}
 assert.equal(readLocal().evaluations[0].responses[q.id],'通过同学介绍\n也看到了学院通知');assert.equal(draft.asked.filter(id=>id===q.id).length,1);assert.equal(draft.status,'draft');
 const other=fixture('b','c2');other.candidates[0].studentId='000124';other.evaluations[0].responses={[q.id]:'来自公众号'};ds=mergePackage(ds,pack(other),bank).data;
 const restored=mergePackage(empty(),pack(ds),bank).data;
 assert.equal(restored.evaluations.find(e=>e.userId==='a').responses[q.id],'通过同学介绍\n也看到了学院通知');assert.equal(restored.evaluations.find(e=>e.userId==='b').responses[q.id],'来自公众号');
 assert.deepEqual(surveyResponses(bank,restored.evaluations.find(e=>e.userId==='a')),[{id:q.id,question:q.text,response:'通过同学介绍\n也看到了学院通知'}]);
});
test('custom survey answers can be cleared or removed with their question and do not change scores',()=>{
 const ds=fixture(),q={id:'custom-survey',category:'survey',group:'all',text:'希望增加哪项服务？',answer:''};const before=ds.evaluations[0];const draft={...before,customQuestions:[q],responses:{}};
 const withAnswer={...draft,...responsePatch(draft,q.id,'希望提供更多指引')};const saved=prepareEvaluation(ds,withAnswer,'c','a',bank,true);
 assert.equal(enrich(saved.data.evaluations,ds.candidates)[0].base,10);assert.equal(mergePackage(empty(),pack(saved.data),bank).data.evaluations[0].responses[q.id],'希望提供更多指引');
 const cleared={...saved.saved,...responsePatch(saved.saved,q.id,'')};assert.deepEqual(cleared.responses,{});assert.deepEqual(surveyResponses(bank,cleared),[]);
 const removed={...saved.saved,...removeQuestionPatch(saved.saved,q.id)};assert.deepEqual(removed.responses,{});assert.ok(!removed.asked.includes(q.id));assert.equal(prepareEvaluation(saved.data,removed,'c','a',bank).saved.customQuestions.length,0);
});
test('survey response conflicts are rejected and legacy packages without responses remain compatible',()=>{
 const ds=fixture(),q=bank.find(q=>q.category==='survey');ds.evaluations[0].responses={[q.id]:'偏难'};
 const p=structuredClone(pack(ds));p.evaluations[0].responses[q.id]='偏易';assert.throws(()=>mergePackage(ds,p,bank),/同版本评分冲突/);assert.equal(ds.evaluations[0].responses[q.id],'偏难');
 const old=fixture(),restored=mergePackage(empty(),pack(old),bank).data;assert.deepEqual(restored.evaluations[0].responses,{});assert.equal(mergePackage(restored,pack(old),bank).skipped,1);
});
test('invalid response maps, unknown questions, inapplicable question groups, and excessive text are rejected',()=>{
 const q=bank.find(q=>q.category==='survey');
 for(const responses of [null,[],42,{missing:'回答'},{[bank.find(q=>q.category==='thinking').id]:'回答'},{[q.id]:42},{[q.id]:'字'.repeat(4001)}]){const p=structuredClone(pack(fixture()));p.evaluations[0].responses=responses;assert.throws(()=>mergePackage(empty(),p,bank),/回答格式/);}
});
function fixture(user='a',cid='c'){const member={id:user,name:'面试官'+user,role:'admin'};const asked=['feeling','thinking','response','dialogue'].map(cat=>bank.find(q=>q.category===cat&&['all','new'].includes(q.group)).id);return view({revision:0,activeId:user,members:[member],candidates:[candidate(cid)],evaluations:[{id:user+':'+cid,userId:user,candidateId:cid,scores:{feeling:2,thinking:3,response:2,dialogue:2,impression:1},asked,notes:'',availability:'yes',status:'submitted',version:1,updatedAt:'2026-11-17T10:00:00Z'}]});}
test('different interviewers merge their assigned candidates without averaging two reviewers',()=>{const d=fixture(),incoming=fixture('b','separate-device-id');incoming.candidates[0].studentId='000124';const merged=mergePackage(d,pack(incoming),bank);assert.equal(merged.data.candidates.length,2);assert.equal(merged.data.evaluations.length,2);assert.equal(merged.data.evaluations[1].candidateId,'separate-device-id');assert.equal(enrich(activeEvaluations(merged.data),merged.data.candidates).length,2);assert.equal(d.evaluations.length,1);});
test('repeat import is idempotent; greater revision replaces, older revision is ignored',()=>{const d=fixture();assert.equal(mergePackage(d,pack(d),bank).skipped,1);const p=pack(fixture());p.evaluations[0].version=2;p.evaluations[0].scores.feeling=2.5;const merged=mergePackage(d,p,bank);assert.equal(merged.updated,1);assert.equal(merged.data.evaluations.length,1);assert.equal(mergePackage(merged.data,pack(d),bank).skipped,1);});
test('same-version divergent scores reject without modifying source data',()=>{const d=fixture(),p=pack(fixture());p.evaluations[0].notes='conflict';assert.throws(()=>mergePackage(d,p,bank),/同版本/);assert.equal(d.evaluations[0].notes,'');});
test('candidate identity mismatch and out-of-range ratings reject',()=>{const p=pack(fixture('b','x'));p.candidates[0].name='另一人';assert.throws(()=>mergePackage(fixture(),p,bank),/不一致/);const bad=pack(fixture('b'));bad.evaluations[0].scores.feeling=100;assert.throws(()=>mergePackage(fixture(),bad,bank),/上限/);});
test('roster retains reviewer assignments without ratings; own export excludes others',()=>{const other=fixture('b','x');other.candidates[0].studentId='000124';const combined=mergePackage(fixture(),pack(other),bank).data;const own=pack(combined,'own');assert.equal(own.evaluations.length,1);assert.equal(own.members.length,1);assert.equal(own.candidates.length,1);const roster=pack(combined,'roster');assert.equal(roster.evaluations.length,0);assert.equal(roster.members.length,2);assert.equal(mergePackage(empty(),roster,bank).data.candidates.length,2);assert.equal(roster.candidates[0].reviewerId,'a');});
test('browser storage round trip and stale-window conflict',()=>{const mem=new Map();globalThis.localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};const d=readLocal();const saved=writeLocal({...d,candidates:[candidate('c')]},d.revision);assert.equal(readLocal().candidates[0].studentId,'000123');assert.equal(saved.revision,1);assert.throws(()=>writeLocal(d,d.revision),/另一个页面/);assert.ok(mem.has(KEY));});
test('single HTML includes embedded app and blocks network calls',()=>{const html=readFileSync(new URL('./docs/index.html',import.meta.url),'utf8');assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/<script[^>]*\bsrc=|<link[^>]*stylesheet|signin-with-chatgpt|\/api\/data|@import /i);assert.equal(bank.length,48);});

test('ad-hoc questions can replace built-in questions and survive package import',async()=>{const {validateEvaluation}=await import('./lib/scoring.mjs');const d=fixture();const e=d.evaluations[0];e.customQuestions=['feeling','thinking','response','dialogue'].map(category=>({id:'custom-test-'+category,category,group:'all',text:'自拟问题：'+category,answer:'自拟评分要点'}));e.asked=e.customQuestions.map(q=>q.id);assert.deepEqual(validateEvaluation(e,d.candidates[0],bank,true),[]);const result=mergePackage(empty(),pack(d),bank);assert.deepEqual(result.data.evaluations[0].customQuestions,e.customQuestions);assert.equal(result.data.questions.length,0);assert.equal(mergePackage(result.data,pack(d),bank).skipped,1);});
test('custom bank questions are selectable, portable and merged idempotently',async()=>{const {validateEvaluation}=await import('./lib/scoring.mjs');const d=fixture();const q={id:'custom-library-test',category:'feeling',group:'new',text:'新入库的了解题',answer:'评分要点'};d.questions=[q];d.evaluations[0].asked[0]=q.id;assert.deepEqual(validateEvaluation(d.evaluations[0],d.candidates[0],[...bank,q],true),[]);const result=mergePackage(empty(),pack(d),bank);assert.equal(result.questionsAdded,1);assert.equal(mergePackage(result.data,pack(d),bank).questionsAdded,0);const onlyBank=pack(d,'bank');assert.equal(onlyBank.members.length,0);assert.equal(onlyBank.candidates.length,0);assert.equal(onlyBank.evaluations.length,0);assert.equal(mergePackage(empty(),onlyBank,bank).data.questions.length,1);});
test('manual campus values survive transfer; Minhang aliases work',()=>{const d=fixture();d.candidates[0].campus='自定义大学临港校区';assert.equal(mergePackage(empty(),pack(d),bank).data.candidates[0].campus,'自定义大学临港校区');});
test('old version 1 packages remain importable',()=>{const p=pack(fixture());p.formatVersion=1;delete p.questions;p.evaluations.forEach(e=>delete e.customQuestions);assert.equal(mergePackage(empty(),p,bank).added,1);});
test('question content conflicts and edits to ad-hoc questions are never silently ignored',()=>{const d=fixture();d.questions=[{id:'custom-one',category:'thinking',group:'all',text:'题目甲',answer:''}];const p=pack(structuredClone(d));p.questions[0].text='题目乙';assert.throws(()=>mergePackage(d,p,bank),/题目内容冲突/);const a=fixture();a.evaluations[0].customQuestions=[{id:'custom-once',category:'impression',group:'all',text:'自拟甲',answer:''}];const b=pack(structuredClone(a));b.evaluations[0].customQuestions[0].text='自拟乙';assert.throws(()=>mergePackage(a,b,bank),/同版本评分冲突/);});
test('all interview types can submit and transfer scores without selecting questions',async()=>{const {validateEvaluation,totals}=await import('./lib/scoring.mjs');for(const special of ['none','lightning','photo']){const d=fixture(),e=d.evaluations[0],c=d.candidates[0];c.special=special;e.asked=[];e.customQuestions=[];if(special==='lightning')e.scores={...e.scores,work:3,scene1:2,scene2:2};if(special==='photo')e.scores.photography=7;assert.deepEqual(validateEvaluation(e,c,bank,true),[]);const r=mergePackage(empty(),pack(d),bank);assert.equal(r.added,1);assert.deepEqual(r.data.evaluations[0].asked,[]);assert.equal(totals(e,c).base,10);if(special!=='none')assert.equal(totals(e,c).extra,7);}});
test('direct scoring retains missing-score, range, increment and attendance checks',async()=>{const {validateEvaluation}=await import('./lib/scoring.mjs');const d=fixture(),e=d.evaluations[0],c=d.candidates[0];e.asked=[];delete e.scores.feeling;assert.ok(validateEvaluation(e,c,bank,true).includes('请完成全部适用项目的评分'));e.scores.feeling=3.5;assert.ok(validateEvaluation(e,c,bank,true).some(v=>v.includes('上限')));e.scores.feeling=2.2;assert.ok(validateEvaluation(e,c,bank,true).some(v=>v.includes('0.5')));e.scores.feeling=0;assert.deepEqual(validateEvaluation(e,c,bank,true),[]);e.availability='';assert.ok(validateEvaluation(e,c,bank,true).some(v=>v.includes('活动时间')));e.availability='no';assert.ok(validateEvaluation(e,c,bank,true).some(v=>v.includes('具体情况')));e.notes='时间冲突';assert.deepEqual(validateEvaluation(e,c,bank,true),[]);});
test('live ordinary subtotal updates before completion, supports zero and downward edits',async()=>{const {liveTotals,totals}=await import('./lib/scoring.mjs');const c=candidate('live');const e={scores:{}};assert.deepEqual(liveTotals(e,c).base,{sum:0,filled:0,required:5,complete:false});e.scores.feeling=2.5;assert.equal(liveTotals(e,c).base.sum,2.5);assert.equal(liveTotals(e,c).base.filled,1);assert.equal(totals(e,c).base,null);e.scores.thinking=3;assert.equal(liveTotals(e,c).base.sum,5.5);e.scores.feeling=0;assert.equal(liveTotals(e,c).base.sum,3);assert.equal(liveTotals(e,c).base.filled,2);Object.assign(e.scores,{response:2,dialogue:2.5,impression:1});assert.equal(liveTotals(e,c).base.complete,true);assert.equal(liveTotals(e,c).base.sum,totals(e,c).base);});
test('live extra subtotals stay independent of ordinary scoring and draft totals are excluded from results',async()=>{const {liveTotals,totals,enrich}=await import('./lib/scoring.mjs');const c={...candidate('live-extra'),special:'lightning'},e={userId:'u',candidateId:c.id,status:'draft',scores:{work:2,scene1:1.5,feeling:1}};const live=liveTotals(e,c);assert.equal(live.base.sum,1);assert.deepEqual(live.extra,{sum:3.5,filled:2,required:3,complete:false});assert.equal(totals(e,c).extra,null);assert.deepEqual(enrich([e],[c]),[]);e.scores.scene2=0;assert.deepEqual(liveTotals(e,c).extra,{sum:3.5,filled:3,required:3,complete:true});assert.equal(liveTotals({scores:{photography:6.5}},{...c,special:'photo'}).extra.sum,6.5);assert.equal(liveTotals(e,{...c,special:'none'}).extra,null);});
test('automatic draft writes preserve consecutive edits and remain excluded until submission',async()=>{const {prepareEvaluation}=await import('./lib/workspace.mjs');const mem=new Map();globalThis.localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};let ds=view(readLocal());ds=writeLocal({...ds,candidates:[candidate('auto-c')]},ds.revision);let draft={scores:{},asked:[],customQuestions:[],notes:'',availability:'',status:'draft',version:0};for(const patch of [{scores:{feeling:2.5}},{notes:'每次输入都保留'},{scores:{feeling:2.5,thinking:3,response:2,dialogue:2,impression:1}},{availability:'yes'}]){const result=prepareEvaluation(ds,{...draft,...patch},'auto-c',ds.me.id,bank);ds=writeLocal(result.data,ds.revision);draft=result.saved;}assert.equal(readLocal().evaluations[0].notes,'每次输入都保留');assert.equal(draft.version,4);assert.equal(draft.status,'draft');assert.deepEqual(enrich(ds.evaluations,ds.candidates),[]);const submitted=prepareEvaluation(ds,draft,'auto-c',ds.me.id,bank,true);assert.equal(enrich(submitted.data.evaluations,ds.candidates).length,1);const edited=prepareEvaluation(submitted.data,{...submitted.saved,scores:{...submitted.saved.scores,feeling:1}},'auto-c',ds.me.id,bank);assert.equal(edited.saved.status,'draft');assert.equal(edited.saved.scores.feeling,1);assert.equal(edited.saved.notes,'每次输入都保留');});
test('autosaving a new library question and its question record is atomic',async()=>{const {prepareEvaluation}=await import('./lib/workspace.mjs');let ds=fixture();const q={id:'custom-auto',category:'response',group:'all',text:'自动保存测试题',answer:''};ds={...ds,questions:[q]};const e=ds.evaluations[0];const result=prepareEvaluation(ds,{...e,asked:[...e.asked,q.id]},e.candidateId,e.userId,[...bank,q]);const imported=mergePackage(empty(),pack(result.data),bank);assert.equal(imported.data.questions[0].id,q.id);assert.ok(imported.data.evaluations[0].asked.includes(q.id));assert.equal(imported.data.evaluations[0].status,'draft');});
test('auto writes cannot overwrite a newer score version',async()=>{const {prepareEvaluation}=await import('./lib/workspace.mjs');const ds=fixture(),original=ds.evaluations[0];const one=prepareEvaluation(ds,{...original,notes:'新备注'},original.candidateId,original.userId,bank);assert.throws(()=>prepareEvaluation(one.data,{...original,notes:'旧页面备注'},original.candidateId,original.userId,bank),/评分已更新/);assert.equal(one.data.evaluations[0].notes,'新备注');});
test('interview name survives backup and empty-workspace import, with safe filename generation',async()=>{const {DEFAULT_INTERVIEW_NAME,validInterviewName,fileLabel}=await import('./lib/workspace.mjs');const ds={...fixture(),interviewName:'2027 春季志愿者面试'};const p=pack(ds);assert.equal(p.interviewName,ds.interviewName);assert.equal(mergePackage(empty(),p,bank).data.interviewName,ds.interviewName);assert.equal(mergePackage({...fixture(),interviewName:'另一场面试'},p,bank).data.interviewName,'另一场面试');assert.equal(pack(ds,'bank').interviewName,undefined);assert.equal(view(fixture()).interviewName,DEFAULT_INTERVIEW_NAME);assert.equal(validInterviewName('  '),false);assert.equal(validInterviewName('x'.repeat(81)),false);assert.equal(fileLabel('春季/面试: A?'),'春季_面试_ A_');});
