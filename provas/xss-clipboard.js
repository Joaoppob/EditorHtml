/* =====================================================================
   provas/xss-clipboard.js — A COLAGEM NÃO EXECUTA.
       node provas/xss-clipboard.js

   ACHADO DA REVISÃO INDEPENDENTE (F2, 2026-09-17), [ALTA]: `caixaCola`
   (editar.js) fazia `tmp.innerHTML = html` num `<div>` criado por
   `document.createElement` — desanexado da tela, mas ainda pertencente ao
   `document` VIVO, com browsing context. Isso basta para `<img onerror>` e
   `<svg onload>` disparAREM no instante do `innerHTML=`, antes de
   `TEXTO_CAMADA.daCaixa` sanear qualquer coisa. Quem colar um HTML rico
   numa peça aberta no editor roda script arbitrário com acesso ao mesmo
   `fetch` que grava no disco — sem precisar de nenhuma outra falha.

   A CURA: `new DOMParser().parseFromString(html, 'text/html')` produz um
   Document SEM browsing context. Elemento nenhum ali busca recurso nem
   dispara handler — só depois disso o resultado passa por
   `TEXTO_CAMADA.daCaixa`, que já era a cerca (e continua sendo).

   ESTA PROVA TEM DE REPROVAR CONTRA O COMMIT c04c639. Não é afirmação:
   ela sobe DUAS variantes do servidor — a `editor/editar.js` do commit
   c04c639 (a que a revisão leu) e a do disco de agora — cada uma na sua
   cópia temporária, e cola o MESMO payload nas duas. O commit velho tem
   de acender `window.__xss`; o de agora não pode.

   POR QUE NÃO SOBE NA PORTA PADRÃO. Cada variante sobe numa porta alta
   (86xx) e cai no fim — testar contra 8811 brigaria com um editor aberto.
   ===================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
/* `puppeteer-core` não é dependência deste pacote (ele não precisa de
   browser fora das provas) — o CAMINHO fica fora do repositório de
   propósito: um caminho absoluto embutido aqui vazaria de qual máquina/
   ambiente-hospedeiro esta suíte roda, e é exatamente esse tipo de
   literal que `provas/higiene.js` existe para acusar. Aponte com
   `EDITORHTML_PUPPETEER_CORE=<caminho-do-modulo>`, ou instale
   `puppeteer-core` neste repositório (`npm i -D puppeteer-core`). */
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
const COMMIT_VELHO = 'c04c639';
const SENTINELA = 'EDITORHTML_NO_AR';
const PORTA_BASE = 8630;

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok    ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}

const lixo = [];
function limparNoFim(caminho) { lixo.push(caminho); }

/* ------------------------------------------------------------------ */
/* cópia isolada do repo com UMA variante de editar.js dentro, para o
   servidor rodar 100% self-contained (editor/, motor/, temas/, pecas/) */
