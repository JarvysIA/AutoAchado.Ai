import {HOME_CATEGORIES} from './home-config.js';

export const HOME_EDITORIAL_VERSION='HOME_EDITORIAL_V1';
const matches:Record<string,RegExp>={
 MLB244658:/potes?|marmitas?/, MLB194034:/escorredor|tapete.*pia/, MLB455328:/tempero|condimento|moedor/,
 MLB436305:/organizador|dispenser|porta.*(bucha|esponja)/, MLB271799:/ovos/, MLB271756:/azeite|galheteiro|borrifador|pulverizador/,
 MLB193618:/tabua/, MLB271797:/alho/, MLB436433:/caixa/, MLB436435:/organizador|porta.*(algodao|cotonete|maquiagem)/,
 MLB431869:/cabides?|organizador.*roupa/, MLB436416:/organizador|cesto|suporte.*pia|potes?/,
 MLB186367:/sacos?.*vacuo/, MLB272183:/organizador|porta.*(caneta|lapis)|pegboard|painel.*aramad/,
 MLB186655:/mop|esfregao/, MLB269712:/panos?|flanela|duramax/, MLB264060:/escova/,
 MLB272145:/limpador.*vidro|limpa.*vidro|rodo|limpador.*box/, MLB263865:/esponja|bucha|bombril/,
 MLB186657:/rodo/, MLB268446:/cesto/, MLB271576:/prendedor|pregador/,
 MLB271687:/saco.*lav|saquinho.*lav/, MLB277691:/dobrar|dobrador|gabarito/,
 MLB272180:/bolas?|bolinha|esfera|protetor.*sut ia|protetor.*sutia/,
 MLB436113:/balde|bacia|cesto|cesta/, MLB1616:/banheiro|sanitari|papel higienico|pasta.*dente|sabonete/,
 MLB186136:/tapete|toalha.*piso/, MLB438954:/varao|cortina/,
};
// Editorial triage, not a prediction of sales or proof of the seller's claims.
export function assessHome(title:string,categoryId:string) {
 const category=HOME_CATEGORIES.find(c=>c.id===categoryId);
 const text=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const reasons:string[]=[];
 const result=(state:'CANDIDATE'|'REVIEW'|'EXCLUDE')=>({version:HOME_EDITORIAL_VERSION,state,family:category?.family??'unknown',reasons});
 if(!category||!matches[categoryId]) {reasons.push('Categoria ainda não revisada para Casa.');return result('REVIEW');}
 if(/\bwhey\b|suplemento|colchao|cafeteira|maquina de lavar|\bsofa\b|guarda.?roupa/.test(text)) {
  reasons.push('Produto pertence a outro recorte comercial, mesmo aparecendo neste ranking.');return result('EXCLUDE');
 }
 if(!matches[categoryId]!.test(text)) {reasons.push('Título não confirma correspondência com a categoria de descoberta.');return result('REVIEW');}
 if(/eletric|\b\d{3}\s*v\b|industrial|lembrancinha|expositora|\bmdf\b/.test(text)) reasons.push('Uso especializado, alimentação elétrica ou acabamento exige revisão.');
 if(/magnetic|assento sanitario|suspenso|varao|adesiv|sem fur|sem furo|pegboard/.test(text)) reasons.push('Conferir medidas, superfície, fixação ou compatibilidade antes de destacar.');
 if(categoryId==='MLB272180') reasons.push('Utilidade e desempenho precisam de avaliação; a alegação do título não comprova eficácia.');
 if(/\b95\s*l|\b240\s*m|\b600\s*panos|\b120\s*(pregador|prendedor)/.test(text)) reasons.push('Volume ou quantidade pode reduzir a adequação à compra doméstica comum.');
 return result(reasons.length?'REVIEW':'CANDIDATE');
}
