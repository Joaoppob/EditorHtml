#!/usr/bin/env node
'use strict';

/**
 * CLI do EditorHtml.
 *
 * Comandos:
 *   npx editorhtml servir             serve pecas/ na porta 8811, abre a lista no navegador.
 *   npx editorhtml abrir <caminho>    serve o diretório daquele arquivo, abre direto na peça.
 *
 * Este arquivo é SÓ o CLI: parse de argumento, resolução de caminho, abertura de
 * navegador. Quem sobe o servidor HTTP de verdade (rotas /_api/*, estáticos de
 * editor/motor/temas/pecas) é `editor/servir.js` (ver LINHA-DE-CORTE.md §4). Esse
 * módulo é ele mesmo um CLI:
 *
 *   node editor/servir.js [porta] [dir-das-pecas] [tema]
 *
 * — lê porta/diretório/tema de `process.argv` no carregamento do módulo e, quando
 * rodado como `main`, sobe `servidor.listen(...)` sozinho. Por isso este wrapper
 * SPAWNA `editor/servir.js` como subprocesso (mesma forma que rodar na mão), em vez
 * de `require()`-ar e chamar uma função — não existe função fábrica exportada pra
 * chamar com opções.
 *
 * URL aberta no navegador depois de subir:
 *   servir:            http://localhost:8811/editor/editar.html
 *   abrir <arquivo>:   http://localhost:8811/editor/editar.html?arq=<nome-sem-extensao>
 *
 * `?arq=` é o mesmo nome de parâmetro que `editor/servir.js` já usa nas rotas
 * `/_api/ler?arq=` e `/_api/camadas?arq=&slug=` (ver `arquivoDePecas()` em
 * `editor/servir.js`) — não confirmado ainda contra `editar.html`/`editar.js`
 * porque esses dois arquivos não existem no repo no momento em que este CLI foi
 * escrito. Se o parâmetro que o cliente lê de fato for outro, ajuste só a
 * constante abaixo.
 */

const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

const PARAM_ABRIR = 'arq'; // ver aviso acima — inferido das rotas server-side já existentes

const PORTA_PADRAO = 8811;
let PORTA = PORTA_PADRAO;   /* resolvida em tempo de execucao — ver `escolherPorta` */
const RAIZ = path.resolve(__dirname, '..');
const DIR_PECAS_PADRAO = path.join(RAIZ, 'pecas');

function ajuda() {
  console.log(`
editorhtml — editor de mouse para peças HTML declarativas

Uso:
  npx editorhtml servir              serve pecas/ e abre a lista de peças
  npx editorhtml abrir <caminho>     serve o diretório do arquivo e abre direto naquela peça
  npx editorhtml --help              esta mensagem

Porta padrão: ${PORTA}
`);
}

