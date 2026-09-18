/* =====================================================================
   provas/texto-in-place.js — QUEM ABRE A CAIXA IN-PLACE É O TEMA, NÃO O NÚCLEO.
       node provas/texto-in-place.js

   GAP DECLARADO NO RETORNO F1: `TEXTO = { tt: 1, tx: 1 }` era fixo em
   `editar.js` — um projeto real do consumidor edita mais tipos in-place
   (mono e nó-com-rótulo, checado ao vivo contra a peça real no F1b) e o
   núcleo não tinha como saber disso sem hardcode por projeto.

   A CURA: gancho opcional `textoInPlace` (array de tipos) no tema. Sem
   ele, o padrão continua `tt`/`tx` — é o que ESTA suíte prova com um
   projeto fixture que NÃO declara a chave (o CAD real também não declara,
   e por isso não muda nada nele — verificado ao vivo no F1b). COM a
   chave, a lista dada SUBSTITUI o padrão inteiro (não soma) — por isso o
   segundo cenário também prova que `tx`, fora da lista declarada,
   PARA de abrir.
   ===================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
/* ver `provas/xss-clipboard.js` para a doutrina completa desta função —
   caminho de `puppeteer-core` não vaza ambiente-hospedeiro no repo. */
function resolverPuppeteerCore() {
  if (process.env.EDITORHTML_PUPPETEER_CORE) return process.env.EDITORHTML_PUPPETEER_CORE;
  try { require.resolve('puppeteer-core'); return 'puppeteer-core'; }
  catch (e) {
    throw new Error('puppeteer-core não encontrado. Defina EDITORHTML_PUPPETEER_CORE=<caminho> ' +
      'ou rode `npm i -D puppeteer-core` neste repositório.');
  }
}
const puppeteer = require(resolverPuppeteerCore());

const RAIZ = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SENTINELA = 'EDITORHTML_NO_AR';

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok    ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}

function prepararFixture(comTextoInPlace) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editorhtml-tip-'));
  fs.writeFileSync(path.join(dir, 'pecas.js'),
    "window.FIX = { usos: [] };\n" +
    "window.FIX.usos.push({ slug: 'p1', w: 400, h: 200, L: [\n" +
    "  { t: 'tt', tx: 'titulo', box: [0, 0, 50, 20] },\n" +
    "  { t: 'tx', tx: 'apoio', box: [0, 20, 50, 20] },\n" +
    "  { t: 'custom', tx: 'mono', box: [0, 40, 50, 20] }\n" +
    "] });\n");
  const linhaTextoInPlace = comTextoInPlace ? "    textoInPlace: ['tt', 'custom'],\n" : '';
  /* UMD, como os temas de verdade (CAD e outros projetos reais) — `module.exports=`
     sozinho, sem guarda, lança ReferenceError no navegador (onde `module`
     não existe) e o `<script>` do tema falha CALADO: o carregador de
     `editar.html` só loga no console e segue, então `window.TEMA` nunca
     é setado e a suíte mediria "sem tema" em vez de medir a chave nova. */
  fs.writeFileSync(path.join(dir, 'editorhtml.tema.js'),
    "'use strict';\n" +
    "(function (raiz, definir) {\n" +
    "  var T = definir();\n" +
    "  if (typeof module === 'object' && module.exports) module.exports = T;\n" +
    "  if (raiz) raiz.TEMA = T;\n" +
    "})(typeof self !== 'undefined' ? self : null, function () {\n" +
    "  'use strict';\n" +
    "  return { nome: 'fixture-tip',\n" +
    linhaTextoInPlace +
    "    projeto: { raiz: (typeof __dirname !== 'undefined') ? __dirname : null,\n" +
    "      formato: 'global', global: 'FIX', dadosScripts: ['pecas.js'] } };\n" +
    "});\n");
  return dir;
}

