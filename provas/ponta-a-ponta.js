/* =====================================================================
   provas/ponta-a-ponta.js — a peça DE FORA, pelo servidor, até o disco.
       node provas/ponta-a-ponta.js

   POR QUE ESTA SUÍTE EXISTE, E POR QUE ELA NÃO EXISTIA ANTES.

   `provas/escrita.js` prova o mecanismo contra `pecas/*.js`. `provas/
   estados.js` prova as cercas do servidor contra `pecas/*.js`. As duas
   estavam verdes, com 88 controles somados, e mesmo assim o editor abria
   e não salvava no primeiro uso real de fora — porque as duas mediam o
   corpus da CASA, escrito do jeito da casa.

   O agente frio escreveu `slug: 'pagina'`. Um espaço. As 88 passaram.

   A lição, escrita onde ela foi paga: FIXTURE QUE SÓ REPRODUZ O HÁBITO DE
   QUEM ESCREVEU NÃO É FIXTURE, É ESPELHO. Uma suíte inteira pode estar
   verde e medir só a própria convenção.

   ENTÃO A PEÇA AQUI É ESCRITA DE PROPÓSITO NO OUTRO DIALETO: espaço
   depois dos dois-pontos, aspa dupla, `box: [ … ]` com espaço, indentação
   de formatador. Nada disto é o estilo da casa, e é esse o ponto. E ela
   passa pelo caminho INTEIRO — servidor de verdade, HTTP de verdade,
   `fs.writeFileSync` de verdade — porque foi no caminho inteiro que o
   defeito apareceu, e não no mecanismo isolado.

   ONDE ELA ESCREVE. Num diretório temporário do sistema, criado e apagado
   por ela. Não em `pecas/`: mutar o corpus publicado para testar seria
   trocar um risco por outro. A limpeza é CONFERIDA no fim, não afirmada.

   E ELA NÃO SOBE NA PORTA PADRÃO. `listen(0)` pede uma porta livre ao
   sistema — subir na 8811 faria a suíte brigar com um editor aberto, ou
   com outro processo, e um teste que derruba o trabalho de alguém é pior
   que um teste que não existe.
   ===================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const RAIZ = path.resolve(__dirname, '..');
const E = require(path.join(RAIZ, 'editor', 'escrita.js'));

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok   ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}

/* ------------------------------------------------------------------ */
/* A PEÇA COMO UM AGENTE DE FORA A ESCREVE. Reproduzida na formatação que
   o teste frio produziu: espaço depois dos dois-pontos, aspa dupla,
   espaço dentro do colchete, e um bloco de doutrina em cima — que é o que
   a escrita cirúrgica existe para preservar. */
const DE_FORA = [
  '/* =====================================================================',
  '   Uma peça convertida de um HTML qualquer.',
  '',
  '   ESTE COMENTÁRIO É O ATIVO. Ele diz por que a manchete tem esse corpo',
  '   e por que o apoio começa onde começa. Um editor que reserializasse o',
  '   objeto devolveria os números certos e apagaria isto sem erro nenhum.',
  '   ===================================================================== */',
  "'use strict';",
  '',
  'module.exports = {',
  '  pecas: [',
  '    {',
  '      slug: "pagina",',
  '      n: "Uma tarde inteira lendo",',
  '      w: 1080,',
  '      h: 1350,',
  '      c: 430,',
  '      L: [',
  '        { t: "tt", s: 84, lh: 1.02, tx: "Uma tarde<br>inteira lendo", box: [6, 12, 84, null], z: 2 },',
  '        { t: "tx", s: 32, lh: 1.45, tx: "O apoio começa aqui porque a manchete respira duas linhas.", box: [6, 40, 74, null], z: 3 },',
  '        { t: "reserva", k: "assinatura", box: [6, 88, 40, 6], z: 1 }',
  '      ]',
  '    }',
  '  ]',
  '};',
  ''
].join('\n');

/* ------------------------------------------------------------------ */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'editorhtml-prova-'));
const ARQ = path.join(TMP, 'de-fora.js');
fs.writeFileSync(ARQ, DE_FORA, 'utf8');

/* o servidor lê o diretório de peças do ambiente NO CARREGAMENTO — por
   isso a variável entra antes do `require` */
process.env.EDITORHTML_PECAS = TMP;
const S = require(path.join(RAIZ, 'editor', 'servir.js'));

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

