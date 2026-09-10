/* =====================================================================
   escrita.js — a ESCRITA CIRÚRGICA de volta na declaração.

   O PERIGO QUE ESTE ARQUIVO EXISTE PRA EVITAR.
   Uma declaração de peça é comentário de doutrina em cima de número. Os
   blocos longos que documentam POR QUE cada decisão foi tomada valem mais
   que os números — são o registro do projeto. Um write-back que
   reserialize o objeto (JSON.stringify, ou qualquer volta de AST pra
   texto) entrega os números certos e APAGA a documentação inteira, sem
   erro nenhum, com o arquivo continuando a rodar. Editor que grava errado
   é pior que editor que não grava.

   POR ISSO AQUI NÃO EXISTE SERIALIZAÇÃO DE OBJETO. O arquivo é tratado
   como TEXTO. Localiza-se o recorte exato da camada, e dentro dele troca-se
   o TOKEN do valor — nada mais. Todo o resto do arquivo, byte a byte, sai
   como entrou.

   AS TRÊS CERCAS, E POR QUE SÃO ESSAS TRÊS.

   1. COMENTÁRIO DENTRO DO RECORTE → recusa. Splice de valor preserva tudo
      o mais, mas INSERIR uma chave que ainda não existe escolhe um ponto
      de inserção — e um ponto de inserção dentro de um bloco de comentário
      grava o número dentro do comentário, que é exatamente o estrago que
      este arquivo existe pra evitar.

   2. DECLARAÇÃO COMPUTADA → recusa. Uma peça pode declarar
      `L:[…].concat(pauta(…)).concat([…])`: 7 camadas existem como texto e
      15 nascem de uma função. O localizador acha 7 e a peça tem 22. Sem
      esta cerca ele devolvia 7 EM SILÊNCIO, e silêncio lido como aprovação
      é o pior modo de falha que existe aqui. Quem chama passa a contagem
      esperada; divergiu, não escrevo.

   3. O QUE A ESCRITA MEXEU TEM DE SER O QUE ELA DISSE QUE IA MEXER →
      autoconferência. Antes de devolver os bytes, `aplicar` difere o antes
      e o depois LINHA A LINHA e compara com as linhas que os recortes
      previam. Divergiu, devolve o original e grita. Um relatório que
      afirma "1 linha" sem ter contado é fé, não medida.

   O QUE NÃO É CERCA: camada em duas linhas. Uma declaração pode quebrar a
   linha por legibilidade. O splice preserva a quebra byte a byte, então
   editar é seguro — o que muda é que o diff sai com 2 linhas em vez de 1,
   e isso é FATO da declaração, não defeito da escrita. Por isso o número
   esperado é DERIVADO do recorte, nunca fixado em 1.

   O ESCOPO É DADO DE TEMA. `CAMPOS` abaixo é só o escopo do NÚCLEO —
   geometria, corpo, entrelinha, texto, tipo e arquivo de imagem. Um tema
   acrescenta os campos dele passando `{campos, ordem}` como 4º argumento
   de `aplicar`. Campo fora da tabela efetiva é recusado POR NOME, nunca
   ignorado em silêncio: pedido que não vira efeito tem de virar erro.
   ===================================================================== */
'use strict';

var AP = String.fromCharCode(39);   /* aspa simples */
var BS = String.fromCharCode(92);   /* barra invertida */

/* ------------------------------------------------------------------ */
/* O VARREDOR. Percorre o texto sabendo o que é string e o que é
   comentário, porque contar `[`/`{` cru é como o parser ingênuo morre:
   `tx:'[[um]] colchete!'` tem colchetes DENTRO de uma string, e há
   colchete dentro de bloco de comentário neste arquivo. `prof` é relativa
   ao ponto de partida — quem chama declara em que profundidade começou. */
