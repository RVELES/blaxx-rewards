# Blaxx Pontos — Módulo PIX (backend Python)

Backend Flask + SQLAlchemy que entrega **três funcionalidades** que faltavam no
protótipo HTML do Blaxx Pontos:

1. **Compra de pontos via PIX** — gera cobrança PIX (BR Code), recebe webhook do gateway, credita pontos.
2. **Envio de pontos entre clientes inscritos** — transferência P2P interna, com senha, comprovante e limites.
3. **Resgate de pontos via PIX** — converte pontos em R$ e dispara payout PIX para a chave do usuário.

A integração com o gateway PIX é feita por uma **interface abstrata** (`PixProvider`)
com uma implementação `MockPixProvider` que roda 100% offline. Trocar por
Mercado Pago, Asaas, Efí Bank, Stark Bank, etc. é só escrever uma nova subclasse
e injetá-la em `create_app(pix_provider=...)`.

---

## Estrutura

```
backend/
├── requirements.txt
├── run.py                     # python run.py → http://127.0.0.1:5000
├── seed.py                    # cria 2 usuários demo com saldo
├── pytest.ini
├── app/
│   ├── __init__.py            # app factory
│   ├── config.py              # constantes de negócio (limites, conversão)
│   ├── extensions.py          # db = SQLAlchemy()
│   ├── models.py              # User, Wallet, Transaction, PixCharge, PixPayout, Transfer
│   ├── pix/
│   │   ├── provider.py        # ABC PixProvider + DTOs
│   │   └── mock.py            # MockPixProvider + gerador de BR Code com CRC16
│   ├── services/
│   │   ├── wallet.py          # crédito/débito + ledger + idempotência
│   │   ├── purchase.py        # compra de pontos via PIX
│   │   ├── transfer.py        # envio P2P (e-mail ou CPF)
│   │   └── redeem.py          # resgate via PIX
│   └── api/
│       ├── auth.py            # login + Bearer token
│       ├── wallet.py          # GET /wallet, /wallet/transactions
│       ├── pix.py             # /pix/charge, /pix/webhook, /pix/simulate-payment
│       ├── transfer.py        # POST /transfer/
│       └── redeem.py          # POST /redeem/, GET /redeem/quote
└── tests/
    ├── conftest.py
    ├── test_purchase.py
    ├── test_transfer.py
    └── test_redeem.py
```

---

## Como rodar (local)

```bash
cd backend
pip install -r requirements.txt
python seed.py     # cria 2 usuários demo
python run.py      # sobe Flask em :5000
pytest             # roda os 18 testes dos 3 fluxos
```

> **Nota sobre o sandbox desta sessão:** o ambiente onde validei o código
> não tem acesso ao PyPI (proxy bloqueado), então não consegui executar a
> suíte completa de testes aqui. O que **foi** validado:
> - sintaxe de todos os 22 arquivos (`python -m compileall`)
> - CRC16/CCITT-FALSE contra o vetor oficial (`"123456789"` → `29B1`)
> - geração do BR Code EMV (TLV bem-formado, todos os campos obrigatórios)
> - provider mock: payout sucesso (E2E ID 32 chars, padrão Bacen) e payout falha
>
> Em qualquer máquina com PyPI liberado os 18 testes pytest rodam imediatamente.

### Usuários demo (após `python seed.py`)

| Usuário        | E-mail              | CPF             | Senha   | Saldo inicial |
| -------------- | ------------------- | --------------- | ------- | ------------- |
| Mariana Costa  | mariana@blaxx.com   | 12345678900     | 123456  | 84.750 pts    |
| Lucas Andrade  | lucas@blaxx.com     | 98765432100     | 123456  |  5.000 pts    |

---

## API — exemplos curl

### Login

```bash
curl -s -X POST http://127.0.0.1:5000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"mariana@blaxx.com","password":"123456"}'
# → {"token":"<user_id>", "token_type":"Bearer", "user":{...}}
```

Use o `token` em todas as outras chamadas: `-H "Authorization: Bearer <token>"`.

### 1) Compra de pontos via PIX

