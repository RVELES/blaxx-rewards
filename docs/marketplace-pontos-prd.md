# Blaxx Pontos — Marketplace de Pontos/Milhas (PRD v0.1)

> **Status:** rascunho técnico-executável para revisão. Pivot do Blaxx Pontos atual.
> **Escopo MVP:** compra, venda, troca e transferência (com salvaguardas).
> **Atenção:** este documento **não é parecer jurídico**. A matriz por programa e qualquer fluxo que envolva venda/cessão onerosa exigem revisão de advogado de fintech/consumidor licenciado no Brasil antes do go-live.

---

## 0. TL;DR executivo

- **Produto:** marketplace P2P de pontos/milhas com escrow, KYC nível 2 e motor antifraude, operando **só sobre programas onde a operação é juridicamente permitida** (matriz dinâmica revisada).
- **Mudança vs Blaxx atual:** hoje somos um programa de fidelidade (acúmulo + resgate). Pivot adiciona book de ordens, liquidação financeira, custódia em escrow e gestão de disputas. Codebase atual reaproveitável: ~30% (auth, perfil, design system). O resto é novo.
- **Riscos críticos a mitigar antes de qualquer linha de código:**
  1. **Termos de programas BR**: Smiles, LATAM Pass, TudoAzul, Multiplus/Livelo, Esfera, Iupp explicitamente **proíbem venda/cessão onerosa**. Operar sobre eles requer modelo "presente assistido" ou bloqueio.
  2. **Precedente de mercado:** 123milhas (RJ/falência 2023), MaxMilhas (RJ 2023) — modelos de "intermediação de milhas" enfrentaram ações, bloqueios e quebra de relação com cias aéreas.
  3. **BACEN:** custodiar saldo em carteira interna recorrente → análise sob Lei 12.865/2013 (arranjo de pagamento). MVP precisa **evitar custódia >5d** ou seguir trilha de Instituição de Pagamento.
- **Posicionamento:** "marketplace transparente, com tudo em escrow, KYC sério, e que diz NÃO ao usuário quando o programa proíbe — em troca, processa em segundos quando permite." Diferencial sustentável é confiança operacional, não preço.
- **Faseamento sugerido:**
  - **MVP (90d):** transferência permitida + presente para CPF familiar registrado + Pix em escrow externo.
  - **V2 (+90d):** troca direta (swap) + cartão de crédito + ledger interno auditado.
  - **Enterprise (+180d):** book de venda aberta para programas que liberarem cessão + APIs de parceiros + 2FA hardware.

---

## 1. Premissas legais e estratégicas

### Base normativa aplicável (BR)

| Norma | Aplicação no produto |
|---|---|
| **LGPD (Lei 13.709/2018)** | Tratamento de dados pessoais; consentimento granular; relatório de impacto (RIPD) antes do go-live; DPO obrigatório |
| **CDC (Lei 8.078/1990)** | Informação clara, prazo de arrependimento 7 dias em compra digital, vedação a cláusulas abusivas |
| **Decreto 7.962/2013 (e-commerce)** | Identificação do fornecedor, atendimento, cancelamento, confirmação imediata |
| **Lei 12.865/2013 + Circulares BCB 3.682/3.683** | Arranjo/instituição de pagamento — se houver custódia recorrente |
| **Lei 9.613/1998 (PLD/FT)** | Identificação, registro, comunicação de operações suspeitas se enquadrar como obrigado |
| **Marco Civil da Internet (Lei 12.965/2014)** | Logs de conexão 6m, dados de aplicação 6m mínimo |
| **Código Civil + termos contratuais dos programas** | Cessão de direitos pessoais — alguns programas só permitem por liberalidade familiar |

### Princípios não-negociáveis do produto

1. **Nunca operacionalizar violação de termos de programa.** Se programa veda a operação, sistema **bloqueia**, não "tenta mesmo assim".
2. **Nunca armazenar credenciais (senha) de programas de fidelidade.** Validação de saldo só por integração oficial, OAuth, upload de extrato ou validação humana.
3. **Escrow obrigatório** em toda operação onerosa. Vendedor só recebe após confirmação da entrega.
4. **KYC ≥ 2** para qualquer operação onerosa (ID + selfie com prova de vida + titularidade bancária).
5. **Trilha de auditoria imutável** (append-only) para cada estado de cada ordem.
6. **Limites por confiança**: novo usuário tem teto baixo, sobe com histórico limpo.
7. **Mensagem clara em todo ponto de risco** ("seu programa pode cancelar pontos se identificar esta operação como comercial — entenda os riscos").

---

## 2. Matriz jurídica por programa (snapshot — requer revisão periódica)

> ⚠️ **Snapshot baseado em conhecimento até início 2026. Termos mudam. Manter `loyalty_programs.last_legal_review_at` e revisar a cada 90 dias.**

| Programa | Operador | Transferência grátis | Cessão familiar | Venda/cessão onerosa permitida | Limite/política | Risco de cancelamento |
|---|---|---|---|---|---|---|
| **Smiles** | GOL | Entre Smiles (taxa) | Sim, com cadastro família | **Não — termo veda comercialização** | Limites por valor | Alto |
| **LATAM Pass** | LATAM | Sim, com taxa | Sim, plano família | **Não** | Limites anuais | Alto |
| **TudoAzul** | Azul | Sim | Sim | **Não** | Limite por janela | Médio-alto |
| **Multiplus** (descontinuado) | — | — | — | — | Migrado p/ LATAM Pass | — |
| **Livelo** | Bradesco/joint | Sim (entre Livelo) | Familiar limitado | **Não** | Por CPF/CNPJ | Médio |
| **Esfera** | Santander | Sim | Restrito | **Não** | Limites bancários | Médio |
| **Iupp** | Itaú | Sim | Familiar | **Não** | Bancário | Médio |
| **Vai de Visa** | Visa | Pontos não-cessíveis | — | **Não** | Uso próprio | Baixo (não há mercado) |
| **Caixa Pontos** | Caixa | Limitado | — | **Não** | Federal | Médio |
| **Dotz** | Dotz | Sim em alguns casos | Restrito | **Verificar** — caso-a-caso | Coalizão | Médio |
| **Vivo Valoriza / TIM Black / Claro Clube** | Operadoras | Não-cessíveis | — | **Não** | Uso próprio | Baixo |
| **Programas de varejo (Atacadão Mais, Drogasil, Pão de Açúcar)** | Varejistas | Geralmente não | — | **Não** | CPF | Baixo (mercado pequeno) |

### Conclusão operacional

- **Programas em que MVP pode operar venda P2P legalmente:** praticamente nenhum dos grandes. Spec **assume que MVP foca em transferência intra-programa permitida + presente familiar + uso assistido para resgate**.
- **Para "compra/venda" de fato**: depende de programa permitir cessão onerosa (estado raro no Brasil). Plataforma libera só quando matriz tem `sale_allowed = true` para o programa, e marca operação como tal.

### Schema da matriz (tabela `loyalty_programs`)

```
id                          serial PK
slug                        varchar(50) unique         -- 'smiles','latam-pass',...
name                        varchar(120)
operator                    varchar(120)
asset_type                  enum(points,miles,cashback,voucher,credit)
transfer_intra_allowed      boolean
transfer_family_allowed     boolean
transfer_third_party_allowed enum(yes,no,conditional)
sale_allowed                enum(yes,no,conditional)
issuance_to_third_party     enum(yes,no,conditional)
fee_structure_json          jsonb                       -- {tiers, currency, value}
daily_limit                 int
monthly_limit               int
annual_limit                int
points_expiry_days          int                         -- ou null se não expira
grace_period_days           int                         -- carência após acumular
avg_transfer_minutes        int
cancellation_risk           enum(low,med,high,critical)
status                      enum(active,paused,blocked)
required_fields_json        jsonb                       -- ['cpf','full_name','email']
last_legal_review_at        timestamptz
legal_review_doc_url        text
notes                       text
```

