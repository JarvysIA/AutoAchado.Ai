import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {AUTOMOTIVE_CATEGORY_FAMILY,AUTOMOTIVE_ELIGIBLE_CATEGORY_COUNT,AUTOMOTIVE_FAMILY_LABELS,
 brandOf,duplicateKeyOf,familyForCategory,resolveCategory} from '../src/server/commercial/automotive-families.js';
import {simulateSelection,type SelectionCandidate} from '../src/server/commercial/selection-algorithm.js';
import {planRebalance,appliedToday,DIVERSITY_DAILY_LIMIT,ADVANTAGE_DAILY_LIMIT} from '../src/server/commercial/automotive-rebalance.js';
import {assessAutomotive} from '../src/server/commercial/editorial.js';
import {classifyAutomotiveCategory,isAutomaticAutomotiveDiscoveryEligible} from '../src/commerce/classification/automotive/index.js';
import {snapshotToTaxonomyTree,validateAutomotiveTaxonomySnapshot} from './helpers/automotive-taxonomy-snapshot.js';
import {AUTOMOTIVE_TOOL_CATEGORY_IDS,AUTOMOTIVE_CURATED_V3_CATEGORY_IDS} from '../src/commerce/discovery/automotive-tools.js';

const DAY=86400000,now=Date.parse('2026-11-20T12:00:00Z');
// Sixteen distinct leaves that all belong to limpeza_estetica, so the family limit can be reached
// without ever tripping the three-per-type limit.
const CLEANING=['MLB263726','MLB263727','MLB263728','MLB270872','MLB271174','MLB392346','MLB392348','MLB363814',
 'MLB429409','MLB430552','MLB430584','MLB431864','MLB433258','MLB455776','MLB429491','MLB188063'];
const TOOLS=['MLB437783','MLB437784','MLB115944','MLB115943','MLB437802','MLB271712'];

function candidate(id:string,category:string,description:string|null=null):SelectionCandidate {
 return {source_key:'PRODUCT:'+id,identity_key:id,monitor:false,protected:false,category_id:category,
  preview:{title:'Produto '+id,description,image:'https://http2.mlstatic.com/a.jpg',url:'https://www.mercadolivre.com.br/p/MLB1',
   price:80,currency:'BRL',seller_id:'1',seller_trusted:true,comparable:true,status:'CATALOG',priceCheckedAt:new Date(now).toISOString()},
  ranks:Array.from({length:10},(_,i)=>({category,position:3,observed_at:new Date(now-i*DAY).toISOString()}))};
}

describe('category family map',()=>{
 it('covers every eligible category exactly once, as a family or as EXCLUDED',()=>{
  const snapshot=validateAutomotiveTaxonomySnapshot(JSON.parse(readFileSync('tests/fixtures/meli-automotive-taxonomy.snapshot.json','utf8'))).snapshot;
  const tree=snapshotToTaxonomyTree(snapshot);
  const automatic:string[]=[];
  for(const node of (snapshot as unknown as {nodes:{externalCategoryId:string}[]}).nodes) {
   try { if(isAutomaticAutomotiveDiscoveryEligible(classifyAutomotiveCategory(node.externalCategoryId,tree))) automatic.push(node.externalCategoryId); }
   catch { /* fora da raiz automotiva */ }
  }
  const eligible=[...new Set([...automatic,...AUTOMOTIVE_TOOL_CATEGORY_IDS,...AUTOMOTIVE_CURATED_V3_CATEGORY_IDS])];
  expect(eligible).toHaveLength(AUTOMOTIVE_ELIGIBLE_CATEGORY_COUNT);
  expect(Object.keys(AUTOMOTIVE_CATEGORY_FAMILY)).toHaveLength(AUTOMOTIVE_ELIGIBLE_CATEGORY_COUNT);
  const known=new Set([...Object.keys(AUTOMOTIVE_FAMILY_LABELS),'EXCLUDED']);
  for(const id of eligible) {
   const family=AUTOMOTIVE_CATEGORY_FAMILY[id];
   expect(family,id+' sem família').toBeDefined();
   expect(known.has(family as string),id+' com família inválida').toBe(true);
  }
  // Nothing outside the eligible set leaks into the map.
  for(const id of Object.keys(AUTOMOTIVE_CATEGORY_FAMILY)) expect(eligible).toContain(id);
 });
 it('treats an unmapped category as unknown, not as a family',()=>{
  expect(familyForCategory('MLB999999')).toBeNull();
  expect(familyForCategory(null)).toBeNull();
  expect(familyForCategory('MLB22723')).toBe('aspiracao');
 });
 it('takes the deepest ranked category and falls back to the queue category',()=>{
  // MLB188063 is the Limpeza Automotiva node; MLB263726 (Ceras) sits below it.
  expect(resolveCategory(['MLB188063','MLB263726'])).toBe('MLB263726');
  expect(resolveCategory(['MLB188063'])).toBe('MLB188063');
  expect(resolveCategory(['desconhecida'],'MLB22723')).toBe('MLB22723');
  expect(resolveCategory([],null)).toBeNull();
 });
});

