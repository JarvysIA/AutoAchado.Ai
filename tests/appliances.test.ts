import {it,expect} from 'vitest';
import {applianceSpecs,assessAppliances,resolveAppliancePreview} from '../src/server/commercial/appliances-editorial.js';
import {appliancesEligible} from '../src/server/commercial/appliances-service.js';
import {APPLIANCES_CATEGORIES} from '../src/server/commercial/appliances-config.js';
const catalog=(voltage='127 V')=>({id:'MLB123',status:'active',children_ids:[],attributes:[{id:'BRAND',value_name:'Marca'},{id:'MODEL',value_name:'Modelo 1'},{id:'VOLTAGE',value_name:voltage},{id:'TOTAL_CAPACITY',value_name:'4 L'}]});
it('separates electrical variants and rejects missing or ambiguous specifications',()=>{
 expect(applianceSpecs(catalog()).verified).toBe(true);
 expect(applianceSpecs(catalog()).variant_key).not.toBe(applianceSpecs(catalog('220 V')).variant_key);
 expect(applianceSpecs(catalog('127/220 V')).verified).toBe(false);
 expect(applianceSpecs(catalog('Bivolt')).verified).toBe(true);
 expect(applianceSpecs({...catalog(),children_ids:['MLB456']}).verified).toBe(false);
 expect(applianceSpecs({status:'active',attributes:[]}).verified).toBe(false);
 const data=catalog();data.attributes=data.attributes.filter(a=>a.id!=='TOTAL_CAPACITY');
 expect(applianceSpecs({...data,domain_id:'MLB-ELECTRIC_FRYERS'}).verified).toBe(false);
});
it('accepts complete appliances, not spare parts or specialized installations',()=>{
 expect(assessAppliances('Liquidificador doméstico','MLB73055').state).toBe('CANDIDATE');
 expect(assessAppliances('Copo para liquidificador','MLB73055').state).toBe('EXCLUDE');
 expect(assessAppliances('Forno industrial a gás','MLB120314').state).toBe('REVIEW');
 expect(assessAppliances('Mop spray','MLB4337').state).toBe('REVIEW');
 expect(new Set(APPLIANCES_CATEGORIES.map(c=>c.id)).size).toBe(42);
});
it('does not admit a product with price and photo but unknown voltage/model',()=>{
 const p:any={title:'Liquidificador',status:'CATALOG',comparable:true,seller_trusted:true,currency:'BRL',price:100,image:'https://http2.mlstatic.com/p.jpg',url:'https://www.mercadolivre.com.br/p/MLB123'};
 expect(appliancesEligible(p,'MLB73055')).toBe(false);
 expect(appliancesEligible({...p,appliance_specs:applianceSpecs(catalog())},'MLB73055')).toBe(true);
});
it('retains electrical evidence even when listing endpoints are unavailable',async()=>{
 const p=await resolveAppliancePreview('MLB123','PRODUCT',async path=>{if(path==='/products/MLB123')return {...catalog(),name:'Liquidificador'};throw Error('Unavailable');});
 expect(p.appliance_specs?.voltage).toBe('127 V');expect(p.description).toContain('Modelo 1');expect(p.price).toBe(null);
});