---

## 3. Personas e jornadas

| Persona | Quem é | Objetivo principal | Riscos típicos |
|---|---|---|---|
| **Vendedor casual** | Tem pontos parados, quer dinheiro | Vender ao preço justo, receber rápido | Cancelamento pelo programa, chargeback |
| **Vendedor profissional** | "Milheiro" — opera regularmente | Volume + spread | Bloqueio do programa, fiscalização |
| **Comprador-viajante** | Quer milhas pra emitir passagem | Preço, prazo, confiança | Pontos cancelados antes de usar |
| **Trader/swapper** | Tem pontos do programa X, quer do Y | Otimização de portfólio | Spread alto, expiração |
| **Familiar/presenteador** | Quer transferir p/ cônjuge/filho | Operação rápida e gratuita | Limite, validação titularidade |
| **Admin compliance** | Equipe interna | KYC, antifraude, disputas | False positives, SLA |

### Jornada do vendedor (happy path — 13 passos)

```
1. Cadastro → 2. KYC nível 2 (doc + selfie + Pix) → 3. Validar conta no programa
4. Informar saldo + extrato → 5. Antifraude (score) → 6. Listar oferta
7. Comprador aceita → 8. Pagto em escrow → 9. Receber instrução de transferência
10. Executar transferência (interface ou manual) → 11. Comprador confirma recebimento
12. Liberação de pagamento → 13. Avaliação + recibo + log
```

### Jornada do comprador (happy path — 11 passos)

```
1. Cadastro → 2. KYC mínimo (varia por valor) → 3. Buscar pontos do programa X
4. Filtrar (preço, validade, vendedor) → 5. Conferir riscos do programa
6. Pagar (Pix/cartão) → 7. Aguardar transferência (com tracking)
8. Confirmar recebimento no programa → 9. Avaliar vendedor → 10. Comprovante → 11. Suporte se necessário
```

---

## 4. Fluxos principais

### 4.1 Cadastro + KYC (nível progressivo)

**Nível 0** (acesso ao app, sem operar):
- Email + senha forte (já temos — Fase 1 auth)
- Verificação de email

**Nível 1** (transferência intra-programa, sem dinheiro):
- + CPF
- + Data de nascimento
- + Telefone com SMS OTP
- + Aceite específico de termos de cessão

**Nível 2** (qualquer operação onerosa, valor < R$ 1.000):
- + Documento de identidade (RG ou CNH frente + verso)
- + Selfie com prova de vida (liveness check)
- + Endereço completo
- + Chave Pix CPF, titularidade automática via DICT

**Nível 3** (operações > R$ 1.000 ou volume mensal > R$ 5.000):
- + Comprovante de renda ou declaração
- + Verificação por videochamada (ou parceiro KYC)
- + Análise manual + aprovação humana
- + Limite operacional revisado a cada 90d

### Fluxograma KYC

```
[Cadastro] ──> [Verify Email] ──> [N0 OK]
                                     │
                                     ▼
                               [Iniciar operação?]
                          /       │            \
                  Transferência  Venda/Troca   Compra > R$ 1k
                       │           │              │
                       ▼           ▼              ▼
                   [N1: CPF+SMS] [N2: Doc+Selfie+Pix] [N3: + análise manual]
                       │           │              │
                       └──── Score antifraude ────┘
                                  │
                          [low] ──┴── [med/high]
                            │              │
                            ▼              ▼
                       APROVA       Hold + revisão manual
```

### 4.2 Fluxo de venda (estados)

| Estado | Trigger entrada | Trigger saída | Quem pode ver |
|---|---|---|---|
| `draft` | usuário cria | publica | vendedor |
| `pending_validation` | publicação | sistema valida titularidade+saldo | vendedor, admin |
| `listed` | validação OK | comprador aceita / vendedor cancela / expira | público (filtro) |
| `reserved` | comprador aceita | pagto confirma ou expira em 30min | partes |
| `payment_pending` | reserva | gateway confirma ou recusa | partes |
| `payment_held` | gateway OK | vendedor inicia transferência | partes + escrow |
| `transfer_in_progress` | vendedor confirma "transferi" | comprador confirma recebimento ou abre disputa | partes |
| `delivery_validation` | confirmação do comprador / SLA expira | auto-libera após 48h sem disputa | partes, admin |
| `completed` | tudo OK | — | partes, admin, fisco |
| `disputed` | qualquer parte abre | mediação encerra | partes, admin |
| `cancelled` | cancelamento antes de pagar | — | partes |
| `refunded` | disputa resolve em favor do comprador | — | partes |
| `risk_blocked` | antifraude bloqueia | revisão manual | admin |

```
draft ──publica──> pending_validation ──ok──> listed
                                              │
                          ┌───────────────────┤
                          │                   │
                  reserved (30min TTL)        cancelled
                          │
                  payment_pending
                          │
                          ▼
                    payment_held ──> transfer_in_progress ──> delivery_validation
                                                                    │
                                                ┌───────────────────┤
                                                │                   │
                                            completed            disputed
                                                                    │
                                                    ┌───────────────┤
                                                    │               │
                                                completed      refunded
```

### 4.3 Fluxo de compra

Espelhado do de venda do lado do comprador. Diferenças:
- Comprador escolhe entre **ofertas listadas** OU **cria ordem de compra** (book ao contrário).
- Se vendedor abandonar (não confirmar transferência em 4h), sistema **reatribui** automaticamente para outra oferta compatível (mesmo programa, ±5% preço).
- Se não houver substituto em 24h: estorno integral via Pix.

### 4.4 Fluxo de troca (swap)

```
A oferta: 100k Smiles, quer 80k Livelo
         │
         ▼
Sistema busca matches em book ──> B aceita
         │
         ▼
Trava ambas ofertas (TTL 1h) + valida titularidade A e B
         │
         ▼
Calcula compensação em dinheiro se taxas/expirações divergem
         │
         ▼
A executa transferência → confirmação → B executa transferência → confirmação
         │
         ▼
Se assimetria: parte que recebeu menos valor recebe compensação Pix do escrow
```

**Edge cases:**
- A transfere, B não transfere → escrow devolve A + abre disputa + B suspenso.
- Programas diferentes: taxa de equivalência calculada por motor de preço (seção 8). Spread plataforma 3-5%.

### 4.5 Fluxo de transferência (sem venda)

```
Usuário escolhe destino (próprio outro programa / CPF familiar registrado / CPF terceiro autorizado)
         │
         ▼
Sistema valida:
  - Programa permite cessão para o tipo de destino? (matriz §2)
  - Destinatário existe no programa de destino?
  - Limite diário/mensal/anual?
  - Cota familiar usada?
  - Taxa do programa?
         │
        ┌┴────────────┐
   [permitido]    [bloqueado]
        │            │
        ▼            ▼
   Aceite +     Mostra motivo
   2FA          (link p/ termos)
        │
        ▼
   Executa → notifica → confirma → log
```

### 4.6 Fluxo de disputa

```
Aberta por uma das partes → motivo (8 tipos predefinidos) + evidências (PDF/print)
         │
         ▼
SLA primeira resposta: 24h úteis. Mediador admin é alocado.
         │
         ▼
Contraparte responde (48h) → mediador analisa → decisão
         │
   ┌─────┼─────┐
   │     │     │
favor comprador │ favor vendedor
   │     │     │
estorno  acordo  libera escrow
         │     │
         ▼     ▼
   logs + email + recibo + nota fiscal da taxa (se houve)
```

