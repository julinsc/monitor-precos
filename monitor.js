// Monitor de preços — TerabyteShop -> Telegram
// Uso:  node monitor.js  [--teste]
// Env:  TELEGRAM_TOKEN, TELEGRAM_CHAT_ID (obrigatórias p/ enviar)
// Opcional: ALVO_R$ (preço-alvo), RESUMO=1 (manda resumo de status), QUIET=1

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DIR = __dirname;
const ARQ_HIST = path.join(DIR, 'data', 'historico.json');
const ARQ_ESTADO = path.join(DIR, 'data', 'estado.json');
const ARQ_CONFIG = path.join(DIR, 'config.json');
const DATA_DIR = path.join(DIR, 'data');

const TESTE = process.argv.includes('--teste');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ---------- utilidades ----------
function lerJSON(arq, padrao) {
  try {
    const bruto = fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(bruto);
  } catch (e) {
    if (fs.existsSync(arq)) console.warn(`[aviso] nao consegui ler ${path.basename(arq)} (${e.message}); recomecando do zero`);
    return padrao;
  }
}
function salvarJSON(arq, obj) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, JSON.stringify(obj, null, 2), 'utf8');
}
const brl = n => (n == null ? '-' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const agr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

// ---------- Telegram ----------
async function telegram(texto) {
  const token = process.env.TELEGRAM_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.log('[telegram] TOKEN/CHAT_ID ausente. Mensagem que seria enviada:\n' + texto.replace(/<[^>]+>/g, '') + '\n');
    return 'sem-credencial';
  }
  let ultimoErro = '';
  for (let tent = 1; tent <= 3; tent++) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: false }),
      });
      const j = await r.json();
      if (j.ok) { console.log('[telegram] enviado'); return 'enviado'; }
      ultimoErro = JSON.stringify(j);
      // erro de "parse entities" não se resolve tentando de novo
      if (j.error_code === 400 && /parse entities/i.test(j.description || '')) break;
    } catch (e) {
      ultimoErro = e.message;
    }
    await new Promise(r => setTimeout(r, 1500 * tent));
  }
  console.error('[telegram] falhou:', ultimoErro);
  return 'falhou';
}

// ---------- navegador ----------
function acharChrome() {
  if (process.env.CHROME_PATH) {
    if (fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    console.warn(`[aviso] CHROME_PATH="${process.env.CHROME_PATH}" nao existe; procurando automaticamente`);
  }
  const candidatos = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  const achado = candidatos.find(p => fs.existsSync(p));
  if (achado) return achado;

  // Ultimo recurso: varrer as pastas tipicas de instalacao do Chrome/Chromium
  const dirs = [
    '/opt/google/chrome',
    '/opt/google/chrome-beta',
    '/opt/chromium',
    '/usr/lib/chromium',
    '/usr/lib/chromium-browser',
  ];
  for (const d of dirs) {
    try {
      for (const f of fs.readdirSync(d)) {
        if (/^chrome$|^chromium/.test(f)) {
          const full = path.join(d, f);
          try { fs.accessSync(full, fs.constants.X_OK); return full; } catch {}
        }
      }
    } catch {}
  }

  // Diagnostico util quando nao acha nada
  const diag = [];
  for (const d of ['/usr/bin', '/opt', '/snap/bin']) {
    try {
      const lista = fs.readdirSync(d).filter(f => /chrom/i.test(f));
      diag.push(`${d}: ${lista.length ? lista.join(', ') : '(nada)'}`);
    } catch { diag.push(`${d}: (inacessivel)`); }
  }
  throw new Error(
    'Chrome/Chromium nao encontrado nesta maquina. Defina a variavel CHROME_PATH.\n' +
    `Plataforma: ${process.platform}\nBusca: ${diag.join(' | ')}`
  );
}

async function lancarNavegador() {
  return puppeteer.launch({
    executablePath: acharChrome(),
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--lang=pt-BR',
    ],
    defaultViewport: { width: 1366, height: 900 },
  });
}

