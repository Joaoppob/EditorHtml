/* =====================================================================
   provas/escrita.js — o instrumento que ABORTA SOZINHO.
       node provas/escrita.js

   POR QUE O CONTROLE POSITIVO VEM PRIMEIRO. Um localizador que RECUSA
   tudo passa em qualquer auditoria de leitura e parece rigor. O controle
   que pega esse bug é o positivo: TODA camada de TODA peça tem de ser
   localizada, e o recorte de texto de cada uma, quando avaliado, tem de
   ser igual ao objeto que o próprio motor recebe. Só depois disso os
   controles negativos significam alguma coisa.

   E TODO NEGATIVO TEM PAR. Não basta mostrar que a cerca recusa: tem de
   mostrar que ela recusa AQUILO e deixa passar o vizinho. Recusa global
   pareceria rigor e seria cegueira — por isso cada `C4x` de recusa vem com
   um `C4x2` de discriminação, e a seção `C6` desliga cada cerca em memória
   para provar que é ELA que pega o caso, não o acaso.

   Este arquivo NÃO escreve em `pecas/`. Toda prova roda contra uma cópia
   em memória.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../editor/escrita.js');

const RAIZ = path.resolve(__dirname, '..');
const DIR = path.join(RAIZ, 'pecas');
const TEMA = require(path.join(RAIZ, 'temas', 'exemplo', 'tema.js'));

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok   ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}
function abortar(msg) {
  console.log('\n  ABORTADO: ' + msg);
  console.log('  O instrumento não roda contra um alvo que ele não achou. ' +
              'Reprovar aqui seria acusar o produto por um defeito do fixture.');
  process.exit(2);
}

/* carregar as declarações e o texto-fonte de cada arquivo */
const ARQS = fs.readdirSync(DIR).filter(f => /\.js$/.test(f)).map(f => f.replace(/\.js$/, '')).sort();
if (!ARQS.length) abortar('não achei nenhum arquivo em pecas/');

const SRC = {}, USOS = [], FONTE = {};
for (const g of ARQS) {
  SRC[g] = fs.readFileSync(path.join(DIR, g + '.js'), 'utf8');
  const mod = require(path.join(DIR, g + '.js'));
  (mod.pecas || []).forEach(p => { USOS.push(Object.assign({ g }, p)); FONTE[p.slug] = g; });
}
if (!USOS.length) abortar('nenhuma peça exportada por pecas/*.js');

function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* =====================================================================
   C1 · CONTROLE POSITIVO — toda camada se localiza e bate
   ===================================================================== */
console.log('\nC1 · positivo: localizar e conferir TODA camada de TODA peça');
/* JUNTAR TUDO NUM "FALHA" SÓ ESCONDE A DIFERENÇA QUE IMPORTA: recusa
   CORRETA (a declaração realmente não é endereçável) não é a mesma coisa
   que localizador ERRADO. */
let totCam = 0, ruins = [], recusados = [], multi = 0;
for (const u of USOS) {
  const g = FONTE[u.slug];
  const L = u.L || [];
  const loc = E.localizarCamadas(SRC[g], u.slug);
  if (!loc.ok) { recusados.push({ slug: u.slug, erro: loc.erro }); continue; }
  if (loc.camadas.length !== L.length) {
    /* só é recusa legítima se a peça declarar `.concat(` — senão é bug meu */
    const r = E.aplicar(SRC[g], [{ slug: u.slug, i: 0, campo: 'box', valor: [0, 0, 1, 1] }],
      { [u.slug]: L.length }, TEMA);
    if (r.erro === 'declaracao-computada') { recusados.push({ slug: u.slug, erro: r.erro }); continue; }
    ruins.push(u.slug + ': localizei ' + loc.camadas.length + ' camadas, a peça monta ' +
      L.length + ' — e a cerca NÃO pegou');
    continue;
  }
  for (let i = 0; i < L.length; i++) {
    totCam++;
    if (loc.camadas[i].multilinha) multi++;
    let obj;
    try { obj = eval('(' + loc.camadas[i].texto + ')'); }
    catch (e) { ruins.push(u.slug + '#' + i + ': recorte não avalia — ' + e.message); continue; }
    if (!igual(obj, L[i])) {
      ruins.push(u.slug + '#' + i + ': recorte != declaração\n          recorte: ' +
        JSON.stringify(obj).slice(0, 160) + '\n          decl:    ' + JSON.stringify(L[i]).slice(0, 160));
    }
  }
}
ok(ruins.length === 0, 'C1 · ' + totCam + ' camadas de ' + (USOS.length - recusados.length) +
  ' peças localizadas e IDÊNTICAS à declaração que o motor recebe',
  ruins.slice(0, 6).join('\n        '));