---

## 5. Mapa de telas

> Convenção: nome do arquivo (atual ou novo) + função + estado de auth.

### Públicas
| Tela | Arquivo | Função |
|---|---|---|
| Landing | `index.html` (existente) | Pitch + CTA |
| Login | `login.html` ✓ Fase 1 | Email/senha + Google |
| Cadastro | `cadastro.html` ✓ Fase 1 | Form + Google |
| Recuperar senha | `recuperar-senha.html` ✓ Fase 1 | Forgot password |
| Redefinir | `redefinir-senha.html` ✓ Fase 1 | Reset com token |
| Validação email | `validacao.html` ✓ Fase 1 | Link-based |
| Termos | `termos.html` (existente) | Atualizar com cláusulas marketplace |
| Política de privacidade | `privacidade.html` (criar) | LGPD-compliant |

### Autenticadas — núcleo marketplace
| Tela | Arquivo (proposto) | Função |
|---|---|---|
| Dashboard | `dashboard.html` (existente, refazer) | KPIs do usuário, atalhos |
| Carteira de pontos | `carteira.html` (existente, expandir) | Saldo por programa, expirações |
| Comprar | `comprar-pontos.html` (existente, refatorar) | Book de ofertas, filtros |
| Vender | `vender-pontos.html` (existente, refatorar) | Criar oferta, preview de preço |
| Trocar | `trocar-pontos.html` (novo) | Swap A↔B com matching |
| Transferir | `transferir-pontos.html` (novo) | Destinatário próprio / familiar / 3º |
| Minhas ordens | `minhas-ordens.html` (novo) | Lista filtrada por estado |
| Detalhe da ordem | `ordem.html` (novo) | Timeline, ações, evidências |
| Simulador | `simulador.html` (novo) | "Quanto eu ganho/pago" |
| Extrato | `extrato.html` (existente, refatorar) | Movimentação financeira |
| Comprovantes | `comprovantes.html` (novo) | Download de PDFs |
| Disputas | `disputas.html` (novo) | Abrir + acompanhar |
| Suporte/Chamados | `central-ajuda.html` (existente) | FAQ + abrir ticket |
| KYC | `kyc.html` (novo, modal multi-step) | Upload doc + selfie |
| Perfil | `perfil.html` ✓ Fase 1 | Dados + opt-ins |
| Segurança | `seguranca.html` ✓ Fase 1 | Senha + sessões + 2FA |

### Admin (subdomínio `admin.blaxxpontos.com.br` ou rota `/admin/*` com role)
| Tela | Função |
|---|---|
| `admin/usuarios` | Aprovar KYC, bloquear, ver score |
| `admin/ordens` | Todas as ordens, filtros por estado |
| `admin/disputas` | Fila de mediação |
| `admin/programas` | CRUD da matriz jurídica |
| `admin/taxas` | Tabelas de fee da plataforma |
| `admin/antifraude` | Regras + revisão de score |
| `admin/pagamentos` | Conciliação, estornos |
| `admin/auditoria` | Visualizador de logs |
| `admin/alertas` | Alertas em aberto |
| `admin/relatorios` | Exportações financeiras / fisco |
| `admin/blacklist` | Documentos, emails, IPs banidos |

---

## 6. Modelo de dados

> SQLAlchemy-style. Indices em colunas marcadas `*`. FKs com `ondelete='RESTRICT'` salvo nota explícita.

### 6.1 Users + KYC + documentos

```
users
  id                     bigserial PK
  email*                 varchar(255) unique
  password_hash          varchar(255)
  cpf_encrypted*         varchar(255) unique nullable   -- AES-GCM
  cpf_hash*              char(64)     unique nullable   -- SHA256 p/ busca
  full_name              varchar(255)
  birth_date             date
  phone_e164*            varchar(20) nullable
  phone_verified         bool
  email_verified         bool
  kyc_level              int (0..3) default 0
  status*                enum(active,pending_verification,suspended,blocked,deleted)
  risk_tier              enum(low,med,high,critical)
  google_sub*            varchar(64) unique nullable
  accepted_terms_at      timestamptz
  accepted_privacy_at    timestamptz
  marketing_optin        bool
  created_at             timestamptz
  updated_at             timestamptz
  last_login_at          timestamptz
  deleted_at             timestamptz                    -- soft delete
  created_ip             varchar(64)
  created_user_agent     varchar(500)

user_documents
  id                     bigserial PK
  user_id*               FK users
  doc_type               enum(rg,cnh,passport,address,income_proof)
  file_url               text                            -- S3 com SSE-KMS
  ocr_extracted_json     jsonb                           -- nome, número, validade
  status                 enum(submitted,under_review,approved,rejected)
  reviewed_by_admin_id   FK admins nullable
  reviewed_at            timestamptz
  rejection_reason       text
  created_at             timestamptz

kyc_checks
  id                     bigserial PK
  user_id*               FK users
  level                  int (0..3)
  provider               varchar(50)                     -- 'unico','idwall','manual'
  liveness_score         numeric(5,2)
  face_match_score       numeric(5,2)
  bank_titularity_check  enum(ok,fail,inconclusive)
  pix_dict_check_json    jsonb
  result                 enum(approved,rejected,manual_review)
  created_at             timestamptz
  expires_at             timestamptz                     -- KYC re-up obrigatório
```

### 6.2 Programas + saldos

```
loyalty_programs
  (estrutura na §2)

user_loyalty_accounts
  id                     bigserial PK
  user_id*               FK users
  program_id*            FK loyalty_programs
  external_account_id    varchar(120)                    -- número/CPF na cia
  titularity_verified_at timestamptz nullable
  verification_method    enum(api,oauth,extract_upload,manual)
  balance_pts            int                             -- snapshot, ATUALIZAR antes de op
  balance_updated_at     timestamptz
  earliest_expiry_at     timestamptz nullable
  notes                  text
  status                 enum(active,paused,disconnected)
  UNIQUE (user_id, program_id, external_account_id)

point_balance_snapshots
  id                     bigserial PK
  user_account_id*       FK user_loyalty_accounts
  balance_pts            int
  source                 enum(api,extract,user_declared)
  evidence_url           text nullable
  created_at             timestamptz
```

### 6.3 Ordens

```
orders
  id                     bigserial PK
  public_code            varchar(12) unique              -- BLX-A3F2-9X (humano)
  kind                   enum(sell,buy,trade,transfer)
  user_id*               FK users                        -- criador
  counterparty_id*       FK users nullable               -- preenchido após match
  program_source_id*     FK loyalty_programs
  program_target_id      FK loyalty_programs nullable    -- só trade/transfer
  source_account_id      FK user_loyalty_accounts
  target_account_id      FK user_loyalty_accounts nullable
  qty_points*            int
  price_per_thousand_cents int                            -- BRL cents
  total_cents            int
  platform_fee_cents     int
  external_program_fee_cents int
  net_to_seller_cents    int
  cost_to_buyer_cents    int
  state*                 enum(draft, pending_validation, listed, reserved,
                              payment_pending, payment_held, transfer_in_progress,
                              delivery_validation, completed, disputed, cancelled,
                              refunded, risk_blocked)
  expires_at             timestamptz                     -- TTL listing/reserva
  risk_score             numeric(5,2)
  created_at             timestamptz
  updated_at             timestamptz

order_state_history
  id                     bigserial PK
  order_id*              FK orders
  from_state             varchar(40)
  to_state               varchar(40)
  reason                 text
  actor_kind             enum(user,counterparty,system,admin)
  actor_id               bigint nullable
  created_at             timestamptz

order_items                                              -- p/ trades multi-leg
  id                     bigserial PK
  order_id*              FK orders
  side                   enum(give,receive)
  program_id             FK loyalty_programs
  qty_points             int
  est_value_cents        int
```

