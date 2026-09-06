import type {DiscoveryEligibleCategory} from '../../commerce/discovery/types.js';
export interface CategoryProgress {category_id:string;last_attempt_at:string;next_attempt_at:string;failures:number}
export function dueCategories(categories:readonly DiscoveryEligibleCategory[],progress:CategoryProgress[],now=Date.now()) {
 const byId=new Map(progress.map(p=>[p.category_id,p]));
 return categories.filter(c=>!byId.has(c.marketplaceCategoryId) || Date.parse(byId.get(c.marketplaceCategoryId)!.next_attempt_at)<=now)
  .sort((a,b)=>(Date.parse(byId.get(a.marketplaceCategoryId)?.last_attempt_at??'')||0)-(Date.parse(byId.get(b.marketplaceCategoryId)?.last_attempt_at??'')||0));
}
export function categoryRetry(status:string,httpStatus:number|null,failures:number,now=Date.now()) {
 const hours=status==='SUCCESS'||status==='EMPTY' ? 20 : httpStatus===404 ? 7*24 : httpStatus===403 ? 24 : Math.min(24,2**Math.min(failures,5));
 return new Date(now+hours*3600000).toISOString();
}
