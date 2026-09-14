import type {ProductPreview} from '../discovery/product-preview.js';
export const FASHION_WOMEN_QUOTAS={CLOTHING:35,FOOTWEAR:35,ACCESSORIES:30} as const;
export function assessFashionSample(row:any){
 const p=row.preview as ProductPreview,reasons:string[]=[];
 const catalog=(row.meta??[]).find((m:any)=>m.id===p.catalog_product_id);
 const attrs=catalog?.attributes??[];
 const value=(id:string)=>attrs.find((a:any)=>a.id===id)?.value_name;
 const gender=attrs.find((a:any)=>a.id==='GENDER')?.value_id;
 const title=p.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!['339665','110461'].includes(gender))reasons.push('FEMALE_OR_ADULT_UNISEX_NOT_CONFIRMED');
 if(/\b(masculin[oa]s?|infantil|infantis|meninos?|meninas?|bebes?)\b/.test(title))reasons.push('AUDIENCE_CONFLICT');
 if(!p.price||!p.image||!p.url||p.title===row.id||p.currency!=='BRL'||!p.comparable||!p.seller_trusted)reasons.push('INCOMPLETE_COMPARABLE_PRICE');
 if(!catalog||catalog.status!=='active'||catalog.children?.length)reasons.push('EXACT_CATALOG_NOT_CONFIRMED');
 if(!value('BRAND')||!value('MODEL'))reasons.push('MODEL_IDENTITY_MISSING');
 if(['CLOTHING','FOOTWEAR'].includes(row.segment)&&!value('SIZE')&&!value('FOOTWEAR_SIZE'))reasons.push('SIZE_NOT_IDENTIFIED');
 if(/\b(relogio de parede|despertador|reposicao|usado)\b/.test(title))reasons.push('OUT_OF_SCOPE');
 const modelKey=value('BRAND')&&value('MODEL')?JSON.stringify([value('BRAND').toLowerCase().trim(),value('MODEL').toLowerCase().trim()]):null;
 // Conservative within-sample key; never merges prices using this brand/model key.
 const variantKey=catalog?JSON.stringify([catalog.id,...attrs.filter((a:any)=>['SIZE','FOOTWEAR_SIZE','COLOR'].includes(a.id)).map((a:any)=>[a.id,a.value_name]).sort()]):null;
 return {eligibleForMonitoring:!reasons.length,reasons,gender,modelKey,variantKey,paymentCondition:'UNSPECIFIED_CATALOG_PRICE',historicalDiscountConfirmed:false};
}
export function simulateFashionWomen(rows:any[]){
 const evaluated=rows.map(row=>({...row,assessment:assessFashionSample(row)}));
 const counts={CLOTHING:0,FOOTWEAR:0,ACCESSORIES:0},models=new Set<string>(),types=new Map<string,number>(),brands=new Map<string,number>(),selected:any[]=[];
 for(const row of evaluated.filter(r=>r.assessment.eligibleForMonitoring).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))){
  const segment=row.segment as keyof typeof counts;if(!(segment in counts))continue;
  const model=row.assessment.modelKey!;const brand=JSON.parse(model)[0];const type=segment+':'+row.category,brandKey=segment+':'+brand;
  if(models.has(model)||counts[segment]>=FASHION_WOMEN_QUOTAS[segment]||(types.get(type)??0)>=6||(brands.get(brandKey)??0)>=6)continue;
  selected.push(row);models.add(model);counts[segment]++;types.set(type,(types.get(type)??0)+1);brands.set(brandKey,(brands.get(brandKey)??0)+1);
 }
 return {scope:'SIMULATION_ONLY',counts,quotas:FASHION_WOMEN_QUOTAS,selected,excluded:evaluated.filter(r=>!r.assessment.eligibleForMonitoring),capacityProven:Object.keys(counts).every(k=>counts[k as keyof typeof counts]===FASHION_WOMEN_QUOTAS[k as keyof typeof counts]),historyMature:false};
}
