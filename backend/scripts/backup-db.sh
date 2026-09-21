#!/usr/bin/env sh
# Fase 10, Camada 2 (CONTEXTO.md secao 2.5) -- copia independente do backup
# nativo do Railway, num object storage fora do Railway (Backblaze B2 /
# Cloudflare R2 ou equivalente -- qualquer um com API compativel com S3).
#
# NAO roda sozinho: precisa de um agendador externo (Railway Cron Job,
# GitHub Actions agendado -- ver .github/workflows/backup-db.yml.example --
# ou crontab de qualquer VM). Este projeto nao usa scheduler dentro do
# processo Node de proposito (mesma decisao arquitetural do resto do
# sistema, ver CONTEXTO.md), entao este script fica fora do backend/src.
#
# Variaveis obrigatorias (nunca commitar valor real -- so nomes aqui):
#   DATABASE_URL              -- ja existe em producao
#   BACKUP_S3_ENDPOINT        -- ex: https://s3.us-west-002.backblazeb2.com
#   BACKUP_S3_BUCKET          -- nome do bucket dedicado a backup
#   AWS_ACCESS_KEY_ID         -- credencial do bucket (B2/R2 tem par compativel S3)
#   AWS_SECRET_ACCESS_KEY     -- credencial do bucket
#
# Requer: pg_dump (cliente Postgres) e aws-cli (fala com qualquer S3-compativel
# via --endpoint-url, sem SDK proprio do provedor).

set -eu

for var in DATABASE_URL BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then
    echo "Faltando variavel obrigatoria: $var" >&2
    exit 1
  fi
done

TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
FILENAME="sistema-pedidos-${TIMESTAMP}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

echo "Gerando dump de ${DATABASE_URL%%@*}@... -> ${TMPFILE}"
pg_dump "$DATABASE_URL" | gzip > "$TMPFILE"

echo "Enviando para s3://${BACKUP_S3_BUCKET}/${FILENAME}"
aws s3 cp "$TMPFILE" "s3://${BACKUP_S3_BUCKET}/${FILENAME}" \
  --endpoint-url "$BACKUP_S3_ENDPOINT"

rm -f "$TMPFILE"
echo "Backup concluido: ${FILENAME}"
