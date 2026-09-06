export interface MeliCoupon {
  code: string;
  description: string;
  discountValue: string;
  minPurchase?: number;
  categoryMatch?: string[];
  expirationText?: string;
  active: boolean;
  discountType: "PERCENT" | "FIXED";
  amount: number;
  maxDiscount?: number;
  startsAt: string;
  expiresAt: string;
  verifiedAt: string;
  sourceUrl: string;
  restrictions: string;
}

// Only add campaigns after checking their official terms. Example codes are not live coupons.
export const couponRegistry: readonly MeliCoupon[] = [];

export function activeCoupons(coupons: readonly MeliCoupon[] = couponRegistry, now = Date.now()): MeliCoupon[] {
  return coupons.filter(c => {
    let official = false;
    try {
      const url = new URL(c.sourceUrl);
      official = url.protocol === "https:" && !url.username && !url.password && !url.port
        && (url.hostname === "mercadolivre.com.br" || url.hostname.endsWith(".mercadolivre.com.br"));
    } catch { /* An unverified source must not activate a campaign. */ }
    return c.active && official && !!c.code.trim() && Number.isFinite(c.amount) && c.amount > 0
      && (c.discountType === "FIXED" || (c.discountType === "PERCENT" && c.amount <= 100))
      && (c.minPurchase === undefined || (Number.isFinite(c.minPurchase) && c.minPurchase >= 0))
      && (c.maxDiscount === undefined || (Number.isFinite(c.maxDiscount) && c.maxDiscount > 0))
      && Date.parse(c.startsAt) <= now && Date.parse(c.expiresAt) > now
      && Date.parse(c.verifiedAt) <= now && Date.parse(c.verifiedAt) >= Date.parse(c.startsAt);
  });
}

export function findBestCouponForProduct(categoryId: string, price: number,
  coupons: readonly MeliCoupon[] = couponRegistry, now = Date.now()): MeliCoupon | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const eligible = activeCoupons(coupons, now).filter(c => price >= (c.minPurchase ?? 0)
    && (c.categoryMatch?.includes("ALL") || (/^MLB\d+$/.test(categoryId) && c.categoryMatch?.includes(categoryId))));
  const saving = (c: MeliCoupon) => Math.min(price, c.maxDiscount ?? Infinity,
    c.discountType === "PERCENT" ? price * c.amount / 100 : c.amount);
  return eligible.sort((a, b) => saving(b) - saving(a) || a.code.localeCompare(b.code))[0] ?? null;
}

export function affiliateIntelligence(item: {price: number | null; original_price?: number; currency: string; category_id?: string}) {
  const valid = typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0
    && typeof item.original_price === "number" && Number.isFinite(item.original_price) && item.original_price > item.price;
  const percent = valid ? ((item.original_price! - item.price!) / item.original_price!) * 100 : 0;
  return { discount_percent: Math.round(percent), has_advertised_discount: percent >= 5,
    matched_coupon: item.currency === "BRL" ? findBestCouponForProduct(item.category_id ?? "", item.price ?? 0) : null };
}
