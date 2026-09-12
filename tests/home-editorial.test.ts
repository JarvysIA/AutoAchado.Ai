import {it,expect} from 'vitest';
import {assessHome} from '../src/server/commercial/home-editorial.js';
it('does not accept unrelated products merely because they appeared in a ranking',()=>{
 expect(assessHome('Whey 100% Pure','MLB244658').state).toBe('EXCLUDE');
 expect(assessHome('Cafeteira elétrica 30 xícaras','MLB186655').state).toBe('EXCLUDE');
 expect(assessHome('Água sanitária 5l','MLB269712').state).toBe('REVIEW');
 expect(assessHome('Potes para alimentos','UNKNOWN').state).toBe('REVIEW');
});
it('accepts everyday uses but sends compatibility and effectiveness claims to review',()=>{
 for(const [title,id] of [['Kit potes herméticos vidro','MLB244658'],['Mop spray manual','MLB186655'],['Kit cabides veludo','MLB431869'],['Saco lavagem roupas delicadas','MLB271687']])
  expect(assessHome(title!,id!).state).toBe('CANDIDATE');
 for(const [title,id] of [['Limpador magnético vidros até 8mm','MLB272145'],['Varão sem furar','MLB438954'],['Bolas tira pelo máquina','MLB272180']]) {
  const r=assessHome(title!,id!);expect(r.state).toBe('REVIEW');expect(r.reasons.length).toBeGreaterThan(0);
 }
});
