#!/usr/bin/env bash
#
# Smoke test de los endpoints de fan-engagement-api. Golpea el servidor con
# curl y guarda cada respuesta como JSON en OUT_DIR (default ./out), para
# poder diffear entre "antes" y "después" durante la migración del spec 08.
#
# Variables de entorno:
#   BASE_URL      default http://localhost:3000
#   OUT_DIR       default ./out
#   TOKEN_ADMIN   si no viene seteado, se genera haciendo login real
#   TOKEN_FAN     si no viene seteado, se genera haciendo login real
#   ADMIN_IDENTIFIER / ADMIN_PASSWORD  identidad admin para el login (si hace falta generar TOKEN_ADMIN)
#   FAN_IDENTIFIER   / FAN_PASSWORD    identidad fan para el login (si hace falta generar TOKEN_FAN)
#
# No se fabrican usuarios "de negocio": el único registro que crea este
# script es una cuenta de prueba desechable para ejercitar POST auth/register,
# con un sufijo aleatorio en cada corrida.

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
OUT_DIR="${OUT_DIR:-./out}"

mkdir -p "$OUT_DIR"

request() {
    local name="$1"
    local method="$2"
    local path="$3"
    local auth_header="$4"
    local body="${5:-}"

    local args=(-sS -o "$OUT_DIR/$name.json" -w "%{http_code}" -X "$method" "$BASE_URL$path")

    if [ -n "$auth_header" ]; then
        args+=(-H "Authorization: Bearer $auth_header")
    fi
    if [ -n "$body" ]; then
        args+=(-H "Content-Type: application/json" -d "$body")
    fi

    local status
    status=$(curl "${args[@]}")
    echo "[$status] $method $path -> $OUT_DIR/$name.json"
}

login() {
    local identifier="$1"
    local password="$2"
    local client="${3:-}"
    local body
    if [ -n "$client" ]; then
        body=$(printf '{"identifier":"%s","password":"%s","client":"%s"}' "$identifier" "$password" "$client")
    else
        body=$(printf '{"identifier":"%s","password":"%s"}' "$identifier" "$password")
    fi
    curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.accessToken||'')}catch(e){console.log('')}})"
}

if [ -z "${TOKEN_ADMIN:-}" ]; then
    echo "Generando TOKEN_ADMIN vía login real..."
    TOKEN_ADMIN=$(login "${ADMIN_IDENTIFIER:-kariquekeiter@gmail.com}" "${ADMIN_PASSWORD:-123456}" "web")
fi
if [ -z "${TOKEN_FAN:-}" ]; then
    echo "Generando TOKEN_FAN vía login real..."
    TOKEN_FAN=$(login "${FAN_IDENTIFIER:-andrea.salazar@example.com}" "${FAN_PASSWORD:-123456}")
fi

if [ -z "$TOKEN_ADMIN" ] || [ -z "$TOKEN_FAN" ]; then
    echo "No se pudo obtener TOKEN_ADMIN/TOKEN_FAN. Aborta." >&2
    exit 1
fi

echo "== health =="
request "root" GET "/" ""
request "health" GET "/api/v1/health" ""

echo "== auth =="
SUFFIX=$(date +%s)
request "auth_register" POST "/api/v1/auth/register" "" \
    "{\"username\":\"smoke_$SUFFIX\",\"email\":\"smoke_$SUFFIX@example.com\",\"password\":\"Password123\",\"fullName\":\"Smoke Test\",\"cellphone\":\"+519$SUFFIX\"}"
request "auth_login_admin" POST "/api/v1/auth/login" "" \
    "{\"identifier\":\"${ADMIN_IDENTIFIER:-kariquekeiter@gmail.com}\",\"password\":\"${ADMIN_PASSWORD:-123456}\",\"client\":\"web\"}"
request "auth_login_fan" POST "/api/v1/auth/login" "" \
    "{\"identifier\":\"${FAN_IDENTIFIER:-andrea.salazar@example.com}\",\"password\":\"${FAN_PASSWORD:-123456}\"}"
request "auth_verify_email" GET "/api/v1/auth/verify-email?token=invalid-token" ""
request "auth_resend_verification" POST "/api/v1/auth/resend-email-verification" "" \
    "{\"email\":\"smoke_$SUFFIX@example.com\"}"

echo "== users =="
request "users_fcm_token_put" PUT "/api/v1/users/me/fcm-token" "$TOKEN_FAN" '{"fcmToken":"smoke-fcm-token"}'
request "users_fcm_token_delete" DELETE "/api/v1/users/me/fcm-token" "$TOKEN_FAN" ""
request "users_list" GET "/api/v1/users" "$TOKEN_ADMIN" ""

