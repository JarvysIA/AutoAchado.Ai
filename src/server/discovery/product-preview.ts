import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMeliOAuthRuntimeOperationRotationService } from "../oauth/factory.js";

export interface ProductPreview {
  title: string;
  description: string | null;
  image: string | null;
  url: string | null;
  price: number | null;
  currency: string;
  priceSource?: "CATALOG_OFFER" | "ITEM" | "SALE_PRICE";
  priceCheckedAt?: string;
  status: "AVAILABLE" | "CATALOG" | "UNRESOLVED" | "UNAVAILABLE";
}
type RecordValue = Record<string, any>;
export type PreviewReader = (path: string) => Promise<RecordValue>;
export function safePreviewUrl(value: unknown, image = false): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const root = image ? "mlstatic.com" : "mercadolivre.com.br";
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port
      || !(url.hostname === root || url.hostname.endsWith("." + root))) return null;
    url.protocol = "https:";
    return url.href;
  } catch { return null; }
}
const shortText = (value: unknown, max = 240): string | null => typeof value === "string" ? value.slice(0, max) : null;
function picture(data: RecordValue): string | null {
  const pictures = Array.isArray(data.pictures) ? data.pictures : [];
  for (const value of [data.secure_thumbnail, ...pictures.flatMap(p => [p?.secure_url, p?.url]), data.thumbnail]) {
    const url = safePreviewUrl(value, true);
    if (url) return url;
  }
  return null;
}
export function publicProductUrl(id: string, type: string): string | null {
  if (type === "ITEM" && /^MLB\d+$/.test(id)) return `https://produto.mercadolivre.com.br/MLB-${id.slice(3)}-_JM`;
  if (type === "PRODUCT" && /^MLB\d+$/.test(id)) return `https://www.mercadolivre.com.br/p/${id}`;
  if (type === "USER_PRODUCT" && /^MLBU\d+$/.test(id)) return `https://www.mercadolivre.com.br/up/${id}`;
  return null;
}
function setPrice(preview: ProductPreview, amount: unknown, currency: unknown, source: NonNullable<ProductPreview["priceSource"]>) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return;
  preview.price = amount; preview.currency = currency; preview.priceSource = source;
  preview.priceCheckedAt = new Date().toISOString();
}
export async function resolveProductPreview(id: string, type: string, read: PreviewReader): Promise<ProductPreview> {
  const preview: ProductPreview = { title: id, description: null, image: null, url: null, price: null, currency: "BRL", status: "UNRESOLVED" };
  if (!(type === "USER_PRODUCT" ? /^MLBU\d+$/.test(id) : ["PRODUCT", "ITEM"].includes(type) && /^MLB\d+$/.test(id))) return preview;
  preview.url = publicProductUrl(id, type);
  if (preview.url && type !== "ITEM") preview.status = "CATALOG";
  try {
    let itemId = type === "ITEM" ? id : null;
    let sellerId: string | null = null;
    if (type !== "ITEM") {
      const data = await read(type === "PRODUCT" ? `/products/${id}` : `/user-products/${id}`);
      if (data.id !== id) return preview;
      preview.title = shortText(data.name) ?? id;
      preview.image = picture(data);
      const attributes = Array.isArray(data.attributes) ? data.attributes : [];
      preview.description = attributes.slice(0, 4).map(a => [shortText(a?.name, 50), shortText(a?.value_name, 80)].filter(Boolean).join(": ")).filter(Boolean).join(" · ").slice(0, 400) || null;
      if (type === "PRODUCT") {
        preview.url = safePreviewUrl(data.permalink) ?? preview.url;
        preview.status = preview.url ? "CATALOG" : "UNRESOLVED";
        itemId = data.buy_box_winner?.item_id ?? null;
        if (typeof itemId === "string" && /^MLB\d+$/.test(itemId) && data.status !== "inactive") {
          setPrice(preview, data.buy_box_winner?.price, data.buy_box_winner?.currency_id, "CATALOG_OFFER");
        }
        if (!itemId) {
          const offers = await read(`/products/${id}/items?limit=1`);
          const offer = offers.results?.[0];
          itemId = offer?.item_id ?? null;
          if (typeof itemId === "string" && /^MLB\d+$/.test(itemId) && (!offer.product_id || offer.product_id === id)) {
            setPrice(preview, offer.price, offer.currency_id, "CATALOG_OFFER");
          }
        }
      } else {
        sellerId = /^\d+$/.test(String(data.user_id)) ? String(data.user_id) : null;
        if (sellerId) {
          const items = await read(`/users/${sellerId}/items/search?user_product_id=${id}&limit=1`);
          itemId = items.results?.[0] ?? null;
        }
      }
    }
    if (typeof itemId !== "string" || !/^MLB\d+$/.test(itemId)) return preview;
    let item;
    try { item = await read(`/items/${itemId}`); }
    catch {
      try {
        const sale = await read(`/items/${itemId}/sale_price`);
        setPrice(preview, sale.amount, sale.currency_id, "SALE_PRICE");
      } catch { /* Keep the catalog offer price if item access is restricted. */ }
      return preview;
    }
    if (item.id !== itemId || (type === "USER_PRODUCT" && (item.user_product_id !== id || String(item.seller_id) !== sellerId))
      || (type === "PRODUCT" && item.catalog_product_id !== id)) { preview.price = null; delete preview.priceSource; delete preview.priceCheckedAt; return preview; }
    preview.title = shortText(item.title) ?? preview.title;
    preview.image = picture(item) ?? preview.image;
    if (item.status !== "active") {
      preview.price = null; delete preview.priceSource; delete preview.priceCheckedAt;
      if (type === "ITEM" || !preview.url) preview.status = "UNAVAILABLE";
      return preview;
    }
    const url = safePreviewUrl(item.permalink);
    if (url) { preview.url = url; preview.status = "AVAILABLE"; }
    setPrice(preview, item.price, item.currency_id, "ITEM");
    if (preview.price === null) {
      try { const sale = await read(`/items/${itemId}/sale_price`); setPrice(preview, sale.amount, sale.currency_id, "SALE_PRICE"); } catch { /* Price unavailable. */ }
    }
    preview.currency = typeof item.currency_id === "string" && /^[A-Z]{3}$/.test(item.currency_id) ? item.currency_id : "BRL";
    try {
      const description = await read(`/items/${itemId}/description`);
      preview.description = shortText(description.plain_text, 400) ?? preview.description;
    } catch { /* The summary remains usable if the description is restricted. */ }
  } catch { /* Keep public metadata obtained before a restricted or unavailable endpoint. */ }
  return preview;
}