describe('brand and model extraction',()=>{
 it('reads the attributes separated by the middle dot, without accents or case',()=>{
  expect(brandOf('Marca: Vonixx · Modelo: V-Floc · Volume: 500ml')).toBe('vonixx');
  expect(brandOf('Cor: Preto · Marca:  Três Pontas  · Modelo: X1')).toBe('tres pontas');
  expect(duplicateKeyOf('Marca: Vonixx · Modelo: V-Floc')).toBe('vonixx:v-floc');
 });
 it('returns nothing when the attribute is absent or empty',()=>{
  expect(brandOf('Modelo: V-Floc')).toBeNull();
  expect(brandOf(null)).toBeNull();
  expect(duplicateKeyOf('Marca: Vonixx')).toBeNull();
  expect(duplicateKeyOf('Marca:  · Modelo: V-Floc')).toBeNull();
 });
});

describe('diversity limits on the target portfolio',()=>{
 it('keeps at most three of the same type',()=>{
  const r=simulateSelection(TOOLS.slice(0,1).flatMap(()=>Array.from({length:4},(_,i)=>candidate('t'+i,'MLB437783'))),now);
  expect(r.selectedCount).toBe(3);
 });
 it('keeps at most fifteen of the same family',()=>{
  const r=simulateSelection(CLEANING.map((category,i)=>candidate('c'+i,category)),now);
  expect(r.selectedCount).toBe(15);
  expect(new Set(r.selected.map(c=>c.family))).toEqual(new Set(['limpeza_estetica']));
 });
 it('keeps at most four of the same brand',()=>{
  const r=simulateSelection(CLEANING.slice(0,5).map((category,i)=>candidate('b'+i,category,'Marca: Vonixx · Modelo: M'+i)),now);
  expect(r.selectedCount).toBe(4);
 });
 it('keeps a single listing per brand and model',()=>{
  const r=simulateSelection([candidate('d1',CLEANING[0]!,'Marca: Vonixx · Modelo: V-Floc'),
   candidate('d2',CLEANING[1]!,'Marca: Vonixx · Modelo: V-Floc')],now);
  expect(r.selectedCount).toBe(1);
 });
 it('never admits an out-of-scope or unknown category',()=>{
  const r=simulateSelection([candidate('x','MLB440490'),candidate('y','MLB999999')],now);
  expect(r.selectedCount).toBe(0);
 });
});

type PlanInput=Parameters<typeof planRebalance>[0];
function scored(id:string,over:Record<string,unknown>={}) {
 return {source_key:'PRODUCT:'+id,identity_key:id,score:70,family:'limpeza_estetica',category_id:'MLB263726',
  brand:null,duplicate_key:null,eligible:true,monitor_since:new Date(now-30*DAY).toISOString(),
  demand:{days:10},...over} as unknown as PlanInput['evaluated'][number];
}
function planInput(members:PlanInput['evaluated'],reserve:PlanInput['evaluated'],over:Partial<PlanInput>={}):PlanInput {
 return {evaluated:[...members,...reserve],reserve,currentIds:new Set(members.map(m=>m.identity_key)),
  protectedIds:new Set<string>(),proposedReplacements:[],...over} as PlanInput;
}