async function abrirPagina(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const t = req.resourceType();
    const u = req.url();
    if (['image', 'media', 'font', 'stylesheet'].includes(t)) return req.abort().catch(() => {});
    if (/googleads|doubleclick|facebook|edrone|coremedia|hotjar|youtube|ipify|recaptcha|clarity|googletagmanager|analytics/i.test(u)) {
      return req.abort().catch(() => {});
    }
    req.continue().catch(() => {});
  });
  return page;
}

// Lê pelo JSON-LD (mais estável); se faltar, cai para os elementos visíveis.
async function extrairPreco(page, url) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (resp && resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
  await page
    .waitForFunction(() => /R\$\s*[\d.]+,/.test(document.body?.innerText || ''), { timeout: 25000 })
    .catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  const info = await page.evaluate(() => {
    const txt = s => (s || '').replace(/\s+/g, ' ').trim();
    const numero = s => {
      if (!s) return null;
      const m = String(s).match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
      if (m) return Number(m[1].replace(/\./g, '') + '.' + m[2]);
      const m2 = String(s).match(/"price"\s*:\s*"?(\d+(?:[.,]\d{2})?)"/);
      return m2 ? Number(m2[1].replace(',', '.')) : null;
    };

    let titulo = null, preco = null, precoAntigo = null, disponivel = null, fonte = null;

    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let j;
      try { j = JSON.parse(s.textContent); } catch { continue; }
      const arr = Array.isArray(j) ? j : [j];
      for (const item of arr) {
        const prod = item['@type'] === 'Product' ? item : (item['@graph'] || []).find(x => x['@type'] === 'Product');
        if (!prod) continue;
        const oferta = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
        if (!oferta) continue;
        titulo = txt(prod.name);
        preco = numero(String(oferta.price ?? '').replace('.', ','));
        disponivel = /InStock/i.test(oferta.availability || '');
        fonte = 'json-ld';
        break;
      }
      if (preco != null) break;
    }

    if (preco == null) {
      const el = document.querySelector('.val-prod, [itemprop="price"], .product-sticky-bar__content span');
      if (el) { preco = numero(el.getAttribute('content') || el.textContent); fonte = 'dom'; }
    }
    const h1 = document.querySelector('h1, .product-sticky-bar__content h2');
    titulo = titulo || txt(h1?.textContent);

    const del = document.querySelector('del, .val-prod-antigo, [class*="old-price"]');
    precoAntigo = numero(txt(del?.textContent));

    const corpo = document.body?.innerText || '';
    if (/Produto Indispon[ií]vel|Produto esgotado/i.test(corpo)) disponivel = false;
    if (disponivel == null) disponivel = true;

    return { titulo, preco, precoAntigo, disponivel, fonte };
  });

  if (info.preco == null) throw new Error('nao consegui ler o preco (pagina mudou ou foi bloqueada)');
  return info;
}

function montarMensagem(produto, info, anteriorPreco, alvo) {
  const mudou = anteriorPreco != null && info.preco !== anteriorPreco;
  const caiu = anteriorPreco != null && info.preco < anteriorPreco;
  const emoji = !info.disponivel ? '🔴' : caiu ? '📉' : '💰';
  const abaixoDoAlvo = alvo != null && info.preco <= alvo;

  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linhas = [];
  linhas.push(`${emoji} <b>${esc(info.titulo || produto.apelido)}</b>`);
  linhas.push('');
  if (mudou) {
    const dif = info.preco - anteriorPreco;
    const pct = ((dif / anteriorPreco) * 100).toFixed(1).replace('.', ',');
    linhas.push(`De <s>${brl(anteriorPreco)}</s> para <b>${brl(info.preco)}</b>`);
    linhas.push(`Variacao: ${dif > 0 ? '+' : ''}${brl(dif)} (${pct}%)`);
  } else {
    linhas.push(`Preco atual: <b>${brl(info.preco)}</b>`);
  }
  if (info.precoAntigo && info.precoAntigo > info.preco) linhas.push(`Preco de tabela: ${brl(info.precoAntigo)}`);
  if (alvo != null) linhas.push(`Seu alvo: ${brl(alvo)}${abaixoDoAlvo ? '  ✅ bateu!' : ''}`);
  linhas.push(`Estoque: ${info.disponivel ? 'disponivel 🟢' : 'indisponivel 🔴'}`);
  linhas.push('');
  linhas.push(`<a href="${produto.url}">👉 Abrir na TerabyteShop</a>`);
  linhas.push(`<i>${agr}</i>`);
  return { texto: linhas.join('\n'), mudou, caiu, abaixoDoAlvo };
}