function subirServidor(dir) {
  return new Promise((pronto, erro) => {
    const p = spawn(process.execPath,
      [path.join(RAIZ, 'editor', 'servir.js'), '0', '--config', path.join(dir, 'editorhtml.tema.js')],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', resolvido = false;
    const relogio = setTimeout(() => { if (!resolvido) erro(new Error('servidor não anunciou a tempo')); }, 15000);
    p.stdout.on('data', d => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const linha = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (linha.startsWith(SENTINELA + ' ')) {
          resolvido = true; clearTimeout(relogio);
          pronto({ anuncio: JSON.parse(linha.slice(SENTINELA.length + 1)), processo: p });
        }
      }
    });
    p.stderr.on('data', () => {});
    p.on('exit', code => { if (!resolvido) { clearTimeout(relogio); erro(new Error('servidor saiu (código ' + code + ')')); } });
  });
}

async function tentarAbrirCaixa(browser, url, indice) {
  const pg = await browser.newPage();
  await pg.goto(url + '?arq=pecas', { waitUntil: 'networkidle0' });
  await pg.waitForFunction(() => window.__EDITOR && window.__EDITOR.E && window.__EDITOR.E.L, { timeout: 10000 });
  await pg.evaluate(i => { window.__EDITOR.marcar(i); window.__EDITOR.editarNaCaixa(i); }, indice);
  const abriu = await pg.evaluate(() => !!document.querySelector('.editando'));
  if (abriu) await pg.evaluate(() => window.__EDITOR.fecharCaixa(true));
  await pg.close();
  return abriu;
}

(async () => {
  const b = await puppeteer.launch({ headless: 'new', executablePath: CHROME,
    args: ['--force-device-scale-factor=1', '--hide-scrollbars'] });
  const limpeza = [];
  try {
    /* CENÁRIO A — tema SEM `textoInPlace` (como o CAD real). Padrão de
       sempre: só tt/tx abrem; `custom` (nem núcleo, nem `tipos` do tema)
       fica de fora — a MESMA regra de antes desta mudança. */
    const dirA = prepararFixture(false);
    limpeza.push(dirA);
    const svA = await subirServidor(dirA);
    console.log('\n· cenário A — sem textoInPlace (padrão tt/tx, como o CAD)');
    ok(await tentarAbrirCaixa(b, svA.anuncio.url, 0), 'A: `tt` abre in-place (padrão)');
    ok(await tentarAbrirCaixa(b, svA.anuncio.url, 1), 'A: `tx` abre in-place (padrão)');
    ok(!(await tentarAbrirCaixa(b, svA.anuncio.url, 2)), 'A: `custom` NÃO abre — tema não reivindicou o tipo');
    svA.processo.kill();

    /* CENÁRIO B — tema COM `textoInPlace: ['tt','custom']` (um projeto
       real declara uma lista maior, com os tipos mono/nó dele também).
       A lista SUBSTITUI o padrão: `custom` passa a abrir, e `tx` — fora
       da lista — para. */
    const dirB = prepararFixture(true);
    limpeza.push(dirB);
    const svB = await subirServidor(dirB);
    console.log('\n· cenário B — textoInPlace: [tt, custom]');
    ok(await tentarAbrirCaixa(b, svB.anuncio.url, 0), 'B: `tt` continua abrindo');
    ok(await tentarAbrirCaixa(b, svB.anuncio.url, 2), 'B: `custom` PASSA a abrir — reivindicado pelo tema');
    ok(!(await tentarAbrirCaixa(b, svB.anuncio.url, 1)), 'B: `tx` PARA de abrir — a lista substitui, não soma');
    svB.processo.kill();
  } finally {
    await b.close();
    for (const dir of limpeza) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
    ok(limpeza.every(d => !fs.existsSync(d)), 'as fixtures temporárias foram apagadas');
  }

  console.log('\n' + checks + ' verificações, ' + falhas + ' falhas.');
  process.exit(falhas ? 1 : 0);
})().catch(e => {
  console.error('ERRO NA SUÍTE: ' + (e && e.stack || e));
  process.exit(1);
});
