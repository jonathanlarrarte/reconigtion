#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  FaceID SaaS — Script de despliegue inicial
#  SO objetivo: Ubuntu 22.04 LTS (también funciona en 24.04)
#
#  Uso:
#    1. Sube el código al VPS (git clone o scp)
#    2. Copia .env.production.example → .env y edita los valores
#    3. chmod +x deploy.sh && sudo ./deploy.sh tudominio.com admin@tudominio.com
#
#  Argumentos:
#    $1 — dominio (ej: faceid.miempresa.com)
#    $2 — email para Let's Encrypt
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Parámetros ────────────────────────────────────────────────────────────────
DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Uso: sudo ./deploy.sh <dominio> <email>"
  echo "Ej:  sudo ./deploy.sh faceid.miempresa.com admin@miempresa.com"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta con sudo: sudo ./deploy.sh $DOMAIN $EMAIL"
  exit 1
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "  FaceID SaaS — Setup producción"
echo "  Dominio : $DOMAIN"
echo "  Email   : $EMAIL"
echo "  Directorio: $APP_DIR"
echo "══════════════════════════════════════════════════════"
echo ""

# ── 1. Sistema operativo ──────────────────────────────────────────────────────
echo "▸ [1/9] Actualizando sistema..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git htop unzip \
  apache2-utils \
  fail2ban \
  ufw

# ── 2. Docker ─────────────────────────────────────────────────────────────────
echo "▸ [2/9] Instalando Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "  Docker ya instalado: $(docker --version)"
fi

# Asegurarse de que el usuario actual puede usar docker sin sudo
if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "$SUDO_USER"
  echo "  Usuario $SUDO_USER añadido al grupo docker"
fi

# ── 3. Firewall UFW ───────────────────────────────────────────────────────────
echo "▸ [3/9] Configurando firewall UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP (redirect → HTTPS)"
ufw allow 443/tcp  comment "HTTPS"
# Rate limit en SSH para evitar brute-force
ufw limit 22/tcp
ufw --force enable
ufw status verbose

# ── 4. Fail2ban ───────────────────────────────────────────────────────────────
echo "▸ [4/9] Configurando Fail2ban..."
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
maxretry = 3
bantime  = 24h

[nginx-http-auth]
enabled  = true
port     = http,https
logpath  = %(nginx_access_log)s

[nginx-limit-req]
enabled  = true
port     = http,https
filter   = nginx-limit-req
logpath  = /var/log/nginx/error.log
maxretry = 10
EOF

# Regla de Fail2ban para los 429 de Nginx (rate limit excedido)
cat > /etc/fail2ban/filter.d/nginx-limit-req.conf <<EOF
[Definition]
failregex = limiting requests, excess:.* by zone .*, client: <HOST>
ignoreregex =
EOF

systemctl enable fail2ban
systemctl restart fail2ban
echo "  Fail2ban activo"

# ── 5. Validar que .env existe ────────────────────────────────────────────────
echo "▸ [5/9] Verificando .env..."
if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "ERROR: No existe .env en $APP_DIR"
  echo "Copia .env.production.example → .env y completa los valores"
  exit 1
fi

# Verificar que no quedaron placeholders sin cambiar
if grep -q "CAMBIA_ESTO" "$APP_DIR/.env"; then
  echo "ERROR: .env contiene valores 'CAMBIA_ESTO' sin reemplazar"
  grep "CAMBIA_ESTO" "$APP_DIR/.env"
  exit 1
fi

# Guardar DOMAIN en .env si no está
if ! grep -q "^DOMAIN=" "$APP_DIR/.env"; then
  echo "DOMAIN=$DOMAIN" >> "$APP_DIR/.env"
fi

# ── 6. nginx.conf — reemplazar TU_DOMINIO ─────────────────────────────────────
echo "▸ [6/9] Configurando Nginx para $DOMAIN..."
sed -i "s/TU_DOMINIO/$DOMAIN/g" "$APP_DIR/nginx/nginx.conf"
echo "  nginx.conf actualizado con $DOMAIN"

# ── 7. htpasswd para admin panel ──────────────────────────────────────────────
echo "▸ [7/9] Creando credenciales del panel admin..."
HTPASSWD_FILE="$APP_DIR/nginx/htpasswd"

if [[ -f "$HTPASSWD_FILE" ]]; then
  echo "  htpasswd ya existe — no se sobreescribe"
