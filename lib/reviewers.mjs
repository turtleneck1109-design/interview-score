export function reviewerState(data,candidateId){
 const candidate=data.candidates.find(c=>c.id===candidateId);
 const ids=[...new Set(data.evaluations.filter(e=>e.candidateId===candidateId).map(e=>e.userId))];
 return {ownerId:candidate?.reviewerId||(ids.length===1?ids[0]:''),conflict:!candidate?.reviewerId&&ids.length>1,reviewerIds:ids};
}
export function activeEvaluations(data){return data.evaluations.filter(e=>reviewerState(data,e.candidateId).ownerId===e.userId);}
export function availableMembers(data){return data.members.filter(m=>!m.archived);}
export function removeMember(data,userId){
 const member=data.members.find(m=>m.id===userId&&!m.archived);
 if(!member)throw Error('该面试官已不存在或已移除');
 const remaining=availableMembers(data).filter(m=>m.id!==userId);
 if(!remaining.length)throw Error('至少保留一位面试官，请先添加其他面试官');
 const members=data.members.map(m=>m.id===userId?{...m,archived:true}:m);
 const activeId=remaining.some(m=>m.id===(data.me?.id||data.activeId))?(data.me?.id||data.activeId):remaining[0].id;
 return {...data,members,activeId,me:members.find(m=>m.id===activeId)};
}
export function restoreMember(data,userId){
 if(!data.members.some(m=>m.id===userId&&m.archived))throw Error('该面试官无需恢复');
 return {...data,members:data.members.map(m=>m.id===userId?{...m,archived:false}:m)};
}
export function chooseReviewer(data,candidateId,userId){
 const state=reviewerState(data,candidateId);
 if(!data.candidates.some(c=>c.id===candidateId)||!data.members.some(m=>m.id===userId)||!state.reviewerIds.includes(userId))throw Error('请选择已有评分记录对应的面试官');
 return {...data,candidates:data.candidates.map(c=>c.id===candidateId?{...c,reviewerId:userId}:c)};
}
