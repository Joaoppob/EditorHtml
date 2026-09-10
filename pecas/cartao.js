/* =====================================================================
   pecas/cartao.js — duas peças de exemplo, no formato que o editor lê.

   ESTE ARQUIVO É O PONTO DA COISA TODA. Ele é comentário de doutrina em
   cima de número, e é assim que uma declaração escrita por um Agente
   costuma ser: o número diz ONDE, o comentário diz POR QUÊ. O editor
   escreve de volta só o TOKEN do número — todo bloco de comentário deste
   arquivo sai byte a byte como entrou depois de qualquer edição. Se um
   dia não sair, `provas/escrita.js` reprova antes de você notar.

   O FORMATO, EM UMA FRASE: `box:[x,y,largura,altura]` em % do nativo
   declarado em `w`/`h`. `altura: null` = automática, do conteúdo.

   `c` é a largura de CONSUMO — quantos px esta peça realmente ocupa na
   tela de quem vê. Ela não muda nada na montagem; serve para o editor
   dizer "corpo 72 no nativo vira ~28 px onde isto vai ser lido", que é a
   única pergunta que importa antes de escolher um corpo.
   ===================================================================== */
'use strict';

module.exports = { pecas: [

  /* ------------------------------------------------------------------
     CAPA. O nativo é 1080×1350 (4:5) porque é o retrato mais alto que a
     maioria dos feeds não recorta. A margem é 6% dos dois lados — número
     desta peça, não constante do sistema: peça mais densa pede menos,
     peça de respiro pede mais, e fixar isso num tema faria o tema decidir
     composição.

     A ORDEM DA PILHA É `z`, NÃO A ORDEM DO ARQUIVO. Elemento posicionado
     empilha por z-index e, em empate, por ordem no documento. Declarar
     `z` em tudo o que se sobrepõe é o que torna a pilha legível para quem
     lê o arquivo sem abrir o editor.
     ------------------------------------------------------------------ */
  { slug:'cartao-capa', n: 'Capa', w: 1080, h: 1350, c: 430, cls: 'breu', L: [
    /* o vão do retrato entra PRIMEIRO e no fundo: ele é o que a composição
       inteira se ajusta ao redor, então mexer nele move o resto do olho */
    { t: 'reserva', k: 'retrato', box:[6,8,88,46], z: 1 },
    { t: 'fio', cor: 'barro', box:[6,58,88,0.35], z: 2 },
    { t: 'selo', cor: 'anil', s: 26, tx: 'exemplo', box:[6,61.5,30,null], z: 4 },
    /* CORPO 96 NO NATIVO ≈ 38 PX NA LARGURA DE CONSUMO. É esse o número
       que decide se a manchete grita — o 96 sozinho não diz nada. */
    { t: 'tt', s: 96, lh: 0.98, tx: 'Um editor<br>de peça HTML', box:[6,67,82,null], z: 5 },
    { t: 'tx', s: 34, lh: 1.42, tx: 'Arraste a camada. O número volta pra dentro da declaração, e o comentário fica.', box:[6,84,74,null], z: 5 },
    /* ESTE `kk` NÃO EXISTE NEM NO NÚCLEO NEM NO TEMA, E É DE PROPÓSITO.
       É a prova viva da regra: tipo que ninguém sabe pintar aparece como
       caixa tracejada com o nome escrito, continua arrastável e continua
       gravável. Some da tela em silêncio é o que não pode. */
    { t: 'kk', s: 20, tx: 'tipo sem dono', box:[70,61.5,24,4], z: 4 }
  ] },

  /* ------------------------------------------------------------------
     VERSO. Peça de regime claro (sem `cls`), para provar que o mesmo
     motor e o mesmo editor atendem os dois sem ramo especial.

     A CAMADA DE TEXTO ABAIXO ESTÁ QUEBRADA EM DUAS LINHAS de propósito.
     Uma declaração longa cabe melhor lida em duas, e o editor tem de
     gravar nela sem estranhar: o splice preserva a quebra byte a byte, e
     o diff sai com o número de linhas que o RECORTE previa — nunca um `1`
     fixo, que reprovaria uma escrita correta.
     ------------------------------------------------------------------ */
  { slug:'cartao-verso', n: 'Verso', w: 1080, h: 1350, c: 430, L: [
    { t: 'tt', s: 64, lh: 1.02, tx: 'O que ele faz', box:[6,10,70,null], z: 3 },
    { t: 'tx', s: 30, lh: 1.5,
      tx: 'Marca uma camada, arrasta, redimensiona, ajusta corpo e entrelinha, troca o texto — e grava de volta no arquivo sem reserializar nada.',
      box:[6,22,76,null], z: 3 },
    { t: 'fio', box:[6,44,88,0.28], z: 2 },
    { t: 'obj', src: './temas/exemplo/assets/losango.svg', box:[6,50,22,18], z: 3 },
    /* O VÃO DA ASSINATURA. Ele não imprime nada — é contrato com o passo
       que vem depois do build. Por isso é a camada mais fácil de apagar
       por engano e a menos segura de fato: o editor pergunta antes. */
    { t: 'reserva', k: 'assinatura', box:[6,86,50,8], z: 1 }
  ] }

]};
