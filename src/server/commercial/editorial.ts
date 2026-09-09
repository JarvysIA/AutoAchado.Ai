import type {ProductPreview} from '../discovery/product-preview.js';
import {commercialProfile} from './profile.js';
export const EDITORIAL_VERSION='automotive-pre-home-v1';
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function assessAutomotive(p:Pick<ProductPreview,'title'|'description'>) {
 const text=normalize(p.title),profile=commercialProfile(p.title);
 let state:'ELIGIBLE'|'REVIEW'|'EXCLUDE'=profile.group==='avaliar'?'REVIEW':profile.group==='especializado'?'EXCLUDE':'ELIGIBLE';
 let reason=state==='ELIGIBLE'?'Utilidade reconhecida; confirmar condições atuais antes de divulgar.':state==='REVIEW'?
  'Dados insuficientes para validar instalação, compatibilidade ou utilidade ampla.':'Uso especializado fora do público amplo inicial.';
 if(/\balarme\b|\bstart stop\b|partida remota|chaveiro|\broda (ferro|traseira)\b|\bpneu \d|\bmodulo\b|\bamplificador\b|\bdriver fenolico\b|alto falantes|\bbateria de moto\b|sensor de estacionamento|camera de re\b|\boleo motor\b|\boleo 5w|\boleo \d+w|\bradiador|arrefecimento|valvulas e injetores/.test(text)
  || /kit macaco.*(fiat|argo|cronos)/.test(text)) {
  state='EXCLUDE';reason='Exige aplicação veicular, instalação ou manutenção específica; fora da seleção para público amplo.';
 }
 // Only explicit plug-in adapters enter this additional family; generic audio stays in review.
 const simpleBluetooth=/adaptador bluetooth|adaptador.*bluetooth/.test(text)&&/usb|p2/.test(text)&&!/(modulo|instalacao|central)/.test(text);
 return {state,reason,family:simpleBluetooth?'celular':profile.group,
  ...(simpleBluetooth&&state==='REVIEW'?{state:'ELIGIBLE' as const,reason:'Adaptador USB/P2; conferir a entrada compatível no aparelho.'}:{}),version:EDITORIAL_VERSION};
}
// This is an inspection hint only. It must never be used as a price identity.
export function possibleVariantKey(description:string|null):string|null {
 const brand=description?.match(/(?:^| · )Marca: ([^·]+)/)?.[1]?.trim();
 const model=description?.match(/(?:^| · )Modelo: ([^·]+)/)?.[1]?.trim();
 if(!brand||!model||model.length<4||/generico|universal|nao|bolsa de moto|adaptador/i.test(model)) return null;
 return normalize(brand+':'+model);
}