### 6.4 Pagamentos + escrow

```
payments
  id                     bigserial PK
  order_id*              FK orders
  payer_user_id          FK users
  method                 enum(pix,credit_card,bank_transfer,wallet)
  gateway                varchar(50)                     -- 'mercadopago','pagarme'
  gateway_txn_id*        varchar(120) unique
  amount_cents           int
  status*                enum(initiated,authorized,captured,refunded,charged_back,failed)
  authorized_at          timestamptz
  captured_at            timestamptz
  refunded_at            timestamptz
  raw_response_json      jsonb
  created_at             timestamptz

escrow_movements
  id                     bigserial PK
  order_id*              FK orders
  direction              enum(in,out,hold,release,refund)
  amount_cents           int
  party                  enum(buyer,seller,platform,external_provider)
  reference_payment_id   FK payments nullable
  notes                  text
  created_at             timestamptz

payouts                                                  -- pagamento ao vendedor
  id                     bigserial PK
  user_id*               FK users
  order_id*              FK orders
  method                 enum(pix)                       -- MVP: só Pix
  pix_key                varchar(120)                    -- encrypted at rest
  amount_cents           int
  status                 enum(scheduled,processing,paid,failed,reversed)
  scheduled_for          timestamptz
  paid_at                timestamptz
  provider_payout_id     varchar(120)
  failure_reason         text
  created_at             timestamptz

fees                                                     -- snapshot de fees aplicadas
  id                     bigserial PK
  order_id*              FK orders
  kind                   enum(platform,external_program,payment_gateway,tax)
  amount_cents           int
  percentage_basis       numeric(5,4) nullable
  notes                  text
```

### 6.5 Transferência + entrega

```
transfers
  id                     bigserial PK
  order_id*              FK orders
  initiated_at           timestamptz
  initiated_method       enum(api,oauth,manual)
  reference_external_id  varchar(120)                    -- ID da transferência no programa
  proof_url              text nullable                   -- print/PDF se manual
  status                 enum(pending,confirmed_by_seller,confirmed_by_buyer,
                              auto_confirmed,failed,partial)
  confirmed_at           timestamptz
  failure_reason         text
  qty_transferred        int                             -- caso parcial
```

### 6.6 Disputas

```
disputes
  id                     bigserial PK
  order_id*              FK orders
  opened_by_user_id      FK users
  reason                 enum(not_received,wrong_qty,transfer_cancelled,
                              account_blocked,payment_chargeback,fraud_suspected,
                              program_error,wrong_recipient)
  status*                enum(open,under_review,resolved_buyer,resolved_seller,
                              resolved_split,withdrawn)
  admin_assigned_id      FK admins nullable
  sla_first_response_at  timestamptz
  resolved_at            timestamptz
  resolution_notes       text
  resolution_amount_buyer_cents int
  resolution_amount_seller_cents int
  created_at             timestamptz

dispute_messages
  id                     bigserial PK
  dispute_id*            FK disputes
  author_kind            enum(buyer,seller,admin,system)
  author_id              bigint
  body                   text
  attachments_json       jsonb
  created_at             timestamptz
```

### 6.7 Antifraude + segurança

```
risk_scores
  id                     bigserial PK
  user_id*               FK users
  order_id               FK orders nullable
  event_kind             enum(signup,kyc,order_create,login,payout,withdrawal)
  score                  numeric(5,2)                    -- 0..100
  tier                   enum(low,med,high,critical)
  signals_json           jsonb                           -- todas as variáveis
  decision               enum(approve,review,block)
  rule_ids_triggered     jsonb                           -- array
  created_at             timestamptz

fraud_rules
  id                     bigserial PK
  slug                   varchar(80) unique
  description            text
  expression             text                            -- DSL ou JSON
  weight                 int                             -- contribuição ao score
  enabled                bool
  created_at             timestamptz
  updated_at             timestamptz

device_fingerprints
  id                     bigserial PK
  user_id*               FK users
  fingerprint_hash*      char(64)
  ip*                    inet
  user_agent             varchar(500)
  geo_country            char(2)
  geo_region             varchar(50)
  proxy_or_vpn           bool
  first_seen_at          timestamptz
  last_seen_at           timestamptz

blacklist
  id                     bigserial PK
  kind                   enum(cpf,email,phone,ip,device_fp,pix_key)
  value_hash*            char(64)
  reason                 text
  added_by_admin_id      FK admins
  active                 bool
  expires_at             timestamptz nullable
```

### 6.8 Auditoria + LGPD

```
audit_logs
  id                     bigserial PK
  actor_kind             enum(user,admin,system)
  actor_id               bigint nullable
  action                 varchar(80)                     -- 'order.create','user.kyc_approve',...
  resource_kind          varchar(40)
  resource_id            bigint
  before_json            jsonb
  after_json             jsonb
  ip                     inet
  user_agent             varchar(500)
  request_id             varchar(40)
  created_at             timestamptz
  PARTITION BY RANGE (created_at)

terms_acceptances
  id                     bigserial PK
  user_id*               FK users
  doc_kind               enum(terms_of_use,privacy_policy,marketing,specific_operation)
  doc_version            varchar(20)
  doc_url                text
  accepted_at            timestamptz
  ip                     inet
  user_agent             varchar(500)

notifications
  id                     bigserial PK
  user_id*               FK users
  channel                enum(email,sms,push,whatsapp,in_app)
  template_slug          varchar(80)
  payload_json           jsonb
  sent_at                timestamptz nullable
  delivered_at           timestamptz nullable
  read_at                timestamptz nullable
  status                 enum(queued,sent,delivered,failed,read)
```

### 6.9 Admin + suporte

```
admins
  id                     bigserial PK
  email                  unique
  password_hash
  role                   enum(viewer,operator,manager,super)
  scopes_json            jsonb                           -- ['kyc','disputes','admin.programs',...]
  mfa_secret             text encrypted
  active                 bool
  created_at             timestamptz

admin_actions
  id                     bigserial PK
  admin_id*              FK admins
  action                 varchar(80)
  target_kind            varchar(40)
  target_id              bigint
  metadata_json          jsonb
  ip                     inet
  created_at             timestamptz

support_tickets
  id                     bigserial PK
  user_id                FK users nullable
  order_id               FK orders nullable
  category               varchar(40)
  subject                varchar(200)
  status                 enum(open,waiting_user,in_progress,resolved,closed)
  priority               enum(low,med,high,urgent)
  assigned_admin_id      FK admins nullable
  created_at             timestamptz
  resolved_at            timestamptz
```

### Índices críticos

- `orders(state, created_at DESC)` — book público
- `orders(program_source_id, state, price_per_thousand_cents)` — filtro de busca
- `payments(order_id, status)`
- `audit_logs(actor_id, created_at DESC)` + partição mensal
- `risk_scores(user_id, created_at DESC)`
- `users(cpf_hash)`, `users(email)`, `users(phone_e164)` — únicos

---

## 7. APIs (REST + JSON)

> Convenção: `/v1/...`, autenticação Bearer; respostas erram com `{error, code, retry_in?}`; rate-limit cabeçalhos `X-RateLimit-*`.

### 7.1 Auth (já em Fase 1 — extensões)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` ✓ | (já temos) |
| POST | `/auth/login` ✓ | |
| POST | `/auth/google` (v2) | OAuth ID token |
| POST | `/auth/2fa/setup` | TOTP secret |
| POST | `/auth/2fa/verify` | |
| POST | `/auth/refresh` (v2) | refresh rotation |

### 7.2 KYC