describe('rebalance plan',()=>{
 it('removes a concentration breach without waiting for tenure or a better score',()=>{
  // Four of the same type: the fourth breaks the limit and leaves immediately.
  const members=Array.from({length:4},(_,i)=>scored('m'+i,{monitor_since:new Date(now-1*DAY).toISOString()}));
  const plan=planRebalance(planInput(members,[scored('new',{category_id:'MLB263727'})]),now);
  expect(plan.swaps).toHaveLength(1);
  expect(plan.swaps[0]).toMatchObject({reason:'DIVERSITY',detail:'TYPE_LIMIT',remove:'PRODUCT:m3',add:'PRODUCT:new'});
 });
 it('drops an out-of-scope member before a merely crowded one',()=>{
  const members=[scored('crowded0'),scored('crowded1'),scored('crowded2'),scored('crowded3'),scored('gone',{family:'EXCLUDED'})];
  const plan=planRebalance(planInput(members,[scored('a',{category_id:'MLB263727'}),scored('b',{category_id:'MLB263728'})]),now);
  expect(plan.swaps[0]!.detail).toBe('EXCLUDED_CATEGORY');
 });
 it('never removes a protected member',()=>{
  const members=Array.from({length:4},(_,i)=>scored('m'+i));
  const plan=planRebalance(planInput(members,[scored('new',{category_id:'MLB263727'})],
   {protectedIds:new Set(['m0','m1','m2','m3'])}),now);
  expect(plan.swaps).toHaveLength(0);
 });
 it('never removes without a valid replacement in the same pair',()=>{
  const members=Array.from({length:4},(_,i)=>scored('m'+i));
  const plan=planRebalance(planInput(members,[]),now);
  expect(plan.swaps).toHaveLength(0);
  expect(plan.summary.blockedWithoutReplacement).toBe(1);
 });
 it('stops at twenty diversity swaps a day, counting what already ran',()=>{
  const members=Array.from({length:40},(_,i)=>scored('m'+i,{category_id:'MLB263726'}));
  const reserve=CLEANING.slice(0,15).map((category,i)=>scored('r'+i,{category_id:category,family:'limpeza_estetica'}));
  const plan=planRebalance(planInput(members,reserve),now,{DIVERSITY:18});
  expect(plan.summary.capacityDiversity).toBe(DIVERSITY_DAILY_LIMIT-18);
  expect(plan.swaps.filter(s=>s.reason==='DIVERSITY').length).toBeLessThanOrEqual(2);
 });
 it('keeps the old score-advantage rules and its own daily ceiling',()=>{
  // Distinct types, so nothing is removed for concentration and only score advantage is left.
  const members=Array.from({length:6},(_,i)=>scored('old'+i,{category_id:CLEANING[i]!}));
  const newcomers=Array.from({length:6},(_,i)=>scored('new'+i,{score:90,category_id:CLEANING[i+6]!}));
  const proposed=newcomers.map((n,i)=>({from:'old'+i,to:'new'+i,advantage:20}));
  const plan=planRebalance(planInput(members,newcomers,{proposedReplacements:proposed}),now);
  const advantage=plan.swaps.filter(s=>s.reason==='ADVANTAGE');
  expect(advantage.length).toBe(ADVANTAGE_DAILY_LIMIT);
  expect(advantage[0]).toMatchObject({detail:'SCORE_ADVANTAGE',advantage:20});
 });
 it('counts what already ran today in São Paulo, not in UTC',()=>{
  const changes=[{reason:'DIVERSITY',changed_at:'2026-11-20T02:00:00Z'},
   {reason:'ADVANTAGE',changed_at:'2026-11-20T14:00:00Z'},
   {reason:'DIVERSITY',changed_at:'2026-11-19T10:00:00Z'}];
  // 02:00 UTC is still the 19th in São Paulo, so only two of the three count for the 20th.
  expect(appliedToday(changes,now)).toEqual({DIVERSITY:0,ADVANTAGE:1});
 });
});

describe('admission by category',()=>{
 it('admits a seat cover whose title matched no rule before',()=>{
  expect(assessAutomotive({title:'capa de banco',description:null},'MLB46692'))
   .toMatchObject({state:'ELIGIBLE',family:'acessorios_internos'});
 });
 it('refuses an out-of-scope category whatever the title says',()=>{
  expect(assessAutomotive({title:'capa de banco',description:null},'MLB4860').state).toBe('EXCLUDE');
 });
 it('sends a used or damaged item to review',()=>{
  for(const title of ['Capa de banco usado','Capa seminovo','Kit recondicionado','Item para peças','Peça com defeito','Lote retirada de peças'])
   expect(assessAutomotive({title,description:null},'MLB46692').state).toBe('REVIEW');
 });
});
