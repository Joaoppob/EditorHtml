#!/usr/bin/env node
'use strict';

/**
 * CLI do EditorHtml.
 *
 *   npx editorhtml servir             serve pecas/ e abre a lista no navegador
 *   npx editorhtml abrir <caminho>    serve o diretório do arquivo e abre naquela peça
 *
 * ---------------------------------------------------------------------------
 * ESTE ARQUIVO NÃO ESCOLHE PORTA, E ISSO É A COISA MAIS IMPORTANTE AQUI.
 *
 * Ele já escolheu, e o resultado foi um usuário aberto na tela de outro
 * projeto. O mecanismo era: abrir um socket de teste em `127.0.0.1:P`, ver se
 * ligava, fechar, e mandar o servidor subir em P. Mas o servidor não liga em
 * `127.0.0.1` — ele liga no curinga (`0.0.0.0`/`::`). No Windows dá pra
 * segurar `127.0.0.1:P` enquanto outro processo já segura `0.0.0.0:P`. Então:
 *
 *   1. o teste dizia "P está livre"
 *   2. o servidor tentava o curinga, tomava EADDRINUSE e MORRIA
 *   3. o CLI fazia `GET /` em P para "confirmar que subiu"
 *   4. o servidor ALHEIO respondia 200
 *   5. o CLI abria o navegador na tela do vizinho
 *
 * Duas mentiras encadeadas: validar a porta com um binder que não é o da
 * produção, e depois confirmar identidade com uma checagem que não distingue
 * o meu servidor do de outra pessoa.
 *
 * A cura não foi consertar o teste — foi APAGAR o teste e mudar o dono da
 * decisão. Hoje:
 *
 *   · `editor/servir.js` tenta a porta pedida e anda para a próxima em
 *     EADDRINUSE. `listen()` é a única frase em que "está livre" e "consegui
 *     ligar" são a mesma coisa.
 *   · Ele ANUNCIA onde subiu, numa linha de formato estável.
 *   · Este CLI LÊ o anúncio. Não deduz, não tenta adivinhar, não chuta URL.
 *   · E confere que quem responde naquela porta é o processo que ELE subiu,
 *     comparando um token que ele mesmo injetou no ambiente do filho.
 *
 * Se o anúncio não vier, este CLI diz que não subiu e não oferece endereço
 * nenhum. Endereço errado é pior que endereço nenhum: o primeiro gasta a
 * confiança de quem seguiu.
 *
 * ---------------------------------------------------------------------------
 * O CONTRATO DE ANÚNCIO (documentado aqui porque é interface entre dois
 * arquivos, e interface não documentada envelhece calada):
 *
 *   Uma linha em stdout, prefixo `EDITORHTML_NO_AR`, um espaço, e JSON:
 *
 *     EDITORHTML_NO_AR {"porta":8812,"token":"…","url":"http://127.0.0.1:8812/editor/editar.html",
 *                       "pecas":"…","raiz":"…","tema":"exemplo","pid":1234}
 *
 *   Quem lê faz `startsWith(SENTINELA)` e `JSON.parse` do resto. Nada de casar
 *   número dentro de prosa: mensagem para gente muda, contrato não.
 *
 * VARIÁVEIS DE AMBIENTE
 *   EDITORHTML_PORTA          porta pedida (padrão 8811). O servidor pode subir
 *                             adiante desta se ela estiver ocupada.
 *   EDITORHTML_SEM_NAVEGADOR  se definida, não abre o navegador. Existe para as
 *                             provas: uma suíte que abre 6 abas do Chrome é uma
 *                             suíte que ninguém roda duas vezes.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');

const PARAM_ABRIR = 'arq';
const SENTINELA = 'EDITORHTML_NO_AR';
const PORTA_PEDIDA = Number(process.env.EDITORHTML_PORTA) || 8811;
const ESPERA_MS = 20000;
const RAIZ = path.resolve(__dirname, '..');
const DIR_PECAS_PADRAO = path.join(RAIZ, 'pecas');

function ajuda() {
  console.log(`
editorhtml — editor de mouse para peças HTML declarativas

Uso:
  npx editorhtml servir              serve pecas/ e abre a lista de peças
  npx editorhtml abrir <caminho>     serve o diretório do arquivo e abre direto naquela peça
  npx editorhtml --help              esta mensagem

Porta pedida: ${PORTA_PEDIDA} (o servidor anda para a próxima livre se estiver ocupada,
e o endereço real é impresso quando ele sobe — não presuma a porta).
`);
}

function abrirNavegador(url) {
  if (process.env.EDITORHTML_SEM_NAVEGADOR) return;
  const comando =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(comando, (erro) => {
    if (erro) {
      console.error(`[editorhtml] não consegui abrir o navegador sozinho — acesse: ${url}`);
    }
  });
}

/* ---------------------------------------------------------------------------
   A CONFERÊNCIA DE IDENTIDADE. Não pergunta "tem alguém aí?" — pergunta "é
   você?". A diferença entre as duas é um usuário editando o arquivo de outro
   projeto sem saber.                                                          */
function conferirIdentidade(anuncio, token, pronto, falhou) {
  const req = http.get(
    { host: '127.0.0.1', port: anuncio.porta, path: '/_api/identidade', timeout: 3000 },
    (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => {
        let j;
        try { j = JSON.parse(b); } catch (e) { return falhou('a porta ' + anuncio.porta +
          ' respondeu, mas não com a identidade deste editor'); }
        if (!j || j.token !== token) {
          return falhou('quem respondeu na porta ' + anuncio.porta + ' NÃO é o servidor que eu subi' +
            (j && j.pecas ? ' (ele serve ' + j.pecas + ')' : '') +
            '. Não vou te mandar para a tela de outra pessoa.');
        }
        pronto(j);
      });
    }
  );
  req.on('error', (e) => falhou('não consegui falar com a porta ' + anuncio.porta + ': ' + e.message));
  req.on('timeout', () => { req.destroy(); falhou('a porta ' + anuncio.porta + ' não respondeu a tempo'); });
}

