// Conexão com o banco da Cacio & Pepe (Supabase).
// Essa chave é pública por natureza: o que cada um pode ver/fazer é controlado pelas regras do banco.
window.CACIO = {
  url: "https://ppldqkdkyklcyljnqvoe.supabase.co",
  key: "sb_publishable_N_ERUZH5aumPIY6KuJ7RfQ_6PwPlg1y",
};
window.sb = supabase.createClient(CACIO.url, CACIO.key);

// utilidades compartilhadas
window.U = {
  brl: v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  DIAS: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  DIAS_C: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  MESES: ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"],
  pad: n => String(n).padStart(2, "0"),
  // "2026-11-06" -> {y,m,d,dow}
  parseData(s) {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  },
  ddmm(s) { const p = U.parseData(s); return `${U.pad(p.d)}/${U.pad(p.m)}`; },
  diaLongo(s) { const p = U.parseData(s); return `${U.DIAS[p.dow]}, ${p.d} de ${U.MESES[p.m - 1]}`; },
  hora(ts) { const [h, mi] = ts.slice(11, 16).split(":"); return mi === "00" ? `${+h}h` : `${+h}h${mi}`; },
  hojeSP() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  },
  somaDias(s, n) { const p = U.parseData(s); const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return d.toISOString().slice(0, 10); },
  quando(s) { // "hoje", "amanhã" ou "qui 05/11"
    const hoje = U.hojeSP(); const dia = s.slice(0, 10);
    if (dia === hoje) return "hoje";
    if (dia === U.somaDias(hoje, 1)) return "amanhã";
    return `${U.DIAS_C[U.parseData(dia).dow]} ${U.ddmm(dia)}`;
  },
  esc: s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  erro: e => (e?.message || String(e)).replace(/^.*?P0001:\s*/, ""),
  semAcento: s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""),
};

// ---------- Opções de produto ----------
// Uma escolha pode ser texto ("Manjericão") ou objeto com preço e unidades ({ nome:"3 unidades", preco:43, unidades:3 }).
window.OPC = {
  nome: e => (e && typeof e === "object") ? e.nome : String(e ?? ""),
  preco: e => (e && typeof e === "object" && e.preco != null && e.preco !== "") ? Number(e.preco) : null,
  unid: e => (e && typeof e === "object" && Number(e.unidades) > 0) ? Number(e.unidades) : 1,
  // preço unitário e unidades de uma linha, a partir do texto "Grupo: escolha; Grupo: escolha"
  linha(p, opcao) {
    let preco = Number(p?.preco || 0), unid = 1;
    const partes = String(opcao || "").split(";").map(x => x.trim());
    for (const g of (p?.opcoes || [])) for (const e of (g.escolhas || [])) {
      if (partes.includes(`${g.nome}: ${OPC.nome(e)}`)) { if (OPC.preco(e) != null) preco = OPC.preco(e); unid *= OPC.unid(e); }
    }
    return { preco, unid };
  },
  // menor preço entre as escolhas com preço (para "a partir de")
  aPartir(p) {
    const ps = (p?.opcoes || []).flatMap(g => (g.escolhas || []).map(OPC.preco)).filter(x => x != null);
    return ps.length ? Math.min(...ps) : null;
  },
};

// ---------- Pix (BR Code "copia e cola", padrão do Banco Central) ----------
window.PIX = {
  tlv(id, v) { return id + String(v.length).padStart(2, "0") + v; },
  crc16(s) {
    let crc = 0xFFFF;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  },
  payload({ chave, nome, cidade, valor, txid }) {
    const t = PIX.tlv;
    const limpa = (s, n) => U.semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().slice(0, n) || "LOJA";
    let p = t("00", "01")
      + t("26", t("00", "br.gov.bcb.pix") + t("01", chave))
      + t("52", "0000") + t("53", "986")
      + (valor > 0 ? t("54", Number(valor).toFixed(2)) : "")
      + t("58", "BR") + t("59", limpa(nome, 25)) + t("60", limpa(cidade, 15))
      + t("62", t("05", String(txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***"))
      + "6304";
    return p + PIX.crc16(p);
  },
  // normaliza a chave conforme o tipo escolhido no painel
  normalizar(tipo, chave) {
    const d = String(chave || "").replace(/\D/g, "");
    if (tipo === "cpf") return d;
    if (tipo === "celular") return "+55" + d.replace(/^55(?=\d{10,11}$)/, "");
    if (tipo === "email") return String(chave || "").trim().toLowerCase();
    return String(chave || "").trim();
  },
};

// ---------- Endereço e distância (CEP: ViaCEP · mapa: OpenStreetMap) ----------
window.GEO = {
  async cep(cep) {
    const c = String(cep).replace(/\D/g, "");
    if (c.length !== 8) return null;
    try { const r = await fetch(`https://viacep.com.br/ws/${c}/json/`); const j = await r.json(); return j.erro ? null : j; } catch (e) { return null; }
  },
  async coords({ rua, numero, cidade, uf, cep, livre }) {
    const tenta = async qs => {
      try {
        const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&" + qs, { headers: { "Accept-Language": "pt-BR" } });
        const j = await r.json(); return j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
      } catch (e) { return null; }
    };
    const enc = encodeURIComponent;
    if (livre) return await tenta("q=" + enc(livre));
    return await tenta(`street=${enc(`${numero} ${rua}`)}&city=${enc(cidade)}&state=${enc(uf || "SP")}`)
        || await tenta("q=" + enc(`${rua}, ${numero}, ${cidade}, ${uf || "SP"}`))
        || (cep ? await tenta(`postalcode=${enc(cep)}&country=Brasil`) : null);
  },
  linhaReta(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },
  // distância de rua (km); se o roteador não responder, estima pela linha reta × 1,35
  async km(a, b) {
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`);
      const j = await r.json();
      if (j.routes?.[0]) return j.routes[0].distance / 1000;
    } catch (e) {}
    return GEO.linhaReta(a, b) * 1.35;
  },
};
