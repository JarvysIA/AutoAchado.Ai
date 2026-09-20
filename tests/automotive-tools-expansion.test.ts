import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {AUTOMOTIVE_TOOL_CATEGORY_IDS,AUTOMOTIVE_CURATED_V3_CATEGORY_IDS,AUTOMOTIVE_MLB_DISCOVERY_TOOLS} from '../src/commerce/discovery/automotive-tools.js';
import {assessAutomotive} from '../src/server/commercial/editorial.js';
it('admits the reviewed tool categories and refuses out-of-scope ones, whatever the title says',()=>{
 // Soquetes, catracas, chaves fixas e cavaletes: todas na família ferramentas.
 for(const category of ['MLB437783','MLB437784','MLB115944','MLB271712','MLB116343','MLB455313'])
  expect(assessAutomotive({title:'Qualquer título',description:null},category)).toMatchObject({state:'ELIGIBLE',family:'ferramentas'});
 // Peças, rodas e alarmes seguem fora, e uma categoria desconhecida nunca entra.
 for(const category of ['MLB2220','MLB4860','MLB440299','MLB999999'])
  expect(assessAutomotive({title:'Jogo de soquetes 40 peças',description:null},category).state).not.toBe('ELIGIBLE');
});
it('adds eleven distinct leaf categories and keeps the 100-product roster independent',()=>{
 const snapshot=readFileSync('tests/fixtures/meli-automotive-taxonomy.snapshot.json','utf8');
 expect(new Set(AUTOMOTIVE_TOOL_CATEGORY_IDS).size).toBe(11);
 for(const id of AUTOMOTIVE_TOOL_CATEGORY_IDS) expect(snapshot).toContain(id);
 expect(AUTOMOTIVE_MLB_DISCOVERY_TOOLS.expectedEligibleCategories).toBe(180);
});
it('adds twenty-five distinct curated-v3 leaves that do not overlap the tools set',()=>{
 const snapshot=JSON.parse(readFileSync('tests/fixtures/meli-automotive-taxonomy.snapshot.json','utf8'));
 const leaves=new Map<string,any>();
 (function walk(node:any){if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object'){if(node.externalCategoryId)leaves.set(node.externalCategoryId,node);for(const key of Object.keys(node))walk(node[key]);}})(snapshot);
 expect(new Set(AUTOMOTIVE_CURATED_V3_CATEGORY_IDS).size).toBe(25);
 for(const id of AUTOMOTIVE_CURATED_V3_CATEGORY_IDS) expect(leaves.get(id)?.isLeaf).toBe(true);
 expect(AUTOMOTIVE_CURATED_V3_CATEGORY_IDS.filter(id=>AUTOMOTIVE_TOOL_CATEGORY_IDS.includes(id))).toEqual([]);
 expect(AUTOMOTIVE_MLB_DISCOVERY_TOOLS.configVersion).toBe('automotive-mlb-discovery/curated-v3');
 // The registry migration must land on the same total the planner demands.
 const migration=readFileSync('supabase/migrations/20260919100000_automotive_curated_categories_v3.sql','utf8');
 for(const id of AUTOMOTIVE_CURATED_V3_CATEGORY_IDS) expect(migration).toContain("'"+id+"'");
 expect(migration).toContain('<>180');
 expect(migration).toContain('changed<>25');
});
