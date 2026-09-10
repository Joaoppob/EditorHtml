/* =====================================================================
   provas/higiene.js — o que não se vê olhando o arquivo.
       node provas/higiene.js

   DUAS COISAS QUE PASSAM EM QUALQUER LEITURA E MESMO ASSIM ESTÃO ERRADAS:

   1. CARACTERE DE CONTROLE NO CÓDIGO. Um `\b` escrito por uma ferramenta
      que come a barra invertida vira um BACKSPACE de verdade dentro de uma
      expressão regular — e o arquivo continua abrindo, continua colorindo
      no editor, e a regex passa a testar outra coisa. Aconteceu enquanto
      esta suíte era escrita, e o sintoma foi um controle que reprovava
      dizendo que a classe estava lá.

   2. NOME QUE NÃO PODIA ATRAVESSAR. Este repositório foi extraído de um
      projeto privado. Nome de cliente, de pessoa e de paleta ficam para
      trás por decisão, e decisão que ninguém confere é decisão que
      envelhece. Aqui ela vira controle: a lista abaixo é varrida a cada
      execução, e um achado só reprova.

   O CONTROLE POSITIVO VEM JUNTO: a varredura precisa provar que ACHA
   alguma coisa, senão um bug que a fizesse não ler arquivo nenhum passaria
   como "limpo".
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
let pulados = 0;

const RAIZ = path.resolve(__dirname, '..');
const EXT = /\.(js|css|html|svg|md|json)$/i;
const PULA = new Set(['.git', 'node_modules', '.claude']);

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok   ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}

function arquivos(dir, saida) {
  saida = saida || [];
  for (const f of fs.readdirSync(dir)) {
    if (PULA.has(f)) continue;
    const alvo = path.join(dir, f);
    const st = fs.statSync(alvo);
    if (st.isDirectory()) arquivos(alvo, saida);
    else if (EXT.test(f)) saida.push(alvo);
  }
  return saida;
}

const rel = a => path.relative(RAIZ, a).split(path.sep).join('/');

/* DOIS ARQUIVOS FICAM DE FORA, E OS DOIS MOTIVOS SÃO DIFERENTES.

   · `provas/higiene.js` — este arquivo. Ele CONTÉM a lista de proibidos;
     varrer-se a si mesmo seria acusar o detector pela existência do
     detector. É a isenção clássica do varredor, e ela é estreita: um
     arquivo, nomeado, não um padrão `provas/*`.

   · `LINHA-DE-CORTE.md` — o contrato de extração, escrito para os
     executores desta obra e não para quem vai usar o editor. Ele nomeia o
     projeto de origem em quase toda página, e por isso REPROVA de verdade
     nesta varredura. Isentá-lo aqui não o aprova para publicação: ele
     precisa sair do repositório antes de ir a público, e isto está
     reportado. A isenção existe para o controle medir o CÓDIGO, que é o
     que a extração produziu. */
const ISENTOS = new Set(['provas/higiene.js', 'provas/termos-privados.json']);
const TODOS = arquivos(RAIZ).filter(a => !ISENTOS.has(rel(a)));

/* =====================================================================
   H1 · CARACTERE DE CONTROLE
   ===================================================================== */
