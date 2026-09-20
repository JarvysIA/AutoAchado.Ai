import type {ProductPreview} from '../discovery/product-preview.js';
import {familyForCategory,type AutomotiveFamilyKey} from './automotive-families.js';
export const EDITORIAL_VERSION='automotive-category-families-v2';
const normalize=(value:string)=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
// The only title rule left. Everything else about what belongs in the portfolio is decided by the
// official category, so a product whose title matches no pattern is no longer silently dropped.
const CONDITION_BLOCK=/\busado\b|\bseminovo\b|\brecondicionado\b|\bpara pecas\b|\bcom defeito\b|\bretirada de pecas\b/;

export function assessAutomotive(p:Pick<ProductPreview,'title'|'description'>,categoryId:string|null|undefined) {
 const family=familyForCategory(categoryId);
 const base={family,version:EDITORIAL_VERSION};
 if(family===null) return {...base,state:'EXCLUDE' as const,
  reason:'Categoria de origem desconhecida; sem categoria oficial não há como avaliar o encaixe.'};
 if(family==='EXCLUDED') return {...base,state:'EXCLUDE' as const,
  reason:'Categoria fora da seleção para público amplo (peça, fluido, roda, alarme ou instalação especializada).'};
 if(CONDITION_BLOCK.test(normalize(p.title))) return {...base,state:'REVIEW' as const,
  reason:'Anúncio indica item usado, com defeito ou para peças; confirmar a condição antes de divulgar.'};
 return {...base,state:'ELIGIBLE' as const,
  reason:'Utilidade reconhecida pela categoria; confirmar condições atuais antes de divulgar.'};
}

export type AutomotiveAssessment=ReturnType<typeof assessAutomotive>;
export type {AutomotiveFamilyKey};

// This is an inspection hint only. It must never be used as a price identity.
export function possibleVariantKey(description:string|null):string|null {
 const brand=description?.match(/(?:^| · )Marca: ([^·]+)/)?.[1]?.trim();
 const model=description?.match(/(?:^| · )Modelo: ([^·]+)/)?.[1]?.trim();
 if(!brand||!model||model.length<4||/generico|universal|nao|bolsa de moto|adaptador/i.test(model)) return null;
 return normalize(brand+':'+model);
}
