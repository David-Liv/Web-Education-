import { compilePlot } from './chat-math.ts';

export interface FollowUp {label:string;prompt:string}
export interface ChartSpec {title:string;type:'line'|'bar'|'scatter';labels:string[];series:{name:string;values:(number|null)[]}[];xLabel?:string;yLabel?:string;caption?:string}
export interface PlotSpec {title:string;functions:{expression:string;label?:string}[];xMin:number;xMax:number;yMin:number;yMax:number;xLabel?:string;yLabel?:string;caption?:string}
export interface GeometrySpec {title:string;points:{id:string;x:number;y:number}[];paths:{points:string[];closed?:boolean;dashed?:boolean}[];circles?:{x:number;y:number;r:number;label?:string}[];caption?:string}
export interface DiagramSpec {title:string;layout:'flow'|'mindmap';nodes:{id:string;label:string}[];edges:{from:string;to:string;label?:string}[];caption?:string}
export interface CircuitElement {type:'resistor'|'lamp'|'switch'|'ammeter';label:string;open?:boolean}
export interface CircuitSpec {title:string;layout:'series'|'parallel';sourceLabel:string;components?:CircuitElement[];branches?:CircuitElement[][];voltmeterAcross?:number;caption?:string}
export interface ExerciseSpec {question:string;hint?:string;answer:string;explanation?:string}
export type VisualSpec=({kind:'chart'}&ChartSpec)|({kind:'plot'}&PlotSpec)|({kind:'geometry'}&GeometrySpec)|({kind:'diagram'}&DiagramSpec)|({kind:'circuit'}&CircuitSpec);
export type ChatBlock={kind:'markdown';text:string}|{kind:'exercise';value:ExerciseSpec}|{kind:'visual';value:VisualSpec}|{kind:'unavailable';pending:boolean};
const reserved=new Set(['chart','plot','geometry','diagram','circuit','exercise','suggestions']);
const obj=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:any,n=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
// Providers commonly emit an empty optional label rather than omitting it.
// Keep required text nonempty, but accept bounded blank optional text as absent.
const optional=(v:any,n=200)=>v===undefined||typeof v==='string'&&v.length<=n;
const num=(v:any,limit=1e9)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=limit;
const arr=(v:any,min:number,max:number)=>Array.isArray(v)&&v.length>=min&&v.length<=max;
export function validBlock(kind:string,v:any):boolean {
  if(!obj(v)&&kind!=='suggestions')return false;
  if(kind==='suggestions')return arr(v,3,3)&&v.every((s:any)=>obj(s)&&str(s.label,60)&&str(s.prompt,1200))&&new Set(v.map((s:any)=>s.prompt.trim())).size===3;
  if(kind==='exercise')return str(v.question,4000)&&str(v.answer,3000)&&optional(v.hint,2000)&&optional(v.explanation,4000);
  if(!str(v.title,120)||!optional(v.caption,600))return false;
  if(kind==='chart')return ['line','bar','scatter'].includes(v.type)&&arr(v.labels,1,120)&&v.labels.every((s:any)=>str(s,60))&&(v.type!=='scatter'||v.labels.every((s:any)=>num(Number(s))))&&arr(v.series,1,4)&&v.series.every((s:any)=>obj(s)&&str(s.name,60)&&Array.isArray(s.values)&&s.values.length===v.labels.length&&s.values.every((n:any)=>n===null||num(n))&&s.values.some((n:any)=>n!==null))&&optional(v.xLabel,80)&&optional(v.yLabel,80);
  if(kind==='plot') {if(!arr(v.functions,1,3)||!['xMin','xMax','yMin','yMax'].every(k=>num(v[k],1e6))||v.xMax-v.xMin<.0001||v.yMax-v.yMin<.0001||!optional(v.xLabel,80)||!optional(v.yLabel,80))return false;try{return v.functions.every((f:any)=>obj(f)&&str(f.expression,160)&&optional(f.label,80)&&(compilePlot(f.expression),true))}catch{return false}}
  if(kind==='geometry')return arr(v.points,0,20)&&v.points.every((p:any)=>obj(p)&&str(p.id,12)&&num(p.x,1000)&&num(p.y,1000))&&new Set(v.points.map((p:any)=>p.id)).size===v.points.length&&arr(v.paths,0,12)&&v.paths.every((p:any)=>obj(p)&&arr(p.points,2,20)&&p.points.every((id:any)=>v.points.some((q:any)=>q.id===id))&&[undefined,true,false].includes(p.closed)&&[undefined,true,false].includes(p.dashed))&&(v.circles===undefined||arr(v.circles,0,4)&&v.circles.every((c:any)=>obj(c)&&num(c.x,1000)&&num(c.y,1000)&&num(c.r,1000)&&c.r>0&&optional(c.label,30)))&&(v.points.length>0||v.circles?.length>0);
  if(kind==='diagram')return ['flow','mindmap'].includes(v.layout)&&arr(v.nodes,1,12)&&v.nodes.every((n:any)=>obj(n)&&str(n.id,30)&&str(n.label,100))&&new Set(v.nodes.map((n:any)=>n.id)).size===v.nodes.length&&arr(v.edges,0,20)&&v.edges.every((e:any)=>obj(e)&&v.nodes.some((n:any)=>n.id===e.from)&&v.nodes.some((n:any)=>n.id===e.to)&&e.from!==e.to&&optional(e.label,40));
  if(kind==='circuit'){const elements=(a:any)=>arr(a,1,5)&&a.every((e:any)=>obj(e)&&['resistor','lamp','switch','ammeter'].includes(e.type)&&str(e.label,40)&&[undefined,true,false].includes(e.open));return str(v.sourceLabel,40)&&(v.layout==='series'?elements(v.components)&&(v.voltmeterAcross===undefined||Number.isInteger(v.voltmeterAcross)&&v.voltmeterAcross>=0&&v.voltmeterAcross<v.components.length):v.layout==='parallel'&&arr(v.branches,2,3)&&v.branches.every(elements)&&v.voltmeterAcross===undefined)}
  return false;
}

