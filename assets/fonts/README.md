# Inter Self-Hosted · Sprint 4 (S4-9)

## Como baixar os WOFF2

```powershell
# Powershell
$ver = "4.0"
$base = "https://github.com/rsms/inter/raw/v$ver/docs/font-files"
Invoke-WebRequest "$base/Inter-Regular.woff2"  -OutFile Inter-Regular.woff2
Invoke-WebRequest "$base/Inter-Medium.woff2"   -OutFile Inter-Medium.woff2
Invoke-WebRequest "$base/Inter-SemiBold.woff2" -OutFile Inter-SemiBold.woff2
Invoke-WebRequest "$base/Inter-Bold.woff2"     -OutFile Inter-Bold.woff2
```

## Como substituir o Google Fonts nas paginas HTML

Em vez de:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
```

Use:
```html
<link rel="preload" as="font" href="assets/fonts/Inter-Regular.woff2"  type="font/woff2" crossorigin>
<link rel="preload" as="font" href="assets/fonts/Inter-SemiBold.woff2" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/fonts/inter.css">
```

Os outros pesos (Medium, Bold) carregam sob demanda quando usados.

## Impacto

| Metrica | Antes (Google Fonts) | Depois (self-hosted) |
|---|---|---|
| Requests pra terceiros | 2-3 (fonts.googleapis + fonts.gstatic) | 0 |
| LCP em 4G  | ~250-400ms                              | ~80-150ms          |
| Privacy: tracking Google | Sim (IP + UA)                  | Nenhum              |
| Cache: max-age                  | 1 ano (mas com revalidacao) | Configuravel via _headers (ja 30 dias) |

## Licenca

Inter por Rasmus Andersson — SIL Open Font License 1.1 (uso comercial OK).
Manter os arquivos `.woff2` no repo OU usar o submodulo Git.
