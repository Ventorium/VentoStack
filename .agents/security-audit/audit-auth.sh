#!/usr/bin/env bash
set -euo pipefail
OUT="/code/VentoStack/.agents/security-audit/auth-audit.md"
echo "# Auth Layer Security Audit" > "$OUT"

# JWT
echo "## 1. JWT Implementation" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/auth/src/jwt.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

# RBAC
echo "## 2. RBAC Implementation" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/auth/src/rbac.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

# Session
echo "## 3. Session Management" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/auth/src/session.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

# TOTP
echo "## 4. TOTP / MFA" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/auth/src/totp.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

# Token Refresh
echo "## 5. Token Refresh" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/auth/src/token-refresh.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

# Row Filter
echo "## 6. Row Filter" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/auth/src/row-filter.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

# Policy Engine
echo "## 7. Policy Engine (ABAC)" >> "$OUT"
echo "\`\`\`typescript" >> "$OUT"
cat packages/platform/auth/src/policy-engine.ts >> "$OUT"
echo "\`\`\`" >> "$OUT"

echo "Auth audit complete: $OUT"
