import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredMeliReader,resolveProductPreview,PreviewUpstreamError,type PreviewReader} from '../discovery/product-preview.js';
export const FASHION_PILOT_CATEGORIES=[
 {id:'MLB108704',segment:'CLOTHING'}, {id:'MLB3112',segment:'CLOTHING'}, {id:'MLB188065',segment:'CLOTHING'}, {id:'MLB31447',segment:'CLOTHING'},
 {id:'MLB23332',segment:'FOOTWEAR'}, {id:'MLB273770',segment:'FOOTWEAR'}, {id:'MLB275574',segment:'FOOTWEAR'}, {id:'MLB272202',segment:'FOOTWEAR'},
 {id:'MLB7022',segment:'ACCESSORIES'}, {id:'MLB28108',segment:'ACCESSORIES'}, {id:'MLB3127',segment:'ACCESSORIES'}, {id:'MLB190393',segment:'ACCESSORIES'},
 {id:'MLB26426',segment:'ACCESSORIES'}, {id:'MLB457383',segment:'ACCESSORIES'}, {id:'MLB1432',segment:'ACCESSORIES'}, {id:'MLB1434',segment:'ACCESSORIES'}
] as const;
// Diagnostic only: never admits products or treats model-level prices as variant prices.
export async function inspectFashionPilot(read:PreviewReader,deadline=Date.now()+200000) {
 const categories:any[]=[],products:any[]=[],seen=new Set<string>();
 for(const category of FASHION_PILOT_CATEGORIES){
  if(Date.now()>=deadline)break;
  try{
   const info=await read('/categories/'+category.id);
   if(info.id!==category.id||!info.path_from_root?.some((x:any)=>['MLB1430','MLB3937'].includes(x.id)))throw new Error('INVALID_ANCESTRY');
   const rank=await read('/highlights/MLB/category/'+category.id);
   const entries=(Array.isArray(rank.content)?rank.content:[]).filter((x:any)=>['PRODUCT','ITEM','USER_PRODUCT'].includes(x.type)&&/^MLBU?\d+$/.test(x.id)&&Number.isInteger(x.position)&&x.position>=1&&x.position<=20);
   categories.push({...category,name:info.name,status:200,ranked:entries.length,types:Object.fromEntries(['PRODUCT','ITEM','USER_PRODUCT'].map(t=>[t,entries.filter((e:any)=>e.type===t).length]))});
   await Promise.all(entries.slice(0,3).map(async(entry:any)=>{
    const key=entry.type+':'+entry.id;if(seen.has(key)||Date.now()>=deadline)return;seen.add(key);
    const documents:any[]=[],errors:any[]=[];
    const preview=await resolveProductPreview(entry.id,entry.type,async path=>{try{const d=await read(path);if(/^\/(products|items|user-products)\/[A-Z0-9]+$/.test(path))documents.push(d);return d;}catch(e){errors.push({path,status:e instanceof PreviewUpstreamError?e.status:0});throw e;}});
    const meta=documents.map(d=>({id:d.id,status:d.status,category_id:d.category_id,children:d.children_ids??[],attributes:(d.attributes??[]).filter((a:any)=>['GENDER','BRAND','MODEL','SIZE','COLOR','FOOTWEAR_SIZE','SIZE_COVERAGE'].includes(a.id)),variationCount:Array.isArray(d.variations)?d.variations.length:null,variations:(d.variations??[]).slice(0,4).map((v:any)=>({id:v.id,price:v.price,available_quantity:v.available_quantity,attributes:v.attribute_combinations}))}));
    products.push({id:entry.id,type:entry.type,position:entry.position,category:category.id,segment:category.segment,preview,meta,errors});
   }));
  }catch(e){categories.push({...category,status:e instanceof PreviewUpstreamError?e.status:0});}
 }
 return {scope:'READ_ONLY_FASHION_PILOT',checkedAt:new Date().toISOString(),activation:false,targets:{CLOTHING:35,FOOTWEAR:35,ACCESSORIES:30},categories,products,deadlineReached:Date.now()>=deadline};
}
export async function inspectConfiguredFashionPilot(client:SupabaseClient){return inspectFashionPilot(await configuredMeliReader(client));}
