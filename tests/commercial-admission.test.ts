import {describe,it,expect} from 'vitest';
import {admissionDecision} from '../src/server/commercial/admission.js';
import type {ProductPreview} from '../src/server/discovery/product-preview.js';
const compressor:ProductPreview={title:'Compressor portátil digital',description:null,image:'https://http2.mlstatic.com/a.jpg',url:'https://www.mercadolivre.com.br/p/MLB57468821',
 price:62,currency:'BRL',comparable:true,seller_trusted:true,status:'CATALOG'};
describe('admission independent of historical approval',()=>{
 it('admits a useful comparable compressor without requiring mature history',()=>{
  expect(admissionDecision(compressor,1,'MLB63533').state).toBe('QUALIFIED');
 });
 it('does not qualify inaccessible or specialized candidates just because they have a price',()=>{
  expect(admissionDecision({...compressor,seller_trusted:false},1,'MLB63533').state).toBe('RETRY');
  // The category decides scope now: same product, out-of-scope category, still refused.
  expect(admissionDecision({...compressor,title:'Rastreador com mensalidade'},1,'MLB440490').state).toBe('REJECTED');
  expect(admissionDecision(compressor,1,'MLB999999').state).toBe('REJECTED');
  expect(admissionDecision({...compressor,status:'UNAVAILABLE'},1,'MLB63533').state).toBe('REJECTED');
 });
 it('finishes repeated incomplete evaluations without approving them',()=>{
  expect(admissionDecision({...compressor,comparable:false},3,'MLB63533').state).toBe('REJECTED');
 });
});
