export const categories=['intro','feeling','thinking','response','dialogue','impression','availability','work','scene','photography','survey','closing'];
export const groups=['all','new','experienced','lightning','photo'];
export const isMinhang=value=>typeof value==='string'&&['闵行','闵行校区'].includes(value.replace(/\s/g,''));
export const validCampus=value=>typeof value==='string'&&value.trim().length>0&&value.length<=80;
export function validQuestion(q){return q&&typeof q.id==='string'&&q.id.length>0&&q.id.length<=200&&categories.includes(q.category)&&groups.includes(q.group)&&typeof q.text==='string'&&q.text.trim().length>0&&q.text.length<=3000&&typeof q.answer==='string'&&q.answer.length<=6000&&(!['work','scene'].includes(q.category)||q.group==='lightning')&&(q.category!=='photography'||q.group==='photo');}
export const questionSignature=q=>JSON.stringify([q.category,q.group,q.text,q.answer]);
export const questionsFor=(bank,e)=>[...bank,...(e?.customQuestions||[])];
export const surveyResponses=(bank,e)=>questionsFor(bank,e).filter(q=>q.category==='survey'&&typeof e?.responses?.[q.id]==='string'&&e.responses[q.id].trim()).map(q=>({id:q.id,question:q.text,response:e.responses[q.id]}));
export const questionResponses=(bank,e)=>questionsFor(bank,e).filter(q=>typeof e?.responses?.[q.id]==='string'&&e.responses[q.id].trim()).map(q=>({id:q.id,category:q.category,question:q.text,response:e.responses[q.id]}));
export function validateQuestionList(list,bank=[]){if(!Array.isArray(list)||list.length>5000||list.some(q=>!validQuestion(q)))throw Error('自建题目格式不正确，请检查环节、适用对象和题目内容');const ids=list.map(q=>q.id);if(new Set(ids).size!==ids.length||ids.some(id=>bank.some(q=>q.id===id)))throw Error('题目编号重复或与已有题目冲突');return list.map(({id,category,group,text,answer})=>({id,category,group,text,answer}));}
