/* =====================================================================
   texto-camada.js — o vocabulário fechado do texto da camada.

   POR QUE ISTO EXISTE, E POR QUE É CORREÇÃO E NÃO POLIMENTO.

   `motor/montar.js` injeta o `tx` como innerHTML CRU:

       no.innerHTML = String(t).replace(/\[\[(.+?)\]\]/g, '<span class="mk">$1</span>');

   `<br>`, `<b>` e `<i>` funcionam porque SÃO html — e qualquer outra coisa
   funcionaria igual. Enquanto quem escrevia era uma pessoa digitando num
   campo simples, isso era inofensivo. Editando DENTRO da peça (caixa
   in-place), um Ctrl+V de qualquer página despeja html rico direto no
   `tx`, e ele vai parar na peça e no arquivo. Sanear não é acabamento
   desta rodada: é ela.

   O VOCABULÁRIO É FECHADO: `<br>`, `<b>`, `<i>` e o marcador `[[...]]`.
   Tudo o mais que entrar — colagem, atalho do navegador, arrasto — perde a
   MARCAÇÃO e mantém o TEXTO. Some marcação, nunca palavra: quem colou quis
   trazer as palavras, e apagar palavra sem avisar seria pior que o defeito
   que isto conserta. O que foi descartado sai NOMEADO, para a tela poder
   dizer em vez de engolir.

   A MESMA FUNÇÃO SERVE AS DUAS ROTAS — a caixa in-place na peça e um
   campo de texto do painel de um tema. É de propósito: é isso que faz as
   duas concordarem por CONSTRUÇÃO, em vez de por promessa.

   Núcleo, sem vocabulário de marca nenhum.
   ===================================================================== */
(function (raiz) {
  'use strict';

  /* o que o motor faz com o marcador — copiado dele para a caixa mostrar
     exatamente o que a peça mostra */
  function paraCaixa(txt) {
    return String(txt == null ? '' : txt)
      .replace(/\[\[(.+?)\]\]/g, '<span class="mk">$1</span>');
  }

  var PERMITIDAS = /^<(br|\/?b|\/?i)>$/i;

  /* ---- rota do PAINEL: string crua -> string saneada ---- */
  function sanear(txt) {
    var s = String(txt == null ? '' : txt);
    var descartes = [], fora = 0;
    /* troca cada `<...>` que não esteja no vocabulário por `&lt;...`,
       preservando o texto inteiro. `<` solto também escapa. */
    var saida = s.replace(/<[^<>]*>|</g, function (m) {
      if (PERMITIDAS.test(m)) return m.toLowerCase();
      fora++;
      if (m === '<') return '&lt;';
      descartes.push(m.length > 24 ? m.slice(0, 24) + '…' : m);
      return '&lt;' + m.slice(1);
    });
    return { texto: saida, descartes: descartes, fora: fora };
  }

  /* ---- rota da CAIXA: DOM editável -> string da declaração ---- */
  function daCaixa(no) {
    var out = [], descartes = {};
    function anota(n) { descartes[n] = (descartes[n] || 0) + 1; }
    function comoTexto(s) { return String(s).split('<').join('&lt;'); }
    function ehMk(el) {
      var c = ' ' + ((el.getAttribute && el.getAttribute('class')) || '') + ' ';
      return c.indexOf(' mk ') >= 0;
    }
    function anda(n) {
      var f = n.firstChild;
      while (f) {
        if (f.nodeType === 3) { out.push(comoTexto(f.nodeValue)); }
        else if (f.nodeType === 1) {
          var tag = f.tagName.toLowerCase();
          if (tag === 'br') { out.push('<br>'); }
          else if (tag === 'b' || tag === 'strong') {
            if (tag === 'strong') anota('<strong> (virou <b>)');
            out.push('<b>'); anda(f); out.push('</b>');
          } else if (tag === 'i' || tag === 'em') {
            if (tag === 'em') anota('<em> (virou <i>)');
            out.push('<i>'); anda(f); out.push('</i>');
          } else if (tag === 'span' && ehMk(f)) {
            out.push('[['); anda(f); out.push(']]');
          } else {
            /* FORA DO VOCABULÁRIO: some a marcação, fica a palavra.
               `div`/`p` viram quebra porque é isso que eles significavam
               na origem — colar duas linhas tem de continuar duas linhas. */
            anota('<' + tag + '>');
            if ((tag === 'div' || tag === 'p') && out.length &&
                out[out.length - 1] !== '<br>') out.push('<br>');
            anda(f);
          }
        }
        f = f.nextSibling;
      }
    }
    anda(no);
    var txt = out.join('');
    /* o navegador põe um `<br>` de enchimento numa caixa vazia; ele não é
       quebra que alguém pediu */
    if (txt === '<br>') txt = '';
    var lista = Object.keys(descartes).map(function (k) {
      return k + (descartes[k] > 1 ? ' ×' + descartes[k] : '');
    });
    /* passa pela MESMA cerca do painel: uma verdade só */
    var s = sanear(txt);
    return { texto: s.texto, descartes: lista.concat(s.descartes) };
  }

  var API = { paraCaixa: paraCaixa, sanear: sanear, daCaixa: daCaixa,
              PERMITIDAS: PERMITIDAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.TEXTO_CAMADA = API;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
