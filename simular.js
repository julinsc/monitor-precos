// Simula cenários de mudança de preço para testar a lógica de alerta (não toca no site).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = __dirname;
const hist = path.join(dir, 'data', 'historico.json');
const estado = path.join(dir, 'data', 'estado.json');
const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));

function ajustar(precoAntigoPorId) {
  const h = JSON.parse(fs.readFileSync(hist, 'utf8').replace(/^\uFEFF/, ''));
  for (const p of config.produtos) {
    const arr = h[String(p.id)] || [];
    if (arr.length && precoAntigoPorId[p.id] != null) arr[arr.length - 1].preco = precoAntigoPorId[p.id];
  }
  fs.writeFileSync(hist, JSON.stringify(h, null, 2), 'utf8');
  // limpa o "último aviso" para simular estado normal
  fs.writeFileSync(estado, JSON.stringify({ ultimoAlerta: {} }, null, 2), 'utf8');
}

const cenario = process.argv[2];
if (cenario === 'queda') ajustar({ 40435: 979.99, 40342: 979.99 });
else if (cenario === 'alvo') ajustar({ 40435: 999.0, 40342: 999.0 });
else if (cenario === 'igual') ajustar({ 40435: 899.99, 40342: 899.99 });

try {
  const out = execFileSync(process.execPath, [path.join(dir, 'monitor.js')], { encoding: 'utf8', stdio: 'pipe', env: process.env });
  console.log(out);
} catch (e) {
  console.log(e.stdout || '');
  console.error(e.stderr || '');
  process.exitCode = 1;
}
