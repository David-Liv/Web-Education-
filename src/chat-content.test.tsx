import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseChatContent, followUps, validBlock, chatHistoryText } from './chat-content';
import { compilePlot, samplePlot } from './chat-math';
import { ChatContent } from './ChatContent';
import { ChatVisual } from './ChatVisual';
import type { VisualSpec } from './chat-content';
const fence=(kind:string,data:unknown)=>'```'+kind+'\n'+JSON.stringify(data)+'\n```';
const exercise={question:'Solve $x^2-5x+6=0$.',hint:'Try factoring.',answer:'$x=2$ or $x=3$',explanation:'$(x-2)(x-3)=0$'};
const suggestions=[{label:'One step further',prompt:'Explain why both factors can be zero, with a different example.'},{label:'Try a question',prompt:'Give me a related short exercise without revealing the answer.'},{label:'See the graph',prompt:'Plot the quadratic and show how its roots relate to the x-axis.'}];
describe('controlled chat content',()=>{
 it('hides review routing metadata from student rendering and subsequent chat history',()=>{
  const text=fence('review',{scope:'all'})+'\n'+fence('exercise',exercise);
  expect(parseChatContent(text).reviewScope).toBe('all');expect(chatHistoryText(text)).not.toContain('scope');
  const html=renderToStaticMarkup(<ChatContent text={text}/>);expect(html).not.toContain('scope');expect(html).not.toContain('review');expect(html).toContain('<details>');
  expect(parseChatContent('```review\n{"scope":"all"',false).blocks).toEqual([]);
 });
 it('keeps tables and ordinary code while extracting exercises and exactly three contextual suggestions',()=>{
  const source='# Explanation\n\n| x | y |\n|---|---|\n| 2 | 0 |\n\n'+fence('exercise',exercise)+'\n'+fence('suggestions',suggestions);
  const parsed=parseChatContent(source);expect(parsed.blocks.map(b=>b.kind)).toEqual(['markdown','exercise','markdown']);expect(followUps(source,'Quadratics',true)).toEqual(suggestions);
  expect(chatHistoryText(source)).toContain(exercise.answer);expect(chatHistoryText(source)).not.toContain(suggestions[0].prompt);
  expect(parseChatContent('````text\n'+fence('exercise',exercise)+'\n````').blocks).toEqual([{kind:'markdown',text:'````text\n'+fence('exercise',exercise)+'\n````'}]);
 });
 it('never reveals incomplete or invalid reserved JSON and falls back without another model request',()=>{
  const partial='Intro\n\n```exercise\n{"question":"q","answer":"hidden secret"';
  const pending=parseChatContent(partial,false);expect(JSON.stringify(pending.blocks)).not.toContain('hidden secret');expect(pending.blocks.at(-1)).toEqual({kind:'unavailable',pending:true});
  expect(parseChatContent(partial,true).blocks.at(-1)).toEqual({kind:'unavailable',pending:false});
  const invalid='```exercise\n{"answer":"hidden secret"}\n```';expect(JSON.stringify(parseChatContent(invalid))).not.toContain('hidden secret');
  expect(followUps(fence('suggestions',[suggestions[0]]),'Quadratics',true)).toHaveLength(3);
  expect(followUps(fence('exercise',exercise),'Quadratics',true)[0].prompt).toMatch(/without revealing/);
  expect(parseChatContent(('```chart\ninvalid\n```\n').repeat(100)).blocks.length).toBeLessThan(24);
 });
 it('retains invalid fences only when explicitly requested by the private review pipeline',()=>{
  const invalid='```exercise\n'+String.raw`{"question":"P(A \cap B)","answer":"hidden answer"}`+'\n```';
  expect(parseChatContent(invalid).blocks).toEqual([{kind:'unavailable',pending:false}]);
  expect(chatHistoryText(invalid)).not.toContain('hidden answer');
  expect(renderToStaticMarkup(<ChatContent text={invalid}/>)).not.toContain('hidden answer');
  expect(parseChatContent(invalid,true,{retainInvalid:true}).blocks[0]).toEqual({kind:'unavailable',pending:false,source:invalid,format:'exercise'});
  // A single LaTeX backslash before "frac" is valid JSON's form-feed escape,
  // but must not silently turn a mathematical answer into damaged text.
  const damaged='```exercise\n'+String.raw`{"question":"Half?","answer":"$\frac{1}{2}$"}`+'\n```';
  expect(parseChatContent(damaged).blocks[0].kind).toBe('unavailable');
  expect(validBlock('exercise',{question:'Half?',answer:'$\\frac{1}{2}$'})).toBe(true);
 });
 it('validates data limits, missing chart values, diagram references and circuit measurement positions',()=>{
  const chart={title:'Values',type:'line',labels:['A','B'],series:[{name:'Observed',values:[0,null]}]};expect(validBlock('chart',chart)).toBe(true);
  expect(validBlock('chart',{...chart,series:[{name:'Bad',values:[Infinity,0]}]})).toBe(false);expect(validBlock('chart',{...chart,labels:Array(121).fill('x')})).toBe(false);
  expect(validBlock('diagram',{title:'Map',layout:'flow',nodes:[{id:'a',label:'A'}],edges:[{from:'a',to:'missing'}]})).toBe(false);
  const map={title:'Discriminant',layout:'mindmap',nodes:[{id:'a',label:'Δ'},{id:'b',label:'Two roots'}],edges:[{from:'a',to:'b',label:''}]};
  expect(parseChatContent(fence('diagram',map)).blocks[0].kind).toBe('visual');
  expect(parseChatContent(fence('diagram',{...map,layout:'tree'})).blocks[0]).toMatchObject({kind:'visual',value:{kind:'diagram',layout:'flow'}});
  expect(parseChatContent(fence('diagram',{...map,layout:'tree',edges:[{from:'a',to:'missing'}]})).blocks[0].kind).toBe('unavailable');
  expect(parseChatContent(fence('diagram',{...map,layout:'arbitrary-code'})).blocks[0].kind).toBe('unavailable');
  expect(validBlock('diagram',{...map,edges:[{from:'a',to:'b',label:42}]})).toBe(false);
  expect(validBlock('diagram',{...map,edges:[{from:'a',to:'b',label:'x'.repeat(41)}]})).toBe(false);
  const circuit={title:'Circuit',layout:'series',sourceLabel:'6 V',components:[{type:'resistor',label:'R'}]};expect(validBlock('circuit',{...circuit,voltmeterAcross:0})).toBe(true);expect(validBlock('circuit',{...circuit,voltmeterAcross:1})).toBe(false);expect(validBlock('circuit',{...circuit,components:[{type:'voltmeter',label:'V'}]})).toBe(false);
 });
 it('renders Markdown, maths and collapsed answers without accepting model HTML or unsafe URLs',()=>{
  const html=renderToStaticMarkup(<ChatContent text={'# Heading\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n$\\frac{1}{2}$\n\n<script>alert(1)</script>\n\n![remote](https://example.com/tracker) [bad](javascript:alert(1))\n\n'+fence('exercise',exercise)}/>);
  expect(html).toContain('<table>');expect(html).toContain('katex');expect(html).toContain('<details>');expect(html).not.toMatch(/<details[^>]*\sopen/);expect(html).not.toContain('<script');expect(html).not.toContain('<img');expect(html).not.toContain('javascript:');
  const student=renderToStaticMarkup(<ChatContent text={fence('exercise',exercise)} assistant={false}/>);expect(student).not.toContain('<details>');
 });
 it('draws every supported visual with finite coordinates and escaped labels',()=>{
  const figures:VisualSpec[]=[{kind:'chart',title:'Data',type:'bar',labels:['A','B'],series:[{name:'N',values:[-2,4]}]}, {kind:'plot',title:'Function',functions:[{expression:'x^2'}],xMin:-2,xMax:2,yMin:0,yMax:4}, {kind:'geometry',title:'Triangle',points:[{id:'A',x:0,y:0},{id:'B',x:4,y:0},{id:'C',x:4,y:3}],paths:[{points:['A','B','C'],closed:true}]}, {kind:'diagram',title:'Concepts',layout:'mindmap',nodes:[{id:'a',label:'<script>no</script>'},{id:'b',label:'Example'}],edges:[{from:'a',to:'b'}]}, {kind:'circuit',title:'Parallel circuit',layout:'parallel',sourceLabel:'6 V',branches:[[{type:'resistor',label:'10 Ω'}],[{type:'lamp',label:'L1'}]]}];
  figures.push({kind:'chart',title:'Line with a gap',type:'line',labels:['A','B','C'],series:[{name:'N',values:[1,null,3]}]},{kind:'chart',title:'Scatter',type:'scatter',labels:['1','2'],series:[{name:'N',values:[2,4]}]},{kind:'diagram',title:'Process',layout:'flow',nodes:[{id:'a',label:'First'},{id:'b',label:'Next'}],edges:[{from:'a',to:'b',label:'then'}]});
  for(const figure of figures){const html=renderToStaticMarkup(<ChatVisual value={figure}/>);expect(html).toContain('<svg');expect(html).not.toContain('NaN');expect(html).not.toContain('Infinity');expect(html).not.toContain('<script>')}
 });
});
describe('bounded function plotting',()=>{
 it('handles precedence, explicit multiplication and supported functions',()=>{expect(compilePlot('-x^2+2*x')(3)).toBe(-3);expect(compilePlot('2^3^2')(0)).toBe(512);expect(compilePlot('sin(pi/2)+log(100)+ln(e)')(0)).toBeCloseTo(4);expect(compilePlot('1e-2*x')(3)).toBeCloseTo(.03)});
 it('rejects JavaScript, assignments, implicit multiplication and unbounded grammar',()=>{for(const input of ['x.constructor','alert(1)','x=1','2x','import(1)','x;1','('.repeat(21)+'x'+')'.repeat(21)])expect(()=>compilePlot(input)).toThrow()});
 it('splits sampled curves at nonfinite and out-of-range points',()=>{const segments=samplePlot('1/x',-1,1,-5,5);expect(segments.length).toBe(2);expect(segments.every(s=>s.every(p=>Number.isFinite(p.y)&&Math.abs(p.y)<=5))).toBe(true);expect(segments[0].at(-1)!.x).toBeLessThan(0);expect(segments[1][0].x).toBeGreaterThan(0)});
});
