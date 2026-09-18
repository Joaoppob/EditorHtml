/* =====================================================================
   provas/gerar.js — O SLUG QUE VIRA ARGUMENTO DE PROCESSO TEM CERCA DUPLA.
       node provas/gerar.js

   ACHADO DA REVISÃO INDEPENDENTE (F2, 2026-09-17), [BAIXA]: `/_api/gerar`
   só filtrava `typeof s === 'string' && s` e passava a lista direto para
   `iniciarBuild` → `spawn(comando, args)`. `args` de um projeto típico
   termina com `...slugs` — um slug como `--force` ou `-x` chega ao
   comando de build como FLAG, não como nome de peça. A entrada nunca
   passava por regex nem por "isto existe no projeto aberto agora?".

   A CERCA É DUPLA, E AS DUAS TÊM DE REPROVAR SOZINHAS:
     1. FORMATO — `^[a-z0-9][a-z0-9-]*$`. Nunca começa com `-`, então nunca
        vira flag, mesmo antes de saber se o slug existe.
     2. PERTENCIMENTO — tem de estar no inventário do projeto que este
        servidor tem aberto agora. Formato válido não basta: um slug bem
        formado que não existe também não pode chegar ao `spawn`.

   UM SLUG RUIM RECUSA O PEDIDO INTEIRO (nunca gera 3 de 4 em silêncio) —
   e a suíte confirma que a recusa NÃO inicia job nenhum (o controle
   positivo: pedir só o slug bom, depois do pedido misto, tem de continuar
   funcionando — a cerca não pode ter travado o caminho feliz).
   ===================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const SENTINELA = 'EDITORHTML_NO_AR';

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok    ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}

/* ------------------------------------------------------------------ */
/* um projeto `--config` mínimo, com `projeto.build` declarado — sem
   isso `/_api/gerar` nem existe (404 nomeado, provado noutro lugar). O
   "build" aqui só ecoa os slugs recebidos; o que está sob prova é QUEM
   chega a virar argumento dele, não o que o comando faz. */
function prepararFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editorhtml-gerar-'));
  fs.writeFileSync(path.join(dir, 'pecas.js'),
    "window.FIX = { usos: [] };\n" +
    "window.FIX.usos.push({ slug: 'valida-1', w: 100, h: 100, L: [] });\n" +
    "window.FIX.usos.push({ slug: 'valida-2', w: 100, h: 100, L: [] });\n");
  const logArquivo = path.join(dir, 'build.log');
  /* o "build" É UM ARQUIVO DE VERDADE, não script embutido em `-e` — três
     camadas de citação (gerar.js → tema.js → argv do -e) para um `\n` só
     é exatamente o tipo de armadilha que come backslash. Um arquivo
     próprio tem UMA camada (o dele mesmo). */
  fs.writeFileSync(path.join(dir, 'build-eco.js'),
    "'use strict';\n" +
    "const fs = require('fs');\n" +
    "fs.appendFileSync(" + JSON.stringify(logArquivo) + ", process.argv.slice(2).join(',') + '\\n');\n");
  fs.writeFileSync(path.join(dir, 'editorhtml.tema.js'),
    "'use strict';\n" +
    "module.exports = { nome: 'fixture-gerar', projeto: {\n" +
    "  raiz: __dirname, formato: 'global', global: 'FIX',\n" +
    "  dadosScripts: ['pecas.js'],\n" +
    "  build: { comando: process.execPath, cwd: __dirname,\n" +
    "    args: function (slugs) { return ['build-eco.js'].concat(slugs); } }\n" +
    "} };\n");
  return { dir, logArquivo };
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
    p.on('exit', code => { if (!resolvido) { clearTimeout(relogio); erro(new Error('servidor saiu (código ' + code + ') antes de anunciar')); } });
  });
}

function post(porta, corpo) {
  return new Promise((res, rej) => {
    const b = Buffer.from(JSON.stringify(corpo), 'utf8');
    const req = http.request({ host: '127.0.0.1', port: porta, path: '/_api/gerar', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': b.length } }, r => {
      let acc = '';
      r.on('data', d => { acc += d; });
      r.on('end', () => { try { res({ status: r.statusCode, json: JSON.parse(acc) }); } catch (e) { rej(e); } });
    });
    req.on('error', rej);
    req.end(b);
  });
}

