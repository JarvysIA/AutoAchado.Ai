// Family of an automotive product comes from the official Mercado Livre category, not from a
// regex over the title: a title that matches nothing used to become "avaliar" and never got in.
// Frozen map over the 180 eligible categories (ALLOWED tier A/B). Categories outside the broad-audience
// scope map to EXCLUDED and are never admitted. Regenerating it requires re-reviewing the paths.
export const AUTOMOTIVE_FAMILY_LABELS = Object.freeze({
 limpeza_estetica: 'Limpeza e estética',
 aspiracao: 'Aspiração',
 pneus_calibragem: 'Pneus e calibragem',
 emergencia_seguranca: 'Emergência e segurança',
 celular_eletronicos: 'Celular e eletrônicos',
 som_multimidia: 'Som e multimídia',
 acessorios_internos: 'Acessórios internos',
 acessorios_externos: 'Acessórios externos',
 iluminacao: 'Iluminação',
 ferramentas: 'Ferramentas',
 moto: 'Moto'
});

export type AutomotiveFamilyKey = keyof typeof AUTOMOTIVE_FAMILY_LABELS | 'EXCLUDED';

export const AUTOMOTIVE_CATEGORY_FAMILY: Readonly<Record<string,AutomotiveFamilyKey>> = Object.freeze({
 // Limpeza e estética (16)
 MLB188063:'limpeza_estetica',MLB263726:'limpeza_estetica',MLB263727:'limpeza_estetica',MLB263728:'limpeza_estetica',
 MLB270872:'limpeza_estetica',MLB271174:'limpeza_estetica',MLB363814:'limpeza_estetica',MLB392346:'limpeza_estetica',
 MLB392348:'limpeza_estetica',MLB429409:'limpeza_estetica',MLB429491:'limpeza_estetica',MLB430552:'limpeza_estetica',
 MLB430584:'limpeza_estetica',MLB431864:'limpeza_estetica',MLB433258:'limpeza_estetica',MLB455776:'limpeza_estetica',
 // Aspiração (1)
 MLB22723:'aspiracao',
 // Pneus e calibragem (9)
 MLB116336:'pneus_calibragem',MLB2233:'pneus_calibragem',MLB370798:'pneus_calibragem',MLB3933:'pneus_calibragem',
 MLB429029:'pneus_calibragem',MLB440129:'pneus_calibragem',MLB440135:'pneus_calibragem',MLB459150:'pneus_calibragem',
 MLB63533:'pneus_calibragem',
 // Emergência e segurança (14)
 MLB179794:'emergencia_seguranca',MLB270295:'emergencia_seguranca',MLB277617:'emergencia_seguranca',MLB278274:'emergencia_seguranca',
 MLB410863:'emergencia_seguranca',MLB429413:'emergencia_seguranca',MLB430581:'emergencia_seguranca',MLB440307:'emergencia_seguranca',
 MLB455304:'emergencia_seguranca',MLB458031:'emergencia_seguranca',MLB459157:'emergencia_seguranca',MLB459347:'emergencia_seguranca',
 MLB459348:'emergencia_seguranca',MLB63455:'emergencia_seguranca',
 // Celular e eletrônicos (9)
 MLB10727:'celular_eletronicos',MLB116489:'celular_eletronicos',MLB186150:'celular_eletronicos',MLB271558:'celular_eletronicos',
 MLB45905:'celular_eletronicos',MLB459471:'celular_eletronicos',MLB49496:'celular_eletronicos',MLB8531:'celular_eletronicos',
 MLB8532:'celular_eletronicos',
 // Som e multimídia (12)
 MLB135679:'som_multimidia',MLB169600:'som_multimidia',MLB3381:'som_multimidia',MLB3386:'som_multimidia',
 MLB3905:'som_multimidia',MLB430132:'som_multimidia',MLB438486:'som_multimidia',MLB443814:'som_multimidia',
 MLB455438:'som_multimidia',MLB455582:'som_multimidia',MLB5670:'som_multimidia',MLB60182:'som_multimidia',
 // Acessórios internos (12)
 MLB2219:'acessorios_internos',MLB271108:'acessorios_internos',MLB271611:'acessorios_internos',MLB271614:'acessorios_internos',
 MLB277952:'acessorios_internos',MLB40411:'acessorios_internos',MLB430913:'acessorios_internos',MLB430923:'acessorios_internos',
 MLB431858:'acessorios_internos',MLB459455:'acessorios_internos',MLB46692:'acessorios_internos',MLB6170:'acessorios_internos',
 // Acessórios externos (10)
 MLB116499:'acessorios_externos',MLB116500:'acessorios_externos',MLB255106:'acessorios_externos',MLB439834:'acessorios_externos',
 MLB459195:'acessorios_externos',MLB459197:'acessorios_externos',MLB459198:'acessorios_externos',MLB459365:'acessorios_externos',
 MLB459366:'acessorios_externos',MLB73312:'acessorios_externos',
 // Iluminação (5)
 MLB191727:'iluminacao',MLB418074:'iluminacao',MLB455311:'iluminacao',MLB46659:'iluminacao',
 MLB5759:'iluminacao',
 // Ferramentas (11)
 MLB115943:'ferramentas',MLB115944:'ferramentas',MLB115945:'ferramentas',MLB116343:'ferramentas',
 MLB271712:'ferramentas',MLB437783:'ferramentas',MLB437784:'ferramentas',MLB437795:'ferramentas',
 MLB437802:'ferramentas',MLB455301:'ferramentas',MLB455313:'ferramentas',
 // Moto (11)
 MLB203101:'moto',MLB22204:'moto',MLB22879:'moto',MLB277590:'moto',
 MLB3929:'moto',MLB3930:'moto',MLB430631:'moto',MLB431120:'moto',
 MLB438313:'moto',MLB438314:'moto',MLB456124:'moto',
 // Fora da seleção de público amplo (70)
 MLB11099:'EXCLUDED',MLB191708:'EXCLUDED',MLB191834:'EXCLUDED',MLB193967:'EXCLUDED',
 MLB194025:'EXCLUDED',MLB194026:'EXCLUDED',MLB194027:'EXCLUDED',MLB194028:'EXCLUDED',
 MLB198931:'EXCLUDED',MLB2220:'EXCLUDED',MLB2228:'EXCLUDED',MLB2239:'EXCLUDED',
 MLB22727:'EXCLUDED',MLB22735:'EXCLUDED',MLB243791:'EXCLUDED',MLB3385:'EXCLUDED',
 MLB3904:'EXCLUDED',MLB3932:'EXCLUDED',MLB429046:'EXCLUDED',MLB429227:'EXCLUDED',
 MLB430675:'EXCLUDED',MLB431319:'EXCLUDED',MLB432538:'EXCLUDED',MLB437252:'EXCLUDED',
 MLB437253:'EXCLUDED',MLB437274:'EXCLUDED',MLB438467:'EXCLUDED',MLB438870:'EXCLUDED',
 MLB439463:'EXCLUDED',MLB439464:'EXCLUDED',MLB439465:'EXCLUDED',MLB439944:'EXCLUDED',
 MLB440153:'EXCLUDED',MLB440299:'EXCLUDED',MLB440300:'EXCLUDED',MLB440303:'EXCLUDED',
 MLB440305:'EXCLUDED',MLB440490:'EXCLUDED',MLB45256:'EXCLUDED',MLB456122:'EXCLUDED',
 MLB456123:'EXCLUDED',MLB456128:'EXCLUDED',MLB456142:'EXCLUDED',MLB456145:'EXCLUDED',
 MLB457271:'EXCLUDED',MLB457915:'EXCLUDED',MLB457979:'EXCLUDED',MLB458211:'EXCLUDED',
 MLB458212:'EXCLUDED',MLB458222:'EXCLUDED',MLB458231:'EXCLUDED',MLB458234:'EXCLUDED',
 MLB458236:'EXCLUDED',MLB458243:'EXCLUDED',MLB458245:'EXCLUDED',MLB458247:'EXCLUDED',
 MLB458249:'EXCLUDED',MLB458250:'EXCLUDED',MLB458330:'EXCLUDED',MLB458334:'EXCLUDED',
 MLB458335:'EXCLUDED',MLB46559:'EXCLUDED',MLB46560:'EXCLUDED',MLB47097:'EXCLUDED',
 MLB47098:'EXCLUDED',MLB47119:'EXCLUDED',MLB47120:'EXCLUDED',MLB4860:'EXCLUDED',
 MLB6789:'EXCLUDED',MLB7863:'EXCLUDED',
});

