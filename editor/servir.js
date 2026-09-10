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
const E = require('./escrita.js');

const RAIZ = path.resolve(__dirname, '..');
const PORTA = +(process.argv[2] || process.env.EDITORHTML_PORTA || 8811);
const PECAS = path.resolve(process.argv[3] || process.env.EDITORHTML_PECAS || path.join(RAIZ, 'pecas'));
const NOME_TEMA = process.argv[4] || process.env.EDITORHTML_TEMA || 'exemplo';

const TIPO = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

const hash = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);

/* ------------------------------------------------------------------ */
/* O TEMA, DO LADO DO SERVIDOR. Ele é dado da ESCRITA também: os campos
   dele entram no escopo do que se pode gravar. Tema ausente ou quebrado
   NÃO derruba o servidor — o editor abre com os quatro tipos do núcleo, e
   o motivo fica dito no inventário em vez de virar página branca. */
function carregarTema() {
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

/* a CERCA de escrita, em uma função só: `cartao` → caminho; qualquer
   outra coisa → null, e quem chamou devolve 403 dizendo por quê. */
function arquivoDePecas(nome) {
  if (typeof nome !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(nome)) return null;
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
  /* slug repetido entre arquivos torna a escrita ambígua e a escrita
     recusa depois; melhor dizer agora, na lista, do que no primeiro
     arrasto. */
  const vistos = {};
  usos.forEach(u => {
    if (vistos[u.slug]) problemas.push('o slug `' + u.slug + '` aparece em ' +
      vistos[u.slug] + '.js e em ' + u.g + '.js — ambíguo, não vou gravar nele');
    else vistos[u.slug] = u.g;
  });

  return {
    ok: true,
    usos,
    problemas,
    dirPecas: PECAS,
    tema: tema ? { nome: tema.nome || NOME_TEMA, css: tema.css || null,
                   ganchos: ['tipos', 'campos', 'rotulo', 'painel', 'previa', 'quebra', 'estante']
                     .filter(k => tema[k] != null) } : null,
    erroTema,
    campos: Object.keys(E.escopoDe(tema)),
    nucleo: ['tt', 'tx', 'obj', 'reserva']
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

/* ------------------------------------------------------------------ */
function preparar(dados) {
  const alvo = arquivoDePecas(dados.arq);
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
    const alvo = arquivoDePecas(u.searchParams.get('arq'));
    if (!alvo) return json(res, 403, { ok: false, erro: 'arquivo-fora-da-cerca' });
    const t = fs.readFileSync(alvo, 'utf8');
    return json(res, 200, { ok: true, hash: hash(t), linhas: t.split('\n').length });
  }

  if (rota === '/_api/camadas') {
    const nome = u.searchParams.get('arq');
    const slug = u.searchParams.get('slug');
    const alvo = arquivoDePecas(nome);
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

  if (rota.indexOf('/_api/') === 0) return json(res, 404, { ok: false, erro: 'rota-desconhecida' });

  /* ---------- estático, só leitura ---------- */
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { ok: false, erro: 'metodo', msg: 'estático só responde GET' });
  }
  let rel;
  try { rel = decodeURIComponent(rota).replace(/^\/+/, ''); }
  catch (e) { res.writeHead(400).end('caminho inválido'); return; }
  if (!rel) rel = 'editor/editar.html';

  /* DUAS RAÍZES, NESTA ORDEM: o diretório das peças primeiro (para as
     imagens que a peça referencia funcionarem quando ela mora fora deste
     repositório), o repositório depois. Nenhuma das duas deixa escapar
     para cima: `..` é conferido depois de resolver. */
  const candidatos = [];
  if (PECAS !== path.join(RAIZ, 'pecas')) candidatos.push(PECAS);
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
