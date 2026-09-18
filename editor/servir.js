/* =====================================================================
   servir.js — o servidor do editor.

       node editor/servir.js [porta] [dir-das-pecas] [tema]

   Serve os arquivos estáticos em LEITURA e abre as rotas de escrita, com
   a cerca no SERVIDOR e não no cliente:

     GET  /_api/inventario           → peças, tema e escopo de escrita
     GET  /_api/ler?arq=cartao       → { hash, linhas }
     GET  /_api/camadas?arq=&slug=   → as camadas COMO ESTÃO NO DISCO
     POST /_api/patch                → devolve o diff SEM gravar
     POST /_api/gravar               → aplica as edições e grava

   POR QUE A CERCA MORA AQUI. O cliente é uma página que qualquer um pode
   abrir; confiar nele para decidir onde escrever é não ter cerca. Aqui:
   só `<dir-das-pecas>/<nome>.js`, nome sem barra nem ponto-ponto, e nada
   mais. Qualquer outro caminho é 403 com o motivo dito.

   POR QUE O HASH. O arquivo de peças é compartilhado — outro editor, um
   `git`, ou outro processo pode estar mexendo nele agora. O cliente manda
   o hash do texto que ele leu; se o disco mudou desde então, eu RECUSO e
   digo. Gravar por cima do trabalho de outro é o estrago que não tem
   desfazer.

   POR QUE `/_api/camadas` EXISTE. A tela podia clonar a declaração da
   cópia que ela carregou ao abrir — e aí editar a peça A, ir pra B e
   voltar mostraria o texto VELHO, com o selo assinando "salvo", que é uma
   afirmação sobre o disco feita sem ter lido o disco. Aqui o editor
   pergunta ao disco, e o recorte é o MESMO de `escrita.js`: ler e escrever
   passam pelo mesmo parser, então divergir é impossível por construção e
   não por disciplina.
   ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { spawn } = require('child_process');
const E = require('./escrita.js');

const RAIZ = path.resolve(__dirname, '..');
const PORTA = +(process.argv[2] || process.env.EDITORHTML_PORTA || 8811);

/* --config <arquivo> — abre um PROJETO EXTERNO sem converter peça nenhuma.
   O arquivo (nome livre — a convenção é `editorhtml.tema.js`, dentro do
   próprio projeto) declara `projeto` (como carregar/gravar no formato de
   origem do projeto) e, opcionalmente, os sete ganchos de tema. Contrato
   completo em `carregarProjeto`, abaixo. Sem `--config`, o servidor
   funciona exatamente como antes: `pecas/` nativo
   (`module.exports = { pecas:[...] }`) + tema por nome em `temas/`. */
function flagConfig() {
  const i = process.argv.indexOf('--config');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.EDITORHTML_CONFIG || null;
}
const CAMINHO_CONFIG = flagConfig();

/* CARREGA A CONFIG NO BOOT — só a RESOLUÇÃO DE CAMINHOS, não os dados da
   peça (esses são lidos a cada `/_api/inventario`, como sempre foi, para
   nunca envelhecer em relação ao disco). Erro aqui NÃO derruba o
   servidor: sem config válida, `PECAS` cai para `pecas/` nativo e o
   motivo fica dito no inventário, mesma doutrina do tema ausente. */
let CFG = null, ERRO_CFG = null;
if (CAMINHO_CONFIG) {
  const abs = path.resolve(CAMINHO_CONFIG);
  try {
    delete require.cache[require.resolve(abs)];
    const mod = require(abs);
    if (!mod || !mod.projeto) throw new Error('o arquivo não declara `projeto`');
    const proj = Object.assign({}, mod.projeto);
    proj.raiz = path.resolve(proj.raiz || path.dirname(abs));
    proj.raizEstatica = path.resolve(proj.raizEstatica || proj.raiz);
    proj.formato = proj.formato || 'global';
    proj.dadosScripts = proj.dadosScripts || [];
    proj.clienteScripts = proj.clienteScripts || [];
    proj.cssExtra = proj.cssExtra || [];
    CFG = Object.assign({}, mod, { projeto: proj, _arquivoConfig: abs });
  } catch (e) {
    ERRO_CFG = 'não consegui carregar --config ' + CAMINHO_CONFIG + ': ' + e.message;
  }
}

const NOME_TEMA = process.argv[4] || process.env.EDITORHTML_TEMA || 'exemplo';
const PECAS = (CFG && CFG.projeto.raiz) ||
  path.resolve(process.argv[3] || process.env.EDITORHTML_PECAS || path.join(RAIZ, 'pecas'));
