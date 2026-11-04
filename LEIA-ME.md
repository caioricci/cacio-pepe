# Cacio & Pepe — Encomendas

- `index.html` — cardápio público (o link que vai pro Instagram/WhatsApp)
- `painel.html` — Produzione, o painel da equipe (também abre em `/painel`)
- `config.js` — endereço do banco (Supabase, projeto `cacio-e-pepe`)

## Colocar no ar (Netlify)
1. Abra https://app.netlify.com/drop e arraste esta pasta inteira (descompactada).
2. O Netlify gera um endereço tipo `nome-aleatorio.netlify.app`. Em *Site configuration → Change site name* dá pra trocar para `caciopepe.netlify.app`.
3. No Supabase: *Authentication → URL Configuration → Site URL* = esse endereço. É pra onde o link de confirmação de e-mail leva.

## Primeiro acesso ao painel
1. Seu e-mail precisa estar liberado (Ajustes → Equipe; o primeiro é liberado pelo Claude direto no banco).
2. Abra `/painel`, toque em "Primeiro acesso? Criar senha", confirme o e-mail e entre.

## Rotina
- **Produção**: para cada horário, preencha pães planejados e, depois do forno, os aprovados. O site usa esse número para saber quantos pedidos ainda cabem.
- **Vendas extras**: depois do corte, ligue "Liberar vendas extras" no horário e o site volta a mostrar esse horário enquanto houver pão livre.
- **Pedidos**: chegam como "Aguardando" e já seguram o pão. Confirme quando a mensagem chegar no WhatsApp; cancele se a pessoa não mandou, e o pão volta a ficar livre.