const comentarios = s => (s.match(/\/\*[\s\S]*?\*\//g) || []).join('|__|');

/* =====================================================================
   P0 · O MECANISMO ENXERGA A PEÇA DE FORA
   ===================================================================== */
console.log('\nP0 · antes do servidor: o localizador enxerga o dialeto de fora?');
const locDireto = E.localizarCamadas(DE_FORA, 'pagina');
ok(locDireto.ok === true && locDireto.camadas.length === 3,
  'P0a · `slug: "pagina"` (espaço + aspa dupla) localiza as 3 camadas',
  locDireto.ok ? '' : locDireto.msg);
/* e o recorte tem de AVALIAR igual ao que o motor recebe — senão o
   localizador "acha" a peça errada e a escrita cai na camada errada */
const decl = require(ARQ).pecas[0];
let batem = locDireto.ok;
if (locDireto.ok) {
  for (let i = 0; i < decl.L.length; i++) {
    let o; try { o = eval('(' + locDireto.camadas[i].texto + ')'); } catch (e) { o = null; }
    if (JSON.stringify(o) !== JSON.stringify(decl.L[i])) batem = false;
  }
}
ok(batem, 'P0b · e cada recorte avalia IDÊNTICO à declaração que o motor recebe');

S.servidor.listen(0, '127.0.0.1', async () => {
  const porta = S.servidor.address().port;
  console.log('\nP1 · pelo servidor (porta ' + porta + ', pedida ao sistema — nunca a 8811)');
  try {
    /* ---- inventário: a peça de fora aparece, e sem reclamação ---- */
    const inv = await pedir('GET', '/_api/inventario');
    ok(inv.cod === 200 && inv.j.usos.length === 1 && inv.j.usos[0].slug === 'pagina',
      'P1a · o inventário acha a peça de fora', JSON.stringify(inv.j.usos || []).slice(0, 120));
    ok((inv.j.problemas || []).length === 0,
      'P1a2 · e não reclama de nada', JSON.stringify(inv.j.problemas));

    /* ---- camadas do disco: é ISTO que estava devolvendo 422 e jogando o
            editor em "DA MEMÓRIA — não li o arquivo" ---- */
    const cam = await pedir('GET', '/_api/camadas?arq=de-fora&slug=pagina');
    ok(cam.cod === 200 && cam.j.ok && cam.j.camadas.length === 3,
      'P1b · `/_api/camadas` LÊ O DISCO e devolve as 3 camadas — ' +
      'é aqui que o editor caía em somente-memória', JSON.stringify(cam.j).slice(0, 160));
    ok(cam.j.camadas && JSON.stringify(cam.j.camadas) === JSON.stringify(decl.L),
      'P1b2 · e o que o disco devolve é igual ao que o motor monta — ' +
      'a tela e o arquivo não têm como divergir');

    /* ---- a escrita ---- */
    const antes = fs.readFileSync(ARQ, 'utf8');
    const grav = await pedir('POST', '/_api/gravar',
      { arq: 'de-fora', hashEsperado: cam.j.hash,
        edicoes: [{ slug: 'pagina', i: 0, campo: 'box', valor: [9, 15, 80, null] }],
        contagens: { pagina: 3 } });
    ok(grav.cod === 200 && grav.j.ok && grav.j.gravou === true,
      'P1c · a edição foi GRAVADA no disco', JSON.stringify(grav.j).slice(0, 200));
    ok(grav.j.linhasTocadas === 1,
      'P1c2 · e o relatório MEDIU 1 linha tocada (' + grav.j.linhasTocadas + ')');

    const depois = fs.readFileSync(ARQ, 'utf8');
    const A = antes.split('\n'), B = depois.split('\n');
    const dif = [];
    for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) dif.push(i + 1);
    ok(A.length === B.length, 'P1d · o arquivo continua com ' + A.length + ' linhas');
    ok(dif.length === 1, 'P1d2 · exatamente 1 linha mudou no disco (achei ' + dif.length +
      ': ' + dif.join(',') + ')');
    ok(/box:\[9,15,80,null\]/.test(B[dif[0] - 1]),
      'P1d3 · e ela carrega o box pedido', (B[dif[0] - 1] || '').trim());
    /* O CONTROLE CENTRAL: o bloco de doutrina saiu inteiro. */
    ok(comentarios(antes) === comentarios(depois),
      'P1e · o bloco de comentário da peça saiu BYTE-IDÊNTICO');
    /* e todo o RESTO do arquivo também */
    const restoIgual = A.every((l, i) => i === dif[0] - 1 || l === B[i]);
    ok(restoIgual, 'P1e2 · e todas as outras ' + (A.length - 1) + ' linhas saíram byte-idênticas');
    /* a formatação de FORA sobreviveu onde não foi tocada: a aspa dupla e o
       espaço continuam lá, na mesma linha que foi editada */
    ok(/slug: "pagina"/.test(depois),
      'P1e3 · e a declaração de `slug` continua no dialeto de fora — ' +
      'o editor tolera a formatação, não a reescreve');
    ok(/t: "tt"/.test(B[dif[0] - 1]) && /tx: "Uma tarde<br>inteira lendo"/.test(B[dif[0] - 1]),
      'P1e4 · na PRÓPRIA linha editada, o resto dos campos manteve a aspa dupla e o espaço',
      (B[dif[0] - 1] || '').trim());

    /* ---- ida e volta ---- */
    const h2 = (await pedir('GET', '/_api/ler?arq=de-fora')).j.hash;
    const volta = await pedir('POST', '/_api/gravar',
      { arq: 'de-fora', hashEsperado: h2,
        edicoes: [{ slug: 'pagina', i: 0, campo: 'box', valor: decl.L[0].box }],
        contagens: { pagina: 3 } });
    ok(volta.cod === 200 && volta.j.ok, 'P1f · a edição de volta foi aceita');

    /* ---------------------------------------------------------------
       A IDA E VOLTA NÃO DEVOLVE O ARQUIVO BYTE-IDÊNTICO, E ISSO É UM
       COMPORTAMENTO CONHECIDO — MEDIDO AQUI EM VEZ DE ESCONDIDO.

       O agente de fora escreveu `box: [6, 12, 84, null]`. O escritor emite
       `box:[6,12,84,null]`. Então a primeira gravação NORMALIZA o
       espaçamento de dentro do `box`, e a volta não desfaz isso — ela
       reescreve o mesmo literal canônico.

       Isso é diferença cosmética de UMA chave, sem perda de dado, na única
       linha que foi editada. Mas afirmar "byte-idêntico" seria mentira, e
       afrouxar o controle para "quase igual" abriria a porta para deriva
       de verdade passar junto. A régua honesta é esta: o resto do arquivo
       byte-idêntico, e a linha editada igual ao ORIGINAL A MENOS DA
       normalização do `box` — nomeada, e só ela.
       --------------------------------------------------------------- */
    const final = fs.readFileSync(ARQ, 'utf8');
    const F = final.split('\n');
    const iEd = dif[0] - 1;
    ok(A.length === F.length && A.every((l, i) => i === iEd || l === F[i]),
      'P1f2 · depois da volta, TODAS as linhas fora da editada estão byte-idênticas ao original');
    /* a normalização, escrita como uma função: só espaço DENTRO do `box` */
    const canonizarBox = s => s.replace(/box:\s*\[([^\]]*)\]/,
      (m, v) => 'box:[' + v.split(',').map(x => x.trim()).join(',') + ']');
    ok(F[iEd] === canonizarBox(A[iEd]),
      'P1f3 · e a linha editada voltou ao original A MENOS do espaçamento interno do ' +
      '`box`, que o escritor canoniza — nenhuma outra chave da linha mudou',
      'original: ' + (A[iEd] || '').trim() + '\n        final:    ' + (F[iEd] || '').trim());
    ok(F[iEd] !== A[iEd],
      'P1f4 · positivo: a diferença EXISTE mesmo (se sumisse, P1f3 estaria passando à toa)');

    /* ---- o par negativo: as cercas continuam de pé no dialeto de fora ---- */
    const ausente = await pedir('POST', '/_api/gravar',
      { arq: 'de-fora', edicoes: [{ slug: 'nao-existe', i: 0, campo: 's', valor: 10 }] });
    ok(ausente.cod === 422 && ausente.j.erro === 'slug-ausente',
      'P1g · discriminação: slug que não existe continua sendo recusado — ' +
      'a tolerância de formatação não virou tolerância de tudo');
    ok(/"pagina"/.test(ausente.j.msg || ''),
      'P1g2 · e a recusa diz qual slug EXISTE no arquivo', ausente.j.msg);
  } catch (e) {
    ok(false, 'P1 · a suíte estourou: ' + e.message, e.stack);
  }
  S.servidor.close();

  /* =====================================================================
     PZ · LIMPEZA CONFERIDA, não afirmada
     ===================================================================== */
  console.log('\nPZ · a suíte limpa o que sujou — e confere');
  let apagou = false;
  try { fs.rmSync(TMP, { recursive: true, force: true }); apagou = !fs.existsSync(TMP); }
  catch (e) { apagou = false; }
  ok(apagou, 'PZ a · o diretório temporário foi apagado (' + TMP + ')');
  ok(!S.servidor.listening, 'PZ b · e o servidor desta suíte não está mais escutando');
  /* e o corpus publicado não foi tocado: esta suíte nunca abriu `pecas/` */
  ok(fs.existsSync(path.join(RAIZ, 'pecas', 'cartao.js')),
    'PZ c · `pecas/` continua intacto — esta suíte nunca escreveu no corpus publicado');

  console.log('\n' + (falhas ? 'REPROVOU' : 'PASSOU') + ' — ' + (checks - falhas) + '/' + checks + ' controles');
  process.exit(falhas ? 1 : 0);
});