const RAIZ_ESTATICA_PROJETO = CFG ? CFG.projeto.raizEstatica : null;

const TIPO = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

const hash = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);

/* ------------------------------------------------------------------ */
/* O JOB DE BUILD — um por vez, em memória (não sobrevive a reiniciar o
   servidor, e não precisa: `pedirBuild`/`olharBuild` no cliente
   reconectam nele pelo GET). `projeto.build` é `{ comando, args, cwd }`;
   `args` pode ser array fixo ou função `(slugs) => [...]`. O núcleo só
   executa o que o projeto declarou — nenhuma noção de "PNG" ou "foto"
   mora aqui. */
let JOB = null;
function iniciarBuild(slugs) {
  const b = CFG.projeto.build;
  const args = typeof b.args === 'function' ? b.args(slugs) : (b.args || []);
  JOB = { rodando: true, slugs, passo: 'iniciando', log: ['$ ' + b.comando + ' ' + args.join(' ')], sucesso: null };
  let cp;
  try {
    cp = spawn(b.comando, args, { cwd: b.cwd || CFG.projeto.raiz });
  } catch (e) {
    JOB.rodando = false; JOB.sucesso = false; JOB.passo = 'não consegui iniciar';
    JOB.log.push('! ' + e.message);
    return;
  }
  JOB.passo = 'rodando';
  cp.stdout.on('data', d => JOB.log.push(String(d)));
  cp.stderr.on('data', d => JOB.log.push(String(d)));
  cp.on('error', e => {
    JOB.rodando = false; JOB.sucesso = false; JOB.passo = 'erro de processo';
    JOB.log.push('! ' + e.message);
  });
  cp.on('exit', code => {
    if (!JOB.rodando) return;           /* já resolvido por 'error' acima */
    JOB.rodando = false;
    JOB.sucesso = code === 0;
    JOB.passo = code === 0 ? 'concluído' : ('falhou (código ' + code + ')');
  });
}

/* ------------------------------------------------------------------ */
/* O TEMA E O PROJETO, DO LADO DO SERVIDOR. O tema é dado da ESCRITA
   também: os campos dele entram no escopo do que se pode gravar. Ausente
   ou quebrado NÃO derruba o servidor — o editor abre com os quatro tipos
   do núcleo, e o motivo fica dito no inventário em vez de virar página
   branca. Com `--config`, o "tema" É a própria config: os sete ganchos
   (se declarados) mais o bloco `projeto` (como carregar/gravar). */
function carregarTema() {
  if (CFG) return { tema: CFG, erroTema: ERRO_CFG };
  if (!NOME_TEMA || NOME_TEMA === 'nenhum') return { tema: null, erroTema: null };
  const alvo = path.join(RAIZ, 'temas', NOME_TEMA, 'tema.js');
  if (!fs.existsSync(alvo)) {
    return { tema: null, erroTema: 'não achei temas/' + NOME_TEMA + '/tema.js' };
  }
  try {
    delete require.cache[require.resolve(alvo)];
    return { tema: require(alvo), erroTema: null };
  } catch (e) {
    return { tema: null, erroTema: 'o tema ' + NOME_TEMA + ' não carregou: ' + e.message };
  }
}

/* CARREGA AS PEÇAS DE UM PROJETO EXTERNO NO FORMATO DELE, SEM CONVERTER.
   Dois formatos (`projeto.formato`):
     'global'   (padrão) — scripts que fazem `window.<G>.usos.push({...})`.
                Roda num sandbox `vm` com um `window` de mentira — não
                precisa de DOM porque a declaração é dado puro, nunca
                lógica de montagem (isso mora no `montar.js` do PROJETO,
                que só o NAVEGADOR carrega).
     'commonjs' — cada script de `dadosScripts` é `require()`ado como
                `{ pecas:[...] }`, igual ao modo nativo de `pecas/`.
   EM AMBOS, A ATRIBUIÇÃO peça→arquivo É AUTOMÁTICA: cada peça pertence
   ao script que a criou, medido pelo tamanho de `usos` antes/depois de
   carregar aquele script — na ORDEM declarada em `dadosScripts`. É isto
   que permite "um arquivo por peça" (CAD) e "um arquivo por grupo"
   (várias peças por arquivo) sem nenhum mapa escrito à mão. Um projeto
   pode sobrepor essa atribuição com `projeto.arquivoDe(peca)`. */
