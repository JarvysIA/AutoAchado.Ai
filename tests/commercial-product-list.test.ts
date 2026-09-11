import {describe,it,expect} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {commercialOpportunities,markCommercialSent} from '../src/server/commercial/service.js';

function fixture() {
 const tables:Record<string,any[]>={commercial_verticals:[{vertical_key:'AUTOMOTIVE',monitor_capacity:100}],
  commercial_sent_products:[{vertical_key:'AUTOMOTIVE',identity_key:'id:0',sent_at:'2026-09-07T10:00:00Z'},
   {vertical_key:'AUTOMOTIVE',identity_key:'id:29',sent_at:'2026-09-07T11:00:00Z'}],
  commercial_watchlist:Array.from({length:30},(_,i)=>({source_key:'PRODUCT:MLB'+i,identity_key:'id:'+i,monitor:i<25,
   snapshot:{product_id:'MLB'+i,type:'PRODUCT'},preview:{title:'Compressor portátil '+i,price:50,currency:'BRL'}})),
  commercial_vertical_feedback:[],commercial_observations:[],commercial_rank_observations:[],commercial_collection_runs:[]};
 const writes:string[]=[];
 const client={rpc:async()=>({data:{},error:null}),from:(table:string)=>{
  let rows=[...(tables[table]??[])];
  const q:any={select:()=>q,eq:(key:string,value:any)=>{rows=rows.filter(r=>r[key]===value);return q;},
   not:(key:string)=>{rows=rows.filter(r=>r[key]!==null);return q;},in:(key:string,values:any[])=>{rows=rows.filter(r=>values.includes(r[key]));return q;},gte:()=>q,order:()=>q,
   range:(start:number,end:number)=>Promise.resolve({data:rows.slice(start,end+1),error:null}),limit:()=>q,
   single:async()=>({data:rows[0],error:null}),maybeSingle:async()=>({data:rows[0]??null,error:null}),
   upsert:async(row:any)=>{writes.push(table);const index=tables[table]!.findIndex(r=>r.identity_key===row.identity_key&&r.vertical_key===row.vertical_key);
    if(index<0) tables[table]!.push(row);else tables[table]![index]=row;return {data:null,error:null};},
   then:(resolve:any)=>resolve({data:rows,error:null})};return q;
 }} as unknown as SupabaseClient;
 return {client,tables,writes};
}
describe('monitored product navigation and explicit sent state',()=>{
 it('orders the entire monitored pool by potential before pagination when approval is equal',async()=>{
  const {client,tables}=fixture();
  tables.commercial_selection_assessments=[{identity_key:'id:24',evidence:{score:90},assessed_at:new Date().toISOString()},
   {identity_key:'id:12',evidence:{score:80},assessed_at:new Date().toISOString()}];
  const result=await commercialOpportunities(client,'ALL');
  expect(result.entries.slice(0,2).map(e=>e.identity_key)).toEqual(['id:24','id:12']);
  expect(result.entries[0]!.price_timeline.months).toEqual([]);
 });
 it('loads 50 products then the remaining monitored products without duplicates',async()=>{
  const {client,tables}=fixture();
  tables.commercial_watchlist=Array.from({length:100},(_,i)=>({source_key:'PRODUCT:MLB'+i,identity_key:'id:'+i,monitor:true,
   snapshot:{product_id:'MLB'+i,type:'PRODUCT'},preview:{title:'Compressor portátil '+i,price:50,currency:'BRL'}}));
  const first=await commercialOpportunities(client,'ALL');
  const second=await commercialOpportunities(client,'ALL',50);
  expect(first.total).toBe(100);expect(first.capacity).toBe(100);
  expect(first.entries).toHaveLength(50);expect(first.hasMore).toBe(true);
  expect(second.entries).toHaveLength(50);expect(second.hasMore).toBe(false);
  expect(new Set([...first.entries,...second.entries].map(e=>e.identity_key)).size).toBe(100);
 });
 it('keeps sent products accessible after monitoring stops and excludes them from follow-up',async()=>{
  const {client}=fixture();
  expect((await commercialOpportunities(client,'SENT')).entries.map(e=>e.identity_key)).toEqual(['id:29','id:0']);
  const observing=await commercialOpportunities(client,'OBSERVING');
  expect(observing.total).toBe(24);expect(observing.entries.every(e=>!e.sent_at)).toBe(true);
 });
 it('marks and undoes sending without changing feedback or monitoring',async()=>{
  const {client,tables,writes}=fixture();
  const before=JSON.stringify(tables.commercial_watchlist);
  const saved=await markCommercialSent(client,'MLB1','PRODUCT',true);
  expect(saved.sent_at).toBeTruthy();
  expect((await commercialOpportunities(client,'SENT')).total).toBe(3);
  expect((await markCommercialSent(client,'MLB1','PRODUCT',false)).sent_at).toBeNull();
  expect((await commercialOpportunities(client,'SENT')).total).toBe(2);
  expect(writes).toEqual(['commercial_sent_products','commercial_sent_products']);
  expect(JSON.stringify(tables.commercial_watchlist)).toBe(before);
 });
});
