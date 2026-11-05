// Links de pagamento da InfinitePay (cartão e Pix) para os pedidos.
// POST {pedido_id}            (equipe logada)  -> cria/reaproveita o link com o valor do pedido
// POST ?webhook=1 {payload}   (InfinitePay)    -> confere o pagamento na InfinitePay e marca o pedido como pago
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const API = "https://api.checkout.infinitepay.io";
const SITE = "https://cacioepepe.netlify.app";
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cent = (v: unknown) => Math.round(Number(v || 0) * 100);

function acharUrl(j: unknown): string | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  for (const k of ["url", "link", "checkout_url", "payment_url", "invoice_url"]) if (typeof o[k] === "string" && /^https?:\/\//.test(o[k] as string)) return o[k] as string;
  for (const v of Object.values(o)) { if (typeof v === "string" && /^https:\/\/\S*infinitepay/.test(v)) return v; if (v && typeof v === "object") { const r = acharUrl(v); if (r) return r; } }
  return null;
}

async function conferir(db: ReturnType<typeof sb>, handle: string, b: Record<string, unknown>) {
  const order_nsu = String(b.order_nsu || ""), transaction_nsu = String(b.transaction_nsu || ""), slug = String(b.invoice_slug || b.slug || "");
  if (!order_nsu || !transaction_nsu || !slug) { console.log("webhook incompleto", JSON.stringify(b).slice(0, 300)); return; }
  const r = await fetch(`${API}/payment_check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, order_nsu, transaction_nsu, slug }) });
  const c = await r.json().catch(() => ({}));
  console.log("payment_check", order_nsu, r.status, JSON.stringify(c));
  if (!c?.success || !c?.paid) return;
  const via = c.capture_method === "pix" ? "Pix (InfinitePay)" : `Cartão (InfinitePay${Number(c.installments) > 1 ? `, ${c.installments}x` : ""})`;
  await db.from("pedidos").update({ pago: true, pago_via: via, pago_em: new Date().toISOString(), comprovante_url: typeof b.receipt_url === "string" ? b.receipt_url : null })
    .eq("id", order_nsu);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = sb();
  const { data: cfg } = await db.from("config").select("infinitepay_handle").eq("id", 1).single();
  const handle = String(cfg?.infinitepay_handle || "").replace(/^\$/, "").trim();

  // ----- aviso de pagamento da InfinitePay -----
  if (new URL(req.url).searchParams.get("webhook")) {
    const b = await req.json().catch(() => ({}));
    if (handle) {
      // responde rápido e confere em segundo plano (o aviso não tem assinatura: só vale o que a InfinitePay confirmar)
      // @ts-ignore EdgeRuntime existe no Supabase
      EdgeRuntime.waitUntil(conferir(db, handle, b).catch(e => console.error(e)));
    }
    return json({ ok: true });
  }

  // ----- criar link -----
  // equipe logada: qualquer pedido. Cliente no site: só o pedido que acabou de fazer, escolhendo pagar por link.
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let equipe = false;
  if (jwt.split(".").length === 3) {
    const { data: u } = await db.auth.getUser(jwt);
    if (u?.user) { const { data: eq } = await db.from("equipe").select("user_id").eq("user_id", u.user.id).maybeSingle(); equipe = !!eq; }
  }
  if (!handle) return json({ erro: equipe ? "Coloque a InfiniteTag da loja em Ajustes primeiro." : "Pagamento por link indisponível agora. Combine pelo WhatsApp." }, 400);

  const { pedido_id, novo } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(pedido_id || ""))) return json({ erro: "Pedido não encontrado." }, 404);
  const { data: p } = await db.from("pedidos").select("*").eq("id", pedido_id).maybeSingle();
  if (!p) return json({ erro: "Pedido não encontrado." }, 404);
  if (!equipe && (p.status !== "aguardando" || !/link/i.test(p.pagamento || "") || Date.now() - new Date(p.criado_em).getTime() > 24 * 3600e3))
    return json({ erro: "Esse pedido não pode gerar link por aqui. Fale com a gente no WhatsApp." }, 403);
  if (p.pago) return json({ erro: "Esse pedido já está marcado como pago." }, 400);
  const total = cent(p.total);
  if (total < 100) return json({ erro: "O valor mínimo do link é R$ 1,00." }, 400);
  if (p.link_pagamento && Number(p.link_valor) === Number(p.total) && !novo) return json({ url: p.link_pagamento, reaproveitado: true });

  // itens do pedido; se a soma não bater com o total (pedido editado), vai uma linha só com o total
  const opc = (o: string) => o ? ` (${o.split(";").map(x => x.split(":").pop()!.trim()).join(", ")})` : "";
  let items = (p.itens || []).map((i: Record<string, unknown>) => ({ description: `${i.nome}${opc(String(i.opcao || ""))}`.slice(0, 120), price: cent(i.preco), quantity: Number(i.qtd) || 1 }));
  if (Number(p.taxa_entrega) > 0) items.push({ description: "Entrega", price: cent(p.taxa_entrega), quantity: 1 });
  if (items.reduce((a: number, i: { price: number; quantity: number }) => a + i.price * i.quantity, 0) !== total || items.some((i: { price: number }) => i.price < 1))
    items = [{ description: `Pedido #${p.numero} – Cacio & Pepe`, price: total, quantity: 1 }];

  const tel = String(p.telefone || "").replace(/\D/g, "");
  const body: Record<string, unknown> = {
    handle, items,
    order_nsu: p.id,
    redirect_url: `${SITE}/?pago=${p.numero}`,
    webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/infinitepay?webhook=1`,
  };
  if (p.nome) body.customer = { name: p.nome, ...(tel.length >= 10 ? { phone_number: "+55" + tel.replace(/^55(?=\d{10,11}$)/, "") } : {}) };
  const r = await fetch(`${API}/links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  const url = acharUrl(j);
  if (!r.ok || !url) { console.log("links erro", r.status, JSON.stringify(j).slice(0, 500)); return json({ erro: `A InfinitePay não gerou o link${j?.message ? `: ${j.message}` : ""}. Confira a InfiniteTag em Ajustes.` }, 502); }
  await db.from("pedidos").update({ link_pagamento: url, link_valor: p.total }).eq("id", p.id);
  return json({ url });
});
