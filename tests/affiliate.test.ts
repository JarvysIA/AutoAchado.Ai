import { describe, expect, it } from "vitest";
import { activeCoupons, affiliateIntelligence, findBestCouponForProduct, type MeliCoupon } from "../src/server/affiliate/coupon-service.js";
const now = Date.parse("2026-09-05T12:00:00Z");
const coupon: MeliCoupon = {code:"TEST_ONLY", description:"Fixture only", discountValue:"10% OFF", active:true,
 discountType:"PERCENT", amount:10, minPurchase:100, categoryMatch:["MLB5672"], startsAt:"2026-09-01T00:00:00Z",
 expiresAt:"2026-09-06T00:00:00Z", verifiedAt:"2026-09-05T00:00:00Z", sourceUrl:"https://www.mercadolivre.com.br/l/promocoes", restrictions:"Confira as condições"};
describe("affiliate intelligence", () => {
 it("starts without fabricated active campaigns", () => expect(activeCoupons()).toEqual([]));
 it("requires a verified official source and active validity", () => {
  for (const change of [{active:false},{expiresAt:"2026-09-04"},{verifiedAt:"invalid"},{sourceUrl:"https://evil.test"},{startsAt:"2027-01-01"},{amount:NaN},{discountType:"PERCENT" as const,amount:101}])
   expect(activeCoupons([{...coupon,...change}],now)).toEqual([]);
 });
 it("matches exact external categories and minimum spend, without guessing ancestry", () => {
  expect(findBestCouponForProduct("MLB5672",100,[coupon],now)?.code).toBe("TEST_ONLY");
  for (const category of ["uuid-category","MLB22818",""]) expect(findBestCouponForProduct(category,100,[coupon],now)).toBeNull();
  expect(findBestCouponForProduct("MLB5672",99,[coupon],now)).toBeNull();
  expect(findBestCouponForProduct("",150,[{...coupon,categoryMatch:["ALL"]}],now)).not.toBeNull();
 });
 it("compares monetary savings including percentage caps", () => {
  expect(findBestCouponForProduct("MLB5672",200,[{...coupon,maxDiscount:5},{...coupon,code:"FIXED",discountType:"FIXED",amount:15}],now)?.code).toBe("FIXED");
 });
 it("does not promote rounded 4.99 percent as at least five percent", () => {
  expect(affiliateIntelligence({price:95.01,original_price:100,currency:"BRL"})).toMatchObject({discount_percent:5,has_advertised_discount:false});
  expect(affiliateIntelligence({price:95,original_price:100,currency:"BRL"})).toMatchObject({discount_percent:5,has_advertised_discount:true});
  for(const price of [null,0,-1,NaN,Infinity,101]) expect(affiliateIntelligence({price,original_price:100,currency:"BRL"}).has_advertised_discount).toBe(false);
 });
});
