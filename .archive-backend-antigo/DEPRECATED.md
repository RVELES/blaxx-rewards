# ⚠️ Backend ARQUIVADO — não usar

> **Data de arquivo:** 2026-05-26
> **Status:** Histórico — backend Onda 0 (pré-Onda 1 auth refactor)

## Por que está aqui

Era o backend original do site Netlify antes do refactor de auth/MFA
(Ondas 1-3). Mantido como histórico em caso de necessidade de consultar
o schema antigo.

## Diferenças críticas do canônico

- Sem campos `phone_verified`, `mfa_method`, `is_deleted`, `deleted_at`
- Sem `RevokedToken`, `MfaSecret`, `PhoneOtp`, `MfaChallenge`, `TrustedDevice`
- Sem `LoginAttempt`, `AuditLog`, `UserConsent`, `SocialAccount`
- Sem `Voucher`, `Benefit`, `Campaign`, `UserCampaign`
- Sem helpers Sprint 2 (`encrypt_secret`, `decrypt_secret`, `expiration`)

## Quando apagar

Pode ser apagado a qualquer momento. Não é referenciado por nenhum
deploy ativo.

```powershell
Remove-Item -Recurse -Force "blaxx\.archive-backend-antigo"
```

---

**Backend ativo:** `../../blaxx_exe/backend/`