// Depth in the official taxonomy, so the most specific category a product ranks in wins.
export const AUTOMOTIVE_CATEGORY_DEPTH: Readonly<Record<string,number>> = Object.freeze({
 MLB10727:3,MLB11099:4,MLB115943:4,MLB115944:4,MLB115945:4,MLB116336:5,MLB116343:4,MLB116489:4,
 MLB116499:5,MLB116500:5,MLB135679:5,MLB169600:3,MLB179794:3,MLB186150:4,MLB188063:2,MLB191708:4,
 MLB191727:5,MLB191834:3,MLB193967:4,MLB194025:3,MLB194026:4,MLB194027:5,MLB194028:4,MLB198931:4,
 MLB203101:3,MLB2219:4,MLB2220:3,MLB22204:4,MLB2228:3,MLB2233:3,MLB2239:2,MLB22723:3,
 MLB22727:3,MLB22735:5,MLB22879:5,MLB243791:5,MLB255106:5,MLB263726:3,MLB263727:3,MLB263728:3,
 MLB270295:3,MLB270872:3,MLB271108:4,MLB271174:3,MLB271558:4,MLB271611:4,MLB271614:3,MLB271712:4,
 MLB277590:3,MLB277617:4,MLB277952:4,MLB278274:3,MLB3381:2,MLB3385:3,MLB3386:4,MLB363814:3,
 MLB370798:4,MLB3904:4,MLB3905:3,MLB392346:3,MLB392348:3,MLB3929:3,MLB3930:4,MLB3932:3,
 MLB3933:3,MLB40411:4,MLB410863:3,MLB418074:4,MLB429029:5,MLB429046:3,MLB429227:4,MLB429409:3,
 MLB429413:4,MLB429491:4,MLB430132:5,MLB430552:3,MLB430581:4,MLB430584:3,MLB430631:3,MLB430675:4,
 MLB430913:4,MLB430923:4,MLB431120:3,MLB431319:4,MLB431858:4,MLB431864:3,MLB432538:5,MLB433258:3,
 MLB437252:5,MLB437253:5,MLB437274:3,MLB437783:4,MLB437784:4,MLB437795:3,MLB437802:4,MLB438313:5,
 MLB438314:5,MLB438467:3,MLB438486:3,MLB438870:5,MLB439463:3,MLB439464:4,MLB439465:4,MLB439834:5,
 MLB439944:3,MLB440129:4,MLB440135:3,MLB440153:3,MLB440299:4,MLB440300:4,MLB440303:4,MLB440305:4,
 MLB440307:3,MLB440490:3,MLB443814:4,MLB45256:3,MLB455301:3,MLB455304:3,MLB455311:4,MLB455313:4,
 MLB455438:3,MLB455582:4,MLB455776:3,MLB456122:4,MLB456123:5,MLB456124:5,MLB456128:5,MLB456142:4,
 MLB456145:4,MLB457271:4,MLB457915:4,MLB457979:5,MLB458031:4,MLB458211:4,MLB458212:5,MLB458222:5,
 MLB458231:4,MLB458234:4,MLB458236:5,MLB458243:4,MLB458245:5,MLB458247:4,MLB458249:5,MLB458250:5,
 MLB458330:4,MLB458334:4,MLB458335:4,MLB45905:4,MLB459150:5,MLB459157:6,MLB459195:5,MLB459197:5,
 MLB459198:5,MLB459347:6,MLB459348:6,MLB459365:5,MLB459366:5,MLB459455:4,MLB459471:5,MLB46559:3,
 MLB46560:3,MLB46659:5,MLB46692:4,MLB47097:4,MLB47098:4,MLB47119:4,MLB47120:4,MLB4860:3,
 MLB49496:4,MLB5670:3,MLB5759:5,MLB60182:5,MLB6170:4,MLB63455:4,MLB63533:4,MLB6789:3,
 MLB73312:4,MLB7863:4,MLB8531:2,MLB8532:3,
});

