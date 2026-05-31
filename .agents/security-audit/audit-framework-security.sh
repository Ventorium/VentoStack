#!/usr/bin/env bash
set -euo pipefail
OUT="/code/VentoStack/.agents/security-audit/framework-security-audit.md"
echo "# Framework Security Middleware Audit" > "$OUT"

for f in packages/framework/core/src/middlewares/*.ts; do
  name=$(basename "$f")
  echo "## $name" >> "$OUT"
  echo "\`\`\`typescript" >> "$OUT"
  cat "$f" >> "$OUT"
  echo "\`\`\`" >> "$OUT"
  echo "" >> "$OUT"
done

echo "Framework security audit complete: $OUT"
