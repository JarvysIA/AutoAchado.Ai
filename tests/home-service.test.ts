import {it,expect} from 'vitest';
import {homeContext,homeEligible} from '../src/server/commercial/home-service.js';
import {rankProduct} from '../src/server/commercial/ranking.js';
it('uses HOME editorial rules without inheriting Automotive product families',()=>{
 const p:any={title:'Kit potes herméticos vidro',description:null,price:50,currency:'BRL',original_price:100,
  image:'https://http2.mlstatic.com/p.jpg',url:'https://www.mercadolivre.com.br/p/MLB123',catalog_product_id:'MLB123',
  comparable:true,seller_trusted:true,status:'CATALOG',priceCheckedAt:new Date().toISOString(),priceLinkVerified:false};
 expect(homeEligible(p,'MLB244658')).toBe(true);
 const rank=rankProduct(p,[],null,Date.now(),homeContext(p.title,'MLB244658'));
 expect(rank.group).toBe('cozinha');expect(rank.state).toBe('OBSERVING');expect(rank.history_sufficient).toBe(false);
 expect(homeEligible({...p,title:'Whey proteína'},'MLB244658')).toBe(false);
 expect(homeEligible({...p,price:null},'MLB244658')).toBe(false);
 expect(homeEligible({...p,seller_trusted:false},'MLB244658')).toBe(false);
});