function carregarProjeto(proj) {
  const usos = [];
  const problemas = [];
  const atribuicao = {};             /* slug -> nome do arquivo (sem .js) */

  if (proj.formato === 'commonjs') {
    for (const rel of proj.dadosScripts) {
      const nome = rel.replace(/\.js$/, '');
      const abs = path.join(proj.raiz, rel);
      let mod;
      try {
        delete require.cache[require.resolve(abs)];
        mod = require(abs);
      } catch (e) { problemas.push(rel + ' não carregou: ' + e.message); continue; }
      const lista = (mod && mod.pecas) || [];
      if (!Array.isArray(lista) || !lista.length) {
        problemas.push(rel + ' não exporta `{ pecas: [...] }` com nenhuma peça'); continue;
      }
      lista.forEach(p => {
        if (!p || !p.slug) { problemas.push(rel + ' tem uma peça sem `slug`'); return; }
        usos.push(p); atribuicao[p.slug] = nome;
      });
    }
    return { usos, problemas, atribuicao };
  }

  /* 'global' — sandbox com `window` próprio, sem DOM nenhum. */
  const sandbox = {};
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.console = console;
  let ctx;
  try { ctx = vm.createContext(sandbox); }
  catch (e) {
    problemas.push('não consegui criar o sandbox de leitura: ' + e.message);
    return { usos, problemas, atribuicao };
  }
  const arrDe = () => (sandbox[proj.global] && Array.isArray(sandbox[proj.global].usos))
    ? sandbox[proj.global].usos : [];

  for (const rel of proj.dadosScripts) {
    const nome = rel.replace(/\.js$/, '');
    const abs = path.join(proj.raiz, rel);
    let codigo;
    try { codigo = fs.readFileSync(abs, 'utf8'); }
    catch (e) { problemas.push(rel + ' não existe ou não leu: ' + e.message); continue; }
    const antes = arrDe().length;
    try { vm.runInContext(codigo, ctx, { filename: abs }); }
    catch (e) { problemas.push(rel + ' não carregou: ' + e.message); continue; }
    const arr = arrDe();
    for (let k = antes; k < arr.length; k++) {
      const p = arr[k];
      if (p && p.slug) atribuicao[p.slug] = nome;
      else problemas.push(rel + ' criou uma peça sem `slug` (índice ' + k + ' de `usos`)');
    }
  }
  if (!proj.global || !sandbox[proj.global]) {
    problemas.push('`window.' + (proj.global || '?') +
      '` não existe depois de carregar os `dadosScripts` — confira `projeto.global`');
  }
  return { usos: arrDe(), problemas, atribuicao };
}

/* a CERCA de escrita, em uma função só: `cartao` → caminho; qualquer
   outra coisa → null, e quem chamou devolve 403 dizendo por quê.
   Com `--config`, a cerca é um MAPA EXPLÍCITO calculado do inventário
   (nome → caminho absoluto dentro de `projeto.raiz`) — nunca concatenação
   de caminho vinda de entrada do cliente. Sem `--config`, é o mesmo
   padrão de sempre: nome simples, sem barra, dentro de `PECAS`. */
function arquivoDePecas(nome, mapaArquivos) {
  if (typeof nome !== 'string' || !nome) return null;
  if (mapaArquivos) return Object.prototype.hasOwnProperty.call(mapaArquivos, nome) ? mapaArquivos[nome] : null;
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(nome)) return null;
  const alvo = path.join(PECAS, nome + '.js');
  if (path.dirname(alvo) !== PECAS) return null;
  if (!fs.existsSync(alvo)) return null;
  return alvo;
}

/* ------------------------------------------------------------------ */
/* O INVENTÁRIO. Lido do DISCO a cada chamada — o servidor não guarda uma
   cópia que possa envelhecer em relação ao arquivo. */
