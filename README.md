# Monitor de preços — TerabyteShop → Telegram

Avisa no Telegram **quando o preço cair** (ou voltar ao estoque / bater um valor-alvo que você definir) das duas cadeiras:

| # | Produto | Preço em 03/11/2026 |
|---|---------|---------------------|
| 1 | [Cadeira Gamer Terabyte New Style, 4D, Tecido, **Preta e Branca** (TR-CH-NSR4DBWF)](https://www.terabyteshop.com.br/produto/40435/cadeira-gamer-terabyte-new-style-reclinavel-4d-tecido-preta-e-branca-tr-ch-nsr4dbwf) | **R$ 899,99** à vista (de R$ 1.159,99) |
| 2 | [Cadeira Gamer Terabyte New Style, 4D, Tecido, **Preta** (TR-CH-NSR4DBF)](https://www.terabyteshop.com.br/produto/40342/cadeira-gamer-terabyte-new-style-reclinavel-4d-tecido-preta-tr-ch-nsr4dbf) | **R$ 899,99** à vista (de R$ 1.159,99) |

> As duas estão com o mesmo preço hoje. O script comprou o preço pelo **JSON-LD** da página (o dado estruturado oficial do produto), que é a forma mais estável — e cai para ler o `.val-prod` visível se o JSON-LD falhar.

---

## Como funciona (o importante: **roda sem o seu PC ligado**)

```
GitHub Actions (nuvem, de graça)  --a cada 30 min-->  abre a página com Chrome headless
                                                        |
                                                        v
                                              leu o preço e comparou com o histórico
                                                        |
                                          mudou? -->  manda mensagem no Telegram
```

- O site tem Cloudflare, então não dá para usar um `requests` simples (retorna **403**). O script usa **Chrome headless de verdade** (`puppeteer-core`), que passa normalmente.
- O **GitHub Actions** roda o script na nuvem de 30 em 30 minutos, então **funciona com o PC desligado, celular no bolso, etc.**
- O preço histórico fica salvo num arquivo (`data/historico.json`) que o próprio workflow commita de volta no repositório — assim ele "lembra" do preço anterior entre uma execução e outra.
- **Alerta dispara quando:** o preço muda e é diferente do último aviso · o produto sai do estoque · o preço entra abaixo do seu alvo (se você definir).

---

## O que você precisa fazer (passo a passo)

### 1) Criar o bot no Telegram (2 min)

1. Abra o Telegram e procure **@BotFather** (o oficial, com selo).
2. Mande `/newbot`.
3. Escolha um **nome** (ex.: `Monitor Cadeira`) → depois um **username** que termine em `bot` (ex.: `cadeira_tera_bot`).
4. O BotFather responde com um **token** parecido com:
   ```
   8123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   Guarde isso — é o `TELEGRAM_TOKEN`.
5. **Clique em "Start" / mande qualquer mensagem** para o seu bot (ex.: `oi`). Sem isso o bot **não pode** te mandar mensagem.

### 2) Descobrir o seu chat ID

Depois de mandar "oi" para o bot, abra no navegador:

```
https://api.telegram.org/bot<SEU_TOKEN>/getUpdates
```

Procure por `"chat":{"id":123456789,...}` — esse número é o `TELEGRAM_CHAT_ID`.
(Se vier `"result":[]`, mande outra mensagem para o bot e recarregue.)

### 3) Subir o projeto no GitHub

O projeto está pronto nesta pasta. Crie um repositório **privado** no GitHub (o grátis já inclui Actions) e envie:

```bash
cd monitor-precos
git init
git add .
git commit -m "monitor de precos terabyte"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/monitor-precos.git
git push -u origin main
```

> Pode ser privado — o GitHub Actions roda igual e seus segredos ficam protegidos.

### 4) Cadastrar o token e o chat ID como *secrets*

No repositório: **Settings → Secrets and variables → Actions → New repository secret**

| Nome | Valor |
|------|-------|
| `TELEGRAM_TOKEN` | o token do BotFather |
| `TELEGRAM_CHAT_ID` | o número do seu chat (passo 2) |

### 5) Rodar o primeiro teste

**Actions** → **Monitor de precos (Terabyte -> Telegram)** → **Run workflow**.
Em ~1 minuto você deve receber **duas mensagens** no Telegram com o preço atual. A partir daí ele roda sozinho a cada 30 min.

### 6) (Opcional) Definir um preço-alvo

Se quiser um aviso extra tipo "se chegar a R$ 749, eu compro":

**Settings → Secrets and variables → Actions → aba *Variables* → New repository variable**
- Nome: `ALVO_RS`
- Valor: `749`

Agora ele avisa quando o preço cruzar esse valor, além das quedas.

---

## Rodar no seu PC (opcional)

```powershell
cd monitor-precos
npm install

# teste local (imprime a mensagem no console se não houver token)
$env:TELEGRAM_TOKEN="8123456789:AAH..."
$env:TELEGRAM_CHAT_ID="123456789"
node monitor.js --teste
```

Ou use `checar.bat` (grava o log em `log.txt`).

Para agendar no Windows sem depender do GitHub: **Agendador de Tarefas** → Criar Tarefa Básica → Disparar a cada 30 min → Ação: iniciar programa `checar.bat`. A desvantagem é óbvia: **só funciona com o PC ligado**. Para o requisito "PC desligado", use o GitHub Actions.

---

## Arquivos

| Arquivo | Para que serve |
|---------|----------------|
| `monitor.js` | script principal: abre as páginas, lê o preço, compara, envia ao Telegram |
| `config.json` | lista de produtos monitorados (adicione quantos quiser) |
| `.github/workflows/monitor.yml` | agendamento na nuvem a cada 30 min |
| `data/historico.json` | histórico de preços (gerado automaticamente) |
| `simular.js` | simula cenários de preço para testar a lógica (uso interno) |

### Adicionar outro produto

Edite `config.json`:

```json
{
  "id": "12345",
  "apelido": "Nome curto",
  "url": "https://www.terabyteshop.com.br/produto/12345/..."
}
```

---

## Limitações e dicas honestas

- **Frequência:** a cada 30 min é o mínimo razoável no GitHub Actions. O GitHub pode atrasar 5–15 min em horários de pico; às vezes um run pode ser pulado. Para um monitor de preço isso é irrelevante.
- **GitHub Actions em repositório privado:** tem cota de 2.000 minutos/mês no plano grátis. Cada execução gasta ~1–2 min, então 30 min de intervalo ≈ 1.000–2.000 min/mês — fica no limite. Se apertar, mude o cron para `*/60 * * * *` (de hora em hora) que sobra folga.
- **Cloudflare:** se a Terabyte apertar o cerco, o Chrome headless pode ser bloqueado. O script é resiliente (tenta de novo, grava log), mas nesse caso o caminho é rodar no seu PC via `checar.bat` com o Chrome normal.
- **Preço lido:** é o preço **à vista (Pix/boleto)**, que é o que normalmente importa. O preço de cartão aparece como "preço de tabela" na mensagem.
- **Não faz login nem faz compra** — só lê a página pública.
