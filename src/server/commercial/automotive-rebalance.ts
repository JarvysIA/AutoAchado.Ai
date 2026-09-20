import {diversityViolation,type ScoredCandidate,type SelectionResult} from './selection-algorithm.js';

// Concentration is corrected without waiting for a better score: a member that breaks a diversity
// rule leaves as soon as there is a valid replacement. Score advantage keeps the old, slower rules.
export const DIVERSITY_DAILY_LIMIT=20;
export const ADVANTAGE_DAILY_LIMIT=5;
// Most serious first: a product that should never have entered leaves before a merely crowded one.
const SEVERITY=['UNKNOWN_CATEGORY','EXCLUDED_CATEGORY','INELIGIBLE','DUPLICATE','BRAND_LIMIT','TYPE_LIMIT','FAMILY_LIMIT'];

export type RebalanceReason='DIVERSITY'|'ADVANTAGE';
export interface RebalanceSwap {remove:string;add:string;identity_remove:string;identity_add:string;reason:RebalanceReason;detail:string;advantage?:number}
export interface RebalancePlan {
 swaps:RebalanceSwap[];
 summary:{diversity:number;advantage:number;violations:Record<string,number>;
  blockedWithoutReplacement:number;capacityDiversity:number;capacityAdvantage:number};
}

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
 * Rebuilds the current portfolio greedily to find who no longer fits, then pairs each departure
 * with a replacement that does. A member is never removed without a valid addition in the same pair.
 */
export function planRebalance(result:SelectionResult,now=Date.now(),appliedToday:{DIVERSITY?:number;ADVANTAGE?:number}={}):RebalancePlan {
 const capacityDiversity=Math.max(0,DIVERSITY_DAILY_LIMIT-(appliedToday.DIVERSITY??0));
 const capacityAdvantage=Math.max(0,ADVANTAGE_DAILY_LIMIT-(appliedToday.ADVANTAGE??0));
 const byIdentity=new Map(result.evaluated.map(c=>[c.identity_key,c]));
 const current=[...result.currentIds].map(id=>byIdentity.get(id)).filter((c):c is ScoredCandidate=>c!==undefined);
 const keptProtected=current.filter(c=>result.protectedIds.has(c.identity_key));
 const removable=current.filter(c=>!result.protectedIds.has(c.identity_key)).sort((a,b)=>b.score-a.score||a.identity_key.localeCompare(b.identity_key));

 const counts=emptyCounts();
 for(const c of keptProtected) count(c,counts);
 const violations:{member:ScoredCandidate;violation:string}[]=[];
 for(const c of removable) {
  const violation=!c.eligible&&diversityViolation(c,counts)===null?'INELIGIBLE':diversityViolation(c,counts);
  if(violation!==null){violations.push({member:c,violation});continue;}
  count(c,counts);
 }
 violations.sort((a,b)=>SEVERITY.indexOf(a.violation)-SEVERITY.indexOf(b.violation)
  ||a.member.score-b.member.score||a.member.identity_key.localeCompare(b.member.identity_key));

 const used=new Set<string>();
 const additions=result.reserve.filter(c=>!result.currentIds.has(c.identity_key)).sort((a,b)=>b.score-a.score||a.identity_key.localeCompare(b.identity_key));
 const swaps:RebalanceSwap[]=[];
 const tally:Record<string,number>={};
 let blockedWithoutReplacement=0;

 for(const {member,violation} of violations) {
  tally[violation]=(tally[violation]??0)+1;
  if(swaps.length>=capacityDiversity) continue;
  uncount(member,counts);
  const replacement=additions.find(a=>!used.has(a.identity_key)&&diversityViolation(a,counts)===null);
  if(!replacement){count(member,counts);blockedWithoutReplacement++;continue;}
  count(replacement,counts);used.add(replacement.identity_key);used.add(member.identity_key);
  swaps.push({remove:member.source_key,add:replacement.source_key,identity_remove:member.identity_key,
   identity_add:replacement.identity_key,reason:'DIVERSITY',detail:violation});
 }

 // Score advantage keeps the conservative rules: +10 points, 7 days in the portfolio, 7 days of demand.
 let advantage=0;
 for(const proposed of result.proposedReplacements) {
  if(advantage>=capacityAdvantage) break;
  const victim=byIdentity.get(proposed.from),newcomer=byIdentity.get(proposed.to);
  if(!victim||!newcomer||used.has(victim.identity_key)||used.has(newcomer.identity_key)) continue;
  if(result.protectedIds.has(victim.identity_key)) continue;
  used.add(victim.identity_key);used.add(newcomer.identity_key);advantage++;
  swaps.push({remove:victim.source_key,add:newcomer.source_key,identity_remove:victim.identity_key,
   identity_add:newcomer.identity_key,reason:'ADVANTAGE',detail:'SCORE_ADVANTAGE',advantage:proposed.advantage});
 }

 return {swaps,summary:{diversity:swaps.filter(s=>s.reason==='DIVERSITY').length,advantage,
  violations:tally,blockedWithoutReplacement,capacityDiversity,capacityAdvantage}};
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
export function saoPauloDay(time:number):string {
 return new Date(time-3*3600000).toISOString().slice(0,10);
}
