// Aba Campanha do painel Produzione: cadastros do Passaporte do panini, carimbos, métricas
// e mensagens prontas no WhatsApp para cada grupo de clientes.
window.Campanha = function (ctx) {
  const { $, toast } = ctx;
  const { brl, esc } = U;
  const SITE = "https://cacioepepe.netlify.app";
  let DADOS = null, filtro = "todos", busca = "", editandoMsgs = false, aberto = null, HIST = {};

  const PADRAO = {
    quase: "Oi, {nome}! Aqui é da Cacio & Pepe 🥪\nVocê já tem {carimbos} carimbos no seu Passaporte do panini. Falta só {faltam} para ganhar {premio}! Bora garantir? {link}",
    premio: "Oi, {nome}! Aqui é da Cacio & Pepe 🥪\nSeu Passaporte do panini completou {carimbos} carimbos e você ganhou {premio}! É só fazer o pedido pelo site e tocar em \"Usar prêmio\" no carrinho: {link}",
    sem_pedido: "Oi, {nome}! Aqui é da Cacio & Pepe 🥪\nVi que você criou seu Passaporte do panini. Seu primeiro pedido já vale carimbo, e com 5 carimbos o panini é por nossa conta. As encomendas da semana estão abertas: {link}",
    sumido: "Oi, {nome}! Saudade de você por aqui 🥪\nSeu Passaporte do panini está com {carimbos} carimbo(s), faltam {faltam} para o próximo prêmio. As encomendas da semana já abriram: {link}",
    convite: "Oi, {nome}! Aqui é da Cacio & Pepe 🥪\nAgora a gente tem o Passaporte do panini: cada pedido vale carimbo e com 5 carimbos você ganha um panini. Panini + Cinnamon Roll no mesmo pedido vale carimbo em dobro. É só entrar com seu Google no site: {link}",
    geral: "Oi, {nome}! Aqui é da Cacio & Pepe 🥪\n{link}",
  };
  const msgs = () => ({ ...PADRAO, ...(ctx.cfg().fid_msgs || {}) });

  const telWa = t => { let d = String(t || "").replace(/\D/g, ""); if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); return d.length >= 10 ? "55" + d : ""; };
  const primeiro = n => (String(n || "").trim().split(/\s+/)[0] || "tudo bem");
  const diasDesde = d => d ? Math.floor((new Date(U.hojeSP() + "T12:00:00") - new Date(String(d).slice(0, 10) + "T12:00:00")) / 864e5) : null;
  const premioDisp = c => c.atuais >= 10 ? 10 : (c.atuais >= 5 && !c.usou5 ? 5 : 0);
  const proxMeta = c => c.atuais < 5 && !c.usou5 ? 5 : 10;
  const faltam = c => Math.max(0, proxMeta(c) - c.atuais);
  const nomePremio = k => k === 10 ? "1 panini + 3 Cinnamon Rolls" : "1 panini";
  // em que grupo cada cliente cai (para filtrar e escolher a mensagem)
  function grupo(c) {
    if (premioDisp(c)) return "premio";
    if (!c.pedidos) return "sem_pedido";
    if (faltam(c) <= 2) return "quase";
    const d = diasDesde(c.ultimo);
    if (d != null && d >= 21) return "sumido";
    return "geral";
  }
  function preencher(tpl, c) {
    const pd = premioDisp(c);
    return tpl.replaceAll("{nome}", primeiro(c.nome)).replaceAll("{carimbos}", String(Math.max(0, c.atuais ?? 0)))
      .replaceAll("{faltam}", String(faltam(c ?? {}))).replaceAll("{premio}", nomePremio(pd || proxMeta(c ?? {})))
      .replaceAll("{link}", SITE);
  }
  // botão que pede um segundo toque antes de ações que apagam
  function confirmar(b, txt, fn) {
    if (b.dataset.ok) { fn(); return; }
    const orig = b.textContent; b.dataset.ok = "1"; b.textContent = txt;
    setTimeout(() => { if (b.isConnected) { delete b.dataset.ok; b.textContent = orig; } }, 4000);
  }
  const linkWa = (tel, texto) => `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;

  const FILTROS = [
    ["todos", "Todos"], ["premio", "Com prêmio"], ["quase", "Quase lá"], ["sem_pedido", "Sem pedido ainda"],
    ["sumido", "Sumidos (21+ dias)"], ["convite", "Clientes sem passaporte"],
  ];

  async function carregar() {
    const { data, error } = await sb.rpc("painel_fidelidade");
    if (error) { toast(U.erro(error)); return; }
    DADOS = data;
  }

  function bolinhas(c) {
    const at = Math.min(10, Math.max(0, c.atuais));
    return `<span class="cp-dots" aria-label="${at} de 10 carimbos">${Array.from({ length: 10 }, (_, i) => `<i class="${i < at ? "on" : ""}${i === 4 || i === 9 ? " meta" : ""}"></i>`).join("")}</span>`;
  }

  function linhaCliente(c) {
    const g = grupo(c), tel = telWa(c.telefone), pd = premioDisp(c);
    const d = diasDesde(c.ultimo);
    const texto = preencher(msgs()[g], c);
    return `<div class="cp-cli">
      <div class="cp-top"><div class="cp-nome"><button type="button" class="link-nome" data-ficha-uid="${c.id}" data-ficha-tel="${esc(c.telefone || "")}">${esc(c.nome || "Sem nome")}</button><small>${esc(c.email || "")}${c.telefone ? ` · ${esc(c.telefone)}` : ""}</small></div>
        ${pd ? `<span class="pill extra">Prêmio de ${pd} liberado</span>` : g === "quase" ? `<span class="pill ok">Falta${faltam(c) > 1 ? "m" : ""} ${faltam(c)}</span>` : g === "sumido" ? `<span class="pill off">Sem pedir há ${d} dias</span>` : g === "sem_pedido" ? `<span class="pill">Sem pedido</span>` : ""}</div>
      <div class="cp-mid">${bolinhas(c)}<span class="cp-num"><b>${Math.max(0, c.atuais)}</b>/10${c.ciclo ? ` · cartão ${c.ciclo + 1}` : ""}</span></div>
      <div class="cp-info">${c.pedidos} pedido${c.pedidos === 1 ? "" : "s"}${c.ultimo ? ` · último ${U.ddmm(c.ultimo)}` : ""}${Number(c.gasto) ? ` · ${brl(c.gasto)} entregues` : ""}${c.resgates ? ` · ${c.resgates} prêmio${c.resgates > 1 ? "s" : ""} usado${c.resgates > 1 ? "s" : ""}` : ""} · desde ${new Date(c.desde).toLocaleDateString("pt-BR")}</div>
      <div class="acts">
        ${tel ? `<a class="btn btn-wa" href="${linkWa(tel, texto)}" target="_blank" rel="noopener">Mandar mensagem</a>` : `<span class="note">Sem WhatsApp cadastrado</span>`}
        <button class="small-btn" type="button" data-carimbo="${c.id}" data-q="1">+1 carimbo</button>
        <button class="small-btn" type="button" data-editar="${c.id}">${aberto === c.id ? "Fechar" : "Editar"}</button>
      </div>
      ${aberto === c.id ? editorCliente(c) : ""}
    </div>`;
  }

  function editorCliente(c) {
    const h = HIST[c.id];
    return `<div class="cp-ed">
      <form class="cp-form" data-form="${c.id}">
        <div class="f2"><div class="fl"><label for="cpn-${c.id}">Nome</label><input class="input" id="cpn-${c.id}" name="nome" maxlength="80" value="${esc(c.nome || "")}"></div>
        <div class="fl"><label for="cpt-${c.id}">WhatsApp</label><input class="input" id="cpt-${c.id}" name="telefone" inputmode="tel" maxlength="20" value="${esc(c.telefone || "")}"></div></div>
        <div class="acts"><button class="btn btn-primary" type="submit">Salvar cadastro</button></div>
      </form>
      <div class="cp-hist"><b>Carimbos</b>
        ${h == null ? `<p class="note">Carregando…</p>` : h.length ? `<ul>${h.map(k => `<li><span class="${k.qtd < 0 ? "neg" : ""}">${k.qtd > 0 ? "+" : ""}${k.qtd}</span><span>${k.numero ? `Pedido #${k.numero}` : esc(k.motivo || "Ajuste")}<small>${new Date(k.criado_em).toLocaleDateString("pt-BR")}${k.numero && k.motivo ? ` · ${esc(k.motivo)}` : ""}</small></span><button class="small-btn rm" type="button" data-rmk="${k.id}" data-cli="${c.id}">Remover</button></li>`).join("")}</ul>` : `<p class="note">Nenhum carimbo ainda.</p>`}
        <form class="cp-add" data-add="${c.id}"><input class="input" name="motivo" maxlength="80" placeholder="Motivo (opcional), ex: promoção de sexta"><input class="input" name="qtd" type="number" min="1" max="10" value="1" aria-label="Quantidade"><button class="btn btn-ghost" type="submit">Dar carimbo</button></form>
        <p class="note">Remover um carimbo de pedido não muda o pedido. Se o pedido for marcado como entregue de novo, o carimbo volta.</p>
      </div>
      <div class="cp-del"><button class="btn btn-ghost perigo" type="button" data-excluir="${c.id}">Excluir cadastro</button><span class="note">Apaga a conta, os carimbos e os prêmios desse cliente. Os pedidos continuam no sistema.</span></div>
    </div>`;
  }
  async function carregarHist(id) {
    const { data, error } = await sb.from("carimbos").select("id,qtd,motivo,criado_em,pedido_id,pedidos(numero)").eq("cliente_id", id).order("criado_em", { ascending: false });
    HIST[id] = error ? [] : (data || []).map(k => ({ ...k, numero: k.pedidos?.numero }));
  }

  function linhaConvite(x) {
    const tel = telWa(x.telefone);
    return `<div class="cp-cli">
      <div class="cp-top"><div class="cp-nome"><button type="button" class="link-nome" data-ficha-tel="${esc(x.telefone)}">${esc(x.nome || "Cliente")}</button><small>${esc(x.telefone)}</small></div><span class="pill">Sem passaporte</span></div>
      <div class="cp-info">${x.pedidos} pedido${x.pedidos === 1 ? "" : "s"} nos últimos 90 dias · último ${U.ddmm(x.ultimo)}</div>
      <div class="acts">${tel ? `<a class="btn btn-wa" href="${linkWa(tel, preencher(msgs().convite, { nome: x.nome, atuais: 0, usou5: false }))}" target="_blank" rel="noopener">Convidar pro passaporte</a>` : ""}</div>
    </div>`;
  }

  function editorMsgs() {
    const m = msgs();
    const rot = { premio: "Prêmio liberado", quase: "Quase lá", sem_pedido: "Cadastrou e ainda não pediu", sumido: "Sumidos", convite: "Convite (clientes sem passaporte)", geral: "Demais clientes" };
    return `<form class="card" id="cp-msgs"><div class="jh"><b>Mensagens prontas</b></div>
      <p class="note" style="margin:0 0 10px">Use {nome}, {carimbos}, {faltam}, {premio} e {link}. Cada botão "Mandar mensagem" já escolhe o texto do grupo do cliente.</p>
      ${Object.keys(rot).map(k => `<div class="fl"><label for="cpm-${k}">${rot[k]}</label><textarea class="input" id="cpm-${k}" data-k="${k}" rows="3">${esc(m[k])}</textarea></div>`).join("")}
      <div class="row-act"><button class="btn btn-ghost" type="button" id="cpm-padrao">Voltar ao padrão</button><button class="btn btn-primary" type="submit">Salvar mensagens</button></div>
    </form>`;
  }

  async function render() {
    const el = $("t-campanha");
    if (!DADOS) { el.innerHTML = `<div class="card"><p class="note">Carregando…</p></div>`; await carregar(); if (!DADOS) return; }
    const M = DADOS.metricas || {}, C = DADOS.clientes || [], S = DADOS.sem_cadastro || [];
    const cont = { todos: C.length, convite: S.length };
    C.forEach(c => { const g = grupo(c); cont[g] = (cont[g] || 0) + 1; });
    const q = U.semAcento(busca).toLowerCase();
    const bate = c => !q || U.semAcento(`${c.nome} ${c.email} ${c.telefone}`).toLowerCase().includes(q);
    const lista = filtro === "convite" ? S.filter(bate) : C.filter(c => (filtro === "todos" || grupo(c) === filtro) && bate(c));
    const pct = M.ped_total30 ? Math.round(M.ped_membros30 / M.ped_total30 * 100) : 0;
    const ativo = ctx.cfg().fid_ativo;
    el.innerHTML = `
      <div class="bar"><h2>Campanha · Passaporte do panini</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" type="button" id="cp-msg-ed">${editandoMsgs ? "Fechar mensagens" : "Editar mensagens"}</button><button class="btn btn-ghost" type="button" id="cp-atual">Atualizar</button></div></div>
      ${ativo ? "" : `<div class="card" style="border-color:var(--warn,#c9862a)"><b>O cartão fidelidade está desligado.</b> <span class="note">Ligue em Ajustes → Cartão fidelidade valendo para os clientes verem o passaporte.</span></div>`}
      <div class="kpis">
        <div class="kpi"><span>Cadastros</span><b>${M.cadastros || 0}</b><small class="note">+${M.cadastros7 || 0} nos últimos 7 dias</small></div>
        <div class="kpi"><span>Com WhatsApp</span><b>${M.com_tel || 0}</b><small class="note">dá pra mandar mensagem</small></div>
        <div class="kpi"><span>Pedidos de membros (30 dias)</span><b>${M.ped_membros30 || 0}</b><small class="note">${pct}% dos ${M.ped_total30 || 0} pedidos</small></div>
        <div class="kpi"><span>Faturamento de membros (30 dias)</span><b>${brl(M.receita_membros30)}</b><small class="note">pedidos entregues</small></div>
        <div class="kpi"><span>Carimbos dados</span><b>${M.carimbos || 0}</b><small class="note">desde o início</small></div>
        <div class="kpi"><span>Prêmios usados</span><b>${(M.resgates5 || 0) + (M.resgates10 || 0)}</b><small class="note">${M.resgates5 || 0} de 5 · ${M.resgates10 || 0} de 10 · ${brl(M.desconto)} em descontos</small></div>
      </div>
      ${editandoMsgs ? editorMsgs() : ""}
      <div class="card">
        <div class="filters cp-filtros">${FILTROS.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${filtro === k}">${l} <span>${cont[k] || 0}</span></button>`).join("")}</div>
        <input class="input" id="cp-busca" type="search" placeholder="Buscar por nome, e-mail ou celular" value="${esc(busca)}" style="margin:10px 0 4px">
        ${filtro === "convite" ? `<p class="note">Quem comprou nos últimos 90 dias e ainda não tem passaporte (pelo celular do pedido). Mande o convite um por um.</p>` : ""}
        <div class="cp-lista">${lista.length ? lista.map(filtro === "convite" ? linhaConvite : linhaCliente).join("") : `<p class="empty">Ninguém nesse grupo por enquanto.</p>`}</div>
      </div>`;
    $("cp-atual").onclick = async () => { DADOS = null; await render(); };
    $("cp-msg-ed").onclick = () => { editandoMsgs = !editandoMsgs; render(); };
    el.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { filtro = b.dataset.f; render(); });
    $("cp-busca").oninput = e => { busca = e.target.value; const pos = e.target.selectionStart; render().then(() => { const i = $("cp-busca"); i.focus(); i.setSelectionRange(pos, pos); }); };
    el.querySelectorAll("[data-ficha-tel],[data-ficha-uid]").forEach(b => b.onclick = () => abrirFicha({ uid: b.dataset.fichaUid || null, tel: b.dataset.fichaTel || "", nome: b.textContent }));
    el.querySelectorAll("[data-editar]").forEach(b => b.onclick = async () => {
      const id = b.dataset.editar;
      if (aberto === id) { aberto = null; render(); return; }
      aberto = id; delete HIST[id]; await render(); await carregarHist(id); render();
    });
    el.querySelectorAll("[data-form]").forEach(f => f.onsubmit = async e => {
      e.preventDefault(); const id = f.dataset.form;
      const { error } = await sb.from("clientes").update({ nome: f.nome.value.trim(), telefone: f.telefone.value.trim() }).eq("user_id", id);
      if (error) { toast(U.erro(error)); return; }
      toast("Cadastro salvo"); await carregar(); render();
    });
    el.querySelectorAll("[data-rmk]").forEach(b => b.onclick = () => confirmar(b, "Toque de novo para remover", async () => {
      const { error } = await sb.from("carimbos").delete().eq("id", b.dataset.rmk);
      if (error) { toast(U.erro(error)); return; }
      toast("Carimbo removido"); await Promise.all([carregar(), carregarHist(b.dataset.cli)]); render();
    }));
    el.querySelectorAll("[data-add]").forEach(f => f.onsubmit = async e => {
      e.preventDefault(); const id = f.dataset.add, q = Math.min(10, Math.max(1, parseInt(f.qtd.value, 10) || 1));
      const { error } = await sb.from("carimbos").insert({ cliente_id: id, qtd: q, motivo: f.motivo.value.trim() || "Carimbo dado pela equipe" });
      if (error) { toast(U.erro(error)); return; }
      toast(q > 1 ? `${q} carimbos adicionados` : "Carimbo adicionado"); await Promise.all([carregar(), carregarHist(id)]); render();
    });
    el.querySelectorAll("[data-excluir]").forEach(b => b.onclick = () => confirmar(b, "Toque de novo para apagar de vez", async () => {
      const { error } = await sb.rpc("excluir_cliente", { p_uid: b.dataset.excluir });
      if (error) { toast(U.erro(error)); return; }
      toast("Cadastro excluído"); aberto = null; await carregar(); render();
    }));
    el.querySelectorAll("[data-carimbo]").forEach(b => b.onclick = async () => {
      const q = +b.dataset.q; b.disabled = true;
      const { error } = await sb.from("carimbos").insert({ cliente_id: b.dataset.carimbo, qtd: q, motivo: q > 0 ? "Carimbo dado pela equipe" : "Carimbo retirado pela equipe" });
      if (error) { b.disabled = false; toast(U.erro(error)); return; }
      toast("Carimbo adicionado"); await carregar(); if (aberto === b.dataset.carimbo) await carregarHist(aberto); render();
    });
    if (editandoMsgs) {
      const f = $("cp-msgs");
      $("cpm-padrao").onclick = () => f.querySelectorAll("[data-k]").forEach(t => t.value = PADRAO[t.dataset.k]);
      f.onsubmit = async e => {
        e.preventDefault();
        const novo = {}; f.querySelectorAll("[data-k]").forEach(t => { if (t.value.trim() && t.value.trim() !== PADRAO[t.dataset.k]) novo[t.dataset.k] = t.value.trim(); });
        const { error } = await sb.from("config").update({ fid_msgs: novo }).eq("id", 1);
        if (error) { toast(U.erro(error)); return; }
        ctx.cfg().fid_msgs = novo; editandoMsgs = false; toast("Mensagens salvas"); render();
      };
    }
  }
  // ---------- ficha do cliente (abre de qualquer aba) ----------
  const STATUS_TXT = { aguardando:"Aguardando", confirmado:"Confirmado", entregue:"Entregue", cancelado:"Cancelado" };
  async function abrirFicha({ uid = null, tel = "", nome = "" }) {
    let ov = document.getElementById("ficha");
    if (!ov) {
      ov = document.createElement("div"); ov.id = "ficha"; ov.className = "ficha-ov"; ov.hidden = true;
      ov.innerHTML = `<div class="ficha" role="dialog" aria-modal="true" aria-labelledby="ficha-t"><div class="ficha-h"><b id="ficha-t">Cliente</b><button type="button" class="small-btn" data-fx>Fechar</button></div><div class="ficha-b" id="ficha-b"></div></div>`;
      document.body.appendChild(ov);
      ov.addEventListener("click", e => { if (e.target === ov || e.target.closest("[data-fx]")) ov.hidden = true; });
      addEventListener("keydown", e => { if (e.key === "Escape") ov.hidden = true; });
    }
    $("ficha-t").textContent = nome || "Cliente";
    $("ficha-b").innerHTML = `<p class="note">Carregando…</p>`;
    ov.hidden = false;
    const { data, error } = await sb.rpc("painel_cliente", { p_uid: uid, p_tel: tel || null });
    if (error) { $("ficha-b").innerHTML = `<p class="note">${esc(U.erro(error))}</p>`; return; }
    const cli = data.cliente, ct = data.cartao, peds = data.pedidos || [];
    const validos = peds.filter(p => p.status !== "cancelado");
    const gasto = peds.filter(p => p.status === "entregue").reduce((a, p) => a + Number(p.total || 0), 0);
    const cont = {}; validos.forEach(p => (p.itens || []).forEach(i => cont[i.nome] = (cont[i.nome] || 0) + Number(i.qtd || 0)));
    const fav = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const telF = cli?.telefone || tel || peds[0]?.telefone || "";
    const w = telWa(telF);
    $("ficha-t").textContent = cli?.nome || nome || peds[0]?.nome || "Cliente";
    const c = ct ? { ...ct, atuais: ct.atuais } : null;
    $("ficha-b").innerHTML = `
      <div class="ficha-top">
        <div class="note">${cli ? `${esc(cli.email || "")}${cli.email ? " · " : ""}` : ""}${telF ? esc(telF) : "sem celular"}${cli ? ` · membro desde ${new Date(cli.criado_em).toLocaleDateString("pt-BR")}` : ""}</div>
        ${w ? `<a class="btn btn-wa" href="https://wa.me/${w}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : ""}
      </div>
      <div class="kpis ficha-k">
        <div class="kpi"><span>Pedidos</span><b>${validos.length}</b></div>
        <div class="kpi"><span>Já gastou</span><b>${brl(gasto)}</b></div>
        <div class="kpi"><span>Último pedido</span><b>${validos[0] ? U.ddmm(validos[0].data) : "—"}</b></div>
        <div class="kpi"><span>Passaporte</span><b>${c ? `${Math.max(0, c.atuais)}/10` : "—"}</b><small class="note">${c ? (c.premio10 ? "prêmio de 10 liberado" : c.premio5 ? "prêmio de 5 liberado" : `faltam ${faltam(c)}`) : "sem cadastro"}</small></div>
      </div>
      ${c ? `<div class="ficha-pass">${bolinhas(c)}</div>` : `<p class="note">Ainda não tem passaporte.${w ? ` <a href="${linkWa(w, preencher(msgs().convite, { nome: peds[0]?.nome || nome, atuais: 0, usou5: false }))}" target="_blank" rel="noopener">Mandar convite</a>` : ""}</p>`}
      ${fav.length ? `<p class="ficha-fav"><b>Mais pede:</b> ${fav.map(([n, q]) => `${esc(n)} (${q})`).join(" · ")}</p>` : ""}
      <h4 class="ficha-h4">Histórico de pedidos</h4>
      ${peds.length ? `<ul class="ficha-peds">${peds.map(p => `<li class="${p.status}"><div><span><b>#${p.numero}</b> · ${U.ddmm(p.data)} · ${esc(p.modo)}</span><small>${(p.itens || []).map(i => `${i.qtd}× ${esc(i.nome)}`).join(", ")}</small></div><div class="r"><b>${brl(p.total)}</b><small>${STATUS_TXT[p.status] || p.status}${p.pago ? " · pago" : ""}${p.carimbos ? ` · +${p.carimbos} carimbo${p.carimbos > 1 ? "s" : ""}` : ""}${p.premio ? ` · prêmio ${p.premio}` : ""}</small></div></li>`).join("")}</ul>` : `<p class="note">Nenhum pedido encontrado.</p>`}`;
  }
  window.abrirFicha = abrirFicha;

  return { render, abrirFicha };
};
