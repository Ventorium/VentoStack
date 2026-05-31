#!/usr/bin/env bash
set -euo pipefail
OUT="/code/VentoStack/.agents/security-audit/platform-system-audit.md"
echo "# Platform System Module Security Audit" > "$OUT"

echo "## 1. Auth Guard Middleware" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/system/src/middlewares/auth-guard.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 2. Operation Log Middleware" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/system/src/middlewares/operation-log.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 3. Auth Service" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/system/src/services/auth.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 4. User Service" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/system/src/services/user.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 5. Permission Loader" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/system/src/services/permission-loader.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 6. Common Routes (Response Wrapper)" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/system/src/routes/common.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "Platform system audit complete: $OUT"
