#!/usr/bin/env bash
# Deploy do /blaxx/ no Netlify via git push para main.
# Uso:   cd /Users/ricardoveles/Library/CloudStorage/Dropbox/Blaxx\ Pontos/blaxx
#        ./deploy.sh
#
# O Netlify rebuilda automaticamente em ~60-90s após o push.

set -euo pipefail

cd "$(dirname "$0")"
echo "🔧 Deploy /blaxx/ (Netlify) — pasta: $(pwd)"
echo ""

# 1) Remove qualquer lock pendente do Dropbox / outras sessões Git
if [ -f ".git/index.lock" ]; then
  echo "⚠️  Removendo .git/index.lock pendente..."
  rm -f .git/index.lock
fi

# 2) Confirma branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "❌ Você está em '$BRANCH'. Faça checkout em main primeiro."
  exit 1
fi
echo "✓ Branch: $BRANCH"

# 3) Mostra resumo do que vai entrar no commit
echo ""
echo "📦 Arquivos modificados ($(git status --short | wc -l | tr -d ' ') itens):"
git status --short | head -10
[ "$(git status --short | wc -l)" -gt 10 ] && echo "  ...(e mais)"

# 4) Stage tudo (HTMLs do brand novo + styles + _headers novo)
# Ignora os PDFs/DOCX manuais que não devem ir ao deploy
git add \
  '*.html' \
  'assets/*.css' \
  'assets/*.js' \
  service-worker.js \
  _headers 2>/dev/null || true

# 5) Confirma o que de fato vai entrar
STAGED=$(git diff --cached --numstat | wc -l | tr -d ' ')
if [ "$STAGED" -eq 0 ]; then
  echo "⚠️  Nada novo pra commitar."
  exit 0
fi
echo ""
echo "✓ $STAGED arquivos staged para commit"

# 6) Commit — usa primeira linha do CHANGELOG abaixo se houver, senão padrão
if [ -n "${COMMIT_MSG:-}" ]; then
  : # respeita override via env
else
  COMMIT_MSG="chore: deploy automático (brand + Google Login + outros)

Inclui qualquer mudança pendente em HTML, CSS, JS e config.
Para mensagem customizada, use: COMMIT_MSG='...' ./deploy.sh"
fi

git commit -m "$COMMIT_MSG"
echo ""
echo "✓ Commit criado"
git log --oneline -1

# 7) Push para Netlify rebuildar
echo ""
echo "🚀 Push para origin/main..."
git push origin main
echo ""
echo "✅ Deploy disparado!"
echo ""
echo "📡 Acompanhe o build em:"
echo "   https://app.netlify.com/sites/blaxxpontos/deploys"
echo ""
echo "🌐 Site (em ~60-90s estará atualizado):"
echo "   https://blaxxpontos.netlify.app"
