// Recebe a nota que o ATALHO do iPhone baixou da Sefaz (o celular abre a página, aqui só lemos).
// POST ?t=<código do atalho>  body JSON { url: "<QR da nota>", html: "<conteúdo da página>" }
// Guarda em notas_pendentes para a equipe conferir no painel. Responde texto curto para o atalho mostrar.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const txt = (s: string, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const num = (s: string | undefined | null) => {
  if (s == null) return 0;
  const t = String(s).replace(/[^\d,.-]/g, "");
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0;
};
const limpa = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Item = { descricao: string; quantidade: number; unidade: string; valor: number };

// página em HTML (layout padrão das NFC-e)
function lerHtml(html: string) {
  const itens: Item[] = [];
  for (const b of html.split(/<tr[^>]*id=["']Item/i).slice(1)) {
    const nome = b.match(/class=["']txtTit2?[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    if (!nome) continue;
    const qtd = b.match(/class=["']Rqtd["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const un = b.match(/class=["']RUN["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const vt = b.match(/class=["']valor["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const vu = b.match(/class=["']RvlUnit["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const quantidade = num(limpa(qtd || "1").replace(/Qtde\.?:?/i, "")) || 1;
    let valor = num(limpa(vt || "0"));
    if (!valor && vu) valor = num(limpa(vu).replace(/Vl\.?\s*Unit\.?:?/i, "")) * quantidade;
    itens.push({ descricao: limpa(nome), quantidade, unidade: limpa(un || "").replace(/UN:?/i, "").trim() || "UN", valor });
  }
  const fornecedor = limpa(html.match(/id=["']u20["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || html.match(/class=["']txtTopo["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const dm = html.match(/(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}/);
  const desconto = num(limpa(html.match(/Descontos?\s*R\$:?\s*<\/label>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "0"));
  return { fornecedor, data: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null, desconto, itens };
}
// página já convertida em texto (o Atalhos às vezes entrega assim)
function lerTexto(t0: string) {
  const t = t0.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const n = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
  const itens: Item[] = [];
  const re = /([^\n]+?)\s*\(\s*C[oó]d(?:igo)?\.?:?\s*[^)]*\)\s*Qtde\.?:?\s*([\d.,]+)\s*UN:?\s*([A-Za-z]+)\s*Vl\.?\s*Unit\.?:?\s*([\d.,]+)\s*Vl\.?\s*Total:?\s*([\d.,]+)/gi;
  let m;
  while ((m = re.exec(t))) {
    const d = m[1].replace(/^.*Vl\.?\s*Total:?\s*[\d.,]+\s*/i, "").trim();
    if (d) itens.push({ descricao: d, quantidade: n(m[2]) || 1, unidade: m[3].toUpperCase(), valor: n(m[5]) || n(m[4]) * (n(m[2]) || 1) });
  }
  const linhas = t.split(/\n/).map(l => l.trim()).filter(Boolean);
  const i = linhas.findIndex(l => /CNPJ/i.test(l));
  const fornecedor = i > 0 ? linhas[i - 1] : (linhas[i] || "").split(/CNPJ/i)[0].trim();
  const dm = t.match(/Emiss[aã]o:?\s*(\d{2})\/(\d{2})\/(\d{4})/i) || t.match(/(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}/);
  const de = t.match(/Descontos?\s*R\$:?\s*([\d.,]+)/i);
  return { fornecedor, data: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null, desconto: de ? n(de[1]) : 0, itens };
}
async function sha256(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return txt("Use o atalho Nota Cacio.", 405);
  const token = new URL(req.url).searchParams.get("t") || req.headers.get("x-atalho") || "";
  if (!/^[0-9a-f]{48}$/.test(token)) return txt("Código do atalho inválido. Gere um novo no Produzione (Compras).", 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tk } = await sb.from("atalho_tokens").select("user_id").eq("token_hash", await sha256(token)).maybeSingle();
  if (!tk) return txt("Esse código do atalho não vale mais. Gere um novo no Produzione (Compras).", 401);
  const { data: eq } = await sb.from("equipe").select("user_id").eq("user_id", tk.user_id).maybeSingle();
  if (!eq) return txt("Sem acesso ao Produzione.", 403);
  await sb.from("atalho_tokens").update({ ultimo_uso: new Date().toISOString() }).eq("user_id", tk.user_id);

  let b: { url?: string; html?: string };
  try { b = await req.json(); } catch { return txt("O atalho mandou a nota num formato que não entendi. Confira o passo 3 do atalho.", 400); }
  const url = String(b.url || "").trim().slice(0, 2000);
  const pagina = String(b.html || "");
  if (!pagina || pagina.length > 3_000_000) return txt("A página da nota veio vazia. Tente de novo.", 400);
  if (/Request Rejected|Incapsula|Request unsuccessful/i.test(pagina)) return txt("A Sefaz recusou a consulta. Tente de novo em alguns minutos.", 200);

  const paraTexto = (h: string) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>|<\/(div|tr|p|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  let r = /<tr[^>]*id=["']Item/i.test(pagina) ? lerHtml(pagina) : lerTexto(pagina.includes("<") ? paraTexto(pagina) : pagina);
  let chave: string | null = null;
  try { const u = new URL(url); chave = (u.searchParams.get("p") || u.searchParams.get("chNFe") || "").split("|")[0].replace(/\D/g, "").slice(0, 44) || null; } catch { /* sem url */ }
  if (!chave) chave = pagina.replace(/\s/g, "").match(/\d{44}/)?.[0] || null;
  if (!r.itens.length) {
    console.log("sem itens", pagina.length, limpa(pagina).slice(0, 600));
    return txt("Não consegui achar os itens nessa página. Abra o Produzione e use o copiar e colar.");
  }
  if (chave) {
    const { data: ja } = await sb.from("compras").select("data").eq("chave_nfce", chave).maybeSingle();
    if (ja) return txt(`Essa nota já foi lançada (${ja.data.split("-").reverse().slice(0, 2).join("/")}).`);
    await sb.from("notas_pendentes").delete().eq("chave", chave);
  }
  const { error } = await sb.from("notas_pendentes").insert({ user_id: tk.user_id, url, chave, resultado: { ...r, origem: "qr", chave } });
  if (error) { console.error(error); return txt("Deu erro ao guardar a nota. Tente de novo.", 500); }
  const total = r.itens.reduce((a, x) => a + x.valor, 0) - (r.desconto || 0);
  return txt(`Nota recebida: ${r.fornecedor || "compra"}, ${r.itens.length} ite${r.itens.length === 1 ? "m" : "ns"}, ${brl(total)}. Abra o Produzione → Compras para conferir.`);
});