```bash
# 1a) Lista pacotes
curl http://127.0.0.1:5000/pix/packages

# 1b) Cria cobrança (gera BR Code copia-e-cola)
curl -X POST http://127.0.0.1:5000/pix/charge \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"package":"plus"}'
# → {"id":"...", "txid":"...", "br_code":"00020101021226360014BR.GOV.BCB.PIX...", "status":"pending"}

# 1c) Em produção: o gateway chama /pix/webhook quando o usuário paga
# Em demo: força o "pagamento" via:
curl -X POST http://127.0.0.1:5000/pix/simulate-payment \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"charge_id":"<id da charge>"}'
# → pontos creditados, charge.status = "paid"
```

### 2) Envio de pontos entre clientes

```bash
curl -X POST http://127.0.0.1:5000/transfer/ \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "to": "lucas@blaxx.com",
    "amount_pts": 2000,
    "password": "123456",
    "message": "obrigado!"
  }'
# → {"id":"...", "receipt_code":"ENV-2026-XXXX-XXXX", ...}
```

Aceita também CPF com ou sem máscara (`"to": "987.654.321-00"`).

### 3) Resgate via PIX

```bash
# 3a) Cota: quanto recebo por X pontos
curl "http://127.0.0.1:5000/redeem/quote?points=5000" \
  -H "Authorization: Bearer $TOKEN"
# → {"points":5000, "amount_brl":50.00, "rate":"100 pts = R$ 1,00"}

# 3b) Solicita o resgate
curl -X POST http://127.0.0.1:5000/redeem/ \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "points": 5000,
    "pix_key": "ricardo.veles@gmail.com",
    "password": "123456"
  }'
# → {"id":"...", "amount_brl":50.0, "status":"paid", "end_to_end_id":"E..."}
```

Truque útil para teste: se a chave PIX começar com `fail-`, o mock provider
**falha** o payout e o serviço **estorna** os pontos automaticamente (transação
de tipo `refund` no extrato).

---

## Regras de negócio (em `app/config.py`)

| Constante                       | Valor padrão  | Onde aparece                |
| ------------------------------- | ------------- | --------------------------- |
| `POINTS_PER_BRL`                | 100           | "100 pts = R$ 1,00"         |
| `REDEEM_MIN_POINTS`             | 2.500         | mín. 2.500 pts (= R$ 25)    |
| `REDEEM_MAX_POINTS_PER_DAY`     | 100.000       | tela de carteira            |
| `TRANSFER_MIN_POINTS`           | 100           | tela `enviar-pontos.html`   |
| `TRANSFER_MAX_POINTS_PER_DAY`   | 50.000        | mesma tela                  |
| `PIX_CHARGE_TTL_SECONDS`        | 1.800 (30min) | tempo de vida da cobrança   |
| `POINT_PACKAGES`                | 4 pacotes     | tela `comprar-pontos.html`  |

---

## Garantias técnicas

- **Saldo nunca negativo**: lock pessimista (`SELECT … FOR UPDATE`) + `CHECK constraint` no banco.
- **Ledger imutável**: cada movimentação gera 1 `Transaction` (auditoria completa).
- **Idempotência**: webhook PIX duplicado **não** credita pontos duas vezes
  (chave única `(wallet_id, idempotency_key)`).
- **Atomicidade**: envio P2P é tudo-ou-nada — se o crédito no destinatário
  falhar, o débito no remetente é revertido na mesma transação.
- **Estorno automático em falha de payout**: se o gateway PIX retornar erro
  no resgate, os pontos voltam para a carteira como `Transaction(type=REFUND)`.

---

## Provedores PIX recomendados (cobrança + payout)

Todos os 7 abaixo expõem APIs REST públicas com sandbox e cobrem cobrança
**e** payout (`pix-out` / "transferência PIX" / "PIX dinâmico"). Para plugar
qualquer um basta criar `app/pix/<nome>.py` herdando de `PixProvider`.

