import type {Database, Task} from './types.ts';
import {minutesTime, validateTask} from './domain.ts';

export type CalendarSlot=Pick<Task,'date'|'start'>;
export type CalendarOrigin=Pick<Task,'date'|'start'|'minutes'>;
export const calendarOrigin=(task:Task):CalendarOrigin=>({date:task.date,start:task.start,minutes:task.minutes});
export const canDragTask=(task:Task)=>task.kind!=='exam'&&!task.locked&&task.status==='pending'&&task.schedule!=='floating'&&!!task.start;
export function calendarMoveIssue(task:Task,from:unknown,to:CalendarSlot,db:Pick<Database,'tasks'|'profile'>):string|null {
 if(!canDragTask(task))return '此任務目前不能移動';
 if(!from||typeof from!=='object'||Array.isArray(from)||Object.keys(from).sort().join(',')!=='date,minutes,start')return '移動資料無效，請重新整理後再試';
 const before=from as CalendarOrigin;
 if(before.date!==task.date||before.start!==task.start||before.minutes!==task.minutes)return '安排已變更，請重新整理後再移動';
 if(db.profile.restDates?.includes(to.date))return '這天已設定休息，請選擇其他日期';
 return validateTask({...task,...to},db);
}
// Keep the original grab point so a task does not jump when grabbed in its middle.
export function calendarDropTime(pointerY:number,columnTop:number,grabOffset:number){
 const minutes=(pointerY-columnTop-grabOffset)/64*60;
 return minutesTime(Math.max(0,Math.min(1435,Math.round(minutes/5)*5)));
}
