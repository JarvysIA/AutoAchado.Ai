import { describe, expect, it } from "vitest";
import { resolveProductPreview, safePreviewUrl } from "../src/server/discovery/product-preview.js";
const item = { id: "MLB123", title: "Farol LED", status: "active", permalink: "http://produto.mercadolivre.com.br/MLB-123-farol-_JM", price: 129.9, currency_id: "BRL", secure_thumbnail: "https://http2.mlstatic.com/farol.jpg", catalog_product_id: "MLB456", user_product_id: "MLBU789", seller_id: 42 };
const reader = (responses: Record<string, any>) => async (path: string) => {
  if (!(path in responses)) throw new Error("restricted");
  return responses[path];
};
describe("preview resolution", () => {
  it("resolves an item using its official permalink, photo, price and description", async () => {
    const result = await resolveProductPreview("MLB123", "ITEM", reader({"/items/MLB123":item,"/items/MLB123/description":{plain_text:"Farol com acabamento preto"}}));
    expect(result).toMatchObject({title:"Farol LED",price:129.9,status:"AVAILABLE",image:item.secure_thumbnail,description:"Farol com acabamento preto"});
    expect(result.url).toBe(item.permalink.replace("http:","https:"));
  });
  it("resolves a catalog offer before presenting its price", async () => {
    const result = await resolveProductPreview("MLB456", "PRODUCT", reader({"/products/MLB456":{id:"MLB456",name:"Farol",buy_box_winner:{item_id:"MLB123"}},"/items/MLB123":item}));
    expect(result).toMatchObject({price:129.9,status:"AVAILABLE"});
  });
  it("resolves MLBU through the seller's associated item", async () => {
    const result = await resolveProductPreview("MLBU789", "USER_PRODUCT", reader({"/user-products/MLBU789":{id:"MLBU789",user_id:42},"/users/42/items/search?user_product_id=MLBU789&limit=1":{results:["MLB123"]},"/items/MLB123":item}));
    expect(result.status).toBe("AVAILABLE");
    expect(result.url).not.toContain("MLBU");
  });
  it("keeps catalog metadata if offers are restricted", async () => {
    const result = await resolveProductPreview("MLB456", "PRODUCT", reader({"/products/MLB456":{id:"MLB456",name:"Farol",permalink:"https://www.mercadolivre.com.br/p/MLB456"}}));
    expect(result).toMatchObject({title:"Farol",status:"CATALOG",price:null});
  });
  it("does not invent links for restricted MLBU or paused items", async () => {
    expect((await resolveProductPreview("MLBU789","USER_PRODUCT",reader({}))).url).toBe("https://www.mercadolivre.com.br/up/MLBU789");
    expect(await resolveProductPreview("MLB123","ITEM",reader({"/items/MLB123":{...item,status:"paused"}}))).toMatchObject({url:"https://produto.mercadolivre.com.br/MLB-123-_JM",price:null,status:"UNAVAILABLE"});
  });
  it("rejects mismatched identities and malicious URLs", async () => {
    expect((await resolveProductPreview("MLB123","ITEM",reader({"/items/MLB123":{...item,id:"MLB999"}}))).url).toBe("https://produto.mercadolivre.com.br/MLB-123-_JM");
    for (const url of ["javascript:alert(1)","https://mercadolivre.com.br.evil.test/","https://evil.test/", "https://user@www.mercadolivre.com.br/"]) expect(safePreviewUrl(url)).toBeNull();
    expect(safePreviewUrl("https://http2.mlstatic.com/a.jpg",true)).toBeTruthy();
  });
});

describe("catalog price fallbacks", () => {
  it("preserves winner price with the specific offer link if item details fail", async () => {
    const result = await resolveProductPreview("MLB456", "PRODUCT", reader({"/products/MLB456":{id:"MLB456",status:"active",permalink:"",buy_box_winner:{item_id:"MLB123",price:19.99,currency_id:"BRL"}}}));
    expect(result).toMatchObject({url:"https://www.mercadolivre.com.br/p/MLB456",offer_item_id:"MLB123",price:19.99,priceSource:"CATALOG_OFFER"});
  });
  it("uses product offers prices independently of restricted item details", async () => {
    const result = await resolveProductPreview("MLB456", "PRODUCT", reader({"/products/MLB456":{id:"MLB456"},"/products/MLB456/items?limit=1":{results:[{item_id:"MLB123",price:25,currency_id:"BRL"}]}}));
    expect(result.price).toBe(25);
  });
  it("uses sale_price if the item price is missing", async () => {
    const result = await resolveProductPreview("MLB123", "ITEM", reader({"/items/MLB123":{...item,price:null},"/items/MLB123/sale_price":{amount:22.5,currency_id:"BRL"}}));
    expect(result).toMatchObject({price:22.5,priceSource:"SALE_PRICE"});
  });
  it("keeps links even when product metadata is restricted", async () => {
    expect((await resolveProductPreview("MLB456", "PRODUCT", reader({}))).url).toBe("https://www.mercadolivre.com.br/p/MLB456");
  });
});
it("retains an ITEM link when both detail and price are forbidden", async () => {
  const result = await resolveProductPreview("MLB5425836866", "ITEM", reader({}));
  expect(result).toMatchObject({url:"https://produto.mercadolivre.com.br/MLB-5425836866-_JM",price:null,image:null,status:"UNRESOLVED"});
});
describe("consistent reference prices", () => {
 it("drops an old catalog reference when the item supplies a new price without a reference", async () => {
  const result = await resolveProductPreview("MLB456","PRODUCT",reader({"/products/MLB456":{id:"MLB456",buy_box_winner:{item_id:"MLB123",price:80,original_price:100,currency_id:"BRL"}},"/items/MLB123":{...item,price:90}}));
  expect(result.price).toBe(90); expect(result.original_price).toBeUndefined();
 });
 it("retains reference and currency from the selected sale price response", async () => {
  const result = await resolveProductPreview("MLB123","ITEM",reader({"/items/MLB123/sale_price":{amount:80,regular_amount:100,currency_id:"BRL"}}));
  expect(result).toMatchObject({price:80,original_price:100,currency:"BRL",priceSource:"SALE_PRICE"});
 });
 it("clears reference prices for unavailable or mismatched offers", async () => {
  const result = await resolveProductPreview("MLB456","PRODUCT",reader({"/products/MLB456":{id:"MLB456",buy_box_winner:{item_id:"MLB123",price:80,original_price:100,currency_id:"BRL"}},"/items/MLB123":{...item,status:"paused"}}));
  expect(result.price).toBeNull(); expect(result.original_price).toBeUndefined();
 });
});

