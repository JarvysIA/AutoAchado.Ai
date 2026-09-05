import { describe, it, expect } from "vitest";
import { Script, createContext } from "node:vm";
import { dashboardPage } from "../src/ui/dashboard.js";

describe("operational dashboard browser script", () => {
  it("renders persisted rows as text, refreshes count and posts both actions", async () => {
    const elements = new Map<string, any>();
    const node = () => ({ textContent: "", disabled: false, children: [] as any[], handlers: {} as any,
      append(child: any) { this.children.push(child); }, replaceChildren() { this.children = []; },
      addEventListener(event: string, handler: any) { this.handlers[event] = handler; } });
    for (const id of ["count", "synced", "snapshots", "message", "sweep", "smoke", "refresh"]) elements.set(id, node());
    const calls: any[] = [];
    const context = createContext({ document: { getElementById: (id: string) => elements.get(id),
      createElement: node, querySelectorAll: () => [elements.get("sweep"), elements.get("smoke"), elements.get("refresh")] },
      setInterval: () => 0, fetch: async (path: string, options: any) => {
        calls.push({path, options});
        return { ok: true, json: async () => path.endsWith("latest-snapshots") ? {
          total: 345, syncedAt: "2026-09-05T00:00:00Z", snapshots: [{ product_id: "<script>alert(1)</script>", observed_at: "2026-09-05T00:00:00Z" }]
        } : { status: "COMPLETED", persisted: 2 } };
      } });
    const html = dashboardPage({authorized: true, userId: "296984475"});
    new Script(html.match(/<script>([\s\S]*?)<\/script>/)![1]!).runInContext(context);
    await new Promise(resolve => setImmediate(resolve));
    expect(elements.get("count").textContent).toBe("345");
    expect(elements.get("snapshots").children[0].children[0].children[0].textContent).toBe("<script>alert(1)</script>");
    await elements.get("sweep").handlers.click();
    await elements.get("smoke").handlers.click();
    expect(calls.filter(call => call.options.method === "POST").map(call => call.path)).toEqual(["/api/discovery/sweep", "/api/discovery/smoke"]);
    expect(calls.every(call => call.options.cache === "no-store")).toBe(true);
  });
});
