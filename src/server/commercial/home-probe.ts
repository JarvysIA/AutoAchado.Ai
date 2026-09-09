import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredMeliReader,resolveProductPreview,safePreviewUrl,PreviewUpstreamError,type PreviewReader} from '../discovery/product-preview.js';
// Read-only feasibility sample. Never seeds watches, queues, mappings or price history.
export async function probeHome(read:PreviewReader,deadline=Date.now()+150000) {
 const categories:{id:string;name:string;children:{id:string;name:string}[];status:number}[]=[];
 const rankings:{category:string;status:number;count:number}[]=[];
 const products:{id:string;category:string;title:string;complete:boolean;comparable:boolean;trusted:boolean;price:number|null;status:string}[]=[];
 const pending=['MLB1574'],seen=new Set<string>(),productIds=new Set<string>();
 while(pending.length&&categories.length<20&&Date.now()<deadline) {
  const id=pending.shift()!;if(seen.has(id)) continue;seen.add(id);
  try {
   const data=await read('/categories/'+id);
   const children=(Array.isArray(data.children_categories)?data.children_categories:[])
    .filter(c=>typeof c.id==='string'&&/^MLB\d+$/.test(c.id)&&typeof c.name==='string')
    .map(c=>({id:c.id as string,name:c.name as string}));
   categories.push({id,name:String(data.name??id),children,status:200});
   for(const c of children) if(/cozinha|utens[ií]lio|organiza|limpeza|lavanderia|banheiro|conserva|armazen|potes|gaveta/i.test(c.name)) pending.push(c.id);
   // No root ranking: broad furniture/decor candidates are outside the proposed pilot.
   if(id==='MLB1574') continue;
   try {
    const ranking=await read('/highlights/MLB/category/'+id);
    const entries=Array.isArray(ranking.content)?ranking.content:[];
    rankings.push({category:id,status:200,count:entries.length});
    for(const entry of entries) {
     if(products.length>=30||Date.now()>=deadline) break;
     if(entry.type!=='PRODUCT'||typeof entry.id!=='string'||!/^MLB\d+$/.test(entry.id)||productIds.has(entry.id)) continue;
     productIds.add(entry.id);
     try {
      const p=await resolveProductPreview(entry.id,'PRODUCT',read);
      const complete=!!p.title.trim()&&!/^MLB\d+$/.test(p.title)&&!!safePreviewUrl(p.image,true)&&!!safePreviewUrl(p.url)
       &&p.currency==='BRL'&&typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>0&&p.status!=='UNAVAILABLE';
      products.push({id:entry.id,category:id,title:p.title,complete,comparable:p.comparable===true,trusted:p.seller_trusted===true,price:p.price,status:p.status});
     } catch {products.push({id:entry.id,category:id,title:entry.id,complete:false,comparable:false,trusted:false,price:null,status:'FAILED'});}
     if(products.filter(p=>p.category===id).length>=3) break;
    }
   } catch(error) {rankings.push({category:id,status:error instanceof PreviewUpstreamError?error.status:0,count:0});}
  } catch(error) {categories.push({id,name:id,children:[],status:error instanceof PreviewUpstreamError?error.status:0});}
 }
 return {checkedAt:new Date().toISOString(),activation:false,scope:'BOUNDED_READ_ONLY_SAMPLE',categories,rankings,products,
  resolved:products.filter(p=>p.complete&&p.comparable&&p.trusted).length,
  hundredCandidatesProven:false,remainingCategories:pending.length};
}
export async function probeHomeAccess(client:SupabaseClient) {return probeHome(await configuredMeliReader(client));}

export async function inspectKnownVariants(client:SupabaseClient) {
 const read=await configuredMeliReader(client),results=[];
 for(const id of ['MLB6339793','MLB6339794']) {
  try {
   const data=await read('/products/'+id);
   results.push({id,status:200,attributes:(Array.isArray(data.attributes)?data.attributes:[])
    .filter(a=>typeof a.id==='string'&&/BRAND|MODEL|VOLTAGE|CAPACITY|UNITS|GTIN/.test(a.id))
    .map(a=>({id:a.id,value:typeof a.value_name==='string'?a.value_name.slice(0,200):null}))});
  } catch(error) {results.push({id,status:error instanceof PreviewUpstreamError?error.status:0,attributes:[]});}
 }
 return {results,identitiesMerged:false};
}