function varredor(src, ini, profInicial) {
  var i = ini, prof = profInicial || 0;
  return {
    passo: function () {
      while (i < src.length) {
        var c = src[i];
        if (c === '/' && src[i + 1] === '*') {              /* comentário de bloco */
          var f = src.indexOf('*/', i + 2);
          i = f < 0 ? src.length : f + 2;
          continue;
        }
        if (c === '/' && src[i + 1] === '/') {              /* comentário de linha */
          var g = src.indexOf('\n', i + 2);
          i = g < 0 ? src.length : g + 1;
          continue;
        }
        if (c === AP || c === '"' || c === '`') {           /* string */
          var asp = c, j = i + 1;
          while (j < src.length) {
            if (src[j] === BS) { j += 2; continue; }
            if (src[j] === asp) { j++; break; }
            j++;
          }
          i = j;
          continue;
        }
        if (c === '[' || c === '{' || c === '(') { prof++; i++; return { c: c, prof: prof, i: i - 1, abre: true }; }
        if (c === ']' || c === '}' || c === ')') { prof--; i++; return { c: c, prof: prof, i: i - 1, fecha: true }; }
        i++;
        return { c: c, prof: prof, i: i - 1 };
      }
      return null;
    }
  };
}

/* ------------------------------------------------------------------ */
/* ACHAR AS DECLARAÇÕES DE `slug`, DO JEITO QUE ELAS SE ESCREVEM DE FATO.

   A primeira versão disto procurava o literal `slug:'x'` com `indexOf`, e
   o defeito só apareceu no primeiro uso de fora: um agente sem contexto
   converteu um HTML e escreveu `slug: 'pagina'` — com o espaço que
   qualquer pessoa e qualquer formatador põem. O localizador não achou,
   devolveu `slug-ausente`, e o editor abriu a peça bonita e disse "nada
   será gravado". O editor abre e não salva é a promessa inteira caindo.
   Medido: 1 de 1 agente frio produziu o formato que não abria. E o nosso
   próprio corpus escondia isso, porque a casa escrevia colado.

   AGORA A TOLERÂNCIA É A MESMA QUE O LOCALIZADOR JÁ TINHA para achar
   `L:[`: espaço em volta dos dois-pontos, e as duas aspas. Nada além
   disso — tolerar formatação não é adivinhar intenção.

   E ELA VEM COM UM GANHO DE PRECISÃO, não só de alcance: a varredura é a
   do `varredor`, que sabe o que é comentário e o que é string. `indexOf`
   era cego — um `slug:'capa'` citado dentro de um bloco de comentário
   contava como ocorrência e derrubava o arquivo inteiro em
   `slug-repetido`. Agora só conta declaração de verdade.

   O QUE **NÃO** MUDOU, e é o que mantém isto seguro: zero ocorrências
   recusa, duas ou mais recusam. A cura alarga o que ele RECONHECE, nunca
   o que ele ACEITA como ambíguo.                                        */

/* `slug` + espaço + `:` + espaço + aspa (simples ou dupla) + valor.
   Sticky (`y`): casa ancorado na posição que a varredura ofereceu, nunca
   procurando adiante — procurar adiante é como um casamento de outra
   linha entraria fingindo ser deste ponto. O valor não atravessa quebra
   de linha, senão uma aspa não fechada engoliria o arquivo. */