/* ---------------------------------------------------------------------------
   SUBIR O SERVIDOR E ESPERAR O ANÚNCIO DELE.
   O filho tem stdout em `pipe` (e não `inherit`) porque o anúncio é lido daqui;
   tudo o que ele imprime continua aparecendo para quem chamou, repassado linha
   a linha, menos a linha-contrato, que é ruído para gente.                     */
function subirServidor(dirPecas, aoSubir) {
  const caminhoServir = path.join(RAIZ, 'editor', 'servir.js');
  if (!fs.existsSync(caminhoServir)) {
    console.error(
      `[editorhtml] editor/servir.js não existe em ${caminhoServir}.\n` +
        'Esse módulo é a espinha do servidor (rotas /_api/*, estáticos). ' +
        'Sem ele o editor não sobe — confira se o pacote está completo.'
    );
    process.exit(1);
  }

  const token = crypto.randomBytes(9).toString('hex');
  const processo = spawn(
    process.execPath,
    [caminhoServir, String(PORTA_PEDIDA), dirPecas],
    { stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { EDITORHTML_TOKEN: token }) }
  );

  let anunciou = false;
  let resto = '';
  const relogio = setTimeout(() => {
    if (anunciou) return;
    console.error('[editorhtml] o servidor não anunciou que subiu em ' + (ESPERA_MS / 1000) +
      's. NÃO vou abrir endereço nenhum — um endereço chutado pode ser a tela de ' +
      'outro processo. Veja o log acima para o motivo.');
    try { processo.kill(); } catch (e) { /* já morreu */ }
    process.exitCode = 1;
  }, ESPERA_MS);

  processo.stdout.on('data', (d) => {
    resto += d.toString();
    let corte;
    while ((corte = resto.indexOf('\n')) >= 0) {
      const linha = resto.slice(0, corte).replace(/\r$/, '');
      resto = resto.slice(corte + 1);
      if (linha.startsWith(SENTINELA + ' ')) {
        let anuncio;
        try { anuncio = JSON.parse(linha.slice(SENTINELA.length + 1)); }
        catch (e) {
          console.error('[editorhtml] o servidor anunciou numa linha que eu não consegui ler: ' + e.message);
          continue;
        }
        anunciou = true;
        clearTimeout(relogio);
        conferirIdentidade(anuncio, token,
          () => aoSubir(anuncio),
          (motivo) => {
            console.error('[editorhtml] ' + motivo);
            console.error('[editorhtml] não abri o navegador.');
            try { processo.kill(); } catch (e) { /* já morreu */ }
            process.exitCode = 1;
          });
        continue;
      }
      console.log(linha);
    }
  });
  processo.stderr.on('data', (d) => process.stderr.write(d));

  processo.on('exit', (codigo) => {
    clearTimeout(relogio);
    if (!anunciou) {
      console.error('[editorhtml] o servidor saiu antes de anunciar que subiu' +
        (codigo == null ? '' : ' (código ' + codigo + ')') +
        '. Nenhum endereço foi aberto.');
      process.exit(codigo || 1);
    }
    if (codigo && codigo !== 0) process.exit(codigo);
  });

  return processo;
}

/* a linha que este CLI imprime quando tudo deu certo. Formato estável também —
   as provas leem daqui para conferir QUAL url foi entregue. */
function anunciarAoUsuario(url, oQue) {
  console.log('[editorhtml] no ar em ' + url + (oQue ? '  ·  ' + oQue : ''));
}

function comandoServir() {
  subirServidor(DIR_PECAS_PADRAO, (a) => {
    anunciarAoUsuario(a.url, 'servindo ' + a.pecas);
    abrirNavegador(a.url);
  });
}

function comandoAbrir(caminhoArg) {
  if (!caminhoArg) {
    console.error('[editorhtml] uso: npx editorhtml abrir <caminho-da-peça.js>');
    process.exit(1);
  }
  const caminhoAbsoluto = path.resolve(process.cwd(), caminhoArg);
  if (!fs.existsSync(caminhoAbsoluto)) {
    console.error(`[editorhtml] arquivo não encontrado: ${caminhoAbsoluto}`);
    process.exit(1);
  }
  const dirAlvo = path.dirname(caminhoAbsoluto);
  const nomeSemExtensao = path.basename(caminhoAbsoluto, path.extname(caminhoAbsoluto));

  subirServidor(dirAlvo, (a) => {
    const url = a.url + '?' + PARAM_ABRIR + '=' + encodeURIComponent(nomeSemExtensao);
    anunciarAoUsuario(url, 'abrindo ' + nomeSemExtensao + ' de ' + a.pecas);
    abrirNavegador(url);
  });
}

function main() {
  const [, , comando, ...resto] = process.argv;

  if (!comando || comando === '--help' || comando === '-h') {
    ajuda();
    process.exit(0);
  }
  if (comando === 'servir') { comandoServir(); return; }
  if (comando === 'abrir') { comandoAbrir(resto[0]); return; }

  console.error(`[editorhtml] comando desconhecido: "${comando}"`);
  ajuda();
  process.exit(1);
}

main();