| Método | Rota | Body | Retorna |
|---|---|---|---|
| GET | `/kyc/status` | — | `{level, can_upgrade_to, blockers[]}` |
| POST | `/kyc/start` | `{target_level}` | session_id + provider URL |
| POST | `/kyc/documents` | multipart (`doc_type`, file) | doc id |
| POST | `/kyc/selfie` | multipart | liveness + match score |
| POST | `/kyc/pix-titularity` | `{pix_key}` | `{verified, holder_name}` |
| GET | `/kyc/checks` | — | histórico |

### 7.3 Programas + contas de fidelidade

| Método | Rota | Função |
|---|---|---|
| GET | `/programs` | lista pública da matriz (filtrável) |
| GET | `/programs/:slug` | detalhe + regras públicas |
| POST | `/me/loyalty-accounts` | conectar conta (oauth/manual) |
| GET | `/me/loyalty-accounts` | listar contas conectadas |
| POST | `/me/loyalty-accounts/:id/refresh-balance` | atualizar saldo |
| POST | `/me/loyalty-accounts/:id/upload-extract` | upload de extrato |
| DELETE | `/me/loyalty-accounts/:id` | desconectar |

### 7.4 Ordens

| Método | Rota | Função |
|---|---|---|
| POST | `/orders` | criar (sell/buy/trade/transfer) |
| GET | `/orders` | minhas ordens (filtros) |
| GET | `/orders/:id` | detalhe |
| GET | `/orders/public` | book público (sell listadas) |
| POST | `/orders/:id/accept` | comprador aceita oferta |
| POST | `/orders/:id/cancel` | cancelar (regras por estado) |
| POST | `/orders/:id/confirm-transfer` | vendedor confirma transferência |
| POST | `/orders/:id/confirm-receipt` | comprador confirma recebimento |
| POST | `/orders/:id/dispute` | abrir disputa |
| GET | `/orders/:id/timeline` | order_state_history |

### 7.5 Preço + simulação

| Método | Rota | Função |
|---|---|---|
| POST | `/pricing/quote` | `{program_id, qty, side, urgency}` → preço sugerido + breakdown |
| GET | `/pricing/programs/:slug/avg` | média móvel 7d/30d |
| POST | `/pricing/trade-simulate` | troca A↔B com compensação |

### 7.6 Pagamentos

| Método | Rota | Função |
|---|---|---|
| POST | `/payments/init` | `{order_id, method, return_url}` |
| POST | `/payments/:id/capture` | (webhook gateway) |
| POST | `/payments/webhooks/:gateway` | assinatura HMAC obrigatória |
| GET | `/payments/:id/status` | |

### 7.7 Disputas + suporte

| Método | Rota | Função |
|---|---|---|
| POST | `/disputes` | abrir |
| GET | `/disputes/:id` | timeline + mensagens |
| POST | `/disputes/:id/messages` | adicionar |
| POST | `/disputes/:id/evidence` | upload arquivos |
| GET | `/me/tickets` | meus chamados |
| POST | `/tickets` | abrir chamado |

### 7.8 Admin (todas em `/admin/*` com role)

`/admin/users/:id/{approve,suspend,bump-tier}`, `/admin/orders/:id/{force-state,refund}`, `/admin/disputes/:id/{assign,resolve}`, `/admin/programs/{CRUD}`, `/admin/fraud-rules/{CRUD}`, `/admin/reports/financial?period=…`, `/admin/audit-logs?query=…`.

### Padrão de erros

```json
{
  "error": "Mensagem para humano",
  "code": "kyc.level_insufficient",
  "details": { "required_level": 2, "current_level": 1 },
  "request_id": "req_AB12CD",
  "retry_in": 60
}
```

Códigos HTTP padrão: 400 validação, 401 não-autenticado, 403 sem permissão / KYC insuficiente, 404, 409 conflito de estado, 422 regra de negócio, 429 rate limit, 500.

---

## 8. Motor de precificação

### Fórmula base (preço por milheiro, em centavos)

```
preço_milheiro = base[programa]
              × fator_demanda(programa, janela_7d)
              × fator_expiração(dias_até_expirar)
              × fator_urgência(side, prazo_entrega)
              × fator_reputação_vendedor
              × fator_promoção(programa, ativa?)
              × (1 + spread_plataforma)
```

### Variáveis e pesos sugeridos (calibrar com dados)

| Variável | Faixa | Notas |
|---|---|---|
| `base[programa]` | R$ 12-32 / milheiro | snapshot manual, atualizado semanalmente |
| `fator_demanda` | 0.85-1.20 | baseado em volume + razão compra/venda |
| `fator_expiração` | 0.50 (≤30d) a 1.00 (>365d) | curva linear |
| `fator_urgência` | 1.00 normal, 1.15 imediato | vendedor topa transferir em 1h |
| `fator_reputação` | 0.90-1.05 | score 0-100 do vendedor |
| `fator_promoção` | 0.85-0.95 | quando programa tem bônus de transferência |
| `spread_plataforma` | 5-12% | configurável por programa/tier de usuário |

### Output ao usuário (transparente)

```
┌──────────────────────────────────────────┐
│ 50.000 Smiles                            │
│                                          │
│ Preço bruto:        R$ 1.250,00          │
│ Taxa da plataforma: R$    87,50  (7,0%)  │
│ Taxa do programa:   R$    25,00          │
│ ─────────────────────────────────────    │
│ Você recebe:        R$ 1.137,50          │
│ Comprador paga:     R$ 1.275,00          │
│                                          │
│ Score atratividade: ★★★★☆                │
│ Prazo entrega:      24-72h               │
└──────────────────────────────────────────┘
```

---

## 9. Antifraude

### Sinais coletados em cada evento

| Categoria | Sinais |
|---|---|
| Identidade | CPF (verificado), nome match doc, idade |
| Dispositivo | fingerprint (canvas+webgl+fontes), user-agent, OS |
| Rede | IP, AS, geo, VPN/proxy/Tor detect, distância geográfica vs cadastro |
| Comportamento | velocidade entre eventos, número de tentativas, padrão de digitação (Fase 3) |
| Conta | idade, KYC level, histórico transacional, chargebacks, disputas perdidas |
| Documentos | OCR consistente, face match score, liveness score |
| Bancário | titularidade Pix (DICT match), banco recém-aberto, número de chaves rotacionadas |
| Operacional | valor vs média do usuário, programa de alto risco, contraparte recém-criada, triangulação |
| Cadastro | mudança recente de email/telefone/Pix, conta < 7d, blacklist match |

### Score (0-100)

| Tier | Faixa | Ação |
|---|---|---|
| `low` | 0-30 | aprovação automática |
| `med` | 31-60 | aprovação + monitor; revisão se valor alto |
| `high` | 61-85 | revisão manual obrigatória antes de prosseguir |
| `critical` | 86-100 | bloqueio imediato; congelar carteira; reportar |

### Regras de bloqueio "hard" (independem de score)

1. CPF/email/Pix em blacklist → block
2. Liveness < 60 → block, exige re-KYC
3. Face match < 75 → block, revisão manual
4. 5 tentativas de login falhas em 10min → block 1h por IP
5. 3 disputas perdidas como vendedor em 30d → suspend
6. Chargeback aberto → freeze carteira
7. Mudança de Pix + payout em <24h → hold 72h
8. >R$ 5k em 24h sem histórico → manual review
9. Conta com <7d operando >R$ 1k → hold + KYC 3
10. IP de país != endereço cadastrado + sem MFA → desafio adicional

### Limites por confiança

