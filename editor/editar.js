/* =====================================================================
   editar.js — manipulação direta sobre a peça já montada.

   O QUE ESTA TELA É. `motor/montar.js` já aplica `box:[x,y,l,a]` em % do
   nativo sobre a peça. Arrastar é escrever dois números; redimensionar é
   escrever dois; trocar corpo é escrever um. O mecanismo existia inteiro —
   o que faltava era a ALÇA. Esta tela é a alça, e nada além dela: não
   desenha forma nova, não inventa mecanismo, não decide composição.

   AS QUATRO DECISÕES QUE MANDAM AQUI

   1. A PEÇA NA TELA É SEMPRE `MONTAR.montar()`. Ao soltar o mouse, a peça
      inteira é REMONTADA a partir da declaração editada — o mesmo caminho
      de código que qualquer outro consumidor usa. Não existe um "render do
      editor" que possa divergir do render de verdade: o que se vê depois
      de cada gesto é o que a declaração produz. É a ida-e-volta embutida
      na interação, não um teste à parte.

   2. CAMADA DE TEXTO NÃO TEM ALTURA, E POR ISSO NÃO GANHA ALÇA DE ALTURA.
      A altura nasce do conteúdo, e o motor nem escreve `height` quando o
      valor é nulo. Uma alça no rodapé dessas camadas seria uma alça que
      mente: ou não faz nada, ou grava uma altura fixa. Então elas
      redimensionam só em LARGURA, e o painel DIZ por quê em vez de deixar
      a pessoa descobrir no puxão.

   3. NADA É PRESO DENTRO DO QUADRO. Sangrar é recurso de composição, não
      acidente. Prender a caixa em 0..100 quebraria declaração legítima. O
      que se deve não é impedir — é tornar VISÍVEL (marcação tracejada,
      aviso no painel, e a camada continuando alcançável pela lista mesmo
      quando some do quadro).

   4. TIPO QUE O TEMA NÃO DECLAROU NÃO SOME. Ele vira caixa nomeada, com o
      painel dizendo exatamente isso, e continua arrastável e gravável.
      Camada que desaparece em silêncio faz alguém apagar trabalho sem
      saber que apagou.

   O TEMA ENTRA POR SETE GANCHOS e por nenhum outro lugar, mais uma chave
   opcional fora dos sete — `textoInPlace` (achado F1b/F2, 2026-09-17):
   QUAIS TIPOS abrem a caixa in-place ao duplo-clique é decisão do
   VOCABULÁRIO do projeto, não do núcleo. `{tt:1,tx:1}` era fixo aqui —
   um projeto real tem `kk`/`no` como texto (mono e nó-com-rótulo) e o
   núcleo não tinha como saber disso. Sem a chave, o padrão continua sendo
   exatamente `tt`/`tx` (nenhum tema hoje quebra). `window.TEMA` ausente =
   editor funcional com os quatro tipos do núcleo. Nada aqui conhece cor,
   família ou marca de projeto nenhum.
   ===================================================================== */
