/* =====================================================================
   temas/exemplo/tema.js — o tema de demonstração.

   Ele existe para DUAS coisas, e nenhuma delas é ser bonito:

   1. Provar que os sete ganchos bastam. Este tema acrescenta dois tipos
      de camada (`fio`, `selo`), um campo de escrita (`cor`), rótulo,
      painel, prévia, aviso de quebra e estante — e não toca uma linha do
      núcleo para isso.

   2. Ser a folha em branco de quem chega. Copie esta pasta, troque o
      `nome`, e você tem um tema seu.

   TODO GANCHO É OPCIONAL. Apague `estante` e a aba some. Apague o arquivo
   inteiro e o editor continua abrindo, com os quatro tipos do núcleo.

   O CONTRATO, INTEIRO:

     nome     string
     tipos    { <t>: (camada, ctx) => Node }        monta o DOM da camada
     campos   { <campo>: {chave, anc, lit, remover} } escopo de escrita
     ordem    [string]                              ordem ao criar linha nova
     rotulo   (camada, i) => {titulo, corpo, glosa}
     painel   (camada, i, api) => [Node]            blocos extras no painel
     previa   (camada) => {src, encaixe} | {nada}   pintado POR CIMA
     quebra   (camada, i, peca) => string | null    aviso ao apagar
     estante  () => [{cat, desc, itens:[…]}]        biblioteca de assets
   ===================================================================== */