function inventario() {
  const { tema, erroTema } = carregarTema();
  const usos = [];
  const problemas = [];
  let mapaArquivos = null;

  if (CFG) {
    const proj = CFG.projeto;
    if (ERRO_CFG) {
      problemas.push(ERRO_CFG);
    } else {
      const r = carregarProjeto(proj);
      problemas.push(...r.problemas);
      mapaArquivos = {};
      r.usos.forEach(p => {
        if (!p || !p.slug) return;
        const nome = (typeof proj.arquivoDe === 'function') ? proj.arquivoDe(p) : r.atribuicao[p.slug];
        if (!nome) {
          problemas.push('a peça `' + p.slug + '` não tem arquivo atribuído — não escrevo nela'); return;
        }
        const abs = path.resolve(path.join(proj.raiz, nome + '.js'));
        if (abs !== proj.raiz && !abs.startsWith(proj.raiz + path.sep)) {
          problemas.push('a peça `' + p.slug + '` mapeou para fora de `projeto.raiz` — recusado'); return;
        }
        mapaArquivos[nome] = abs;
        usos.push({ slug: p.slug, n: p.n || p.slug, g: nome, w: p.w, h: p.h, c: p.c || null,
                    cls: p.cls || null, L: p.L || [] });
      });
    }
  } else {
    let arqs = [];
    try {
      arqs = fs.readdirSync(PECAS).filter(f => /\.js$/.test(f) && !/^_/.test(f)).sort();
    } catch (e) {
      problemas.push('não consegui ler ' + PECAS + ': ' + e.message);
    }
    for (const f of arqs) {
      const g = f.replace(/\.js$/, '');
      const alvo = path.join(PECAS, f);
      let mod;
      try {
        delete require.cache[require.resolve(alvo)];
        mod = require(alvo);
      } catch (e) {
        /* ARQUIVO QUE NÃO CARREGA É ESTADO NOMEADO, não peça que some da
           lista. Some em silêncio e quem escreveu conclui que apagou. */
        problemas.push(f + ' não carregou: ' + e.message);
        continue;
      }
      const lista = (mod && mod.pecas) || [];
      if (!Array.isArray(lista) || !lista.length) {
        problemas.push(f + ' não exporta `{ pecas: [...] }` com nenhuma peça');
        continue;
      }
      lista.forEach(p => {
        if (!p || !p.slug) { problemas.push(f + ' tem uma peça sem `slug`'); return; }
        usos.push({ slug: p.slug, n: p.n || p.slug, g, w: p.w, h: p.h, c: p.c || null,
                    cls: p.cls || null, L: p.L || [] });
      });
    }
  }
  /* slug repetido entre arquivos torna a escrita ambígua e a escrita
     recusa depois; melhor dizer agora, na lista, do que no primeiro
     arrasto. */
  const vistos = {};
  usos.forEach(u => {
    if (vistos[u.slug]) problemas.push('o slug `' + u.slug + '` aparece em ' +
      vistos[u.slug] + '.js e em ' + u.g + '.js — ambíguo, não vou gravar nele');
    else vistos[u.slug] = u.g;
  });

  /* URLS DOS SCRIPTS DO PROJETO — computadas AQUI, para o cliente nunca
     precisar fazer conta de `../` em cima de `location`.

     TODA ENTRADA (`dadosScripts`, `clienteScripts`, `cssExtra`,
     `montar.arquivo`) É DECLARADA RELATIVA A `projeto.raiz` — é como se
     escreve naturalmente um `<script src="../dados-de-apoio.js">` de
     dentro do próprio projeto, e é como os temas reais já escrevem.

     A URL FINAL É RELATIVA A QUALQUER RAIZ QUE REALMENTE CONTENHA O
     ARQUIVO: dentro de `raiz`, vira caminho relativo a `raiz` (a imensa
     maioria — o próprio `montar.js` do projeto, o `mat/`, o tema); fora
     de `raiz` mas dentro de `raizEstatica`, vira caminho relativo a
     `raizEstatica` (a minoria que escapa de propósito, tipo um censo de
     assets num diretório irmão). O servidor estático tenta as duas
     raízes NESSA ORDEM (`candidatos`, abaixo) — é a mesma dualidade,
     medida duas vezes: primeiro um raiz único (`raizEstatica`) quebrou
     tudo que vive dentro de `raiz`; a fórmula por-entrada é o que separa
     os dois casos sem escolher errado para nenhum. */
  const projetoResp = CFG ? (() => {
    const proj = CFG.projeto;
    const ABSOLUTA = /^([a-z]+:)?\/\//i;   /* URL de verdade (ex. Google Fonts) — passa direto */
    const urlDe = r => {
      if (ABSOLUTA.test(r)) return r;
      const abs = path.resolve(proj.raiz, r);
      const dentroDoRaiz = abs === proj.raiz || abs.startsWith(proj.raiz + path.sep);
      const base = dentroDoRaiz ? proj.raiz : (proj.raizEstatica || proj.raiz);
      return '/' + path.relative(base, abs).split(path.sep).join('/');
    };
    return {
      dadosScripts: (proj.dadosScripts || []).map(urlDe),
      cssExtra: (proj.cssExtra || []).map(urlDe),
      clienteScripts: (proj.clienteScripts || []).map(urlDe),
      montar: proj.montar ? Object.assign({}, proj.montar, { url: urlDe(proj.montar.arquivo) }) : null
    };
  })() : null;

  return {
    ok: true,
    usos,
    problemas,
    dirPecas: PECAS,
    /* `script` é onde o NAVEGADOR busca os sete ganchos. Sem `--config` é
       sempre `/temas/<nome>/tema.js` (como sempre foi). Com `--config`, o
       arquivo dos ganchos É o próprio arquivo de config — o mesmo que o
       servidor deu `require()` — e por isso a URL é calculada a partir
       dele, nunca de uma convenção de pasta que não existe neste modo. */
    tema: tema ? { nome: tema.nome || NOME_TEMA, css: tema.css || null,
                   script: CFG ? '/' + path.relative(CFG.projeto.raiz, CFG._arquivoConfig).split(path.sep).join('/')
                                : null,
                   ganchos: ['tipos', 'campos', 'rotulo', 'painel', 'previa', 'quebra', 'estante']
                     .filter(k => tema[k] != null) } : null,
    erroTema,
    campos: Object.keys(E.escopoDe(tema)),
    nucleo: ['tt', 'tx', 'obj', 'reserva'],
    projeto: projetoResp,
    podeGerar: !!(CFG && CFG.projeto.build),
    _mapaArquivos: mapaArquivos
  };
}