function get(porta) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: porta, path: '/_api/gerar' }, r => {
      let acc = '';
      r.on('data', d => { acc += d; });
      r.on('end', () => { try { res({ status: r.statusCode, json: JSON.parse(acc) }); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

async function esperarJobParar(porta, timeoutMs) {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    const r = await get(porta);
    if (r.json && r.json.rodando === false) return r.json;
    await new Promise(v => setTimeout(v, 100));
  }
  throw new Error('job não terminou a tempo');
}

(async () => {
  const { dir, logArquivo } = prepararFixture();
  const { anuncio, processo } = await subirServidor(dir);
  const porta = anuncio.porta;
  console.log('fixture em ' + dir + ', servidor na porta ' + porta);

  try {
    /* 1 · CONTROLE POSITIVO — o caminho feliz continua aberto */
    const r1 = await post(porta, { slugs: ['valida-1'] });
    ok(r1.status === 202 && r1.json.ok === true, '1 slug válido e conhecido: 202, iniciado', JSON.stringify(r1));
    await esperarJobParar(porta, 10000);
    const logDepois1 = fs.existsSync(logArquivo) ? fs.readFileSync(logArquivo, 'utf8') : '';
    ok(logDepois1.trim() === 'valida-1', 'o build recebeu exatamente `valida-1`', JSON.stringify(logDepois1));

    /* 2 · FORMATO — começa com `-`, nunca pode virar flag */
    const r2 = await post(porta, { slugs: ['--force'] });
    ok(r2.status === 400 && r2.json.erro === 'slug-invalido', '`--force` (viraria flag): 400 slug-invalido', JSON.stringify(r2));

    /* 3 · FORMATO — maiúscula/espaço/ponto fora do padrão */
    const r3 = await post(porta, { slugs: ['Valida-1'] });
    ok(r3.status === 400 && r3.json.erro === 'slug-invalido', '`Valida-1` (maiúscula, fora do regex): 400 slug-invalido', JSON.stringify(r3));

    /* 4 · PERTENCIMENTO — formato ok, mas não está no inventário do projeto aberto */
    const r4 = await post(porta, { slugs: ['nao-existe-no-projeto'] });
    ok(r4.status === 400 && r4.json.erro === 'slug-invalido', 'slug bem formado mas ausente do projeto: 400 slug-invalido', JSON.stringify(r4));

    /* 5 · UM RUIM CONTAMINA O PEDIDO INTEIRO — não gera 1 de 2 em silêncio */
    const antesLog = fs.existsSync(logArquivo) ? fs.readFileSync(logArquivo, 'utf8') : '';
    const r5 = await post(porta, { slugs: ['valida-2', '-x'] });
    ok(r5.status === 400 && r5.json.erro === 'slug-invalido', 'par [bom, ruim]: o pedido INTEIRO recusa (400)', JSON.stringify(r5));
    await new Promise(v => setTimeout(v, 300));
    const depoisLog = fs.existsSync(logArquivo) ? fs.readFileSync(logArquivo, 'utf8') : '';
    ok(depoisLog === antesLog, 'o par recusado NÃO tocou o build (log não cresceu)', JSON.stringify({ antes: antesLog, depois: depoisLog }));

    /* 6 · não-string na lista */
    const r6 = await post(porta, { slugs: [123, 'valida-1'] });
    ok(r6.status === 400 && r6.json.erro === 'slug-invalido', 'slug não-string na lista: 400 slug-invalido', JSON.stringify(r6));

    /* 7 · CONTROLE POSITIVO DE NOVO — a cerca não travou o caminho feliz */
    const r7 = await post(porta, { slugs: ['valida-2'] });
    ok(r7.status === 202 && r7.json.ok === true, 'depois de 5 rejeições, o slug bom ainda funciona: 202', JSON.stringify(r7));
    await esperarJobParar(porta, 10000);
    const logFinal = fs.readFileSync(logArquivo, 'utf8').trim().split('\n');
    ok(logFinal[logFinal.length - 1] === 'valida-2', 'o segundo build recebeu exatamente `valida-2`', JSON.stringify(logFinal));
  } finally {
    processo.kill();
    fs.rmSync(dir, { recursive: true, force: true });
    ok(!fs.existsSync(dir), 'a fixture temporária foi apagada');
  }

  console.log('\n' + checks + ' verificações, ' + falhas + ' falhas.');
  process.exit(falhas ? 1 : 0);
})().catch(e => {
  console.error('ERRO NA SUÍTE: ' + (e && e.stack || e));
  process.exit(1);
});
