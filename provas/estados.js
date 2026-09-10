/* =====================================================================
   provas/estados.js — O ESTADO FEIO É PARTE DO PRODUTO.
       node provas/estados.js

   Esta suíte não prova que o caminho feliz funciona; `provas/escrita.js`
   já faz isso. Ela prova que os estados que ninguém gosta de projetar
   EXISTEM e DIZEM o que houve:

     · tipo que nem o núcleo nem o tema sabem pintar
     · imagem cujo arquivo não existe
     · camada de texto vazia
     · reserva, que não imprime nada por natureza
     · tema ausente, tema quebrado, tema sem gancho
     · caminho de escrita fora da cerca
     · arquivo que mudou no disco entre a leitura e a escrita
     · gravar sem ter mudado nada

   O CONTROLE POSITIVO VEM JUNTO EM CADA UM. "A caixa apareceu" só vale
   alguma coisa ao lado de "e a caixa do vizinho, que É conhecido, não
   ganhou o mesmo tratamento". Sem o par, um motor que marcasse TUDO como
   desconhecido passaria nesta suíte.

   O DOM AQUI É UM SIMULACRO MÍNIMO, e de propósito: a pergunta é o que o
   motor DECIDE (que nó, que classe, que atributo), não como o navegador
   pinta. O que depende de pintura é olhado com o olho, no navegador.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const RAIZ = path.resolve(__dirname, '..');
const E = require(path.join(RAIZ, 'editor', 'escrita.js'));
const TEMA = require(path.join(RAIZ, 'temas', 'exemplo', 'tema.js'));

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok   ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}

/* ------------------------------------------------------------------ */
/* O SIMULACRO DE DOM. Só o que o motor toca. Se ele passar a tocar mais
   coisa, isto quebra por exceção — e quebrar alto é o comportamento
   certo: um shim que engole chamada desconhecida testaria um motor que
   não existe. */
function fazerDoc() {
  function no(tag) {
    const n = {
      tagName: String(tag).toUpperCase(), className: '', style: {}, children: [], attrs: {},
      _texto: '', ownerDocument: null,
      appendChild(c) { this.children.push(c); return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k]; },
      classList: null
    };
    n.classList = {
      add: c => { n.className = (n.className ? n.className + ' ' : '') + c; },
      contains: c => n.className.split(/\s+/).indexOf(c) >= 0
    };
    Object.defineProperty(n, 'innerHTML', {
      get() { return n._texto; }, set(v) { n._texto = v; n.children.length = 0; }
    });
    Object.defineProperty(n, 'textContent', {
      get() { return n._texto; }, set(v) { n._texto = v; }
    });
    return n;
  }
  const doc = { createElement: tag => { const n = no(tag); n.ownerDocument = doc; return n; } };
  return doc;
}

const MONTAR = require(path.join(RAIZ, 'motor', 'montar.js'));

function montarNoVazio(p, tema) {
  const doc = fazerDoc();
  const alvo = doc.createElement('div');
  return MONTAR.montar(p, alvo, tema);
}
function classe(pc, i) { return pc.children[i].className; }

/* =====================================================================
   E1 · TIPO DESCONHECIDO NÃO SOME DA TELA
   ===================================================================== */
console.log('\nE1 · tipo que ninguém sabe pintar');
const pecaMista = { slug: 'mista', w: 100, h: 100, L: [
  { t: 'tt', s: 10, tx: 'conhecido pelo núcleo', box: [0, 0, 100, null], z: 1 },
  { t: 'fio', cor: 'barro', box: [0, 20, 100, 1], z: 2 },
  { t: 'kk', s: 10, tx: 'ninguém sabe pintar', box: [0, 30, 50, 10], z: 3 },
  { box: [0, 50, 10, 10], z: 4 }                      /* camada SEM `t` nenhum */
] };
const pcM = montarNoVazio(pecaMista, TEMA);
ok(pcM.children.length === 4,
  'E1a · as 4 camadas viraram 4 nós — nenhuma sumiu (achei ' + pcM.children.length + ')');
ok(/\bdesconhecido\b/.test(classe(pcM, 2)),
  'E1b · o `kk` virou caixa `desconhecido`', classe(pcM, 2));
ok(pcM.children[2].getAttribute('data-tipo-desconhecido') === 'kk',
  'E1c · e o nó DIZ qual tipo é — sem isso a caixa é um enigma',
  pcM.children[2].getAttribute('data-tipo-desconhecido'));