| Tier | Limite por op | Limite diário | Limite mensal | Saque (payout) |
|---|---|---|---|---|
| `new` (<30d) | R$ 500 | R$ 1.000 | R$ 5.000 | em 72h |
| `bronze` | R$ 2.000 | R$ 5.000 | R$ 20.000 | 24h |
| `silver` | R$ 5.000 | R$ 15.000 | R$ 60.000 | 12h |
| `gold` | R$ 15.000 | R$ 50.000 | R$ 200.000 | 2h |
| `platinum` | sob análise | sob análise | sob análise | 30min |

---

## 10. Pagamentos e liquidação

### Métodos MVP
- **Pix** (entrada e saída — vendedor recebe via Pix)
- **Cartão de crédito** (V2 — Pagar.me/Stone/MercadoPago) com antifraude do gateway

### Arquitetura recomendada (MVP — evita custódia)

```
Comprador
   │ Pix
   ▼
Conta escrow do gateway (não nossa) ──── Pagar.me/MP "marketplace mode"
   │
   ├──> liberação programada após confirmação de entrega
   │       ↓
   │   Pagar para vendedor (Pix automático)
   │       ↓
   │   Fee para nossa conta operacional
   └──> em caso de disputa: hold + intervenção admin
```

**Por que terceirizar custódia no MVP:** não criamos conta de pagamento própria → **não cai como arranjo de pagamento perante BACEN** no primeiro momento. Crescemos com volume + estrutura jurídica antes de internalizar.

### Quando virar IP (Instituição de Pagamento)

Indicadores que disparam análise regulatória:
- Saldo médio custodiado > R$ 500.000
- > 500 mil contas com saldo
- Volume mensal > R$ 50M
- Manter saldo médio dos usuários > 5 dias

→ Engajar advogado especializado + estudo de viabilidade IP-pré-paga.

### Conciliação financeira

- Job diário: confronta `payments` × `escrow_movements` × extrato bancário → relatório de divergências.
- Conta contábil por evento (ledger duplo): toda movimentação tem débito + crédito balanceados.
- Fechamento mensal automático com bloqueio de edição.

---

## 11. LGPD

### Bases legais por categoria de dado

| Dado | Base legal | Finalidade | Retenção |
|---|---|---|---|
| Email, nome, senha hash | execução de contrato | criar conta | enquanto ativo + 5 anos pós-encerramento |
| CPF, RG, CNH, selfie | obrigação legal (CDC/PLD) + execução contrato | KYC, antifraude | 5 anos após última operação |
| Chave Pix, banco | execução contrato | liquidação | 5 anos |
| IP, user-agent, device | legítimo interesse (segurança) | antifraude | 6 meses (Marco Civil) |
| Saldo de pontos | execução contrato | core feature | enquanto ativo |
| Comunicações marketing | consentimento | enviar emails opcionais | até revogação |
| Logs de auditoria | obrigação legal | rastreabilidade | 5 anos |

### Direitos do titular (canal único `/me/privacy`)

- Acesso: ver todos os dados próprios em JSON downloadable.
- Correção: editar campos editáveis; outros via ticket.
- Anonimização: aplicada após exclusão da conta — mantém logs financeiros pseudonimizados.
- Exclusão: 30d de soft-delete + hard delete (preservando obrigações legais).
- Portabilidade: export JSON com schema documentado.
- Revogação de consentimento marketing: 1-click.

### Encarregado (DPO)
- Nome + email público no rodapé + página `/privacidade.html`.
- SLA primeira resposta: 5 dias úteis. Resposta definitiva: 15 dias úteis.

### Incidentes
- Plano documentado: contenção em 4h, comunicação ANPD em 48h se risco elevado, comunicação a titulares se aplicável.
- Tabletop exercise trimestral.

---

## 12. Segurança técnica

### Stack base recomendada (evolução do que já temos)

| Camada | Decisão | Status |
|---|---|---|
| Front | HTML/CSS/Vanilla JS (mantém) | atual |
| Back | Python/Flask (Fase 1) → considerar FastAPI para APIs públicas | atual |
| DB | SQLite (dev) → **PostgreSQL** (prod, antes do MVP) | mudar |
| Cache/RL | Redis (rate limit, sessões, escrow lock) | adicionar |
| Search | Postgres FTS no MVP; OpenSearch se >100k ofertas | futuro |
| Filas | Celery + Redis (notificações, KYC async, payouts) | adicionar |
| Storage | S3-compatible com SSE-KMS (docs KYC) | adicionar |
| Infra | Fly.io ou AWS (V2). CDN: Cloudflare | mudar |

### Headers e práticas obrigatórias

| Item | Valor / nota |
|---|---|
| CSP | `default-src 'self'; script-src 'self' https://accounts.google.com https://www.googletagmanager.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-src https://accounts.google.com` |
| HSTS | `max-age=31536000; includeSubDomains; preload` |
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | desligar geolocation/microphone/camera (exceto onde necessário) |
| Cookies | HttpOnly + Secure + SameSite=Lax (Strict para admin) |
| Senhas | Argon2id (V2 — hoje bcrypt 12) |
| Tokens | JWT curto (15min) + refresh rotation (30d) — V2 |
| Criptografia em repouso | AES-256-GCM para CPF, RG, Pix; chaves no KMS |
| TLS | 1.2 mínimo, 1.3 preferido |
| 2FA | TOTP para usuários; **WebAuthn obrigatório** para admins |
| Logs | sem PII / sem senha / sem token; mascarar CPF nos 5 últimos dígitos |
| Backups | diário criptografado, retenção 30d, teste mensal de restore |
| Pen-test | externo anual + após mudanças críticas |

---

## 13. Painel administrativo

### Funcionalidades por role

| Role | Pode |
|---|---|
| `viewer` | Ler ordens, usuários, disputas; sem ações |
| `operator` | + Aprovar KYC, mediar disputas low-risk, responder tickets |
| `manager` | + Estornos, ajustes de carteira, edição de programas, freeze |
| `super` | + Editar regras antifraude, gerir admins, exportar dados pessoais em massa |

### Telas-chave

1. **Fila de KYC** — paginação por antiguidade, sort por valor pendente da próxima op.
2. **Fila de disputas** — SLA badge (vermelho >24h), atribuição automática round-robin.
3. **Order inspector** — timeline completa, ledger financeiro, links cruzados, "force state" com motivo obrigatório.
4. **Antifraude** — score breakdown por regra, override com justificativa.
5. **Matriz de programas** — CRUD + diff histórico + "marcar para revisão jurídica".
6. **Relatórios** — financeiro mensal, GMV, take rate, churn, NPS, top vendedores.
7. **Audit log explorer** — busca por usuário, ação, intervalo de tempo, com export CSV (não-modificável).

---

## 14. Auditoria

### Schema imutável já em §6.8 (`audit_logs`)

### Garantias
- **Append-only** via permissões de role no DB (admin não pode `UPDATE`/`DELETE`).
- **Particionamento mensal** + arquivamento frio após 90 dias.
- **Hash chain opcional** (V2): cada linha contém SHA-256 da anterior — detecta tampering.
- **Eventos obrigatoriamente logados:**
  - Criação/edição/cancelamento de ordem
  - Mudanças de estado de ordem
  - KYC: submissão, aprovação, rejeição
  - Pagamentos (todos os estados)
  - Logins, logouts, falhas de auth
  - Mudanças de senha/email/Pix
  - Ações admin (toda e qualquer)
  - Aceites de termos
  - Acesso a dados de usuário por admin (LGPD)

---

## 15. Plano de testes

### Cobertura por camada

| Camada | Ferramenta | Coverage alvo |
|---|---|---|
| Unit | pytest | ≥ 80% nos services |
| Integration | pytest + Flask test client | fluxo completo de cada endpoint |
| E2E | Playwright | jornadas do mapa de telas |
| Carga | k6 / Locust | 500 RPS no book público, 50 RPS em /orders |
| Segurança | OWASP ZAP + bandit + pip-audit | scan no CI |
| Pen-test | externo | anual + grandes releases |
| Caos | Toxiproxy / fault injection | gateway down, DB lock, queue lag |

