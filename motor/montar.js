/* =====================================================================
   montar.js — o MOTOR. Declaração → DOM.

   O núcleo conhece QUATRO tipos de camada, e só quatro:

     `tt`      título   — texto, corpo em px do nativo, altura do conteúdo
     `tx`      texto    — idem, papel de leitura
     `obj`     imagem   — `src` relativo à peça, encaixe `contain`
     `reserva` vão      — caixa vazia declarada, que outro processo preenche

   Tudo o mais é TEMA. Um tema declara `tipos: { <t>: função }` e o motor
   chama a função dele para montar aquele nó.

   TIPO DESCONHECIDO NÃO SOME DA TELA. Se a declaração usa `t:'kk'` e nem
   o núcleo nem o tema sabem pintar `kk`, o motor monta uma caixa tracejada
   com o nome do tipo escrito nela. Ela continua sendo camada de verdade:
   entra na contagem, tem geometria, arrasta, redimensiona e grava. O que
   ela NÃO faz é fingir que não existe — camada que desaparece em silêncio
   é o modo de falha que faz alguém apagar trabalho sem saber.

   A PEÇA NÃO ESTÁ PRONTA QUANDO O DOM ESTÁ PRONTO. Imagem carrega depois.
   `pc.__pronto` é a promessa que quem exporta tem de esperar — screenshot
   tirado antes é vão vazio lido como aprovação.
   ===================================================================== */
