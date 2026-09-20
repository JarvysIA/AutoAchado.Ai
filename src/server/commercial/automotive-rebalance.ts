import {count,diversityViolation,emptyCounts,uncount,BRAND_LIMIT,FAMILY_LIMIT,TYPE_LIMIT,DUPLICATE_LIMIT,
 type DiversityCounts,type ScoredCandidate,type SelectionResult} from './selection-algorithm.js';

// Concentration is corrected without waiting for a better score: a member that breaks a diversity
// rule leaves as soon as there is a valid replacement. Score advantage keeps the old, slower rules.
export const DIVERSITY_DAILY_LIMIT=20;
export const ADVANTAGE_DAILY_LIMIT=5;
export const READD_BLOCK_DAYS=30;
// Most serious first: a product that should never have entered leaves before a merely crowded one.
const SEVERITY=['UNKNOWN_CATEGORY','EXCLUDED_CATEGORY','INELIGIBLE','DUPLICATE','BRAND_LIMIT','TYPE_LIMIT','FAMILY_LIMIT'];
// A departure must not be replaced by more of whatever made it leave.
const SAME_GROUP:Record<string,(member:ScoredCandidate,addition:ScoredCandidate)=>boolean>={
 BRAND_LIMIT:(m,a)=>a.brand!==null&&a.brand===m.brand,
 TYPE_LIMIT:(m,a)=>a.category_id!==null&&a.category_id===m.category_id,
 FAMILY_LIMIT:(m,a)=>a.family!==null&&a.family===m.family,
 DUPLICATE:(m,a)=>a.duplicate_key!==null&&a.duplicate_key===m.duplicate_key,
};

export type RebalanceReason='DIVERSITY'|'ADVANTAGE'|'FILL';
export interface RebalanceSwap {remove:string|null;add:string;identity_remove:string|null;identity_add:string;reason:RebalanceReason;detail:string;advantage?:number}
export interface RebalancePlan {
 swaps:RebalanceSwap[];
 summary:{diversity:number;advantage:number;fill:number;violations:Record<string,number>;
  blockedWithoutReplacement:number;vacancies:number;capacityDiversity:number;capacityAdvantage:number;
  after:{maxType:number;maxFamily:number;maxBrand:number;maxDuplicate:number}};
}
/** Members kept out of removal, and products that left recently and must not come straight back. */
export interface RebalanceGuards {removalBlockedIds?:ReadonlySet<string>;recentlyRemoved?:ReadonlySet<string>}
export type PlanInput=SelectionResult&{removalBlockedIds?:ReadonlySet<string>};

const peak=(map:Map<string,number>)=>[...map.values()].reduce((top,value)=>Math.max(top,value),0);
const snapshot=(counts:DiversityCounts)=>({types:new Map(counts.types),families:new Map(counts.families),
 brands:new Map(counts.brands),duplicates:new Map(counts.duplicates)});

/**
 * The plan may only ever reduce concentration: a key that was over its limit has to shed one slot
 * for each member of that key removed, and a key that fitted must never come to exceed. A key that
 * merely grows inside its limit is the normal result of a swap. A violation here means the plan
 * would make the portfolio worse, which is exactly the bug this guard exists to catch.
 */
function assertOnlyImproves(before:DiversityCounts,after:DiversityCounts,removed:DiversityCounts):void {
 const dimensions:[keyof DiversityCounts,number][]=[['types',TYPE_LIMIT],['families',FAMILY_LIMIT],
  ['brands',BRAND_LIMIT],['duplicates',DUPLICATE_LIMIT]];
 for(const [dimension,limit] of dimensions) {
  const keys=new Set([...before[dimension].keys(),...after[dimension].keys()]);
  for(const key of keys) {
   const was=before[dimension].get(key)??0,is=after[dimension].get(key)??0;
   const left=removed[dimension].get(key)??0;
   if(was>limit&&is>was-left) throw new Error('REBALANCE_INVARIANT_VIOLATED');
   if(was<=limit&&is>limit) throw new Error('REBALANCE_INVARIANT_VIOLATED');
  }
 }
}

/**
 * Rebuilds the current portfolio greedily to find who no longer fits, pairs each departure with a
 * replacement that fits the portfolio as it will be after the swap, then fills whatever capacity is
 * still empty. A member is never removed without a valid addition in the same pair.
 */