'use strict';
(function () {

  var TEMA = (typeof window !== 'undefined' && window.TEMA) || null;
  var NUCLEO = { tt: 1, tx: 1, obj: 1, reserva: 1 };
  var TEXTO_DO_TEMA = (TEMA && Array.isArray(TEMA.textoInPlace)) ? TEMA.textoInPlace : null;
  var TEXTO = { tt: 1, tx: 1 };
  if (TEXTO_DO_TEMA) {
    TEXTO = {};
    TEXTO_DO_TEMA.forEach(function (t) { if (typeof t === 'string' && t) TEXTO[t] = 1; });
  }
  var GLOSA = { tt: 'título', tx: 'texto', obj: 'imagem', reserva: 'vão' };

  function trecho(s, n) {
    var t = String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
      .replace(/\[\[(.+?)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  /* O RÓTULO. "camada 5" derrota a tarefa: quem edita precisa saber que
     está mexendo no texto de apoio e não no fio atrás dele. O tipo cru da
     declaração fica SEMPRE visível — é por ele que se acha a linha no
     arquivo — e a glosa vem ao lado para quem está olhando a composição.
     O tema pode dar um rótulo melhor; se ele não der, ou der um rótulo
     incompleto, o núcleo completa. Nunca fica sem. */
  function rotulo(c, i) {
    var r = null;
    if (TEMA && typeof TEMA.rotulo === 'function') {
      try { r = TEMA.rotulo(c, i); } catch (e) { r = null; }
    }
    if (r && r.titulo) {
      return { titulo: r.titulo, corpo: r.corpo || '', glosa: r.glosa || GLOSA[c.t] || c.t };
    }
    return rotuloGenerico(c, i);
  }
  function rotuloGenerico(c, i) {
    var base = '#' + i + ' · ' + (c.t == null ? '(sem t)' : c.t);
    if (TEXTO[c.t]) {
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
    if (c.tx != null) return { titulo: base, corpo: '“' + trecho(c.tx, 30) + '”', glosa: c.t };
    return { titulo: base, corpo: '', glosa: c.t || 'sem tipo' };
  }

  /* uma camada é de texto para o EDITOR quando ela declara `tx`. Vale para
     tipo do núcleo e para tipo do tema — quem tem texto ganha o campo de
     texto, quem não tem não ganha campo que não faz nada. */
  function temTexto(c) { return TEXTO[c.t] || (c && c.tx != null); }
  function conhecido(c) {
    return !!NUCLEO[c.t] || !!(TEMA && TEMA.tipos && typeof TEMA.tipos[c.t] === 'function');
  }

  /* ---------------------------------------------------------------- */
  var UI = {};
  /* DUAS LINHAS DE BASE, COM TRABALHOS DIFERENTES — e confundi-las é o
     jeito de errar aqui.
     · `orig`    = a peça como ela estava NA CHEGADA. É a rede: `Descartar
                   tudo` volta pra cá, e é contra ela que o ponto de sujo
                   da lista é calculado.
     · `noDisco` = o que a última escrita bem-sucedida deixou no arquivo.
                   É contra ela que se calcula o que MANDAR. Sem esta, com
                   escrita contínua, `Descartar tudo` viraria uma lista de
                   edições VAZIA (L voltou a ser igual a orig) e o disco
                   ficaria com os valores velhos — a rede furada bem no
                   ponto em que ela é a única que existe. */
  var E = {
    usos: [], campos: ['box', 's', 'lh', 'tx', 't', 'src'], problemas: [],
    slug: null, uso: null, L: null, orig: null, noDisco: null, arq: null,
    sel: -1, k: 1, pc: null, nos: null, zoom: null,
    hist: [], futuro: [], hash: null, somenteLeitura: null,
    ciclo: { x: -9e9, y: -9e9, n: 0 }, arrastando: null,
    auto: true, timer: null, salvando: false, refila: false,
    bloqueio: null, ultimoSalvo: null, lendo: false, deMemoria: false,
    avisoGesto: null, guias: [], previasFalhas: [], podeGerar: false
  };

  var $ = function (s) { return document.querySelector(s); };
  function el(t, cls, txt) {
    var e = document.createElement(t);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function pct(v) {
    var r = Math.round(v * 10) / 10;
    return (Object.is(r, -0) ? 0 : r);
  }

  /* ================================================================== */
  /* ESTADO NA TELA. Nenhum estado é mudo: cada um diz o que houve E o que
     fazer. `tom` colore o rodapé; `aria-live` faz o leitor de tela contar
     a mesma história que o olho.                                        */
  function estado(msg, tom) {
    UI.estado.className = tom || '';
    UI.estado.textContent = msg;
  }

  /* ONDE ESTE EDITOR ESTÁ RODANDO, DITO PELA PÁGINA E NÃO PELO PALPITE.
     As mensagens de estado degradado mandavam a pessoa subir
     `node editor/servir.js 8811` com a porta escrita à mão. A CLI desloca
     a porta sozinha quando 8811 está ocupada — então, exatamente no caso
     em que a porta padrão não estava livre, a saída oferecida apontava
     para o lugar errado. Instrução que manda pra porta errada é pior que
     instrução nenhuma: ela gasta a confiança de quem seguiu.

     Três situações, três respostas, e nenhuma delas inventa número:
       · servida por http com porta   → o endereço REAL, lido de `location`
       · servida na 80/443            → o `origin`, sem porta pendurada
       · aberta como `file://`        → não há servidor atrás disto, e é
                                        isso que a mensagem tem de dizer   */
  function ondeEstou() {
    if (location.protocol === 'file:') return null;
    return location.origin;
  }
  function comoSubir() {
    var onde = ondeEstou();
    if (onde == null) {
      return 'esta página foi aberta direto do disco (`file://`), então não há servidor ' +
             'nenhum atrás dela. Rode `npx editorhtml abrir` e use o endereço que ele imprimir';
    }
    return 'o servidor desta página é ' + onde + ' — se ele caiu, suba de novo com ' +
           '`npx editorhtml servir` (ele escolhe a porta e imprime o endereço) e volte para cá';
  }

  function cartaz(titulo, texto, acao) {
    UI.cartaz.hidden = false;
    UI.envelope.hidden = true;
    UI.cartaz.innerHTML = '';
    UI.cartaz.appendChild(el('b', null, titulo));
    UI.cartaz.appendChild(el('div', null, texto));
    if (acao) {
      var w = el('div', 'acao');
      var b = el('button', null, acao.rotulo);
      b.onclick = acao.fn;
      w.appendChild(b);
      UI.cartaz.appendChild(w);
    }
  }
  function semCartaz() { UI.cartaz.hidden = true; UI.envelope.hidden = false; }

  /* ==================================================================
     PRÉVIA — mostrar o que vai ser pintado num vão, DEPOIS.

     A reserva é a caixa que outro processo preenche em cima da peça já
     construída. Nada disso está no DOM que o motor monta, então sem
     prévia o editor mostra um retângulo vazio e quem compõe compõe às
     cegas justamente no maior elemento da peça.

     A PRÉVIA NÃO É CAMADA. Não se arrasta, não se apaga, não entra na
     declaração nem em export nenhum — ela é marcada com `data-previa` e
     FILTRADA do mapa camada→nó, senão o editor perderia o endereço das
     camadas e cairia em somente-leitura.

     E ELA VAI POR CIMA DE TUDO, não no `z` da reserva: o passo que ela
     representa acontece sobre a peça pronta, e é esse momento que ela
     reproduz.
     ================================================================== */
  var Z_PREVIA = 9000;

  function previaDe(c) {
    if (!c || c.t !== 'reserva') return null;
    if (!TEMA || typeof TEMA.previa !== 'function') return null;
    try { return TEMA.previa(c); } catch (e) { return { nada: 'o tema quebrou ao calcular a prévia: ' + e.message }; }
  }

  function pintarPrevias(pc) {
    var W = E.uso.w, H = E.uso.h;
    E.previasFalhas = [];
    (E.L || []).forEach(function (c, i) {
      var p = previaDe(c);
      if (!p || p.nada || !p.src || !c.box) return;
      var b = c.box;
      var rx = W * b[0] / 100, ry = H * b[1] / 100;
      var rw = W * (b[2] == null ? 100 : b[2]) / 100;
      var rh = H * (b[3] == null ? 100 : b[3]) / 100;

      var cx = el('div', 'previa');
      cx.dataset.previa = p.encaixe || 'cover';
      cx.dataset.camada = i;
      cx.style.left = rx + 'px'; cx.style.top = ry + 'px';
      cx.style.width = rw + 'px'; cx.style.height = rh + 'px';
      cx.style.zIndex = Z_PREVIA;

      var im = document.createElement('img');
      im.alt = ''; im.src = p.src;
      /* ARQUIVO-FONTE AUSENTE É ESTADO NOMEADO, não vão mudo: sem isto a
         prévia que falha fica igualzinha à reserva sem prévia, e as duas
         mentem a mesma coisa por motivos diferentes. */
      im.onerror = function () {
        cx.classList.add('previa-faltando');
        cx.title = 'não achei ' + p.src;
        E.previasFalhas.push({ camada: i, src: p.src });
        if (E.sel === i) pintarPainel();
      };

      if (p.encaixe === 'altura') {
        cx.classList.add('previa-livre');
        var alvoH = (p.alturaPc || 6) / 100 * H;
        var PAD = (p.padPc == null ? 2 : p.padPc) / 100 * W;
        im.onload = function () {
          var alvoW = alvoH * (im.naturalWidth / im.naturalHeight);
          var x = p.alinhar === 'centro' ? (rw - alvoW) / 2 : PAD;
          var y = (rh - alvoH) / 2;
          im.style.width = alvoW + 'px'; im.style.height = alvoH + 'px';
          im.style.left = x + 'px'; im.style.top = y + 'px';
        };
      } else {
        cx.classList.add('previa-cover');
        if (p.moldura) {
          cx.style.outlineWidth = p.moldura + 'px';
          cx.style.outlineOffset = (-p.moldura / 2) + 'px';
        }
      }
      cx.appendChild(im);
      pc.appendChild(cx);
    });
  }

  /* ================================================================== */
  /* MONTAR. Sempre pelo caminho de verdade.                             */
  function remontar(preservarSel) {
    var alvo = E.sel;
    UI.palco.innerHTML = '';
    var p = Object.assign({}, E.uso, { L: E.L });
    var pc;
    try {
      pc = MONTAR.montar(p, UI.palco, TEMA);
    } catch (err) {
      /* DECLARAÇÃO ILEGAL GRITA POR EXCEÇÃO, e aqui isso vira relatório na
         tela com a edição continuando desfazível — travar o editor com a
         peça inválida seria prender a pessoa num beco sem saída que ela
         mesma acabou de criar. */
      cartaz('a peça não montou com esta edição',
        ((err && err.message) || String(err)) +
        ' — desfaça o último gesto (Ctrl+Z) para voltar ao que montava.',
        { rotulo: '↶ Desfazer o último gesto', fn: desfazer });
      estado('montagem falhou: ' + ((err && err.message) || err), 'erro');
      /* a mutação JÁ aconteceu antes da montagem falhar — os botões têm de
         refletir isso, senão o Desfazer que a saída oferece chega desligado */
      atualizarBotoes();
      return false;
    }
    semCartaz();
    E.pc = pc;

    pintarPrevias(pc);
    /* O MAPA CAMADA→NÓ. Se o motor acrescentar nós que a declaração não
       tem, a contagem deixa de bater, o índice deixa de endereçar, e eu
       NÃO adivinho: a peça vira somente-leitura com o motivo dito.
       A PRÉVIA NÃO CONTA COMO CAMADA — sem este filtro ela sozinha
       derrubaria o editor para somente-leitura. */
    var filhos = [].slice.call(pc.children).filter(function (n) {
      return !n.dataset || n.dataset.previa == null;
    });
    if (filhos.length !== E.L.length) {
      E.nos = null;
      E.somenteLeitura = 'esta peça monta ' + filhos.length + ' nós para ' + E.L.length +
        ' camadas declaradas — o motor acrescentou nó por conta própria e o índice ' +
        'deixa de endereçar com segurança. Só leitura.';
    } else {
      E.nos = filhos;
    }

    pc.__pronto.then(function () {
      /* SÓ ANUNCIA NA CHEGADA. Este `then` é assíncrono e chega DEPOIS da
         mensagem do gesto — deixá-lo escrever sempre apagaria "movida: #6
         …" e escreveria "peça montada", que é verdade inútil no meio de
         uma edição. Feedback de ação não pode ser sobrescrito por feedback
         de infraestrutura. */
      if (E.anunciarMontagem) {
        E.anunciarMontagem = false;
        estado('peça montada · ' + E.L.length + ' camadas · clique numa para começar', '');
      }
      desenharMarcas();
    }, function (err) {
      estado('nem tudo terminou de carregar: ' + (err && err.message) +
             ' — os números continuam válidos, mas pode haver vão vazio na tela', 'alerta');
    });

    escalar();
    if (preservarSel !== false) E.sel = alvo;
    desenharMarcas();
    pintarLista();
    pintarPainel();
    /* O CHIP E OS BOTÕES SÃO DERIVADOS, E TÊM DE SER RECALCULADOS AQUI.
       `remontar()` é o funil por onde TODA mutação passa — arrasto, alça,
       campo do painel, textarea, seta do teclado, desfazer, descartar — e
       por isso a cura mora aqui, uma vez, em vez de espalhada por sete
       chamadores que a próxima rota nova esqueceria de novo. */
    atualizarBotoes();
    agendarSalvar();
    return true;
  }

  function escalar() {
    var W = E.uso.w, H = E.uso.h;
    var caixa = UI.meio.getBoundingClientRect();
    var k = Math.min((caixa.width - 64) / W, (caixa.height - 64) / H, 1);
    if (!(k > 0)) k = 0.2;
    E.k = k;
    UI.envelope.style.width = (W * k) + 'px';
    UI.envelope.style.height = (H * k) + 'px';
    UI.zoom.style.width = W + 'px';
    UI.zoom.style.height = H + 'px';
    /* k===1 NÃO VIRA `scale(1)`. Matematicamente é a identidade, mas
       `transform` abre uma camada de composição (GPU) — a revisão F2
       apontou isto como causa do palco 1:1 não bater com `montar.html`.
       MEDIDO DE NOVO depois desta cura sozinha (provas/… não — medição
       avulsa, ver retorno F1b): o diff não mudou (726979 → 726980 em
       1.440.000, convite). Ou seja, o transform incondicional era um
       defeito real — layout numa camada de composição continua errado
       em princípio — mas NÃO era a causa do tamanho do diff medido.
       Mantido corrigido pelo motivo próprio, e a causa de verdade é a
       de baixo. */
    UI.zoom.style.transform = (k === 1) ? 'none' : 'scale(' + k + ')';
    UI.marcas.style.width = (W * k) + 'px';
    UI.marcas.style.height = (H * k) + 'px';

    /* A CAUSA DE VERDADE: `#meio{display:grid;place-items:center}` centra
       `#envelope` por `(espaço-livre)/2`, que cai em MEIO PIXEL sempre que
       a sobra é ímpar. Meio pixel de deslocamento muda em qual pixel
       físico cada borda antialiasa — texto, o corte diagonal da cunha,
       qualquer linha fina — e o palco para de bater com `montar.html`,
       que nasce em (0,0) inteiro por `body{margin:0}` + `display:
       inline-block`. Medido: `getBoundingClientRect().top` do envelope
       saía em `.5` (356.5, 206.5...) nos dois formatos testados.
       A cura não mexe no CSS de centralização (ela é o comportamento
       CERTO até a fração) — mede DEPOIS do layout e encaixa o envelope
       no pixel inteiro mais próximo com uma correção de `transform`
       pequena o bastante para não mover nada visível. */
    UI.envelope.style.transform = '';
    var r = UI.envelope.getBoundingClientRect();
    var dx = Math.round(r.left) - r.left;
    var dy = Math.round(r.top) - r.top;
    if (dx || dy) UI.envelope.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }

  /* retângulo da camada em px do NATIVO. Para texto isso vem do RENDER
     (a altura é do conteúdo); para o resto é a caixa declarada. Ler do nó
     é o que mantém a marcação honesta nos dois casos.                   */
  function retangulo(i) {
    var c = E.L[i], W = E.uso.w, H = E.uso.h;
    if (E.nos && E.nos[i]) {
      var n = E.nos[i];
      return { x: n.offsetLeft, y: n.offsetTop, l: n.offsetWidth, a: n.offsetHeight };
    }
    var b = c.box || [0, 0, 100, 100];
    return { x: W * b[0] / 100, y: H * b[1] / 100,
             l: W * (b[2] == null ? 100 : b[2]) / 100,
             a: H * (b[3] == null ? 100 : b[3]) / 100 };
  }

  function foraDoQuadro(i) {
    var r = retangulo(i), W = E.uso.w, H = E.uso.h;
    if (r.x >= W || r.y >= H || r.x + r.l <= 0 || r.y + r.a <= 0) return 'inteira';
    if (r.x < 0 || r.y < 0 || r.x + r.l > W || r.y + r.a > H) return 'parcial';
    return null;
  }

  /* ================================================================== */
  /* MARCAÇÃO. Vive FORA do recorte da peça, para camada arrastada para
     fora continuar visível e recuperável com o mouse.                  */
  var ALCAS_TEXTO = ['w', 'e'];
  var ALCAS_CHEIA = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  /* alça de altura só onde a altura EXISTE na declaração. Numa camada de
     altura automática ela seria uma alça que mente. */
  function alcasDe(c) {
    var semAltura = (c.box || [])[3] == null;
    return (temTexto(c) && semAltura) ? ALCAS_TEXTO : ALCAS_CHEIA;
  }

  function desenharMarcas() {
    UI.marcas.innerHTML = '';
    if (!E.L || E.sel < 0 || E.sel >= E.L.length) return;
    var i = E.sel, c = E.L[i], r = retangulo(i), k = E.k;
    var fora = foraDoQuadro(i);

    var m = el('div', 'marca' + (fora ? ' fora' : '') + (invisivel(i) ? ' invisivel' : ''));
    m.style.left = (r.x * k) + 'px'; m.style.top = (r.y * k) + 'px';
    m.style.width = Math.max(2, r.l * k) + 'px'; m.style.height = Math.max(2, r.a * k) + 'px';
    UI.marcas.appendChild(m);

    if (!E.somenteLeitura) {
      alcasDe(c).forEach(function (d) {
        var h = el('div', 'alca ' + d);
        var px = { w: 0, e: 1, n: .5, s: .5, nw: 0, ne: 1, sw: 0, se: 1 };
        var py = { w: .5, e: .5, n: 0, s: 1, nw: 0, ne: 0, sw: 1, se: 1 };
        h.style.left = ((r.x + r.l * px[d]) * k - 5.5) + 'px';
        h.style.top = ((r.y + r.a * py[d]) * k - 5.5) + 'px';
        h.dataset.dir = d;
        UI.marcas.appendChild(h);
      });
    }
    desenharGuias();
    leitura(i, r);
  }

  /* OS NÚMEROS APARECEM ENQUANTO SE ARRASTA. Um editor que só mostra a
     peça mexendo esconde justamente a grandeza que está sendo editada.  */
  function leitura(i, r) {
    var c = E.L[i], b = c.box || [0, 0, 100, 100], k = E.k;
    var d = el('div', 'leitura');
    var alt = b[3] == null ? 'auto ' + Math.round(r.a) + 'px' : pct(b[3]) + '%';
    d.textContent = 'x ' + pct(b[0]) + '%  y ' + pct(b[1]) + '%   l ' +
      (b[2] == null ? '100' : pct(b[2])) + '%  a ' + alt +
      '   ·   ' + Math.round(r.x) + ' · ' + Math.round(r.y) + ' px   ' +
      Math.round(r.l) + '×' + Math.round(r.a) + ' px';
    var topo = r.y * k - 26;
    d.style.left = Math.max(0, r.x * k) + 'px';
    d.style.top = (topo < 0 ? r.y * k + r.a * k + 6 : topo) + 'px';
    UI.marcas.appendChild(d);
  }

  /* uma camada pode ser INVISÍVEL por natureza: a reserva não imprime
     nada. Clicaria-se e não se acharia nada — a hachura na marcação é o
     que conta essa verdade sem mudar um pixel da peça. */
  function invisivel(i) { return E.L[i].t === 'reserva' || !!vazia(i); }

  /* CAMADA QUE NÃO IMPRIME NADA — e a tela não pode tratar isso como
     rotina. Apagar o texto de uma camada é edição legítima, e eu não
     proíbo; o que não pode é a camada sumir da peça em silêncio. Camada
     de texto vazia monta com altura zero e sai assim no próximo build. */
  function vazia(i) {
    var c = E.L[i];
    if (temTexto(c)) {
      var t = String(c.tx == null ? '' : c.tx).replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/g, '');
      if (!t) return 'sem texto — não imprime nada e não ocupa altura';
    }
    var r = retangulo(i);
    if (r.a < 1 || r.l < 1) return 'não ocupa espaço na peça (' +
      Math.round(r.l) + '×' + Math.round(r.a) + ' px)';
    return null;
  }

  /* ================================================================== */
  /* ESCOLHER A CAMADA. Ordem de PINTURA, não ordem de DOM: elemento
     posicionado empilha por z-index e, em empate, por ordem no documento.
     Usar a ordem do DOM inverteria a pilha em qualquer peça que use `z`. */
  function ordemDePintura() {
    return E.L.map(function (c, i) { return { i: i, z: (c.z == null ? 0 : +c.z) }; })
      .sort(function (a, b) { return (a.z - b.z) || (a.i - b.i); });
  }

  function candidatos(nx, ny) {
    return ordemDePintura().filter(function (o) {
      var r = retangulo(o.i);
      return nx >= r.x && nx <= r.x + r.l && ny >= r.y && ny <= r.y + r.a;
    }).map(function (o) { return o.i; });
  }

  /* QUEM O PRESSIONAR ESCOLHE — e o ciclo NÃO acontece aqui. Ciclar no
     `pointerdown` fazia o segundo aperto descer a pilha e arrastar a
     camada de baixo: a tela movia uma camada diferente da que estava
     marcada e da que estava debaixo do dedo, que é o defeito exato que a
     marcação existe pra impedir. A regra certa: se o ponto está dentro do
     que já está marcado, mantém — apertar em cima do que está marcado é
     intenção de ARRASTAR, sempre. */
  function escolherPressionar(nx, ny) {
    var c = candidatos(nx, ny);
    if (!c.length) return -1;
    if (E.sel >= 0 && c.indexOf(E.sel) >= 0) return E.sel;
    E.ciclo.n = 0; E.ciclo.x = nx; E.ciclo.y = ny;
    return c[c.length - 1];
  }

  /* O CICLO MORA NO CLIQUE SEM ARRASTO, no soltar. Clicar de novo no mesmo
     ponto desce um degrau da pilha — sem isso, camada coberta por uma
     caixa de texto grande fica inalcançável pelo mouse. Arrastar nunca
     cicla. */
  function ciclarNoPonto(nx, ny) {
    var c = candidatos(nx, ny);
    if (c.length < 2) return;
    var mesmo = Math.abs(nx - E.ciclo.x) < 4 && Math.abs(ny - E.ciclo.y) < 4;
    E.ciclo.n = mesmo ? (E.ciclo.n + 1) % c.length : 0;
    E.ciclo.x = nx; E.ciclo.y = ny;
    var i = c[c.length - 1 - E.ciclo.n];
    if (i !== E.sel) {
      marcar(i);
      estado(estadoDaMarca(i) + '  ·  clique de novo para descer para a de baixo (' +
        (E.ciclo.n + 1) + ' de ' + c.length + ' neste ponto)', '');
    }
  }

  function estadoDaMarca(i) {
    var r = rotulo(E.L[i], i);
    return 'marcado: ' + r.titulo + ' · ' + r.glosa + (r.corpo ? ' · ' + r.corpo : '');
  }

  function pontoNativo(ev) {
    var cx = UI.marcas.getBoundingClientRect();
    return { x: (ev.clientX - cx.left) / E.k, y: (ev.clientY - cx.top) / E.k };
  }

  /* ==================================================================
     GUIAS DE ALINHAMENTO.

     A FONTE DE ALINHAMENTO É A PRÓPRIA PEÇA ABERTA, nunca uma tabela
     nossa. Um editor genérico não sabe qual é a margem do seu projeto —
     gravar um valor global aqui seria pôr na ferramenta uma lei que o
     projeto não escreveu. Então os alvos são: as outras camadas desta
     peça, e as bordas e o centro do quadro. Mais nada.

     GRUDAR ESCREVE O VALOR EXATO DO VIZINHO, não um valor perto dele.
     Quem escreve à mão escreve `6`, `13`, `88`; o arrasto escreve `14.8`,
     `16.3`, `6.1`. Um guia que dissesse "alinhado" com 6.03 contra 6
     mentiria uma fração de px no nativo: invisível na tela, visível no
     4× e no papel. Por isso o alvo carrega o NÚMERO DECLARADO do vizinho
     e é ele que vai pro box.

     O QUE NÃO SE OFERECE, E POR QUÊ. Alinhar pela BASE de uma camada de
     altura automática usaria altura RENDERIZADA — o número gravado
     passaria a depender de um texto que muda amanhã, e o alinhamento se
     desfaria sozinho sem ninguém mexer nele. Base só entra quando a
     camada DECLARA altura.

     E A GRUDE É ESCAPÁVEL (Alt), porque composição sangra de propósito.
     Grude que brigasse com o sangramento brigaria com a peça.
     ================================================================== */
  var TOL_PX = 7;                    /* tolerância em px de TELA */

  function alvosDeAlinhamento(excluir) {
    var v = [], h = [];
    v.push({ val: 0, rot: 'borda esquerda do quadro' });
    v.push({ val: 50, rot: 'centro do quadro' });
    v.push({ val: 100, rot: 'borda direita do quadro' });
    h.push({ val: 0, rot: 'topo do quadro' });
    h.push({ val: 50, rot: 'meio do quadro' });
    h.push({ val: 100, rot: 'base do quadro' });
    E.L.forEach(function (c, j) {
      if (j === excluir) return;
      var b = c.box; if (!b) return;
      var r = rotulo(c, j), nome = r.titulo + (r.corpo ? ' · ' + trecho(r.corpo, 18) : '');
      var larg = b[2] == null ? 100 : b[2];
      v.push({ val: b[0], rot: 'esquerda de ' + nome });
      v.push({ val: b[0] + larg, rot: 'direita de ' + nome });
      h.push({ val: b[1], rot: 'topo de ' + nome });
      if (b[3] != null) h.push({ val: b[1] + b[3], rot: 'base de ' + nome });
    });
    /* VÁRIAS CAMADAS COMPARTILHAM O MESMO VALOR. Nomear só a primeira
       responde a pergunta errada: quem arrasta queria saber se a caixa
       alinha com O TÍTULO, e o guia dizia "esquerda de #3 · fio", que é
       verdade e não é a resposta. Aqui o alvo junta os que coincidem e diz
       quantos são. */
    return { v: juntar(v), h: juntar(h) };
  }
  function juntar(lista) {
    var porVal = {};
    lista.forEach(function (t) {
      var k = String(t.val);
      if (!porVal[k]) porVal[k] = { val: t.val, rots: [] };
      porVal[k].rots.push(t.rot);
    });
    return Object.keys(porVal).map(function (k) {
      var g = porVal[k];
      return { val: g.val,
        rot: g.rots.length === 1 ? g.rots[0]
           : (g.rots[0] + '  +' + (g.rots.length - 1) + ' na mesma linha') };
    });
  }

  function melhorGrude(arestas, alvos, tolPc) {
    var melhor = null;
    arestas.forEach(function (a) {
      alvos.forEach(function (t) {
        var d = Math.abs(a.pos - t.val);
        if (d > tolPc) return;
        if (!melhor || d < melhor.d) melhor = { d: d, alvo: t, aresta: a };
      });
    });
    return melhor;
  }

  function grudar(n, c, i, dir, livre) {
    E.guias = [];
    if (livre) return;                       /* Alt: passa reto */
    var W = E.uso.w, H = E.uso.h;
    var tolV = TOL_PX / E.k / W * 100;
    var tolH = TOL_PX / E.k / H * 100;
    var A = alvosDeAlinhamento(i);
    var larg = n[2] == null ? 100 : n[2];

    var arestasV;
    if (!dir) {
      arestasV = [{ pos: n[0], lado: 'esq' }, { pos: n[0] + larg, lado: 'dir' }];
    } else if (dir.indexOf('w') >= 0) {
      arestasV = [{ pos: n[0], lado: 'esq' }];
    } else if (dir.indexOf('e') >= 0) {
      arestasV = [{ pos: n[0] + larg, lado: 'dir' }];
    } else { arestasV = []; }
    var gv = melhorGrude(arestasV, A.v, tolV);
    if (gv) {
      if (!dir) {
        n[0] = gv.aresta.lado === 'esq' ? gv.alvo.val : (gv.alvo.val - larg);
      } else if (gv.aresta.lado === 'esq') {
        var dirPos = n[0] + larg;
        n[0] = gv.alvo.val; n[2] = Math.max(0.5, dirPos - n[0]);
      } else {
        n[2] = Math.max(0.5, gv.alvo.val - n[0]);
      }
      E.guias.push({ eixo: 'v', val: gv.alvo.val, rot: gv.alvo.rot });
    }

    var alt = n[3];
    var arestasH;
    if (!dir) {
      arestasH = [{ pos: n[1], lado: 'topo' }];
      if (alt != null) arestasH.push({ pos: n[1] + alt, lado: 'base' });
    } else if (dir.indexOf('n') >= 0 && alt != null) {
      arestasH = [{ pos: n[1], lado: 'topo' }];
    } else if (dir.indexOf('s') >= 0 && alt != null) {
      arestasH = [{ pos: n[1] + alt, lado: 'base' }];
    } else { arestasH = []; }
    var gh = melhorGrude(arestasH, A.h, tolH);
    if (gh) {
      if (!dir) {
        n[1] = gh.aresta.lado === 'topo' ? gh.alvo.val : (gh.alvo.val - alt);
      } else if (gh.aresta.lado === 'topo') {
        var basePos = n[1] + alt;
        n[1] = gh.alvo.val; n[3] = Math.max(0.5, basePos - n[1]);
      } else {
        n[3] = Math.max(0.5, gh.alvo.val - n[1]);
      }
      E.guias.push({ eixo: 'h', val: gh.alvo.val, rot: gh.alvo.rot });
    }
  }

  function desenharGuias() {
    (E.guias || []).forEach(function (g) {
      var W = E.uso.w, H = E.uso.h, k = E.k;
      var l = el('div', 'guia ' + g.eixo);
      if (g.eixo === 'v') { l.style.left = (W * g.val / 100 * k) + 'px'; }
      else { l.style.top = (H * g.val / 100 * k) + 'px'; }
      UI.marcas.appendChild(l);
      /* A TELA DIZ EM QUE GRUDOU — "esquerda de #4 · título", nunca uma
         linha rosa anônima. Guia sem nome obriga a pessoa a adivinhar o
         que a ferramenta decidiu por ela. */
      var t = el('div', 'guia-rot', g.rot + ' · ' + pct(g.val) + '%');
      if (g.eixo === 'v') {
        t.style.left = (W * g.val / 100 * k + 5) + 'px';
        t.style.top = '4px';
      } else {
        t.style.top = (H * g.val / 100 * k + 5) + 'px';
        t.style.left = '5px';
      }
      UI.marcas.appendChild(t);
    });
  }

  /* ================================================================== */
  /* ARRASTAR E REDIMENSIONAR                                            */
  function iniciarGesto(ev, dir, pClique) {
    /* com a escrita recusada, arrastar produz trabalho que não vai pro
       disco — deixar mexer seria fabricar a confusão que o bloqueio existe
       pra evitar */
    if (E.bloqueio) return;
    if (E.somenteLeitura) return;
    if (E.sel < 0) return;
    var c = E.L[E.sel];
    var b = (c.box || [0, 0, 100, 100]).slice();
    var p0 = pontoNativo(ev);
    var W = E.uso.w, H = E.uso.h;
    var no = E.nos && E.nos[E.sel];

    E.arrastando = { dir: dir, b0: b, p0: p0, mexeu: false };
    instantaneo();
    UI.marcas.setPointerCapture && UI.marcas.setPointerCapture(ev.pointerId);

    function mover(e2) {
      var p = pontoNativo(e2);
      var dx = (p.x - p0.x) / W * 100, dy = (p.y - p0.y) / H * 100;
      if (!E.arrastando.mexeu && Math.abs(p.x - p0.x) < 1 && Math.abs(p.y - p0.y) < 1) return;
      E.arrastando.mexeu = true;
      var n = b.slice();

      if (!dir) { n[0] = b[0] + dx; n[1] = b[1] + dy; }
      else {
        var lar = b[2] == null ? 100 : b[2];
        var alt = b[3];
        if (dir.indexOf('w') >= 0) { n[0] = b[0] + dx; n[2] = Math.max(.5, lar - dx); }
        if (dir.indexOf('e') >= 0) { n[2] = Math.max(.5, lar + dx); }
        /* a altura só se mexe quando ela EXISTE na declaração */
        if (alt != null && dir.indexOf('n') >= 0) { n[1] = b[1] + dy; n[3] = Math.max(.5, alt - dy); }
        if (alt != null && dir.indexOf('s') >= 0) { n[3] = Math.max(.5, alt + dy); }
      }
      n[0] = pct(n[0]); n[1] = pct(n[1]);
      if (n[2] != null) n[2] = pct(n[2]);
      if (n[3] != null) n[3] = pct(n[3]);
      /* A GRUDE ENTRA DEPOIS do arredondamento e ESCREVE POR CIMA dele:
         `pct()` devolve 1 casa (6.1), o alvo devolve o número DECLARADO do
         vizinho (6). Alt escapa, porque composição sangra de propósito. */
      grudar(n, c, E.sel, dir, e2.altKey);
      /* ARREDONDAR DE NOVO DEPOIS DA GRUDE. A conta da grude
         (`alvo - largura`, `direita - esquerda`) roda DEPOIS do `pct()` de
         cima e reintroduz lixo de ponto flutuante: o modelo ficava com
         `12.100000000000001` enquanto o disco recebia `12.1`, porque só a
         ESCRITA arredondava. Memória e disco discordando nos últimos bits
         é a mesma família de defeito que a tela discordar do arquivo — só
         que invisível. */
      n[0] = pct(n[0]); n[1] = pct(n[1]);
      if (n[2] != null) n[2] = pct(n[2]);
      if (n[3] != null) n[3] = pct(n[3]);
      c.box = n;

      /* preview ao vivo no próprio nó — mesma conta do motor */
      if (no) {
        no.style.left = n[0] + '%'; no.style.top = n[1] + '%';
        if (n[2] != null) no.style.width = n[2] + '%';
        if (n[3] != null) no.style.height = n[3] + '%';
      }
      desenharMarcas();
      pintarPainel(true);
    }

    function soltar() {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      var mexeu = E.arrastando && E.arrastando.mexeu;
      E.arrastando = null;
      if (!mexeu) {
        /* foi CLIQUE, não arrasto: desfaz o instantâneo e cicla a pilha.
           MAS NÃO NO CLIQUE QUE ACABOU DE MARCAR — senão um clique só
           pularia a camada que a pessoa mirou. O ciclo é para o SEGUNDO
           clique em diante. */
        E.hist.pop(); atualizarBotoes(); desenharMarcas();
        if (E.selecionouAgora) { E.selecionouAgora = false; return; }
        if (pClique && !dir) ciclarNoPonto(pClique.x, pClique.y);
        return;
      }
      E.selecionouAgora = false;
      /* A IDA E A VOLTA FECHAM AQUI: a peça é remontada pelo caminho de
         verdade, então o que fica na tela é o que a declaração produz. */
      E.ciclo.x = -9e9;
      var grudou = (E.guias || []).slice();
      E.guias = [];
      remontar();
      var nb = E.L[E.sel].box;
      estado((dir ? 'redimensionada' : 'movida') + ': ' + rotulo(E.L[E.sel], E.sel).titulo +
        ' → x ' + pct(nb[0]) + '%  y ' + pct(nb[1]) + '%' +
        (dir ? '  l ' + (nb[2] == null ? '100' : pct(nb[2])) + '%' : '') +
        (grudou.length
          ? '  ·  GRUDOU em ' + grudou.map(function (g) { return g.rot; }).join(' e ')
          : '') +
        '  ·  ' + contarEdicoes() + ' alteração(ões) por gravar', 'alerta');
    }
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  }

  /* ================================================================== */
  /* HISTÓRICO. Undo é preferível a confirmação: o gesto é barato de
     desfazer, então ele não pede permissão antes — ele oferece volta
     depois. A confirmação fica reservada para o que não tem volta pela
     tela.                                                               */
  function instantaneo() {
    E.avisoGesto = null;                 /* aviso vale para UM gesto */
    E.hist.push(JSON.stringify(E.L));
    if (E.hist.length > 200) E.hist.shift();
    E.futuro.length = 0;
    atualizarBotoes();
  }
  function desfazer() {
    if (!E.hist.length) return;
    E.futuro.push(JSON.stringify(E.L));
    E.L = JSON.parse(E.hist.pop());
    remontar();
    atualizarBotoes();
    estado('desfeito · ' + contarEdicoes() + ' alteração(ões) por gravar', 'alerta');
  }
  function refazer() {
    if (!E.futuro.length) return;
    E.hist.push(JSON.stringify(E.L));
    E.L = JSON.parse(E.futuro.pop());
    remontar();
    atualizarBotoes();
    estado('refeito · ' + contarEdicoes() + ' alteração(ões) por gravar', 'alerta');
  }
  /* DESCARTAR TUDO — com escrita contínua, é A REDE, e por isso ele
     ESCREVE. Voltar a peça na tela e deixar o disco com os valores salvos
     seria a rede furada exatamente onde ela é a única que existe. */
  function descartar(semPerguntar) {
    if (!contarEdicoes()) return;
    if (!semPerguntar && !window.confirm(
      'Voltar a peça ao estado de quando ela foi aberta?\n\n' +
      contarEdicoes() + ' alteração(ões) serão desfeitas, e a restauração ' +
      'será gravada em ' + E.arq + '.js.')) return;
    instantaneo();
    E.L = JSON.parse(JSON.stringify(E.orig));
    remontar();
    estado('peça restaurada ao estado da chegada — gravando a restauração…', 'alerta');
    salvar(true);
  }

  /* ================================================================== */
  /* AS EDIÇÕES. Derivadas por comparação com o original, nunca acumuladas
     à mão: contador que se atualiza por evento erra sozinho depois de um
     desfazer, e um contador errado é o que decide se a gravação acontece.

     O ESCOPO VEM DO SERVIDOR — é a mesma tabela que a escrita usa (núcleo
     + tema). Diferir um campo que a escrita não sabe gravar seria contar
     alteração que nunca chega no disco.                                 */
  function diff(base) {
    var out = [];
    if (!base) return out;
    for (var i = 0; i < E.L.length; i++) {
      var a = base[i] || {}, b = E.L[i] || {};
      for (var j = 0; j < E.campos.length; j++) {
        var f = E.campos[j];
        if (b[f] === undefined && a[f] === undefined) continue;
        if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
          out.push({ slug: E.slug, i: i, campo: f, valor: b[f] });
        }
      }
    }
    return out;
  }
  function edicoes() { return diff(E.orig); }

  /* MUDANÇA ESTRUTURAL — camada que entrou ou saiu. O diff campo-a-campo
     só sabe falar de camadas que existem dos DOIS lados; inserir e
     remover mudam o comprimento e deslocam índices. Como o editor faz uma
     operação dessas por vez, o delta é sempre de UMA camada. Se algum dia
     for maior, eu NÃO adivinho: devolvo o sinal e a tela recusa. */
  function estruturais() {
    var base = E.noDisco || [], at = E.L || [], i;
    if (base.length === at.length) return [];
    if (at.length === base.length + 1) {
      for (i = 0; i < at.length; i++) {
        if (i >= base.length || JSON.stringify(at[i]) !== JSON.stringify(base[i]))
          return [{ tipo: 'inserir', slug: E.slug, indice: i, camada: at[i] }];
      }
    }
    if (at.length === base.length - 1) {
      for (i = 0; i < base.length; i++) {
        if (i >= at.length || JSON.stringify(at[i]) !== JSON.stringify(base[i]))
          return [{ tipo: 'remover', slug: E.slug, indice: i }];
      }
    }
    return [{ tipo: 'indizivel' }];
  }

  /* o que falta MANDAR pro disco. Estrutural vai SOZINHA e primeiro: uma
     inserção no meio desloca todo índice abaixo, então misturar com
     edição de campo na mesma escrita escreveria na camada errada. */
  function paraGravar() {
    var es = estruturais();
    if (es.length) return es;
    return diff(E.noDisco);
  }
  function contarEdicoes() { return edicoes().length; }
  function camadasMexidas() {
    var s = {};
    edicoes().forEach(function (e) { s[e.i] = 1; });
    return s;
  }

  function atualizarBotoes() {
    var n = contarEdicoes(), falta = paraGravar().length;
    UI.desfazer.disabled = !E.hist.length;
    UI.refazer.disabled = !E.futuro.length;
    UI.descartar.disabled = !n;
    UI.gravar.disabled = !falta || !!E.somenteLeitura || !!E.bloqueio || E.deMemoria || E.lendo;
    UI.patch.disabled = !falta || !!E.somenteLeitura || E.deMemoria;
    UI.cont.textContent = n ? (n + ' alteração(ões) desde a chegada') : 'sem alteração';
    UI.cont.style.color = n ? 'var(--sel)' : '';
    selo();
  }

  /* O SELO — estado da escrita, sempre visível, nunca vago. Com escrita
     contínua não existe mais o botão que confirmava o ato, então este é o
     único canal que responde "gravou?". Cor E palavra: cor sozinha não
     serve pra quem não separa verde de vermelho. */
  function selo() {
    var e = UI.selo;
    if (E.lendo) { e.dataset.e = 'salvando'; e.textContent = 'lendo o arquivo…'; return; }
    /* NUNCA DIZER `salvo` SOBRE UM ARQUIVO QUE NÃO FOI LIDO. Selo de
       estado é afirmação sobre o DISCO, e afirmação sobre o disco se
       confere lendo o disco. Sem leitura, o selo diz de onde veio o que
       está na tela. */
    if (E.deMemoria) { e.dataset.e = 'recusado'; e.textContent = '⚠ DA MEMÓRIA — não li o arquivo'; return; }
    if (E.somenteLeitura || (!E.hash && !E.bloqueio)) { e.dataset.e = 'parado'; e.textContent = 'não grava'; return; }
    if (E.bloqueio) { e.dataset.e = 'recusado'; e.textContent = '⚠ NÃO SALVO'; return; }
    if (E.salvando) { e.dataset.e = 'salvando'; e.textContent = 'salvando…'; return; }
    if (paraGravar().length) {
      e.dataset.e = 'pendente';
      e.textContent = E.auto ? 'por salvar…' : (paraGravar().length + ' por salvar');
      return;
    }
    e.dataset.e = 'salvo';
    e.textContent = 'salvo' + (E.ultimoSalvo ? ' · ' + E.ultimoSalvo : '');
  }

  /* ================================================================== */
  /* BLOQUEIO — a recusa é ESTADO DA TELA, não linha de rodapé. Mensagem
     de recusa no rodapé some do olho de quem está olhando a peça: o
     resultado visível é NENHUM, e a leitura honesta é "cliquei e não
     gravou". Aqui a recusa cobre o palco, esconde a peça (porque
     continuar arrastando produz trabalho que não vai pro disco), não
     fecha sozinha, e traz a saída como BOTÃO — não como prosa que a
     pessoa tem de executar à mão.                                      */
  function bloquear(titulo, texto, acoes, cola) {
    E.bloqueio = titulo;
    UI.bloqTit.textContent = titulo;
    UI.bloqTxt.textContent = texto;
    UI.bloqAcoes.innerHTML = '';
    (acoes || []).forEach(function (a) {
      var b = el('button', a.primaria ? 'primaria' : null, a.rotulo);
      b.onclick = a.fn;
      UI.bloqAcoes.appendChild(b);
    });
    if (cola) { UI.bloqCola.hidden = false; UI.bloqCola.textContent = cola; }
    else { UI.bloqCola.hidden = true; UI.bloqCola.textContent = ''; }
    UI.bloqueio.hidden = false;
    var b0 = UI.bloqAcoes.querySelector('button');
    if (b0) b0.focus();
    atualizarBotoes();
  }
  function desbloquear() {
    E.bloqueio = null;
    UI.bloqueio.hidden = true;
    atualizarBotoes();
  }

  /* o que colar à mão quando NENHUMA rota de servidor responde — montado
     aqui dentro, sem depender de nada que possa estar fora do ar */
  function colaManual() {
    return paraGravar().map(function (e) {
      if (e.tipo) return E.arq + '.js · ' + e.slug + ' · ' + e.tipo + ' camada #' + e.indice +
        (e.camada ? ' · ' + JSON.stringify(e.camada) : '');
      var v = e.campo === 'tx' ? JSON.stringify(e.valor)
            : (e.campo === 'box' ? '[' + e.valor.map(function (x) {
                return x == null ? 'null' : x; }).join(',') + ']' : e.valor);
      return E.arq + '.js · ' + e.slug + ' · camada #' + e.i + ' · ' + e.campo + ':' + v;
    }).join('\n');
  }

  /* ================================================================== */
  /* SALVAR. No fim do gesto, com um respiro curto pra agrupar — "tempo
     real" aqui é SEM BOTÃO, não uma escrita por movimento do mouse.     */
  var RESPIRO = 400;
  function agendarSalvar() {
    /* NÃO ESCREVO EM ARQUIVO QUE EU NÃO LI. Sem leitura de disco eu não
       sei contra o que estou gravando — e o `hashEsperado` iria nulo,
       desligando justamente a cerca que impede escrita por cima de
       terceiros. */
    if (!E.auto || E.somenteLeitura || E.bloqueio || E.deMemoria || E.lendo) { selo(); return; }
    if (!paraGravar().length) { selo(); return; }
    clearTimeout(E.timer);
    E.timer = setTimeout(salvar, RESPIRO);
    selo();
  }

  function salvar(manual) {
    clearTimeout(E.timer);
    if (E.somenteLeitura || E.bloqueio || E.lendo) return;
    if (E.deMemoria) {
      estado('não gravo: a tela mostra memória, não o arquivo. Recarregue a página.', 'erro');
      return;
    }
    if (E.salvando) { E.refila = true; return; }   /* nunca duas escritas ao mesmo tempo */
    var eds = paraGravar();
    if (!eds.length) { selo(); return; }
    if (eds[0] && eds[0].tipo === 'indizivel') {
      bloquear('Não sei descrever esta mudança',
        'A peça na tela tem ' + E.L.length + ' camadas e o disco tem ' + (E.noDisco || []).length +
        ', com mais de uma diferença de estrutura. Eu só sei gravar uma inserção ou uma remoção ' +
        'por vez, e não vou adivinhar qual linha mexer.',
        [{ rotulo: 'Recarregar a peça do disco', primaria: true,
           fn: function () { location.reload(); } }], colaManual());
      return;
    }
    var instantaneoL = JSON.parse(JSON.stringify(E.L));   /* o que esta escrita representa */
    E.salvando = true; selo();

    fetch('/_api/gravar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arq: E.arq, hashEsperado: E.hash, edicoes: eds,
        contagens: contagensDeTodas() })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        E.salvando = false;
        if (!j.ok) return recusa(j);
        /* O CARIMBO SE RENOVA DEPOIS DE CADA ESCRITA MINHA — é isso que faz
           a cerca recusar só mudança que não fui eu que fiz. */
        E.hash = j.hash;
        E.noDisco = instantaneoL;
        /* A DECLARAÇÃO EM MEMÓRIA ACOMPANHA A ESCRITA. Deixá-la para trás
           faria a próxima abertura desta peça comparar contra um estado
           velho — o mesmo defeito por outro caminho. */
        if (E.uso) E.uso.L = JSON.parse(JSON.stringify(instantaneoL));
        E.ultimoSalvo = new Date().toTimeString().slice(0, 8);
        if (j.gravou) {
          /* NOTA DE ROTINA NÃO APAGA AVISO DO GESTO — ela entra DEPOIS
             dele. O aviso de "camada ficou sem texto" era pintado e apagado
             ~400 ms depois por esta linha: o aviso que mais importava era o
             único com prazo de validade. */
          estado((E.avisoGesto ? E.avisoGesto + '  |  ' : '') +
            'salvo em ' + E.arq + '.js · ' + j.linhasTocadas +
            ' linha(s): ' + relatorio(j), E.avisoGesto ? 'alerta' : 'ok');
        }
        atualizarBotoes();
        if (E.refila) { E.refila = false; agendarSalvar(); }
        else if (paraGravar().length) agendarSalvar();   /* mexeu durante a escrita */
      })
      .catch(function (err) {
        E.salvando = false;
        semServidor(err);
      });
    if (manual) estado('salvando…', 'trabalhando');
  }

  /* A RECUSA, POR TIPO. Cada uma diz o que houve, por quê, e o que fazer —
     e o "o que fazer" é botão. */
  function recusa(j) {
    if (j.erro === 'arquivo-mudou') {
      bloquear('Alguém mexeu no arquivo enquanto você editava',
        'O `' + E.arq + '.js` no disco não é mais o que este editor leu quando abriu a peça. ' +
        'Pode ter sido outro editor de código, um `git`, ou outro processo. Eu NÃO gravo por ' +
        'cima — o que estivesse lá se perderia. As suas alterações continuam na tela e estão ' +
        'listadas abaixo; copie o que quiser antes de recarregar.',
        [{ rotulo: 'Recarregar a peça do disco', primaria: true,
           fn: function () { location.reload(); } },
         { rotulo: 'Ver patch das minhas alterações', fn: verPatch }],
        colaManual());
    } else if (j.erro === 'declaracao-computada') {
      bloquear('Esta peça não se edita por aqui', j.msg,
        [{ rotulo: 'Voltar para a primeira peça', primaria: true,
           fn: function () { desbloquear(); if (E.usos[0]) abrir(E.usos[0].slug); } }]);
    } else {
      bloquear('Não gravei', (j.msg || j.erro) + ' — as suas alterações continuam na tela.',
        [{ rotulo: 'Tentar de novo', primaria: true,
           fn: function () { desbloquear(); salvar(true); } },
         { rotulo: 'Descartar e voltar ao arquivo',
           fn: function () { desbloquear(); descartar(true); } }],
        colaManual());
    }
    estado('escrita recusada: ' + (j.erro || '') + ' — ' + (j.msg || ''), 'erro');
  }

  /* SILÊNCIO LIDO COMO APROVAÇÃO é o pior modo de falha que existe aqui.
     Servidor morto no meio da sessão cai neste ponto, e grita igual. */
  function semServidor(err) {
    bloquear('Perdi o servidor do editor',
      'O gesto não chegou no disco: ' + (err && err.message ? err.message : 'sem resposta') +
      '. A página continua funcionando para arrastar e medir, mas NADA está sendo salvo. ' +
      comoSubir() + '. Ou copie a lista abaixo e aplique à mão.',
      [{ rotulo: 'Tentar salvar de novo', primaria: true,
         fn: function () { desbloquear(); salvar(true); } },
       { rotulo: 'Continuar sem salvar',
         fn: function () { desbloquear(); E.auto = false; UI.auto.checked = false;
                           E.somenteLeitura = null; atualizarBotoes();
                           estado('salvamento desligado — nada está indo pro disco', 'alerta'); } }],
      colaManual());
    estado('sem servidor: nada está sendo salvo', 'erro');
  }

  /* ================================================================== */
  /* LISTA — o caminho de alcance. É por ela que se chega na camada
     invisível (a reserva) e na que foi arrastada para fora do quadro. Sem
     ela, essas duas somem do produto.                                   */
  function pintarLista() {
    UI.camadas.innerHTML = '';
    if (!E.L) return;
    var mex = camadasMexidas();
    /* de cima para baixo na pilha: quem está na frente aparece primeiro */
    ordemDePintura().reverse().forEach(function (o) {
      var i = o.i, c = E.L[i], r = rotulo(c, i);
      var b = el('button', 'cam');
      b.setAttribute('role', 'option');
      b.setAttribute('aria-current', i === E.sel ? 'true' : 'false');
      b.setAttribute('aria-selected', i === E.sel ? 'true' : 'false');
      var lin = el('span', 'id', r.titulo + (mex[i] ? '  ●' : ''));
      if (mex[i]) lin.className = 'id mudou';
      b.appendChild(lin);
      b.appendChild(el('span', 'nm', r.corpo || r.glosa));
      if (!conhecido(c)) b.appendChild(el('span', 'av', '⚠ tipo sem dono no tema'));
      var vz = vazia(i);
      if (vz) b.appendChild(el('span', 'av', '⚠ vazia — não aparece na peça'));
      var fora = foraDoQuadro(i);
      if (fora === 'inteira') b.appendChild(el('span', 'av', '⚠ inteira fora do quadro'));
      else if (fora === 'parcial') b.appendChild(el('span', 'av', '↔ sangra para fora'));
      b.onclick = function () { marcar(i); };
      UI.camadas.appendChild(b);
    });
  }

  function marcar(i) {
    E.avisoGesto = null;
    E.sel = i;
    E.ciclo.n = 0;
    desenharMarcas();
    pintarLista();
    pintarPainel();
    estado(estadoDaMarca(i), '');
  }

  /* ================================================================== */
  /* PAINEL                                                              */
  /* UMA GUARDA SÓ PARA TODO HANDLER DE PAINEL. Handlers que checavam
     `E.bloqueio` e esqueciam `somenteLeitura` e `deMemoria` deixavam três
     portas com duas trancadas. Agora é uma pergunta só, e quem esquecer
     de fazer a pergunta não tem como acertar por acaso. */
  function podeEditar() {
    return !E.bloqueio && !E.somenteLeitura && !E.deMemoria && !E.lendo;
  }

  function campoNum(rotuloTxt, valor, onChange, passo, dica, marca) {
    var w = el('div');
    var s = el('small', null, rotuloTxt);
    var inp = document.createElement('input');
    inp.type = 'number'; inp.step = passo || 0.1;
    inp.value = (valor == null ? '' : valor);
    if (marca != null) inp.dataset.box = marca;
    if (dica) { inp.placeholder = dica; inp.title = dica; }
    inp.setAttribute('aria-label', rotuloTxt);
    inp.onchange = function () {
      /* mesma trava do arrasto: com a escrita recusada, o painel também
         não fabrica trabalho que não vai pro disco. E repinta do MODELO,
         nunca de `defaultValue`: `defaultValue` está vazio (nunca setei o
         atributo, só a propriedade) e o campo ficaria EM BRANCO — o valor
         não seria aplicado (certo) e a tela passaria a mentir sobre o
         número que está valendo (errado). */
      if (!podeEditar()) { pintarPainel(); return; }
      instantaneo();
      onChange(inp.value === '' ? null : parseFloat(inp.value));
      remontar();
    };
    w.appendChild(s); w.appendChild(inp);
    return w;
  }

  /* DOIS NÚMEROS DISCORDANDO NA MESMA TELA É PIOR QUE UM NÚMERO SÓ. Se o
     arrasto atualizasse só a linha viva e deixasse os campos do painel no
     valor antigo, a leitura diria `x 5.5 y 57` e os campos diriam `-4 /
     62` ao mesmo tempo. Aqui o arrasto atualiza os DOIS, e os campos só
     não roubam o foco de quem estiver digitando neles. */
  function pintarPainel(soNumeros) {
    if (soNumeros && E.sel >= 0) {
      var b0 = E.L[E.sel].box || [];
      var alvo = UI.painel.querySelector('[data-vivo]');
      if (alvo) {
        alvo.textContent = 'x ' + pct(b0[0]) + '  y ' + pct(b0[1]) +
          '  l ' + (b0[2] == null ? '100' : pct(b0[2])) +
          '  a ' + (b0[3] == null ? 'auto' : pct(b0[3]));
        ['0', '1', '2', '3'].forEach(function (n) {
          var inp = UI.painel.querySelector('[data-box="' + n + '"]');
          if (inp && document.activeElement !== inp) {
            inp.value = b0[+n] == null ? '' : pct(b0[+n]);
          }
        });
        var nat = UI.painel.querySelector('[data-nativo]');
        if (nat) {
          var rq = retangulo(E.sel);
          nat.textContent = 'na peça: ' + Math.round(rq.x) + ', ' + Math.round(rq.y) +
            ' · ' + Math.round(rq.l) + ' × ' + Math.round(rq.a) + ' px';
        }
        return;
      }
    }
    UI.painel.innerHTML = '';
    if (!E.L) return;

    if (E.sel < 0 || E.sel >= E.L.length) {
      /* VAZIO INICIAL — diz que é normal e diz o que fazer. Não é a mesma
         tela de erro nem de carregando. */
      var v = el('div', 'grupo');
      v.appendChild(el('h2', null, 'Nenhuma camada marcada'));
      v.appendChild(el('div', 'fato',
        'Clique numa camada na peça, ou escolha uma na lista à esquerda. ' +
        'Clique de novo no MESMO ponto para descer para a camada de baixo — ' +
        'é assim que se alcança o que está coberto.'));
      v.appendChild(el('div', 'fato',
        'A lista mostra as camadas na ordem da pilha, da frente para o fundo. ' +
        'Reserva é um vão: não imprime nada e é invisível na peça — só a lista acha.'));
      v.appendChild(el('div', 'fato',
        'T cria uma caixa de texto nova. Delete apaga a camada marcada. ' +
        'As duas gravam no arquivo na hora, e Ctrl+Z desfaz gravando a volta.'));
      UI.painel.appendChild(v);
      return;
    }

    var i = E.sel, c = E.L[i], r = rotulo(c, i), b = c.box || [0, 0, 100, 100];
    var W = E.uso.w, H = E.uso.h, rr = retangulo(i);

    var g0 = el('div', 'grupo');
    g0.appendChild(el('h2', null, r.titulo + ' · ' + r.glosa));
    if (r.corpo) g0.appendChild(el('div', 'fato', r.corpo));
    /* TIPO SEM DONO — dito aqui, no painel, e não só na caixa tracejada.
       A caixa mostra QUE há um problema; esta linha diz QUAL é e de quem
       é a solução. */
    if (!conhecido(c)) {
      g0.appendChild(el('div', 'aviso',
        'O tipo `' + (c.t == null ? '(sem t)' : c.t) + '` não é do núcleo (tt, tx, obj, reserva) ' +
        'e o tema ' + (TEMA ? '`' + (TEMA.nome || '?') + '` ' : 'ausente ') +
        'não declarou como pintá-lo. A camada continua aqui, com a geometria dela, e ' +
        'continua arrastável e gravável — ela só não sabe se desenhar. Para resolver, ' +
        'declare `tipos.' + (c.t || 'x') + '` no tema.'));
    }
    var vzP = vazia(i);
    if (vzP) {
      g0.appendChild(el('div', 'aviso',
        'Esta camada ' + vzP + '. Ela continua declarada no arquivo e sai assim no próximo ' +
        'build. Se foi de propósito, tudo bem — se não foi, desfaça (Ctrl+Z) ou digite o ' +
        'texto de volta no campo abaixo.'));
    }
    UI.painel.appendChild(g0);

    if (E.somenteLeitura) {
      var sl = el('div', 'grupo');
      sl.appendChild(el('div', 'aviso', 'Somente leitura — ' + E.somenteLeitura));
      UI.painel.appendChild(sl);
    }

    /* ---- geometria ---- */
    var g1 = el('div', 'grupo');
    g1.appendChild(el('h2', null, 'Geometria · % do nativo ' + W + '×' + H));
    var vivo = el('div', 'nativo');
    vivo.dataset.vivo = '1';
    vivo.textContent = 'x ' + pct(b[0]) + '  y ' + pct(b[1]) +
      '  l ' + (b[2] == null ? '100' : pct(b[2])) + '  a ' + (b[3] == null ? 'auto' : pct(b[3]));
    g1.appendChild(vivo);

    var p1 = el('div', 'par');
    p1.appendChild(campoNum('x %', pct(b[0]), function (v) { c.box = c.box.slice(); c.box[0] = v; },
      0.1, null, '0'));
    p1.appendChild(campoNum('y %', pct(b[1]), function (v) { c.box = c.box.slice(); c.box[1] = v; },
      0.1, null, '1'));
    g1.appendChild(p1);

    var p2 = el('div', 'par');
    p2.appendChild(campoNum('largura %', b[2] == null ? null : pct(b[2]),
      function (v) { c.box = c.box.slice(); c.box[2] = v; }, 0.1, null, '2'));
    if (b[3] == null && temTexto(c)) {
      var wa = el('div');
      wa.appendChild(el('small', null, 'altura'));
      var fixo = el('div', 'fato', 'do conteúdo · ' + Math.round(rr.a) + ' px');
      fixo.style.margin = '0';
      wa.appendChild(fixo);
      p2.appendChild(wa);
    } else {
      p2.appendChild(campoNum('altura %', b[3] == null ? null : pct(b[3]),
        function (v) { c.box = c.box.slice(); c.box[3] = v; }, 0.1, null, '3'));
    }
    g1.appendChild(p2);
    var nat = el('div', 'nativo',
      'na peça: ' + Math.round(rr.x) + ', ' + Math.round(rr.y) + ' · ' +
      Math.round(rr.l) + ' × ' + Math.round(rr.a) + ' px');
    nat.dataset.nativo = '1';
    g1.appendChild(nat);

    if (b[3] == null && temTexto(c)) {
      g1.appendChild(el('div', 'fato',
        'Esta camada não declara altura — ela nasce do conteúdo. Por isso ela ' +
        'redimensiona só em largura: uma alça de altura aqui ou não faria nada, ou ' +
        'gravaria um número que a declaração não usa.'));
    }
    var fora = foraDoQuadro(i);
    if (fora === 'inteira') {
      var av = el('div', 'aviso');
      av.textContent = 'Esta camada está INTEIRA fora do quadro — ela não aparece na peça. ' +
        'Isto é permitido (sangrar é recurso de composição), mas pode ter sido sem querer.';
      var bt = el('button', null, 'Trazer para dentro do quadro');
      bt.style.marginTop = '6px';
      bt.onclick = function () {
        instantaneo();
        var nb = c.box.slice();
        nb[0] = Math.min(Math.max(nb[0], 0), 100 - (nb[2] == null ? 10 : Math.min(nb[2], 100)));
        nb[1] = Math.min(Math.max(nb[1], 0), 92);
        c.box = nb;
        remontar();
      };
      av.appendChild(document.createElement('br'));
      av.appendChild(bt);
      g1.appendChild(av);
    } else if (fora === 'parcial') {
      g1.appendChild(el('div', 'fato',
        'Sangra para fora do quadro. Isso costuma ser recurso, não erro — o quadro ' +
        'recorta no export, e é essa a intenção quando a caixa passa de 100.'));
    }
    UI.painel.appendChild(g1);

    /* ---- tipo e texto ---- */
    if (temTexto(c)) {
      var g2 = el('div', 'grupo');
      g2.appendChild(el('h2', null, 'Tipo'));
      var p3 = el('div', 'par');
      p3.appendChild(campoNum('corpo px', c.s, function (v) { c.s = v; }, 1,
        'px no nativo de ' + H + ' de altura'));
      p3.appendChild(campoNum('entrelinha', c.lh, function (v) { c.lh = v; }, 0.01,
        'múltiplo do corpo'));
      g2.appendChild(p3);
      if (c.s) {
        /* O NÚMERO QUE DECIDE não é o corpo no nativo — é quantos px ele
           vira onde a peça vai ser lida. Sem esta linha, escolher corpo é
           escolher no escuro. */
        g2.appendChild(el('div', 'nativo',
          E.uso.c
            ? ('na largura de consumo (' + E.uso.c + ' px): ≈ ' +
               (Math.round(c.s * E.uso.c / W * 10) / 10) + ' px')
            : 'a peça não declara `c` (largura de consumo) — sem ela não dá pra dizer ' +
              'quantos px este corpo vira na tela de quem lê'));
      }
      UI.painel.appendChild(g2);

      /* o tema pode acrescentar blocos aqui (papel tipográfico, cor…) */
      pintarBlocosDoTema(c, i);

      var g3 = el('div', 'grupo');
      g3.appendChild(el('h2', null, 'Texto'));
      var ta = document.createElement('textarea');
      ta.value = c.tx || '';
      ta.setAttribute('aria-label', 'Texto da camada');
      ta.onchange = function () {
        if (!podeEditar()) { ta.value = c.tx; return; }
        if (ta.value === c.tx) return;
        var antesVazio = !!vazia(i);
        instantaneo(); c.tx = ta.value; remontar();
        var agoraVazio = !!vazia(i);
        if (agoraVazio && !antesVazio) {
          /* AVISO DE GESTO É STICKY. Pintado aqui e apagado ~400 ms depois
             pela confirmação do salvamento automático, o aviso que mais
             importava seria o único com prazo de validade. Agora ele
             sobrevive à confirmação (que o compõe em vez de substituir) e
             só sai no próximo gesto. */
          E.avisoGesto = 'a camada ' + rotulo(c, i).titulo + ' ficou SEM TEXTO — ' +
            'ela some da peça e sai assim no próximo build. Ctrl+Z desfaz.';
          estado(E.avisoGesto, 'alerta');
        }
      };
      g3.appendChild(ta);
      g3.appendChild(el('div', 'fato',
        '`<br>` quebra linha. `[[assim]]` põe a palavra sobre o marcador de cor. ' +
        '`<i>` e `<b>` valem. Nada disso é inventado aqui — é o que o motor já lê.'));
      UI.painel.appendChild(g3);
    } else {
      var g4 = el('div', 'grupo');
      g4.appendChild(el('h2', null, 'O que esta camada aceita'));
      g4.appendChild(el('div', 'fato',
        'Só GEOMETRIA: posição e tamanho. Esta camada não declara texto nem corpo.'));

      if (c.t === 'obj') {
        var wsrc = el('div');
        wsrc.appendChild(el('small', null, 'arquivo (`src`)'));
        var isrc = document.createElement('input');
        isrc.type = 'text'; isrc.value = c.src || '';
        isrc.placeholder = './pasta/arquivo.svg';
        isrc.setAttribute('aria-label', 'arquivo da imagem');
        isrc.onchange = function () {
          if (!podeEditar()) { pintarPainel(); return; }
          var v = isrc.value.trim();
          if (v === (c.src || '')) return;
          instantaneo();
          if (!v) delete c.src; else c.src = v;
          remontar();
        };
        wsrc.appendChild(isrc);
        g4.appendChild(wsrc);
        var falhouObj = E.nos && E.nos[i] && E.nos[i].classList.contains('faltando');
        if (falhouObj) {
          g4.appendChild(el('div', 'aviso',
            'A imagem NÃO carregou: não achei `' + (c.src || '(sem src)') + '`. O vão está ' +
            'riscado de vermelho na peça para não se confundir com uma reserva vazia. ' +
            'A geometria continua válida; o que falta é o arquivo.'));
        }
        g4.appendChild(el('div', 'fato',
          'O caminho é resolvido a partir da raiz servida. Apagar o campo remove `src` ' +
          'da declaração — a camada não fica com um caminho morto declarado.'));
      }

      if (c.t === 'reserva') {
        g4.appendChild(el('div', 'fato',
          'Reserva é o vão: uma caixa declarada que não imprime nada. É o lugar que outro ' +
          'processo preenche depois, sobre a peça pronta. Sobre a peça ela é invisível; a ' +
          'marcação hachurada é o que a denuncia.'));
        /* A PRÉVIA SE DECLARA PRÉVIA. Ela representa um passo que acontece
           depois, noutro processo — prévia indistinguível do real é um
           estado apresentado com autoridade que ele não tem. */
        var pv = previaDe(c);
        if (pv && pv.nada) {
          g4.appendChild(el('div', 'fato', 'Sem prévia aqui: ' + pv.nada + '.'));
        } else if (pv && pv.src) {
          var falhou = (E.previasFalhas || []).some(function (f) { return f.camada === i; });
          if (falhou) {
            g4.appendChild(el('div', 'aviso',
              'A prévia NÃO carregou: não achei `' + pv.src + '`. O vão está riscado de ' +
              'vermelho na peça para não se confundir com uma reserva sem prévia. ' +
              'A geometria continua válida; o que falta é o arquivo-fonte.'));
          } else {
            g4.appendChild(el('div', 'fato',
              'PRÉVIA, não a peça. A imagem em cima deste vão é uma reprodução do que vai ' +
              'ser pintado DEPOIS, sobre a peça pronta' + (pv.diz ? ' — ' + pv.diz : '') +
              '. Ela não está na declaração, não sai em export nenhum e não se arrasta. ' +
              'O que se move é a reserva; a imagem acompanha.'));
          }
        } else if (!TEMA || typeof TEMA.previa !== 'function') {
          g4.appendChild(el('div', 'fato',
            'Nenhum tema declarou prévia. Este vão continua sendo geometria válida — ' +
            'quem o preenche é outro processo.'));
        }
      }
      UI.painel.appendChild(g4);
      pintarBlocosDoTema(c, i);
    }

    /* ---- pilha ---- */
    var g5 = el('div', 'grupo');
    g5.appendChild(el('h2', null, 'Na pilha'));
    var pintam = ordemDePintura();
    var posic = pintam.findIndex(function (o) { return o.i === i; });
    g5.appendChild(el('div', 'fato',
      'z = ' + (c.z == null ? 'auto (0)' : c.z) + ' · ' + (posic + 1) + 'ª de ' +
      pintam.length + ' na ordem de pintura (1 = mais ao fundo). ' +
      'z é fora do escopo desta tela.'));
    UI.painel.appendChild(g5);
  }

  /* GANCHO DO TEMA NO PAINEL. Se ele quebrar, o painel NÃO some — o erro
     vira aviso nomeado. Um tema com bug não pode derrubar o editor. */
  function pintarBlocosDoTema(c, i) {
    if (!TEMA || typeof TEMA.painel !== 'function') return;
    var nos;
    try {
      nos = TEMA.painel(c, i, { el: el, campoNum: campoNum, instantaneo: instantaneo,
        remontar: remontar, pintarPainel: pintarPainel, podeEditar: podeEditar,
        estado: estado, peca: E.uso, pct: pct });
    } catch (e) {
      var av = el('div', 'grupo');
      av.appendChild(el('div', 'aviso',
        'o tema `' + (TEMA.nome || '?') + '` quebrou ao montar o painel desta camada: ' +
        e.message + '. O resto do editor continua funcionando.'));
      UI.painel.appendChild(av);
      return;
    }
    (nos || []).forEach(function (n) { if (n) UI.painel.appendChild(n); });
  }

  /* ================================================================== */
  /* GRAVAR                                                              */
  function relatorio(d) {
    return (d.detalhe || []).map(function (x) {
      return 'linha ' + x.linha + (x.multilinha ? '–' + x.linhaFim : '') +
        ' · camada #' + x.camada + ' · ' + x.campos.join(', ');
    }).join(' | ');
  }

  function gravar() { salvar(true); }

  function verPatch() {
    var eds = paraGravar();
    if (!eds.length) return;
    estado('montando o patch…', 'trabalhando');
    fetch('/_api/patch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arq: E.arq, edicoes: eds, contagens: contagensDeTodas() })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) { estado('não montei o patch — ' + (j.msg || j.erro), 'erro'); return; }
      var w = window.open('', '_blank');
      if (!w) { estado('o navegador bloqueou a janela do patch', 'alerta'); return; }
      w.document.title = 'patch · ' + E.arq + '.js';
      var pre = w.document.createElement('pre');
      pre.style.cssText = 'font:12px ui-monospace,monospace;padding:20px;white-space:pre-wrap';
      pre.textContent = j.patch || '(sem diferença)';
      w.document.body.style.cssText = 'margin:0;background:#111;color:#ddd';
      w.document.body.appendChild(pre);
      estado('patch aberto em outra aba · ' + j.linhasTocadas + ' linha(s) — nada foi gravado', '');
    }).catch(function (e) { estado('falha ao montar o patch: ' + e.message, 'erro'); });
  }

  /* a contagem de camadas de CADA peça do arquivo — é ela que denuncia
     declaração computada (`L:[…].concat(…)`) do lado do servidor. */
  function contagensDeTodas() {
    var m = {};
    E.usos.forEach(function (u) { if (u.g === E.arq) m[u.slug] = (u.L || []).length; });
    return m;
  }

  /* ==================================================================
     A ESTANTE — a biblioteca de assets do tema, dentro do editor.

     A REDAÇÃO VEM NA ORDEM VEREDITO → RÓTULO, porque quem chega não
     conhece a taxonomia do projeto: "pode usar" antes de "em estoque". E
     o que NÃO se pode usar aparece CONTADO, nunca escondido em silêncio —
     esconder sem contar é resposta errada entregue calada.
     ================================================================== */
  var EST = { sel: null, mostrarImpedidos: false, busca: '' };

  function catalogo() {
    if (!TEMA || typeof TEMA.estante !== 'function') return null;
    try { return TEMA.estante() || []; } catch (e) { return null; }
  }

  function pintarEstante() {
    var cats = catalogo();
    UI.familias.innerHTML = '';
    if (!cats) {
      UI.conta.textContent = 'sem estante';
      UI.familias.appendChild(el('div', 'fdesc',
        TEMA ? ('o tema `' + (TEMA.nome || '?') + '` não declara o gancho `estante` — ' +
                'esta aba fica vazia de propósito, e não por defeito')
             : 'nenhum tema carregado, então não há acervo para mostrar. ' +
               'O editor continua inteiro para as camadas do núcleo.'));
      return;
    }
    var todos = [];
    cats.forEach(function (c) { (c.itens || []).forEach(function (it) { todos.push(it); }); });
    var podem = todos.filter(function (it) { return it.pode !== false; }).length;
    var fora = {};
    todos.forEach(function (it) {
      if (it.pode === false) fora[it.cond || 'sem condição'] = (fora[it.cond || 'sem condição'] || 0) + 1;
    });
    var nomes = Object.keys(fora).sort().map(function (c) { return c + ' ' + fora[c]; });
    UI.conta.textContent = todos.length + ' no acervo · ' + podem + ' se pode usar' +
      (nomes.length ? ' · ' + (todos.length - podem) + ' não: ' + nomes.join(', ') : '');

    var q = EST.busca.trim().toLowerCase();
    var mostrou = 0;
    cats.forEach(function (cat) {
      var l = (cat.itens || []).filter(function (it) {
        if (!EST.mostrarImpedidos && it.pode === false) return false;
        if (q && String(it.nome || '').toLowerCase().indexOf(q) < 0 &&
                 String(it.id || '').toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      if (!l.length) return;
      mostrou += l.length;
      var det = document.createElement('details');
      det.className = 'fam';
      det.open = true;
      var sum = document.createElement('summary');
      sum.appendChild(el('span', 'fnome', cat.cat || '(sem nome)'));
      sum.appendChild(el('span', 'fqtd', String(l.length)));
      det.appendChild(sum);
      if (cat.desc) det.appendChild(el('div', 'fdesc', cat.desc));
      var g = el('div', 'grade');
      l.forEach(function (it) { g.appendChild(cartaoAsset(it)); });
      det.appendChild(g);
      UI.familias.appendChild(det);
    });
    if (!mostrou) {
      /* VAZIO POR BUSCA NÃO É O MESMO QUE ACERVO VAZIO, e diz o que fazer */
      UI.familias.appendChild(el('div', 'fdesc', EST.busca
        ? ('nada com "' + EST.busca + '" entre os ' +
           (EST.mostrarImpedidos ? todos.length : podem) + ' itens à mostra. ' +
           'Apague a busca, ou ligue "mostrar o que NÃO se pode usar".')
        : 'nenhum item à mostra.'));
    }
  }

  function cartaoAsset(it) {
    var pode = it.pode !== false && !!it.camada;
    var b = el('button', 'ass');
    b.type = 'button';
    b.dataset.id = it.id;
    b.dataset.monta = pode ? '1' : '0';
    if (it.src) {
      var im = document.createElement('img');
      im.className = 'mini'; im.loading = 'lazy'; im.alt = '';
      im.src = it.src;
      b.appendChild(im);
    }
    b.appendChild(el('span', 'anome', it.nome || it.id));
    /* VEREDITO ANTES DO RÓTULO — quem chega não conhece a taxonomia */
    b.appendChild(el('span', 'vered ' + (it.pode === false ? 'nao' : 'pode'),
      (it.pode === false ? 'NÃO pode usar' : 'pode usar') + (it.cond ? ' · ' + it.cond : '')));
    if (it.pode !== false && !it.camada) b.appendChild(el('span', 'vered', 'não monta aqui'));
    b.setAttribute('aria-label', (pode ? 'pode usar' : 'não pode usar') +
      ', ' + (it.nome || it.id) + (pode ? ', arrastável' : ', não arrastável'));
    b.onclick = function () { marcarAsset(it); };
    b.addEventListener('pointerdown', function (ev) { comecarArrasto(ev, it); });
    return b;
  }

  function marcarAsset(it) {
    EST.sel = it;
    [].forEach.call(UI.familias.querySelectorAll('.ass'), function (n) {
      n.setAttribute('aria-current', n.dataset.id === it.id ? 'true' : 'false');
    });
    E.sel = -1;
    desenharMarcas();
    fichaAsset(it);
  }

  /* A FICHA. Campo vazio fica VAZIO E VISÍVEL: some com o campo e ninguém
     sabe se não há dado ou se ninguém olhou. */
  function fichaAsset(it) {
    UI.painel.innerHTML = '';
    var pode = it.pode !== false;
    var g0 = el('div', 'grupo');
    g0.appendChild(el('h2', null, it.nome || it.id));
    g0.appendChild(el('div', pode ? 'fato' : 'aviso',
      (pode ? 'PODE USAR' : 'NÃO PODE USAR') + (it.cond ? ' · condição declarada: ' + it.cond : '') +
      (pode ? '' : ' — arrastar está desligado')));
    if (pode && it.camada) {
      g0.appendChild(el('div', 'fato', 'Arraste o cartão para dentro da peça. Entra como camada `' +
        it.camada.t + '`.'));
    } else if (pode && !it.camada) {
      g0.appendChild(el('div', 'aviso', 'Não dá pra arrastar: ' +
        (it.porque || 'o tema não declarou que camada este item vira')));
    } else if (it.porque) {
      g0.appendChild(el('div', 'fato', it.porque));
    }
    UI.painel.appendChild(g0);

    var g1 = el('div', 'grupo');
    g1.appendChild(el('h2', null, 'Ficha'));
    [['id', it.id], ['arquivo', it.src], ['condição', it.cond],
     ['medidas', it.w && it.h ? (it.w + '×' + it.h + ' px') : ''],
     ['vira camada', it.camada ? JSON.stringify(it.camada) : '']
    ].forEach(function (par) {
      var f = el('div', 'fato');
      f.appendChild(el('b', null, par[0] + ': '));
      f.appendChild(document.createTextNode(par[1] == null || par[1] === '' ? '—' : String(par[1])));
      g1.appendChild(f);
    });
    UI.painel.appendChild(g1);
  }

  /* ==================================================================
     ARRASTAR DA ESTANTE PARA A PEÇA — a INSERÇÃO. Muda de natureza em
     relação a tudo o que veio antes: não troca número em linha existente,
     cria linha nova. A cerca é a mesma (cirúrgica), a operação é outra.
     ================================================================== */
  function comecarArrasto(ev, it) {
    if (ev.button !== 0) return;
    if (it.pode === false || !it.camada) return;          /* impedido não arrasta */
    if (E.bloqueio || E.somenteLeitura || E.deMemoria) return;
    ev.preventDefault();

    var fant = document.createElement('img');
    fant.id = 'fantasma'; fant.src = it.src || ''; fant.alt = '';
    fant.style.left = (ev.clientX - 37) + 'px';
    fant.style.top = (ev.clientY - 37) + 'px';
    document.body.appendChild(fant);
    var mexeu = false;

    function mover(e2) {
      mexeu = true;
      fant.style.left = (e2.clientX - 37) + 'px';
      fant.style.top = (e2.clientY - 37) + 'px';
      var cx = UI.marcas.getBoundingClientRect();
      var dentro = e2.clientX >= cx.left && e2.clientX <= cx.right &&
                   e2.clientY >= cx.top && e2.clientY <= cx.bottom;
      fant.style.borderColor = dentro ? 'var(--sel)' : 'var(--ui-erro)';
      estado(dentro ? ('solte para inserir "' + (it.nome || it.id) + '" na peça')
                    : 'solte DENTRO da peça — fora dela não insere nada', dentro ? '' : 'alerta');
    }
    function soltar(e2) {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      fant.remove();
      if (!mexeu) return;
      var cx = UI.marcas.getBoundingClientRect();
      if (e2.clientX < cx.left || e2.clientX > cx.right ||
          e2.clientY < cx.top || e2.clientY > cx.bottom) {
        estado('soltou fora da peça — nada foi inserido', '');
        return;
      }
      inserirAsset(it, (e2.clientX - cx.left) / E.k, (e2.clientY - cx.top) / E.k);
    }
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  }

  function inserirAsset(it, nx, ny) {
    var W = E.uso.w, H = E.uso.h;
    /* tamanho de entrada: 22% da largura, altura pela proporção real do
       arquivo. Entra visível e mexível, sem adivinhar composição. */
    var lp = 22;
    var lpx = W * lp / 100;
    var apx = (it.w && it.h) ? lpx * (it.h / it.w) : lpx;
    var ap = Math.min(apx / H * 100, 90);
    var c = Object.assign({}, it.camada);
    c.box = [pct(nx / W * 100 - lp / 2), pct(ny / H * 100 - ap / 2), pct(lp), pct(ap)];
    /* ORDEM DE PINTURA É `z` E SÓ DEPOIS DOM: para a camada nova cair NA
       FRENTE de tudo, o `z` dela tem de passar o maior que existe. */
    var zMax = 0;
    E.L.forEach(function (x) { if (x.z != null && +x.z > zMax) zMax = +x.z; });
    c.z = zMax + 1;

    instantaneo();
    E.L.push(c);
    remontar();
    E.sel = E.L.length - 1;
    trocarAba('camadas');
    marcar(E.sel);
    estado('inserida: ' + rotulo(c, E.sel).titulo + ' · ' + (it.nome || it.id) +
      ' · z=' + c.z + ', na FRENTE das outras ' + (E.L.length - 1) +
      ' · Ctrl+Z desfaz e apaga a linha do arquivo', 'alerta');
  }

  function trocarAba(qual) {
    var camadas = qual === 'camadas';
    UI.pnCamadas.hidden = !camadas;
    UI.pnEstante.hidden = camadas;
    UI.abaCamadas.setAttribute('aria-selected', camadas ? 'true' : 'false');
    UI.abaEstante.setAttribute('aria-selected', camadas ? 'false' : 'true');
    if (!camadas) pintarEstante();
  }

  /* ================================================================== */
  /* ABRIR UMA PEÇA                                                      */
  function abrir(slug) {
    var u = E.usos.filter(function (x) { return x.slug === slug; })[0];
    if (!u) {
      cartaz('peça não encontrada', 'Nenhuma declaração tem o slug “' + slug + '”. ' +
        'Escolha outra na lista acima.');
      estado('peça não encontrada: ' + slug, 'erro');
      return;
    }
    E.slug = slug; E.uso = u; E.arq = u.g;
    E.sel = -1; E.hist.length = 0; E.futuro.length = 0;
    E.somenteLeitura = null; E.ultimoSalvo = null; E.deMemoria = false;
    E.hash = null;
    clearTimeout(E.timer);
    desbloquear();
    location.hash = slug;

    /* ABRIR É LER O DISCO. Clonar da cópia que a página já carregou faria
       a tela discordar do ARQUIVO: editar a peça A, ir pra B e voltar
       mostraria o texto VELHO — e o selo assinaria "salvo", que é uma
       afirmação sobre o arquivo feita sem ter lido o arquivo. */
    montarDe(JSON.parse(JSON.stringify(u.L || [])), true);
    estado('lendo ' + E.arq + '.js…', 'trabalhando');
    E.lendo = true; atualizarBotoes();

    fetch('/_api/camadas?arq=' + encodeURIComponent(E.arq) +
          '&slug=' + encodeURIComponent(slug))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        E.lendo = false;
        if (!j.ok) return semLeitura(j.msg || j.erro, j.hash);
        /* declaração COMPUTADA: o texto tem N camadas e a peça monta M. O
           que eu li não endereça a peça — e eu digo isso em vez de fingir. */
        if (j.camadas.length !== (u.L || []).length) {
          return semLeitura('a peça monta ' + (u.L || []).length + ' camadas e só ' +
            j.camadas.length + ' existem como texto no arquivo (o resto nasce de uma função)',
            j.hash);
        }
        E.hash = j.hash;
        UI.arqInfo.textContent = E.arq + '.js · ' + j.hash;
        u.L = JSON.parse(JSON.stringify(j.camadas));
        montarDe(JSON.parse(JSON.stringify(j.camadas)), false);
        estado('peça lida do disco · ' + j.camadas.length +
               ' camadas · clique numa para começar', '');
      })
      .catch(function () {
        /* UM SÓ ESCRITOR PARA A LINHA DE ESTADO. Com dois, o segundo apaga
           o primeiro: a tela acabava dizendo "somente-leitura", que é a
           CONSEQUÊNCIA, e engolia "estou mostrando memória", que é o fato
           sobre o que está na tela. Entre os dois, o que a pessoa precisa
           ler primeiro é de onde veio o que ela está vendo. */
        E.lendo = false;
        semLeitura('esta página não está sendo servida pelo servidor do editor', null);
      });
  }

  /* põe uma lista de camadas no ar e zera as DUAS linhas de base */
  function montarDe(camadas, provisorio) {
    E.L = camadas;
    E.orig = JSON.parse(JSON.stringify(camadas));
    E.noDisco = JSON.parse(JSON.stringify(camadas));
    E.hist.length = 0; E.futuro.length = 0;
    E.anunciarMontagem = !provisorio;
    remontar(false);
    atualizarBotoes();
  }

  /* NÃO CONSEGUI LER O DISCO. O que está na tela passa a ser estado de
     MEMÓRIA, e a tela tem de dizer isso. O proibido é assinar `salvo` ou
     `sem alteração` sobre um arquivo que eu não li. */
  function semLeitura(motivo, hashDisco) {
    E.deMemoria = true;
    E.hash = hashDisco || null;
    UI.arqInfo.textContent = hashDisco ? (E.arq + '.js · ' + hashDisco) : 'arquivo não lido';
    atualizarBotoes();
    /* a mensagem nomeia OS DOIS fatos, e na ordem em que eles importam:
       (1) o que você está vendo veio da MEMÓRIA, não do arquivo;
       (2) por isso nada vai ser gravado;  (3) como sair disso. */
    estado('MEMÓRIA: o que está na tela veio da memória da página, não do arquivo — ' +
      motivo + '. Nada será gravado. Recarregue a página para ler o disco; ' +
      comoSubir() + '.', 'alerta');
  }

  /* ==================================================================
     DELETE — apaga a camada marcada.
     ================================================================== */
  function apagarCamada() {
    if (!E.L || E.sel < 0 || E.sel >= E.L.length) {
      /* DELETE SEM NADA MARCADO não faz nada NEM grita errado: dizer
         "erro" aqui ensinaria a ignorar a linha de estado. */
      estado('nada marcado — clique numa camada (ou Tab) antes de apagar', '');
      return;
    }
    if (E.bloqueio || E.somenteLeitura || E.deMemoria) return;
    var i = E.sel, c = E.L[i], r = rotulo(c, i);
    var quebra = null;
    if (TEMA && typeof TEMA.quebra === 'function') {
      try { quebra = TEMA.quebra(c, i, { L: E.L, slug: E.slug }); } catch (e) { quebra = null; }
    }

    /* A CONFIRMAÇÃO SÓ EXISTE AQUI, e o argumento é este: em todo o resto
       do editor o estrago aparece na TELA que a pessoa está olhando, e por
       isso desfazer basta. Este é o único caso em que o estrago pode ser
       INVISÍVEL e acontecer DEPOIS, noutro processo. Confirmar é o que
       torna a consequência visível ANTES do fato. Camada comum não pede
       nada — assim a caixa não vira rotina que se clica sem ler. */
    if (quebra && !window.confirm(
        'Apagar ' + r.titulo + (r.corpo ? ' (' + r.corpo + ')' : '') + '?\n\n' +
        quebra + '\n\n' +
        'Isso é permitido — uma peça pode não ter esse vão.\n' +
        'Ctrl+Z desfaz e devolve a linha ao arquivo.')) {
      estado('não apaguei ' + r.titulo, '');
      return;
    }

    instantaneo();
    E.L.splice(i, 1);
    E.sel = -1;
    remontar(false);
    E.avisoGesto = 'apagada: ' + r.titulo + ' · ' + (r.corpo || r.glosa) +
      (quebra ? ' — ATENÇÃO: ' + quebra : '') +
      ' · Ctrl+Z desfaz e devolve a linha ao arquivo';
    estado(E.avisoGesto, 'alerta');
  }

  /* ==================================================================
     T — cria uma caixa de texto nova.

     AS TRÊS DECISÕES, com argumento:

     1. NASCE COM TEXTO, nunca vazia. Camada de texto vazia tem altura
        zero e não aparece — é o estado que esta mesma tela já marca com
        "vazia — não aparece na peça". Uma caixa que nasce assim nasce
        quebrada, e quem apertou `T` conclui que a tecla não funcionou. O
        texto de partida se anuncia como provisório.

     2. PAPEL `tx`, e não `tt`. `tx` é o papel de LEITURA; começar por
        título seria presumir o que a peça grita primeiro, que é decisão de
        composição e não default de ferramenta.

     3. ONDE CAI É O `z`. Centro horizontal, meia altura, 60% de largura —
        posição FIXA e previsível, não esperta. E `z = maior + 1`, senão
        ela pode nascer atrás de outra camada e parecer que a tecla falhou.
     ================================================================== */
  function novaCaixaDeTexto() {
    if (E.bloqueio || E.somenteLeitura || E.deMemoria || !E.L) return;
    var zMax = 0;
    E.L.forEach(function (x) { if (x.z != null && +x.z > zMax) zMax = +x.z; });
    var c = { t: 'tx', s: 36, lh: 1.32, tx: 'texto novo', box: [20, 45, 60, null], z: zMax + 1 };
    instantaneo();
    E.L.push(c);
    remontar(false);
    E.sel = E.L.length - 1;
    marcar(E.sel);
    trocarAba('camadas');
    var consumo = E.uso.c ? (Math.round(c.s * E.uso.c / E.uso.w * 10) / 10) : null;
    E.avisoGesto = 'criada: ' + rotulo(c, E.sel).titulo + ' · texto (`tx`) corpo 36' +
      (consumo ? ' (~' + consumo + ' px na largura de consumo)' : '') +
      ' · z=' + c.z + ', na frente das outras ' + (E.L.length - 1) +
      ' · o texto é provisório: troque no campo TEXTO ao lado';
    estado(E.avisoGesto, 'alerta');
    /* leva o foco pro campo de texto: quem apertou `T` quer escrever */
    var ta = UI.painel.querySelector('textarea');
    if (ta) { ta.focus(); ta.select(); }
  }

  /* ==================================================================
     PageUp/PageDown — muda o NÍVEL de pintura da camada marcada.
     `z` é ordem de pintura, não ordem de leitura — e sem um jeito de mudar
     `z` pelo teclado, a única forma de "trazer pra frente" era editar o
     número no painel sabendo de antemão qual `z` bate a camada de cima.
     PageUp/PageDown (e não `[`/`]`) porque no teclado ABNT2 os colchetes
     moram em teclas que variam de layout; PageUp é a mesma tecla em todos.
     Genérica por construção: só mexe em `z`, nenhum vocabulário de tema.
     ================================================================== */
  function mudarNivel(para) {
    if (E.sel < 0 || !E.L || E.somenteLeitura || E.bloqueio) return;
    var i = E.sel, c = E.L[i], o = ordemDePintura();
    var at = o.findIndex(function (x) { return x.i === i; });
    var ult = o.length - 1, destino;
    if (para === 'topo') destino = ult;
    else if (para === 'fundo') destino = 0;
    else if (para === 'sobe') destino = at + 1;
    else destino = at - 1;
    if (destino > ult || destino < 0 || destino === at) {
      estado(at === ult ? 'já está na frente de tudo' : 'já está no fundo', '');
      return;
    }
    var nova = o.map(function (x) { return x.i; });
    nova.splice(at, 1);
    nova.splice(destino, 0, i);
    instantaneo();
    nova.forEach(function (k, rank) {
      var efetivo = E.L[k].z == null ? 0 : +E.L[k].z;
      if (efetivo !== rank + 1) E.L[k].z = rank + 1;
    });
    remontar(true);
    var o2 = ordemDePintura();
    var p2 = o2.findIndex(function (x) { return x.i === i; });
    estado('nível: ' + rotulo(c, i).titulo + ' agora é a ' + (p2 + 1) + 'ª de ' + o2.length +
      ' (1 = fundo) · Ctrl+Z desfaz', 'alerta');
  }

  /* ==================================================================
     CAIXA DE TEXTO IN-PLACE — editar o `tx` diretamente sobre a peça,
     em vez de só pelo textarea do painel.

     Genérica por construção: usa `TEXTO_CAMADA` (núcleo,
     `editor/texto-camada.js`) para o vocabulário fechado
     (`<br>`,`<b>`,`<i>`,`[[..]]`), e nada de tema.

     A CORREÇÃO DE CURSOR (`posicaoMaisProxima`/`caixaAjustarCursor`) — a
     caixa da camada é mais larga que os glifos, então há faixa clicável
     antes da primeira letra e depois da última; nessas pontas o Chrome
     ancora no próprio DIV, e `anchorOffset:1` num DIV quer dizer "depois
     do primeiro filho" (o FIM do texto). Clicar no começo da linha mandava
     o cursor pro fim. A cura não adivinha intenção: só quando a seleção
     ancorou no CONTÊINER, procura entre as posições de cursor REAIS
     (medidas com `Range`, glifo a glifo) a mais próxima do ponto clicado.
     ================================================================== */
  var ZWSP = String.fromCharCode(0x200b);
  var CAIXA = { i: -1, no: null };
  var FECHANDO = false;

  /* `conhecido()` pergunta "algo aqui PINTA este tipo" (núcleo ou o
     gancho `tipos` do tema) — pergunta errada para um projeto com
     `montar.js` PRÓPRIO (CAD e outros projetos reais): lá `tipos` fica ausente DE
     PROPÓSITO porque quem pinta é o montador do projeto, não o núcleo.
     Quando o tema declarou `textoInPlace`, essa lista É a reivindicação
     de dono — não precisa passar por `conhecido()` de novo. Tema que não
     declarou a chave mantém o comportamento de sempre (`conhecido()`
     como segunda cerca), então nada muda para quem já funcionava. */
  function ehTexto(c) {
    if (!c || !TEXTO[c.t]) return false;
    return TEXTO_DO_TEMA ? true : conhecido(c);
  }

  function editarNaCaixa(i) {
    if (!podeEditar()) {
      estado('não dá para editar agora — ' +
        (E.somenteLeitura || 'a gravação está recusada'), 'alerta');
      return;
    }
    if (typeof TEXTO_CAMADA === 'undefined' || !TEXTO_CAMADA) {
      estado('a caixa in-place precisa de `editor/texto-camada.js` — não carregou', 'erro');
      return;
    }
    var c = E.L[i];
    if (!ehTexto(c)) return;
    var no = E.nos && E.nos[i];
    if (!no) { estado('não achei o nó desta camada no palco', 'erro'); return; }

    fecharCaixa(true);
    CAIXA.i = i; CAIXA.no = no;
    no.setAttribute('contenteditable', 'true');
    no.setAttribute('spellcheck', 'false');
    no.classList.add('editando');
    /* MODO TEXTO: as alças de geometria saem do caminho (ver `editar.css`).
       Não é enfeite — a alça `w` cobre o primeiro caractere. */
    if (UI.envelope) UI.envelope.classList.add('caixa-aberta');
    no.focus();
    var sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(no); r.collapse(false);
    sel.removeAllRanges(); sel.addRange(r);

    no.addEventListener('keydown', caixaTecla);
    no.addEventListener('paste', caixaCola);
    no.addEventListener('mouseup', caixaAjustarCursor);
    no.addEventListener('blur', caixaSaiu);

    estado('editando na peça: clique onde quiser escrever, arraste para selecionar, ' +
      'Enter quebra a linha, Ctrl+M marca o trecho, Esc fecha (as alças de ' +
      'tamanho ficam desligadas enquanto a caixa está aberta)', '');
    desenharMarcas();
  }

  function caixaTecla(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); fecharCaixa(); return; }
    if (ev.key === 'Enter') {
      /* ENTER É `<br>`, E SÓ `<br>`. Sem isto o contenteditable inventa
         `<div>` ou `<p>` por conta própria — e o vocabulário da declaração
         não tem nem um nem outro. */
      ev.preventDefault();
      var sel = window.getSelection();
      if (!sel.rangeCount) return;
      var r = sel.getRangeAt(0);
      r.deleteContents();
      var br = document.createElement('br');
      r.insertNode(br);
      var fim = document.createTextNode(ZWSP);
      br.parentNode.insertBefore(fim, br.nextSibling);
      var r2 = document.createRange();
      r2.setStart(fim, fim.length); r2.collapse(true);
      sel.removeAllRanges(); sel.addRange(r2);
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'm') {
      ev.preventDefault(); marcarTrecho(); return;
    }
  }

  /* O MARCADOR FECHA O CICLO: `[[palavra]]` na declaração vira `.mk` na
     tela, e a leitura de volta devolve `[[palavra]]`. Sem um gesto para
     criar um, o marcador só existiria para quem edita o arquivo a mão. */
  function marcarTrecho() {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      estado('selecione o trecho antes de marcar com Ctrl+M', 'alerta');
      return;
    }
    var r = sel.getRangeAt(0);
    var sp = document.createElement('span');
    sp.className = 'mk';
    try { r.surroundContents(sp); }
    catch (e) { sp.appendChild(r.extractContents()); r.insertNode(sp); }
    var r2 = document.createRange();
    r2.selectNodeContents(sp); r2.collapse(false);
    sel.removeAllRanges(); sel.addRange(r2);
    estado('trecho marcado — vai para a declaração como [[' +
      String(sp.textContent || '').slice(0, 18) + ']]', '');
  }

  /* A COLAGEM ENTRA JÁ LIMPA. Sanear só no fecho também funcionaria, mas
     até lá a tela mostraria uma formatação que não vai existir — quer
     dizer, mentiria por alguns segundos. */
  function caixaCola(ev) {
    ev.preventDefault();
    var dt = ev.clipboardData;
    if (!dt) return;
    var html = dt.getData('text/html');
    var puro = dt.getData('text/plain');
    var vindo;
    if (html) {
      /* parseFromString cria um Document SEM browsing context: <img onerror>,
         <svg onload> e afins não disparam porque não há contexto para
         carregar recurso nem rodar handler. innerHTML num div comum, mesmo
         desanexado do DOM, ainda pertence ao document vivo — dispara. Ver
         provas/xss-clipboard.js. */
      var docInerte = new DOMParser().parseFromString(html, 'text/html');
      vindo = TEXTO_CAMADA.daCaixa(docInerte.body);
    } else {
      vindo = TEXTO_CAMADA.sanear(puro || '');
    }
    var frag = document.createElement('div');
    frag.innerHTML = TEXTO_CAMADA.paraCaixa(vindo.texto);
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    r.deleteContents();
    var ult = null, n;
    while ((n = frag.firstChild)) {
      ult = n; r.insertNode(n); r.setStartAfter(n); r.collapse(true);
    }
    if (ult) {
      var r2 = document.createRange();
      r2.setStartAfter(ult); r2.collapse(true);
      sel.removeAllRanges(); sel.addRange(r2);
    }
    var d = vindo.descartes || [];
    estado(d.length
      ? ('colado SEM a formatação que não cabe na declaração: ' +
         d.slice(0, 6).join(', ') + '  |  o texto ficou, a marcação saiu')
      : 'colado — nada precisou ser descartado',
      d.length ? 'alerta' : '');
  }

  function posicaoMaisProxima(no, x, y) {
    var achado = null, menor = Infinity;
    var anda = function (n) {
      if (n.nodeType === 3) {
        for (var k = 0; k <= n.nodeValue.length; k++) {
          var r = document.createRange();
          r.setStart(n, k); r.setEnd(n, k);
          var c = r.getBoundingClientRect();
          /* distância com a LINHA pesando mais que a coluna: num texto de
             várias linhas, o vizinho certo é o da linha clicada. */
          var dy = Math.max(0, Math.max(c.top - y, y - c.bottom));
          var d = Math.abs(c.left - x) + dy * 1000;
          if (d < menor) { menor = d; achado = { no: n, off: k }; }
        }
        return;
      }
      for (var j = 0; j < n.childNodes.length; j++) anda(n.childNodes[j]);
    };
    anda(no);
    return achado;
  }

  function caixaAjustarCursor(ev) {
    var no = CAIXA.no;
    if (!no) return;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;   /* arrasto: é do usuário */
    if (sel.anchorNode !== no) return;                          /* o navegador acertou */
    var alvo = posicaoMaisProxima(no, ev.clientX, ev.clientY);
    if (!alvo) return;
    var r = document.createRange();
    r.setStart(alvo.no, alvo.off); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }

  function caixaSaiu() { fecharCaixa(); }

  function fecharCaixa(silencioso) {
    var i = CAIXA.i, no = CAIXA.no;
    if (i < 0 || !no || FECHANDO) return;
    FECHANDO = true;
    CAIXA.i = -1; CAIXA.no = null;
    no.removeEventListener('keydown', caixaTecla);
    no.removeEventListener('paste', caixaCola);
    no.removeEventListener('mouseup', caixaAjustarCursor);
    no.removeEventListener('blur', caixaSaiu);
    var lido = TEXTO_CAMADA.daCaixa(no);
    no.removeAttribute('contenteditable');
    no.classList.remove('editando');
    if (UI.envelope) UI.envelope.classList.remove('caixa-aberta');
    var c = E.L[i];
    if (!c) { FECHANDO = false; return; }
    var novo = String(lido.texto).split(ZWSP).join('');
    if (novo === String(c.tx == null ? '' : c.tx)) {
      if (!silencioso) estado('texto sem alteração', '');
      FECHANDO = false;
      remontar();
      return;
    }
    var antesVazio = !!vazia(i);
    instantaneo();
    c.tx = novo;
    FECHANDO = false;
    remontar();
    if (silencioso) return;
    var d = lido.descartes || [];
    if (!antesVazio && !!vazia(i)) {
      E.avisoGesto = 'a camada ' + rotulo(c, i).titulo + ' ficou SEM TEXTO — ' +
        'ela some da peça. Ctrl+Z desfaz.';
      estado(E.avisoGesto, 'alerta');
      return;
    }
    estado('texto gravado na camada ' + rotulo(c, i).titulo +
      (d.length ? '  |  DESCARTEI o que não cabe na declaração: ' +
        d.slice(0, 6).join(', ') : ''),
      d.length ? 'alerta' : '');
  }

  /* ==================================================================
     GERAR — botão opcional que roda o build DECLARADO pelo projeto
     (`editorhtml.tema.js` → `projeto.build`). O núcleo NÃO sabe o que é
     "build": ele só pede `/_api/gerar` com o slug aberto, mostra o log e
     o resultado. Sem `build` declarado o servidor recusa a rota e o botão
     nem aparece (`E.podeGerar`, lido do inventário). Só o genérico
     "gerar esta peça" entra no núcleo — uma lista fixa de slugs (para
     "gerar todas de um grupo") é vocabulário de projeto, não do editor,
     e fica de fora daqui por decisão, não por esquecimento.
     ================================================================== */
  var BUILD = { vigia: null };

  function pedirBuild(slugs) {
    if (E.bloqueio) { estado('não gero com a escrita bloqueada — resolva a recusa primeiro', 'erro'); return; }
    var pendente = paraGravar().length;
    if (pendente && !E.somenteLeitura && !E.deMemoria) {
      estado('gravando antes de gerar…', 'trabalhando');
      salvar(true);
      setTimeout(function () { pedirBuild(slugs); }, 900);
      return;
    }
    if (UI.gerar) UI.gerar.disabled = true;
    estado('pedindo o build de ' + slugs.length + ' peça(s)…', 'trabalhando');
    fetch('/_api/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: slugs }) })
      .then(function (r) { return r.json().then(function (j) { return { cod: r.status, j: j }; }); })
      .then(function (x) {
        if (x.cod !== 202) {
          if (UI.gerar) UI.gerar.disabled = false;
          estado('não gerei: ' + (x.j.msg || x.j.erro), 'erro');
          return;
        }
        vigiarBuild();
      })
      .catch(function (e) {
        if (UI.gerar) UI.gerar.disabled = false;
        estado('não gerei: ' + e.message, 'erro');
      });
  }
  function pintarBuild(j) {
    if (j.rodando) {
      if (UI.gerar) UI.gerar.disabled = true;
      var ult = (j.log || []).filter(function (l) { return l.indexOf('$ ') !== 0; }).pop();
      estado('gerando ' + j.slugs.length + ' peça(s) · ' + (j.passo || '') + (ult ? ' · ' + ult : ''), 'trabalhando');
      return true;
    }
    if (UI.gerar) UI.gerar.disabled = false;
    if (j.sucesso === true) {
      estado('build pronto · ' + j.slugs.join(', ') + ' — o PNG no disco agora é esta declaração', '');
    } else if (j.sucesso === false) {
      /* FALHA NÃO VIRA LINHA DE RODAPÉ: o log inteiro vai pro cartaz, que
         cobre o palco. Build que falha em silêncio devolve peça velha. */
      cartaz('o build falhou em: ' + (j.passo || '?'),
        (j.log || []).slice(-14).join('\n'),
        { rotulo: 'Voltar à peça', fn: semCartaz });
    }
    return false;
  }
  function olharBuild() {
    if (!E.podeGerar) return;
    fetch('/_api/gerar').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.rodando) vigiarBuild();
    }).catch(function () {});
  }
  function vigiarBuild() {
    if (BUILD.vigia) return;
    BUILD.vigia = setInterval(function () {
      fetch('/_api/gerar').then(function (r) { return r.json(); }).then(function (j) {
        if (!pintarBuild(j)) { clearInterval(BUILD.vigia); BUILD.vigia = null; }
      }).catch(function () { clearInterval(BUILD.vigia); BUILD.vigia = null; });
    }, 1200);
  }

  /* ================================================================== */
  /* TECLADO. A peça toda tem de ser alcançável sem mouse — e o passo do
     teclado é o que dá precisão que o arrasto não dá.                   */
  function teclas(ev) {
    var dentro = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) refazer(); else desfazer();
      return;
    }
    /* A GUARDA DE FOCO VEM ANTES DAS LETRAS. Com o cursor num campo, `t`
       é a letra `t` — e o campo TEXTO do painel é justamente onde mais se
       digita. Atalho de letra que dispara enquanto se escreve é o defeito
       clássico deste tipo de tecla. */
    if (dentro || ev.target.isContentEditable) return;
    if (ev.key === 'Delete' || ev.key === 'Del') { ev.preventDefault(); apagarCamada(); return; }
    if ((ev.key === 't' || ev.key === 'T') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault(); novaCaixaDeTexto(); return;
    }
    if (ev.key === 'Escape') { E.sel = -1; desenharMarcas(); pintarLista(); pintarPainel();
      estado('nada marcado', ''); return; }
    if (ev.key === 'Tab' && E.L) {
      var o = ordemDePintura();
      var at = o.findIndex(function (x) { return x.i === E.sel; });
      var prox = ev.shiftKey ? at - 1 : at + 1;
      if (prox >= 0 && prox < o.length) { ev.preventDefault(); marcar(o[prox].i); }
      return;
    }
    if (!E.L || E.sel < 0 || E.somenteLeitura || E.bloqueio) return;
    /* PageUp/PageDown e não `[`/`]`: ver `mudarNivel` acima. */
    if (ev.key === 'PageUp' || ev.key === 'PageDown') {
      ev.preventDefault();
      mudarNivel(ev.key === 'PageUp' ? (ev.shiftKey ? 'topo' : 'sobe') : (ev.shiftKey ? 'fundo' : 'desce'));
      return;
    }
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    var passo = ev.shiftKey ? 1 : 0.1;
    instantaneo();
    var c = E.L[E.sel], b = (c.box || [0, 0, 100, 100]).slice();
    b[0] = pct(b[0] + d[0] * passo); b[1] = pct(b[1] + d[1] * passo);
    c.box = b;
    remontar();
    estado('x ' + b[0] + '%  y ' + b[1] + '% · ' + contarEdicoes() + ' por gravar', 'alerta');
  }

  /* ================================================================== */
  function ligarUI() {
    UI.app = $('#app'); UI.app.hidden = false;
    UI.meio = $('#meio'); UI.palco = $('#palco'); UI.marcas = $('#marcas');
    UI.envelope = $('#envelope'); UI.cartaz = $('#cartaz');
    UI.camadas = $('#camadas'); UI.painel = $('#painel-corpo');
    UI.estado = $('#estado'); UI.cont = $('#cont-edicoes'); UI.arqInfo = $('#arquivo-info');
    UI.gravar = $('#btn-gravar'); UI.patch = $('#btn-patch');
    UI.desfazer = $('#btn-desfazer'); UI.refazer = $('#btn-refazer');
    UI.descartar = $('#btn-descartar'); UI.sel = $('#sel-peca');
    UI.selo = $('#selo'); UI.auto = $('#chk-auto');
    UI.abaCamadas = $('#aba-camadas'); UI.abaEstante = $('#aba-estante');
    UI.pnCamadas = $('#pn-camadas'); UI.pnEstante = $('#pn-estante');
    UI.familias = $('#familias'); UI.conta = $('#conta-acervo');
    UI.busca = $('#busca-asset'); UI.impedidos = $('#chk-impedidos');
    UI.bloqueio = $('#bloqueio'); UI.bloqTit = $('#bloqueio-tit');
    UI.bloqTxt = $('#bloqueio-txt'); UI.bloqAcoes = $('#bloqueio-acoes');
    UI.bloqCola = $('#bloqueio-cola');
    /* opcional: só existe no HTML se o tema/config quiser o botão visível
       desde já — `iniciar()` decide se ele aparece, a partir do inventário. */
    UI.gerar = $('#btn-gerar');
    if (UI.gerar) UI.gerar.onclick = function () { pedirBuild([E.slug]); };

    UI.abaCamadas.onclick = function () { trocarAba('camadas'); };
    UI.abaEstante.onclick = function () { trocarAba('estante'); };
    UI.busca.oninput = function () { EST.busca = UI.busca.value; pintarEstante(); };
    UI.impedidos.onchange = function () {
      EST.mostrarImpedidos = UI.impedidos.checked;
      pintarEstante();
      estado(EST.mostrarImpedidos
        ? 'mostrando também o que NÃO se pode usar — esses cartões não arrastam'
        : 'mostrando só o que se pode usar', '');
    };

    E.auto = UI.auto.checked;
    UI.auto.onchange = function () {
      E.auto = UI.auto.checked;
      if (E.auto) { estado('salvamento contínuo LIGADO — cada gesto vai pro disco', ''); agendarSalvar(); }
      else { clearTimeout(E.timer);
             estado('salvamento contínuo DESLIGADO — use “Gravar agora”; nada vai pro disco sozinho', 'alerta'); }
      atualizarBotoes();
    };

    /* o envelope de zoom: a peça escala, a marcação não */
    UI.zoom = document.createElement('div');
    UI.zoom.id = 'zoom';
    UI.zoom.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0';
    UI.envelope.insertBefore(UI.zoom, UI.palco);
    UI.zoom.appendChild(UI.palco);

    UI.desfazer.onclick = desfazer;
    UI.refazer.onclick = refazer;
    UI.descartar.onclick = descartar;
    UI.gravar.onclick = gravar;
    UI.patch.onclick = verPatch;
    UI.sel.onchange = function () { abrir(UI.sel.value); };

    /* DUPLO CLIQUE ENTRA NA CAIXA in-place. Fica nas MARCAS e não no palco
       porque o palco é a peça montada: escutar lá competiria com o
       arrasto, e o gesto de texto tem de ser deliberado. */
    UI.marcas.addEventListener('dblclick', function (ev) {
      if (E.sel < 0) return;
      if (!ehTexto(E.L[E.sel])) {
        estado('esta camada não tem texto para editar', ''); return;
      }
      ev.preventDefault();
      editarNaCaixa(E.sel);
    });

    /* marcar e arrastar */
    UI.marcas.style.pointerEvents = 'none';
    UI.envelope.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      if (!E.L) return;
      var alca = ev.target.classList && ev.target.classList.contains('alca')
        ? ev.target.dataset.dir : null;
      if (alca) { ev.preventDefault(); iniciarGesto(ev, alca); return; }
      var p = pontoNativo(ev);
      var i = escolherPressionar(p.x, p.y);
      if (i < 0) { E.sel = -1; E.ciclo.x = -9e9; desenharMarcas(); pintarLista(); pintarPainel();
        estado('nada nesse ponto — clique numa camada ou escolha na lista', ''); return; }
      ev.preventDefault();
      E.selecionouAgora = (i !== E.sel);
      if (i !== E.sel) marcar(i);
      iniciarGesto(ev, null, p);
    });

    window.addEventListener('keydown', teclas);
    window.addEventListener('resize', function () {
      if (E.uso) { escalar(); desenharMarcas(); }
    });
  }

  /* O EDITOR PERGUNTA AO SERVIDOR O QUE EXISTE. Não há lista de peças
     escrita à mão em lugar nenhum: o inventário é lido do disco, então
     criar um arquivo novo em `pecas/` e recarregar basta. */
  function iniciar() {
    ligarUI();
    estado('lendo o inventário…', 'trabalhando');
    fetch('/_api/inventario').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.msg) || 'inventário inválido');
      E.usos = j.usos || [];
      E.campos = j.campos || E.campos;
      E.problemas = j.problemas || [];
      /* O BOTÃO GERAR SÓ EXISTE SE O PROJETO DECLAROU UM BUILD
         (`editorhtml.tema.js` → `projeto.build`). Sem isso `/_api/gerar`
         nem responde, e um botão que sempre erra é pior que ausente. */
      E.podeGerar = !!j.podeGerar;
      if (UI.gerar) { UI.gerar.hidden = !E.podeGerar; }
      if (E.podeGerar) olharBuild();

      /* ARQUIVO QUE NÃO CARREGOU APARECE. Some da lista e quem escreveu
         conclui que apagou a peça sem querer. */
      if (E.problemas.length) {
        UI.painel.appendChild((function () {
          var g = el('div', 'grupo');
          g.appendChild(el('h2', null, 'O inventário reclamou'));
          E.problemas.forEach(function (p) { g.appendChild(el('div', 'aviso', p)); });
          return g;
        })());
      }
      if (j.erroTema) {
        estado('o tema não carregou: ' + j.erroTema +
               ' — o editor continua funcionando com os quatro tipos do núcleo.', 'alerta');
      }

      if (!E.usos.length) {
        /* VAZIO NOMEADO, com o caminho para sair dele. Tela em branco aqui
           faria a pessoa achar que a ferramenta quebrou. */
        cartaz('nenhuma peça encontrada',
          'Não achei nenhum `.js` que exporte `{ pecas: [...] }` em ' + (j.dirPecas || 'pecas/') +
          '. Crie um arquivo lá com uma peça declarando `slug`, `w`, `h` e `L`, e recarregue.');
        estado('nenhuma peça em ' + (j.dirPecas || 'pecas/'), 'alerta');
        return;
      }

      /* a lista, agrupada por ARQUIVO — que é a unidade de escrita, e por
         isso a unidade que importa saber ao escolher */
      var porArq = {};
      E.usos.forEach(function (u) { (porArq[u.g] = porArq[u.g] || []).push(u); });
      Object.keys(porArq).sort().forEach(function (g) {
        var grupo = document.createElement('optgroup');
        grupo.label = g + '.js';
        porArq[g].forEach(function (u) {
          var o = document.createElement('option');
          o.value = u.slug;
          o.textContent = u.slug + (u.n && u.n !== u.slug ? ' — ' + u.n : '');
          grupo.appendChild(o);
        });
        UI.sel.appendChild(grupo);
      });

      /* DUAS FORMAS DE CHEGAR NUMA PEÇA, e a ordem entre elas importa.

         · `#slug` é o endereço EXATO de uma peça, e é o que o próprio
           editor escreve na barra a cada troca — por isso ele ganha.
         · `?arq=cartao` é o que a CLI manda quando alguém abre um ARQUIVO
           (`npx editorhtml abrir pecas/cartao.js`). Arquivo não é peça: um
           arquivo tem várias. Aqui ele vira "a primeira peça deste
           arquivo", que é a leitura honesta do pedido.

         Nenhum dos dois é obrigatório, e um valor que não existe não é
         erro — é a primeira peça, com a lista mostrando por quê. Recusar a
         abrir porque a âncora envelheceu seria travar a ferramenta num
         detalhe de URL. */
      var busca = new URLSearchParams(location.search);
      var pedidoArq = busca.get('arq');
      var inicial = (location.hash || '').replace(/^#/, '');
      if (!E.usos.some(function (u) { return u.slug === inicial; })) inicial = null;
      if (!inicial && pedidoArq) {
        var doArq = E.usos.filter(function (u) { return u.g === pedidoArq; })[0];
        if (doArq) inicial = doArq.slug;
        else estado('não achei nenhuma peça no arquivo `' + pedidoArq + '.js` — ' +
                    'abri a primeira da lista', 'alerta');
      }
      if (!inicial) inicial = E.usos[0].slug;
      UI.sel.value = inicial;
      abrir(inicial);
    }).catch(function (err) {
      /* SEM SERVIDOR NÃO HÁ EDITOR, e isso se diz na chegada — não se
         descobre no primeiro arrasto que não gravou. */
      cartaz('esta página não está sendo servida pelo editor',
        'Não consegui ler `/_api/inventario`: ' + (err && err.message) + '. ' +
        comoSubir() + '.');
      estado('sem servidor: nada carrega e nada grava', 'erro');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  /* exposto só para o instrumento de prova dirigir a tela de fora */
  window.__EDITOR = { E: E, abrir: abrir, marcar: marcar, edicoes: edicoes,
                      remontar: remontar, retangulo: retangulo, ordemDePintura: ordemDePintura,
                      escolher: escolherPressionar, candidatos: candidatos, rotulo: rotulo,
                      apagarCamada: apagarCamada, novaCaixaDeTexto: novaCaixaDeTexto,
                      trocarAba: trocarAba, salvar: salvar, paraGravar: paraGravar,
                      conhecido: conhecido, tema: TEMA,
                      mudarNivel: mudarNivel, ehTexto: ehTexto, editarNaCaixa: editarNaCaixa,
                      fecharCaixa: fecharCaixa, marcarTrecho: marcarTrecho,
                      pedirBuild: pedirBuild };
})();
