import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import {readFileSync} from 'node:fs';
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import {parseChatContent} from '../src/chat-content.ts';
import type {VisualSpec} from '../src/chat-content.ts';
import {samplePlot} from '../src/chat-math.ts';
import type {LessonDocument} from '../src/tutors.ts';
import {tutorResources} from './tutors.ts';

const font=readFileSync(new URL('./assets/NotoSansTC-Regular.otf',import.meta.url));
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const math=mathjax.document('',{InputJax:new TeX({packages:['base','ams','newcommand'],maxBuffer:4000,maxMacros:500}),OutputJax:new SVG({fontCache:'none'})});
const green='#2c6854',ink='#263e34',muted='#65786e',left=48,width=499,bottom=780;
const palette=[green,'#b07b36','#5e719e','#9b6382'];
const clean=(s:string)=>s.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*`]/g,'').replace(/^>\s?/gm,'').replace(/\p{Extended_Pictographic}|\uFE0F|\u0000/gu,'');
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const starRoot=(v:VisualSpec)=>v.kind==='diagram'&&v.nodes.length>2&&v.edges.length===v.nodes.length-1?v.nodes.find(n=>v.edges.every(e=>e.from===n.id)&&new Set(v.edges.map(e=>e.to)).size===v.nodes.length-1&&!v.edges.some(e=>e.to===n.id))?.id:undefined;
const visualHeight=(v:VisualSpec)=>v.kind==='diagram'?(starRoot(v)?1+Math.ceil((v.nodes.length-1)/3):Math.ceil(v.nodes.length/3))*70+25:330;
// Only validated numeric geometry and escaped labels reach SVG, never model code.
export function lessonVisual(v:VisualSpec){
 const label=(x:number,y:number,s:string)=>`<text x="${x}" y="${y}" font-size="13" fill="${ink}">${esc(s)}</text>`;
 const line=(x:number,y:number,xx:number,yy:number)=>`<line x1="${x}" y1="${y}" x2="${xx}" y2="${yy}" stroke="${green}" stroke-width="2"/>`;
 let content='';
 if(v.kind==='plot'||v.kind==='chart'){
  const xs=v.kind==='chart'?v.labels.map((s,i)=>v.type==='scatter'?Number(s):i):[],ys=v.kind==='chart'?v.series.flatMap(s=>s.values.filter((n):n is number=>n!==null)):[],xmin=v.kind==='plot'?v.xMin:Math.min(0,...xs),xmax=v.kind==='plot'?v.xMax:Math.max(1,...xs),ymin=v.kind==='plot'?v.yMin:Math.min(0,...ys),ymax=v.kind==='plot'?v.yMax:Math.max(1,...ys)*1.1;
  const x=(n:number)=>55+(n-xmin)/(xmax-xmin)*540,y=(n:number)=>265-(n-ymin)/(ymax-ymin)*215;
  for(let i=0;i<=4;i++){const n=ymin+(ymax-ymin)*i/4;content+=`<line x1="55" x2="595" y1="${y(n)}" y2="${y(n)}" stroke="#e4ece6"/>`+label(4,y(n)+4,String(Number(n.toFixed(2))));const a=xmin+(xmax-xmin)*i/4;content+=label(x(a)-8,287,String(Number(a.toFixed(2))))}
  content+=line(55,y(Math.max(ymin,Math.min(ymax,0))),595,y(Math.max(ymin,Math.min(ymax,0))))+line(x(Math.max(xmin,Math.min(xmax,0))),50,x(Math.max(xmin,Math.min(xmax,0))),265);
  if(v.kind==='plot')v.functions.forEach((f,k)=>{for(const segment of samplePlot(f.expression,xmin,xmax,ymin,ymax))content+=`<polyline points="${segment.map(p=>x(p.x)+','+y(p.y)).join(' ')}" fill="none" stroke="${palette[k]}" stroke-width="2.2"/>`});
  else v.series.forEach((s,k)=>{const points=s.values.flatMap((n,i)=>n===null?[]:[`${x(xs[i])},${y(n)}`]);if(v.type==='line'){let run:string[]=[];const flush=()=>{if(run.length)content+=`<polyline points="${run.join(' ')}" fill="none" stroke="${['#2c6854','#b07b36','#5e719e','#9b6382'][k]}" stroke-width="2"/>`;run=[]};s.values.forEach((n,i)=>{if(n===null)flush();else run.push(`${x(xs[i])},${y(n)}`)});flush()}else s.values.forEach((n,i)=>{if(n===null)return;content+=v.type==='bar'?`<rect x="${x(i)-6+k*5}" y="${Math.min(y(n),y(0))}" width="5" height="${Math.max(1,Math.abs(y(n)-y(0)))}" fill="${green}"/>`:`<circle cx="${x(xs[i])}" cy="${y(n)}" r="3" fill="${green}"/>`});content+=label(65+k*135,30,s.name);void points});
  if(v.kind==='chart'&&v.type!=='scatter'){content+='<rect x="40" y="270" width="580" height="25" fill="white"/>';v.labels.forEach((s,i)=>{if(i%Math.max(1,Math.ceil(v.labels.length/8))===0)content+=label(x(i)-10,287,s.slice(0,12))})}
  content+=label(260,310,v.xLabel??'x')+label(8,35,v.yLabel??'y');
 }else if(v.kind==='diagram'){
  const root=starRoot(v),children=v.nodes.filter(n=>n.id!==root),pos=new Map(v.nodes.map((n,i)=>{const index=root?children.findIndex(x=>x.id===n.id):i;return [n.id,root&&n.id===root?{x:315,y:40}:{x:105+(index%3)*210,y:(root?120:50)+Math.floor(index/3)*70}]}));
  for(const e of v.edges){const a=pos.get(e.from)!,b=pos.get(e.to)!,start=root?{x:a.x,y:a.y+22}:a,end=root?{x:b.x,y:b.y-22}:b;content+=line(start.x,start.y,end.x,end.y);if(v.layout==='flow'){const dx=end.x-start.x,dy=end.y-start.y,n=Math.hypot(dx,dy),t=root?0:Math.min(dx?90/Math.abs(dx):Infinity,dy?22/Math.abs(dy):Infinity),x=end.x-dx*t,y=end.y-dy*t,ux=dx/n,uy=dy/n;content+=`<polygon points="${x},${y} ${x-9*ux+4*uy},${y-9*uy-4*ux} ${x-9*ux-4*uy},${y-9*uy+4*ux}" fill="${green}"/>`}if(e.label)content+=label((start.x+end.x)/2+5,(start.y+end.y)/2-6,e.label)}
  for(const n of v.nodes){const p=pos.get(n.id)!;content+=`<rect x="${p.x-90}" y="${p.y-22}" width="180" height="44" rx="10" fill="#edf4ee" stroke="#b4cbbd"/>`+label(p.x-82,p.y+5,n.label.slice(0,25))}
 }else if(v.kind==='geometry'){
  const xs=[...v.points.map(p=>p.x),...(v.circles??[]).flatMap(c=>[c.x-c.r,c.x+c.r])],ys=[...v.points.map(p=>p.y),...(v.circles??[]).flatMap(c=>[c.y-c.r,c.y+c.r])],xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),scale=Math.min(500/Math.max(1,xmax-xmin),220/Math.max(1,ymax-ymin)),x=(n:number)=>65+(n-xmin)*scale,y=(n:number)=>265-(n-ymin)*scale;
  for(const p of v.paths)content+=`<${p.closed?'polygon':'polyline'} points="${p.points.map(id=>{const q=v.points.find(p=>p.id===id)!;return x(q.x)+','+y(q.y)}).join(' ')}" fill="none" stroke="${green}" stroke-width="2" ${p.dashed?'stroke-dasharray="5 4"':''}/>`;
  for(const c of v.circles??[])content+=`<circle cx="${x(c.x)}" cy="${y(c.y)}" r="${c.r*scale}" fill="none" stroke="${green}"/>`+(c.label?label(x(c.x)+4,y(c.y)-4,c.label):'');
  for(const p of v.points)content+=`<circle cx="${x(p.x)}" cy="${y(p.y)}" r="3" fill="${green}"/>`+label(x(p.x)+5,y(p.y)-5,p.id);
 }else{
  const branches=v.layout==='series'?[v.components!]:v.branches!;
  content+=line(35,70,35,270)+line(600,70,600,270)+line(35,270,315,270)+line(325,270,600,270)+line(315,250,315,290)+line(325,258,325,282)+label(340,305,v.sourceLabel);
  branches.forEach((branch,k)=>{const y=70+k*75;content+=line(35,y,600,y);branch.forEach((e,i)=>{const x=110+i*90,circle=e.type==='lamp'||e.type==='ammeter';content+=`<rect x="${x-10}" y="${y-18}" width="72" height="50" fill="white"/>`+line(x-10,y,circle?x+7:x,y)+line(circle?x+37:x+45,y,x+62,y);if(e.type==='resistor')content+=`<rect x="${x}" y="${y-8}" width="45" height="16" fill="none" stroke="${green}"/>`;else if(e.type==='switch')content+=line(x,y,x+45,y-(e.open?15:0));else content+=`<circle cx="${x+22}" cy="${y}" r="15" fill="none" stroke="${green}"/>`+label(x+16,y+5,e.type==='ammeter'?'A':'X');content+=label(x-5,y+35,e.label)})});if(v.voltmeterAcross!==undefined){const x=100+v.voltmeterAcross*90;content+=line(x,70,x,170)+line(x+72,70,x+72,170)+line(x,170,x+22,170)+line(x+50,170,x+72,170)+`<circle cx="${x+36}" cy="170" r="14" fill="none" stroke="${green}"/>`+label(x+30,175,'V')}
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 ${visualHeight(v)}">${content}</svg>`;
}

