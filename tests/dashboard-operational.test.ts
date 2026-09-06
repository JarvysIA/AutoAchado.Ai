import { describe, it, expect } from "vitest";
import { Script, createContext } from "node:vm";
import { dashboardPage } from "../src/ui/dashboard.js";

describe("operational dashboard browser script", () => {
  it("renders persisted rows as text, refreshes count and posts both actions", async () => {
    const elements = new Map<string, any>();
    const node = () => ({ textContent: "", disabled: false, children: [] as any[], handlers: {} as any, value: "", hidden:false, focus() {}, select() {}, setAttribute() {},
      append(child: any) { this.children.push(child); }, replaceChildren() { this.children = []; },
      addEventListener(event: string, handler: any) { this.handlers[event] = handler; } });
    for (const id of ["count", "synced", "snapshots", "message", "sweep", "smoke", "refresh", "more", "results-summary", "coupons", "copy-status", "manual-copy", ...["all","discount","tier","coupon","incomplete"].map(f => "filter-" + f)]) elements.set(id, node());
    const calls: any[] = [];
    const copied: string[] = [];
    const storage = new Map<string,string>();
    const context = createContext({ URL, navigator:{clipboard:{writeText:async (text:string) => {copied.push(text);}}}, setTimeout:() => 0, localStorage:{getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value)}, document: { getElementById: (id: string) => elements.get(id),
      createElement: node, querySelectorAll: () => [elements.get("sweep"), elements.get("smoke"), elements.get("refresh")] },
      setInterval: () => 0, fetch: async (path: string, options: any) => {
        calls.push({path, options});
        return { ok: true, json: async () => path.endsWith("latest-snapshots") ? {
          total: 345, syncedAt: "2026-09-05T00:00:00Z", snapshots: [{product_id:"MLBU999",type:"USER_PRODUCT"}, { product_id: "MLB123", type:"ITEM", priority_tier:"A", observed_at: "2026-09-05T00:00:00Z" }]
        } : path.endsWith("/coupons") ? {coupons:[]} : path.includes("MLBU999") ? {title:"MLBU999",url:"https://www.mercadolivre.com.br/up/MLBU999"} : path.includes("/preview?") ? { title: "<script>alert(1)</script>", url: "https://produto.mercadolivre.com.br/MLB-123-_JM", price: 123, currency: "BRL", image:"https://http2.mlstatic.com/test.jpg", status: "AVAILABLE" } : { status: "COMPLETED", persisted: 2 } };
      } });
    const html = dashboardPage({authorized: true, userId: "296984475"});
    new Script(html.match(/<script>([\s\S]*?)<\/script>/)![1]!).runInContext(context);
    await new Promise(resolve => setImmediate(resolve));
    expect(elements.get("count").textContent).toBe("345");
    expect(elements.get("snapshots").children[0].children[1].children[0].textContent).toBe("<script>alert(1)</script>");
    expect(elements.get("results-summary").textContent).toContain("1 completos · 1 incompletos");
    const body = elements.get("snapshots").children[0].children[1];
    const button = body.children.find((n:any) => n.className === "copy-button");
    const input = body.children.find((n:any) => n.children[0]?.type === "url").children[0];
    await button.handlers.click(); expect(copied).toEqual([]);
    input.value="https://meli.la/test-link"; input.handlers.change(); await button.handlers.click();
    expect(copied[0]).toContain("R$ 123,00"); expect(copied[0]).toContain("\n📦");
    expect(copied[0]).toContain("Link de afiliado"); expect(storage.size).toBe(1);
    input.value="https://mercadolivre.com.br.evil.test/"; await button.handlers.click(); expect(copied).toHaveLength(1);
    input.value="https://meli.la/test-link";
    context.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
    await button.handlers.click();
    expect(elements.get("manual-copy").hidden).toBe(false);
    expect(elements.get("manual-copy").value).toContain("https://meli.la/test-link");
    elements.get("filter-incomplete").handlers.click();
    expect(elements.get("snapshots").children[0].children[1].children[0].textContent).toBe("MLBU999");
    elements.get("filter-discount").handlers.click();
    expect(elements.get("results-summary").textContent).toContain("0 neste filtro");
    await elements.get("sweep").handlers.click();
    await elements.get("smoke").handlers.click();
    expect(calls.filter(call => call.options.method === "POST").map(call => call.path)).toEqual(["/api/discovery/sweep", "/api/discovery/smoke"]);
    expect(calls.every(call => call.options.cache === "no-store")).toBe(true);
  });
});