// Reserved fences are never displayed as raw JSON, including incomplete answers.
export function parseChatContent(source:string,complete=true) {
  const text=source.slice(0,60000),blocks:ChatBlock[]=[],suggestions:FollowUp[]=[];
  const opening=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n/gm;let cursor=0,match:RegExpExecArray|null,count=0;
  while((match=opening.exec(text))){const start=match.index,bodyStart=opening.lastIndex,marker=match[1],kind=match[2].trim().split(/\s/)[0].toLowerCase();
    const closing=new RegExp('^ {0,3}'+marker[0]+'{'+marker.length+',}[ \\t]*\\r?$','gm');closing.lastIndex=bodyStart;const end=closing.exec(text);
    if(!reserved.has(kind)){if(end)opening.lastIndex=closing.lastIndex;else break;continue}
    if(start>cursor)blocks.push({kind:'markdown',text:text.slice(cursor,start)});
    cursor=end?closing.lastIndex:text.length;opening.lastIndex=cursor;
    if(!end){if(kind!=='suggestions')blocks.push({kind:'unavailable',pending:!complete});break}
    if(++count>10){blocks.push({kind:'unavailable',pending:false});cursor=text.length;break}
    try {let v=JSON.parse(text.slice(bodyStart,end.index));
      // A tree is a directed concept diagram; render it with our existing flow
      // layout, then apply exactly the same bounded reference validation.
      if(kind==='diagram'&&obj(v)&&v.layout==='tree')v={...v,layout:'flow'};
      if(!validBlock(kind,v))throw new Error('Unsupported block');
      if(kind==='suggestions'){if(!suggestions.length)suggestions.push(...v.map((s:FollowUp)=>({label:s.label.trim(),prompt:s.prompt.trim()})))}
      else if(kind==='exercise')blocks.push({kind:'exercise',value:v});else blocks.push({kind:'visual',value:{...v,kind} as VisualSpec});
    }catch{if(kind!=='suggestions')blocks.push({kind:'unavailable',pending:false})}
  }
  if(cursor<text.length)blocks.push({kind:'markdown',text:text.slice(cursor)});
  return {blocks,suggestions};
}
export function followUps(source:string,topic:string,english=false):FollowUp[] {
  const parsed=parseChatContent(source);if(parsed.suggestions.length===3)return parsed.suggestions;
  const excerpt=parsed.blocks.flatMap(b=>b.kind==='markdown'?[b.text.replace(/[#*_`]/g,'').trim()]:b.kind==='exercise'?[b.value.question]:[]).join(' ').slice(0,240);
  const context=english?`About the earlier explanation of ${topic}:\n${excerpt}\n\n`:`針對前面「${topic}」的這段內容：\n${excerpt}\n\n`;
  const exercise=parsed.blocks.some(b=>b.kind==='exercise');
  return (english?exercise?[['Give me a hint','Give me a small hint without revealing the answer.'],['Break down the question','Help me identify what is given and what I need to find.'],['Explain visually','Use a suitable diagram or mind map to explain the idea without revealing the answer.']]:[['Explain one step further','Continue the explanation with a simpler example, focusing on my latest confusion.'],['Try a related question','Give me one related short exercise. Put the hint and answer in the collapsible exercise block.'],['Explain visually','Explain this concept with a suitable chart, diagram or mind map.']]:exercise?[['給我一點提示','先給我一個小提示，不要直接揭示答案。'],['拆解題意','幫我整理題目的已知條件，以及要找甚麼。'],['用圖理解','用合適的圖形或思維導圖解釋概念，先不要直接揭示答案。']]:[['繼續講清楚','繼續導讀或講解，用一個更簡單的例子釐清我剛才的疑惑。'],['試一道相關題','針對剛才的疑惑出一道短練習，把提示和答案放在可展開的練習區。'],['用圖理解','用合適的圖表、圖形或思維導圖解釋剛才的概念。']]).map(([label,prompt])=>({label,prompt:context+prompt}));
}
export function chatHistoryText(source:string){return parseChatContent(source).blocks.map(b=>b.kind==='markdown'?b.text:b.kind==='exercise'?`\nExercise: ${JSON.stringify(b.value)}\n`:b.kind==='visual'?`\nDiagram: ${JSON.stringify(b.value)}\n`:'').join('\n')}
export const CHAT_CONTENT_INSTRUCTIONS=`回答使用 Markdown，可用表格、列表、引用、程式碼和 $行內公式$ / $$獨立公式$$。不輸出 HTML、SVG、JavaScript 或外部圖片連結。
需要視覺解釋時，用以下同名 fenced code block 包含 JSON；最多兩個圖形和一個 exercise。不可編造觀測數據；假設的例子要在 caption 說明。標題、單位及標籤用對話語言，森林綠由網站統一繪製。
chart: {"title":"標題","type":"line 或 bar 或 scatter","labels":["1","2"],"series":[{"name":"系列","values":[1,4]}],"xLabel":"含單位","yLabel":"含單位"}。缺值用 null，最多120點、4系列。
plot: {"title":"函數圖","functions":[{"expression":"x^2-5*x+6","label":"y=x²−5x+6"}],"xMin":-1,"xMax":6,"yMin":-4,"yMax":10}。只支援 x、數字、pi、e、+ - * / ^、括號、sin/cos/tan(弧度)、sqrt、abs、ln(自然對數)、log(常用對數)、exp。乘號必須明寫，最多3條函數，範圍須有限且遞增。
geometry: {"title":"三角形","points":[{"id":"A","x":0,"y":0},{"id":"B","x":4,"y":0},{"id":"C","x":4,"y":3}],"paths":[{"points":["A","B","C"],"closed":true}],"circles":[{"x":0,"y":0,"r":1,"label":"O"}]}。points/paths 可為空，所有引用須存在，最多20點、12路徑、4圓。
diagram: {"title":"概念關係","layout":"mindmap","nodes":[{"id":"a","label":"概念"},{"id":"b","label":"例子"}],"edges":[{"from":"a","to":"b","label":"例如"}]}。layout只用 mindmap 或 flow，樹狀分類用 flow；最多12節點、20連線，id唯一，引用存在；簡潔樹狀關係最清楚。沒有連線文字時省略 label。
circuit: {"title":"串聯電路","layout":"series","sourceLabel":"6 V","components":[{"type":"resistor","label":"R1 10 Ω"},{"type":"lamp","label":"L1"}],"voltmeterAcross":0}。元件 type 只可 resistor/lamp/switch/ammeter，可有 open:true；series最多5個元件，voltmeterAcross為元件索引(選填)。parallel改用 branches:[[元件],[元件]]，2–3支路，每路1–5個，不提供voltmeterAcross。這是基礎示意圖，不是電路仿真，複雜拓撲請文字解釋而不要畫錯。
出隨堂題時使用 exercise 區塊：{"question":"題目 Markdown","hint":"小提示(選填)","answer":"參考答案 Markdown","explanation":"解析(選填)"}。輸出前自行重算一次，確保 answer、explanation 的最後結果及題目條件一致。提示和答案由網頁折疊，正文不要重複洩露答案。學生在原聊天作答，你繼續提供輔導，不設定正式測驗分數或掌握度。
最後用 suggestions fenced code block 包含剛好3項陣列：[{"label":"簡短下一步","prompt":"完整、可編輯、獨立看得懂的提問"},...]。依目前疑惑、文章段落及已生成內容選擇，避免三個泛泛的固定按鈕。學生尚未回答小題時以提示、拆題、圖解為主，不自動代答。一般可繼續導讀、相關練習、圖形/思維導圖。label最多60字元，prompt最多1200字元。不在此回覆內預先回答下一步。`;
