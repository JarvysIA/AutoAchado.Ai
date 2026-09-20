import {describe,it,expect,vi} from 'vitest';
import {revalidateProduct} from '../src/server/commercial/revalidate.js';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({preview:vi.fn()}));
vi.mock('../src/server/discovery/product-preview.js',async importOriginal=>({...await importOriginal<object>(),configuredProductPreview:mocks.preview}));
// A família vem da categoria mais específica em que o produto apareceu no ranking.
const rankRows=[{identity_key:'catalog:MLB123',category_id:'MLB63533',observed_at:new Date().toISOString(),position:4}];
const client={from:(table:string)=>{
 const rows=table==='commercial_rank_observations'?rankRows:[];
 const q:any={select:()=>q,eq:()=>q,gte:()=>q,order:()=>q,range:(start:number)=>Promise.resolve({data:start===0?rows:[],error:null}),
  maybeSingle:()=>Promise.resolve({data:null,error:null}),update:()=>q,then:(resolve:any)=>resolve({data:[],error:null})};return q;
}} as unknown as SupabaseClient;
const preview={priceLinkVerified:true,title:'Compressor portátil',image:'https://http2.mlstatic.com/a.jpg',description:null,
 url:'https://www.mercadolivre.com.br/p/MLB123',price:60,currency:'BRL',status:'CATALOG',priceCheckedAt:new Date().toISOString()};
describe('sharing revalidation',()=>{
 it('bypasses the preview cache and does not invent historical approval',async()=>{
  mocks.preview.mockResolvedValue(preview);
  const result=await revalidateProduct(client,'MLB123','PRODUCT');
  expect(mocks.preview).toHaveBeenLastCalledWith(client,'MLB123','PRODUCT',true);
  expect(result.ready).toBe(true);expect(result.preview.commercial.state).toBe('OBSERVING');
 });
 it('blocks incomplete or unavailable fresh results',async()=>{
  mocks.preview.mockResolvedValue({...preview,price:null,status:'UNAVAILABLE'});
  expect((await revalidateProduct(client,'MLB123','PRODUCT')).ready).toBe(false);
 });
});

it('allows fresh catalog prices for manual review without historical approval',async()=>{
 mocks.preview.mockResolvedValue({...preview,priceLinkVerified:false});
 const result=await revalidateProduct(client,'MLB123','PRODUCT');
 expect(result.ready).toBe(true);expect(result.preview.priceLinkVerified).toBe(false);expect(result.preview.commercial.state).not.toBe('APPROVED');
});
