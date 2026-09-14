import {it,expect} from 'vitest';
import {inspectFashionPilot} from '../src/server/commercial/fashion-pilot.js';
it('keeps product identity distinct from category and reports restricted item access without admission',async()=>{
 const result=await inspectFashionPilot(async path=>{
  if(path.startsWith('/categories/'))return {id:path.split('/')[2],path_from_root:[{id:'MLB1430'}]};
  if(path.startsWith('/highlights/'))return {content:[{type:'PRODUCT',id:'MLB123',position:1}]};
  if(path==='/products/MLB123')return {id:'MLB123',status:'active',name:'Bolsa',attributes:[{id:'GENDER',value_id:'339665',value_name:'Feminino'}],buy_box_winner:{item_id:'MLB456',price:50,currency_id:'BRL',condition:'new'}};
  throw Error('restricted');
 });
 expect(result.activation).toBe(false);expect(result.products).toHaveLength(1);
 expect(result.products[0].id).toBe('MLB123');expect(result.products[0].category).toBe('MLB108704');
 expect(result.products[0].meta[0].attributes[0].value_id).toBe('339665');
 expect(result.products[0].errors.length).toBeGreaterThan(0);
});
it('rejects categories outside the verified fashion roots',async()=>{
 const result=await inspectFashionPilot(async path=>({id:path.split('/')[2],path_from_root:[{id:'MLB5672'}]}));
 expect(result.products).toEqual([]);expect(result.categories.every(c=>c.status===0)).toBe(true);
});