| Provedor              | Pontos fortes                                                                  | Tarifa típica PIX*    | Sandbox | Quando escolher                                                |
| --------------------- | ------------------------------------------------------------------------------ | --------------------- | ------- | -------------------------------------------------------------- |
| **Mercado Pago**      | Maior alcance no BR, doc clara, SDK Python oficial, conciliação no painel.     | ~0,99% por recebido   | Sim     | Volume médio/alto, time pequeno, quer começar rápido.          |
| **Asaas**             | Foco PMEs, split nativo (útil para repassar a parceiros), webhooks confiáveis. | ~R$ 1,99 por payout   | Sim     | Se você vai **repartir** receita entre marcas parceiras.       |
| **Efí Bank** (Gerencianet) | Pioneira em PIX no Brasil, certificado mTLS, payout barato.                | A partir de R$ 0,99   | Sim     | Quem quer **payout** em volume com custo previsível.           |
| **Stark Bank**        | API-first, ótima DX, ideal para B2B/financeiras, Webhooks assinados (ECDSA).   | Negociado por contrato| Sim     | Se o Blaxx vai virar uma fintech / instituição de pagamento.   |
| **Woovi (Open Pix)**  | Especializada em PIX (cobrança recorrente, split, parcelado, "PixCredit").     | A partir de 0,99%     | Sim     | Quer recursos avançados de PIX (recorrente, parcelado).        |
| **PagBank/PagSeguro** | Marca consolidada, suporte a maquininha + PIX no mesmo extrato.                | ~0,99% + R$ 0,40      | Sim     | Se já existe relação com PagBank no operacional.               |
| **Pagar.me** (Stone)  | Robusto para e-commerce, antifraude integrado, console maduro.                 | ~1% + R$ 0,40         | Sim     | Quando o resto do checkout já é Pagar.me / Stone.              |

\* Tarifas variam por contrato e volume; valores acima são apenas referência pública aproximada.

### Recomendação para começar

- **MVP / lançamento** → **Mercado Pago** (cobrança) + **Efí Bank** (payout).
  Combo barato, com SDK Python e webhooks bem documentados.
- **Quando crescer** → migrar para **Stark Bank** ou **Woovi**, que têm SLAs
  contratuais e features específicas para programas de pontos (split,
  conciliação por txid, idempotência nativa).

### Como plugar um provedor real

```python
# app/pix/mercadopago.py
from .provider import PixProvider, PixChargeRequest, PixChargeResponse, ...
import requests

class MercadoPagoPixProvider(PixProvider):
    name = "mercadopago"
    def __init__(self, access_token: str):
        self.token = access_token

    def create_charge(self, req: PixChargeRequest) -> PixChargeResponse:
        r = requests.post(
            "https://api.mercadopago.com/v1/payments",
            headers={"Authorization": f"Bearer {self.token}"},
            json={
                "transaction_amount": req.amount_cents / 100,
                "payment_method_id": "pix",
                "description": req.description,
                "external_reference": req.txid,
                "payer": {"email": req.payer_cpf + "@blaxx.com"},
            },
        ).json()
        return PixChargeResponse(
            txid=req.txid,
            br_code=r["point_of_interaction"]["transaction_data"]["qr_code"],
            qr_code_image=r["point_of_interaction"]["transaction_data"]["qr_code_base64"],
        )

    def request_payout(self, req): ...  # análogo
```

E em `run.py` ou `app/__init__.py`:

```python
from app.pix.mercadopago import MercadoPagoPixProvider
app = create_app(pix_provider=MercadoPagoPixProvider(os.environ["MP_TOKEN"]))
```

Nenhum serviço, modelo, endpoint ou teste precisa mudar.

---

## Em produção, tem que adicionar

Esta entrega é o esqueleto funcional do módulo. Antes de subir em produção:

- Trocar o "Bearer = user_id" por **JWT** ou Flask-Login.
- Validar **assinatura HMAC** dos webhooks PIX (cada provedor tem o seu esquema).
- Restringir `/pix/webhook` por **IP whitelist** ou mTLS.
- Migrar do SQLite para **PostgreSQL** (a única mudança é `DATABASE_URL`).
- Adicionar **rate limiting** nos endpoints de envio e resgate (Flask-Limiter).
- Usar **Alembic** para migrations em vez de `db.create_all()`.
- Plugar observabilidade: métricas Prometheus, logs estruturados, Sentry.
- KYC do destinatário do resgate (verificar se a chave PIX bate com o CPF do usuário).
