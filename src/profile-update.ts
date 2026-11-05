import type {Profile} from './types.ts';
const editable=['name','year','teachingLanguage','subjects','mathModule','chemistryElectives','grades','targetGrades','gradeSource','primaryProgramme','backupProgrammes','dailyMinutes','availability','reviewPercent'] as const;
// Server-owned date/demo/rest-day fields must not travel with the settings form.
export function profileUpdate(profile:Profile){return Object.fromEntries(editable.map(k=>[k,profile[k]])) as Pick<Profile,typeof editable[number]>}
