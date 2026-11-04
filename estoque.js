// Estoque, Compras, Financeiro e Ficha técnica do painel Produzione.
// Usa o mesmo banco: insumos, fichas, compras, ajustes, lançamentos e as visões v_estoque / v_caixa.
window.Modulos = function (ctx) {
  const { $, toast } = ctx;
  const { brl, esc } = U;
  const N = (v, d = 0) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const norm = t => U.semAcento(t).toUpperCase().replace(/\s+/g, " ").trim();
  const hoje = () => U.hojeSP();
  const UNID = ["g", "ml", "un", "folha"];
  function qtdTxt(v, un) {
    const n = Number(v || 0);
    if ((un === "g" || un === "ml") && Math.abs(n) >= 1000) return `${N(n / 1000, 2)} ${un === "g" ? "kg" : "L"}`;
    return `${N(n, n % 1 ? 1 : 0)} ${un}`;
  }
  function custoTxt(c, un) {
    if (c == null) return "—";
    if (un === "g" || un === "ml") return `${brl(c * 1000)}/${un === "g" ? "kg" : "L"}`;
    return `${brl(c)}/${un}`;
  }
  const confirmar = (b, txt, fn) => {
    if (b.dataset.sure !== "1") { const t0 = b.textContent; b.dataset.sure = "1"; b.textContent = txt; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ""; b.textContent = t0; } }, 4000); return; }
    fn();
  };

  // ======================= ESTOQUE =======================
  let contando = false;
  async function renderEstoque() {
    const el = $("t-estoque");
    if (!el.innerHTML) el.innerHTML = `<p class="note">Carregando…</p>`;
    const { data, error } = await sb.from("v_estoque").select("*").eq("ativo", true).order("ordem");
    if (error) { el.innerHTML = `<p class="err">${esc(U.erro(error))}</p>`; return; }
    const CFG = ctx.cfg();
    const itens = data.filter(i => i.controla_estoque);
    const nuncaContou = !itens.some(i => i.ultima_contagem);
    const falta = itens.filter(i => Number(i.disponivel) < 0 || (Number(i.estoque_min) > 0 && Number(i.disponivel) < Number(i.estoque_min)));
    const valor = itens.reduce((a, i) => a + Math.max(0, Number(i.fisico)) * Number(i.custo || 0), 0);
    const cats = [...new Set(itens.map(i => i.categoria))];
    const preparos = data.filter(i => i.tipo === "preparo" && i.nome !== "Ciabatta");
    const status = i => {
      const d = Number(i.disponivel), m = Number(i.estoque_min);
      if (d < 0) return `<span class="pill bad">Falta ${qtdTxt(-d, i.unidade)}</span>`;
      if (m > 0 && d < m) return `<span class="pill warnp">Abaixo do mínimo</span>`;
      return `<span class="pill ok">OK</span>`;
    };
    el.innerHTML = `
      <div class="bar"><h2>Estoque</h2>
        <div class="acts"><button class="btn ${contando ? "btn-primary" : "btn-ghost"}" type="button" id="e-contar">${contando ? "Salvar contagem" : "Fazer contagem"}</button>
        ${contando ? `<button class="btn btn-ghost" type="button" id="e-cancela">Cancelar</button>` : `<button class="btn btn-ghost" type="button" id="e-novo">Novo insumo</button>`}</div></div>
      ${nuncaContou && !contando ? `<div class="card aviso"><b>Comece com uma contagem.</b> O estoque está zerado desde ${U.ddmm(CFG.estoque_desde)}, porque a planilha tinha saldos negativos. Pese e conte o que tem agora e toque em <b>Fazer contagem</b>: daí em diante as compras somam, os pedidos entregues descontam e a produção de pão desconta farinha, fermento e azeite sozinha.</div>` : ""}
      <div class="kpis">
        <div class="kpi"><span>Valor em estoque</span><b>${brl(valor)}</b></div>
        <div class="kpi"><span>Itens em falta ou abaixo do mínimo</span><b>${falta.length}</b></div>
        <div class="kpi"><span>Reservado em pedidos abertos</span><b>${itens.filter(i => Number(i.reservado) > 0).length} itens</b></div>
      </div>
      ${falta.length && !contando ? `<div class="card"><div class="jh"><b>Lista de compras</b><button class="small-btn" type="button" id="e-copiar">Copiar lista</button></div>
        <ul class="lista" id="e-lista">${falta.map(i => {
          const precisa = Math.max(Number(i.estoque_min) || 0, 0) - Number(i.disponivel);
          const emb = i.conteudo_emb ? Math.ceil(precisa / i.conteudo_emb) : null;
          if (i.tipo === "preparo") return `<li><b>${esc(i.nome)}</b>: produzir ${qtdTxt(precisa, i.unidade)}</li>`;
          return `<li><b>${esc(i.nome)}</b>: ${emb ? `${emb} emb. de ${qtdTxt(i.conteudo_emb, i.unidade)}` : qtdTxt(precisa, i.unidade)}${i.custo && emb ? ` <span class="note">≈ ${brl(emb * i.conteudo_emb * i.custo)}</span>` : ""}</li>`;
        }).join("")}</ul><p class="note">Conta o que falta para os pedidos abertos e para chegar no estoque mínimo.</p></div>` : ""}
      ${cats.map(c => `<div class="day-h">${esc(c)}</div>
        <div class="card tbl"><table class="est">
          <thead><tr><th>Insumo</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th>${contando ? "Contagem real" : "Mínimo"}</th><th>${contando ? "" : "Custo"}</th><th></th></tr></thead>
          <tbody>${itens.filter(i => i.categoria === c).map(i => `<tr data-ins="${i.insumo_id}">
            <td><b>${esc(i.nome)}</b>${i.tipo === "preparo" ? ` <span class="note">preparo</span>` : ""}</td>
            <td data-l="Físico">${qtdTxt(i.fisico, i.unidade)}</td>
            <td data-l="Reservado">${Number(i.reservado) ? qtdTxt(i.reservado, i.unidade) : "—"}</td>
            <td data-l="Disponível">${qtdTxt(i.disponivel, i.unidade)}</td>
            <td data-l="${contando ? "Contagem" : "Mínimo"}">${contando ? `<input class="input cnt" type="number" step="any" inputmode="decimal" data-cnt="${i.insumo_id}" data-fis="${i.fisico}" placeholder="${N(i.fisico, 1)}" aria-label="Contagem de ${esc(i.nome)} em ${i.unidade}"> <span class="note">${i.unidade}</span>`
              : (Number(i.estoque_min) ? qtdTxt(i.estoque_min, i.unidade) : "—")}</td>
            <td data-l="${contando ? "" : "Custo"}">${contando ? "" : `<span class="note">${custoTxt(i.custo, i.unidade)}</span>`}</td>
            <td class="st-cel">${contando ? "" : status(i) + ` <button class="small-btn" type="button" data-edit-ins="${i.insumo_id}">Editar</button>`}</td>
          </tr>`).join("")}</tbody></table></div>`).join("")}
      ${!contando ? `<div class="card"><b>Registrar preparo pronto</b>
        <p class="note">Para o que vocês produzem e guardam (ex: pesto). A ciabatta entra sozinha pelos pães aprovados em Produção.</p>
        <form class="f3" id="f-prep"><select class="input" name="ins" aria-label="Preparo">${preparos.map(p => `<option value="${p.insumo_id}">${esc(p.nome)}</option>`).join("")}</select>
        <input class="input" name="qtd" type="number" step="any" min="0" placeholder="Quantidade (g)" aria-label="Quantidade">
        <button class="btn btn-ghost" type="submit">Registrar</button></form></div>
        <div class="card"><b>Perda ou saída avulsa</b>
        <form class="f3" id="f-perda"><select class="input" name="ins" aria-label="Insumo">${itens.map(p => `<option value="${p.insumo_id}">${esc(p.nome)} (${p.unidade})</option>`).join("")}</select>
        <input class="input" name="qtd" type="number" step="any" min="0" placeholder="Quantidade perdida" aria-label="Quantidade">
        <input class="input" name="motivo" maxlength="120" placeholder="Motivo (ex: burrata vencida)" aria-label="Motivo">
        <button class="btn btn-ghost" type="submit">Lançar perda</button></form></div>
        <div id="e-edit"></div>` : ""}`;

    $("e-contar").onclick = async () => {
      if (!contando) { contando = true; renderEstoque(); return; }
      const rows = [...el.querySelectorAll("[data-cnt]")].filter(i => i.value.trim() !== "")
        .map(i => ({ insumo_id: i.dataset.cnt, contagem: Number(i.value), delta: Number(i.value) - Number(i.dataset.fis), motivo: "Contagem", data: hoje() }));
      if (!rows.length) { toast("Preencha a contagem de pelo menos um item."); return; }
      const { error } = await sb.from("ajustes_estoque").insert(rows);
      if (error) { toast(U.erro(error)); return; }
      contando = false; toast(`Contagem salva (${rows.length} itens)`); renderEstoque();
    };
    $("e-cancela")?.addEventListener("click", () => { contando = false; renderEstoque(); });
    $("e-novo")?.addEventListener("click", () => editarInsumo(null));
    $("e-copiar")?.addEventListener("click", () => {
      const t = "Lista de compras Cacio & Pepe\n" + [...$("e-lista").children].map(li => "• " + li.textContent.replace(/\s+/g, " ").trim()).join("\n");
      navigator.clipboard?.writeText(t).then(() => toast("Lista copiada"), () => toast("Não deu para copiar"));
    });
    el.querySelectorAll("[data-edit-ins]").forEach(b => b.onclick = () => editarInsumo(b.dataset.editIns));
    $("f-prep")?.addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target; const q = Number(f.qtd.value);
      if (!(q > 0)) { toast("Coloque a quantidade."); return; }
      const { error } = await sb.from("preparos_registro").insert({ insumo_id: f.ins.value, qtd: q });
      if (error) { toast(U.erro(error)); return; }
      toast("Preparo registrado"); renderEstoque();
    });
    $("f-perda")?.addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target; const q = Number(f.qtd.value);
      if (!(q > 0)) { toast("Coloque a quantidade."); return; }
      const { error } = await sb.from("ajustes_estoque").insert({ insumo_id: f.ins.value, delta: -q, motivo: f.motivo.value.trim() || "Perda" });
      if (error) { toast(U.erro(error)); return; }
      toast("Perda lançada"); renderEstoque();
    });
  }

  async function editarInsumo(id) {
    const box = $("e-edit"); if (!box) return;
    let i = { nome: "", categoria: "Outros", unidade: "g", conteudo_emb: null, estoque_min: 0, perecivel: false, controla_estoque: true, tipo: "compra", ativo: true };
    if (id) { const { data } = await sb.from("insumos").select("*").eq("id", id).single(); i = data; }
    box.innerHTML = `<form class="card" id="f-ins" style="border:2px solid var(--vinho)">
      <div class="jh"><b>${id ? "Editar " + esc(i.nome) : "Novo insumo"}</b><button class="small-btn" type="button" id="ins-x">Fechar</button></div>
      <div class="f3">
        <div class="fl"><label for="in-nome">Nome</label><input class="input" id="in-nome" name="nome" value="${esc(i.nome)}" required maxlength="60"></div>
        <div class="fl"><label for="in-cat">Categoria</label><input class="input" id="in-cat" name="categoria" value="${esc(i.categoria)}" maxlength="40"></div>
        <div class="fl"><label for="in-un">Unidade</label><select class="input" id="in-un" name="unidade">${UNID.map(u => `<option ${u === i.unidade ? "selected" : ""}>${u}</option>`).join("")}</select></div>
      </div>
      <div class="f3">
        <div class="fl"><label for="in-emb">Conteúdo da embalagem</label><input class="input" id="in-emb" name="conteudo_emb" type="number" step="any" min="0" value="${i.conteudo_emb ?? ""}" placeholder="Ex: 130"></div>
        <div class="fl"><label for="in-min">Estoque mínimo</label><input class="input" id="in-min" name="estoque_min" type="number" step="any" min="0" value="${i.estoque_min || ""}"></div>
        <div class="fl"><label for="in-tipo">Tipo</label><select class="input" id="in-tipo" name="tipo"><option value="compra" ${i.tipo === "compra" ? "selected" : ""}>Comprado</option><option value="preparo" ${i.tipo === "preparo" ? "selected" : ""}>Feito por vocês</option></select></div>
      </div>
      <div class="f3"><label class="toggle"><span>Perecível</span><input type="checkbox" name="perecivel" ${i.perecivel ? "checked" : ""}></label>
        <label class="toggle"><span>Controlar estoque</span><input type="checkbox" name="controla_estoque" ${i.controla_estoque ? "checked" : ""}></label>
        <label class="toggle"><span>Ativo</span><input type="checkbox" name="ativo" ${i.ativo ? "checked" : ""}></label></div>
      <div class="row-act"><button class="btn btn-primary" type="submit">Salvar insumo</button></div></form>`;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    $("ins-x").onclick = () => box.innerHTML = "";
    $("f-ins").onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const row = { nome: f.nome.value.trim(), categoria: f.categoria.value.trim() || "Outros", unidade: f.unidade.value,
        conteudo_emb: f.conteudo_emb.value === "" ? null : Number(f.conteudo_emb.value), estoque_min: Number(f.estoque_min.value) || 0,
        tipo: f.tipo.value, perecivel: f.perecivel.checked, controla_estoque: f.controla_estoque.checked, ativo: f.ativo.checked };
      if (!row.nome) { toast("Coloque o nome."); return; }
      const { error } = id ? await sb.from("insumos").update(row).eq("id", id) : await sb.from("insumos").insert({ ...row, ordem: 999 });
      if (error) { toast(/duplicate/.test(error.message) ? "Já existe um insumo com esse nome." : U.erro(error)); return; }
      toast("Insumo salvo"); INSUMOS = null; renderEstoque();
    };
  }

  // ======================= COMPRAS =======================
  let INSUMOS = null, APELIDOS = null, rascunho = null;
  async function carregarInsumos() {
    if (INSUMOS && APELIDOS) return;
    const [a, b] = await Promise.all([sb.from("insumos").select("*").eq("ativo", true).order("nome"), sb.from("apelidos_nota").select("*")]);
    INSUMOS = a.data || []; APELIDOS = Object.fromEntries((b.data || []).map(x => [x.texto, x]));
  }
  // acha o insumo de uma linha da nota: primeiro o que já foi aprendido, depois por palavras
  function sugerir(desc) {
    const t = norm(desc);
    if (APELIDOS[t]) return { insumo_id: APELIDOS[t].insumo_id, conteudo: APELIDOS[t].conteudo, certeza: true };
    const pal = t.split(/[^A-Z0-9]+/).filter(w => w.length >= 3);
    let best = null, score = 0;
    for (const i of INSUMOS) {
      const n = norm(i.nome).split(/[^A-Z0-9]+/).filter(w => w.length >= 3);
      const s = n.filter(w => pal.some(p => p.startsWith(w.slice(0, 4)) || w.startsWith(p.slice(0, 4)))).length / Math.max(n.length, 1);
      if (s > score) { score = s; best = i; }
    }
    return score >= 0.5 ? { insumo_id: best.id, conteudo: best.conteudo_emb, certeza: false } : { insumo_id: "", conteudo: null, certeza: false };
  }

  async function renderCompras() {
    const el = $("t-compras");
    await carregarInsumos();
    if (rascunho) { renderRascunho(); return; }
    const { data, error } = await sb.from("compras").select("*, compra_itens(*)").order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(40);
    if (error) { el.innerHTML = `<p class="err">${esc(U.erro(error))}</p>`; return; }
    const ins = id => INSUMOS.find(i => i.id === id);
    el.innerHTML = `
      <div class="bar"><h2>Compras</h2><div class="acts">
        <label class="btn btn-primary" for="c-foto">Escanear nota</label>
        <input type="file" id="c-foto" accept="image/*" capture="environment" hidden>
        <button class="btn btn-ghost" type="button" id="c-manual">Lançar à mão</button></div></div>
      <p class="note">Tire foto da nota com o QR Code aparecendo: o sistema puxa os itens da Sefaz. Se a nota não tiver QR, a foto é lida pela IA.</p>
      <div class="grid">${data.map(c => {
        const tot = c.compra_itens.reduce((a, x) => a + Number(x.valor) - Number(x.desconto), 0);
        return `<details class="card">
          <summary class="jh"><div><b>${esc(c.fornecedor || "Compra")}</b><small>${U.ddmm(c.data)} · ${c.compra_itens.length} ite${c.compra_itens.length === 1 ? "m" : "ns"}${c.origem === "planilha" ? " · da planilha" : c.origem === "qr" ? " · QR Code" : c.origem === "foto" ? " · foto" : ""}</small></div><b>${brl(tot)}</b></summary>
          <ul class="lista">${c.compra_itens.map(x => `<li>${esc(x.descricao)} <span class="note">→ ${x.insumo_id ? esc(ins(x.insumo_id)?.nome || "insumo inativo") : "não é insumo"}${x.conteudo ? ` · ${N(x.embalagens, 2)} × ${qtdTxt(x.conteudo, ins(x.insumo_id)?.unidade || "")}` : ""}</span> <b>${brl(Number(x.valor) - Number(x.desconto))}</b></li>`).join("")}</ul>
          ${c.origem !== "planilha" ? `<div class="row-act"><button class="small-btn rm" type="button" data-del-compra="${c.id}">Excluir compra</button></div>` : ""}
        </details>`;
      }).join("") || `<p class="empty">Nenhuma compra ainda.</p>`}</div>`;
    $("c-foto").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) escanear(f); };
    $("c-manual").onclick = () => { rascunho = { origem: "manual", fornecedor: "", data: hoje(), chave: null, desconto: 0, itens: [{ descricao: "", insumo_id: "", embalagens: 1, conteudo: null, valor: 0 }] }; renderRascunho(); };
    el.querySelectorAll("[data-del-compra]").forEach(b => b.onclick = () => confirmar(b, "Toque de novo para excluir", async () => {
      const { error } = await sb.from("compras").delete().eq("id", b.dataset.delCompra);
      if (error) { toast(U.erro(error)); return; }
      toast("Compra excluída"); renderCompras();
    }));
  }

  // foto -> procura QR -> Sefaz; sem QR -> IA
  async function escanear(file) {
    const el = $("t-compras");
    el.innerHTML = `<div class="card"><b>Lendo a nota…</b><p class="note" id="c-pass">Procurando o QR Code na foto.</p></div>`;
    const img = await carregarImagem(file);
    let qr = null;
    if (window.jsQR) {
      for (const lado of [1600, 1000, 2200]) {
        const { data, w, h } = pixels(img, lado);
        const r = jsQR(data, w, h, { inversionAttempts: "attemptBoth" });
        if (r?.data) { qr = r.data; break; }
      }
    }
    let res;
    if (qr && /^https?:\/\//i.test(qr)) {
      $("c-pass").textContent = "QR Code encontrado. Buscando os itens na Sefaz…";
      res = await chamar({ qr });
      if (res.erro) { $("c-pass").textContent = res.erro + " Lendo pela foto…"; res = await chamar({ imagem: jpeg(img, 1600) }); }
    } else {
      $("c-pass").textContent = "Sem QR Code legível. Lendo a foto com a IA…";
      res = await chamar({ imagem: jpeg(img, 1600) });
    }
    if (res.erro) {
      el.innerHTML = `<div class="card"><b>Não deu para ler essa nota</b><p>${esc(res.erro)}</p>
        <div class="acts"><label class="btn btn-primary" for="c-foto2">Tentar outra foto</label><input type="file" id="c-foto2" accept="image/*" capture="environment" hidden>
        <button class="btn btn-ghost" type="button" id="c-m2">Lançar à mão</button><button class="btn btn-ghost" type="button" id="c-volta">Voltar</button></div></div>`;
      $("c-foto2").onchange = e => { const f = e.target.files[0]; if (f) escanear(f); };
      $("c-m2").onclick = () => { rascunho = { origem: "manual", fornecedor: "", data: hoje(), chave: null, desconto: 0, itens: [{ descricao: "", insumo_id: "", embalagens: 1, conteudo: null, valor: 0 }] }; renderRascunho(); };
      $("c-volta").onclick = renderCompras;
      return;
    }
    if (res.chave) {
      const { data: ja } = await sb.from("compras").select("id,data").eq("chave_nfce", res.chave).maybeSingle();
      if (ja) { toast(`Essa nota já foi lançada em ${U.ddmm(ja.data)}.`); renderCompras(); return; }
    }
    rascunho = { origem: res.origem, fornecedor: tituloFornecedor(res.fornecedor), data: res.data || hoje(), chave: res.chave, desconto: res.desconto || 0,
      itens: res.itens.map(it => {
        const s = sugerir(it.descricao);
        const kg = /^(KG|KGS|QUILO)/i.test(it.unidade);
        return { descricao: it.descricao, insumo_id: s.insumo_id, certeza: s.certeza,
          embalagens: kg ? 1 : it.quantidade, conteudo: kg ? Math.round(it.quantidade * 1000) : s.conteudo, valor: it.valor };
      }) };
    renderRascunho();
  }
  const tituloFornecedor = s => (s || "").toLowerCase().replace(/\b(ltda|me|eireli|s\/?a|epp)\b\.?/g, "").replace(/\s+/g, " ").trim().replace(/(^|\s)\S/g, m => m.toUpperCase());
  async function chamar(body) {
    try {
      const { data, error } = await sb.functions.invoke("ler-nota", { body });
      if (error) { let m = error.message; try { m = (await error.context.json()).erro || m; } catch (e) {} return { erro: m }; }
      return data;
    } catch (e) { return { erro: "Sem conexão com o servidor. Tente de novo." }; }
  }
  function carregarImagem(file) {
    return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
  }
  function pixels(img, lado) {
    const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    return { data: x.getImageData(0, 0, w, h).data, w, h };
  }
  function jpeg(img, lado) {
    const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  }

  function renderRascunho() {
    const el = $("t-compras"); const r = rascunho;
    const opts = sel => `<option value="">Não é insumo (só despesa)</option>` + INSUMOS.map(i => `<option value="${i.id}" ${i.id === sel ? "selected" : ""}>${esc(i.nome)} (${i.unidade})</option>`).join("");
    const un = id => INSUMOS.find(i => i.id === id)?.unidade || "";
    el.innerHTML = `<form class="card" id="f-compra" style="border:2px solid var(--vinho)">
      <div class="jh"><b>Conferir compra</b><span class="note">${r.origem === "qr" ? "Itens da Sefaz" : r.origem === "foto" ? "Lido pela IA, confira os valores" : "Lançamento à mão"}</span></div>
      <div class="f3">
        <div class="fl"><label for="cp-forn">Fornecedor</label><input class="input" id="cp-forn" name="fornecedor" value="${esc(r.fornecedor)}" maxlength="80"></div>
        <div class="fl"><label for="cp-data">Data</label><input class="input" id="cp-data" name="data" type="date" value="${r.data}"></div>
        <div class="fl"><label for="cp-desc">Desconto na nota (R$)</label><input class="input" id="cp-desc" name="desconto" type="number" step="0.01" min="0" value="${r.desconto || 0}"></div>
      </div>
      <p class="note">Para cada linha: qual insumo é, quantas embalagens e quanto vem em cada uma. Ex: 2 burratas de 130 g = 2 × 130. O que vocês acertarem aqui o sistema lembra na próxima nota.</p>
      <div class="itens-compra">${r.itens.map((it, k) => `<div class="ic ${it.insumo_id && !it.certeza ? "sug" : ""}" data-k="${k}">
        <input class="input" data-f="descricao" value="${esc(it.descricao)}" placeholder="Produto na nota" aria-label="Produto na nota">
        <select class="input" data-f="insumo_id" aria-label="Insumo">${opts(it.insumo_id)}</select>
        <div class="ic-q"><input class="input" data-f="embalagens" type="number" step="any" min="0" value="${it.embalagens}" aria-label="Embalagens"><span>×</span>
          <input class="input" data-f="conteudo" type="number" step="any" min="0" value="${it.conteudo ?? ""}" placeholder="conteúdo" aria-label="Conteúdo de 1 embalagem"><span class="note">${un(it.insumo_id)}</span></div>
        <input class="input" data-f="valor" type="number" step="0.01" min="0" value="${it.valor}" aria-label="Valor da linha">
        <button class="small-btn rm" type="button" data-rm="${k}" aria-label="Remover linha">✕</button>
      </div>`).join("")}</div>
      <button class="small-btn" type="button" id="cp-add" style="align-self:flex-start">+ Adicionar linha</button>
      <div class="row-act"><span class="note" id="cp-tot" style="margin-right:auto"></span><button class="btn btn-ghost" type="button" id="cp-x">Descartar</button><button class="btn btn-primary" type="submit">Salvar compra</button></div>
    </form>`;
    const f = $("f-compra");
    const tot = () => { $("cp-tot").textContent = `Total: ${brl(r.itens.reduce((a, i) => a + Number(i.valor || 0), 0) - Number(f.desconto.value || 0))}`; };
    f.querySelectorAll(".ic").forEach(row => {
      const k = +row.dataset.k;
      row.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
        const c = inp.dataset.f; const v = inp.value;
        r.itens[k][c] = ["embalagens", "conteudo", "valor"].includes(c) ? (v === "" ? null : Number(v)) : v;
        if (c === "insumo_id") { r.itens[k].certeza = true; const i = INSUMOS.find(x => x.id === v); if (i && !r.itens[k].conteudo) r.itens[k].conteudo = i.conteudo_emb; renderRascunho(); return; }
        tot();
      }));
    });
    f.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { r.itens.splice(+b.dataset.rm, 1); renderRascunho(); });
    $("cp-add").onclick = () => { r.itens.push({ descricao: "", insumo_id: "", embalagens: 1, conteudo: null, valor: 0 }); renderRascunho(); };
    $("cp-x").onclick = () => { rascunho = null; renderCompras(); };
    f.fornecedor.oninput = () => r.fornecedor = f.fornecedor.value; f.data.onchange = () => r.data = f.data.value;
    f.desconto.oninput = () => { r.desconto = Number(f.desconto.value) || 0; tot(); };
    tot();
    f.onsubmit = async e => {
      e.preventDefault();
      const itens = r.itens.filter(i => i.descricao.trim() || i.valor);
      if (!itens.length) { toast("Coloque pelo menos um item."); return; }
      const semConteudo = itens.find(i => i.insumo_id && !(i.conteudo > 0));
      if (semConteudo) { toast(`Falta o conteúdo da embalagem em "${semConteudo.descricao || "uma linha"}".`); return; }
      const bruto = itens.reduce((a, i) => a + Number(i.valor || 0), 0); const desc = Number(r.desconto) || 0;
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      const { data: c, error } = await sb.from("compras").insert({ data: r.data, fornecedor: r.fornecedor.trim(), origem: r.origem, chave_nfce: r.chave || null }).select().single();
      if (error) { btn.disabled = false; toast(/chave_nfce/.test(error.message) ? "Essa nota já foi lançada." : U.erro(error)); return; }
      const linhas = itens.map(i => ({ compra_id: c.id, descricao: i.descricao.trim(), insumo_id: i.insumo_id || null, embalagens: Number(i.embalagens) || 1,
        conteudo: i.insumo_id ? Number(i.conteudo) : null, valor: Number(i.valor) || 0,
        desconto: bruto > 0 ? Math.round(desc * (Number(i.valor) || 0) / bruto * 100) / 100 : 0 }));
      const r2 = await sb.from("compra_itens").insert(linhas);
      if (r2.error) { btn.disabled = false; await sb.from("compras").delete().eq("id", c.id); toast(U.erro(r2.error)); return; }
      const aprender = itens.filter(i => i.insumo_id && i.descricao.trim()).map(i => ({ texto: norm(i.descricao), insumo_id: i.insumo_id, conteudo: Number(i.conteudo) || null }));
      if (aprender.length) await sb.from("apelidos_nota").upsert(aprender);
      rascunho = null; APELIDOS = null; toast("Compra salva. O estoque já foi atualizado."); renderCompras();
    };
  }

  // ======================= FINANCEIRO =======================
  let mesFin = hoje().slice(0, 7);
  async function renderFinanceiro() {
    const el = $("t-financeiro");
    const [y, m] = mesFin.split("-").map(Number);
    const ini = `${mesFin}-01`, fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const [mes, ate, peds, fichas, custos] = await Promise.all([
      sb.from("v_caixa").select("*").gte("data", ini).lte("data", fim).order("data", { ascending: false }),
      sb.from("v_caixa").select("tipo,valor").lte("data", fim),
      sb.from("pedidos").select("itens,status").gte("data", ini).lte("data", fim).eq("status", "entregue"),
      sb.from("fichas").select("*"), sb.from("v_estoque").select("insumo_id,custo"),
    ]);
    if (mes.error) { el.innerHTML = `<p class="err">${esc(U.erro(mes.error))}</p>`; return; }
    const soma = (rs, t) => rs.filter(r => r.tipo === t).reduce((a, r) => a + Number(r.valor), 0);
    const rec = soma(mes.data, "receita"), desp = soma(mes.data, "despesa");
    const saldo = soma(ate.data || [], "receita") - soma(ate.data || [], "despesa");
    // custo dos ingredientes dos pedidos entregues no mês, pelas fichas
    const cmap = Object.fromEntries((custos.data || []).map(c => [c.insumo_id, Number(c.custo || 0)]));
    let cmv = 0, paninis = 0;
    (peds.data || []).forEach(p => p.itens.forEach(it => {
      paninis += Number(it.qtd);
      (fichas.data || []).filter(f => f.produto_id === it.produto_id && (!f.opcao || (it.opcao || "").toLowerCase().includes(f.opcao.toLowerCase())))
        .forEach(f => cmv += Number(it.qtd) * Number(f.qtd) * (cmap[f.insumo_id] || 0));
    }));
    const nomeMes = `${U.MESES[m - 1]} de ${y}`;
    el.innerHTML = `
      <div class="bar"><h2>Financeiro</h2>
        <div class="mes"><button class="icon-btn" type="button" id="f-ant" aria-label="Mês anterior">‹</button><b>${nomeMes}</b><button class="icon-btn" type="button" id="f-prox" aria-label="Próximo mês">›</button></div></div>
      <div class="kpis">
        <div class="kpi"><span>Entradas</span><b class="pos">${brl(rec)}</b></div>
        <div class="kpi"><span>Saídas</span><b class="neg">${brl(desp)}</b></div>
        <div class="kpi"><span>Resultado do mês</span><b class="${rec - desp >= 0 ? "pos" : "neg"}">${brl(rec - desp)}</b></div>
        <div class="kpi"><span>Saldo acumulado</span><b>${brl(saldo)}</b></div>
      </div>
      ${paninis ? `<div class="card"><b>Custo dos paninis entregues</b><p>${paninis} paninis entregues, com <b>${brl(cmv)}</b> em ingredientes e embalagens pelas fichas técnicas (${brl(cmv / paninis)} por panini). Fichas com quantidade zerada deixam esse número mais baixo que o real.</p></div>` : ""}
      <form class="card" id="f-lanc"><b>Novo lançamento</b>
        <div class="f3">
          <div class="fl"><label for="l-tipo">Tipo</label><select class="input" id="l-tipo" name="tipo"><option value="despesa">Saída</option><option value="receita">Entrada</option></select></div>
          <div class="fl"><label for="l-data">Data</label><input class="input" id="l-data" name="data" type="date" value="${hoje().slice(0, 7) === mesFin ? hoje() : ini}"></div>
          <div class="fl"><label for="l-valor">Valor (R$)</label><input class="input" id="l-valor" name="valor" type="number" step="0.01" min="0" required></div>
        </div>
        <div class="f2">
          <div class="fl"><label for="l-cat">Categoria</label><input class="input" id="l-cat" name="categoria" list="cats" placeholder="Ex: Frete, Embalagem, Gás" maxlength="40">
            <datalist id="cats"><option>Vendas</option><option>Compras</option><option>Frete</option><option>Embalagem</option><option>Gás</option><option>Equipamento</option><option>Divulgação</option><option>Outros</option></datalist></div>
          <div class="fl"><label for="l-desc">Descrição</label><input class="input" id="l-desc" name="descricao" maxlength="120"></div>
        </div>
        <div class="row-act"><button class="btn btn-primary" type="submit">Lançar</button></div>
        <p class="note">Pedidos marcados como pagos entram sozinhos como entrada, e compras lançadas em Compras entram sozinhas como saída. Aqui é para o resto.</p>
      </form>
      <div class="card tbl"><table class="fin"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th></th></tr></thead>
        <tbody>${mes.data.map(r => `<tr><td>${U.ddmm(r.data)}</td><td>${esc(r.descricao)}${r.origem !== "manual" ? ` <span class="note">${r.origem === "pedido" ? "pedido" : r.origem === "compra" ? "compra" : "planilha"}</span>` : ""}</td>
          <td>${esc(r.categoria)}</td><td class="${r.tipo === "receita" ? "pos" : "neg"}">${r.tipo === "receita" ? "+" : "−"} ${brl(r.valor)}</td>
          <td>${r.origem === "manual" || r.origem === "planilha" ? `<button class="small-btn rm" type="button" data-del-l="${r.id}">Excluir</button>` : ""}</td></tr>`).join("")
          || `<tr><td colspan="5" class="empty">Nada lançado em ${nomeMes}.</td></tr>`}</tbody></table></div>`;
    const mudar = d => { const dt = new Date(Date.UTC(y, m - 1 + d, 1)); mesFin = dt.toISOString().slice(0, 7); renderFinanceiro(); };
    $("f-ant").onclick = () => mudar(-1); $("f-prox").onclick = () => mudar(1);
    $("f-lanc").onsubmit = async e => {
      e.preventDefault(); const f = e.target; const v = Number(f.valor.value);
      if (!(v > 0)) { toast("Coloque o valor."); return; }
      const { error } = await sb.from("lancamentos").insert({ tipo: f.tipo.value, data: f.data.value, valor: v, categoria: f.categoria.value.trim(), descricao: f.descricao.value.trim() });
      if (error) { toast(U.erro(error)); return; }
      toast("Lançado"); renderFinanceiro();
    };
    el.querySelectorAll("[data-del-l]").forEach(b => b.onclick = () => confirmar(b, "Confirmar", async () => {
      const { error } = await sb.from("lancamentos").delete().eq("id", b.dataset.delL);
      if (error) { toast(U.erro(error)); return; }
      toast("Lançamento excluído"); renderFinanceiro();
    }));
  }

  // ======================= FICHA TÉCNICA (no Cardápio) =======================
  async function fichaEditor(box, p) {
    if (!box) return;
    await carregarInsumos();
    const [{ data: f }, { data: cs }] = await Promise.all([sb.from("fichas").select("*").eq("produto_id", p.id), sb.from("v_estoque").select("insumo_id,custo")]);
    const custo = Object.fromEntries((cs || []).map(c => [c.insumo_id, Number(c.custo || 0)]));
    let linhas = (f || []).map(x => ({ insumo_id: x.insumo_id, opcao: x.opcao, qtd: Number(x.qtd), obs: x.obs }));
    const escolhas = ((p.opcoes || [])[0]?.escolhas) || [];
    const draw = () => {
      const ins = id => INSUMOS.find(i => i.id === id);
      const custoDe = op => linhas.filter(l => !l.opcao || l.opcao === op).reduce((a, l) => a + l.qtd * (custo[l.insumo_id] || 0), 0);
      const variantes = escolhas.length ? escolhas : [""];
      const zeradas = linhas.filter(l => !(l.qtd > 0)).length;
      box.innerHTML = `<span class="l">Ficha técnica (por unidade)</span>
        <div class="ficha-custos">${variantes.map(op => { const c = custoDe(op); const mg = p.preco > 0 ? (p.preco - c) / p.preco : 0;
          return `<div><span>${op ? esc(op) : "Custo"}</span><b>${brl(c)}</b><small class="${mg >= 0.5 ? "pos" : "neg"}">margem ${N(mg * 100, 0)}%</small></div>`; }).join("")}</div>
        ${zeradas ? `<p class="note">${zeradas} ingrediente${zeradas > 1 ? "s" : ""} com quantidade zero: pese e preencha para o custo ficar certo.</p>` : ""}
        <div class="ficha">${linhas.map((l, k) => `<div class="fr" data-k="${k}">
          <select class="input" data-f="insumo_id" aria-label="Ingrediente">${INSUMOS.map(i => `<option value="${i.id}" ${i.id === l.insumo_id ? "selected" : ""}>${esc(i.nome)}</option>`).join("")}</select>
          <div class="ic-q"><input class="input" data-f="qtd" type="number" step="any" min="0" value="${l.qtd}" aria-label="Quantidade"><span class="note">${ins(l.insumo_id)?.unidade || ""}</span></div>
          ${escolhas.length ? `<select class="input" data-f="opcao" aria-label="Vale para"><option value="">Sempre</option>${escolhas.map(e => `<option ${e === l.opcao ? "selected" : ""}>${esc(e)}</option>`).join("")}</select>` : ""}
          <span class="note">${custo[l.insumo_id] ? brl(l.qtd * custo[l.insumo_id]) : "sem custo"}</span>
          <button class="small-btn rm" type="button" data-rm="${k}" aria-label="Remover">✕</button></div>`).join("")}</div>
        <div class="row-act"><button class="small-btn" type="button" data-add style="margin-right:auto">+ Ingrediente</button><button class="btn btn-ghost" type="button" data-save-ficha>Salvar ficha</button></div>`;
      box.querySelectorAll(".fr").forEach(r => { const k = +r.dataset.k;
        r.querySelectorAll("[data-f]").forEach(i => i.addEventListener("change", () => { linhas[k][i.dataset.f] = i.dataset.f === "qtd" ? Number(i.value) || 0 : i.value; draw(); })); });
      box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { linhas.splice(+b.dataset.rm, 1); draw(); });
      box.querySelector("[data-add]").onclick = () => { linhas.push({ insumo_id: INSUMOS[0]?.id, opcao: "", qtd: 0, obs: "" }); draw(); };
      box.querySelector("[data-save-ficha]").onclick = async () => {
        const vistos = new Set();
        for (const l of linhas) { const k = l.insumo_id + "|" + l.opcao; if (vistos.has(k)) { toast(`${ins(l.insumo_id)?.nome} aparece duas vezes.`); return; } vistos.add(k); }
        const del = await sb.from("fichas").delete().eq("produto_id", p.id);
        if (del.error) { toast(U.erro(del.error)); return; }
        if (linhas.length) { const { error } = await sb.from("fichas").insert(linhas.map(l => ({ produto_id: p.id, ...l }))); if (error) { toast(U.erro(error)); return; } }
        toast("Ficha salva");
      };
    };
    draw();
  }

  return { renderEstoque, renderCompras, renderFinanceiro, fichaEditor };
};
