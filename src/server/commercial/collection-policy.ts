import type {ProductPreview} from '../discovery/product-preview.js';
export const HISTORY_BATCH_SIZE=25;
export function validEvidenceAt(preview:ProductPreview,now=Date.now()):string|null {
 const time=Date.parse(preview.priceCheckedAt??'');
 return preview.status!=='UNAVAILABLE'&&preview.comparable&&preview.seller_trusted&&preview.currency==='BRL'
  &&typeof preview.price==='number'&&Number.isFinite(preview.price)&&preview.price>0
  &&Number.isFinite(time)&&time<=now+60000&&time>=now-15*60000?new Date(time).toISOString():null;
}
export function nextEvidenceCheck(success:boolean,failures:number,now=Date.now()):string {
 const minutes=success?720:Math.min(360,30*2**Math.min(Math.max(failures-1,0),4));
 return new Date(now+minutes*60000).toISOString();
}