ok(pcM.children[2].textContent === 'kk',
  'E1c2 · o nome do tipo está escrito NA caixa, visível sem inspetor');
ok(pcM.children[3].getAttribute('data-tipo-desconhecido') === '(sem t)',
  'E1d · camada SEM `t` também aparece, e diz que não tem tipo',
  pcM.children[3].getAttribute('data-tipo-desconhecido'));
/* OS PARES POSITIVOS: quem É conhecido não recebe o mesmo tratamento.
   Sem estes, um motor que marcasse tudo como desconhecido passaria. */
ok(!/desconhecido/.test(classe(pcM, 0)) && /\btt\b/.test(classe(pcM, 0)),
  'E1e · discriminação: o `tt` (núcleo) NÃO virou desconhecido', classe(pcM, 0));
ok(!/desconhecido/.test(classe(pcM, 1)) && /\bfio\b/.test(classe(pcM, 1)),
  'E1f · discriminação: o `fio` (tema) NÃO virou desconhecido', classe(pcM, 1));
ok(pcM.__diag.desconhecidos.length === 2 && pcM.__diag.desconhecidos[0].t === 'kk',
  'E1g · o diagnóstico CONTA os desconhecidos (' + pcM.__diag.desconhecidos.length + ') — ' +
  'quem consome o motor sem tela consegue perguntar');

/* E1h · SEM TEMA NENHUM, o `fio` cai na mesma caixa nomeada — e o `tt`
   continua montando. É o teste de "tema null = editor funcional". */
const pcSemTema = montarNoVazio(pecaMista, null);
ok(pcSemTema.children.length === 4, 'E1h · sem tema, ainda são 4 nós');
ok(/desconhecido/.test(classe(pcSemTema, 1)),
  'E1i · sem tema, o `fio` vira desconhecido — a caixa aparece em vez de a camada sumir');
ok(!/desconhecido/.test(classe(pcSemTema, 0)),
  'E1j · discriminação: e o `tt` do núcleo monta igual, sem tema nenhum');

/* E1k · TEMA QUEBRADO não derruba o motor. Um tema que joga exceção ao
   montar um tipo é bug do tema — e a resposta certa é a caixa nomeada,
   não a página branca. */
const temaBomba = { nome: 'bomba', tipos: { fio: function () { throw new Error('estourei'); } } };
let caiu = false, pcB = null;
try { pcB = montarNoVazio(pecaMista, temaBomba); } catch (e) { caiu = true; }
ok(!caiu, 'E1k · tema que joga exceção NÃO derruba a montagem');
ok(pcB && pcB.children.length === 4, 'E1k2 · e as 4 camadas continuam lá');
ok(pcB && classe(pcB, 1).indexOf('quebrou') >= 0,
  'E1k3 · a camada do tema que estourou vira caixa marcada como QUEBRADA — ' +
  '"o tema não declarou" e "o tema quebrou" são dois fatos diferentes',
  pcB && classe(pcB, 1));
ok(pcB && pcB.children[1].getAttribute('data-erro-do-tema') === 'estourei',
  'E1k4 · e a mensagem do erro fica no nó, para o painel poder dizê-la');
ok(pcB && !/desconhecido/.test(classe(pcB, 0)),
  'E1k5 · discriminação: o `tt`, que não passa pelo tema, monta normalmente — ' +
  'o estrago ficou na camada de quem estourou');

/* =====================================================================
   E2 · IMAGEM AUSENTE, TEXTO VAZIO, RESERVA
   ===================================================================== */
console.log('\nE2 · os outros estados feios');
const pecaFeia = { slug: 'feia', w: 100, h: 100, L: [
  { t: 'obj', box: [0, 0, 10, 10], z: 1 },                       /* sem `src` */
  { t: 'obj', src: './existe.svg', box: [0, 10, 10, 10], z: 2 },
  { t: 'reserva', k: 'retrato', box: [0, 20, 10, 10], z: 3 },
  { t: 'tx', s: 10, tx: '', box: [0, 30, 10, null], z: 4 }
] };
const pcF = montarNoVazio(pecaFeia, TEMA);
ok(/\bfaltando\b/.test(classe(pcF, 0)),
  'E2a · `obj` sem `src` é marcado como faltando', classe(pcF, 0));
ok(pcF.children[0].getAttribute('data-faltando') === 'sem src declarado',
  'E2a2 · e o motivo é DITO no nó, não deduzido');
