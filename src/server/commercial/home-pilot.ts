import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredMeliReader,resolveProductPreview,safePreviewUrl,PreviewUpstreamError,type PreviewReader} from '../discovery/product-preview.js';
import {HOME_CATEGORIES,HOME_PILOT} from './home-config.js';

// A bounded, read-only validation before allocating any live monitoring slots.
export async function inspectHomePilot(read:PreviewReader,deadline=Date.now()+210000) {
 const categories:any[]=[], products:any[]=[], seen=new Set<string>();
 for(const category of HOME_CATEGORIES) {
  if(Date.now()>=deadline) break;
  try {
   const data=await read('/categories/'+category.id);
   if(data.id!==category.id || !Array.isArray(data.path_from_root) || !data.path_from_root.some((p:any)=>p.id===HOME_PILOT.root)) {
    categories.push({...category,status:'INVALID_ANCESTRY'});continue;
   }
   const ranking=await read('/highlights/MLB/category/'+category.id);
   const entries=(Array.isArray(ranking.content)?ranking.content:[]).filter((e:any)=>e.type==='PRODUCT'&&/^MLB\d+$/.test(e.id)&&Number.isInteger(e.position)&&e.position>=1&&e.position<=20).sort((a:any,b:any)=>a.position-b.position);
   categories.push({...category,name:data.name,status:200,ranked:entries.length});
   let inspected=0;
   for(const entry of entries) {
    if(inspected>=6 || Date.now()>=deadline) break;
    if(seen.has(entry.id)) continue;
    seen.add(entry.id);inspected++;
    const p=await resolveProductPreview(entry.id,'PRODUCT',read);
    const complete=!!p.title&&p.title!==entry.id&&!!safePreviewUrl(p.image,true)&&!!safePreviewUrl(p.url)&&p.currency==='BRL'&&typeof p.price==='number'&&p.price>0&&p.status!=='UNAVAILABLE';
    const specialized=/chuveiro|torneira|cuba\b|colch[aã]o|sof[aá]|guarda.?roupa|el[eé]tric|\b\d{3}\s*v\b|industrial/i.test(p.title);
    products.push({id:entry.id,category:category.id,family:category.family,position:entry.position,title:p.title,
     price:p.price,checkedAt:p.priceCheckedAt,complete,comparable:p.comparable===true,trusted:p.seller_trusted===true,
     priceLinkVerified:p.priceLinkVerified===true,editorial:specialized?'REVIEW':'CANDIDATE',
     eligibleForPilot:complete&&p.comparable===true&&p.seller_trusted===true&&!specialized});
   }
  } catch(error) {categories.push({...category,status:error instanceof PreviewUpstreamError?error.status:0});}
 }
 const qualified=products.filter(p=>p.eligibleForPilot);
 const families=Object.fromEntries([...new Set(HOME_CATEGORIES.map(c=>c.family))].map(f=>[f,qualified.filter(p=>p.family===f).length]));
 const diverseCapacity=Object.values(families).reduce((sum,n)=>sum+Math.min(n,HOME_PILOT.familyLimit),0);
 return {checkedAt:new Date().toISOString(),config:HOME_PILOT,activation:false,scope:'READ_ONLY_PILOT',categories,products,families,
  qualified:qualified.length,diverseCapacity,hundredCandidatesProven:diverseCapacity>=HOME_PILOT.capacity,
  historyMature:false,deadlineReached:Date.now()>=deadline};
}
export async function inspectConfiguredHomePilot(client:SupabaseClient) {return inspectHomePilot(await configuredMeliReader(client));}
