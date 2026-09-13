# Deploy no Cloudflare Pages

Esta versão substitui a interface Streamlit por HTML/CSS/JavaScript e usa uma Pages Function em `/api/markets` como proxy para a CoinGecko.

## Configuração recomendada

1. No Cloudflare, crie um projeto em **Workers & Pages > Pages > Connect to Git**.
2. Selecione este repositório e a branch desejada.
3. Framework preset: **None**.
4. Build command: `exit 0`.
5. Build output directory: `.`.
6. Faça o deploy.

A pasta `functions/` deve permanecer na raiz do projeto. O arquivo `_routes.json` restringe as invocações de Functions a `/api/*`, mantendo os arquivos estáticos fora da Function.

## Chave CoinGecko opcional

O usuário pode informar uma chave Demo apenas durante a sessão no navegador. Para configurar uma chave padrão no servidor, crie no Cloudflare Pages uma variável secreta chamada `COINGECKO_API_KEY` e faça novo deploy. Nunca salve a chave no repositório.

## Desenvolvimento local

Use Wrangler para servir os arquivos estáticos e Pages Functions juntos:

```bash
npx wrangler pages dev .
```

Execute também as validações da versão web:

```bash
node --check collection-policy.js
node --check app.js
node --test tests/test_collection_policy.cjs tests/test_markets_function.mjs
```

## Política de coleta

- A consulta usa BRL e ordenação decrescente por capitalização de mercado.
- Somente criptos com market cap maior ou igual a R$ 1.000.000 entram no catálogo.
- A coleta para automaticamente quando uma página cruza o valor mínimo, mantendo 40 páginas como limite de segurança.
- No mínimo 5 segundos entre páginas consecutivas.
- No mínimo 15 segundos entre blocos de quatro páginas.
- Até quatro tentativas quando a CoinGecko responde com HTTP 429.
- O cabeçalho `Retry-After` é respeitado, nunca com uma espera menor que 60 segundos.
- Erros exibem o código HTTP retornado pela CoinGecko para facilitar o diagnóstico.

## Arquitetura

- `index.html`: interface.
- `styles.css`: tema Crypto Midnight.
- `collection-policy.js`: intervalos mínimos e política de repetição.
- `app.js`: coleta paginada, pesquisa, prévia e download.
- `animations.js`: animações GSAP (entrada, parallax e microinterações).
- `pwa.js`: botão de instalação e registro do service worker.
- `sw.js`: cache do app shell — `/api/*` nunca é cacheado.
- `manifest.webmanifest`: nome, cores e ícones do app instalado.
- `assets/`: logo, ícones PNG, favicon e a fonte Inter self-hosted.
- `vendor/gsap/`: GSAP e ScrollTrigger servidos pelo próprio domínio.
- `functions/api/markets.js`: proxy edge para CoinGecko.
- `_routes.json`: executa Functions apenas em `/api/*`.
- `_headers`: CSP, demais cabeçalhos de segurança e cache dos estáticos.

## App instalável no celular

`manifest.webmanifest` e as meta tags do `index.html` apontam para os ícones da
marca, então o atalho criado na tela de início aparece com o logo do projeto:

- Android/Chrome: ícone `any` (192 e 512) e `maskable` (512, conteúdo dentro da
  zona segura central). O botão **Instalar app** aparece quando o navegador
  dispara `beforeinstallprompt`.
- iOS/Safari: `apple-touch-icon.png` (180×180, sem cantos arredondados porque o
  iOS aplica a própria máscara). O caminho é Compartilhar > Adicionar à Tela de
  Início, e o botão exibe essa dica.

Os PNGs são gerados a partir da mesma geometria do `assets/logo.svg`:

```bash
pip install Pillow
python tools/generate_icons.py
```

## Cabeçalhos e CSP

O `_headers` aplica `Content-Security-Policy` com `script-src 'self'` — não há
script inline na página, e GSAP e a fonte são servidos do próprio domínio.
`img-src` aceita qualquer origem `https:` porque os logotipos das criptos vêm de
hosts da CoinGecko que mudam sem aviso.

A coleta é paginada pelo navegador. Isso evita manter uma única execução server-side aberta durante os intervalos configurados entre páginas.
