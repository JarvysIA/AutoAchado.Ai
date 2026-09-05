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
    expect(await resolveProductPreview("MLB123","ITEM",reader({"/items/MLB123":{...item,status:"paused"}}))).toMatchObject({url:null,price:null,status:"UNAVAILABLE"});
  });
  it("rejects mismatched identities and malicious URLs", async () => {
    expect((await resolveProductPreview("MLB123","ITEM",reader({"/items/MLB123":{...item,id:"MLB999"}}))).url).toBeNull();
    for (const url of ["javascript:alert(1)","https://mercadolivre.com.br.evil.test/","https://evil.test/", "https://user@www.mercadolivre.com.br/"]) expect(safePreviewUrl(url)).toBeNull();
    expect(safePreviewUrl("https://http2.mlstatic.com/a.jpg",true)).toBeTruthy();
  });
});

describe("catalog price fallbacks", () => {
  it("preserves winner price and canonical catalog link if item details fail", async () => {
    const result = await resolveProductPreview("MLB456", "PRODUCT", reader({"/products/MLB456":{id:"MLB456",status:"active",permalink:"",buy_box_winner:{item_id:"MLB123",price:19.99,currency_id:"BRL"}}}));
    expect(result).toMatchObject({url:"https://www.mercadolivre.com.br/p/MLB456",price:19.99,priceSource:"CATALOG_OFFER"});
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