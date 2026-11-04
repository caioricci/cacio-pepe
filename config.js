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
};