function json(res, cod, obj) {
  const b = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(cod, { 'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': b.length, 'Cache-Control': 'no-store' });
  res.end(b);
}

function corpo(req) {
  return new Promise((ok, err) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 4e6) { req.destroy(); err(new Error('corpo grande demais')); } });
    req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { err(e); } });
    req.on('error', err);
  });
}

/* diff unificado curto, para o modo patch e para o relatório */
function patchDe(antes, depois, nome) {
  const A = antes.split('\n'), B = depois.split('\n'), out = [];
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    if (A[i] === B[i]) continue;
    out.push('@@ linha ' + (i + 1) + ' @@');
    if (A[i] !== undefined) out.push('-' + A[i]);
    if (B[i] !== undefined) out.push('+' + B[i]);
  }
  return out.length ? ('--- a/' + nome + '.js\n+++ b/' + nome + '.js\n' + out.join('\n')) : '';
}

/* mapa de escrita atual — só recalcula (relê o projeto) quando há
   `--config`; sem config é sempre `null` e `arquivoDePecas` usa a cerca
   por nome de sempre. */
function mapaArquivosAtual() { return CFG ? inventario()._mapaArquivos : null; }

/* ------------------------------------------------------------------ */
function preparar(dados) {
  const alvo = arquivoDePecas(dados.arq, mapaArquivosAtual());
  if (!alvo) return { cod: 403, erro: 'arquivo-fora-da-cerca',
    msg: 'só escrevo em `<nome>.js` dentro de ' + PECAS + '. Veio: ' + JSON.stringify(dados.arq) };

  const atual = fs.readFileSync(alvo, 'utf8');
  const h = hash(atual);
  if (dados.hashEsperado && dados.hashEsperado !== h) {
    return { cod: 409, erro: 'arquivo-mudou',
      msg: 'o arquivo mudou no disco depois que o editor o leu (esperava ' +
           dados.hashEsperado + ', achei ' + h + '). Não gravo por cima. ' +
           'Recarregue a peça e refaça a edição.' };
  }
  const { tema } = carregarTema();
  const r = E.aplicar(atual, dados.edicoes, dados.contagens, tema);
  if (!r.ok) return { cod: 422, erro: r.erro, msg: r.msg };
  return { cod: 200, alvo, atual, r, hashAntes: h };
}