else
  # Generar contraseña aleatoria si no la especifica el usuario
  ADMIN_PASS=$(openssl rand -base64 18 | tr -d '/+=')
  htpasswd -cb "$HTPASSWD_FILE" admin "$ADMIN_PASS"
  echo ""
  echo "  ┌─────────────────────────────────────────────────┐"
  echo "  │  CREDENCIALES DEL PANEL ADMIN (GUARDA ESTO)     │"
  echo "  │  Usuario  : admin                               │"
  echo "  │  Contraseña: $ADMIN_PASS                        │"
  echo "  └─────────────────────────────────────────────────┘"
  echo ""
  # Guardar en archivo local (permisos restrictivos)
  echo "admin:$ADMIN_PASS" > "$APP_DIR/.admin-credentials"
  chmod 600 "$APP_DIR/.admin-credentials"
fi

# ── 8. SSL con Let's Encrypt ──────────────────────────────────────────────────
echo "▸ [8/9] Obteniendo certificado SSL (Let's Encrypt)..."

# Arrancar solo Nginx en modo HTTP (sin bloque SSL) para pasar el challenge ACME
# Para eso, creamos una config temporal que solo sirve HTTP
mkdir -p /tmp/faceid-nginx
cat > /tmp/faceid-nginx/nginx-http-only.conf <<NGINXEOF
server_tokens off;
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
NGINXEOF

# Levantar nginx temporal para ACME
docker run -d --name faceid-nginx-tmp \
  -p 80:80 \
  -v /tmp/faceid-nginx/nginx-http-only.conf:/etc/nginx/conf.d/default.conf:ro \
  -v faceid_certbot_webroot:/var/www/certbot \
  nginx:1.27-alpine 2>/dev/null || true

sleep 2

# Obtener certificado
docker run --rm \
  -v faceid_letsencrypt:/etc/letsencrypt \
  -v faceid_certbot_webroot:/var/www/certbot \
  certbot/certbot certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" || {
  echo "ADVERTENCIA: www.$DOMAIN puede no resolverse — intentando solo $DOMAIN"
  docker run --rm \
    -v faceid_letsencrypt:/etc/letsencrypt \
    -v faceid_certbot_webroot:/var/www/certbot \
    certbot/certbot certonly \
      --webroot \
      --webroot-path /var/www/certbot \
      --email "$EMAIL" \
      --agree-tos \
      --no-eff-email \
      --force-renewal \
      -d "$DOMAIN"
}

# Detener y eliminar nginx temporal
docker stop faceid-nginx-tmp 2>/dev/null || true
docker rm   faceid-nginx-tmp 2>/dev/null || true

echo "  Certificado SSL obtenido para $DOMAIN"

# ── 9. Levantar todos los servicios ──────────────────────────────────────────
echo "▸ [9/9] Construyendo imágenes y levantando servicios..."
cd "$APP_DIR"
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Esperar a que la API esté lista
echo "  Esperando que la API arranque (carga ArcFace ~60s)..."
for i in $(seq 1 24); do
  if curl -sf "http://localhost/health" &>/dev/null; then
    echo "  API lista"
    break
  fi
  sleep 5
  echo -n "."
done
echo ""

# ── Cron: backup diario a las 3am ─────────────────────────────────────────────
echo "▸ Configurando cron de backup..."
BACKUP_SCRIPT="$APP_DIR/scripts/backup-db.sh"
chmod +x "$BACKUP_SCRIPT"
# Agregar al crontab del root (sin duplicar)
CRON_LINE="0 3 * * * $BACKUP_SCRIPT >> /var/log/faceid-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v "backup-db.sh"; echo "$CRON_LINE" ) | crontab -
echo "  Backup diario configurado a las 03:00"

# ── Cron: renovar SSL cada 12h (también lo hace el contenedor certbot) ────────
RENEW_LINE="0 */12 * * * docker compose -f $APP_DIR/docker-compose.prod.yml exec -T certbot certbot renew --quiet && docker compose -f $APP_DIR/docker-compose.prod.yml exec -T nginx nginx -s reload"
( crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$RENEW_LINE" ) | crontab -

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  DESPLIEGUE COMPLETADO"
echo "══════════════════════════════════════════════════════"
echo "  Panel admin    : https://$DOMAIN"
echo "  API            : https://$DOMAIN/v1"
echo "  API Docs       : https://$DOMAIN/docs  (protegido con basic auth)"
echo "  Widget         : https://$DOMAIN/widget"
echo "  Health check   : https://$DOMAIN/health"
echo ""
echo "  Credenciales admin: cat $APP_DIR/.admin-credentials"
echo ""
echo "  Comandos útiles:"
echo "  docker compose -f docker-compose.prod.yml logs -f api"
echo "  docker compose -f docker-compose.prod.yml ps"
echo "  $APP_DIR/scripts/backup-db.sh"
echo "══════════════════════════════════════════════════════"
