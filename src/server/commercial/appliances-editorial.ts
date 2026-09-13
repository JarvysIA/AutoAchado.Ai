import {APPLIANCES_CATEGORIES} from './appliances-config.js';
import {resolveProductPreview,type ProductPreview,type PreviewReader} from '../discovery/product-preview.js';
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function assessAppliances(title:string,categoryId:string) {
 const c=APPLIANCES_CATEGORIES.find(c=>c.id===categoryId),t=normalized(title),reasons:string[]=[];
 const result=(state:'CANDIDATE'|'REVIEW'|'EXCLUDE')=>({version:'APPLIANCES_V1',state,family:c?.family??'unknown',reasons});
 if(!c){reasons.push('Categoria ainda não revisada para Eletrodomésticos.');return result('REVIEW');}
 if(/\b(refil|reposicao|resistencia|capacitor|correia|peca|pecas|recondicionado|usado)\b|compativel com|para (aspirador|liquidificador|cafeteira|fritadeira)/.test(t)) {
  reasons.push('Peça, acessório ou condição fora do piloto de aparelhos novos.');return result('EXCLUDE');
 }
 if(!new RegExp(c.match).test(t)){reasons.push('Título não confirma o aparelho da categoria.');return result('REVIEW');}
 if(/industrial|comercial|trifasic|\bgas\b|embutir|teto|parede/.test(t))reasons.push('Instalação ou uso especializado precisa de revisão.');
 return result(reasons.length?'REVIEW':'CANDIDATE');
}
export interface ApplianceSpecs {brand:string|null;model:string|null;voltage:string|null;capacity:string|null;variant_key:string|null;verified:boolean;reasons:string[]}
export type AppliancePreview=ProductPreview & {appliance_specs?:ApplianceSpecs};
export function applianceSpecs(data:any):ApplianceSpecs {
 const attrs=Array.isArray(data?.attributes)?data.attributes:[];
 const value=(pattern:RegExp)=>attrs.filter((a:any)=>typeof a.id==='string'&&pattern.test(a.id)&&typeof a.value_name==='string').map((a:any)=>a.value_name.trim()).filter(Boolean).join(' · ')||null;
 const brand=value(/^BRAND$/),model=value(/^(MODEL|ALPHANUMERIC_MODEL)$/),voltage=value(/^VOLTAGE$/),capacity=value(/CAPACITY|VOLUME/);
 const power=value(/POWER_SOURCE|POWER_SUPPLY|BATTERY_TYPE/),reasons:string[]=[];
 if(/FRYER|MICROWAVE|REFRIGERATOR|FREEZER|OVEN/.test(String(data?.domain_id))&&!capacity)reasons.push('Capacidade ainda não identificada pela API.');
 if(!brand||!model)reasons.push('Marca/modelo ainda não identificados pela API.');
 const v=normalized(voltage??'');
 if(!(/bivolt/.test(v)||/^\d+(?:[.,]\d+)?\s*v$/.test(v)||(!voltage&&/pilha|bateria|battery|usb/.test(normalized(power??''))))) reasons.push('Alimentação elétrica ausente ou ambígua; não comparar voltagens.');
 if(data?.status!=='active'||(Array.isArray(data.children_ids)&&data.children_ids.length))reasons.push('Catálogo não identifica uma variante ativa única.');
 const signature=attrs.filter((a:any)=>typeof a.id==='string'&&/BRAND|MODEL|VOLTAGE|CAPACITY|VOLUME|POWER|COLOR/.test(a.id)).map((a:any)=>[a.id,a.value_name??null]).sort((a:any,b:any)=>a[0].localeCompare(b[0]));
 return {brand,model,voltage,capacity,verified:!reasons.length,reasons,variant_key:reasons.length?null:JSON.stringify(signature)};
}
export async function resolveAppliancePreview(id:string,type:string,read:PreviewReader):Promise<AppliancePreview> {
 let catalog:any;
 const p=await resolveProductPreview(id,type,async path=>{const data=await read(path);if(path==='/products/'+id&&data.id===id)catalog=data;return data;});
 const specs=applianceSpecs(catalog);
 const description=[specs.brand&&'Marca: '+specs.brand,specs.model&&'Modelo: '+specs.model,specs.voltage&&'Voltagem: '+specs.voltage,specs.capacity&&'Capacidade: '+specs.capacity].filter(Boolean).join(' · ');
 return {...p,description:description||p.description,appliance_specs:specs,comparable:p.comparable===true&&specs.verified};
}
