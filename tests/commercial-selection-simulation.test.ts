import {it,expect} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {runSelectionSimulation} from '../src/server/commercial/selection-simulation.js';
const now=Date.parse('2026-09-09T12:00:00Z');
function fixture(fail=false) {
 const tables:Record<string,any[]>={
  highlight_snapshots:Array.from({length:4},(_,i)=>({type:'PRODUCT',product_id:'MLB1',marketplace_category_id:'category',position:2,observed_at:new Date(now-i*86400000).toISOString()})),
  commercial_watchlist:[{source_key:'PRODUCT:MLB1',identity_key:'catalog:MLB1',preview:{title:'Compressor portátil',price:80,currency:'BRL',seller_id:'1',seller_trusted:true,comparable:true,status:'CATALOG',image:'https://http2.mlstatic.com/a.jpg',url:'https://www.mercadolivre.com.br/p/MLB1',priceCheckedAt:new Date(now).toISOString()}}],
  commercial_vertical_memberships:[{vertical_key:'AUTOMOTIVE',source_key:'PRODUCT:MLB1',identity_key:'catalog:MLB1',monitor:true}],
  commercial_vertical_feedback:[],commercial_sent_products:[],commercial_cohort_changes:[],commercial_observations:[]};
 const reads:string[]=[];
 const client={from:(name:string)=>{reads.push(name);let rows=[...(tables[name]??[])];const q:any={select:()=>q,order:()=>q,
  eq:(k:string,v:any)=>{if(k!=='scan_runs.vertical_key')rows=rows.filter(r=>r[k]===v);return q;},gte:(k:string,v:any)=>{rows=rows.filter(r=>r[k]>=v);return q;},
  lte:(k:string,v:any)=>{rows=rows.filter(r=>r[k]<=v);return q;},not:(k:string)=>{rows=rows.filter(r=>r[k]!=null);return q;},
  in:(k:string,v:any[])=>{rows=rows.filter(r=>v.includes(r[k]));return q;},
  range:async(a:number,b:number)=>({data:rows.slice(a,b+1),error:fail?'failure':null})};return q;}} as unknown as SupabaseClient;
 return {client,reads,tables};
}
it('simulates against persisted discovery data without writes or changing membership',async()=>{
 const {client,tables,reads}=fixture(),before=JSON.stringify(tables);
 const r=await runSelectionSimulation(client,now);
 expect(r.applied).toBe(false);expect(r.current).toBe(1);expect(r.selectedCount).toBe(1);expect(r.overlap).toBe(1);
 expect(r.selected[0]!.price_analysis?.state).toBe('INSUFFICIENT_HISTORY');
 expect(r.proposedReplacements).toEqual([]);expect(JSON.stringify(tables)).toBe(before);
 expect(reads).toContain('commercial_observations');
});
it('fails visibly on a read error instead of reporting a truncated successful selection',async()=>{
 await expect(runSelectionSimulation(fixture(true).client,now)).rejects.toThrow('SELECTION_SIMULATION_READ_FAILED');
});