const servidor = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const rota = u.pathname;

  /* ---------- API ---------- */
  /* QUEM É VOCÊ. Um `GET /` que responde 200 prova que ALGUÉM está na
     porta, não que é o servidor que eu subi — foi essa confusão que
     mandou um usuário para a tela de outro projeto. Aqui quem subiu o
     processo compara o token que ele mesmo injetou; servidor vizinho não
     tem como devolver um segredo que nunca viu.

     O token não é segurança: é IDENTIDADE. Ele não protege o editor de
     ninguém, ele só responde "esta porta é a minha?" para quem já sabe a
     resposta certa. Por isso pode ser lido por qualquer um que alcance a
     porta, e por isso o diretório servido vem junto — em diagnóstico à
     mão, ver a pasta errada é mais rápido que comparar hexadecimal. */
  if (rota === '/_api/identidade') {
    return json(res, 200, { ok: true, token: TOKEN, pecas: PECAS, raiz: RAIZ,
      tema: NOME_TEMA, porta: (servidor.address() || {}).port || null, pid: process.pid });
  }

  if (rota === '/_api/inventario') {
    try { return json(res, 200, inventario()); }
    catch (e) { return json(res, 500, { ok: false, erro: 'inventario', msg: e.message }); }
  }

  if (rota === '/_api/ler') {
    const alvo = arquivoDePecas(u.searchParams.get('arq'), mapaArquivosAtual());
    if (!alvo) return json(res, 403, { ok: false, erro: 'arquivo-fora-da-cerca' });
    const t = fs.readFileSync(alvo, 'utf8');
    return json(res, 200, { ok: true, hash: hash(t), linhas: t.split('\n').length });
  }

  if (rota === '/_api/camadas') {
    const nome = u.searchParams.get('arq');
    const slug = u.searchParams.get('slug');
    const alvo = arquivoDePecas(nome, mapaArquivosAtual());
    if (!alvo) return json(res, 403, { ok: false, erro: 'arquivo-fora-da-cerca' });
    const t = fs.readFileSync(alvo, 'utf8');
    const loc = E.localizarCamadas(t, slug);
    if (!loc.ok) return json(res, 422, { ok: false, erro: loc.erro, msg: loc.msg, hash: hash(t) });
    const camadas = [];
    for (const c of loc.camadas) {
      let o;
      try { o = eval('(' + c.texto + ')'); }
      catch (e) {
        return json(res, 422, { ok: false, erro: 'recorte-nao-avalia',
          msg: 'a camada da linha ' + c.linha + ' de ' + slug + ' não avalia: ' + e.message,
          hash: hash(t) });
      }
      camadas.push(o);
    }
    return json(res, 200, { ok: true, hash: hash(t), camadas });
  }

  if (rota === '/_api/patch' && req.method === 'POST') {
    let d; try { d = await corpo(req); } catch (e) { return json(res, 400, { ok: false, msg: e.message }); }
    const p = preparar(d);
    if (p.cod !== 200) return json(res, p.cod, { ok: false, erro: p.erro, msg: p.msg });
    return json(res, 200, { ok: true, gravou: false, inalterado: !!p.r.inalterado,
      patch: patchDe(p.atual, p.r.texto, d.arq), detalhe: p.r.detalhe || [],
      linhasTocadas: p.r.linhasTocadas || 0 });
  }

  if (rota === '/_api/gravar' && req.method === 'POST') {
    let d; try { d = await corpo(req); } catch (e) { return json(res, 400, { ok: false, msg: e.message }); }
    const p = preparar(d);
    if (p.cod !== 200) return json(res, p.cod, { ok: false, erro: p.erro, msg: p.msg });

    /* O CONTROLE NEGATIVO VIROU COMPORTAMENTO, não só teste: sem alteração
       real, o arquivo NÃO é aberto para escrita. Um editor que grava mesmo
       sem edição corrompe por uso normal — e o mtime mentiria para quem
       estiver olhando o repositório. */
    if (p.r.inalterado) {
      return json(res, 200, { ok: true, gravou: false, inalterado: true, hash: p.hashAntes,
        msg: 'nada mudou — não abri o arquivo para escrita' });
    }
    const patch = patchDe(p.atual, p.r.texto, d.arq);
    try { fs.writeFileSync(p.alvo, p.r.texto, 'utf8'); }
    catch (e) { return json(res, 500, { ok: false, erro: 'io', msg: 'não consegui gravar: ' + e.message }); }

    /* releitura: o que está no disco é o que eu quis escrever? */
    const depois = fs.readFileSync(p.alvo, 'utf8');
    if (depois !== p.r.texto) {
      return json(res, 500, { ok: false, erro: 'releitura',
        msg: 'gravei mas a releitura não bate. Confira o arquivo à mão antes de continuar.' });
    }
    return json(res, 200, { ok: true, gravou: true, inalterado: false,
      hash: hash(depois), linhasTocadas: p.r.linhasTocadas,
      linhasMedidas: p.r.linhasMedidas, detalhe: p.r.detalhe, patch });
  }

  /* GERAR — roda o build DECLARADO pelo projeto (`projeto.build`). O
     núcleo não sabe o que "build" significa: ele só chama o comando que o
     projeto deu, com os slugs pedidos, e mostra o log. Sem `projeto.build`
     a rota nem existe (404 nomeado) — nunca um botão que aparece e nunca
     funciona. UM JOB POR VEZ: dois builds concorrentes escreveriam os
     mesmos PNGs. */
  if (rota === '/_api/gerar') {
    if (!CFG || !CFG.projeto || !CFG.projeto.build) {
      return json(res, 404, { ok: false, erro: 'sem-build',
        msg: 'este projeto não declarou `projeto.build` — não há o que gerar por aqui' });
    }
    if (req.method === 'GET') return json(res, 200, JOB || { rodando: false });
    if (req.method === 'POST') {
      let d; try { d = await corpo(req); } catch (e) { return json(res, 400, { ok: false, msg: e.message }); }
      if (JOB && JOB.rodando) {
        return json(res, 409, { ok: false, erro: 'build-em-andamento', msg: 'já tem um build rodando — espere ele terminar' });
      }
      const slugs = Array.isArray(d.slugs) ? d.slugs.filter(s => typeof s === 'string' && s) : [];
      if (!slugs.length) return json(res, 400, { ok: false, erro: 'sem-slugs', msg: 'mande {slugs:[...]} com ao menos 1 slug' });
      iniciarBuild(slugs);
      return json(res, 202, { ok: true, iniciado: true, slugs });
    }
    return json(res, 405, { ok: false, erro: 'metodo' });
  }

  if (rota.indexOf('/_api/') === 0) return json(res, 404, { ok: false, erro: 'rota-desconhecida' });

  /* ---------- estático, só leitura ---------- */
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { ok: false, erro: 'metodo', msg: 'estático só responde GET' });
  }
  let rel;
  try { rel = decodeURIComponent(rota).replace(/^\/+/, ''); }
  catch (e) { res.writeHead(400).end('caminho inválido'); return; }
  if (!rel) rel = 'editor/editar.html';

  /* ATÉ TRÊS RAÍZES, NESTA ORDEM, NENHUMA DEIXANDO ESCAPAR PARA CIMA
     (`..` é conferido depois de resolver, por raiz):

       1. `PECAS` (`raiz` do projeto, ou `pecas/` nativo sem `--config`)
          — a imensa maioria dos caminhos relativos de um projeto (o
          próprio `montar.js`, texturas, o arquivo de tema) vive AQUI.
       2. `raizEstatica` do projeto, SÓ quando `--config` declarou uma
          mais larga que `raiz` e SÓ SE o passo 1 não achou o arquivo —
          cobre a MINORIA que escapa de propósito (um censo de assets
          num diretório irmão). As URLs para cá já saem relativas a este
          raiz (calculadas em `projetoResp`, acima) — nunca um prefixo
          dedicado tipo `/_fora/`, que já foi tentado e produziu bug por
          ser uma segunda fonte de verdade sobre o mesmo raiz.
       3. `RAIZ` deste repositório (o EditorHtml em si).            */
  const candidatos = [];
  if (PECAS !== path.join(RAIZ, 'pecas')) candidatos.push(PECAS);
  if (RAIZ_ESTATICA_PROJETO && RAIZ_ESTATICA_PROJETO !== PECAS) candidatos.push(RAIZ_ESTATICA_PROJETO);
  candidatos.push(RAIZ);

  for (const base of candidatos) {
    const alvo = path.resolve(base, rel);
    if (alvo !== base && !alvo.startsWith(base + path.sep)) continue;   /* fora da raiz */
    let st;
    try { st = fs.statSync(alvo); } catch (e) { continue; }
    const f = st.isDirectory() ? path.join(alvo, 'index.html') : alvo;
    let buf;
    try { buf = fs.readFileSync(f); } catch (e) { continue; }
    res.writeHead(200, { 'Content-Type': TIPO[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(buf);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 ' + rel);
});

/* =====================================================================
   A PORTA SE ESCOLHE AQUI, E SÓ AQUI.

   Antes quem escolhia era o CLI: ele abria um socket de teste, via se
   ligava, fechava, e mandava o servidor subir naquela porta. Duas
   ligações diferentes decidindo a mesma coisa — e elas não ligavam do
   mesmo jeito. O teste ligava em `127.0.0.1`, a produção liga no curinga
   (`0.0.0.0`/`::`). No Windows dá pra segurar `127.0.0.1:P` enquanto
   outro processo já segura `0.0.0.0:P`; então o teste dizia "livre", o
   servidor tentava o curinga, tomava `EADDRINUSE` e morria.

   O estrago não foi o servidor morrer — foi o que veio depois: o CLI
   confirmava "está no ar" com um `GET /` naquela porta, o servidor
   ALHEIO respondia 200, e o usuário era mandado para a tela de outra
   pessoa. Medido num teste frio: o editor abriu servindo a pasta de
   outro projeto.

   A cura não é consertar o teste, é APAGAR o teste. `listen()` é a única
   frase em que "está livre" e "consegui ligar" são a mesma coisa. Quem
   liga, escolhe. Não há segundo binder para discordar do primeiro.
   ===================================================================== */
const TENTATIVAS = 20;
const SENTINELA = 'EDITORHTML_NO_AR';

/* A IDENTIDADE DESTE SERVIDOR, para quem o subiu poder provar que a porta
   que responde é a DELE. Vem do ambiente quando o CLI a injeta (é ele que
   precisa comparar); nasce aqui quando alguém roda o servidor na mão. */
const TOKEN = process.env.EDITORHTML_TOKEN ||
  crypto.randomBytes(9).toString('hex');

/* sobe tentando a porta pedida e andando para a próxima em EADDRINUSE.
   O `listen` é o MESMO que a produção usa — não existe variante de teste. */
function subir(porta, restantes, pronto, desistiu) {
  function erroAoLigar(err) {
    if (err && err.code === 'EADDRINUSE') {
      if (restantes <= 0) return desistiu(porta, err);
      return subir(porta + 1, restantes - 1, pronto, desistiu);
    }
    desistiu(porta, err);
  }
  servidor.once('error', erroAoLigar);
  servidor.listen(porta, function () {
    servidor.removeListener('error', erroAoLigar);
    /* depois de no ar, erro é erro de runtime e não de escolha de porta */
    servidor.on('error', e => { throw e; });
    pronto(servidor.address().port);
  });
}

if (require.main === module) {
  subir(PORTA, TENTATIVAS, porta => {
    /* O ANÚNCIO, EM FORMATO ESTÁVEL — o contrato com o CLI.
       Uma linha, um prefixo que não colide com prosa, e JSON depois dele.
       Quem lê faz `linha.startsWith(SENTINELA)` e `JSON.parse` do resto;
       não precisa casar número com expressão regular em texto humano, que
       é como um anúncio de porta envelhece sem ninguém perceber.

       O host é `127.0.0.1` de propósito, e não `localhost`: `localhost`
       pode resolver para IPv4 ou IPv6 conforme a máquina, e a rodada
       inteira em que este código nasceu foi sobre ambiguidade de bind.
       Um endereço literal não tem coin flip. */
    const url = 'http://127.0.0.1:' + porta + '/editor/editar.html';
    console.log(SENTINELA + ' ' + JSON.stringify({
      porta, token: TOKEN, url, pecas: PECAS, raiz: RAIZ, tema: NOME_TEMA, pid: process.pid
    }));
    /* e as linhas para gente, depois — a máquina lê a de cima */
    console.log('editor servindo ' + RAIZ);
    console.log('  peças: ' + PECAS);
    console.log('  tema:  ' + NOME_TEMA);
    if (porta !== PORTA) {
      console.log('  a porta ' + PORTA + ' estava ocupada — subi na ' + porta + '.');
    }
    console.log('  ' + url);
    console.log('  escrita liberada só nos .js do diretório de peças');
  }, (porta, err) => {
    /* DESISTIR TAMBÉM É ESTADO NOMEADO. Sem porta não há editor, e o que
       não pode acontecer é o processo sumir deixando quem chamou achando
       que subiu. */
    if (err && err.code === 'EADDRINUSE') {
      console.error('[editorhtml] nenhuma porta livre entre ' + PORTA + ' e ' +
        (PORTA + TENTATIVAS) + '. Libere uma, ou peça outra: ' +
        'node editor/servir.js <porta>');
    } else {
      console.error('[editorhtml] não consegui subir na porta ' + porta + ': ' +
        (err && err.message));
    }
    process.exit(1);
  });
}

module.exports = { servidor, inventario, arquivoDePecas, patchDe, preparar,
                   subir, SENTINELA, TOKEN, PORTA, PECAS, RAIZ };
