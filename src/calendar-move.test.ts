import {describe,it,expect} from 'vitest';
import {calendarDropTime,calendarMoveIssue,calendarOrigin,canDragTask} from './calendar-move';
import {createSeed} from './data/seed';
import type {Task} from './types';
const task:Task={id:'move',title:'Revision',kind:'study',subjectId:'maths',date:'2028-02-14',start:'18:00',minutes:30,status:'pending',locked:false,reason:'Test'};
const state=()=>({...createSeed(),tasks:[task],profile:{...createSeed().profile,dailyMinutes:Array(7).fill(120),availability:Array(7).fill('16:00'),restDates:['2028-02-16']}});
describe('calendar move constraints',()=>{
 it('preserves a middle grab point and snaps to five minutes rather than jumping to the pointer',()=>{expect(calendarDropTime(400,0,16)).toBe('06:00');expect(calendarDropTime(397,0,16)).toBe('05:55');expect(calendarDropTime(-20,0,0)).toBe('00:00');expect(calendarDropTime(2000,0,0)).toBe('23:55')});
 it('moves across dates without changing task identity or duration',()=>{expect(calendarMoveIssue(task,calendarOrigin(task),{date:'2028-02-15',start:'18:15'},state())).toBeNull();expect(task.date).toBe('2028-02-14');expect(task.minutes).toBe(30)});
 it('rejects stale moves and stale Undo, including a changed duration',()=>{const db=state();expect(calendarMoveIssue({...task,start:'19:00'},calendarOrigin(task),{date:task.date,start:'18:00'},db)).toMatch(/已變更/);expect(calendarMoveIssue({...task,minutes:45},calendarOrigin(task),{date:task.date,start:'19:00'},db)).toMatch(/已變更/)});
 it('blocks locked, complete, exam and floating tasks',()=>{for(const patch of [{locked:true},{status:'done'},{kind:'exam'},{schedule:'floating',start:''}] as Partial<Task>[]){const t={...task,...patch};expect(canDragTask(t)).toBe(false);expect(calendarMoveIssue(t,calendarOrigin(t),{date:t.date,start:'19:00'},state())).not.toBeNull()}});
 it('rejects overlap, rest days, midnight overflow and capacity overflow without rescheduling others',()=>{const db=state();db.tasks.push({...task,id:'other',date:'2028-02-15',start:'18:15',minutes:120});const original=JSON.stringify(db.tasks);expect(calendarMoveIssue(task,calendarOrigin(task),{date:'2028-02-15',start:'18:00'},db)).toMatch(/已有/);expect(calendarMoveIssue(task,calendarOrigin(task),{date:'2028-02-15',start:'21:00'},db)).toMatch(/可用時間/);expect(calendarMoveIssue(task,calendarOrigin(task),{date:'2028-02-16',start:'18:00'},db)).toMatch(/休息/);expect(calendarMoveIssue(task,calendarOrigin(task),{date:task.date,start:'23:45'},db)).toMatch(/午夜/);expect(JSON.stringify(db.tasks)).toBe(original)});
});