echo "== images =="
request "images_list" GET "/api/v1/images" "$TOKEN_ADMIN" ""

echo "== catalog =="
request "products_list" GET "/api/v1/products" "$TOKEN_FAN" ""
request "promotions_list" GET "/api/v1/promotions" "$TOKEN_FAN" ""

echo "== interactions =="
request "products_interaction_post" POST "/api/v1/products/interaction" "$TOKEN_FAN" '{"productId":1,"rating":5}'
request "promotions_interaction_post" POST "/api/v1/promotions/interaction" "$TOKEN_FAN" '{"promotionId":1,"rating":4}'
request "products_interaction_all" GET "/api/v1/products/interaction/all" ""
request "promotions_interaction_all" GET "/api/v1/promotions/interaction/all" ""

echo "== cart =="
request "cart_get_empty" GET "/api/v1/cart" "$TOKEN_FAN" ""
request "cart_add_product" POST "/api/v1/cart/products" "$TOKEN_FAN" '{"productId":1,"quantity":1}'
CART_ITEM_ID=$(node -e "try{console.log(require('$OUT_DIR/cart_add_product.json').data.cartItem.id)}catch(e){console.log('')}")
request "cart_get_with_item" GET "/api/v1/cart" "$TOKEN_FAN" ""
if [ -n "$CART_ITEM_ID" ]; then
    request "cart_patch_item" PATCH "/api/v1/cart/items/$CART_ITEM_ID" "$TOKEN_FAN" '{"quantity":2}'
    request "cart_delete_item" DELETE "/api/v1/cart/items/$CART_ITEM_ID" "$TOKEN_FAN" ""
fi
request "cart_add_product_for_checkout" POST "/api/v1/cart/products" "$TOKEN_FAN" '{"productId":1,"quantity":1}'
request "cart_delete_all" DELETE "/api/v1/cart" "$TOKEN_FAN" ""

echo "== purchases =="
request "cart_add_for_purchase" POST "/api/v1/cart/products" "$TOKEN_FAN" '{"productId":1,"quantity":1}'
request "purchases_post" POST "/api/v1/purchases" "$TOKEN_FAN" ""
PURCHASE_ID=$(node -e "try{console.log(require('$OUT_DIR/purchases_post.json').data.purchase.id)}catch(e){console.log('')}")
request "purchases_list" GET "/api/v1/purchases" "$TOKEN_ADMIN" ""
request "purchases_me" GET "/api/v1/purchases/me" "$TOKEN_FAN" ""
if [ -n "$PURCHASE_ID" ]; then
    request "purchases_detail" GET "/api/v1/purchases/$PURCHASE_ID" "$TOKEN_FAN" ""
    request "purchases_patch_status" PATCH "/api/v1/purchases/$PURCHASE_ID/status" "$TOKEN_ADMIN" '{"status":"completed"}'
fi

echo "== notifications =="
request "notifications_send" POST "/api/v1/notifications/send" "$TOKEN_ADMIN" \
    "{\"title\":\"Smoke test\",\"body\":\"Prueba de humo\",\"target\":\"users\",\"userIds\":[1]}"
NOTIFICATION_LOG_ID=$(node -e "try{console.log(require('$OUT_DIR/notifications_send.json').data.notificationLogId)}catch(e){console.log('')}")
request "notifications_log" GET "/api/v1/notifications/log" "$TOKEN_ADMIN" ""
request "notifications_personalized_run" POST "/api/v1/notifications/personalized/run" "$TOKEN_ADMIN" ""
if [ -n "$NOTIFICATION_LOG_ID" ]; then
    request "notifications_log_delete" DELETE "/api/v1/notifications/log/$NOTIFICATION_LOG_ID" "$TOKEN_ADMIN" ""
fi

echo "== parameters =="
request "parameters_get" GET "/api/v1/parameters/personalized-notifications" "$TOKEN_ADMIN" ""
request "parameters_put" PUT "/api/v1/parameters/personalized-notifications" "$TOKEN_ADMIN" \
    '{"enabled":true,"intervalMinutes":60,"repeatDays":7,"startHour":9,"endHour":21,"purchaseSignalWeight":2}'

echo "== recommendations =="
request "recommendations_train" POST "/api/v1/recommendations/train" "" ""
request "products_recommendations" GET "/api/v1/products/recommendations" "$TOKEN_FAN" ""
request "promotions_recommendations" GET "/api/v1/promotions/recommendations" "$TOKEN_FAN" ""

echo "== dashboard =="
request "dashboard_engagement" GET "/api/v1/dashboard/engagement" "$TOKEN_ADMIN" ""

echo "== not found =="
request "not_found" GET "/api/v1/ruta-inexistente" ""

echo "Listo. Respuestas guardadas en $OUT_DIR"
