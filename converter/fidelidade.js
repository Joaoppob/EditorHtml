#!/usr/bin/env node
'use strict';

/**
 * converter/fidelidade.js — prova de fidelidade da conversão HTML → declaração de peça.
 *
 * Uso:
 *   node converter/fidelidade.js <original.html> <peca.js> <slug> [--deslocamento 24] [--tolerancia 24] [--piso 3]
 *
 * O que faz:
 *   1. Renderiza <original.html> no Chrome headless → screenshot A (PNG).
 *   2. Monta a peça <slug> de <peca.js> com um RENDERIZADOR MÍNIMO interno (só os
 *      4 tipos núcleo — tt/tx/obj/reserva, ver LINHA-DE-CORTE.md §5) → HTML sintético
 *      → renderiza no Chrome headless → screenshot B (PNG).
 *   3. MEDE A×B com duas réguas, não uma só:
 *        - diferença média por pixel, normalizada em /255 (0 = idêntico, 100 = oposto)
 *        - fração de pixels fora de banda (|diff| > tolerância — default 24)
 *      Percentual-de-pixels-que-batem foi abandonado: numa peça esparsa o fundo
 *      branco já garante a maioria dos pixels "batendo" antes de qualquer conteúdo
 *      bater, e uma conversão errada mede quase igual a uma perfeita (~92% em
 *      ambas, medido). Diferença média por pixel não satura assim.
 *   4. CONTROLE POSITIVO: desloca os pixels de B por N px (proposital,
 *      "--deslocamento") → C, mede A×C do mesmo jeito. O FATOR DE DISCRIMINAÇÃO é
 *      controle.mediaDiferenca / fidelidade.mediaDiferenca — quanto maior, melhor
 *      a prova separa "bateu" de "não bateu". Se esse fator não alcançar o PISO
 *      (default 3×, escolha declarada, não lei), a ferramenta se recusa a dar
 *      número — aborta dizendo que a prova não está discriminando nada.
 *
 * O QUE ESTA FERRAMENTA NÃO FAZ: não deriva "acima de X está aprovado". Sem uma
 * coorte de conversões reais julgadas por alguém, um limiar de corte é uma
 * hipótese vestida de medida — e vira o alvo que o próximo conversor otimiza, não
 * um instrumento. Ela reporta os números e o fator de discriminação; quem decide
 * o corte de aprovação é quem está olhando a coorte.
 *
 * AVISO DE ESCOPO: o renderizador da declaração é MÍNIMO e vive inteiro dentro de
 * converter/ — não é o motor real do editor (motor/montar.js, ver
 * LINHA-DE-CORTE.md §4) e não modela tema nenhum. Existe só para medir
 * geometria/texto/imagem dos 4 tipos núcleo antes de o motor real e a suíte
 * `provas/` estarem prontos. Quando estiverem, a prova definitiva é lá.
 *
 * Zero dependência de produção: só Node core (fs, path, zlib, child_process) e o
 * Chrome instalado na máquina (headless, screenshot por linha de comando).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Chrome: localizar binário
// ---------------------------------------------------------------------------

function acharChrome() {
  const candidatos = [];
  if (process.env.EDITORHTML_CHROME) candidatos.push(process.env.EDITORHTML_CHROME);
  if (process.env.CHROME_PATH) candidatos.push(process.env.CHROME_PATH);

  if (process.platform === 'win32') {
    candidatos.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (process.platform === 'darwin') {
    candidatos.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    candidatos.push('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge');
  }

  for (const c of candidatos) {
    if (path.isAbsolute(c)) {
      if (fs.existsSync(c)) return c;
    } else {
      try {
        execFileSync(process.platform === 'win32' ? 'where' : 'which', [c], { stdio: 'pipe' });
        return c;
      } catch {
        // segue tentando
      }
    }
  }
  throw new Error(
    'Nenhum Chrome/Edge encontrado. Defina EDITORHTML_CHROME=<caminho do binário> e tente de novo.'
  );
}

function tirarScreenshot(chromeBin, urlOuArquivo, saidaPng, largura, altura) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${largura},${altura}`,
    `--screenshot=${saidaPng}`,
    '--default-background-color=FFFFFFFF',
    urlOuArquivo,
  ];
  execFileSync(chromeBin, args, { stdio: 'pipe', timeout: 30000 });
  if (!fs.existsSync(saidaPng)) {
    throw new Error(`Chrome não gerou o screenshot esperado em ${saidaPng}`);
  }
}

// ---------------------------------------------------------------------------
// Decodificador PNG mínimo (só o que o Chrome headless produz: 8-bit, sem
// interlace, colortype 2=RGB ou 6=RGBA). Usa zlib do Node core — sem deps.
// ---------------------------------------------------------------------------

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodificarPng(buf) {
  const assinatura = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(assinatura)) {
    throw new Error('arquivo não é PNG válido');
  }

  let offset = 8;
  let ihdr = null;
  const idatPartes = [];

  while (offset < buf.length) {
    const tamanho = buf.readUInt32BE(offset);
    const tipo = buf.toString('ascii', offset + 4, offset + 8);
    const dados = buf.subarray(offset + 8, offset + 8 + tamanho);
    if (tipo === 'IHDR') {
      ihdr = {
        largura: dados.readUInt32BE(0),
        altura: dados.readUInt32BE(4),
        bitDepth: dados.readUInt8(8),
        colorType: dados.readUInt8(9),
        interlace: dados.readUInt8(12),
      };
    } else if (tipo === 'IDAT') {
      idatPartes.push(dados);
    } else if (tipo === 'IEND') {
      break;
    }
    offset += 8 + tamanho + 4; // dados + CRC
  }

  if (!ihdr) throw new Error('PNG sem IHDR');
  if (ihdr.interlace !== 0) throw new Error('PNG com interlace não suportado por este decodificador mínimo');
  if (ihdr.bitDepth !== 8) throw new Error(`bitDepth ${ihdr.bitDepth} não suportado (só 8-bit)`);
  if (ihdr.colorType !== 2 && ihdr.colorType !== 6) {
    throw new Error(`colorType ${ihdr.colorType} não suportado (só RGB=2 ou RGBA=6)`);
  }

  const canais = ihdr.colorType === 6 ? 4 : 3;
  const bpp = canais; // 8-bit → 1 byte por canal
  const bruto = zlib.inflateSync(Buffer.concat(idatPartes));

  const largura = ihdr.largura;
  const altura = ihdr.altura;
  const tamanhoLinha = largura * bpp;
  const pixels = Buffer.alloc(largura * altura * 4); // normaliza tudo pra RGBA

  let posBruto = 0;
  let linhaAnterior = Buffer.alloc(tamanhoLinha);

  for (let y = 0; y < altura; y++) {
    const filtro = bruto[posBruto];
    posBruto += 1;
    const linha = Buffer.from(bruto.subarray(posBruto, posBruto + tamanhoLinha));
    posBruto += tamanhoLinha;

    for (let x = 0; x < tamanhoLinha; x++) {
      const a = x >= bpp ? linha[x - bpp] : 0;
      const b = linhaAnterior[x];
      const c = x >= bpp ? linhaAnterior[x - bpp] : 0;
      let valor = linha[x];
      if (filtro === 1) valor = (valor + a) & 0xff;
      else if (filtro === 2) valor = (valor + b) & 0xff;
      else if (filtro === 3) valor = (valor + Math.floor((a + b) / 2)) & 0xff;
      else if (filtro === 4) valor = (valor + paeth(a, b, c)) & 0xff;
      linha[x] = valor;
    }

    for (let x = 0; x < largura; x++) {
      const srcOff = x * bpp;
      const dstOff = (y * largura + x) * 4;
      pixels[dstOff] = linha[srcOff];
      pixels[dstOff + 1] = linha[srcOff + 1];
      pixels[dstOff + 2] = linha[srcOff + 2];
      pixels[dstOff + 3] = canais === 4 ? linha[srcOff + 3] : 255;
    }

    linhaAnterior = linha;
  }

  return { largura, altura, pixels };
}

// ---------------------------------------------------------------------------
// Medição: diferença média por pixel (/255) + fração fora de banda.
// Substitui o percentual-de-pixels-que-batem (dominado pelo fundo em peça
// esparsa — fator de discriminação medido de 1,08x, ruído). A régua nova soma
// |diff| em vez de contar dentro/fora de um corte só, então uma peça quase
// idêntica e uma peça errada não colapsam no mesmo número.
// ---------------------------------------------------------------------------

function medirDiferenca(imgA, imgB, tolerancia = 24) {
  if (imgA.largura !== imgB.largura || imgA.altura !== imgB.altura) {
    throw new Error(
      `tamanhos diferentes: A=${imgA.largura}x${imgA.altura} B=${imgB.largura}x${imgB.altura} — não dá pra comparar pixel a pixel`
    );
  }
  const total = imgA.largura * imgA.altura;
  let somaDiferenca = 0;
  let foraDeBanda = 0;

  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const dr = Math.abs(imgA.pixels[off] - imgB.pixels[off]);
    const dg = Math.abs(imgA.pixels[off + 1] - imgB.pixels[off + 1]);
    const db = Math.abs(imgA.pixels[off + 2] - imgB.pixels[off + 2]);
    const diffPixel = (dr + dg + db) / 3;
    somaDiferenca += diffPixel;
    if (diffPixel > tolerancia) foraDeBanda++;
  }

  const mediaBruta = somaDiferenca / total; // escala 0..255
  return {
    mediaDiferenca: (mediaBruta / 255) * 100, // normalizado /255, em "pontos" (0 = idêntico, 100 = oposto)
    fracaoForaDeBanda: foraDeBanda / total, // 0..1
  };
}

function deslocarImagem(img, dx, dy) {
  const { largura, altura, pixels } = img;
  const deslocado = Buffer.alloc(pixels.length, 255); // fundo branco onde expõe borda
  for (let y = 0; y < altura; y++) {
    const ySrc = y - dy;
    if (ySrc < 0 || ySrc >= altura) continue;
    for (let x = 0; x < largura; x++) {
      const xSrc = x - dx;
      if (xSrc < 0 || xSrc >= largura) continue;
      const dstOff = (y * largura + x) * 4;
      const srcOff = (ySrc * largura + xSrc) * 4;
      deslocado[dstOff] = pixels[srcOff];
      deslocado[dstOff + 1] = pixels[srcOff + 1];
      deslocado[dstOff + 2] = pixels[srcOff + 2];
      deslocado[dstOff + 3] = pixels[srcOff + 3];
    }
  }
  return { largura, altura, pixels: deslocado };
}

// ---------------------------------------------------------------------------
// Renderizador mínimo: peça declarada (4 tipos núcleo) → HTML sintético
// ---------------------------------------------------------------------------

function escaparHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function montarHtmlMinimo(peca, dirBase) {
  const { w, h, L } = peca;
  const camadas = [...L].sort((a, b) => (a.z || 0) - (b.z || 0));

  const divs = camadas
    .map((camada) => {
      const [xPct, yPct, wPct, hPct] = camada.box;
      const left = (xPct / 100) * w;
      const top = (yPct / 100) * h;
      const largura = (wPct / 100) * w;
      const alturaCss = hPct == null ? 'auto' : `${(hPct / 100) * h}px`;

      const estiloBase = `position:absolute; left:${left}px; top:${top}px; width:${largura}px; height:${alturaCss}; box-sizing:border-box;`;

      if (camada.t === 'tt' || camada.t === 'tx') {
        const pesoFonte = camada.t === 'tt' ? 'bold' : 'normal';
        return `<div style="${estiloBase} font-size:${camada.s || 16}px; font-weight:${pesoFonte}; font-family:Arial, sans-serif; line-height:1.15; color:#111;">${escaparHtml(camada.tx || '')}</div>`;
      }
      if (camada.t === 'obj') {
        const src = camada.src ? path.resolve(dirBase, camada.src) : '';
        const url = src ? `file:///${src.replace(/\\/g, '/')}` : '';
        return `<img src="${url}" style="${estiloBase} object-fit:cover;" />`;
      }
      if (camada.t === 'reserva') {
        return `<div style="${estiloBase} border:2px dashed #999; background:rgba(0,0,0,0.04);"></div>`;
      }
      // tipo de tema, sem tema instalado: caixa neutra, igual ao comportamento do editor
      return `<div style="${estiloBase} border:1px dotted #ccc;"></div>`;
    })
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#fff;}
  #tela{position:relative; width:${w}px; height:${h}px; overflow:hidden; background:#fff;}
</style></head>
<body><div id="tela">
${divs}
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const posicionais = [];
  const opcoes = { deslocamento: 24, tolerancia: 24, piso: 3 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--deslocamento') opcoes.deslocamento = parseInt(argv[++i], 10);
    else if (argv[i] === '--tolerancia') opcoes.tolerancia = parseInt(argv[++i], 10);
    else if (argv[i] === '--piso') opcoes.piso = parseFloat(argv[++i]);
    else posicionais.push(argv[i]);
  }
  return { posicionais, opcoes };
}

function formatar(medida) {
  return `diferença média (/255): ${medida.mediaDiferenca.toFixed(2)}   fora de banda (>tolerância): ${(medida.fracaoForaDeBanda * 100).toFixed(2)}%`;
}

function main() {
  const { posicionais, opcoes } = parseArgs(process.argv.slice(2));
  const [caminhoOriginal, caminhoPeca, slug] = posicionais;

  if (!caminhoOriginal || !caminhoPeca || !slug) {
    console.error('uso: node converter/fidelidade.js <original.html> <peca.js> <slug> [--deslocamento 24] [--tolerancia 24] [--piso 3]');
    process.exit(1);
  }

  const origAbs = path.resolve(process.cwd(), caminhoOriginal);
  const pecaAbs = path.resolve(process.cwd(), caminhoPeca);
  if (!fs.existsSync(origAbs)) throw new Error(`original não encontrado: ${origAbs}`);
  if (!fs.existsSync(pecaAbs)) throw new Error(`arquivo de peça não encontrado: ${pecaAbs}`);

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const modulo = require(pecaAbs);
  const peca = (modulo.pecas || []).find((p) => p.slug === slug);
  if (!peca) throw new Error(`slug "${slug}" não encontrado em ${pecaAbs}`);

  const chromeBin = acharChrome();
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editorhtml-fidelidade-'));

  try {
    const shotOriginal = path.join(dirTmp, 'original.png');
    tirarScreenshot(chromeBin, `file:///${origAbs.replace(/\\/g, '/')}`, shotOriginal, peca.w, peca.h);

    const htmlConvertido = montarHtmlMinimo(peca, path.dirname(pecaAbs));
    const arquivoConvertido = path.join(dirTmp, 'convertido.html');
    fs.writeFileSync(arquivoConvertido, htmlConvertido, 'utf8');
    const shotConvertido = path.join(dirTmp, 'convertido.png');
    tirarScreenshot(chromeBin, `file:///${arquivoConvertido.replace(/\\/g, '/')}`, shotConvertido, peca.w, peca.h);

    const imgA = decodificarPng(fs.readFileSync(shotOriginal));
    const imgB = decodificarPng(fs.readFileSync(shotConvertido));

    const fidelidade = medirDiferenca(imgA, imgB, opcoes.tolerancia);

    const imgC = deslocarImagem(imgB, opcoes.deslocamento, opcoes.deslocamento);
    const controle = medirDiferenca(imgA, imgC, opcoes.tolerancia);

    let fator;
    if (fidelidade.mediaDiferenca === 0 && controle.mediaDiferenca === 0) fator = 0;
    else if (fidelidade.mediaDiferenca === 0) fator = Infinity;
    else fator = controle.mediaDiferenca / fidelidade.mediaDiferenca;

    console.log(`conversão:  ${formatar(fidelidade)}`);
    console.log(`controle:   ${formatar(controle)}   (deslocado ${opcoes.deslocamento}px)`);
    console.log(`fator de discriminação (controle/conversão): ${fator === Infinity ? '∞' : fator.toFixed(2)}x`);
    console.log(`piso mínimo exigido: ${opcoes.piso}x — ESCOLHA declarada nesta rodada, não é lei.`);

    // Controle positivo: se o deslocamento proposital não separa do real por pelo
    // menos `piso` vezes, a prova não está discriminando nada — recusa veredito.
    // Este script NÃO decide "acima de X está aprovado" — isso exige coorte
    // julgada por alguém, e não existe aqui. Só o piso do controle é aplicado.
    if (fator < opcoes.piso) {
      console.error(
        `\n[ABORTADO] fator de discriminação ${fator === Infinity ? '∞' : fator.toFixed(2)}x abaixo do piso ${opcoes.piso}x. ` +
          'O controle deslocado não separou claramente do real — a prova não está discriminando nada. ' +
          'Não trate os números acima como confiáveis.'
      );
      process.exit(2);
    }

    console.log('\n[OK] controle discrimina acima do piso. Números medidos — sem veredito de aprovação: isso é decisão de quem julga a coorte.');
  } finally {
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main();
}

module.exports = { decodificarPng, medirDiferenca, deslocarImagem, montarHtmlMinimo, acharChrome };