var RE_SLUG = /slug[ \t\r\n]*:[ \t\r\n]*(['"])((?:\\.|[^\\\r\n])*?)\1/y;

function acharSlugs(src) {
  var v = varredor(src, 0, 0), passo, achados = [];
  while ((passo = v.passo())) {
    /* o varredor PULA string e comentário inteiros, então tudo o que ele
       devolve é código de verdade — é daí que vem a precisão nova */
    if (passo.c !== 's') continue;
    var i = passo.i;
    /* `subslug:` não é `slug:`. Sem esta guarda, uma chave que TERMINA em
       "slug" viraria uma peça fantasma. */
    if (/[A-Za-z0-9_$]/.test(src[i - 1] || '')) continue;
    RE_SLUG.lastIndex = i;
    var m = RE_SLUG.exec(src);
    if (!m) continue;
    achados.push({ i: i, valor: m[2] });
  }
  return achados;
}

/* ------------------------------------------------------------------ */
/* LOCALIZAR. Devolve o recorte de texto de cada camada do `L:[…]` de um
   slug. Nunca adivinha: se o slug aparecer 0 ou 2+ vezes, se não houver
   `L:[` no objeto, ou se alguma camada tiver comentário interno, RECUSA
   com motivo nomeado.                                                  */
function localizarCamadas(src, slug) {
  var todos = acharSlugs(src);
  var achados = todos.filter(function (a) { return a.valor === slug; });
  if (achados.length === 0) {
    /* A MENSAGEM DIZ O QUE EXISTE, e não só o que falta. "nenhuma peça
       declara `slug:'x'`" manda a pessoa procurar um erro de digitação no
       nome; listar os slugs que ESTÃO no arquivo resolve o caso comum
       (nome trocado) sem ela abrir o arquivo. */
    return { ok: false, erro: 'slug-ausente',
      msg: 'nenhuma peça deste arquivo declara `slug` igual a "' + slug + '"' +
           (todos.length ? '. Os que existem: ' +
              todos.map(function (a) { return '"' + a.valor + '"'; }).join(', ')
            : '. O arquivo não declara `slug` nenhum.') };
  }
  if (achados.length > 1) {
    return { ok: false, erro: 'slug-repetido',
      msg: achados.length + ' peças declaram `slug` igual a "' + slug +
           '" — ambíguo, não escrevo' };
  }
  var p = achados[0].i;

  /* `L:[` na profundidade 0 relativa ao slug. Qualquer array declarado
     antes dele (por exemplo `mov:[{…}]`) fica em profundidade ≥1, e por
     isso não confunde. */
  var v = varredor(src, p, 0), ini = -1, passo;
  while ((passo = v.passo())) {
    if (passo.abre && passo.c === '[' && passo.prof === 1) {
      var q = passo.i - 1;
      while (q >= 0 && /\s/.test(src[q])) q--;
      if (src[q] === ':') {
        var r = q - 1;
        while (r >= 0 && /\s/.test(src[r])) r--;
        if (src[r] === 'L' && !/[A-Za-z0-9_$]/.test(src[r - 1] || '')) { ini = passo.i; break; }
      }
    }
    if (passo.prof < 0) break;                 /* saiu do objeto da peça */
  }
  if (ini < 0) return { ok: false, erro: 'L-ausente',
    msg: 'a peça ' + slug + ' não tem um `L:[` endereçável' };

  var camadas = [], abertura = -1;
  while ((passo = v.passo())) {
    if (passo.abre && passo.c === '{' && passo.prof === 2) abertura = passo.i;
    else if (passo.fecha && passo.c === '}' && passo.prof === 1 && abertura >= 0) {
      camadas.push({ ini: abertura, fim: passo.i + 1, texto: src.slice(abertura, passo.i + 1) });
      abertura = -1;
    } else if (passo.fecha && passo.c === ']' && passo.prof === 0) break;
  }
  if (!camadas.length) return { ok: false, erro: 'L-vazio',
    msg: 'a peça ' + slug + ' declara `L:[]` sem camadas' };

  for (var a = 0; a < camadas.length; a++) {
    /* CERCA 1 — comentário dentro do recorte torna a INSERÇÃO de chave
       insegura (o número poderia ser gravado dentro do comentário). */
    if (camadas[a].texto.indexOf('/*') >= 0 || camadas[a].texto.indexOf('//') >= 0) {
      return { ok: false, erro: 'camada-com-comentario',
        msg: 'a camada #' + a + ' de ' + slug + ' tem comentário dentro do próprio objeto. ' +
             'Não escrevo ali — o risco de gravar número dentro de comentário é exatamente ' +
             'o que esta escrita existe pra evitar. Use o patch e edite à mão.' };
    }
    var antes = src.slice(0, camadas[a].ini).split('\n').length;
    camadas[a].linha = antes;
    camadas[a].linhaFim = antes + (camadas[a].texto.split('\n').length - 1);
    camadas[a].multilinha = camadas[a].linhaFim > antes;
  }
  return { ok: true, camadas: camadas };
}

/* ------------------------------------------------------------------ */
/* FORMATAÇÃO — no estilo que o arquivo já usa (sem espaço dentro do
   colchete, sem zero à direita sobrando).                              */
function num(v) {
  if (v === null || v === undefined) return 'null';
  var r = Math.round(v * 10) / 10;                 /* 0,1% de um nativo de 1080 ≈ 1 px */
  if (Object.is(r, -0)) r = 0;
  return String(r);
}
function numLivre(v, casas) {
  if (v === null || v === undefined) return 'null';
  var f = Math.pow(10, casas), r = Math.round(v * f) / f;
  if (Object.is(r, -0)) r = 0;
  return String(r);
}
function comoString(s) {
  return AP + String(s).split(BS).join(BS + BS).split(AP).join(BS + AP) + AP;
}

/* ------------------------------------------------------------------ */
/* ACHAR A CHAVE DENTRO DO RECORTE DA CAMADA. Profundidade 1 relativa ao
   `{` da camada — `box:[6,5,80,null]` tem vírgula dentro e `tx:'a, b'`
   também; contar vírgula cru erraria os dois.                           */
function fatiarChave(texto, chave) {
  var v = varredor(texto, 0, 0), passo, achou = -1;
  while ((passo = v.passo())) {
    if (passo.prof !== 1 || passo.c !== chave[0]) continue;
    var j = passo.i;
    if (texto.slice(j, j + chave.length) !== chave) continue;
    if (/[A-Za-z0-9_$]/.test(texto[j - 1] || '')) continue;
    var q = j + chave.length;
    while (q < texto.length && /\s/.test(texto[q])) q++;
    if (texto[q] !== ':') continue;
    achou = j; break;
  }
  if (achou < 0) return null;
  var w = achou + chave.length;
  while (texto[w] !== ':') w++;
  w++;
  var v2 = varredor(texto, w, 1), fim = -1, p2;
  while ((p2 = v2.passo())) {
    if (p2.prof === 1 && p2.c === ',') { fim = p2.i; break; }
    if (p2.fecha && p2.c === '}' && p2.prof === 0) { fim = p2.i; break; }
  }
  if (fim < 0) fim = texto.length;
  return { ini: achou, iniValor: w, fim: fim };
}

/* trocar (ou INSERIR, quando a chave ainda não existe) um campo na linha */
function removerCampo(texto, chave) {
  var f = fatiarChave(texto, chave);
  if (!f) return texto;
  /* engole a virgula que separava o par, dos dois lados conforme o caso,
     para nao sobrar `{t:'tt', , box:[...]}` */
  var ini = f.ini, fim = f.fim;
  if (texto[fim] === ',') fim++;
  else { var q = ini - 1; while (q > 0 && /\s/.test(texto[q])) q--;
         if (texto[q] === ',') ini = q; }
  while (/\s/.test(texto[fim])) fim++;
  return texto.slice(0, ini) + texto.slice(fim);
}

function trocarCampo(texto, chave, literal, ancoras) {
  var f = fatiarChave(texto, chave);
  if (f) return texto.slice(0, f.iniValor) + literal + texto.slice(f.fim);
  for (var i = 0; i < ancoras.length; i++) {
    var a = fatiarChave(texto, ancoras[i]);
    if (a) return texto.slice(0, a.fim) + ', ' + chave + ':' + literal + texto.slice(a.fim);
  }
  var z = texto.length - 1;
  while (z > 0 && texto[z] !== '}') z--;
  return texto.slice(0, z) + ', ' + chave + ':' + literal + texto.slice(z);
}

/* ------------------------------------------------------------------ */
/* COMO LINHA — serializa uma camada NOVA no estilo da casa.
   Reemitir camada EXISTENTE seria o crime que este arquivo evita; emitir
   uma camada que ainda nao existe e outra coisa: nao ha comentario nem
   formatacao de ninguem para preservar, porque a linha esta sendo criada
   agora. A ORDEM das chaves e dado de tema — o nucleo so sabe a dele. */
var ORDEM = ['t', 'a', 'src', 's', 'lh', 'al', 'tx', 'box', 'z'];
function comoLinha(o, ordem) {
  var partes = [], vistas = {};
  function por(k) {
    if (!(k in o) || o[k] === undefined) return;
    vistas[k] = 1;
    var v = o[k], lit;
    if (k === 'box') lit = '[' + v.map(num).join(',') + ']';
    else if (v === null) lit = 'null';
    else if (typeof v === 'string') lit = comoString(v);
    else if (typeof v === 'boolean') lit = v ? 'true' : 'false';
    else if (Array.isArray(v)) lit = '[' + v.join(',') + ']';
    else lit = String(v);
    partes.push(k + ':' + lit);
  }
  (ordem && ordem.length ? ordem : ORDEM).forEach(por);
  Object.keys(o).forEach(function (k) { if (!vistas[k]) por(k); });
  return '{' + partes.join(', ') + '}';
}

/* recuo da linha em que um offset cai */
function recuoDe(src, off) {
  var ini = src.lastIndexOf('\n', off) + 1;
  var m = /^[ \t]*/.exec(src.slice(ini, off));
  return m ? m[0] : '      ';
}

/* ------------------------------------------------------------------ */
/* O ESCOPO DO NÚCLEO, EM CÓDIGO. Geometria, corpo, entrelinha, texto,
   tipo e arquivo de imagem — e nada mais. Campo fora desta tabela (e da
   que o tema acrescenta) é recusado por nome, não ignorado em silêncio.  */
var CAMPOS = {
  box: { chave: 'box', anc: [],                 lit: function (v) { return '[' + v.map(num).join(',') + ']'; } },
  s:   { chave: 's',   anc: ['t'],              lit: function (v) { return numLivre(v, 0); } },
  lh:  { chave: 'lh',  anc: ['s', 't'],         lit: function (v) { return numLivre(v, 2); } },
  tx:  { chave: 'tx',  anc: ['lh', 's', 't'],   lit: function (v) { return comoString(v); } },
  /* `t` decide a CLASSE da camada, e tudo o mais (família, peso, caixa) é
     consequência dela no CSS do tema. Por isso o editor troca classe,
     nunca fonte solta. */
  t:   { chave: 't',   anc: [],                 lit: function (v) { return comoString(v); } },
  /* o arquivo de imagem de uma camada `obj`. Vazio REMOVE o campo, para a
     camada não ficar carregando um caminho morto declarado. */
  src: { chave: 'src', anc: ['t'], remover: function (v) { return v == null || v === ''; },
         lit: function (v) { return comoString(v); } }
};

/* o escopo efetivo = núcleo + tema. Nome repetido: o tema manda, porque
   ele é quem conhece a semântica do campo na peça dele. */
function escopoDe(tema) {
  if (!tema || !tema.campos) return CAMPOS;
  var m = {}, k;
  for (k in CAMPOS) m[k] = CAMPOS[k];
  for (k in tema.campos) m[k] = tema.campos[k];
  return m;
}

/* ------------------------------------------------------------------ */
/* APLICAR. `edicoes` = [{slug, i, campo, valor}]. Devolve o texto novo e
   as linhas tocadas. NÃO grava em disco — quem grava é o servidor, e só
   depois de conferir que o arquivo no disco ainda é o que foi lido.
   `tema` = {campos, ordem}, opcional.                                   */
function aplicar(src, edicoes, contagens, tema) {
  var TAB = escopoDe(tema);
  var ORD = (tema && tema.ordem) || null;

  if (!Array.isArray(edicoes) || !edicoes.length) {
    return { ok: false, erro: 'sem-edicao', msg: 'nenhuma edição pedida — nada a gravar' };
  }

  /* LOCALIZAR TUDO ANTES DE TROCAR QUALQUER COISA. Se uma peça não for
     endereçável, o arquivo não é tocado nem parcialmente — meio-arquivo
     escrito é o pior resultado possível aqui. */
  /* ================================================================
     OPERACOES ESTRUTURAIS - inserir e remover CAMADA INTEIRA.
     Ate aqui a escrita so trocava valor em linha existente. Arrastar um
     asset da estante INSERE uma linha; o desfazer REMOVE. Continua
     cirurgico: a linha nova entra inteira e sozinha, a removida sai
     inteira e sozinha, e nenhum byte do resto do arquivo (nem um dos
     blocos de comentario) e reescrito.
     Rodam SOZINHAS: misturar insercao com edicao de campo na mesma
     escrita embaralharia indices, porque inserir no meio empurra todo
     mundo abaixo. Quem chama manda uma coisa por vez.
     ================================================================ */
  var estruturais = edicoes.filter(function (e) { return e.tipo === 'inserir' || e.tipo === 'remover'; });
  if (estruturais.length) {
    if (estruturais.length !== edicoes.length) {
      return { ok: false, erro: 'mistura-estrutural',
        msg: 'nao misturo insercao/remocao de camada com edicao de campo na mesma escrita' };
    }
    if (estruturais.length > 1) {
      return { ok: false, erro: 'estrutural-multipla',
        msg: 'uma operacao estrutural por vez (vieram ' + estruturais.length + ')' };
    }
    var op = estruturais[0];
    var locE = localizarCamadas(src, op.slug);
    if (!locE.ok) return locE;
    if (contagens && contagens[op.slug] != null && contagens[op.slug] !== locE.camadas.length) {
      return { ok: false, erro: 'declaracao-computada',
        msg: 'a peca ' + op.slug + ' monta ' + contagens[op.slug] + ' camadas mas so ' +
             locE.camadas.length + ' existem como texto - nao insiro nem removo aqui' };
    }
    var cams = locE.camadas, saidaE, detE;

    if (op.tipo === 'inserir') {
      var idx = Math.max(0, Math.min(op.indice == null ? cams.length : op.indice, cams.length));
      var linha = comoLinha(op.camada, ORD);
      if (linha.indexOf('\n') >= 0) {
        return { ok: false, erro: 'linha-invalida', msg: 'a camada nova nao cabe em uma linha' };
      }
      var ondeLinha;
      if (idx < cams.length) {
        var alvoC = cams[idx], rec = recuoDe(src, alvoC.ini);
        saidaE = src.slice(0, alvoC.ini) + linha + ',' + '\n' + rec + src.slice(alvoC.ini);
        ondeLinha = src.slice(0, alvoC.ini).split('\n').length;
      } else {
        var ult = cams[cams.length - 1], rec2 = recuoDe(src, ult.ini);
        saidaE = src.slice(0, ult.fim) + ',' + '\n' + rec2 + linha + src.slice(ult.fim);
        ondeLinha = src.slice(0, ult.fim).split('\n').length + 1;
      }
      detE = { slug: op.slug, camada: idx, campos: ['+camada'], linha: ondeLinha, para: linha };
    } else {
      var i2 = op.indice;
      if (!cams[i2]) return { ok: false, erro: 'camada-ausente',
        msg: 'a peca ' + op.slug + ' nao tem camada #' + i2 };
      var c2 = cams[i2], ini2, fim2;
      /* A ULTIMA CAMADA NAO TEM VIRGULA DEPOIS DELA — quem carrega a
         virgula e a linha ANTERIOR. Apagar so a linha da ultima deixava
         `{...},` orfao antes do `]`, e o arquivo continuava valido, so que
         com uma virgula pendurada que ninguem pediu. Quem pegou foi a
         ida-e-volta (inserir no fim + remover != byte-identico), nao a
         leitura do codigo. */
      if (i2 === cams.length - 1 && i2 > 0) {
        ini2 = cams[i2 - 1].fim;                 /* logo apos o `}` anterior */
        fim2 = c2.fim;                           /* engole `,` + quebra + recuo */
      } else {
        ini2 = src.lastIndexOf('\n', c2.ini) + 1;
        fim2 = c2.fim;
        if (src[fim2] === ',') fim2++;
        while (src[fim2] === ' ' || src[fim2] === '\t') fim2++;
        if (src[fim2] === '\n') fim2++;
      }
      saidaE = src.slice(0, ini2) + src.slice(fim2);
      detE = { slug: op.slug, camada: i2, campos: ['-camada'],
               linha: src.slice(0, c2.ini).split('\n').length, de: c2.texto };
    }

    /* AUTOCONFERENCIA: exatamente uma linha a mais ou a menos, e nenhum
       comentario tocado. O relatorio MEDE em vez de afirmar. */
    var A0 = src.split('\n'), B0 = saidaE.split('\n');
    var delta = B0.length - A0.length;
    var esperado = op.tipo === 'inserir' ? 1 : -1;
    if (delta !== esperado) {
      return { ok: false, erro: 'autoconferencia',
        msg: 'esperava ' + esperado + ' linha de diferenca e medi ' + delta + '. Nao gravo.' };
    }
    var comE = function (t) { return (t.match(/\/\*[\s\S]*?\*\//g) || []).join(''); };
    if (comE(src) !== comE(saidaE)) {
      return { ok: false, erro: 'autoconferencia',
        msg: 'a operacao estrutural mexeu em bloco de comentario. Nao gravo.' };
    }
    return { ok: true, texto: saidaE, inalterado: false, estrutural: op.tipo,
             linhasTocadas: 1, linhasMedidas: [detE.linha], detalhe: [detE] };
  }

  var porSlug = {}, i, e;
  for (i = 0; i < edicoes.length; i++) {
    e = edicoes[i];
    if (!TAB[e.campo]) return { ok: false, erro: 'campo-fora-do-escopo',
      msg: 'campo `' + e.campo + '` está fora do escopo deste editor (o núcleo edita ' +
           'geometria, corpo, entrelinha, texto, tipo e src; o resto é o que o tema declarar)' };
    (porSlug[e.slug] = porSlug[e.slug] || []).push(e);
  }

  var alvos = {};                       /* chave slug#i -> {ini,fim,orig,texto,linha} */
  for (var slug in porSlug) {
    var loc = localizarCamadas(src, slug);
    if (!loc.ok) return loc;

    /* CERCA 2 — a declaração pode ser COMPUTADA (`L:[…].concat(…)`).
       O texto tem N camadas e a peça montada tem M. Sem esta conferência o
       localizador devolvia N em silêncio e escrevia na camada errada de
       índice deslocado, ou recusava por "camada-ausente" culpando o índice
       em vez da causa. */
    if (contagens && contagens[slug] != null && contagens[slug] !== loc.camadas.length) {
      return { ok: false, erro: 'declaracao-computada',
        msg: 'a peça ' + slug + ' monta ' + contagens[slug] + ' camadas mas só ' +
             loc.camadas.length + ' existem como texto na declaração — o resto nasce de ' +
             'uma função (`.concat(…)`). Camada gerada não tem número pra eu trocar. ' +
             'Esta peça é somente-leitura neste editor.' };
    }

    var lista = porSlug[slug];
    for (i = 0; i < lista.length; i++) {
      e = lista[i];
      var cam = loc.camadas[e.i];
      if (!cam) return { ok: false, erro: 'camada-ausente',
        msg: 'a peça ' + slug + ' tem ' + loc.camadas.length + ' camadas; #' + e.i + ' não existe' };
      if (src.slice(cam.ini, cam.fim) !== cam.texto) return { ok: false, erro: 'recorte-inconsistente',
        msg: 'o recorte da camada #' + e.i + ' de ' + slug + ' não confere com o arquivo' };
      var ch = slug + '#' + e.i;
      if (!alvos[ch]) alvos[ch] = { slug: slug, i: e.i, ini: cam.ini, fim: cam.fim,
                                    orig: cam.texto, texto: cam.texto, linha: cam.linha,
                                    linhaFim: cam.linhaFim, multilinha: cam.multilinha, campos: [] };
      var spec = TAB[e.campo];
      alvos[ch].texto = (spec.remover && spec.remover(e.valor))
        ? removerCampo(alvos[ch].texto, spec.chave)
        : trocarCampo(alvos[ch].texto, spec.chave, spec.lit(e.valor), spec.anc);
      alvos[ch].campos.push(e.campo);
    }
  }

  /* aplicar de trás pra frente, para os offsets não andarem */
  var ordem = Object.keys(alvos).map(function (k) { return alvos[k]; })
    .filter(function (a) { return a.texto !== a.orig; })
    .sort(function (a, b) { return b.ini - a.ini; });

  if (!ordem.length) {
    return { ok: true, texto: src, inalterado: true, linhasTocadas: 0, detalhe: [],
      msg: 'os valores pedidos já são os que estão no arquivo — nada foi escrito' };
  }

  var saida = src, detalhe = [], previstas = {};
  for (i = 0; i < ordem.length; i++) {
    var a2 = ordem[i];
    saida = saida.slice(0, a2.ini) + a2.texto + saida.slice(a2.fim);
    for (var ln = a2.linha; ln <= a2.linhaFim; ln++) previstas[ln] = 1;
    detalhe.push({ slug: a2.slug, camada: a2.i, linha: a2.linha, linhaFim: a2.linhaFim,
                   multilinha: a2.multilinha,
                   campos: a2.campos.filter(function (c, n, ar) { return ar.indexOf(c) === n; }),
                   de: a2.orig, para: a2.texto });
  }

  /* CERCA 3 — AUTOCONFERÊNCIA. O relatório não pode AFIRMAR quantas linhas
     mudaram; ele tem de MEDIR. Se o número medido não bate com o previsto
     pelos recortes, alguma coisa que eu não entendi aconteceu — e a saída
     certa é devolver o original, não os bytes.                            */
  var A = src.split('\n'), B = saida.split('\n');
  var medidas = [];
  if (A.length !== B.length) {
    return { ok: false, erro: 'autoconferencia',
      msg: 'a escrita mudou a CONTAGEM de linhas do arquivo (' + A.length + ' → ' + B.length +
           '). Isso nunca deveria acontecer numa troca de valor. Não gravo.' };
  }
  for (i = 0; i < A.length; i++) if (A[i] !== B[i]) medidas.push(i + 1);
  var prev = Object.keys(previstas).map(Number).sort(function (x, y) { return x - y; });
  var soDentro = medidas.every(function (l) { return previstas[l]; });
  if (!soDentro) {
    return { ok: false, erro: 'autoconferencia',
      msg: 'a escrita mexeu em linha fora dos recortes previstos. Previstas: [' + prev.join(',') +
           ']; medidas: [' + medidas.join(',') + ']. Não gravo.' };
  }
  return { ok: true, texto: saida, inalterado: false,
           linhasTocadas: medidas.length, linhasMedidas: medidas, linhasPrevistas: prev,
           detalhe: detalhe };
}

module.exports = { localizarCamadas, acharSlugs, aplicar, comoString, num, numLivre,
                   varredor, CAMPOS, ORDEM, escopoDe, comoLinha };
