import {diversityViolation,type ScoredCandidate,type SelectionResult} from './selection-algorithm.js';

// Concentration is corrected without waiting for a better score: a member that breaks a diversity
// rule leaves as soon as there is a valid replacement. Score advantage keeps the old, slower rules.
export const DIVERSITY_DAILY_LIMIT=20;
export const ADVANTAGE_DAILY_LIMIT=5;
export const READD_BLOCK_DAYS=30;
// Most serious first: a product that should never have entered leaves before a merely crowded one.
const SEVERITY=['UNKNOWN_CATEGORY','EXCLUDED_CATEGORY','INELIGIBLE','DUPLICATE','BRAND_LIMIT','TYPE_LIMIT','FAMILY_LIMIT'];

export type RebalanceReason='DIVERSITY'|'ADVANTAGE'|'FILL';
export interface RebalanceSwap {remove:string|null;add:string;identity_remove:string|null;identity_add:string;reason:RebalanceReason;detail:string;advantage?:number}
export interface RebalancePlan {
 swaps:RebalanceSwap[];
 summary:{diversity:number;advantage:number;fill:number;violations:Record<string,number>;
  blockedWithoutReplacement:number;vacancies:number;capacityDiversity:number;capacityAdvantage:number};
}
/** Members kept out of removal, and products that left recently and must not come straight back. */
export interface RebalanceGuards {removalBlockedIds?:ReadonlySet<string>;recentlyRemoved?:ReadonlySet<string>}
export type PlanInput=SelectionResult&{removalBlockedIds?:ReadonlySet<string>};

function emptyCounts() {
 return {types:new Map<string,number>(),families:new Map<string,number>(),brands:new Map<string,number>(),duplicates:new Set<string>()};
}
function count(c:ScoredCandidate,counts:ReturnType<typeof emptyCounts>) {
 if(c.category_id!==null) counts.types.set(c.category_id,(counts.types.get(c.category_id)??0)+1);
 if(c.family!==null&&c.family!=='EXCLUDED') counts.families.set(c.family,(counts.families.get(c.family)??0)+1);
 if(c.brand!==null) counts.brands.set(c.brand,(counts.brands.get(c.brand)??0)+1);
 if(c.duplicate_key!==null) counts.duplicates.add(c.duplicate_key);
}
function uncount(c:ScoredCandidate,counts:ReturnType<typeof emptyCounts>) {
 if(c.category_id!==null) counts.types.set(c.category_id,Math.max(0,(counts.types.get(c.category_id)??0)-1));
 if(c.family!==null&&c.family!=='EXCLUDED') counts.families.set(c.family,Math.max(0,(counts.families.get(c.family)??0)-1));
 if(c.brand!==null) counts.brands.set(c.brand,Math.max(0,(counts.brands.get(c.brand)??0)-1));
 if(c.duplicate_key!==null) counts.duplicates.delete(c.duplicate_key);
}

/**
 * Rebuilds the current portfolio greedily to find who no longer fits, pairs each departure with a
 * replacement that does, then fills whatever capacity is still empty. A member is never removed
 * without a valid addition in the same pair, and a product that just left cannot come back.
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

 const counts=emptyCounts();
 for(const c of kept) count(c,counts);
 const violations:{member:ScoredCandidate;violation:string}[]=[];
 for(const c of removable) {
  const violation=!c.eligible&&diversityViolation(c,counts)===null?'INELIGIBLE':diversityViolation(c,counts);
  if(violation!==null){violations.push({member:c,violation});continue;}
  count(c,counts);
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

 for(const {member,violation} of violations) {
  tally[violation]=(tally[violation]??0)+1;
  if(diversity>=capacityDiversity) continue;
  uncount(member,counts);
  const replacement=pool.find(a=>!used.has(a.identity_key)&&diversityViolation(a,counts)===null);
  if(!replacement){count(member,counts);blockedWithoutReplacement++;continue;}
  count(replacement,counts);used.add(replacement.identity_key);used.add(member.identity_key);diversity++;
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
  used.add(victim.identity_key);used.add(newcomer.identity_key);advantage++;
  swaps.push({remove:victim.source_key,add:newcomer.source_key,identity_remove:victim.identity_key,
   identity_add:newcomer.identity_key,reason:'ADVANTAGE',detail:'SCORE_ADVANTAGE',advantage:proposed.advantage});
 }

 // Empty seats are filled outright: there is nobody to remove, so there is no daily ceiling either.
 const vacancies=Math.max(0,result.capacity-result.currentIds.size);
 let fill=0;
 for(const addition of pool) {
  if(fill>=vacancies) break;
  if(used.has(addition.identity_key)||diversityViolation(addition,counts)!==null) continue;
  count(addition,counts);used.add(addition.identity_key);fill++;
  swaps.push({remove:null,add:addition.source_key,identity_remove:null,
   identity_add:addition.identity_key,reason:'FILL',detail:'VACANCY'});
 }

 return {swaps,summary:{diversity,advantage,fill,violations:tally,blockedWithoutReplacement,
  vacancies,capacityDiversity,capacityAdvantage}};
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
