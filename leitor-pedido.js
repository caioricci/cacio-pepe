// Lê uma mensagem de pedido colada (Goomer, nosso site ou texto livre do cliente)
// e devolve os dados para preencher o pedido avulso no painel.
window.LerPedido = (function () {
  const norm = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, meia: 6, "meia duzia": 6 };
  const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const nomeEsc = e => (e && typeof e === "object") ? e.nome : String(e ?? "");
  const unidEsc = e => (e && typeof e === "object" && Number(e.unidades) > 0) ? Number(e.unidades) : 1;
  const dinheiro = t => { const m = String(t).match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)/); return m ? Number(m[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : null; };
  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // palavras que identificam cada produto sem confundir com outro
  function chaves(produtos) {
    const words = p => norm(p.nome).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
    return produtos.map(p => {
      const outras = new Set(produtos.filter(o => o.id !== p.id).flatMap(words));
      const k = words(p).filter(w => !outras.has(w));
      return { p, k: k.length ? k : words(p) };
    });
  }
  function acharProduto(txt, CH) {
    const t = norm(txt);
    let best = null, score = 0;
    for (const c of CH) {
      const s = c.k.filter(w => t.includes(w) || t.includes(w.slice(0, 5))).length / c.k.length;
      if (s > score) { score = s; best = c.p; }
    }
    return score > 0 ? best : null;
  }
  // escolhe as opções do produto que aparecem no texto; quantidade de pacote vira escolha quando bate
  function acharOpcao(p, txt, qtdPedida) {
    const t = norm(txt); const partes = []; let q = qtdPedida, achouTodas = true;
    for (const g of (p.opcoes || [])) {
      const esc = g.escolhas || [];
      let e = esc.find(x => t.includes(norm(nomeEsc(x)))) || esc.find(x => { const w = norm(nomeEsc(x)).split(/\s+/).find(w => w.length >= 5); return w && t.includes(w.slice(0, 6)); });
      if (!e && esc.some(x => unidEsc(x) > 1)) {
        // "6 cinnamon" => pacote de 6; "2 cinnamon" => 2 x 1 unidade
        e = esc.find(x => unidEsc(x) === qtdPedida);
        if (e) q = 1; else e = esc.find(x => unidEsc(x) === 1);
      }
      if (!e && g.obrigatorio && esc.length) { e = esc[0]; achouTodas = false; }
      if (e) partes.push(`${g.nome}: ${nomeEsc(e)}`);
    }
    return { op: partes.join("; "), q, achouTodas };
  }
  function proximoDia(dow, hoje) {
    const d = new Date(hoje + "T12:00:00"); const diff = (dow - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff); return isoLocal(d);
  }
  function janelaDe(data, turnoTxt, janelas) {
    if (!data) return null;
    const dow = new Date(data + "T12:00:00").getDay();
    const doDia = janelas.filter(j => j.ativo && j.dia_semana === dow);
    if (!doDia.length) return null;
    const t = norm(turnoTxt);
    const porTurno = doDia.find(j => t && (t.includes(norm(j.turno)) || (/almoc|meio.?dia|tarde/.test(t) && /almoc/.test(norm(j.turno))) || (/noite|jantar/.test(t) && /noite/.test(norm(j.turno)))));
    return porTurno ? porTurno.id : (doDia.length === 1 ? doDia[0].id : null);
  }
  function pagamentoDe(txt, pagamentos) {
    const t = norm(txt);
    const map = [["pix", "Pix"], ["debito", "Débito"], ["credito", "Crédito"], ["dinheiro", "Dinheiro"], ["especie", "Dinheiro"], ["cartao", "Crédito"]];
    for (const [k, v] of map) if (t.includes(k)) { const p = pagamentos.find(x => norm(x) === norm(v)); if (p) return p; }
    return "";
  }
  const telDe = t => (String(t).match(/(\+?55\s*)?\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/) || [])[0]?.trim() || "";

  // ---------- formato com estrelas e separadores (Goomer e nosso site) ----------
  function estruturado(txt, ctx) {
    const L = txt.split(/\r?\n/).map(l => l.replace(/\s+$/, ""));
    const r = { itens: [], avisos: [] };
    const num = txt.match(/Pedido[^#\n]{0,20}#\s*(\d+)/i);
    const doSite = /cacioepepe\.netlify\.app|cacioepepe\.com/i.test(txt);
    const goomer = /goomer/i.test(txt);
    r.origem = doSite ? "site" : goomer ? "goomer" : "estruturado";
    if (num && doSite) r.numeroSite = Number(num[1]);
    if (!doSite) r.nota = goomer ? `Importado do Goomer${num ? ` #${num[1]}` : ""}` : `Importado de mensagem${num ? ` (pedido #${num[1]})` : ""}`;
    let atual = null;
    const linhaItem = /^\s*\*?\s*(\d+)\s*x\s+(.+?)\s*\*?\s*$/i;
    for (let i = 0; i < L.length; i++) {
      const l = L[i]; const ln = norm(l);
      const mi = l.match(linhaItem);
      if (mi && !/subtotal|total|taxa/i.test(l)) {
        const p = acharProduto(mi[2], ctx.CH);
        atual = { nomeTxt: mi[2].replace(/\*/g, "").trim(), p, q: Number(mi[1]), sub: [] };
        r.itens.push(atual); continue;
      }
      const ms = l.match(/^\s*-\s*(.+)$/);
      if (ms && atual) { atual.sub.push(ms[1].trim()); continue; }
      if (/^\s*$/.test(l)) atual = null;
      if (/taxa de entrega/i.test(l)) r.taxa = /gratis|grátis/i.test(l) ? 0 : (/combinar/i.test(l) ? null : dinheiro(l.split(":").slice(1).join(":")));
      if (/^\*?pagamento:?\*?/i.test(l.trim())) {
        r.pagamento = pagamentoDe(l, ctx.pagamentos);
        const tr = l.match(/troco[^\d]*([\d.,]+)/i); if (tr) r.troco = tr[1];
      }
      if (/^\*?observa[cç][aã]o:?\*?/i.test(l.trim())) r.obs = l.split(":").slice(1).join(":").replace(/\*/g, "").trim();
      const md = ln.match(/\*(entrega|retirada):\s*([a-z-]+),?\s*(\d{1,2})\s+de\s+([a-z]+)/);
      if (md) {
        r.modo = md[1] === "retirada" ? "Retirada" : "Entrega";
        const mes = MESES.indexOf(md[4]); const dia = Number(md[3]);
        if (mes >= 0) { const hj = new Date(ctx.hoje + "T12:00:00"); let y = hj.getFullYear(); if (new Date(y, mes, dia) < new Date(hj.getFullYear(), hj.getMonth(), hj.getDate() - 60)) y++; r.data = isoLocal(new Date(y, mes, dia)); }
        r.turnoTxt = L[i + 1] || "";
      }
    }
    // bloco do cliente: depois do último separador antes do pagamento
    const iPag = L.findIndex(l => /^\*?pagamento/i.test(l.trim()));
    const fim = iPag >= 0 ? iPag : L.length;
    let ini = 0; for (let i = 0; i < fim; i++) if (/^-{6,}/.test(L[i].trim())) ini = i + 1;
    const bloco = L.slice(ini, fim).map(l => l.trim()).filter(Boolean);
    const iNome = bloco.findIndex(l => /^\*[^*:]+\*$/.test(l) && !/^\*\d+\s*x/i.test(l));
    if (iNome >= 0) r.nome = bloco[iNome].replace(/\*/g, "").trim();
    const resto = bloco.slice(iNome + 1);
    const iTel = resto.findIndex(l => telDe(l) && telDe(l).replace(/\D/g, "").length >= 10 && !/^\d{5}-?\d{3}$/.test(l));
    if (iTel >= 0) r.telefone = telDe(resto[iTel]);
    const end = resto.filter((l, k) => k !== iTel && !/^\*/.test(l));
    if (end.some(l => /^retirada/i.test(l))) r.modo = "Retirada";
    else if (end.length) { r.modo = r.modo || "Entrega"; r.endereco = end.join(" – "); }
    else if (!r.modo && r.taxa == null) r.modo = "Retirada";
    // itens: opções nas sublinhas
    r.itens = r.itens.map(it => {
      if (!it.p) { r.avisos.push(`Não reconheci o produto "${it.nomeTxt}".`); return null; }
      const subOps = it.sub.filter(s => !/^obs/i.test(s)).join(" ");
      const obs = it.sub.filter(s => /^obs/i.test(s)).map(s => s.replace(/^obs:?\s*/i, "")).join("; ");
      const o = acharOpcao(it.p, `${it.nomeTxt} ${subOps}`, it.q);
      if (!o.achouTodas) r.avisos.push(`Confira a opção de ${it.p.nome} (não veio na mensagem).`);
      return { pid: it.p.id, op: o.op, q: o.q, obs };
    }).filter(Boolean);
    return r;
  }

  // ---------- texto livre ----------
  function livre(txt, ctx) {
    const r = { origem: "livre", itens: [], avisos: [] };
    // conversa exportada do WhatsApp: "[19:02, 04/11/2026] Maria Silva: oi"
    const exp = txt.match(/^\s*\[?\d{1,2}[:h]\d{2}[^\]\n]*\]?\s*([^:\n]{2,40}):/m);
    if (exp && !/\d{4,}/.test(exp[1])) r.nome = exp[1].trim();
    const corpo = txt.replace(/^\s*\[[^\]]*\]\s*[^:\n]{2,40}:\s*/gm, "");
    const t = norm(corpo);
    const nomeM = corpo.match(/(?:meu nome (?:e|é)|aqui (?:e|é) (?:a|o)|sou (?:a|o))\s+([A-ZÁ-Ú][a-zá-ú]+(?:\s+[A-ZÁ-Ú][a-zá-ú]+)?)/);
    if (nomeM) r.nome = nomeM[1];
    r.telefone = telDe(corpo);
    // itens: cada menção a um produto, com o número logo antes
    const numRe = "(\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|meia duzia)";
    for (const c of ctx.CH) {
      const alvo = c.k.map(w => w.slice(0, 5)).join("|");
      const re = new RegExp(`(?:${numRe}\\s*(?:x\\s*)?(?:de\\s+|do\\s+|da\\s+)?(?:panini\\s+|paninis\\s+|sanduiche\\s+)?(?:de\\s+)?)?\\b(?:${alvo})[a-z]*`, "g");
      let m;
      while ((m = re.exec(t))) {
        const n = m[1] ? (NUM[m[1]] || Number(m[1]) || 1) : 1;
        const depois = t.slice(m.index, m.index + m[0].length + 45);
        const o = acharOpcao(c.p, depois, n);
        const ja = r.itens.find(x => x.pid === c.p.id && x.op === o.op);
        if (ja) ja.q += o.q; else r.itens.push({ pid: c.p.id, op: o.op, q: o.q, obs: "" });
        if (!o.achouTodas) r.avisos.push(`Confira a opção de ${c.p.nome} (não veio na mensagem).`);
      }
    }
    // dia
    const dm = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (dm) { const hj = new Date(ctx.hoje + "T12:00:00"); let d = new Date(hj.getFullYear(), Number(dm[2]) - 1, Number(dm[1])); if (d < new Date(hj.getFullYear(), hj.getMonth(), hj.getDate() - 1)) d.setFullYear(d.getFullYear() + 1); r.data = isoLocal(d); }
    else if (/\bhoje\b/.test(t)) r.data = ctx.hoje;
    else if (/\bamanha\b/.test(t)) { const d = new Date(ctx.hoje + "T12:00:00"); d.setDate(d.getDate() + 1); r.data = isoLocal(d); }
    else { const k = DIAS.findIndex(d => new RegExp(`\\b${d.slice(0, 5)}`).test(t)); if (k >= 0) r.data = proximoDia(k, ctx.hoje); }
    r.turnoTxt = /almoc|meio.?dia|tarde/.test(t) ? "almoço" : /noite|jantar/.test(t) ? "noite" : "";
    r.modo = /\b(retir|buscar|busco|pegar|pego)/.test(t) ? "Retirada" : /\b(entreg|rua |avenida|av\.|alameda|travessa|condominio)/.test(t) ? "Entrega" : "";
    const end = corpo.split(/\r?\n/).find(l => /\b(rua|r\.|avenida|av\.|alameda|travessa|rodovia|estrada)\s+\S+/i.test(l) && /\d/.test(l));
    if (end) { r.endereco = end.replace(/^.*?((rua|r\.|avenida|av\.|alameda|travessa|rodovia|estrada)\b)/i, "$1").trim(); r.modo = r.modo || "Entrega"; }
    r.pagamento = pagamentoDe(t, ctx.pagamentos);
    const tr = t.match(/troco\s*(?:para|pra|p\/)?\s*(?:r\$)?\s*(\d+)/); if (tr) r.troco = tr[1];
    return r;
  }

  function ler(texto, { produtos, janelas, pagamentos, hoje }) {
    const ctx = { CH: chaves(produtos.filter(p => p.ativo)), pagamentos, hoje };
    const txt = String(texto || "").trim();
    const r = /^\s*\*?\d+\s*x\s+/im.test(txt) && /-{6,}|\*Total/i.test(txt) ? estruturado(txt, ctx) : livre(txt, ctx);
    r.janela_id = janelaDe(r.data, r.turnoTxt, janelas);
    if (!r.itens.length) r.avisos.unshift("Não encontrei produtos na mensagem.");
    if (!r.data) r.avisos.push("Escolha a data de entrega (a mensagem não diz).");
    else if (!r.janela_id) r.avisos.push("Escolha o turno (almoço ou noite).");
    if (!r.pagamento) r.avisos.push("Confira a forma de pagamento.");
    r.avisos = [...new Set(r.avisos)];
    return r;
  }
  return { ler };
})();
