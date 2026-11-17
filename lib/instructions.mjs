export function validateInstructions(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  typeof value.activity!=='string'||value.activity.length>4000||
  typeof value.notice!=='string'||value.notice.length>4000||
  !Number.isSafeInteger(value.version)||value.version<1||
  typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt)))throw Error('活动安排或结果通知格式不正确');
 return {activity:value.activity,notice:value.notice,version:value.version,updatedAt:value.updatedAt};
}
export function prepareInstructions(data,fields){
 const activity=fields.activity??'',notice=fields.notice??'';
 if(typeof activity!=='string'||typeof notice!=='string'||activity.length>4000||notice.length>4000)throw Error('活动安排和结果通知各限 4000 字');
 const interviewInstructions=validateInstructions({activity:activity.trim(),notice:notice.trim(),version:(data.interviewInstructions?.version||0)+1,updatedAt:new Date().toISOString()});
 return {...data,interviewInstructions};
}
