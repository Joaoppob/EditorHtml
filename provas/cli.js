/* =====================================================================
   provas/cli.js — A PORTA QUE O CLI ENTREGA É A DELE?
       node provas/cli.js

   ESTA SUÍTE NASCEU DE UM USUÁRIO ABERTO NA TELA DE OUTRO PROJETO.

   O CLI escolhia a porta com um socket de teste em `127.0.0.1:P`, e o
   servidor subia no curinga (`0.0.0.0`/`::`). No Windows dá pra segurar
   `127.0.0.1:P` com `0.0.0.0:P` já tomado — então o teste dizia "livre",
   o servidor morria de EADDRINUSE, e o `GET /` de confirmação era
   respondido pelo servidor ALHEIO com um 200 perfeitamente honesto. O CLI
   somava as duas mentiras e entregava o endereço do vizinho.

   AS DUAS LIÇÕES, VIRADAS EM CONTROLE:

   1. VALIDAR COM UM BINDER QUE NÃO É O DA PRODUÇÃO é medir outra coisa.
      Hoje quem escolhe a porta é quem liga nela, e não há segundo binder
      para discordar do primeiro. T3 mede a assimetria que enganou o
      instrumento velho, para ela nunca mais ser só uma lição num texto.

   2. `GET /` DEVOLVER 200 NÃO PROVA DE QUEM É A PORTA. Por isso o
      impostor destas provas não é um servidor de mentira: é o NOSSO
      `editor/servir.js`, de verdade, servindo OUTRA pasta. Ele responde
      200, responde `/_api/inventario` com JSON válido, e é indistinguível
      do certo por qualquer checagem que não pergunte "é você?".
      É exatamente o que aconteceu de verdade.

   Nenhuma prova aqui usa a faixa 881x — subir na porta padrão faria a
   suíte brigar com um editor aberto, e teste que derruba o trabalho de
   alguém é pior que teste nenhum. Todas pedem porta alta e derrubam o que
   subiram, conferindo pela PORTA no fim.
   ===================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const SERVIR = path.join(RAIZ, 'editor', 'servir.js');
const CLI = path.join(RAIZ, 'bin', 'editorhtml.js');
const SENTINELA = 'EDITORHTML_NO_AR';
const BASE = 8940;

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok   ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}
const vivos = [];
const lixo = [];

/* ------------------------------------------------------------------ */
/* sobe um `editor/servir.js` de verdade e devolve o anúncio dele.
   Ler o anúncio em vez de presumir a porta é o mesmo contrato que o CLI
   usa — a prova não pode conhecer a porta por um caminho que o produto
   não tem. */
function subirServidorReal(porta, dirPecas) {
  return new Promise((pronto, erro) => {
    const p = spawn(process.execPath, [SERVIR, String(porta), dirPecas],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    vivos.push(p);
    let buf = '', resolvido = false;
    const relogio = setTimeout(() => {
      if (!resolvido) erro(new Error('o servidor em ' + porta + ' não anunciou a tempo'));
    }, 15000);
    p.stdout.on('data', d => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const linha = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (linha.startsWith(SENTINELA + ' ')) {
          resolvido = true; clearTimeout(relogio);
          pronto({ anuncio: JSON.parse(linha.slice(SENTINELA.length + 1)), processo: p });
        }
      }
    });
    p.on('exit', c => { if (!resolvido) { clearTimeout(relogio);
      erro(new Error('o servidor em ' + porta + ' saiu com código ' + c)); } });
  });
}

/* Roda o CLI e devolve o que ele disse.

   ELE RESOLVE ASSIM QUE O CLI DECIDE, E DEIXA O PROCESSO VIVO.
   A primeira versão desta função esperava o CLI MORRER — e o CLI não morre
   sozinho, porque ele fica de pé junto com o servidor. Ela só resolvia
   quando o relógio o matava, e matar o CLI derruba o servidor junto. Quer
   dizer: os controles que perguntavam "quem está nessa porta?" perguntavam
   a uma porta que a própria prova tinha acabado de fechar, e liam a
   ausência de resposta como defeito do produto.

   Acusar o produto por um estrago do instrumento é o pior tipo de reprova:
   ela parece rigor. Agora quem encerra é o teste, DEPOIS de perguntar. */