### Casos extremos obrigatórios

1. Vendedor lista pontos que **não tem mais** (validação pós-listagem).
2. Comprador paga mas vendedor **abandona** → reatribuição automática ou refund em 24h.
3. **Chargeback** após entrega: vendedor já recebeu — disputa congela payout futuro.
4. Vendedor **muda Pix** entre listing e payout → hold 72h + email + 2FA.
5. **Programa cancela** os pontos antes do uso pelo comprador → disputa, escrow devolve.
6. Pontos **expiram durante a operação** → trigger automático fecha listing.
7. **Transferência parcial** (50% confirmada): UI marca, comprador escolhe aceitar parcial ou abrir disputa.
8. **Múltiplas ordens pequenas** de mesmo CPF em janela de 1h → score alto + revisão.
9. Documento de identidade **deepfake/foto-de-foto** → liveness 3D + face match falha.
10. Vendedor tenta usar **conta de terceiro** (nome diferente do CPF cadastrado) → bloqueio na validação de titularidade.
11. **Triangulação**: A vende para B, B vende para C com mesmos pontos sintéticos → grafo de relacionamentos sinaliza.
12. **DDoS no book público** → CDN + rate limit por IP em /orders/public.
13. **Replay** de chamada de webhook → idempotência por gateway_txn_id + assinatura HMAC.
14. **Race condition** em aceite de oferta (2 compradores no mesmo segundo) → lock pessimista na linha de orders.
15. Usuário **clica 2x rápido** em "confirmar pagamento" → idempotência client_request_id.

---

## 16. Critérios de aceite (MVP)

O MVP só vai a produção se TODOS os itens abaixo passarem:

- [ ] Nenhuma operação ocorre sem aceite explícito (termo + risco do programa).
- [ ] Nenhuma senha de programa de fidelidade está armazenada no DB.
- [ ] Toda ordem tem `state` consistente; toda transição grava `order_state_history`.
- [ ] Toda taxa aparece **antes** do botão "confirmar" (sem custo escondido).
- [ ] Todo pagamento tem `escrow_movements` rastreável.
- [ ] Toda transferência tem `transfers.proof_url` OU `reference_external_id`.
- [ ] Toda disputa tem SLA medido (`sla_first_response_at` + alerta).
- [ ] Todo dado pessoal coletado tem finalidade documentada em `/privacidade.html`.
- [ ] Operações `high`/`critical` no antifraude **não passam** sem revisão.
- [ ] Admin pode atualizar matriz `loyalty_programs` e a mudança aparece em ≤ 60s.
- [ ] Há `dpo@blaxxpontos.com.br` ativo + SLA documentado.
- [ ] CSP, HSTS, cookies HttpOnly+Secure ativos em produção.
- [ ] Pen-test sem **High/Critical** abertas.
- [ ] Plano de incidente LGPD assinado pelo DPO.
- [ ] Backup + restore testado em ambiente paralelo nos últimos 30d.
- [ ] Parecer jurídico **escrito** sobre matriz de programas e termo de uso.
- [ ] Compliance check do parceiro de pagamento (Mercado Pago/Pagar.me) aprovado.

---

## 17. Roadmap MVP → V2 → Enterprise

### MVP (12 semanas)

**Objetivo:** "transferência permitida + presente familiar" + cadastro/KYC sério + ledger interno + admin básico.

| Sprint | Entregável |
|---|---|
| S1-2 | DB Postgres + migrations Alembic; modelos da §6; auth Fase 2 (JWT+refresh) |
| S3 | KYC níveis 0-2 (doc + selfie + DICT); integração provedor (Idwall/Unico) |
| S4 | Matriz de programas + CRUD admin; lista de programas para usuário |
| S5 | Conexão de contas de fidelidade (manual + upload extrato) |
| S6-7 | Fluxo de transferência ponta-a-ponta + estados + auditoria |
| S8 | Pix integrado (Mercado Pago modo marketplace) + escrow + payout vendedor |
| S9 | Motor antifraude v1 (regras estáticas + score) |
| S10 | Disputas + suporte + notificações (email + SMS via Twilio/Zenvia) |
| S11 | Painel admin + relatórios + auditoria explorer |
| S12 | Pen-test + ajustes + soft launch beta fechado |

**Não-MVP:** cartão, troca multi-programa, 2FA, app mobile, WhatsApp.

### V2 (próximos 12 semanas)

- Cartão de crédito + split de pagamento
- Troca direta (swap) com matching engine
- 2FA TOTP + WebAuthn admin
- Motor de preço dinâmico (calibração com dados do MVP)
- Programa de reputação de vendedor
- App mobile (PWA upgrade ou React Native)
- WhatsApp via API oficial (notificações + suporte)
- Integração OAuth com 2 programas piloto (Livelo/Dotz, se aceitarem)
- Hash chain em audit_logs
- A/B testing framework

### Enterprise / V3 (próximos 24 semanas)

- Conta de pagamento própria (se BACEN justificar)
- Argon2id migração de hashes
- Open Finance integração (saldos automáticos)
- Marketplace de "experiências" (resgates orquestrados — passagem, hotel)
- B2B: APIs para parceiros (corretoras, agências, fintechs de fidelidade)
- SOC 2 Type II preparação
- ISO 27001
- Compliance PCI-DSS se internalizarmos cartão
- Apps nativos iOS/Android
- Programa de afiliados / influenciadores

---

## 18. Checklists

### 18.1 Checklist de segurança (resumido OWASP-adapted)

- [ ] Senhas: Argon2id (V2) ou bcrypt(12) (MVP)
- [ ] Headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [ ] Tokens: vida curta, refresh rotation, detecção de reuso, revogável
- [ ] Cookies: HttpOnly + Secure + SameSite
- [ ] CSRF protection onde houver cookie de sessão
- [ ] CORS allowlist explícita (sem `*` em prod)
- [ ] Rate limit por IP e por endpoint sensível
- [ ] Input validation server-side (sempre)
- [ ] Output encoding contra XSS
- [ ] SQL: ORM com parametrização; zero query string interpolation
- [ ] Upload de arquivos: tipo MIME validado, antivírus, tamanho limitado, storage isolado
- [ ] Dependências: `pip-audit` + Dependabot semanal
- [ ] Segredos: variáveis de ambiente / Vault, **nunca** no repo
- [ ] Logging sem PII
- [ ] WAF em produção
- [ ] Bug bounty (V2)

### 18.2 Checklist LGPD

- [ ] Inventário de dados pessoais tratados (planilha mantida pelo DPO)
- [ ] Base legal documentada por categoria
- [ ] Política de privacidade publicada e versionada
- [ ] Aceite armazenado com versão + IP + UA + timestamp
- [ ] Canal `/privacidade.html` + email DPO
- [ ] Procedimento de exclusão / anonimização
- [ ] RIPD (Relatório de Impacto) para tratamentos de risco — antes de KYC ir live
- [ ] Cláusulas DPA com todos os subprocessadores (gateway, KYC provider, email, SMS)
- [ ] Plano de resposta a incidente + tabletop trimestral
- [ ] Treinamento LGPD anual da equipe
- [ ] Cookies: banner com consentimento granular (cookies não-essenciais)

### 18.3 Checklist meios de pagamento

