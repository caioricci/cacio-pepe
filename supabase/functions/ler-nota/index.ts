// Lê uma nota de compra e devolve os itens.
// { qr: "https://...fazenda..." }  -> consulta a NFC-e na Sefaz (grátis, exato)
// { imagem: "data:image/jpeg;base64,..." } -> foto lida pela IA do Groq
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const num = (s: string | undefined | null) => {
  if (s == null) return 0;
  const t = String(s).replace(/[^\d,.-]/g, "");
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0;
};
const limpa = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function baixar(url: string) {
  const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9" } });
  const buf = new Uint8Array(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "";
  let html = new TextDecoder(/8859-1|latin1|1252/i.test(ct) ? "iso-8859-1" : "utf-8").decode(buf);
  if (!/charset/i.test(ct) && /charset=["']?iso-8859-1/i.test(html)) html = new TextDecoder("iso-8859-1").decode(buf);
  return { status: r.status, url: r.url, html };
}

type Item = { descricao: string; quantidade: number; unidade: string; valor: number };

// layout padrão do portal nacional (SP, MG, RJ, PR... usam o mesmo): <tr id="Item + 1"> com txtTit / Rqtd / RUN / valor
function itensPadrao(html: string): Item[] {
  const itens: Item[] = [];
  let blocos = html.split(/<tr[^>]*id=["']Item/i).slice(1);
  if (!blocos.length) blocos = html.split(/<span[^>]*class=["']txtTit2?["']/i).slice(1).map(b => `class="txtTit">` + b);
  for (const b of blocos) {
    const nome = b.match(/class=["']txtTit2?[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? b.match(/^[^>]*>([\s\S]*?)<\/span>/)?.[1];
    if (!nome || /Vl\.?\s*Total/i.test(nome)) continue;
    const qtd = b.match(/class=["']Rqtd["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const un = b.match(/class=["']RUN["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const vt = b.match(/class=["']valor["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const vu = b.match(/class=["']RvlUnit["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const quantidade = num(limpa(qtd || "1").replace(/Qtde\.?:?/i, "")) || 1;
    let valor = num(limpa(vt || "0"));
    if (!valor && vu) valor = num(limpa(vu).replace(/Vl\.?\s*Unit\.?:?/i, "")) * quantidade;
    itens.push({ descricao: limpa(nome), quantidade, unidade: limpa(un || "").replace(/UN:?/i, "").trim() || "UN", valor });
  }
  return itens;
}

// layout alternativo (tabela com colunas Código / Descrição / Qtde / UN / Vl. Total)
function itensTabela(html: string): Item[] {
  const itens: Item[] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const tds = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(limpa);
    if (tds.length < 4) continue;
    const valores = tds.filter(t => /^\d{1,3}(\.\d{3})*,\d{2,4}$|^\d+,\d{2,4}$/.test(t));
    const desc = tds.find(t => /[a-zA-Z]{3,}/.test(t) && !/total|descri|c[oó]digo|qtde|valor/i.test(t));
    if (!desc || valores.length < 2) continue;
    itens.push({ descricao: desc, quantidade: num(valores[0]) || 1, unidade: tds.find(t => /^(UN|KG|PC|CX|LT|G|ML|PCT|FD|DZ)$/i.test(t)) || "UN", valor: num(valores[valores.length - 1]) });
  }
  return itens;
}

async function lerQr(url: string) {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return { erro: "QR Code não é de nota fiscal." }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { erro: "QR Code não é de nota fiscal." };
  if (!/\.gov\.br$/i.test(u.hostname)) return { erro: "Esse QR Code não é de uma nota fiscal da Sefaz." };
  let pg = await baixar(u.toString());
  // algumas Sefaz respondem com uma página que redireciona por meta refresh ou script
  const prox = pg.html.match(/http-equiv=["']refresh["'][^>]*url=([^"'>]+)/i)?.[1] || pg.html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i)?.[1];
  if (prox && pg.html.length < 4000) pg = await baixar(new URL(prox.replace(/&amp;/g, "&"), pg.url).toString());
  const { html } = pg;
  let itens = itensPadrao(html);
  if (!itens.length) itens = itensTabela(html);
  const titulo = limpa(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  console.log(JSON.stringify({ host: u.hostname, status: pg.status, final: pg.url.slice(0, 120), tamanho: html.length, titulo, itens: itens.length, captcha: /captcha/i.test(html) }));
  if (!itens.length) {
    console.log("trecho:", limpa(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")).slice(0, 1500));
    if (/Request Rejected|Incapsula|Request unsuccessful/i.test(html)) return { erro: "A Sefaz bloqueia consultas automáticas vindas de servidor.", bloqueado: true };
    const motivo = /captcha/i.test(html) ? "A Sefaz pediu verificação de robô nessa consulta." :
      pg.status >= 400 ? `A Sefaz não respondeu (erro ${pg.status}).` :
      /n[aã]o (foi )?encontrad|inexistente|inv[aá]lid/i.test(limpa(html).slice(0, 4000)) ? "A Sefaz diz que essa nota ainda não está disponível. Notas recém-emitidas podem demorar alguns minutos." :
      "Não consegui ler os itens dessa nota na Sefaz.";
    return { erro: `${motivo} Tente pela foto.`, status: pg.status };
  }
  const fornecedor = limpa(html.match(/id=["']u20["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || html.match(/class=["']txtTopo["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const dm = html.match(/(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}/);
  const data = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null;
  const desconto = num(limpa(html.match(/Descontos?\s*R\$:?\s*<\/label>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "0"));
  const chave = (u.searchParams.get("p") || u.searchParams.get("chNFe") || "").split("|")[0].replace(/\D/g, "").slice(0, 44) || null;
  return { origem: "qr", fornecedor, data, desconto, chave, itens };
}

async function lerFoto(imagem: string) {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return { erro: "A leitura por foto ainda não está ligada (falta a chave do Groq)." };
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(imagem) || imagem.length > 5_500_000) return { erro: "Foto inválida ou grande demais." };
  const modelo = Deno.env.get("GROQ_MODEL") || "meta-llama/llama-4-scout-17b-16e-instruct";
  const prompt = `Você lê notas e cupons fiscais brasileiros de supermercado. Extraia da foto e responda SÓ com JSON neste formato:
{"fornecedor":"nome da loja","data":"AAAA-MM-DD ou null","desconto":0,"itens":[{"descricao":"texto do produto como está na nota","quantidade":1,"unidade":"UN ou KG","valor":0.00}]}
"valor" é o valor total da linha em reais (número com ponto decimal). "quantidade" é a quantidade da linha (para KG, o peso). Não invente itens; ignore linhas de total, troco e pagamento.`;
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo, temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imagem } }] }],
    }),
  });
  const j = await r.json();
  if (!r.ok) { console.log("groq", r.status, j?.error?.message); return { erro: "A IA não conseguiu ler a foto agora.", detalhe: j?.error?.message }; }
  let out;
  try { out = JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch { return { erro: "A IA devolveu algo que não deu para entender. Tente outra foto." }; }
  const itens = (out.itens || []).map((i: Record<string, unknown>) => ({
    descricao: String(i.descricao || "").trim(), quantidade: Number(i.quantidade) || 1,
    unidade: String(i.unidade || "UN"), valor: Number(i.valor) || 0,
  })).filter((i: { descricao: string }) => i.descricao);
  if (!itens.length) return { erro: "Não achei itens nessa foto. Tente com a nota inteira, reta e bem iluminada." };
  return { origem: "foto", fornecedor: String(out.fornecedor || ""), data: /^\d{4}-\d{2}-\d{2}$/.test(out.data || "") ? out.data : null, desconto: Number(out.desconto) || 0, chave: null, itens };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // só a equipe usa
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ erro: "Entre no painel de novo." }, 401);
  const { data: eq } = await sb.from("equipe").select("user_id").eq("user_id", u.user.id).maybeSingle();
  if (!eq) return json({ erro: "Sem acesso." }, 403);
  try {
    const b = await req.json();
    if (b.qr) return json(await lerQr(String(b.qr)));
    if (b.imagem) return json(await lerFoto(String(b.imagem)));
    return json({ erro: "Mande o QR Code ou a foto da nota." }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: "Deu erro ao ler a nota. Tente de novo." }, 500);
  }
});
