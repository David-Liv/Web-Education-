import type {StudyFeedback} from './studio-types.ts';
import type {TutorBinding} from './tutors.ts';
export interface LearningSource {kind:'chat'|'lesson'|'pack';chatId?:string;messageId?:string;documentId?:string;quizId?:string;number?:number;version:number;ordinal:number;tutor?:TutorBinding}
export interface LearningQuestion {id:string;skillId:string;question:string;source:LearningSource;hintAvailable:boolean;answerAvailable:boolean}
export interface LearningReview {id:string;skillId:string;dueDate:string;lastLearned:string;completedAt?:string;sourceIds:string[];minutes:number}
export interface Appeal {status:'pending'|'corrected'|'upheld'|'uncertain';at:string;reason:string;previous:StudyFeedback;feedback?:StudyFeedback}
export interface LearningView {items:LearningQuestion[];reviews:LearningReview[]}
