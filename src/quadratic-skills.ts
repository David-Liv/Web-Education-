export const quadraticSkills = [
 {id:'quadratic-standard',name:'標準式、係數與正負號',prerequisites:[],lesson:'先把方程整理成 ax²+bx+c=0，且 a≠0。移項後才讀取係數；負號屬於係數的一部分。'},
 {id:'quadratic-factor',name:'因式分解與求根',prerequisites:['quadratic-standard'],lesson:'把乘積等於零轉成各因子等於零。找出全部根，再按題目的較大、較小或情境條件選擇。'},
 {id:'quadratic-formula',name:'求根公式與核對',prerequisites:['quadratic-standard'],lesson:'使用 x=(-b±√(b²−4ac))/(2a)，保留負號及括號。代入原方程核對，根的大小不由 ± 的書寫次序決定。'},
 {id:'quadratic-discriminant',name:'判別式與實根數目',prerequisites:['quadratic-standard'],lesson:'D=b²−4ac。D>0 有兩個相異實根，D=0 有二重實根，D<0 沒有實根；這不等於判斷根是否整數。'},
 {id:'quadratic-parameter',name:'含參數的實根條件',prerequisites:['quadratic-discriminant'],lesson:'先檢查二次項係數不為零，再按題意使用 D>0、D=0 或 D≥0，解出參數條件。'},
 {id:'quadratic-model',name:'應用建模與情境限制',prerequisites:['quadratic-factor'],lesson:'先定義未知量及建立方程，再求根。長度須為正；時間和題目範圍也要檢查。只有結果不足以判斷建模方法。'},
] as const;
export const quadraticSkill=(id:string)=>quadraticSkills.find(s=>s.id===id);
