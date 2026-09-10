/* =====================================================================
   pecas/folheto.js — o segundo exemplo, e o caso difícil.

   Uma das duas peças aqui declara as camadas por FUNÇÃO
   (`L: [...].concat(pauta(...))`). Isso é legítimo — repetir 12 linhas de
   pauta à mão é pior — mas cria um problema real para qualquer editor que
   escreva de volta: o arquivo tem 4 camadas COMO TEXTO e a peça monta 16.
   Camada gerada não tem número no arquivo pra trocar.

   A resposta certa não é adivinhar, e também não é fingir que deu certo.
   O editor abre a peça, deixa medir e olhar, e diz que ela é
   somente-leitura AQUI, com o motivo. `provas/escrita.js` cobra os dois
   lados disso: que a peça computada seja recusada, e — o que importa mais
   — que a peça VIZINHA continue gravável. Recusa global pareceria rigor e
   seria cegueira.
   ===================================================================== */
'use strict';

/* a pauta: `n` linhas horizontais a partir de `y0`, de `passo` em passo.
   Cada uma vira camada de verdade na montagem — e nenhuma delas existe
   como texto neste arquivo. É esse o ponto. */
function pauta(n, y0, passo) {
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push({ t: 'fio', box:[10,+(y0 + i * passo).toFixed(2),80,0.12], z: 1 });
  }
  return out;
}

module.exports = { pecas: [

  /* ------------------------------------------------------------------
     FOLHA. Nativo A4 em px de 150 dpi (1240×1754). Peça editável inteira:
     as seis camadas existem como texto, então tudo aqui grava.
     ------------------------------------------------------------------ */
  { slug:'folheto-folha', n: 'Folha A4', w: 1240, h: 1754, c: 800, L: [
    { t: 'fio', cor: 'mel', box:[0,0,100,1.2], z: 2 },
    { t: 'tt', s: 108, lh: 0.98, tx: 'Peça de<br>[[papel]]', box:[8,8,70,null], z: 3 },
    { t: 'tx', s: 26, lh: 1.5,
      tx: 'O marcador de duplo colchete põe a palavra sobre a cor de acento. É vocabulário do motor, não invenção do editor.',
      box:[8,26,58,null], z: 3 },
    { t: 'obj', src: './temas/exemplo/assets/losango.svg', box:[70,24,22,16], z: 3 },
    /* IMAGEM QUE NÃO EXISTE, DECLARADA DE PROPÓSITO. É o estado feio que
       precisa aparecer na tela: o vão fica riscado de vermelho e o painel
       diz qual arquivo faltou. Sem isto, imagem quebrada fica idêntica a
       uma reserva vazia — e as duas mentem a mesma coisa por motivos
       diferentes. Aponte o `src` para um arquivo seu e o aviso some. */
    { t: 'obj', src: './temas/exemplo/assets/nao-existe.svg', box:[8,46,26,14], z: 3 },
    { t: 'reserva', k: 'assinatura', box:[8,88,40,5], z: 1 }
  ] },

  /* ------------------------------------------------------------------
     ÍNDICE — a declaração COMPUTADA. Quatro camadas de texto, doze de
     pauta que nascem da função. O editor abre, mede e mostra; não grava.
     ------------------------------------------------------------------ */
  { slug:'folheto-indice', n: 'Índice (declaração computada)', w: 1240, h: 1754, c: 800, L: [
    { t: 'tt', s: 72, lh: 1.0, tx: 'Índice', box:[10,8,50,null], z: 3 },
    { t: 'tx', s: 22, lh: 1.45, tx: 'As doze linhas abaixo nascem de uma função — esta peça é somente-leitura no editor.', box:[10,15,62,null], z: 3 },
    { t: 'fio', cor: 'barro', box:[10,22,80,0.3], z: 2 },
    { t: 'reserva', k: 'assinatura', box:[10,90,40,5], z: 1 }
  ].concat(pauta(12, 26, 4.2)) }

]};