ok(totCam >= 10, 'C1b · o positivo exercitou massa de verdade (' + totCam + ' camadas, ' +
  multi + ' delas multi-linha)');
ok(multi >= 1, 'C1b2 · e pelo menos uma camada do corpus é MULTI-LINHA — ' +
  'sem ela o C4g abaixo não testaria nada (achei ' + multi + ')');
/* C1c · as recusas têm de ser VERDADEIRAS — conferidas contra a fonte, não
   aceitas de palavra. Recusar tudo pareceria rigor e seria cegueira. */
let recusaFalsa = [];
for (const r of recusados) {
  const g = FONTE[r.slug];
  const bloco = SRC[g].slice(SRC[g].indexOf("slug:'" + r.slug + "'"));
  const trecho = bloco.slice(0, 4000);
  if (r.erro === 'declaracao-computada' && trecho.indexOf('.concat(') < 0)
    recusaFalsa.push(r.slug + ': recusei por `computada` mas não há `.concat(` na fonte');
  if (r.erro === 'camada-com-comentario' && trecho.indexOf('/*') < 0)
    recusaFalsa.push(r.slug + ': recusei por comentário interno e não achei');
}
ok(recusaFalsa.length === 0, 'C1c · as ' + recusados.length + ' recusas são VERDADEIRAS ' +
  '(' + (recusados.map(r => r.slug + ':' + r.erro).join(', ') || 'nenhuma') + ')',
  recusaFalsa.join('\n        '));

/* =====================================================================
   C2 · O QUE A ESCRITA FAZ — uma linha, e só ela
   ===================================================================== */
console.log('\nC2 · uma edição toca UMA linha, o resto sai byte-idêntico');
const src = SRC['cartao'];
if (!src) abortar('não achei pecas/cartao.js — o fixture desta suíte');

/* o índice do `obj` da capa, achado pelo LOCALIZADOR e não por um literal
   escrito à mão: literal com valor de peça envelhece junto com a peça, e
   quando ele para de casar o controle acusa o produto por um defeito do
   fixture. */
const capa = USOS.find(u => u.slug === 'cartao-capa');
if (!capa) abortar('não achei a peça `cartao-capa`');
const iTT = capa.L.findIndex(c => c.t === 'tt');
if (iTT < 0) abortar('a `cartao-capa` não tem camada `tt` para exercitar');

