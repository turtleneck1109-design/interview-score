import {candidateFields} from './candidates.mjs';

function splitRow(line,delimiter){
 if(delimiter==='space')return line.trim().split(/\s+/);
 const cells=[];let cell='',quoted=false,closed=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){
   if(quoted&&line[i+1]==='"'){cell+='"';i++;}
   else if(quoted){quoted=false;closed=true;}
   else if(!closed&&!cell.trim()){quoted=true;cell='';}
   else throw Error('引号格式不正确');
  }else if(ch===delimiter&&!quoted){cells.push(cell.trim());cell='';closed=false;}
  else{if(closed&&ch.trim())throw Error('引号后只能是分隔符');cell+=ch;}
 }
 if(quoted)throw Error('引号未闭合；请每行填写一位候选人');
 cells.push(cell.trim());return cells;
}

export function parseRoster(text,order='id-name'){
 if(typeof text!=='string'||!text.trim())throw Error('请粘贴学号和姓名');
 if(text.length>2000000)throw Error('名单过大，请分批导入');
 if(!['id-name','name-id'].includes(order))throw Error('请选择列顺序');
 const lines=text.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/).map((line,index)=>({line,index:index+1})).filter(r=>r.line.trim());
 const delimiter=lines[0].line.includes('\t')?'\t':lines[0].line.includes(',')?',':'space';
 let nameFirst=order==='name-id';const rows=[];
 for(let i=0;i<lines.length;i++){
  const {line,index}=lines[i];
  try{
   const cells=splitRow(line,delimiter);
   if(cells.length!==2)throw Error('请只保留学号、姓名两列');
   if(i===0&&['学号','姓名'].every(h=>cells.includes(h))){nameFirst=cells[0]==='姓名';continue;}
   const [studentId,name]=nameFirst?[cells[1],cells[0]]:cells;
   if(/^\d+(?:\.\d+)?[eE][+-]?\d+$/.test(studentId))throw Error('学号为科学计数法，请先在 Excel 中改为完整文本');
   const fields=candidateFields({studentId,name,campus:'待确认',experience:'',special:''},{allowIncomplete:true});
   rows.push({studentId:fields.studentId,name:fields.name,line:index});
  }catch(error){throw Error(`第 ${index} 行：${error.message}`);}
 }
 if(!rows.length)throw Error('表头下方还没有候选人');
 if(rows.length>10000)throw Error('每次最多导入 10000 行');
 return rows;
}

export function previewRoster(data,text,order='id-name'){
 const rows=parseRoster(text,order),known=new Map(data.candidates.map(c=>[c.studentId,c.name])),additions=[];let skipped=0;
 for(const row of rows){
  if(known.has(row.studentId)){
   if(known.get(row.studentId)!==row.name)throw Error(`第 ${row.line} 行：学号 ${row.studentId} 对应不同姓名，请核对后再导入`);
   skipped++;continue;
  }
  known.set(row.studentId,row.name);additions.push(row);
 }
 if(data.candidates.length+additions.length>10000)throw Error('候选人总数不能超过 10000 位');
 return {additions,skipped,total:rows.length};
}

export function importRoster(data,text,order,makeId,now=Date.now()){
 const preview=previewRoster(data,text,order),ids=new Set(data.candidates.map(c=>c.id));
 const candidates=preview.additions.map(({name,studentId})=>{
  const id=makeId();if(!id||ids.has(id))throw Error('候选人编号重复，请重试');ids.add(id);
  return {id,name,studentId,campus:'待确认',experience:'',special:'',candidateNotes:'',profileVersion:1,profileUpdatedAt:new Date(now).toISOString()};
 });
 return {data:{...data,candidates:[...data.candidates,...candidates]},added:candidates.length,skipped:preview.skipped,firstId:candidates[0]?.id};
}
