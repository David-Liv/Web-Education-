import type { ContentPack } from '../src/pilot-types.ts';

export const CSV_FIELDS=['id','subjectId','topicId','paper','difficulty','kind','prompt','options','answer','explanation','hint','marks','skillIds','familyId','scoring','expectedMinutes','source','tolerance'];
export function parseCSV(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(!quoted&&cell)throw new Error('CSV 引號位置無效');else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}
  if(quoted)throw new Error('CSV 引號未結束');row.push(cell);if(row.some(Boolean))rows.push(row);return rows;
}
export function packFromCSV(text:string,metadata:Omit<ContentPack,'questions'|'reviews'|'status'|'professionalVerified'>):ContentPack{
  const [header,...rows]=parseCSV(text);if(!header||CSV_FIELDS.some(f=>!header.includes(f)))throw new Error('CSV 缺少標準欄位，請先下載範本');
  const questions=rows.map((row,n)=>{if(row.length!==header.length)throw new Error(`第 ${n+2} 行欄位數不一致`);const q=Object.fromEntries(header.map((key,i)=>[key,row[i]])) as any;for(const key of ['options','skillIds','scoring'])q[key]=q[key]?JSON.parse(q[key]):undefined;for(const key of ['marks','expectedMinutes','tolerance'])q[key]=q[key]?Number(q[key]):undefined;return {...q,original:true}});
  return {...metadata,questions,reviews:[],status:'draft',professionalVerified:false};
}
export function packCSV(pack:ContentPack){const escape=(x:any)=>`"${String(typeof x==='object'?JSON.stringify(x):x??'').replace(/"/g,'""')}"`;return '\uFEFF'+[CSV_FIELDS.join(','),...pack.questions.map(q=>CSV_FIELDS.map(k=>escape((q as any)[k])).join(','))].join('\r\n')}
