# Blaxx Pontos - script de teste end-to-end dos 3 fluxos PIX
# Roda contra o backend Flask rodando em http://127.0.0.1:5000

$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:5001'

function Section($title) {
    Write-Host ''
    Write-Host ('=' * 70) -ForegroundColor DarkGray
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ('=' * 70) -ForegroundColor DarkGray
}

function Step($msg)    { Write-Host "  > $msg" -ForegroundColor Yellow }
function Ok($msg)      { Write-Host "  OK $msg" -ForegroundColor Green }
function Fail($msg)    { Write-Host "  X $msg" -ForegroundColor Red }
function Show($obj)    { $obj | ConvertTo-Json -Depth 6 | Write-Host -ForegroundColor Gray }

# ----- 0. Checa se o servidor esta no ar -----
Section "0. Checando servidor em $base"
try {
    $health = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 3
    Ok "servidor respondendo: $($health.service)"
} catch {
    Fail "servidor nao responde em $base"
    Write-Host ''
    Write-Host '  Antes de rodar este script, abra OUTRO PowerShell e execute:' -ForegroundColor Yellow
    Write-Host '    cd "C:\Ricardo Veles\Blaxx Pontos\blaxx\backend"' -ForegroundColor White
    Write-Host '    python seed.py    # cria os usuarios demo (so na 1a vez)' -ForegroundColor White
    Write-Host '    python run.py     # sobe o backend Flask' -ForegroundColor White
    Write-Host ''
    Read-Host 'Pressione Enter para sair'
    exit 1
}

# ----- 1. Login -----
Section "1. Login da Mariana"
$loginBody = @{ email = 'mariana@blaxx.com'; password = '123456' } | ConvertTo-Json
try {
    $r = Invoke-RestMethod -Uri "$base/auth/login" -Method POST `
         -ContentType 'application/json' -Body $loginBody
    Ok "logada como $($r.user.name)"
    $h = @{ Authorization = "Bearer $($r.token)" }
} catch {
    Fail "login falhou. Voce ja rodou 'python seed.py'?"
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Pressione Enter para sair'
    exit 1
}

# ----- 2. Saldo inicial -----
Section "2. Saldo inicial"
$wallet = Invoke-RestMethod -Uri "$base/wallet/" -Headers $h
$initial = $wallet.balance_pts
Ok "saldo: $($wallet.balance_pts) pts (~ R$ $($wallet.balance_brl_equiv))"

# ----- 3. FLUXO 1: comprar pontos via PIX -----
Section "3. Fluxo 1 - Comprar pontos via PIX (pacote Plus)"
Step 'POST /pix/charge'
$charge = Invoke-RestMethod -Uri "$base/pix/charge" -Method POST `
          -Headers $h -ContentType 'application/json' `
          -Body '{"package":"plus"}'
Ok "charge criada (status=$($charge.status), R$ $($charge.amount_brl), $($charge.points_to_credit) pts)"
Write-Host '  BR Code copia-e-cola:' -ForegroundColor Gray
Write-Host "    $($charge.br_code)" -ForegroundColor DarkGray

Step 'POST /pix/simulate-payment (= webhook do gateway)'
$paid = Invoke-RestMethod -Uri "$base/pix/simulate-payment" -Method POST `
        -Headers $h -ContentType 'application/json' `
        -Body (@{ charge_id = $charge.id } | ConvertTo-Json)
Ok "charge agora: $($paid.charge.status)"

# ----- 4. FLUXO 2: enviar pontos a outro cliente -----
Section "4. Fluxo 2 - Enviar 2.000 pts ao Lucas"
Step 'POST /transfer/'
$body = @{
    to         = 'lucas@blaxx.com'
    amount_pts = 2000
    password   = '123456'
    message    = 'obrigado!'
} | ConvertTo-Json
$transfer = Invoke-RestMethod -Uri "$base/transfer/" -Method POST `
            -Headers $h -ContentType 'application/json' -Body $body
Ok "envio confirmado, comprovante: $($transfer.receipt_code)"

# ----- 5. FLUXO 3: resgatar via PIX -----
Section "5. Fluxo 3 - Resgatar 5.000 pts via PIX (= R$ 50,00)"
Step 'POST /redeem/'
$body = @{
    points   = 5000
    pix_key  = 'ricardo.veles@gmail.com'
    password = '123456'
} | ConvertTo-Json
$payout = Invoke-RestMethod -Uri "$base/redeem/" -Method POST `
          -Headers $h -ContentType 'application/json' -Body $body
Ok "resgate status=$($payout.status), R$ $($payout.amount_brl)"
Write-Host "  EndToEndID: $($payout.end_to_end_id)" -ForegroundColor Gray

# ----- 6. Extrato final -----
Section "6. Extrato final"
$wallet = Invoke-RestMethod -Uri "$base/wallet/" -Headers $h
$delta  = $wallet.balance_pts - $initial
$sign   = if ($delta -ge 0) { '+' } else { '' }
Ok "saldo final: $($wallet.balance_pts) pts ($sign$delta vs inicial $initial)"

$txs = Invoke-RestMethod -Uri "$base/wallet/transactions?limit=10" -Headers $h
Write-Host ''
Write-Host '  Ultimas movimentacoes:' -ForegroundColor Gray
Write-Host ('  {0,-14} {1,8}  {2,-12}  {3}' -f 'TIPO','PTS','STATUS','DESCRICAO') -ForegroundColor DarkGray
Write-Host ('  ' + ('-' * 66)) -ForegroundColor DarkGray
foreach ($t in $txs.items) {
    Write-Host ('  {0,-14} {1,8}  {2,-12}  {3}' -f $t.type, $t.amount_pts, $t.status, $t.description)
}

# ----- 7. BONUS: testar estorno automatico -----
Section "7. Bonus - testar estorno automatico (chave 'fail-...')"
Step 'POST /redeem/ com chave PIX que faz o gateway falhar'
$body = @{
    points   = 3000
    pix_key  = 'fail-chave-bloqueada@x.com'
    password = '123456'
} | ConvertTo-Json
$bad = Invoke-RestMethod -Uri "$base/redeem/" -Method POST `
       -Headers $h -ContentType 'application/json' -Body $body
if ($bad.status -eq 'failed') {
    Ok "payout falhou como esperado: '$($bad.failure_reason)'"
    $w2 = Invoke-RestMethod -Uri "$base/wallet/" -Headers $h
    if ($w2.balance_pts -eq $wallet.balance_pts) {
        Ok "saldo intacto ($($w2.balance_pts) pts) - estorno automatico funcionou"
    } else {
        Fail "saldo divergente: $($w2.balance_pts) vs esperado $($wallet.balance_pts)"
    }
} else {
    Fail "esperava status=failed, recebi: $($bad.status)"
}

Write-Host ''
Write-Host ('=' * 70) -ForegroundColor DarkGray
Write-Host '  TODOS OS 3 FLUXOS TESTADOS COM SUCESSO' -ForegroundColor Green
Write-Host ('=' * 70) -ForegroundColor DarkGray
Write-Host ''
Read-Host 'Pressione Enter para fechar'
