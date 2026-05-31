#!/usr/bin/env bash
set -euo pipefail
OUT="/code/VentoStack/.agents/security-audit/database-security-audit.md"
echo "# Database Security Audit" > "$OUT"

echo "## 1. Query Builder" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/framework/database/src/query-builder.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 2. Schema Reader" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/framework/database/src/schema-reader.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 3. Model Definition" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/framework/database/src/model.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "## 4. Database Executor" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/framework/database/src/database.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "Database security audit complete: $OUT"