let token: { value: string; expires: number } | undefined;
let pendingToken: Promise<string> | undefined;
async function accessToken(client: SupabaseClient): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const result = await createMeliOAuthRuntimeOperationRotationService(client)
      .rotateMeliAccessTokenForRuntimeOperation("preview-" + randomUUID());
    if (result.outcome !== "ROTATED") throw new Error("PREVIEW_AUTH_UNAVAILABLE");
    token = { value: result.accessToken, expires: Date.now() + Math.max(0, result.expiresIn - 60) * 1000 };
    return token.value;
  })();
  try { return await pendingToken; } finally { pendingToken = undefined; }
}
const previews = new Map<string, { expires: number; value: Promise<ProductPreview> }>();
export async function configuredProductPreview(client: SupabaseClient, id: string, type: string): Promise<ProductPreview> {
  const key = type + ":" + id;
  const cached = previews.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (async () => {
    const bearer = await accessToken(client);
    const signal = AbortSignal.timeout(20000);
    const result = await resolveProductPreview(id, type, async path => {
      const response = await fetch("https://api.mercadolibre.com" + path, {
        headers: { Authorization: "Bearer " + bearer, Accept: "application/json" }, signal,
      });
      if (response.status === 401) token = undefined;
      if (!response.ok) {
        console.warn(JSON.stringify({event:"PREVIEW_UPSTREAM_FAILED", id, type, path, status:response.status}));
        throw new Error("PREVIEW_FETCH_FAILED");
      }
      return await response.json() as RecordValue;
    });
    console.info(JSON.stringify({event:"PREVIEW_RESOLVED", id, type, hasTitle:result.title !== id, hasImage:Boolean(result.image), hasPrice:result.price !== null}));
    return result;
  })();
  if (previews.size >= 500) previews.delete(previews.keys().next().value!);
  previews.set(key, { expires: Date.now() + 120000, value });
  try { return await value; } catch (error) { previews.delete(key); throw error; }
}
