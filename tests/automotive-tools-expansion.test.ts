import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {AUTOMOTIVE_TOOL_CATEGORY_IDS,AUTOMOTIVE_MLB_DISCOVERY_TOOLS} from '../src/commerce/discovery/automotive-tools.js';
import {assessAutomotive} from '../src/server/commercial/editorial.js';
it('admits reviewed hand tools and inspection equipment without accepting vehicle key covers',()=>{
 for(const title of ['Jogo de soquetes 40 peças','Catraca reversível 1/2','Chaves combinadas 12 peças','Macaco hidráulico jacaré 2 toneladas','Cavaletes automotivos 2 toneladas','Espelho telescópico de inspeção']) {
  expect(assessAutomotive({title,description:null})).toMatchObject({state:'ELIGIBLE',family:'ferramentas'});
 }
 for(const title of ['Carcaça Capa Chave Canivete Para Vw G5','Chave codificada de ignição','Kit Macaco Chave Roda Fiat Argo Cronos'])
  expect(assessAutomotive({title,description:null}).state).not.toBe('ELIGIBLE');
});
it('adds eleven distinct leaf categories and keeps the 100-product roster independent',()=>{
 const snapshot=readFileSync('tests/fixtures/meli-automotive-taxonomy.snapshot.json','utf8');
 expect(new Set(AUTOMOTIVE_TOOL_CATEGORY_IDS).size).toBe(11);
 for(const id of AUTOMOTIVE_TOOL_CATEGORY_IDS) expect(snapshot).toContain(id);
 expect(AUTOMOTIVE_MLB_DISCOVERY_TOOLS.expectedEligibleCategories).toBe(155);
});