(function (raiz, definir) {
  'use strict';
  var M = definir();
  if (typeof module === 'object' && module.exports) module.exports = M;
  if (raiz) raiz.MONTAR = M;
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var NUCLEO = { tt: 1, tx: 1, obj: 1, reserva: 1 };
  var TEXTO = { tt: 1, tx: 1 };

  function el(doc, t, cls, css) {
    var e = doc.createElement(t);
    if (cls) e.className = cls;
    if (css) for (var k in css) e.style[k] = css[k];
    return e;
  }

  /* b = [x, y, largura, altura] em % do nativo. `altura: null` = automática:
     o motor NÃO escreve `height`, e a caixa cresce com o conteúdo. */
  function pos(e, b) {
    e.style.left = b[0] + '%';
    e.style.top = b[1] + '%';
    if (b[2] != null) e.style.width = b[2] + '%';
    if (b[3] != null) e.style.height = b[3] + '%';
    return e;
  }
  function px(v) { return v + 'px'; }

  /* O TEXTO ACEITA `<br>`, `<b>`, `<i>` e o marcador `[[assim]]`, e nada
     mais. Não é sanitização de segurança — é vocabulário fechado: o que a
     declaração pode dizer é o que o motor sabe ler, e o editor mostra
     exatamente essa lista no painel. */
  function texto(no, t) {
    no.innerHTML = String(t == null ? '' : t)
      .replace(/\[\[(.+?)\]\]/g, '<span class="mk">$1</span>');
    return no;
  }

  /* ------------------------------------------------------------------ */
  function montar(p, alvo, tema) {
    var doc = (alvo && alvo.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    if (!doc) throw new Error('montar precisa de um document');
    var W = p.w, H = p.h;
    if (!(W > 0) || !(H > 0)) {
      throw new Error('a peça ' + (p.slug || '?') + ' não declara `w`/`h` do nativo');
    }
    var pc = el(doc, 'div', 'pc' + (p.cls ? ' ' + p.cls : ''), { width: px(W), height: px(H) });
    pc.setAttribute('data-slug', p.slug || '');
    var diag = { avisos: [], desconhecidos: [] };
    var pendentes = [];

    (p.L || []).forEach(function (c, i) {
      var b = c.box || [0, 0, 100, 100];
      var e, erroDoTema = null;

      if (NUCLEO[c.t]) {
        switch (c.t) {
          case 'tt':
          case 'tx':
            e = texto(el(doc, 'div', 'ly ' + c.t, {
              fontSize: c.s != null ? px(c.s) : '',
              textAlign: c.al || 'left'
            }), c.tx);
            if (c.lh != null) e.style.lineHeight = c.lh;
            break;

          case 'obj': {
            e = el(doc, 'div', 'ly obj');
            var im = el(doc, 'img', 'fig');
            im.alt = c.alt || '';
            im.src = c.src || '';
            if (c.op != null) im.style.opacity = c.op;
            /* ARQUIVO AUSENTE É ESTADO NOMEADO, não vão mudo. Sem isto a
               imagem que falha fica igualzinha a uma reserva, e as duas
               mentem a mesma coisa por motivos diferentes. */
            pendentes.push(new Promise(function (pronto) {
              if (!c.src) {
                e.classList.add('faltando');
                e.setAttribute('data-faltando', 'sem src declarado');
                diag.avisos.push('camada #' + i + ' (obj) não declara `src`');
                return pronto();
              }
              im.onload = function () { pronto(); };
              im.onerror = function () {
                e.classList.add('faltando');
                e.setAttribute('data-faltando', c.src);
                diag.avisos.push('não achei ' + c.src + ' (camada #' + i + ')');
                pronto();
              };
              if (im.complete) pronto();
            }));
            e.appendChild(im);
            break;
          }

          case 'reserva':
            /* O VÃO. É camada de verdade com geometria declarada e nenhum
               pixel — o lugar que outro processo (composição, impressão,
               foto) preenche depois. Ela existe para ser MEDIDA e MOVIDA. */
            e = el(doc, 'div', 'ly reserva');
            if (c.k) e.setAttribute('data-k', c.k);
            break;
        }
      } else if (tema && tema.tipos && typeof tema.tipos[c.t] === 'function') {
        /* TEMA QUE ESTOURA NÃO DERRUBA A PEÇA. Um bug num tipo do tema é
           bug de UMA camada; deixá-lo propagar mataria a montagem inteira
           e a tela ficaria branca — quem edita concluiria que quebrou o
           editor, quando quem quebrou foi o tema, e numa camada só. A
           camada cai na caixa nomeada com o erro escrito nela, e as outras
           montam. Achado por prova (`provas/estados.js` E1k), não por
           leitura do código. */
        try {
          e = tema.tipos[c.t](c, { doc: doc, W: W, H: H, i: i, el: el, texto: texto,
                                   px: px, pendentes: pendentes, diag: diag });
        } catch (err) {
          e = null;
          erroDoTema = (err && err.message) || String(err);
          diag.avisos.push('o tema estourou ao montar a camada #' + i +
                           ' (`' + c.t + '`): ' + erroDoTema);
        }
        if (!e && !erroDoTema) {
          diag.avisos.push('o tema declara `' + c.t + '` mas não devolveu nó para a camada #' + i);
        }
      }

      if (!e) {
        /* NEM O NÚCLEO NEM O TEMA SABEM PINTAR ISTO — e a resposta certa
           não é sumir. A caixa aparece, tracejada, com o nome do tipo, e o
           painel explica. Ela arrasta e grava como qualquer outra. */
        e = el(doc, 'div', 'ly desconhecido');
        e.setAttribute('data-tipo-desconhecido', c.t == null ? '(sem t)' : String(c.t));
        e.textContent = c.t == null ? 'camada sem `t`' : c.t;
        if (erroDoTema) {
          e.classList.add('quebrou');
          e.setAttribute('data-erro-do-tema', erroDoTema);
          e.textContent = c.t + ' — o tema estourou';
        }
        diag.desconhecidos.push({ i: i, t: c.t, erroDoTema: erroDoTema });
      }

      pos(e, b);
      if (c.z != null) e.style.zIndex = c.z;
      e.setAttribute('data-camada', i);
      pc.appendChild(e);
    });

    if (alvo) { alvo.innerHTML = ''; alvo.appendChild(pc); }
    pc.__diag = diag;
    pc.__pronto = Promise.all(pendentes);
    return pc;
  }

  return { montar: montar, NUCLEO: NUCLEO, TEXTO: TEXTO, pos: pos, texto: texto, el: el };
});