console.log('\nH1 · nenhum caractere de controle escondido no código');
/* tudo abaixo de 0x20 menos tab (0x09) e quebra de linha (0x0a/0x0d) */
const CTRL = new RegExp("[\u0000-\u0008\u000b\u000c\u000e-\u001f]", "g");
const sujos = [];
for (const a of TODOS) {
  const s = fs.readFileSync(a, 'utf8');
  const m = s.match(CTRL);
  if (m) sujos.push(rel(a) + ': ' + m.length + ' (' +
    m.map(c => 'U+' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ') + ')');
}
ok(sujos.length === 0, 'H1a · os ' + TODOS.length + ' arquivos estão limpos',
  sujos.join('\n        '));
/* CONTROLE POSITIVO: a varredura ACHA quando há. Sem isto, um bug que
   fizesse `arquivos()` devolver lista vazia passaria como aprovação. */
ok(CTRL.test('x' + String.fromCharCode(8) + 'y'), 'H1b · positivo: a varredura reconhece um backspace de verdade');
ok(TODOS.length > 8, 'H1c · positivo: a varredura leu ' + TODOS.length +
  ' arquivos — ela não passou por lista vazia');

/* =====================================================================
   H2 · NADA DO PROJETO DE ORIGEM ATRAVESSA
   ===================================================================== */
console.log('\nH2 · nenhum nome do projeto privado de origem');
/* Palavra inteira, sem acento no padrão para não depender de normalização.
   A lista é curta de propósito: cada termo aqui é um nome próprio ou um
   valor de paleta que pertence a outro projeto. */
/* A LISTA NAO MORA AQUI, E ISSO E O PONTO. Um varredor que escreve o que
   proibe PUBLICA a propria lista: quem ler este arquivo aprende o nome do
   projeto privado de onde o codigo saiu. Entao os termos vem de
   `provas/termos-privados.json`, que fica fora do controle de versao.

   SEM O ARQUIVO, H2 E PULADA — nunca aprovada. Silencio lido como
   aprovacao e o modo de falha que esta suite existe para impedir, e uma
   verificacao que some quando falta o insumo e exatamente isso. */
const LISTA = path.join(__dirname, 'termos-privados.json');
if (!fs.existsSync(LISTA)) {
  console.log('  PULADO  H2 - sem `provas/termos-privados.json` a varredura de nome '
    + 'de origem NAO RODOU.');
  console.log('          Isto nao e aprovacao: e ausencia de verificacao. '
    + 'Quem publicar sem rodar, publica sem conferir.');
  pulados += 4;
} else {
  const doc = JSON.parse(fs.readFileSync(LISTA, 'utf8'));
  const PROIBIDOS = doc.termos.map(function (t) { return new RegExp(t.src, t.flags); });
  const achados = [];
  for (const a of TODOS) {
    const s = fs.readFileSync(a, 'utf8');
    for (const re of PROIBIDOS) {
      const m = s.match(re);
      if (m) achados.push(rel(a) + ': ' + JSON.stringify(m[0]) + '  (padrao ' + re + ')');
    }
  }
  /* O PROPRIO ARQUIVO DE TERMOS nao entra na varredura — ele E a lista. */
  ok(achados.length === 0, 'H2a · nenhum dos ' + PROIBIDOS.length +
    ' padroes proibidos aparece nos ' + TODOS.length + ' arquivos',
    achados.slice(0, 12).join('\n        '));
  /* CONTROLE POSITIVO da mesma varredura: ela pega o que tem de pegar.
     As iscas vem do mesmo arquivo — se a lista mudar, o controle muda junto
     e nao envelhece amarrado a um valor escrito a mao aqui. */
  ok(PROIBIDOS.some(function (re) { return re.test(doc.positivo_hex); }),
    'H2b · positivo: a varredura reconhece um hex da paleta de origem');
  ok(PROIBIDOS.some(function (re) { return re.test(doc.positivo_nome); }),
    'H2c · positivo: e reconhece um nome proprio');
  /* e o NEGATIVO do positivo: ela nao pega o vocabulario legitimo daqui */
  ok(!PROIBIDOS.some(function (re) { return re.test('o tema exemplo usa barro #E4572E e anil #2B5BD7'); }),
    'H2d · discriminacao: a paleta AUTORAL deste repositorio nao e acusada — ' +
    'a lista proibe nome de outro projeto, nao a palavra "cor"');
}

/* A ISENCAO SO E HONESTA SE O ARQUIVO NAO PUDER SER PUBLICADO.
   `termos-privados.json` contem, por construcao, todos os termos que esta
   suite proibe — entao ela o isenta. Isentar por acreditar seria trocar um
   detector por uma promessa. Aqui a promessa se CONFERE: pergunta-se ao
   proprio git se o arquivo esta ignorado. Se um dia alguem tirar a linha do
   `.gitignore`, este controle cai e a isencao deixa de valer no mesmo
   instante. */
try {
  const cp = require('child_process');
  cp.execSync('git check-ignore -q provas/termos-privados.json',
    { cwd: RAIZ, stdio: 'ignore' });
  ok(true, 'H2e · o arquivo isentado esta ignorado pelo git — a isencao nao '
    + 'pode virar vazamento (conferido em `git check-ignore`, nao suposto)');
} catch (e) {
  ok(false, 'H2e · o arquivo isentado NAO esta ignorado pelo git — a isencao '
    + 'virou um buraco: `provas/termos-privados.json` pode ser publicado');
}

/* =====================================================================
   H3 · NENHUMA FONTE EMBARCADA
   ===================================================================== */
console.log('\nH3 · nenhum binário de fonte tipográfica no repositório');
const FONTES = [];
(function anda(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (PULA.has(f)) continue;
    const alvo = path.join(dir, f);
    if (fs.statSync(alvo).isDirectory()) anda(alvo);
    else if (/\.(woff2?|ttf|otf|eot)$/i.test(f)) FONTES.push(rel(alvo));
  }
})(RAIZ);
ok(FONTES.length === 0, 'H3a · nenhum arquivo de fonte (' + FONTES.join(', ') + ')');
/* e nenhuma referência a fonte hospedada fora: um `@import` de CDN é a
   mesma dependência com outro nome, e ela quebra offline. */
const CDN = [];
for (const a of TODOS) {
  const s = fs.readFileSync(a, 'utf8');
  if (/fonts\.(googleapis|gstatic)\.com|@font-face/i.test(s)) CDN.push(rel(a));
}
ok(CDN.length === 0, 'H3b · nenhuma fonte carregada de fora nem `@font-face`',
  CDN.join(', '));

console.log('\n' + (falhas ? 'REPROVOU' : 'PASSOU') + ' — ' + (checks - falhas) + '/' + checks + ' controles');
process.exit(falhas ? 1 : 0);