function abrirNavegador(url) {
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

function subirServidor(dirPecas) {
  const caminhoServir = path.join(RAIZ, 'editor', 'servir.js');
  if (!fs.existsSync(caminhoServir)) {
    console.error(
      `[editorhtml] editor/servir.js não existe em ${caminhoServir}.\n` +
        'Esse módulo é a espinha do servidor (rotas /_api/*, estáticos). ' +
        'Sem ele o editor não sobe — confira se o pacote está completo.'
    );
    process.exit(1);
  }
  const processo = spawn(process.execPath, [caminhoServir, String(PORTA), dirPecas], {
    stdio: 'inherit',
  });
  processo.on('exit', (codigo) => {
    if (codigo && codigo !== 0) process.exit(codigo);
  });
  return processo;
}

function esperarServidorNoAr(callback, tentativas = 40) {
  const http = require('http');
  const tentar = (restantes) => {
    const req = http.get({ host: 'localhost', port: PORTA, path: '/', timeout: 500 }, (res) => {
      res.resume();
      callback();
    });
    req.on('error', () => {
      if (restantes <= 0) {
        console.error(`[editorhtml] servidor não respondeu em localhost:${PORTA} a tempo — confira o log acima.`);
        return;
      }
      setTimeout(() => tentar(restantes - 1), 150);
    });
    req.on('timeout', () => req.destroy());
  };
  tentar(tentativas);
}


/* PORTA OCUPADA NAO PODE VIRAR PERGUNTA SEM RESPOSTA.
   A porta era fixa. Quando outra coisa ja estava na 8811 — outra sessao do
   editor, ou um servidor esquecido — o comando morria, e um agente operando
   sozinho ficava com duas saidas ruins: matar um processo que nao e dele, ou
   parar e perguntar. Medido num teste real com um agente sem contexto: ele
   escolheu parar e perguntar, corretamente, e a tarefa nao andou.

   Agora a porta se DESLOCA: tenta a padrao, e se estiver ocupada segue para a
   proxima livre, ate 20 adiante. Ninguem precisa matar nada, e o comando diz
   em qual porta subiu quando nao foi a padrao — silencio aqui faria o usuario
   procurar na 8811 uma tela que esta noutro lugar. */
function escolherPorta(inicial, tentativas, callback) {
  const net = require('net');
  const tentar = (porta, restantes) => {
    if (restantes <= 0) {
      console.error('[editorhtml] nenhuma porta livre entre ' + inicial +
        ' e ' + (inicial + tentativas) + '. Libere uma e tente de novo.');
      process.exit(1);
    }
    const s = net.createServer();
    s.once('error', (e) => {
      if (e && e.code === 'EADDRINUSE') return tentar(porta + 1, restantes - 1);
      console.error('[editorhtml] nao consegui testar a porta ' + porta + ': ' + e.message);
      process.exit(1);
    });
    s.once('listening', () => s.close(() => callback(porta)));
    s.listen(porta, '127.0.0.1');
  };
  tentar(inicial, tentativas);
}

function comandoServir() {
  escolherPorta(PORTA_PADRAO, 20, (porta) => { PORTA = porta; servirAgora(); });
}

function servirAgora() {
  if (PORTA !== PORTA_PADRAO) {
    console.log('[editorhtml] a porta ' + PORTA_PADRAO + ' estava ocupada — subindo na ' + PORTA + '.');
  }
  subirServidor(DIR_PECAS_PADRAO);
  const urlBase = `http://localhost:${PORTA}/editor/editar.html`;
  console.log(`[editorhtml] servindo ${DIR_PECAS_PADRAO} em ${urlBase}`);
  esperarServidorNoAr(() => abrirNavegador(urlBase));
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

  escolherPorta(PORTA_PADRAO, 20, (porta) => {
    PORTA = porta;
    if (PORTA !== PORTA_PADRAO) {
      console.log('[editorhtml] a porta ' + PORTA_PADRAO + ' estava ocupada — subindo na ' + PORTA + '.');
    }
    abrirAgora(dirAlvo, nomeSemExtensao);
  });
}

function abrirAgora(dirAlvo, nomeSemExtensao) {
  subirServidor(dirAlvo);
  const urlBase = `http://localhost:${PORTA}/editor/editar.html?${PARAM_ABRIR}=${encodeURIComponent(nomeSemExtensao)}`;
  console.log(`[editorhtml] servindo ${dirAlvo} — abrindo ${nomeSemExtensao} em ${urlBase}`);
  esperarServidorNoAr(() => abrirNavegador(urlBase));
}

function main() {
  const [, , comando, ...resto] = process.argv;

  if (!comando || comando === '--help' || comando === '-h') {
    ajuda();
    process.exit(0);
  }

  if (comando === 'servir') {
    comandoServir();
    return;
  }

  if (comando === 'abrir') {
    comandoAbrir(resto[0]);
    return;
  }

  console.error(`[editorhtml] comando desconhecido: "${comando}"`);
  ajuda();
  process.exit(1);
}

main();