ok(!/faltando/.test(classe(pcF, 1)),
  'E2b · discriminação: `obj` COM `src` não é marcado (o carregamento decide depois)',
  classe(pcF, 1));
ok(pcF.__diag.avisos.length === 1 && /não declara `src`/.test(pcF.__diag.avisos[0]),
  'E2c · o aviso entra no diagnóstico com o índice da camada', JSON.stringify(pcF.__diag.avisos));
ok(/\breserva\b/.test(classe(pcF, 2)) && pcF.children[2].getAttribute('data-k') === 'retrato',
  'E2d · a reserva monta como nó próprio e carrega o `k` — é por ele que se acha o vão');
ok(pcF.children[3].innerHTML === '',
  'E2e · texto vazio monta vazio (não inventa conteúdo) — quem grita é o editor, na lista');

/* E2f · declaração sem nativo é EXCEÇÃO NOMEADA, não NaN silencioso pela
   peça toda. Número inválido que se propaga é o defeito que só aparece no
   export, semanas depois. */
let erroNativo = null;
try { montarNoVazio({ slug: 'x', L: [] }, TEMA); } catch (e) { erroNativo = e.message; }
ok(erroNativo && /w`\/`h/.test(erroNativo),
  'E2f · peça sem `w`/`h` para com erro que NOMEIA o que falta', erroNativo);

/* =====================================================================
   E3 · O ESCOPO DE ESCRITA MUDA COM O TEMA — nos dois sentidos
   ===================================================================== */
console.log('\nE3 · o tema abre campo, e a ausência dele fecha');
const semTema = Object.keys(E.escopoDe(null));
const comTema = Object.keys(E.escopoDe(TEMA));
ok(semTema.indexOf('cor') < 0, 'E3a · sem tema, `cor` não está no escopo');
ok(comTema.indexOf('cor') >= 0, 'E3b · com o tema exemplo, `cor` está');
ok(semTema.every(k => comTema.indexOf(k) >= 0),
  'E3c · o tema ACRESCENTA, nunca tira campo do núcleo — ' +
  'um tema não pode desligar a geometria');
/* E3d · e o tema PODE sobrescrever a semântica de um campo do núcleo, o
   que é diferente de tirar: quem conhece o significado do campo na peça
   dele é ele. */
const temaSobrepoe = { campos: { s: { chave: 's', anc: [], lit: v => 'MARCA' + v } } };
ok(E.escopoDe(temaSobrepoe).s.lit(4) === 'MARCA4',
  'E3d · e quando o tema declara um campo de mesmo nome, é o dele que vale');

/* =====================================================================
   E4 · AS CERCAS DO SERVIDOR — pelo HTTP, não pela leitura do código
   ===================================================================== */
console.log('\nE4 · as cercas do servidor, batidas pelo HTTP');
const S = require(path.join(RAIZ, 'editor', 'servir.js'));
const ARQ = path.join(RAIZ, 'pecas', 'cartao.js');
const ANTES = fs.readFileSync(ARQ, 'utf8');
const MTIME = fs.statSync(ARQ).mtimeMs;

function pedir(metodo, rota, corpo) {
  return new Promise((pronto, erro) => {
    const dados = corpo == null ? null : Buffer.from(JSON.stringify(corpo), 'utf8');
    const req = http.request({ host: '127.0.0.1', port: S.servidor.address().port,
      method: metodo, path: rota,
      headers: dados ? { 'Content-Type': 'application/json', 'Content-Length': dados.length } : {} },
      res => {
        let b = '';
        res.on('data', d => { b += d; });
        res.on('end', () => { let j; try { j = JSON.parse(b); } catch (e) { j = { _cru: b }; }
                              pronto({ cod: res.statusCode, j }); });
      });
    req.on('error', erro);
    if (dados) req.write(dados);
    req.end();
  });
}

