/* Protege os invariantes da interface web: se um ícone, script ou fonte sumir do
   repositório, ou se voltar script/estilo inline (que a CSP bloqueia), o CI falha
   antes do deploy. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(ROOT, name), "utf8");
const localPath = (reference) => join(ROOT, reference.replace(/^\//, "").split("?")[0]);

const html = read("index.html");
const manifest = JSON.parse(read("manifest.webmanifest"));
const headers = read("_headers");
const csp = headers.match(/Content-Security-Policy:(.*)/)?.[1] ?? "";

test("todo arquivo local citado no index.html existe", () => {
  const references = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(references.length > 8, "esperava várias referências locais");
  for (const reference of references) {
    assert.ok(existsSync(localPath(reference)), `referência quebrada no index.html: ${reference}`);
  }
});

test("o manifesto aponta ícones que existem, incluindo 192, 512 e maskable", () => {
  for (const icon of manifest.icons) {
    assert.ok(existsSync(localPath(icon.src)), `ícone ausente: ${icon.src}`);
  }
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes("192x192"), "falta o ícone 192x192");
  assert.ok(sizes.includes("512x512"), "falta o ícone 512x512");
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === "maskable"),
    "falta um ícone maskable para o Android",
  );
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.name && manifest.short_name, "nome e short_name são obrigatórios");
});

test("o apple-touch-icon está declarado para o atalho do iOS", () => {
  const match = html.match(/rel="apple-touch-icon"\s+href="([^"]+)"/);
  assert.ok(match, "sem apple-touch-icon o atalho do iOS fica sem logo");
  assert.ok(existsSync(localPath(match[1])), `apple-touch-icon ausente: ${match[1]}`);
});

test("o app shell do service worker só lista arquivos existentes", () => {
  const shell = read("sw.js").match(/const APP_SHELL = \[(.*?)\];/s)?.[1] ?? "";
  const entries = [...shell.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(entries.length > 5, "esperava um app shell preenchido");
  for (const entry of entries) {
    if (entry === "/") continue;
    assert.ok(existsSync(localPath(entry)), `app shell aponta para arquivo inexistente: ${entry}`);
  }
});

test("a CSP não abre exceção para inline nem eval", () => {
  assert.match(csp, /script-src 'self'/, "script-src deve ficar restrito a 'self'");
  assert.doesNotMatch(csp, /unsafe-inline/, "nenhuma diretiva deve liberar inline");
  assert.doesNotMatch(csp, /unsafe-eval/, "nenhuma diretiva deve liberar eval");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});

test("o HTML não usa script nem estilo inline, que a CSP bloquearia", () => {
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/.exec(html);
  assert.equal(inlineScript, null, "script inline seria bloqueado por script-src 'self'");
  assert.equal(/<style[\s>]/.test(html), false, "estilo inline seria bloqueado por style-src 'self'");
  assert.equal(/\sstyle="/.test(html), false, "atributo style seria bloqueado por style-src 'self'");
});

test("os IDs que o app.js manipula continuam no HTML", () => {
  const app = read("app.js");
  const ids = new Set([...app.matchAll(/\$\('([a-zA-Z]+)'\)/g)].map((match) => match[1]));
  assert.ok(ids.size > 15, "esperava vários IDs em uso no app.js");
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `app.js usa #${id}, mas o HTML não tem esse elemento`);
  }
});
