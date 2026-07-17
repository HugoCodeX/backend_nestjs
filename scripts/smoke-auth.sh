#!/usr/bin/env bash
# Smoke test del flow de auth contra un gateway corriendo.
# Uso: ./scripts/smoke-auth.sh [gateway-url]
# Default: http://localhost:3000

set -euo pipefail
GATEWAY="${1:-http://localhost:3000}"
EMAIL="smoke-$(date +%s)@test.local"
PASSWORD="smoke-test-password-123"

echo "→ Gateway: $GATEWAY"
echo "→ Email: $EMAIL"
echo ""

echo "1. Sign-up"
SIGNUP=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "Origin: $GATEWAY" \
  -d "{\"name\":\"Smoke Test\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
SIGNUP_CODE=$(echo "$SIGNUP" | tail -n1)
SIGNUP_BODY=$(echo "$SIGNUP" | head -n-1)
echo "   HTTP $SIGNUP_CODE"
echo "   $SIGNUP_BODY" | head -c 200
echo "..."

if [ "$SIGNUP_CODE" != "200" ]; then
  echo ""
  echo "✗ Sign-up failed. ¿Está el gateway corriendo en $GATEWAY?"
  exit 1
fi

echo ""
echo "2. Get session (sin cookie)"
curl -s -w "   HTTP %{http_code}\n" "$GATEWAY/api/auth/get-session" -o /dev/null

echo ""
echo "3. Sign-in"
SIGNIN=$(curl -s -w "\n%{http_code}" -c /tmp/smoke-cookies.txt -X POST "$GATEWAY/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -H "Origin: $GATEWAY" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
SIGNIN_CODE=$(echo "$SIGNIN" | tail -n1)
echo "   HTTP $SIGNIN_CODE"

if [ "$SIGNIN_CODE" != "200" ]; then
  echo "✗ Sign-in failed"
  exit 1
fi

echo ""
echo "4. Get session (con cookie)"
curl -s -w "   HTTP %{http_code}\n" -b /tmp/smoke-cookies.txt "$GATEWAY/api/auth/get-session" | head -c 300
echo "..."

echo ""
echo "5. Profile (con cookie, via gateway → profile-service)"
curl -s -w "   HTTP %{http_code}\n" -b /tmp/smoke-cookies.txt "$GATEWAY/api/profile" | head -c 300
echo "..."

echo ""
echo "6. Sign-out"
curl -s -w "   HTTP %{http_code}\n" -X POST -b /tmp/smoke-cookies.txt "$GATEWAY/api/auth/sign-out" -o /dev/null

rm -f /tmp/smoke-cookies.txt

echo ""
echo "✓ Smoke test completado"
