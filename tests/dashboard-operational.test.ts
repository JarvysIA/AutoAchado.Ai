import { describe, it, expect } from "vitest";
import { Script, createContext } from "node:vm";
import { dashboardPage } from "../src/ui/dashboard.js";

describe("operational dashboard browser script", () => {
  it("renders persisted rows as text, refreshes count and posts both actions", async () => {
    const elements = new Map<string, any>();
    const node = () => ({ textContent: "", disabled: false, children: [] as any[], handlers: {} as any, value: "", hidden:false, open:false, querySelector(selector:string):any {for(const child of this.children) {if(child.className===selector.slice(1)) return child;const found=child.querySelector(selector);if(found)return found;}return null;}, focus() {}, scrollIntoView() {}, select() {}, attributes:{} as any, setAttribute(key:string,value:string) {this.attributes[key]=value;},
      append(child: any) { this.children.push(child); }, replaceChildren(...children:any[]) { this.children = children; },
      addEventListener(event: string, handler: any) { this.handlers[event] = handler; } });
    for (const id of ["vertical-title", "vertical-products", ...Array.from({length:10},(_,i)=>"vertical-"+i), "count", "synced", "snapshots", "message", "sweep", "smoke", "refresh", "more", "results-summary", "raw-products", "commercial-results", "commercial-status", "commercial-summary", "commercial-more", "collect-evidence", "rank-APPROVED", "rank-ALL", "rank-SENT", "admin-summary", "coupons", "copy-status", "manual-copy", ...["all","discount","tier","coupon","incomplete"].map(f => "filter-" + f)]) elements.set(id, node());
    elements.get("raw-products").open=true;
    const calls: any[] = [];
    const copied: string[] = [];
    let revalidationReady=true, revalidationPrice=123;
    const storage = new Map<string,string>();
    const context = createContext({ URL, navigator:{clipboard:{writeText:async (text:string) => {copied.push(text);}}}, setTimeout:() => 0, localStorage:{getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value)}, document: { getElementById: (id: string) => elements.get(id),
      createElement: node, querySelectorAll: () => [elements.get("sweep"), elements.get("smoke"), elements.get("refresh")] },
      setInterval: () => 0, fetch: async (path: string, options: any) => {
        calls.push({path, options});
        return { ok: true, json: async () => path.endsWith("latest-snapshots") ? {
          total: 345, syncedAt: "2026-09-05T00:00:00Z", snapshots: [{product_id:"MLBU999",type:"USER_PRODUCT"}, { product_id: "MLB123", type:"ITEM", priority_tier:"A", observed_at: "2026-09-05T00:00:00Z" }]
        } : path.includes("/commercial/revalidate?") ? {ready:revalidationReady,preview:{title:"<script>alert(1)</script>",url:"https://produto.mercadolivre.com.br/MLB-123-_JM",price:revalidationPrice,original_price:150,currency:"BRL",image:"https://http2.mlstatic.com/test.jpg",status:"AVAILABLE"}} : path.includes("/commercial/opportunities") ? {entries:[],counts:{approved:0,observing:0,rejected:0,monitored:0},total:0,hasMore:false,lastCollection:null} : path.endsWith("/coupons") ? {coupons:[]} : path.includes("MLBU999") ? {title:"MLBU999",url:"https://www.mercadolivre.com.br/up/MLBU999"} : path.includes("/preview?") ? { title: "<script>alert(1)</script>", url: "https://produto.mercadolivre.com.br/MLB-123-_JM", price: 123, original_price: 150, currency: "BRL", image:"https://http2.mlstatic.com/test.jpg", status: "AVAILABLE" } : { status: "COMPLETED", persisted: 2 } };
      } });
    const html = dashboardPage({authorized: true, userId: "296984475"});
    new Script(html.match(/<script>([\s\S]*?)<\/script>/)![1]!).runInContext(context);
    await new Promise(resolve => setImmediate(resolve));
    expect(elements.get("commercial-results").children[0].textContent).toContain("Nenhum produto nesta seleção");
    expect(html).not.toContain("Painel de Controle");
    expect(html).not.toContain("Máximo de 20 ofertas");
    expect(html).toContain("Administração do robô");
    expect(html.indexOf('id="robot-admin"')).toBeLessThan(html.indexOf('id="sweep"'));
    expect(elements.get("count").textContent).toBe("345");
    expect(elements.get("snapshots").children[0].children[1].children[0].textContent).toBe("<script>alert(1)</script>");
    expect(elements.get("results-summary").textContent).toContain("1 completos · 1 incompletos");
    const body = elements.get("snapshots").children[0].children[1];
    const button = body.children.find((n:any) => n.className === "copy-button");
    const input = body.children.find((n:any) => n.children[0]?.type === "url").children[0];
    await button.handlers.click(); expect(copied).toEqual([]);
    input.value="https://meli.la/test-link"; input.handlers.change(); await button.handlers.click();
    expect(copied[0]).toContain("R$ 123,00"); expect(copied[0]).toContain("~De: R$ 150,00~"); expect(copied[0]).toContain("\n📦");
    expect(copied[0]).not.toContain("Link de afiliado — posso receber comissão."); expect(copied[0]).toContain("Preço e estoque podem mudar. Confira a oferta e aproveite! 🛒"); expect(storage.size).toBe(1);
    input.value="https://mercadolivre.com.br.evil.test/"; await button.handlers.click(); expect(copied).toHaveLength(1);
    input.value="https://meli.la/test-link";
    context.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
    await button.handlers.click();
    expect(elements.get("manual-copy").hidden).toBe(false);
    expect(elements.get("manual-copy").value).toContain("https://meli.la/test-link");
    revalidationReady=false;
    await button.handlers.click();expect(copied).toHaveLength(1);
    expect(elements.get('copy-status').textContent).toContain('interrompida');
    revalidationReady=true;revalidationPrice=130;
    await button.handlers.click();expect(copied).toHaveLength(1);
    expect(elements.get('copy-status').textContent).toContain('Revise o cartão');
    expect(calls.some(call=>call.path.includes('/commercial/revalidate?')&&call.options.method==='POST')).toBe(true);
    elements.get("filter-incomplete").handlers.click();
    expect(elements.get("snapshots").children[0].children[1].children[0].textContent).toBe("MLBU999");
    elements.get("filter-discount").handlers.click();
    expect(elements.get("results-summary").textContent).toContain("0 neste filtro");
    await elements.get("sweep").handlers.click();
    await elements.get("smoke").handlers.click();
    expect(calls.filter(call => call.options.method === "POST" && !call.path.includes("/revalidate?")).map(call => call.path)).toEqual(["/api/discovery/sweep", "/api/discovery/smoke"]);
    expect(calls.every(call => call.options.cache === "no-store")).toBe(true);
    for(let i=1;i<10;i++) {
      const before=calls.length;
      await elements.get('vertical-'+i).handlers.click();
      expect(calls.length).toBe(before);
      expect(elements.get('commercial-results').children[0].textContent).toContain('ainda não foi ativada');
      expect(elements.get('raw-products').hidden).toBe(true);
      expect(elements.get('commercial-more').hidden).toBe(true);
      expect(elements.get('collect-evidence').disabled).toBe(true);
      expect(elements.get('vertical-'+i).attributes['aria-pressed']).toBe('true');
    }
    await elements.get('vertical-0').handlers.click();
    expect(calls.at(-1).path).toContain('view=ALL&offset=0');
    expect(elements.get('raw-products').hidden).toBe(false);
    expect(elements.get('vertical-title').textContent).toContain('Automotivo');
    // A pending Automotive response must never populate a newly selected vertical.
    const originalFetch=context.fetch;
    let resolveRequest:any;
    context.fetch=()=>new Promise(resolve=>{resolveRequest=resolve;});
    const pending=elements.get('vertical-0').handlers.click();
    await elements.get('vertical-1').handlers.click();
    resolveRequest({ok:true,json:async()=>({entries:[],counts:{},total:0})});
    await pending;
    expect(elements.get('commercial-results').children[0].textContent).toContain('Casa');
    expect(elements.get('commercial-summary').textContent).toContain('Vertical planejada');
    let sentAt:string|null=null;
    context.fetch=async(path:string,options:any)=>{
      if(path.includes('/commercial/sent?')) {
        calls.push({path,options});sentAt=path.endsWith('sent=true')?'2026-09-07T10:00:00Z':null;
        return {ok:true,json:async()=>({saved:true})};
      }
      if(path.includes('/commercial/opportunities')) return {ok:true,json:async()=>({entries:[{
        snapshot:{product_id:'MLB123',type:'ITEM'},preview:{title:'Compressor portátil',price:123,currency:'BRL'},sent_at:sentAt,
        selection:{score:72,demand:{days:7,median_position:3},assessed_at:'2026-09-09T12:00:00Z',eligible:true,reasons:[],components:{demand:30,utility:17,ease:12,seller:10,ticket:3}},
        price_analysis:{historical_discount_confirmed:false,state:'INSUFFICIENT_HISTORY',rolling:{days:2,sellers:1},reference_price:null,campaign:null},
        rank:{state:'OBSERVING',score:20,history_days:1,seller_count:1,demand_days:1,historical_discount_percent:null,reasons:[],evidence:[]}
      }],counts:{approved:0,observing:1,sent:sentAt?1:0,monitored:1},capacity:100,total:1,hasMore:false})};
      return originalFetch(path,options);
    };
    await elements.get('vertical-0').handlers.click();
    const evidence=elements.get('commercial-results').children[0].querySelector('.product-details').children.at(-1).children.map((n:any)=>n.textContent).join(' ');
    expect(elements.get('commercial-results').children[0].querySelector('.product-details').open).toBe(false);
    expect(evidence).toContain('Potencial de acompanhamento: 72/100');
    expect(evidence).toContain('7 dias no mesmo ranking');
    expect(evidence).toContain('Desconto histórico ainda não confirmado');
    expect(evidence).toContain('2 dias observados · 1 vendedores');
    let opened=''; let closed=false;
    context.window={open:()=>({opener:null,location:{replace:(url:string)=>{opened=url;}},close:()=>{closed=true;}})};
    const openAction=()=>elements.get('commercial-results').children[0].querySelector('.product-link');
    await openAction().handlers.click({preventDefault(){}});
    expect(opened).toBe('https://produto.mercadolivre.com.br/MLB-123-_JM');
    opened='';revalidationReady=false;
    await openAction().handlers.click({preventDefault(){}});
    expect(opened).toBe('');expect(closed).toBe(true);revalidationReady=true;
    const sentAction=()=>elements.get('commercial-results').children[0].querySelector('.product-actions').children.find((n:any)=>n.textContent.includes('Marcar como divulgado')||n.textContent==='Desfazer divulgação');
    expect(sentAt).toBeNull();
    await sentAction().handlers.click();
    expect(sentAt).not.toBeNull();expect(sentAction().textContent).toBe('Desfazer divulgação');
    await sentAction().handlers.click();expect(sentAt).toBeNull();
    context.fetch=originalFetch;
  });
});

it('exposes only monitored, ready and published product tabs',()=>{
 const html=dashboardPage({authorized:true,userId:'296984475'});
 expect([...html.matchAll(/<button id="rank-([^"]+)"/g)].map(m=>m[1])).toEqual(['ALL','APPROVED','SENT']);
 expect(html).toContain('>Monitorados</button>');
 expect(html).toContain('>✅ Divulgados</button>');
});
