#!/usr/bin/env bash
set -euo pipefail
OUT="/code/VentoStack/.agents/security-audit/admin-api-audit.md"
echo "# Admin API Security Audit" > "$OUT"

echo "## 1. App Assembly (Composition Root)" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat apps/admin/api/src/app.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 2. Auth Engine Assembly" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat apps/admin/api/src/auth/index.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 3. Environment Config" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat apps/admin/api/src/config/index.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 4. Entry Point" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat apps/admin/api/src/index.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "Admin API audit complete: $OUT"
