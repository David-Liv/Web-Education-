export interface RankingEntry { institution: string; edition: number; kind: 'QS World University Rankings'; lower: number; upper: number; label: string; url: string; checkedAt: string }
// Only records verified against the linked primary publisher/institution are included.
// An absent institution is unknown here, not assigned the lowest ranking.
const entries: [string,number,number,string,string][] = [
  ['HKU',11,11,'11','https://www.topuniversities.com/universities/university-hong-kong'],
  ['CUHK',18,18,'18','https://www.topuniversities.com/universities/chinese-university-hong-kong-cuhk'],
  ['HKUST',33,33,'33','https://hkust.edu.hk/boundless/article/hkust-moves-33rd-qs-world-university-rankings-2027'],
  ['PolyU',50,50,'50','https://www.topuniversities.com/universities/hong-kong-polytechnic-university'],
  ['CityU',52,52,'=52','https://www.topuniversities.com/universities/city-university-hong-kong'],
  ['HKBU',216,216,'216','https://www.topuniversities.com/universities/hong-kong-baptist-university'],
  ['EdUHK',406,406,'=406','https://www.topuniversities.com/universities/education-university-hong-kong'],
  ['LU',581,581,'=581','https://www.topuniversities.com/universities/lingnan-university-hong-kong'],
  ['HKMU',781,790,'781–790','https://www.topuniversities.com/universities/hong-kong-metropolitan-university'],
  ['HKSYU',1001,1200,'1001–1200','https://www.topuniversities.com/universities/hong-kong-shue-yan-university'],
];
export const qsRankings: RankingEntry[] = entries.map(([institution,lower,upper,label,url]) => ({institution,lower,upper,label,url,edition:2027,kind:'QS World University Rankings',checkedAt:'2026-11-03'}));
