import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent,TouchEvent as ReactTouchEvent,RefObject} from 'react';
import type {Task} from './types';
import {calendarDropTime,canDragTask} from './calendar-move';
import type {CalendarSlot} from './calendar-move';

interface Drag {task:Task;slot:CalendarSlot|null;issue:string|null;month:boolean;x:number;y:number}
interface Press {task:Task;x:number;y:number;startX:number;startY:number;offset:number;active:boolean;touchId?:number;timer?:ReturnType<typeof setTimeout>;frame?:number;target:Drag|null;cleanup:()=>void}
export function useCalendarDrag(options:{scroll:RefObject<HTMLDivElement|null>;disabled:boolean;validate:(task:Task,slot:CalendarSlot)=>string|null;move:(task:Task,slot:CalendarSlot)=>void}){
 const [drag,setDrag]=useState<Drag|null>(null),session=useRef<Press|null>(null),suppress=useRef(0),latest=useRef(options);latest.current=options;
 const update=()=>{
  const p=session.current;if(!p?.active)return;
  const column=document.elementFromPoint(p.x,p.y)?.closest<HTMLElement>('[data-calendar-date]'),date=column?.dataset.calendarDate;
  const month=column?.dataset.calendarMode==='month',slot=date?{date,start:month?p.task.start:calendarDropTime(p.y,column!.getBoundingClientRect().top,p.offset)}:null;
  p.target={task:p.task,slot,month,issue:slot?latest.current.validate(p.task,slot):null,x:p.x,y:p.y};setDrag(p.target);
 };
 const finish=(cancel=false)=>{
  const p=session.current;if(!p)return;session.current=null;clearTimeout(p.timer);if(p.frame)cancelAnimationFrame(p.frame);p.cleanup();setDrag(null);
  if(p.active){suppress.current=Date.now()+700;if(!cancel&&p.target?.slot)latest.current.move(p.task,p.target.slot)}
 };
 const autoScroll=()=>{
  const p=session.current;if(!p?.active)return;
  const scroller=latest.current.scroll.current,bounds=scroller?.getBoundingClientRect(),top=Math.max(0,bounds?.top??0),bottom=Math.min(window.innerHeight,bounds?.bottom??window.innerHeight);
  if(!bounds||p.x>=bounds.left&&p.x<=bounds.right){
   const dy=p.y<top+35&&p.y>=top-20?-10:p.y>bottom-35&&p.y<=bottom+20?10:0;
   const dx=bounds?(p.x<bounds.left+25?-8:p.x>bounds.right-25?8:0):0;
   if(dy||dx){if(scroller)scroller.scrollBy(dx,dy);else window.scrollBy(0,dy);update()}
  }
  p.frame=requestAnimationFrame(autoScroll);
 };
 const activate=()=>{const p=session.current;if(!p||p.active)return;p.active=true;update();p.frame=requestAnimationFrame(autoScroll)};
 const begin=(task:Task,x:number,y:number,element:HTMLElement,touchId?:number)=>{
  if(latest.current.disabled||!canDragTask(task))return null;finish(true);
  const p:Press={task,x,y,startX:x,startY:y,offset:y-element.getBoundingClientRect().top,active:false,touchId,target:null,cleanup:()=>{}};session.current=p;return p;
 };
 const pointerDown=(e:ReactPointerEvent<HTMLButtonElement>,task:Task)=>{
  if(e.pointerType==='touch'||e.button!==0)return;
  const p=begin(task,e.clientX,e.clientY,e.currentTarget);if(!p)return;
  const move=(event:PointerEvent)=>{if(event.pointerId!==e.pointerId)return;p.x=event.clientX;p.y=event.clientY;if(!p.active&&Math.hypot(p.x-p.startX,p.y-p.startY)>5)activate();if(p.active){event.preventDefault();update()}};
  const up=(event:PointerEvent)=>{if(event.pointerId===e.pointerId)finish()},cancel=()=>finish(true),key=(event:KeyboardEvent)=>{if(event.key==='Escape')finish(true)};
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',key);
  p.cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key)};
 };
 const touchStart=(e:ReactTouchEvent<HTMLButtonElement>,task:Task)=>{
  if(e.touches.length!==1)return;const t=e.touches[0],p=begin(task,t.clientX,t.clientY,e.currentTarget,t.identifier);if(!p)return;
  const move=(event:TouchEvent)=>{const touch=Array.from(event.touches).find(t=>t.identifier===p.touchId);if(!touch||event.touches.length!==1){finish(true);return}p.x=touch.clientX;p.y=touch.clientY;
   if(!p.active&&Math.hypot(p.x-p.startX,p.y-p.startY)>8){finish(true);return}if(p.active){event.preventDefault();update()}};
  const end=(event:TouchEvent)=>{if(Array.from(event.changedTouches).some(t=>t.identifier===p.touchId)){if(p.active)event.preventDefault();finish()}},cancel=()=>finish(true);
  window.addEventListener('touchmove',move,{passive:false});window.addEventListener('touchend',end,{passive:false});window.addEventListener('touchcancel',cancel);window.addEventListener('blur',cancel);
  p.cleanup=()=>{window.removeEventListener('touchmove',move);window.removeEventListener('touchend',end);window.removeEventListener('touchcancel',cancel);window.removeEventListener('blur',cancel)};
  p.timer=setTimeout(activate,380);
 };
 useEffect(()=>()=>finish(true),[]);
 return {drag,pointerDown,touchStart,ignoreClick:()=>Date.now()<suppress.current,cancel:()=>finish(true)};
}