export function planRebalance(result:PlanInput,now=Date.now(),appliedToday:{DIVERSITY?:number;ADVANTAGE?:number}={},guards:RebalanceGuards={}):RebalancePlan {
 const capacityDiversity=Math.max(0,DIVERSITY_DAILY_LIMIT-(appliedToday.DIVERSITY??0));
 const capacityAdvantage=Math.max(0,ADVANTAGE_DAILY_LIMIT-(appliedToday.ADVANTAGE??0));
 const byIdentity=new Map(result.evaluated.map(c=>[c.identity_key,c]));
 // Interest, sharing and anything already sent are all off limits, exactly like the old promotion.
 const blocked=guards.removalBlockedIds??result.removalBlockedIds??result.protectedIds;
 const recentlyRemoved=guards.recentlyRemoved??new Set<string>();
 const current=[...result.currentIds].map(id=>byIdentity.get(id)).filter((c):c is ScoredCandidate=>c!==undefined);
 const kept=current.filter(c=>blocked.has(c.identity_key));
 const removable=current.filter(c=>!blocked.has(c.identity_key)).sort((a,b)=>b.score-a.score||a.identity_key.localeCompare(b.identity_key));

 // Live state of the real portfolio, including the members that break a rule. Validating an
 // addition against the fitting members alone is what let excess brands replace themselves.
 const portfolio=emptyCounts();
 for(const c of current) count(c,portfolio);
 const before=snapshot(portfolio);
 const removedCounts=emptyCounts();

 // A separate greedy pass decides who no longer fits, without touching the live state.
 const fitting=emptyCounts();
 for(const c of kept) count(c,fitting);
 const violations:{member:ScoredCandidate;violation:string}[]=[];
 for(const c of removable) {
  const violation=!c.eligible&&diversityViolation(c,fitting)===null?'INELIGIBLE':diversityViolation(c,fitting);
  if(violation!==null){violations.push({member:c,violation});continue;}
  count(c,fitting);
 }
 violations.sort((a,b)=>SEVERITY.indexOf(a.violation)-SEVERITY.indexOf(b.violation)
  ||a.member.score-b.member.score||a.member.identity_key.localeCompare(b.member.identity_key));

 // Target order first, then the rest of the eligible reserve.
 const pool:ScoredCandidate[]=[];
 const seen=new Set<string>();
 for(const c of [...result.selected,...result.reserve]) {
  if(result.currentIds.has(c.identity_key)||seen.has(c.identity_key)) continue;
  if(recentlyRemoved.has(c.source_key)||recentlyRemoved.has(c.identity_key)) continue;
  seen.add(c.identity_key);pool.push(c);
 }

 const used=new Set<string>();
 const swaps:RebalanceSwap[]=[];
 const tally:Record<string,number>={};
 let blockedWithoutReplacement=0,diversity=0;
 const admissible=(addition:ScoredCandidate)=>
  !used.has(addition.identity_key)&&!result.currentIds.has(addition.identity_key)
  &&diversityViolation(addition,portfolio)===null;

 for(const {member,violation} of violations) {
  tally[violation]=(tally[violation]??0)+1;
  if(diversity>=capacityDiversity) continue;
  uncount(member,portfolio);
  const sameGroup=SAME_GROUP[violation];
  const replacement=pool.find(a=>admissible(a)&&!(sameGroup?.(member,a)??false));
  if(!replacement){count(member,portfolio);blockedWithoutReplacement++;continue;}
  count(replacement,portfolio);count(member,removedCounts);
  used.add(replacement.identity_key);used.add(member.identity_key);diversity++;
  swaps.push({remove:member.source_key,add:replacement.source_key,identity_remove:member.identity_key,
   identity_add:replacement.identity_key,reason:'DIVERSITY',detail:violation});
 }

 // Score advantage keeps the conservative rules: +10 points, 7 days in the portfolio, 7 days of demand.
 let advantage=0;
 for(const proposed of result.proposedReplacements) {
  if(advantage>=capacityAdvantage) break;
  const victim=byIdentity.get(proposed.from),newcomer=byIdentity.get(proposed.to);
  if(!victim||!newcomer||used.has(victim.identity_key)||used.has(newcomer.identity_key)) continue;
  if(blocked.has(victim.identity_key)) continue;
  if(recentlyRemoved.has(newcomer.source_key)||recentlyRemoved.has(newcomer.identity_key)) continue;
  uncount(victim,portfolio);
  if(!admissible(newcomer)){count(victim,portfolio);continue;}
  count(newcomer,portfolio);count(victim,removedCounts);
  used.add(victim.identity_key);used.add(newcomer.identity_key);advantage++;
  swaps.push({remove:victim.source_key,add:newcomer.source_key,identity_remove:victim.identity_key,
   identity_add:newcomer.identity_key,reason:'ADVANTAGE',detail:'SCORE_ADVANTAGE',advantage:proposed.advantage});
 }

 // Empty seats are filled outright: there is nobody to remove, so there is no daily ceiling either.
 const vacancies=Math.max(0,result.capacity-result.currentIds.size);
 let fill=0;
 for(const addition of pool) {
  if(fill>=vacancies) break;
  if(!admissible(addition)) continue;
  count(addition,portfolio);used.add(addition.identity_key);fill++;
  swaps.push({remove:null,add:addition.source_key,identity_remove:null,
   identity_add:addition.identity_key,reason:'FILL',detail:'VACANCY'});
 }

 assertOnlyImproves(before,portfolio,removedCounts);
 return {swaps,summary:{diversity,advantage,fill,violations:tally,blockedWithoutReplacement,
  vacancies,capacityDiversity,capacityAdvantage,
  after:{maxType:peak(portfolio.types),maxFamily:peak(portfolio.families),
   maxBrand:peak(portfolio.brands),maxDuplicate:peak(portfolio.duplicates)}}};
}

/** Swaps already applied today, counted in São Paulo days like the database guard does. */
export function appliedToday(changes:readonly {reason:string;changed_at:string}[],now=Date.now()):{DIVERSITY:number;ADVANTAGE:number} {
 const today=saoPauloDay(now);
 const totals={DIVERSITY:0,ADVANTAGE:0};
 for(const change of changes) {
  const time=Date.parse(change.changed_at);
  if(!Number.isFinite(time)||saoPauloDay(time)!==today) continue;
  if(change.reason==='DIVERSITY') totals.DIVERSITY++;
  else if(change.reason==='ADVANTAGE') totals.ADVANTAGE++;
 }
 return totals;
}
export function recentlyRemoved(changes:readonly {removed_source?:string|null;changed_at:string}[],now=Date.now()):Set<string> {
 const cutoff=now-READD_BLOCK_DAYS*86400000;
 const blocked=new Set<string>();
 for(const change of changes) {
  const time=Date.parse(change.changed_at);
  if(Number.isFinite(time)&&time>=cutoff&&change.removed_source) blocked.add(change.removed_source);
 }
 return blocked;
}
export function saoPauloDay(time:number):string {
 return new Date(time-3*3600000).toISOString().slice(0,10);
}
