#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  FaceID SaaS — Backup de PostgreSQL
#  Ejecutado por cron diariamente a las 03:00
#  Retención: 7 backups diarios + 4 semanales (domingos)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="/var/backups/faceid"
DATE=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 7 = domingo
FILENAME="faceid_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

# ── Obtener contraseña de DB desde .env ───────────────────────────────────────
source <(grep -E '^POSTGRES_PASSWORD=' "$APP_DIR/.env")

# ── Dump comprimido ───────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup → $BACKUP_DIR/$FILENAME"

docker compose -f "$APP_DIR/docker-compose.prod.yml" exec -T db \
  pg_dump -U postgres faceid_saas \
  | gzip > "$BACKUP_DIR/$FILENAME"

SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completado: $FILENAME ($SIZE)"

# ── Retención: conservar últimos 7 backups diarios ────────────────────────────
ls -t "$BACKUP_DIR"/faceid_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Limpieza de backups antiguos completada"

# ── Backup semanal (domingos) → subcarpeta weekly ─────────────────────────────
if [[ "$DAY_OF_WEEK" -eq 7 ]]; then
  mkdir -p "$BACKUP_DIR/weekly"
  cp "$BACKUP_DIR/$FILENAME" "$BACKUP_DIR/weekly/$FILENAME"
  # Retener últimas 4 semanas
  ls -t "$BACKUP_DIR/weekly"/faceid_*.sql.gz 2>/dev/null | tail -n +5 | xargs -r rm -f
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup semanal guardado"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backups disponibles:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "  (ninguno)"