export const AUTOMOTIVE_ELIGIBLE_CATEGORY_COUNT = 180;

/** EXCLUDED and unknown categories are both unusable; unknown is reported separately. */
export function familyForCategory(categoryId: string | null | undefined): AutomotiveFamilyKey | null {
 if (!categoryId) return null;
 return AUTOMOTIVE_CATEGORY_FAMILY[categoryId] ?? null;
}

export function familyLabel(family: AutomotiveFamilyKey | null): string {
 return family && family !== 'EXCLUDED' ? AUTOMOTIVE_FAMILY_LABELS[family] ?? family : 'Fora de escopo';
}

const normalizeAttribute = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Preview descriptions join attributes with ' · ', as in "Marca: Vonixx · Modelo: V-Floc". */
function attribute(description: string | null | undefined, name: string): string | null {
  const match = description?.match(new RegExp('(?:^| · )' + name + ': ([^·]+)'))?.[1];
  const value = match === undefined ? '' : normalizeAttribute(match);
  return value.length > 0 ? value : null;
}

export const brandOf = (description: string | null | undefined): string | null => attribute(description, 'Marca');

/** Two listings of the same brand and model are the same product for portfolio purposes. */
export function duplicateKeyOf(description: string | null | undefined): string | null {
  const brand = brandOf(description);
  const model = attribute(description, 'Modelo');
  return brand && model ? brand + ':' + model : null;
}

/**
 * The type is the most specific eligible category the product ranked in over the window; a
 * non-leaf category counts as the generic type of its branch. Falls back to the queue category.
 */
export function resolveCategory(rankCategoryIds: readonly string[], queueCategoryId?: string | null): string | null {
  let best: string | null = null;
  let bestDepth = -1;
  for (const id of rankCategoryIds) {
    const depth = AUTOMOTIVE_CATEGORY_DEPTH[id];
    if (depth === undefined) continue;
    if (depth > bestDepth || (depth === bestDepth && best !== null && id < best)) { best = id; bestDepth = depth; }
  }
  if (best !== null) return best;
  return queueCategoryId && AUTOMOTIVE_CATEGORY_DEPTH[queueCategoryId] !== undefined ? queueCategoryId : null;
}
