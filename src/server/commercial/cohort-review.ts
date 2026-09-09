import type {SupabaseClient} from '@supabase/supabase-js';
import {assessAutomotive,possibleVariantKey} from './editorial.js';
import {safePreviewUrl} from '../discovery/product-preview.js';
export async function reviewAutomotiveCohort(client:SupabaseClient) {
 const rows=[];
 for(let page=0;;page++) {
  const result=await client.from('commercial_watchlist').select('source_key,identity_key,preview,monitor').order('source_key').range(page*500,page*500+499);
  if(result.error) throw new Error('COHORT_REVIEW_UNAVAILABLE');
  rows.push(...(result.data??[]));
  if(!result.data||result.data.length<500) break;
  if(page>=99) throw new Error('COHORT_REVIEW_LIMIT');
 }
 const assessments=rows.map(row=>{
  const p=row.preview??{},assessment=assessAutomotive({title:p.title??'',description:p.description??null});
  const eligible=assessment.state==='ELIGIBLE'&&p.comparable&&p.seller_trusted&&p.currency==='BRL'
   &&typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>0&&safePreviewUrl(p.image,true)&&safePreviewUrl(p.url)
   &&p.status!=='UNAVAILABLE'&&Date.parse(p.priceCheckedAt??'')>=Date.now()-86400000&&Date.parse(p.priceCheckedAt??'')<=Date.now();
  return {source_key:row.source_key,vertical_key:'AUTOMOTIVE',identity_key:row.identity_key,family:assessment.family,
   state:assessment.state==='ELIGIBLE'&&!eligible?'REVIEW':assessment.state,reason:assessment.state==='ELIGIBLE'&&!eligible?'Preço, imagem, identidade ou vendedor precisam de nova validação.':assessment.reason,
   version:assessment.version,possible_variant_key:possibleVariantKey(p.description??null),assessed_at:new Date().toISOString(),
   preview_checked_at:p.priceCheckedAt??null,valid_until:eligible?new Date(Date.parse(p.priceCheckedAt)+86400000).toISOString():null};
 });
 for(let start=0;start<assessments.length;start+=500) {
  const saved=await client.from('commercial_editorial_assessments').upsert(assessments.slice(start,start+500),{onConflict:'vertical_key,source_key'});
  if(saved.error) throw new Error('COHORT_REVIEW_WRITE_FAILED');
 }
 return {reviewed:assessments.length};
}