- [ ] Contratos PSP assinados (MP/Pagar.me + backup)
- [ ] Webhook idempotente + assinatura HMAC
- [ ] Reconciliação diária automática
- [ ] Ledger duplo (débito + crédito) com fechamento mensal
- [ ] Política de chargeback documentada
- [ ] Tratamento PCI-DSS: cartão **nunca toca nosso servidor** (tokenização do PSP)
- [ ] Antifraude do PSP ativado + score próprio em camada extra
- [ ] Limite operacional por tier
- [ ] Análise BACEN documentada (mesmo que conclusão seja "não enquadra ainda")
- [ ] Notas fiscais da taxa de serviço configuradas (NFS-e via Focus/Nfe.io)
- [ ] Conta segregada para escrow do PSP

### 18.4 Checklist antifraude

- [ ] Fingerprint de dispositivo coletado em todo evento sensível
- [ ] Detector de VPN/Tor (MaxMind ou IPQualityScore)
- [ ] Liveness 3D + face match no provedor KYC
- [ ] DICT/titularidade Pix validada
- [ ] Blacklist de CPF/email/Pix sincronizada
- [ ] Regras versionadas + A/B com modo `monitor` antes de `enforce`
- [ ] Backtesting mensal das regras com dados reais
- [ ] Fila de revisão manual com SLA
- [ ] Velocity checks (N transações em X minutos)
- [ ] Análise de grafo (V2) — triangulações
- [ ] Override admin com justificativa obrigatória + log

---

## 19. Wireframes textuais (telas-chave)

### 19.1 Comprar pontos (`comprar-pontos.html`)

```
┌──────────────────────────────────────────────────────────────┐
│ [logo BlaxX]   Início  Comprar  Vender  Trocar  Saldo  Avatar│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Comprar pontos                                              │
│  Compre milhas/pontos de outros usuários com escrow seguro.  │
│                                                              │
│  ┌─────────┬─────────┬─────────┬─────────┐                   │
│  │Programa │Quantia  │Entrega  │Ordenar  │                   │
│  │Smiles ▾ │50.000 ▾ │24h ▾    │Preço ▾  │                   │
│  └─────────┴─────────┴─────────┴─────────┘                   │
│                                                              │
│  ┌─ Oferta de João S. (★ 4.9)  Smiles ────────────────────┐  │
│  │ 50.000 pts                       R$ 24,80 / milheiro   │  │
│  │ Expira em: 180d  |  Entrega: 24h  |  Score: ★★★★☆      │  │
│  │ [Ver detalhes]                    [ Comprar agora → ]  │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌─ Oferta de Maria R. (★ 4.8)  Smiles ───────────────────┐  │
│  │ ...                                                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [Carregar mais]                                             │
└──────────────────────────────────────────────────────────────┘
```

### 19.2 Detalhe da ordem (`ordem.html?id=BLX-A3F2-9X`)

```
┌──────────────────────────────────────────────────────────────┐
│ Ordem BLX-A3F2-9X                       [Estado: em escrow]  │
├──────────────────────────────────────────────────────────────┤
│  ● Criada               12/04 14:23                          │
│  ● Pagamento confirmado 12/04 14:25                          │
│  ● Em escrow            12/04 14:25      ────── ← você está  │
│  ○ Transferência        aguardando vendedor (SLA: 4h)        │
│  ○ Confirmação                                               │
│  ○ Liberação                                                 │
│                                                              │
│  Detalhes                                                    │
│  ─ Programa:    Smiles                                       │
│  ─ Quantia:     50.000 pts                                   │
│  ─ Preço:       R$ 1.250,00 + R$ 25,00 (programa) = 1.275    │
│  ─ Vendedor:    João S. (★ 4.9, 312 ordens)                  │
│                                                              │
│  Ações                                                       │
│  [ Abrir disputa ]   [ Conversar com vendedor ]              │
└──────────────────────────────────────────────────────────────┘
```

### 19.3 Painel admin — fila de disputas (`/admin/disputes`)

```
┌──────────────────────────────────────────────────────────────┐
│ Disputas em aberto (12)         [SLA <24h] [SLA 24-48h] [...]│
├──────────────────────────────────────────────────────────────┤
│ Ordem        Motivo          Valor       SLA      Atribuído  │
│ ──────────   ───────────────  ─────────  ───────  ─────────  │
│ BLX-AA12     not_received     R$ 1.275   18h 🔴   —          │
│ BLX-BB44     wrong_qty        R$   840    8h 🟡   Carla      │
│ BLX-CC09     program_error    R$ 3.200    2h 🟢   eu         │
│ ...                                                          │
│                                                              │
│ [Exportar CSV]                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 20. O que NÃO entra no escopo desta spec (e por quê)

- **Operação para programas que vedem categoricamente cessão onerosa**, exceto na modalidade "transferência permitida" ou "presente familiar". Listar oferta de venda livre de Smiles a desconhecido = decisão de produto consciente do risco; spec recomenda **não**.
- **Custódia recorrente de saldo em carteira interna** no MVP. Postergada para Enterprise sob análise IP.
- **Cartão de crédito do comprador** no MVP. PCI-DSS + chargeback são complexidade extra; PSP do MVP usa Pix (menor risco e custo).
- **App mobile nativo** no MVP. PWA cobre 90% bem.
- **Token / crypto** de qualquer natureza. Fora do escopo, complicaria regulatório.

---

## 21. Decisões abertas (precisam de input)

| # | Pergunta | Quem decide |
|---|---|---|
| 1 | Vamos operar sobre programas que **vedam** cessão onerosa, sob risco contratual? (recomendação técnica: NÃO no MVP) | Diretoria + jurídico |
| 2 | Take rate inicial: 5%, 7% ou 10%? | Diretoria + financeiro |
| 3 | KYC provider (custo R$ 2-8 / verificação): Idwall, Unico ou Caf | Produto + financeiro |
| 4 | Marca: continua "Blaxx Pontos" no marketplace ou subdiv "Blaxx Market"? | Marketing |
| 5 | Atendimento: in-house, terceirizado ou híbrido? | Operações |
| 6 | App mobile no MVP (PWA) ou só web responsivo? | Produto |
| 7 | Localização de hospedagem: BR-only ou pode usar AWS us-east? (LGPD: aceitável com salvaguardas; reputacional: BR-only é melhor) | Eng + jurídico |

---

## 22. Anexo: glossário

- **Escrow**: conta de retenção temporária de fundos até cumprimento da obrigação.
- **KYC**: Know Your Customer — verificação de identidade.
- **PLD/FT**: Prevenção à Lavagem de Dinheiro e Financiamento ao Terrorismo.
- **DICT**: Diretório de Identificadores de Contas Transacionais (Pix BACEN).
- **PSP**: Payment Service Provider (gateway de pagamento).
- **Milheiro**: unidade comercial de mil pontos/milhas.
- **Spread**: diferença entre preço de compra e venda; receita da plataforma.
- **Take rate**: percentual da plataforma sobre o GMV (valor bruto transacionado).
- **Haircut**: desconto aplicado a um ativo por risco/iliquidez.

---

## 23. Próximos passos imediatos

1. **Decisões §21** — bloqueante.
2. **Parecer jurídico** sobre matriz §2 e termos de uso da plataforma — bloqueante para MVP.
3. **POC técnica** do motor de estados de ordem (Sprint 0 de 1 semana) antes de comprometer o roadmap.
4. **Dimensionamento financeiro**: CAC vs LTV vs take rate vs custo de KYC.
5. **Definir KPIs de produto**: GMV mensal, take rate efetivo, taxa de disputa, NPS, % auto-resolução, tempo médio de transferência.

---

**Versão:** 0.1 / 2026-05-26
**Autor:** spec inicial gerada pelo assistente; revisar com PO, jurídico, antifraude, compliance e financeiro.
**Próxima revisão:** após decisões §21 e parecer jurídico.