// ---------- principal ----------
async function main() {
  const config = lerJSON(ARQ_CONFIG, { alvo: null, produtos: [] });
  const alvoRaw = process.env.ALVO_R$ || config.alvo;
  const alvo = alvoRaw ? Number(String(alvoRaw).replace(',', '.')) : null;

  const historico = lerJSON(ARQ_HIST, {});
  const estado = lerJSON(ARQ_ESTADO, { ultimoAlerta: {} });
  estado.ultimoAlerta = estado.ultimoAlerta || {};

  const browser = await lancarNavegador();
  const page = await abrirPagina(browser);

  let houveErro = false;
  const resumo = [];

  for (const p of config.produtos) {
    const id = String(p.id);
    try {
      const info = await extrairPreco(page, p.url);
      const anterior = estado.ultimoAlerta[id] || null;
      const hist = historico[id] || (historico[id] = []);
      const anteriorPreco = hist.length ? hist[hist.length - 1].preco : null;

      hist.push({ quando: new Date().toISOString(), preco: info.preco, disponivel: info.disponivel });
      if (hist.length > 5000) hist.splice(0, hist.length - 5000);
      salvarJSON(ARQ_HIST, historico);

      const { texto, mudou, caiu, abaixoDoAlvo } = montarMensagem(p, info, anteriorPreco, alvo);
      console.log(`[ok] ${p.apelido}: ${brl(info.preco)} disponivel=${info.disponivel} anterior=${brl(anteriorPreco)} fonte=${info.fonte}`);

      const igualAoUltimoAviso =
        anterior && anterior.preco === info.preco && anterior.disponivel === info.disponivel;
      const saiuDoEstoqueSemAviso = !info.disponivel && (!anterior || anterior.disponivel);
      const cruzouAlvo = abaixoDoAlvo && (!anterior || anterior.preco > alvo);

      const deveAvisar = TESTE || (!igualAoUltimoAviso && (mudou || saiuDoEstoqueSemAviso || cruzouAlvo));

      if (deveAvisar) {
        const status = await telegram(texto);
        if (status === 'enviado' || status === 'sem-credencial') {
          estado.ultimoAlerta[id] = { preco: info.preco, disponivel: info.disponivel, quando: new Date().toISOString() };
        }
      }

      resumo.push(`• ${p.apelido}: ${brl(info.preco)} ${info.disponivel ? '🟢' : '🔴'}`);
    } catch (e) {
      houveErro = true;
      console.error(`[erro] ${p.apelido}: ${e.message}`);
      resumo.push(`• ${p.apelido}: falha na leitura (${e.message})`);
    }
  }

  salvarJSON(ARQ_ESTADO, estado);
  await browser.close();

  if (TESTE || process.env.RESUMO === '1') {
    await telegram(
      `🤖 <b>Monitor de precos - status</b>\n${agr}\n${alvo ? `Alvo: ${brl(alvo)}\n` : ''}\n${resumo.join('\n')}`
    );
  }

  if (houveErro) process.exitCode = 2;
}

main().catch(e => {
  console.error('FALHA GERAL:', e);
  process.exit(1);
});