export async function renderLessonPdf(meta:LessonDocument,content:string,chatId:string,english:boolean,origin=process.env.HOKSE_ORIGIN??process.env.RENDER_EXTERNAL_URL??'http://127.0.0.1:3001',options:{returnPath?:string;practice?:boolean}={}){
 if(content.length>30000)throw new Error('PDF_CONTENT_LIMIT');
 const site=new URL(origin);if(!['http:','https:'].includes(site.protocol)||site.username||site.password||site.search||site.hash)throw new Error('PDF_INVALID_ORIGIN');
 if(options.returnPath&&(!options.returnPath.startsWith('/')||options.returnPath.startsWith('//')||/[\\\r\n]/.test(options.returnPath)))throw new Error('PDF_INVALID_RETURN_PATH');
 const doc=new PDFDocument({size:'A4',margins:{top:50,bottom:50,left,right:48},bufferPages:true,info:{Title:meta.title,Author:'HOKSE',Subject:meta.objective}});
 const chunks:Buffer[]=[];const ready=new Promise<Buffer>((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 doc.registerFont('CJK',font).font('CJK');let pages=1;
 doc.on('pageAdded',()=>{if(++pages>16)throw new Error('PDF_PAGE_LIMIT');doc.font('CJK')});
 function room(h:number){if(doc.y+h>bottom)doc.addPage()}
 function text(s:string,size=10.5,color=ink){doc.font('CJK').fontSize(size).fillColor(color).text(clean(s),left,doc.y,{width,lineGap:4,paragraphGap:5});doc.x=left}
 function mathRun(source:string,size=14,maxWidth=width){if(source.length>1200||/\\(?:href|url|require|includegraphics|html)/i.test(source))throw new Error('PDF_UNSUPPORTED_MATH');const node=math.convert(source,{display:true}),outer=adaptor.outerHTML(node),svg=outer.slice(outer.indexOf('<svg'),outer.lastIndexOf('</svg>')+6);if(/data-mjx-error|<merror/.test(svg))throw new Error('PDF_INVALID_MATH');const m=svg.match(/viewBox="([\d. -]+)"/);if(!m)throw new Error('PDF_INVALID_MATH');const [, ,w,h]=m[1].split(/\s+/).map(Number),scale=Math.min(size/1000,maxWidth/w);return {svg,width:w*scale,height:h*scale}}
 function formula(source:string,x=left,maxWidth=width){const run=mathRun(source,14,maxWidth);room(run.height+18);const y=doc.y;SVGtoPDF(doc,run.svg,x,y,{width:run.width,height:run.height,preserveAspectRatio:'xMinYMin meet',assumePt:true,fontCallback:()=>'CJK'});doc.y=y+run.height+12}
 function rich(s:string,size=10.5,color=ink,start=left,available=width,draw=true){
  const initialY=doc.y;
  type Run={text?:string;svg?:string;width:number;height:number};let line:Run[]=[],used=0;
  const flush=()=>{if(!line.length)return;const height=Math.max(size*1.65,...line.map(r=>r.height+4));if(draw)room(height);const y=doc.y;let x=start;for(const run of line){if(draw){if(run.svg)SVGtoPDF(doc,run.svg,x,y+(height-run.height)/2,{width:run.width,height:run.height,preserveAspectRatio:'xMinYMin meet',assumePt:true,fontCallback:()=>'CJK'});else doc.font('CJK').fontSize(size).fillColor(color).text(run.text!,x,y+(height-size*1.2)/2,{lineBreak:false})}x+=run.width}doc.y=y+height;line=[];used=0};
  const add=(run:Run)=>{if(used+run.width>available)flush();if(!line.length&&!run.text?.trim()&&!run.svg)return;line.push(run);used+=run.width};
  const display=(source:string)=>{flush();if(draw)formula(source,start,available);else doc.y+=mathRun(source,14,available).height+12};
  for(const part of s.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)){if(part.startsWith('$$'))display(part.slice(2,-2));else if(part.startsWith('$')){const run=mathRun(part.slice(1,-1),size+1,available);if(run.height>size*2.5)display(part.slice(1,-1));else add(run)}else{doc.font('CJK').fontSize(size);for(const token of clean(part).match(/[A-Za-z0-9][A-Za-z0-9,.:;'’_-]*|[ \t]+|\n|[^\x00-\x7F]|./gu)??[]){if(token==='\n'){flush();continue}const w=doc.widthOfString(token);if(w>available){for(const c of token)add({text:c,width:doc.widthOfString(c),height:size*1.2})}else add({text:token,width:w,height:size*1.2})}}}flush();doc.y+=5;doc.x=left;const height=doc.y-initialY;if(!draw)doc.y=initialY;return height;
 }
 function table(lines:string[]){const rows=lines.filter(s=>!/^\s*\|?[\s:|-]+\|\s*$/.test(s)).map(s=>s.trim().replace(/^\||\|$/g,'').split('|').map(clean));const n=Math.max(...rows.map(r=>r.length));if(n>6)throw new Error('PDF_TABLE_LIMIT');for(let k=0;k<rows.length;k++){const cells=rows[k],h=Math.max(32,...cells.map(s=>rich(s,9,ink,0,width/n-16,false)+14));if(h>650)throw new Error('PDF_TABLE_LIMIT');room(h+(k===0&&rows[1]?Math.max(32,...rows[1].map(s=>rich(s,9,ink,0,width/n-16,false)+14)):0));const y=doc.y;doc.rect(left,y,width,h).fill(k===0?'#e9f1eb':k%2?'#f7faf8':'#ffffff');cells.forEach((s,i)=>{doc.y=y+7;rich(s,9,ink,left+i*width/n+8,width/n-16)});doc.y=y+h}doc.y+=12}
 function markdown(source:string){const lines=source.split('\n');for(let i=0;i<lines.length;i++){const s=lines[i];if(!s.trim()){doc.y+=4;continue}if(s.includes('|')&&lines[i+1]&&/^\s*\|?[\s:|-]+\|\s*$/.test(lines[i+1])){const group=[s];while(i+1<lines.length&&lines[i+1].includes('|'))group.push(lines[++i]);table(group);continue}if(s.trim().startsWith('$$')){let value=s.trim().slice(2);while(!value.includes('$$')&&i+1<lines.length)value+='\n'+lines[++i];formula(value.replace(/\$\$\s*$/,''));continue}const heading=s.match(/^(#{1,4})\s+(.+)/);room(heading?65:28);rich(heading?heading[2]:s,heading?(heading[1].length<=2?16:12):10.5,heading?green:ink)}}
 try{
  text('HOKSE  /  '+(english?'LEARNING NOTES':'學習筆記'),9,green);doc.y+=12;text(meta.title,24,green);text(options.practice?(english?'Practice · v1':'技能練習 · v1'):`${english?'Lesson':'第'} ${meta.number}${english?'':' 課'}  ·  v${meta.version}`,10,muted);rich(meta.objective,12);if(options.practice){doc.fontSize(9).fillColor(green).text(english?'Open this practice online':'回到站內輸入答案',{link:site.origin+options.returnPath});doc.y+=6;}doc.y+=14;
  let question=0;
  for(const b of parseChatContent(content).blocks){if(b.kind==='unavailable')throw new Error('PDF_INVALID_BLOCK');if(b.kind==='markdown')markdown(b.text);else if(b.kind==='exercise'){room(110);text(`Q${++question}`,13,green);markdown(b.value.question);doc.y+=18;text(english?'Your working:':'你的解題步驟：',9,muted);for(let j=0;j<3;j++){room(20);doc.moveTo(left,doc.y+16).lineTo(left+width,doc.y+16).strokeColor('#dce7df').stroke();doc.y+=24}}else{const height=width*visualHeight(b.value)/650;room(height+50);text(b.value.title,12,green);const y=doc.y;SVGtoPDF(doc,lessonVisual(b.value),left,y,{width,height,preserveAspectRatio:'xMinYMin meet',assumePt:true,fontCallback:()=> 'CJK'});doc.y=y+height+8;if(b.value.kind==='plot')b.value.functions.forEach((f,k)=>rich((k+1)+'. '+(f.label??f.expression)+(f.label?' · '+f.expression:''),9,palette[k]));if(b.value.caption)rich(b.value.caption,9,muted)}}
  if(meta.reference){room(90);text(english?'Keep for reference':'重點速查',14,green);markdown(meta.reference)}
  if(!options.practice){room(110);text(english?'Continue learning':'繼續學習',13,green);text(english?`Return to the chat with Lesson ${meta.number}, v${meta.version} and the question number. You can request hints or a worked answer. Try recalling the key idea tomorrow.`:`回到對話，註明第 ${meta.number} 課、v${meta.version} 和題號，可提交答案、要求提示或解析。明天先不看筆記，回想這課的重點。`);
  doc.fillColor(green).fontSize(9).text(english?(options.practice?'Open this practice':'Open this conversation'):(options.practice?'打開這份練習':'打開這個學習對話'),{link:site.origin+(options.returnPath??'/learn/'+encodeURIComponent(chatId))});
  text(english?'References':'參考來源',12,green);for(const id of meta.sourceIds){const s=tutorResources.find(s=>s.id===id);if(s){room(55);text(s.title+' · '+s.use,8,muted);if(s.url.startsWith('https://'))doc.fontSize(8).fillColor(green).text(s.url,{width,link:s.url,lineGap:2})}}}
  const count=doc.bufferedPageRange().count;for(let i=0;i<count;i++){doc.switchToPage(i);doc.font('CJK').fontSize(8).fillColor(muted).text(`HOKSE  ·  ${i+1} / ${count}`,left,810,{lineBreak:false})}doc.end();return await ready;
 }catch(e){(doc as any).destroy();void ready.catch(()=>{});throw e}
}
