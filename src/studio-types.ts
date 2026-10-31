export type StudioSubject = 'maths'|'chi'|'eng';
export interface StudioUnit {subjectId:StudioSubject;topicId:string;title:string;skills:{id:string;name:string}[];lesson:string}
export interface StudyItem {id:string;family:string;skillId:string;kind:'choice'|'numeric'|'short';prompt:string;passage?:string;options?:string[];answer:string;explanation:string;hint:string;criterion:string;check?:{a:number;b:number;c:number;root:'larger'|'smaller'}}
export type PublicStudyItem=Omit<StudyItem,'answer'|'explanation'|'hint'|'criterion'|'check'>;
export interface StudyFeedback {verdict:'correct'|'partly-correct'|'incorrect'|'uncertain';score:number|null;text:string;reason:string;source:'code'|'ai'|'unavailable'}
export interface StudyAttempt {id:string;requestId:string;quizId?:string;itemId:string;family:string;subjectId:StudioSubject;topicId:string;skillId:string;at:string;answer:string;steps:string;independent:boolean;hinted:boolean;feedback:StudyFeedback;disputed:boolean;corrections:{at:string;reason:string}[]}
export interface StudySkill {id:string;name:string;subjectId:StudioSubject;topicId:string;label:string;score:number|null;count:number;independentCount:number;paused:boolean}
export interface StudyQuizView {id:string;title:string;subjectId:StudioSubject;topicId:string;createdAt:string;submittedAt?:string;purpose:'quick'|'assessment';source:'fixed'|'ai';generationAttempts:number;hintedIds:string[];answers:Record<string,{value:string;steps:string}>;questions:PublicStudyItem[];results:StudyAttempt[]}
export interface StudyReport {from:string;to:string;activeDays:number;learningEvents:number;reviewEvents:number;tasksDone:number;tasksPending:number;attempts:number;independent:number;disputed:number;skills:StudySkill[];message:string}
export interface StudioView {units:StudioUnit[];skills:StudySkill[];quizzes:StudyQuizView[];report:StudyReport}