function rodarCLI(args, env, msLimite) {
  return new Promise(pronto => {
    const p = spawn(process.execPath, [CLI].concat(args),
      { stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, { EDITORHTML_SEM_NAVEGADOR: '1' }, env) });
    vivos.push(p);
    let saida = '', erro = '', resolvido = false;
    const encerrar = () => { try { p.kill(); } catch (e) { /* já morreu */ } };
    const resolver = (codigo) => {
      if (resolvido) return;
      resolvido = true; clearTimeout(relogio);
      pronto({ saida, erro, codigo, processo: p, encerrar });
    };
    p.stdout.on('data', d => {
      saida += d.toString();
      /* decidiu: entregou endereço */
      if (/\[editorhtml\] no ar em \S+/.test(saida)) resolver(null);
    });
    p.stderr.on('data', d => {
      erro += d.toString();
      /* decidiu: recusou a entregar endereço */
      if (/não abri o navegador|não anunciou|saiu antes de anunciar/i.test(erro)) {
        setTimeout(() => resolver(p.exitCode), 300);
      }
    });
    const relogio = setTimeout(() => { encerrar(); }, msLimite || 9000);
    p.on('exit', codigo => resolver(codigo));
  });
}

function urlEntregue(saida) {
  const m = /\[editorhtml\] no ar em (\S+)/.exec(saida);
  return m ? m[1] : null;
}
function portaDe(url) {
  const m = /:(\d+)\//.exec(url || '');
  return m ? Number(m[1]) : null;
}
function identidade(porta) {
  return new Promise(pronto => {
    const req = http.get({ host: '127.0.0.1', port: porta, path: '/_api/identidade', timeout: 3000 },
      res => { let b = ''; res.on('data', d => { b += d; });
               res.on('end', () => { try { pronto(JSON.parse(b)); } catch (e) { pronto(null); } }); });
    req.on('error', () => pronto(null));
    req.on('timeout', () => { req.destroy(); pronto(null); });
  });
}

/* uma pasta de peças que NÃO é a nossa, para o vizinho servir */
function pastaDoVizinho() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'editorhtml-vizinho-'));
  lixo.push(d);
  fs.writeFileSync(path.join(d, 'vizinho.js'),
    "'use strict';\nmodule.exports = { pecas: [\n" +
    "  { slug:'vizinho', n: 'Peça de outro projeto', w: 100, h: 100, L: [\n" +
    "    { t:'tx', s: 10, tx: 'nao sou a sua peca', box:[0,0,100,null], z: 1 }\n" +
    '  ] }\n]};\n', 'utf8');
  return d;
}

