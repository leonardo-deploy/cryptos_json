# GSAP vendorizado

Arquivos copiados sem alteração do pacote npm `gsap@3.13.0`
(`node_modules/gsap/dist/`), servidos pelo próprio domínio para evitar
dependência de CDN de terceiros e requisições cross-origin.

- `gsap.min.js` — core.
- `ScrollTrigger.min.js` — plugin de animações por scroll.

Licença: GSAP Standard "no charge" license — <https://gsap.com/standard-license>.

Para atualizar:

```bash
npm pack gsap@<versao>
tar -xzf gsap-<versao>.tgz
cp package/dist/gsap.min.js package/dist/ScrollTrigger.min.js vendor/gsap/
```
