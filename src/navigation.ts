import type {IconName} from './components';
export type NavigationItem=[string,string,IconName];
// Grouped by the student's job, at most four items per group.
export const primaryNav:NavigationItem[]=[['/overview','學習總覽','dashboard'],['/review','每日溫習','review'],['/calendar','溫習日曆','calendar']];
export const studyNav:NavigationItem[]=[['/subjects','我的學科','book'],['/quizzes','專題測驗','quiz'],['/mistakes','錯題簿','file']];
export const askNav:NavigationItem[]=[['/learn','AI 學習室','chat'],['/forum','同學討論區','forum']];
export const exploreNav:NavigationItem[]=[['/resources','學習資源','folder'],['/goals','升學目標','graduation']];
export const toolNav:NavigationItem[]=[['/help','使用指南','help']];
