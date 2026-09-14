import {it,expect} from 'vitest';
import {assessFashionSample,simulateFashionWomen} from '../src/server/commercial/fashion-simulation.js';
const sample=(id:string,size='M')=>({id,category:'MLB3112',segment:'CLOTHING',position:1,preview:{catalog_product_id:id,title:'Blusa',price:30,image:'https://http2.mlstatic.com/a.jpg',url:'https://www.mercadolivre.com.br/p/'+id,currency:'BRL',comparable:true,seller_trusted:true},meta:[{id,status:'active',children:[],attributes:[{id:'GENDER',value_id:'339665'},{id:'BRAND',value_name:'Marca'},{id:'MODEL',value_name:'Modelo'},{id:'SIZE',value_name:size},{id:'COLOR',value_name:'Preto'}]}]});
it('counts one model but keeps variant evidence distinct',()=>{
 const a=sample('MLB1','P'),b=sample('MLB2','G');
 expect(assessFashionSample(a).variantKey).not.toBe(assessFashionSample(b).variantKey);
 expect(simulateFashionWomen([a,b]).counts.CLOTHING).toBe(1);
 expect(simulateFashionWomen([a,b]).capacityProven).toBe(false);
 expect(assessFashionSample(a).historicalDiscountConfirmed).toBe(false);
});
it('rejects missing size and child or conflicting audience',()=>{
 const a=sample('MLB1');a.meta[0]!.attributes=a.meta[0]!.attributes.filter(x=>x.id!=='SIZE');expect(assessFashionSample(a).eligibleForMonitoring).toBe(false);
 const b=sample('MLB2');b.preview.title='Mochila Masculina';expect(assessFashionSample(b).reasons).toContain('AUDIENCE_CONFLICT');
 const c=sample('MLB3');c.meta[0]!.attributes[0]!.value_id='339668';expect(assessFashionSample(c).eligibleForMonitoring).toBe(false);
});