/* ==================================================================== */
(async function () {
  try {
    /* ================================================================
       T1 · O CAMINHO NORMAL — o positivo do par.
       Sem ele, uma suíte que só prova recusa passaria com um CLI que
       recusa tudo, e "recusar tudo" parece rigor.
       ================================================================ */
    console.log('\nT1 · porta livre: o CLI entrega a porta que pediu');
    const r1 = await rodarCLI(['servir'], { EDITORHTML_PORTA: String(BASE) });
    const u1 = urlEntregue(r1.saida);
    ok(!!u1, 'T1a · o CLI entregou uma URL', (r1.saida + r1.erro).slice(0, 300));
    ok(portaDe(u1) === BASE, 'T1b · e ela é a porta pedida (' + BASE + '), ' +
      'porque nada estava ocupando', u1);
    /* e o que atende ali é o nosso — o positivo do T2d, para "serve as
       nossas peças" não passar por acaso quando não há vizinho nenhum */
    const id1 = await identidade(BASE);
    ok(id1 && id1.pecas === path.join(RAIZ, 'pecas'),
      'T1c · e quem atende nela serve as nossas peças', id1 ? id1.pecas : 'sem resposta');
    r1.encerrar();
    await new Promise(pr => setTimeout(pr, 500));

    /* ================================================================
       T2 · O CASO EXATO QUE ENGANOU O CLI VELHO.
       Vizinho = `editor/servir.js` DE VERDADE, ligado no curinga, na
       porta padrão, servindo outra pasta. Responde 200 em `/`, responde
       `/_api/inventario` com JSON bom. Só a identidade o distingue.
       ================================================================ */
    console.log('\nT2 · vizinho no curinga (0.0.0.0) na porta pedida — o caso real');
    const dirVizinho = pastaDoVizinho();
    const viz = await subirServidorReal(BASE + 1, dirVizinho);
    const pVizinho = viz.anuncio.porta;
    ok(!!pVizinho, 'T2-pre · o vizinho subiu na porta ' + pVizinho + ' servindo ' + dirVizinho);

    /* prova que o vizinho é indistinguível pelas checagens ingênuas —
       senão T2 estaria testando um espantalho */
    const invVizinho = await new Promise(pr => {
      http.get({ host: '127.0.0.1', port: pVizinho, path: '/_api/inventario', timeout: 3000 },
        res => { let b = ''; res.on('data', d => { b += d; });
                 res.on('end', () => { try { pr(JSON.parse(b)); } catch (e) { pr(null); } }); })
        .on('error', () => pr(null));
    });
    ok(invVizinho && invVizinho.ok && invVizinho.usos.some(u => u.slug === 'vizinho'),
      'T2-pre2 · e ele responde `/_api/inventario` com JSON válido — ' +
      'um `GET /` ou um inventário não distinguem ele do certo');

    /* agora o CLI pede a MESMA porta que o vizinho segura */
    const r2 = await rodarCLI(['servir'], { EDITORHTML_PORTA: String(pVizinho) });
    const u2 = urlEntregue(r2.saida);
    ok(!!u2, 'T2a · o CLI entregou uma URL', (r2.saida + r2.erro).slice(0, 300));
    ok(portaDe(u2) !== pVizinho,
      'T2b · e ela NÃO é a porta do vizinho (' + pVizinho + ') — ' +
      'o usuário não foi mandado para a tela de outro projeto', u2);
    ok(portaDe(u2) > pVizinho,
      'T2c · o servidor andou para a frente (' + portaDe(u2) + ')', u2);

    /* e o que está NA porta entregue serve o NOSSO corpus */
    const idNossa = await identidade(portaDe(u2));
    ok(idNossa && idNossa.pecas === path.join(RAIZ, 'pecas'),
      'T2d · quem responde na porta entregue serve as NOSSAS peças, não as do vizinho',
      idNossa ? idNossa.pecas : 'sem resposta');

    /* NÃO MATAMOS UM PROCESSO QUE NÃO É NOSSO. O CLI velho não matava
       ninguém — mas um "conserto" apressado que liberasse a porta na
       marra seria pior que o defeito. */
    const idViz = await identidade(pVizinho);
    ok(idViz && idViz.pecas === dirVizinho,
      'T2e · e o vizinho continua vivo e servindo a pasta dele — ' +
      'ninguém foi derrubado para liberar porta', idViz ? idViz.pecas : 'morreu');

    /* ================================================================
       T3 · A ASSIMETRIA DE BIND, como controle permanente.
       É ela que fazia o probe velho mentir. Ela é PROPRIEDADE DO SISTEMA
       OPERACIONAL, então o controle mede e diz — não finge que vale em
       toda plataforma.
       ================================================================ */
    console.log('\nT3 · a assimetria de bind que enganou o instrumento velho');
    const pAsym = viz.anuncio.porta;   /* o vizinho segura isto no curinga */
    const loopbackLigou = await new Promise(pr => {
      const s = net.createServer();
      s.once('error', () => pr(false));
      s.once('listening', () => s.close(() => pr(true)));
      s.listen(pAsym, '127.0.0.1');    /* EXATAMENTE o probe velho */
    });
    if (loopbackLigou) {
      ok(true, 'T3a · nesta plataforma o probe velho (`listen(P,"127.0.0.1")`) diz LIVRE ' +
        'para uma porta que o curinga já segura — a mentira é reproduzível aqui');
      ok(portaDe(u2) !== pAsym,
        'T3b · e mesmo assim o CLI novo NÃO entregou essa porta — ' +
        'porque quem escolhe agora é quem liga de verdade');

      /* A DISCRIMINAÇÃO. Sem isto, T2 só diz "hoje funciona" — não diz que
         o mecanismo VELHO falharia no mesmo caso. Aqui os dois passos do
         CLI antigo são refeitos contra a porta do vizinho: o probe de
         loopback (que acabou de dizer LIVRE, acima) e o `GET /` de
         confirmação. Se os dois disserem sim, o CLI velho teria entregue a
         tela do vizinho — e é exatamente essa a reprova que T2 previne. */
      const getRespondeu = await new Promise(pr => {
        const req = http.get({ host: 'localhost', port: pAsym, path: '/', timeout: 1500 },
          res => { res.resume(); pr(res.statusCode); });
        req.on('error', () => pr(null));
        req.on('timeout', () => { req.destroy(); pr(null); });
      });
      ok(loopbackLigou && getRespondeu === 200,
        'T3c · discriminação: os DOIS passos do CLI velho aprovam a porta do vizinho ' +
        '(probe diz livre, `GET /` responde ' + getRespondeu + ') — ' +
        'ele teria entregue a tela de outro projeto, e é isso que T2 impede');
    } else {
      /* Linux recusa esse bind; a mentira não reproduz. Dizer isso é
         melhor que inventar um controle que "passa" sem ter medido. */
      ok(true, 'T3a · [não reproduz nesta plataforma] o bind em `127.0.0.1` foi recusado ' +
        'com o curinga tomado, então o probe velho não mentiria aqui — ' +
        'o controle fica registrado para as plataformas onde ele mente');
    }

    /* ================================================================
       T4 · SEM PORTA, SEM ENDEREÇO.
       Ocupo a faixa inteira que o servidor varre. Ele tem de desistir, e
       o CLI tem de dizer que não subiu — e NÃO oferecer URL. Endereço
       chutado é o defeito original com outra roupa.
       ================================================================ */
    console.log('\nT4 · faixa inteira ocupada: o CLI diz que não subiu e não chuta URL');
    const bloqueio = [];
    const pBase = BASE + 40;
    for (let i = 0; i <= 20; i++) {
      const s = net.createServer(c => c.end());
      await new Promise(pr => { s.once('error', pr); s.listen(pBase + i, pr); });
      bloqueio.push(s);
    }
    ok(bloqueio.length === 21, 'T4-pre · segurei as 21 portas da faixa ' +
      pBase + '–' + (pBase + 20));
    const r4 = await rodarCLI(['servir'], { EDITORHTML_PORTA: String(pBase) }, 25000);
    ok(urlEntregue(r4.saida) === null,
      'T4a · o CLI NÃO entregou endereço nenhum', r4.saida.slice(0, 300));
    ok(/não subiu|não anunciou|saiu antes de anunciar|nenhuma porta livre/i.test(r4.saida + r4.erro),
      'T4b · e disse por quê, em vez de sair calado',
      (r4.saida + r4.erro).slice(0, 400));
    ok(r4.codigo !== 0, 'T4c · e saiu com código de erro (' + r4.codigo + ') — ' +
      'quem chamou o CLI num script consegue perceber');
    await Promise.all(bloqueio.map(s => new Promise(pr => s.close(pr))));

    /* ================================================================
       T5 · O TOKEN DISCRIMINA — e o par que mostra que ele não recusa
       tudo. Um verificador que reprovasse sempre também passaria em T2.
       ================================================================ */
    console.log('\nT5 · a identidade separa o meu servidor do vizinho');
    const idA = await identidade(portaDe(u2));
    const idB = await identidade(pVizinho);
    ok(idA && idB && idA.token !== idB.token,
      'T5a · dois servidores do MESMO software têm tokens diferentes');
    ok(idA && idB && idA.pecas !== idB.pecas,
      'T5b · e a rota diz qual pasta cada um serve, para diagnóstico à mão ' +
      'não depender de comparar hexadecimal');
    ok(idA && typeof idA.token === 'string' && idA.token.length >= 12,
      'T5c · o token tem corpo suficiente para não colidir por acaso (' +
      (idA ? idA.token.length : 0) + ' caracteres)');
    r2.encerrar();
  } catch (e) {
    ok(false, 'a suíte estourou: ' + e.message, e.stack);
  }

  /* ==================================================================
     TZ · LIMPEZA CONFERIDA PELA PORTA.
     Duas vezes nesta obra um selo de limpeza foi assinado em cima de um
     filtro por nome de processo que não casava nada — e não casar nada
     tem a mesma cara de estar limpo. Aqui a conferência é a porta.
     ================================================================== */
  console.log('\nTZ · limpeza');
  for (const p of vivos) { try { p.kill(); } catch (e) { /* já morreu */ } }
  await new Promise(pr => setTimeout(pr, 800));
  for (const d of lixo) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /**/ } }

  const aindaEscutando = [];
  for (let p = BASE; p <= BASE + 61; p++) {
    const livre = await new Promise(pr => {
      const s = net.createServer();
      s.once('error', () => pr(false));
      s.once('listening', () => s.close(() => pr(true)));
      s.listen(p, '0.0.0.0');
    });
    if (!livre) aindaEscutando.push(p);
  }
  ok(aindaEscutando.length === 0,
    'TZ a · nenhuma porta da faixa desta suíte (' + BASE + '–' + (BASE + 61) +
    ') continua ocupada — conferido LIGANDO nelas, que é o único teste que não mente',
    'ainda ocupadas: ' + aindaEscutando.join(', '));
  ok(lixo.every(d => !fs.existsSync(d)),
    'TZ b · as pastas temporárias do vizinho foram apagadas');

  console.log('\n' + (falhas ? 'REPROVOU' : 'PASSOU') + ' — ' + (checks - falhas) + '/' + checks + ' controles');
  process.exit(falhas ? 1 : 0);
})();
