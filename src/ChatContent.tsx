import { lazy, Suspense, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { parseChatContent } from './chat-content';
import { ui, useInterfaceLanguage } from './i18n';
import 'katex/dist/katex.min.css';
const Visual=lazy(()=>import('./ChatVisual').then(m=>({default:m.ChatVisual})));
function SafeMarkdown({text}:{text:string}) {return <Markdown skipHtml remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{trust:false,throwOnError:false,maxExpand:500,maxSize:15}]]} urlTransform={url=>/^https:\/\//i.test(url)?url:''} components={{a:({href,children})=>href?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,img:({alt})=><span>{alt}</span>,table:({children})=><div className="chat-table-scroll"><table>{children}</table></div>}}>{text}</Markdown>}
export function ChatContent({text,assistant=true,complete=true,onExerciseAnswer,onExerciseAssist}:{text:string;assistant?:boolean;complete?:boolean;onExerciseAnswer?:(index:number)=>void;onExerciseAssist?:(index:number,kind:'hint'|'answer')=>void}){
 useInterfaceLanguage();const parsed=useMemo(()=>parseChatContent(text,complete),[text,complete]);
 if(!assistant)return <div className="rich-text chat-user-text">{text}</div>;
 return <div className="rich-text chat-rich">{parsed.blocks.map((b,i)=>b.kind==='markdown'?<SafeMarkdown key={i} text={b.text}/>:b.kind==='visual'?<Suspense key={i} fallback={<p className="small muted">{ui('正在繪製圖形…')}</p>}><Visual value={b.value}/></Suspense>:b.kind==='exercise'?<section className="chat-exercise" key={i}><span className="chat-exercise-label">{ui('隨堂練習')}</span><SafeMarkdown text={b.value.question}/>{onExerciseAnswer&&<button className="btn secondary" onClick={()=>onExerciseAnswer(parsed.blocks.slice(0,i).filter(x=>x.kind==='exercise').length)}>{ui('回答這題')}</button>}{b.value.hint&&<details onToggle={e=>{if(e.currentTarget.open)onExerciseAssist?.(parsed.blocks.slice(0,i).filter(x=>x.kind==='exercise').length,'hint')}}><summary>{ui('給我一點提示')}</summary><SafeMarkdown text={b.value.hint}/></details>}<details onToggle={e=>{if(e.currentTarget.open)onExerciseAssist?.(parsed.blocks.slice(0,i).filter(x=>x.kind==='exercise').length,'answer')}}><summary>{ui('查看答案與解析')}</summary><div className="chat-exercise-answer"><SafeMarkdown text={b.value.answer}/>{b.value.explanation&&<SafeMarkdown text={b.value.explanation}/>}</div></details><p className="small muted">{ui('可以直接在下方回覆你的想法，繼續一起解題。')}</p></section>:<p className="chat-block-unavailable" key={i} role="status">{ui(b.pending?'圖形或練習整理中…':'這個圖形或練習暫時無法顯示，你可以繼續提問。')}</p>)}</div>;
}
