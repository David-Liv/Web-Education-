import type {IconName} from './components';
export type NavigationItem=[string,string,IconName];
export const primaryNav:NavigationItem[]=[['/calendar','溫習日曆','calendar'],['/review','每日溫習','review'],['/overview','學習總覽','dashboard']];
export const studyNav:NavigationItem[]=[['/subjects','我的學科','book'],['/learn','AI 學習室','chat'],['/quizzes','專題測驗','quiz'],['/mistakes','錯題簿','file']];
export const exploreNav:NavigationItem[]=[['/resources','學習資源','folder'],['/goals','升學目標','graduation'],['/help','使用指南','help']];
