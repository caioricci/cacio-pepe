// teste temporário: a Sefaz-SP responde para os servidores do Netlify?
export default async () => {
  const out = {};
  for (const [k, u] of [["qr", "https://www.nfce.fazenda.sp.gov.br/qrcode?p=35251100000000000000650010000000011000000010|2|1|1|0000000000000000000000000000000000000000"], ["home", "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaPublica.aspx"]]) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1", "Accept": "text/html", "Accept-Language": "pt-BR" } });
      const t = await r.text();
      out[k] = { status: r.status, tamanho: t.length, texto: t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>|\s+/g, " ").slice(0, 300) };
    } catch (e) { out[k] = { erro: String(e) }; }
  }
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
};
