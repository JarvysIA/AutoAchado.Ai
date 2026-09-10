import {it,expect} from 'vitest';
import {affiliateLink,offerMessage,workerAuth} from '../src/server/whatsapp/service.js';
it('rejects deceptive or unsafe affiliate destinations',()=>{
 for(const url of ['http://meli.la/x','https://meli.la.evil.test/x','https://user@meli.la/x','javascript:alert(1)'])expect(()=>affiliateLink(url)).toThrow();
 expect(affiliateLink('https://meli.la/abc')).toBe('https://meli.la/abc');
});
it('formats announced discounts honestly with WhatsApp strike-through',()=>{
 const text=offerMessage({title:'Compressor',price:17,original_price:20,has_advertised_discount:true,discount_percent:15},'https://meli.la/test');
 expect(text).toContain('~De: R$ 20,00~');expect(text).toContain('15% de desconto anunciado');expect(text).not.toContain('histórica');expect(text).toContain('\n\n📦');
});
it('rejects worker credentials before accessing storage',async()=>{
 await expect(workerAuth({} as any,undefined)).rejects.toThrow('CONNECTOR_UNAUTHORIZED');
 await expect(workerAuth({} as any,'Bearer short')).rejects.toThrow('CONNECTOR_UNAUTHORIZED');
});