(function (raiz, definir) {
  'use strict';
  var T = definir();
  if (typeof module === 'object' && module.exports) module.exports = T;
  if (raiz) raiz.TEMA = T;
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  /* ------------------------------------------------------------------
     A PALETA DO TEMA. Cinco fichas com nome — nome é o que se escreve na
     declaração, hex é o que o motor pinta. O editor mostra as duas coisas
     e mede o contraste; ele NÃO impede escolha ruim, ele conta a
     consequência antes de virar peça.
     ------------------------------------------------------------------ */
  var FICHAS = [
    { nome: 'breu',  hex: '#1B1B1F', diz: 'o escuro de base' },
    { nome: 'linho', hex: '#F6F4EF', diz: 'o claro de base' },
    { nome: 'barro', hex: '#E4572E', diz: 'o acento quente' },
    { nome: 'anil',  hex: '#2B5BD7', diz: 'o acento frio' },
    { nome: 'mel',   hex: '#F2C14E', diz: 'o realce' }
  ];
  function hexDe(v) {
    if (!v) return null;
    for (var i = 0; i < FICHAS.length; i++) if (FICHAS[i].nome === v) return FICHAS[i].hex;
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v).trim()) ? String(v).trim() : null;
  }

  /* contraste WCAG, para o painel MEDIR em vez de opinar */
  function lumin(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return null;
    var c = [m[1], m[2], m[3]].map(function (h) {
      var v = parseInt(h, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function razao(a, b) {
    var la = lumin(a), lb = lumin(b);
    if (la == null || lb == null) return null;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  var GLOSA = { tt: 'título', tx: 'texto', obj: 'imagem', reserva: 'vão',
                fio: 'fio', selo: 'selo' };

  function trecho(s, n) {
    var t = String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
      .replace(/\[\[(.+?)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  /* ==================================================================
     GANCHO 1 · TIPOS — o DOM das camadas que o núcleo não conhece.
     ================================================================== */
  var tipos = {
    /* FIO — um retângulo fino. A ESPESSURA dele é o `box[3]`, não uma
       borda: ele é CAMADA, e por isso se mede e se move como as outras. */
    fio: function (c, ctx) {
      var e = ctx.el(ctx.doc, 'div', 'ly fio');
      var cor = hexDe(c.cor);
      if (cor) e.style.background = cor;
      return e;
    },
    /* SELO — uma etiqueta em caixa alta dentro de uma pastilha. Existe
       para provar que um tema pode ter tipo de TEXTO próprio, com regra
       tipográfica que o núcleo não tem. */
    selo: function (c, ctx) {
      var e = ctx.texto(ctx.el(ctx.doc, 'div', 'ly selo', {
        fontSize: c.s != null ? ctx.px(c.s) : ''
      }), c.tx);
      var cor = hexDe(c.cor);
      if (cor) e.style.background = cor;
      return e;
    }
  };

  /* ==================================================================
     GANCHO 2 · CAMPOS — o que a escrita cirúrgica pode gravar, além do
     escopo do núcleo. Mesma forma que `escrita.js` usa internamente:

       chave    o nome literal no arquivo
       anc      âncoras: se a chave não existir, entra DEPOIS da 1ª destas
       lit      valor → literal de código
       remover  valor → true quando o campo deve SAIR da linha

     `remover` importa: uma cor apagada tem de sumir da declaração, não
     virar `cor:''`. Chave morta declarada faz o arquivo afirmar o que o
     motor ignora.
     ================================================================== */
  var campos = {
    cor: {
      chave: 'cor', anc: ['t'],
      remover: function (v) { return v == null || v === ''; },
      lit: function (v) { return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
    }
  };

  /* ordem das chaves ao SERIALIZAR uma camada nova (arrastada da estante
     ou criada com T). Só vale para linha que nasce agora. */
  var ordem = ['t', 'src', 'cor', 's', 'lh', 'al', 'tx', 'box', 'z'];

  /* ==================================================================
     GANCHO 3 · RÓTULO — "camada 5" derrota a tarefa. Quem edita precisa
     saber que está mexendo no texto de apoio e não no fio atrás dele.
     ================================================================== */
  function rotulo(c, i) {
    var base = '#' + i + ' · ' + c.t;
    if (c.t === 'tt' || c.t === 'tx' || c.t === 'selo') {
      return { titulo: base, corpo: '“' + trecho(c.tx, 34) + '”',
               glosa: GLOSA[c.t] + (c.s ? ' · corpo ' + c.s : '') };
    }
    if (c.t === 'obj') {
      return { titulo: base, corpo: String(c.src || '').replace(/^.*\//, '') || 'sem arquivo',
               glosa: GLOSA.obj };
    }
    if (c.t === 'reserva') {
      return { titulo: base, corpo: c.k ? 'o vão de ' + c.k : 'vão sem nome', glosa: GLOSA.reserva };
    }
    if (c.t === 'fio') {
      return { titulo: base, corpo: (c.cor || 'cor de bandeira'), glosa: GLOSA.fio };
    }
    return { titulo: base, corpo: '', glosa: GLOSA[c.t] || c.t };
  }

  /* ==================================================================
     GANCHO 4 · PAINEL — blocos extras para a camada marcada.
     `api` traz o que o núcleo já sabe fazer: `el`, `campoNum`, `instantaneo`,
     `remontar`, `podeEditar`, `estado`, `peca`.
     ================================================================== */
  function painel(c, i, api) {
    var fora = [];
    if (c.t !== 'fio' && c.t !== 'selo') return fora;

    var g = api.el('div', 'grupo');
    g.appendChild(api.el('h2', null, c.t === 'fio' ? 'Fio · espessura e cor' : 'Selo · cor'));

    if (c.t === 'fio') {
      var H = api.peca.h;
      var esp = (c.box || [])[3];
      g.appendChild(api.campoNum('espessura %', esp == null ? null : esp,
        function (v) { c.box = c.box.slice(); c.box[3] = v; }, 0.01,
        'em % do nativo — o fio é camada, e a espessura dele é o box[3]', '3'));
      g.appendChild(api.el('div', 'nativo', esp == null
        ? 'sem espessura declarada — o fio não aparece'
        : 'na peça: ' + (Math.round(H * esp / 100 * 10) / 10) + ' px do nativo'));
      g.appendChild(api.el('div', 'fato',
        'A alça de baixo também redimensiona, mas em fração de por cento ela ' +
        'mente sobre a precisão. Aqui dá pra digitar o décimo.'));
    }

    /* ---- as fichas, e depois a cor livre ---- */
    var linha = api.el('div', 'fichas');
    FICHAS.forEach(function (f) {
      var b = api.el('button', 'ficha');
      b.type = 'button';
      b.title = f.nome + ' — ' + f.diz;
      b.style.background = f.hex;
      b.setAttribute('aria-label', 'cor ' + f.nome + ', ' + f.hex);
      b.setAttribute('aria-current', c.cor === f.nome ? 'true' : 'false');
      b.onclick = function () {
        if (!api.podeEditar()) return;
        api.instantaneo(); c.cor = f.nome; api.remontar();
        api.estado('cor: ' + f.nome + ' (' + f.hex + ') · ' + f.diz, '');
      };
      linha.appendChild(b);
    });
    g.appendChild(api.el('div', 'nativo', 'as cinco fichas do tema'));
    g.appendChild(linha);

    var par = api.el('div', 'par');
    var wt = api.el('div');
    wt.appendChild(api.el('small', null, 'ficha ou hex'));
    var txt = document.createElement('input');
    txt.type = 'text'; txt.value = c.cor == null ? '' : c.cor;
    txt.placeholder = 'barro · #E4572E';
    txt.setAttribute('aria-label', 'cor por nome de ficha ou hex');
    txt.onchange = function () {
      if (!api.podeEditar()) { api.pintarPainel(); return; }
      var v = txt.value.trim();
      api.instantaneo();
      if (!v) delete c.cor; else c.cor = v;
      api.remontar();
    };
    wt.appendChild(txt);
    par.appendChild(wt);
    g.appendChild(par);

    if (c.cor == null) {
      g.appendChild(api.el('div', 'fato',
        'Sem `cor` declarada a camada segue a bandeira do tema (breu no claro).'));
    }

    /* ---- A MEDIÇÃO. Informar, nunca bloquear: quem decide é quem edita,
           e a tela não esconde a consequência. ---- */
    var hx = hexDe(c.cor);
    if (hx) {
      var rB = razao(hx, '#1B1B1F'), rL = razao(hx, '#F6F4EF');
      var med = api.el('div', 'medida');
      med.appendChild(api.el('div', 'mlinha', 'contra breu #1B1B1F : ' + rB.toFixed(2) + ':1'));
      med.appendChild(api.el('div', 'mlinha', 'contra linho #F6F4EF : ' + rL.toFixed(2) + ':1'));
      g.appendChild(api.el('div', 'nativo', 'contraste de ' + hx));
      g.appendChild(med);
      var morre = [];
      if (rB < 1.5) morre.push('sobre o breu');
      if (rL < 1.5) morre.push('sobre o linho');
      if (morre.length) {
        g.appendChild(api.el('div', 'aviso',
          'Esta cor praticamente desaparece ' + morre.join(' e ') + '. Não estou impedindo — ' +
          'se a peça for parar num fundo desses, ela some de verdade.'));
      }
    } else if (c.cor != null) {
      g.appendChild(api.el('div', 'aviso',
        'Não consegui medir `' + c.cor + '` — se não for ficha do tema nem hex, ' +
        'o motor ignora e a camada fica com a cor de bandeira.'));
    }

    fora.push(g);
    return fora;
  }

  /* ==================================================================
     GANCHO 5 · PRÉVIA — o que vai ser pintado num vão, DEPOIS.

     A prévia representa um passo que acontece noutro processo. Ela vai
     POR CIMA de tudo, não no `z` da reserva, porque é isso que reproduz o
     momento certo. E ela NÃO é camada: não se arrasta, não se apaga, não
     entra na declaração nem em export nenhum.
     ================================================================== */
  function previa(c) {
    if (!c || c.t !== 'reserva') return null;
    if (c.k === 'retrato') {
      return { src: './temas/exemplo/assets/retrato.svg', encaixe: 'cover',
               moldura: 4, diz: 'a foto é colada aqui depois do build' };
    }
    if (c.k === 'assinatura') {
      return { src: './temas/exemplo/assets/assinatura.svg', encaixe: 'altura',
               alturaPc: 5.6, alinhar: 'esquerda',
               diz: 'a assinatura é ancorada nesta caixa depois do build' };
    }
    return { nada: 'este vão não tem `k` que o tema saiba preencher (`retrato` ou `assinatura`)' };
  }

  /* ==================================================================
     GANCHO 6 · QUEBRA — o que para de funcionar se esta camada sumir.

     NÃO PROÍBE. Uma peça pode não ter retrato. O que a tela deve é dizer
     o que quebra e ONDE, no momento do gesto — este é o único caso em que
     o estrago é invisível e acontece depois, noutro processo.
     ================================================================== */
  function quebra(c, i, peca) {
    if (!c || c.t !== 'reserva' || !c.k) return null;
    var sobra = (peca.L || []).some(function (x, j) {
      return j !== i && x.t === 'reserva' && x.k === c.k;
    });
    if (sobra) return null;
    return 'esta é a última reserva `' + c.k + '` desta peça — o passo de composição ' +
           'que procura por ela vai parar sem caixa para ancorar';
  }

  /* ==================================================================
     GANCHO 7 · ESTANTE — a biblioteca de assets arrastáveis.

     A REDAÇÃO VEM NA ORDEM VEREDITO → RÓTULO, porque quem chega não
     conhece a taxonomia: "pode usar" antes de "em estoque". E o que NÃO
     se pode usar aparece contado, nunca escondido em silêncio.
     ================================================================== */
  function estante() {
    return [
      { cat: 'marcas', desc: 'sinais gráficos do tema',
        itens: [
          { id: 'losango', nome: 'losango', src: './temas/exemplo/assets/losango.svg',
            w: 200, h: 200, pode: true, cond: 'em uso',
            camada: { t: 'obj', src: './temas/exemplo/assets/losango.svg' } },
          { id: 'assinatura', nome: 'assinatura', src: './temas/exemplo/assets/assinatura.svg',
            w: 420, h: 90, pode: true, cond: 'em uso',
            camada: { t: 'obj', src: './temas/exemplo/assets/assinatura.svg' } }
        ] },
      { cat: 'elementos', desc: 'camadas próprias do tema',
        itens: [
          { id: 'fio-barro', nome: 'fio barro', src: './temas/exemplo/assets/fio.svg',
            w: 400, h: 12, pode: true, cond: 'em uso',
            camada: { t: 'fio', cor: 'barro' } },
          { id: 'selo-anil', nome: 'selo anil', src: './temas/exemplo/assets/selo.svg',
            w: 240, h: 90, pode: true, cond: 'em uso',
            camada: { t: 'selo', cor: 'anil', s: 28, tx: 'novo' } }
        ] },
      { cat: 'fora de circulação', desc: 'ficam à vista para ninguém procurar o que já saiu',
        itens: [
          { id: 'losango-v1', nome: 'losango (versão antiga)',
            src: './temas/exemplo/assets/losango.svg', w: 200, h: 200,
            pode: false, cond: 'aposentado',
            porque: 'substituído pelo `losango` — está aqui só para quem procurar não achar nada e ficar em dúvida' }
        ] }
    ];
  }

  return {
    nome: 'exemplo',
    css: './temas/exemplo/tema.css',
    tipos: tipos,
    campos: campos,
    ordem: ordem,
    rotulo: rotulo,
    painel: painel,
    previa: previa,
    quebra: quebra,
    estante: estante
  };
});
