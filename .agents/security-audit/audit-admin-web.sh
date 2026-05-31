#!/usr/bin/env bash
set -euo pipefail
OUT="/code/VentoStack/.agents/security-audit/admin-web-audit.md"
echo "# Admin Web Frontend Security Audit" > "$OUT"

echo "## 1. API Client" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat apps/admin/web/src/api/index.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 2. Auth Store" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat apps/admin/web/src/store/useAuth.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 3. Token Store" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat apps/admin/web/src/store/token.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 4. Schema (Type Safety)" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
head -80 apps/admin/web/src/api/schema.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "Admin web audit complete: $OUT"