const r1 = E.aplicar(src, [{ slug:'cartao-capa', i: iTT, campo: 'box', valor: [9, 64, 30, 32] }], null, TEMA);
ok(r1.ok && !r1.inalterado, 'C2a · a edição foi aplicada', r1.msg);
if (r1.ok) {
  const A = src.split('\n'), B = r1.texto.split('\n');
  ok(A.length === B.length, 'C2b · o arquivo continua com ' + A.length + ' linhas');
  const dif = [];
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) dif.push(i + 1);
  ok(dif.length === 1, 'C2c · exatamente 1 linha diferente (achei ' + dif.length + ': ' + dif.join(',') + ')');
  ok(r1.linhasTocadas === 1, 'C2d · o relatório declara 1 linha tocada');
  /* O COMENTÁRIO DE DOUTRINA SAIU INTEIRO. É o controle central deste
     arquivo — a razão de a escrita não reserializar objeto. */
  const comentarios = s => (s.match(/\/\*[\s\S]*?\*\//g) || []).join('|__|');
  ok(comentarios(src) === comentarios(r1.texto),
    'C2e · TODOS os blocos de comentário saíram byte-idênticos');
  ok(/box:\[9,64,30,32\]/.test(B[dif[0] - 1]), 'C2f · a linha nova carrega o box pedido',
    B[dif[0] - 1]);
  ok(/s: *96/.test(B[dif[0] - 1]) && /z: *5/.test(B[dif[0] - 1]),
    'C2g · o resto da camada (s, lh, tx, z) ficou de pé', B[dif[0] - 1]);
}

/* =====================================================================
   C3 · TEXTO E CORPO — inclusive inserção de chave ausente
   ===================================================================== */
console.log('\nC3 · corpo, entrelinha e texto');
const AP = String.fromCharCode(39), BS = String.fromCharCode(92);
/* uma camada de texto que NÃO declara `lh` — a inserção de chave ausente
   só se prova numa dessas */
/* qualquer camada com texto e SEM `lh` serve: a inserção de chave ausente
   não é privilégio de tipo do núcleo — vale para tipo de tema também. */
const iSemLh = capa.L.findIndex(c => c.tx != null && c.lh == null);
const iComTx = iSemLh >= 0 ? iSemLh : capa.L.findIndex(c => c.tx != null);
if (iComTx < 0) abortar('a `cartao-capa` não tem camada com `tx`');

if (iSemLh >= 0) {
  const r2 = E.aplicar(src, [
    { slug:'cartao-capa', i: iSemLh, campo: 's', valor: 40 },
    { slug:'cartao-capa', i: iSemLh, campo: 'lh', valor: 1.25 }   /* `lh` NÃO existe nessa camada */
  ], null, TEMA);
  ok(r2.ok && r2.linhasTocadas === 1, 'C3a · corpo + entrelinha na mesma camada = 1 linha',
    r2.msg || r2.erro);
  if (r2.ok) {
    const l = r2.texto.split('\n')[r2.detalhe[0].linha - 1];
    ok(/s:40/.test(l) && /lh:1\.25/.test(l), 'C3b · `lh` foi INSERIDO junto de `s`', l.trim());
    let re; try { re = eval('(' + l.trim().replace(/,$/, '') + ')'); } catch (e) { re = null; }
    ok(re && re.s === 40 && re.lh === 1.25 && re.tx === capa.L[iSemLh].tx,
      'C3c · a linha nova ainda avalia e preserva o resto', JSON.stringify(re));
  }
} else {
  ok(false, 'C3a · não achei camada de texto SEM `lh` para provar a inserção de chave ausente');
}

/* texto com aspa simples e barra — o que quebra escrita ingênua */
const sujo = 'a ' + AP + 'aspa' + AP + ' e uma ' + BS + ' barra';
const r3 = E.aplicar(src, [{ slug:'cartao-capa', i: iComTx, campo: 'tx', valor: sujo }], null, TEMA);
ok(r3.ok, 'C3d · texto com aspa e barra foi aceito', r3.msg);
if (r3.ok) {
  const l = r3.texto.split('\n')[r3.detalhe[0].linha - 1].trim().replace(/,$/, '');
  let re2; try { re2 = eval('(' + l + ')'); } catch (e) { re2 = null; }
  ok(re2 && re2.tx === sujo, 'C3e · a aspa e a barra voltam IDÊNTICAS ao que entrou',
    re2 ? JSON.stringify(re2.tx) : 'não avaliou: ' + l);
}

/* =====================================================================
   C4 · CONTROLES NEGATIVOS — o que TEM de ser recusado
   ===================================================================== */
console.log('\nC4 · negativos: o que a escrita tem de RECUSAR');
ok(E.aplicar(src, []).erro === 'sem-edicao', 'C4a · lista de edição vazia é recusada');
ok(E.aplicar(src, [{ slug:'nao-existe-xyz', i: 0, campo: 'box', valor: [0, 0, 1, 1] }]).erro === 'slug-ausente',
  'C4b · slug inexistente é recusado');
ok(E.aplicar(src, [{ slug:'cartao-capa', i: 99, campo: 'box', valor: [0, 0, 1, 1] }]).erro === 'camada-ausente',
  'C4c · índice de camada fora da faixa é recusado');
ok(E.aplicar(src, [{ slug:'cartao-capa', i: 0, campo: 'z', valor: 9 }]).erro === 'campo-fora-do-escopo',
  'C4d · campo fora do escopo (`z`, a pilha) é recusado por NOME, não ignorado em silêncio');

/* C4d2/C4d3 · A CERCA SE MOVE COM O TEMA, E ISSO SE PROVA NOS DOIS
   SENTIDOS. `cor` não é campo do núcleo; ela existe porque o tema exemplo
   a declara. Sem o tema, o mesmo pedido tem de ser RECUSADO — senão o
   parâmetro seria decorativo e o escopo seria, na prática, "tudo". */
ok(E.aplicar(src, [{ slug:'cartao-capa', i: 1, campo: 'cor', valor: 'anil' }], null, TEMA).ok === true,
  'C4d2 · COM o tema, `cor` (campo do tema) é aceita');
ok(E.aplicar(src, [{ slug:'cartao-capa', i: 1, campo: 'cor', valor: 'anil' }]).erro === 'campo-fora-do-escopo',
  'C4d3 · discriminação: SEM o tema, a MESMA `cor` é recusada — logo é o tema que abre o campo');

/* C4e · o CONTROLE NEGATIVO QUE MAIS IMPORTA: gravar sem ter mudado nada */
const atual = capa.L[iTT].box;
const r4 = E.aplicar(src, [{ slug:'cartao-capa', i: iTT, campo: 'box', valor: atual }], null, TEMA);
ok(r4.ok && r4.inalterado === true && r4.texto === src,
  'C4e · pedir o valor que já está lá devolve o arquivo BYTE-IDÊNTICO e diz `inalterado`');

/* C4f/C4g · camada MULTI-LINHA não é recusada — é gravada, e o diff sai
   com o número de linhas que o RECORTE previa. Um `1` fixo aqui teria
   reprovado uma escrita correta. */
const verso = USOS.find(u => u.slug === 'cartao-verso');
const locV = E.localizarCamadas(src, 'cartao-verso');
if (!locV.ok) abortar('não localizei `cartao-verso`: ' + locV.msg);
const iMulti = locV.camadas.findIndex(c => c.multilinha);
if (iMulti < 0) abortar('nenhuma camada de `cartao-verso` é multi-linha — o fixture perdeu o caso');

const rMulti = E.aplicar(src, [{ slug:'cartao-verso', i: iMulti, campo: 's', valor: 33 }], null, TEMA);
/* O PREVISTO É UM ENVELOPE, NÃO UMA IGUALDADE. O recorte cobre 3 linhas; a
   troca de `s:` mexe em 1. Exigir igualdade reprovaria uma escrita certa.
   A régua verdadeira: o medido é SUBCONJUNTO do previsto, e nunca vazio. */
ok(rMulti.ok && rMulti.linhasTocadas >= 1 &&
   rMulti.linhasMedidas.every(l => rMulti.linhasPrevistas.indexOf(l) >= 0),
  'C4f · camada multi-linha grava e o medido cabe dentro do previsto (' +
  (rMulti.ok ? 'medidas [' + rMulti.linhasMedidas + '] ⊂ previstas [' + rMulti.linhasPrevistas + ']'
             : rMulti.erro) + ')');
ok(rMulti.ok && rMulti.detalhe[0].multilinha === true,
  'C4f2 · e o relatório DIZ que é multi-linha — o diff maior é fato declarado, não surpresa');
/* e o par: trocar o `box`, que mora noutra linha do recorte, mexe em OUTRA
   linha — prova que o envelope não é decorativo */
const rMulti2 = E.aplicar(src, [{ slug:'cartao-verso', i: iMulti, campo: 'box', valor: [4, 32, 70, null] }], null, TEMA);
ok(rMulti2.ok && rMulti2.linhasMedidas.length === 1 && rMulti.ok &&
   rMulti2.linhasMedidas[0] !== rMulti.linhasMedidas[0],
  'C4g · `s` e `box` da MESMA camada caem em linhas diferentes (' +
  (rMulti.ok && rMulti2.ok ? rMulti.linhasMedidas[0] + ' vs ' + rMulti2.linhasMedidas[0] : '?') + ')');
if (rMulti.ok) {
  const cm = s => (s.match(/\/\*[\s\S]*?\*\//g) || []).join(' ');
  ok(cm(src) === cm(rMulti.texto), 'C4g2 · comentários intactos também no caso multi-linha');
}

/* C4h · camada com COMENTÁRIO dentro do objeto: essa sim é recusada.
   A FORJA SE FAZ PELO LOCALIZADOR, não por um literal com a caixa escrita
   à mão — literal com valor de peça envelhece junto com a peça, e quando
   ele para de casar `forjado` fica igual a `src` e o controle reprova
   acusando o produto por um defeito do fixture. */
const locC = E.localizarCamadas(src, 'cartao-capa');
const alvoF = locC.ok ? locC.camadas.filter(c => c.texto.indexOf("k: 'retrato'") >= 0)[0] : null;
if (!alvoF) abortar("não achei a camada `reserva k:'retrato'` para forjar");
const forjado = src.replace(alvoF.texto,
  alvoF.texto.replace("k: 'retrato',", "k: 'retrato', /* o vao do retrato */"));
ok(forjado !== src, 'C4h-pre · a fonte forjada ganhou comentário dentro da camada');
const r5 = E.aplicar(forjado, [{ slug:'cartao-capa', i: 0, campo: 'box', valor: [30, 40, 44, 54] }], null, TEMA);
ok(r5.ok === false && r5.erro === 'camada-com-comentario',
  'C4h · camada com comentário interno é RECUSADA', JSON.stringify(r5).slice(0, 200));

/* C4i · e a peça VIZINHA continua endereçável — a recusa não é global */
const r7 = E.aplicar(forjado, [{ slug:'cartao-verso', i: 0, campo: 's', valor: 61 }], null, TEMA);
ok(r7.ok === true && r7.linhasTocadas === 1,
  'C4i · discriminação: a peça vizinha, intacta, continua gravável', r7.msg || r7.erro);

/* C4j · DECLARAÇÃO COMPUTADA — a cerca que estava muda */
const srcF = SRC['folheto'];
if (!srcF) abortar('não achei pecas/folheto.js — o fixture da declaração computada');
const indice = USOS.find(u => u.slug === 'folheto-indice');
if (!indice) abortar('não achei a peça `folheto-indice`');
const nIndice = indice.L.length;
const rComp = E.aplicar(srcF, [{ slug:'folheto-indice', i: 1, campo: 's', valor: 28 }],
  { 'folheto-indice': nIndice }, TEMA);
ok(rComp.ok === false && rComp.erro === 'declaracao-computada',
  'C4j · peça com `L:[…].concat(…)` é recusada por NOME (monta ' + nIndice + ', tem 4 em texto)',
  JSON.stringify(rComp).slice(0, 180));
/* e o par: SEM a contagem, o mesmo pedido passaria — é a contagem que pega */
const rCompCego = E.aplicar(srcF, [{ slug:'folheto-indice', i: 1, campo: 's', valor: 28 }], null, TEMA);
ok(rCompCego.ok === true,
  'C4j2 · discriminação: sem a contagem esperada o pedido PASSA — logo é a contagem que recusa');
/* e a peça vizinha, no MESMO arquivo, continua gravável com contagem */
const folha = USOS.find(u => u.slug === 'folheto-folha');
const rViz = E.aplicar(srcF, [{ slug:'folheto-folha', i: 1, campo: 's', valor: 110 }],
  { 'folheto-folha': folha.L.length, 'folheto-indice': nIndice }, TEMA);
ok(rViz.ok === true && rViz.linhasTocadas === 1,
  'C4j3 · discriminação: a peça NÃO computada do mesmo arquivo grava normalmente',
  rViz.msg || rViz.erro);

/* =====================================================================
   C5 · IDA E VOLTA — a edição desfeita devolve o arquivo original
   ===================================================================== */
console.log('\nC5 · ida e volta pelo caminho normal');
const ida = E.aplicar(src, [{ slug:'cartao-capa', i: iTT, campo: 'box', valor: [9, 64, 30, 32] }], null, TEMA);
const volta = E.aplicar(ida.texto, [{ slug:'cartao-capa', i: iTT, campo: 'box', valor: atual }], null, TEMA);
ok(volta.ok && volta.texto === src,
  'C5 · editar e editar de volta devolve o arquivo BYTE-IDÊNTICO ao original');

/* =====================================================================
   C6 · OPERAÇÕES ESTRUTURAIS — inserir e remover camada inteira
   ===================================================================== */
console.log('\nC6 · estrutural: a linha nova entra sozinha e sai sozinha');
const nova = { t: 'fio', cor: 'mel', box: [10, 30, 50, 0.3], z: 9 };

/* inserir NO FIM e remover de volta tem de dar byte-idêntico. Este é o
   controle que pegou a vírgula órfã: apagar só a linha da ÚLTIMA camada
   deixava `{...},` pendurado antes do `]`, e o arquivo continuava válido —
   a leitura do código não pegava, a ida-e-volta pegou. */
const nCapa = capa.L.length;
const insFim = E.aplicar(src, [{ tipo: 'inserir', slug:'cartao-capa', indice: nCapa, camada: nova }],
  { 'cartao-capa': nCapa }, TEMA);
ok(insFim.ok && insFim.estrutural === 'inserir', 'C6a · inserção no fim aceita',
  insFim.msg || insFim.erro);
if (insFim.ok) {
  ok(insFim.texto.split('\n').length === src.split('\n').length + 1,
    'C6a2 · o arquivo ganhou exatamente 1 linha');
  const remFim = E.aplicar(insFim.texto, [{ tipo: 'remover', slug:'cartao-capa', indice: nCapa }],
    { 'cartao-capa': nCapa + 1 }, TEMA);
  ok(remFim.ok && remFim.texto === src,
    'C6a3 · inserir no fim e remover devolve o arquivo BYTE-IDÊNTICO (a vírgula órfã não sobra)',
    remFim.ok ? 'divergiu' : remFim.msg);
}

/* inserir NO MEIO e remover de volta */
const insMeio = E.aplicar(src, [{ tipo: 'inserir', slug:'cartao-capa', indice: 2, camada: nova }],
  { 'cartao-capa': nCapa }, TEMA);
ok(insMeio.ok, 'C6b · inserção no meio aceita', insMeio.msg || insMeio.erro);
if (insMeio.ok) {
  const remMeio = E.aplicar(insMeio.texto, [{ tipo: 'remover', slug:'cartao-capa', indice: 2 }],
    { 'cartao-capa': nCapa + 1 }, TEMA);
  ok(remMeio.ok && remMeio.texto === src,
    'C6b2 · inserir no meio e remover devolve o arquivo BYTE-IDÊNTICO');
  const cm = s => (s.match(/\/\*[\s\S]*?\*\//g) || []).join('|');
  ok(cm(src) === cm(insMeio.texto), 'C6b3 · os comentários não foram tocados pela inserção');
}

/* a ORDEM das chaves da linha nova é dado de TEMA */
const linhaNova = E.comoLinha(nova, TEMA.ordem);
ok(linhaNova.indexOf("{t:'fio', cor:'mel'") === 0,
  'C6c · a linha nova sai na ordem que o TEMA declarou (`t` antes de `cor`)', linhaNova);
/* e o PAR: sem a ordem do tema, `cor` cai no fim (o núcleo não a conhece) —
   logo é a `ordem` do tema que decide, e não o acaso da chave. */
ok(E.comoLinha(nova).indexOf("{t:'fio', box:") === 0,
  'C6c2 · discriminação: sem a ordem do tema, `cor` sai depois do que o núcleo conhece',
  E.comoLinha(nova));

/* mistura é recusada: inserir no meio desloca índice, e misturar com
   edição de campo escreveria na camada errada */
ok(E.aplicar(src, [
  { tipo: 'inserir', slug:'cartao-capa', indice: 0, camada: nova },
  { slug:'cartao-capa', i: 1, campo: 's', valor: 20 }
], null, TEMA).erro === 'mistura-estrutural',
  'C6d · misturar inserção com edição de campo na mesma escrita é RECUSADO');

/* =====================================================================
   C7 · MUTAÇÃO — o controle PEGA, ou só existe?
   ===================================================================== */
console.log('\nC7 · mutação: desligo cada cerca e confiro que o negativo CAI');
function mutar(de, para) {
  const fonte = fs.readFileSync(path.join(RAIZ, 'editor', 'escrita.js'), 'utf8');
  if (fonte.indexOf(de) < 0) return null;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', fonte.split(de).join(para))(mod, mod.exports, require);
  return mod.exports;
}
/* C7a · cerca do comentário */
(function () {
  const m = mutar("if (camadas[a].texto.indexOf('/*') >= 0 || camadas[a].texto.indexOf('//') >= 0) {",
                  'if (false) {');
  if (!m) { ok(false, 'C7a · não montei o mutante (o alvo mudou de forma?)'); return; }
  const rm = m.aplicar(forjado, [{ slug:'cartao-capa', i: 0, campo: 'box', valor: [30, 40, 44, 54] }], null, TEMA);
  ok(!(rm.ok === false && rm.erro === 'camada-com-comentario'),
    'C7a · sem a cerca 1, o caso C4h deixa de ser recusado — logo é a cerca 1 que recusa');
})();
/* C7b · cerca da declaração computada */
(function () {
  const m = mutar('if (contagens && contagens[slug] != null && contagens[slug] !== loc.camadas.length) {',
                  'if (false) {');
  if (!m) { ok(false, 'C7b · não montei o mutante'); return; }
  const rm = m.aplicar(srcF, [{ slug:'folheto-indice', i: 1, campo: 's', valor: 28 }],
    { 'folheto-indice': nIndice }, TEMA);
  ok(rm.ok === true, 'C7b · sem a cerca 2, `folheto-indice` volta a ser gravada em SILÊNCIO — ' +
    'é a cerca 2 que pega');
})();
/* C7c · autoconferência: o relatório MEDE ou AFIRMA? */
(function () {
  const m = mutar('for (var ln = a2.linha; ln <= a2.linhaFim; ln++) previstas[ln] = 1;',
                  'previstas[a2.linha] = 1;');
  if (!m) { ok(false, 'C7c · não montei o mutante'); return; }
  /* O ALVO TEM DE SER UMA EDIÇÃO QUE CAI FORA DA 1ª LINHA DO RECORTE.
     Editar `s` (1ª linha) não discrimina: o mutante acertaria por sorte, e
     o controle diria "passou" sem ter testado nada. */
  const rm = m.aplicar(src,
    [{ slug:'cartao-verso', i: iMulti, campo: 'box', valor: [4, 32, 70, null] }], null, TEMA);
  ok(rm.ok === false && rm.erro === 'autoconferencia',
    'C7c · previsão cega para as linhas de baixo do recorte faz a autoconferência REPROVAR',
    JSON.stringify(rm).slice(0, 180));
  /* e o controle positivo do mutante: o que cai na 1ª linha ele ainda grava */
  const rm2 = m.aplicar(src, [{ slug:'cartao-verso', i: iMulti, campo: 's', valor: 33 }], null, TEMA);
  ok(rm2.ok === true, 'C7c2 · o mesmo mutante ainda grava o caso que cai na 1ª linha — ' +
    'a reprova de C7c é da linha errada, não do mutante estar quebrado');
})();
/* C7d · a cerca de ESCOPO: sem ela, campo desconhecido passaria calado */
(function () {
  const m = mutar('if (!TAB[e.campo]) return { ok: false, erro: ' + "'campo-fora-do-escopo'" + ',',
                  'if (false) return { ok: false, erro: ' + "'campo-fora-do-escopo'" + ',');
  if (!m) { ok(false, 'C7d · não montei o mutante (o alvo mudou de forma?)'); return; }
  let caiu = false;
  try { m.aplicar(src, [{ slug:'cartao-capa', i: 0, campo: 'z', valor: 9 }], null, TEMA); }
  catch (e) { caiu = true; }
  ok(caiu, 'C7d · sem a cerca de escopo o pedido de `z` não é mais recusado por nome — ' +
    'é ela que transforma "campo que eu não sei gravar" em erro em vez de silêncio');
})();

/* ------------------------------------------------------------------ */
console.log('\n' + (falhas ? 'REPROVOU' : 'PASSOU') + ' — ' + (checks - falhas) + '/' + checks + ' controles');
process.exit(falhas ? 1 : 0);
