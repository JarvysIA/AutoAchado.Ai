// Display diversity does not change commercial approval or the underlying score.
export function diverseHomeOrder<T extends {identity_key:string;selection:{score:number;diversity_key:string};rank:{state:string}}>(entries:T[]):T[] {
 const pending=[...entries],result:T[]=[];
 const counts=new Map<string,number>();
 while(pending.length) {
  pending.sort((a,b)=>Number(b.rank.state==='APPROVED')-Number(a.rank.state==='APPROVED')
   ||(b.selection.score-12*(counts.get(b.selection.diversity_key)??0))-(a.selection.score-12*(counts.get(a.selection.diversity_key)??0))
   ||a.identity_key.localeCompare(b.identity_key));
  const next=pending.shift()!;result.push(next);
  counts.set(next.selection.diversity_key,(counts.get(next.selection.diversity_key)??0)+1);
 }
 return result;
}