function prepararVariante(rotulo, conteudoEditarJs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editorhtml-xss-' + rotulo + '-'));
  for (const sub of ['editor', 'motor', 'temas', 'pecas']) {
    fs.cpSync(path.join(RAIZ, sub), path.join(dir, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'editor', 'editar.js'), conteudoEditarJs, 'utf8');
  limparNoFim(dir);
  return dir;
}

function subirServidor(dir, porta) {
  return new Promise((pronto, erro) => {
    const p = spawn(process.execPath,
      [path.join(dir, 'editor', 'servir.js'), String(porta), path.join(dir, 'pecas'), 'exemplo'],
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', resolvido = false;
    const relogio = setTimeout(() => {
      if (!resolvido) erro(new Error('servidor em ' + porta + ' não anunciou a tempo'));
    }, 15000);
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
    p.on('exit', code => { if (!resolvido) { clearTimeout(relogio); erro(new Error('servidor saiu (código ' + code + ') antes de anunciar')); } });
  });
}

/* payload único: as duas famílias que a revisão pediu, mais texto puro
   que TEM de sobreviver saneado. */
const PAYLOAD_HTML =
  '<img src=x onerror="window.__xss=1">' +
  '<svg onload="window.__xss=1">marca do svg</svg>' +
  'texto visível';

async function rodarVariante(rotulo, porta, dir) {
  console.log('\n· variante ' + rotulo + ' (porta ' + porta + ', ' + dir + ')');
  const { anuncio, processo } = await subirServidor(dir, porta);
  const b = await puppeteer.launch({ headless: 'new', executablePath: CHROME,
    args: ['--force-device-scale-factor=1', '--hide-scrollbars'] });
  try {
    const pg = await b.newPage();
    const erros = [];
    pg.on('pageerror', e => erros.push(String(e)));
    await pg.goto(anuncio.url + '?arq=cartao', { waitUntil: 'networkidle0' });
    await pg.waitForFunction(() => window.__EDITOR && window.__EDITOR.E && window.__EDITOR.E.L, { timeout: 10000 });

    /* cartao-capa, índice 3 = a camada `tt` (ver pecas/cartao.js) */
    await pg.evaluate(i => { window.__xss = undefined; window.__EDITOR.marcar(i); window.__EDITOR.editarNaCaixa(i); }, 3);
    const abriuCaixa = await pg.evaluate(() => !!document.querySelector('.editando'));
    if (!ok(abriuCaixa, rotulo + ': a caixa in-place abriu na camada de teste')) {
      return { xss: null, textoFinal: null, erros };
    }

    await pg.evaluate((html) => {
      const no = document.querySelector('.editando');
      no.focus();
      const sel = window.getSelection();
      const r = document.createRange(); r.selectNodeContents(no);
      sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      dt.setData('text/plain', 'marca do svg texto visível');
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      no.dispatchEvent(ev);
    }, PAYLOAD_HTML);

    /* dá tempo para onerror/onload disparar SE forem disparar — a rede
       não sai (chrome resolve `x` local em erro), mas o evento é síncrono
       o bastante para não precisar mais que um tick */
    await new Promise(r => setTimeout(r, 300));

    const xss = await pg.evaluate(() => window.__xss);
    const textoFinal = await pg.evaluate(() => document.querySelector('.editando').textContent);
    await pg.evaluate(() => window.__EDITOR.fecharCaixa(true));
    return { xss, textoFinal, erros };
  } finally {
    await b.close();
    processo.kill();
  }
}

(async () => {
  console.log('preparando as duas variantes (disco de agora × commit ' + COMMIT_VELHO + ')...');
  const editarAtual = fs.readFileSync(path.join(RAIZ, 'editor', 'editar.js'), 'utf8');
  const editarVelho = execFileSync('git', ['show', COMMIT_VELHO + ':editor/editar.js'],
    { cwd: RAIZ, encoding: 'utf8' });
  ok(editarVelho.indexOf('new DOMParser()') < 0,
    'controle: o texto de ' + COMMIT_VELHO + ' NÃO tem a cura (senão a variante velha não provaria nada)');
  ok(editarAtual.indexOf('new DOMParser()') >= 0,
    'controle: o disco de agora TEM a cura em caixaCola');

  const dirVelho = prepararVariante('velho', editarVelho);
  const dirAtual = prepararVariante('atual', editarAtual);

  const rVelho = await rodarVariante('COMMIT ' + COMMIT_VELHO + ' (esperado: XSS dispara)', PORTA_BASE, dirVelho);
  const rAtual = await rodarVariante('DISCO DE AGORA (esperado: XSS não dispara)', PORTA_BASE + 1, dirAtual);

  console.log('\nsaídas literais:');
  console.log('  ' + JSON.stringify({ variante: 'commit-' + COMMIT_VELHO, xss: rVelho.xss, textoFinal: rVelho.textoFinal, erros: rVelho.erros }));
  console.log('  ' + JSON.stringify({ variante: 'disco-atual', xss: rAtual.xss, textoFinal: rAtual.textoFinal, erros: rAtual.erros }));

  ok(rVelho.xss === 1, 'o commit ' + COMMIT_VELHO + ' REPROVA: window.__xss chegou a 1 colando na caixa in-place',
    'window.__xss = ' + JSON.stringify(rVelho.xss));
  ok(rAtual.xss === undefined, 'o disco de agora não deixa window.__xss disparar',
    'window.__xss = ' + JSON.stringify(rAtual.xss));
  ok(!!rAtual.textoFinal && rAtual.textoFinal.indexOf('marca do svg') >= 0 &&
     rAtual.textoFinal.indexOf('texto visível') >= 0 &&
     rAtual.textoFinal.indexOf('<') < 0,
    'o disco de agora entrega o texto visível SANEADO (sem tag, palavras preservadas)',
    'textoFinal = ' + JSON.stringify(rAtual.textoFinal));

  for (const dir of lixo) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  ok(lixo.every(d => !fs.existsSync(d)), 'as cópias temporárias foram apagadas');

  console.log('\n' + checks + ' verificações, ' + falhas + ' falhas.');
  process.exit(falhas ? 1 : 0);
})().catch(e => {
  console.error('ERRO NA SUÍTE: ' + (e && e.stack || e));
  for (const dir of lixo) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (er) {} }
  process.exit(1);
});