S.servidor.listen(0, '127.0.0.1', async () => {
  try {
    const inv = await pedir('GET', '/_api/inventario');
    ok(inv.cod === 200 && inv.j.ok && inv.j.usos.length >= 4,
      'E4a · o inventário lista as peças do disco (' + (inv.j.usos || []).length + ')');
    ok(Array.isArray(inv.j.problemas) && inv.j.problemas.length === 0,
      'E4a2 · e não reclama de nada com o corpus atual',
      JSON.stringify(inv.j.problemas));
    ok(inv.j.tema && inv.j.tema.nome === 'exemplo' && inv.j.tema.ganchos.length === 7,
      'E4a3 · e diz qual tema carregou e QUANTOS dos sete ganchos ele declara (' +
      ((inv.j.tema && inv.j.tema.ganchos) || []).length + '/7)');

    /* travessia de caminho */
    const fora = await pedir('POST', '/_api/gravar',
      { arq: '../editor/escrita', edicoes: [{ slug: 'x', i: 0, campo: 'box', valor: [0, 0, 1, 1] }] });
    ok(fora.cod === 403 && fora.j.erro === 'arquivo-fora-da-cerca',
      'E4b · `../` no nome do arquivo é 403 com o motivo dito', JSON.stringify(fora.j));
    const dentro = await pedir('GET', '/_api/ler?arq=cartao');
    ok(dentro.cod === 200 && dentro.j.hash,
      'E4b2 · discriminação: o nome legítimo passa — a cerca recusa `../`, não tudo');

    /* hash velho */
    const velho = await pedir('POST', '/_api/gravar',
      { arq: 'cartao', hashEsperado: '0000000000000000',
        edicoes: [{ slug: 'cartao-capa', i: 3, campo: 's', valor: 999 }] });
    ok(velho.cod === 409 && velho.j.erro === 'arquivo-mudou',
      'E4c · hash que não bate é 409 — não gravo por cima de terceiro');

    /* gravar sem mudança NÃO ABRE O ARQUIVO. É comportamento, não só
       teste: editor que grava mesmo sem edição corrompe por uso normal, e
       o mtime mente para quem estiver olhando o repositório. */
    const capaAtual = require(ARQ).pecas.find(p => p.slug === 'cartao-capa');
    const igual = await pedir('POST', '/_api/gravar',
      { arq: 'cartao', hashEsperado: dentro.j.hash,
        edicoes: [{ slug: 'cartao-capa', i: 3, campo: 'box', valor: capaAtual.L[3].box }] });
    ok(igual.cod === 200 && igual.j.ok && igual.j.gravou === false && igual.j.inalterado === true,
      'E4d · pedir o valor que já está lá responde `gravou:false`', JSON.stringify(igual.j));
    ok(fs.statSync(ARQ).mtimeMs === MTIME,
      'E4d2 · e o mtime do arquivo NÃO mudou — ele nem foi aberto para escrita');

    /* declaração computada, pelo HTTP */
    const comp = await pedir('POST', '/_api/gravar',
      { arq: 'folheto', edicoes: [{ slug: 'folheto-indice', i: 1, campo: 's', valor: 28 }],
        contagens: { 'folheto-indice': 16 } });
    ok(comp.cod === 422 && comp.j.erro === 'declaracao-computada',
      'E4e · peça computada é 422 com o motivo dito', JSON.stringify(comp.j).slice(0, 140));

    /* patch NUNCA grava */
    const patch = await pedir('POST', '/_api/patch',
      { arq: 'cartao', edicoes: [{ slug: 'cartao-capa', i: 3, campo: 's', valor: 123 }] });
    ok(patch.cod === 200 && patch.j.ok && patch.j.gravou === false && /\+.*s:123/.test(patch.j.patch),
      'E4f · `/patch` devolve o diff e diz `gravou:false`');
    ok(fs.readFileSync(ARQ, 'utf8') === ANTES,
      'E4f2 · e o arquivo no disco está BYTE-IDÊNTICO ao do começo desta suíte');

    /* rota que não existe é 404 nomeado, não HTML de estático */
    const nada = await pedir('GET', '/_api/nao-existe');
    ok(nada.cod === 404 && nada.j.erro === 'rota-desconhecida',
      'E4g · rota `/_api/` inexistente é 404 JSON, não uma página');
  } catch (e) {
    ok(false, 'E4 · a suíte de servidor estourou: ' + e.message, e.stack);
  }
  S.servidor.close();

  /* CONFERÊNCIA FINAL DE DISCO. Esta suíte declara que não escreve em
     `pecas/`; declarar não é conferir. */
  ok(fs.readFileSync(ARQ, 'utf8') === ANTES && fs.statSync(ARQ).mtimeMs === MTIME,
    'EZ · esta suíte não tocou `pecas/cartao.js` — conteúdo E mtime intactos');

  console.log('\n' + (falhas ? 'REPROVOU' : 'PASSOU') + ' — ' + (checks - falhas) + '/' + checks + ' controles');
  process.exit(falhas ? 1 : 0);
});