describe("commercial identity and reputation evidence", () => {
 it("only enables comparison after item identity, condition and seller are checked", async () => {
  const result=await resolveProductPreview("MLB123","ITEM",reader({"/items/MLB123":{...item,condition:"new",variations:[]},"/users/42":{id:42,seller_reputation:{level_id:"5_green"}}}));
  expect(result).toMatchObject({catalog_product_id:"MLB456",comparable:true,seller_id:"42",seller_trusted:true,seller_level:"5_green"});
 });
 it("does not compare used or multi-variation listings",async()=>{
  for(const change of [{condition:"used",variations:[]},{condition:"new",variations:[{id:1},{id:2}]}]) {
   const result=await resolveProductPreview("MLB123","ITEM",reader({"/items/MLB123":{...item,...change}}));
   expect(result.comparable).toBe(false);
  }
 });
 it("does not accept reputation from a different seller",async()=>{
  const result=await resolveProductPreview("MLB123","ITEM",reader({"/items/MLB123":{...item,condition:"new",variations:[]},"/users/42":{id:999,seller_reputation:{level_id:"5_green"}}}));
  expect(result.seller_trusted).not.toBe(true);
 });
});

describe("catalog offer evidence despite restricted item details",()=>{
 it("uses official catalog offer condition and seller reputation without inventing item details",async()=>{
  const result=await resolveProductPreview("MLB456","PRODUCT",reader({
   "/products/MLB456":{id:"MLB456",status:"active",children_ids:[],name:"Aspirador",sold_quantity:500,buy_box_winner:{item_id:"MLB123",seller_id:42,price:80,currency_id:"BRL"}},
   "/products/MLB456/items?limit=3":{results:[{item_id:"MLB123",seller_id:42,price:80,currency_id:"BRL",condition:"new"}]},
   "/users/42":{id:42,seller_reputation:{level_id:"5_green"}}
  }));
  expect(result).toMatchObject({comparable:true,seller_trusted:true,seller_id:"42",catalog_product_id:"MLB456",sales_total_reported:500,sales_source:"CATALOG",price:80});
 });
 it("rejects catalog parent products and offers with unknown condition",async()=>{
  for(const change of [{children_ids:["MLB999"],condition:"new"},{children_ids:[],condition:undefined}]) {
   const result=await resolveProductPreview("MLB456","PRODUCT",reader({"/products/MLB456":{id:"MLB456",status:"active",children_ids:change.children_ids,buy_box_winner:{item_id:"MLB123",seller_id:42,price:80,currency_id:"BRL",condition:change.condition}},"/users/42":{id:42,seller_reputation:{level_id:"5_green"}}}));
   expect(result.comparable).not.toBe(true);
  }
 });
});

it('binds alternative catalog prices to their own offer, not the catalog or another seller',async()=>{
 const {catalogOfferPreview}=await import('../src/server/discovery/product-preview.js');
 const base={title:'Compressor',description:null,image:null,url:'https://www.mercadolivre.com.br/p/MLB20562024',price:199.98,currency:'BRL',status:'CATALOG' as const,catalog_product_id:'MLB20562024',offer_item_id:'MLB999'};
 const result=await catalogOfferPreview('MLB20562024',base,{item_id:'MLB123',seller_id:42,condition:'new',price:61.09,currency_id:'BRL'},reader({}));
 expect(result).toMatchObject({price:61.09,offer_item_id:'MLB123',url:'https://www.mercadolivre.com.br/p/MLB20562024'});
});

it('uses an official permalink from multiget when available and keeps catalog prices unverified otherwise',async()=>{
 const response=await resolveProductPreview('MLB123','ITEM',reader({'/items?ids=MLB123':[{code:200,body:{...item,condition:'new',variations:[]}}]}));
 expect(response).toMatchObject({priceLinkVerified:true,url:item.permalink.replace('http:','https:')});
 const catalog=await resolveProductPreview('MLB456','PRODUCT',reader({'/products/MLB456':{id:'MLB456',buy_box_winner:{item_id:'MLB123',price:61.09,currency_id:'BRL'}}}));
 expect(catalog).toMatchObject({price:61.09,priceLinkVerified:false,url:'https://www.mercadolivre.com.br/p/MLB456'});
});
