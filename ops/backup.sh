#!/bin/bash
set -e

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
FILENAME="db_backup_${TIMESTAMP}.sql.gz.gpg"

echo "[$(date)] Starting encrypted backup pipeline..."

# Dump, Compress, and Encrypt on the fly
mariadb-dump -h "${DB_HOST}" -u "${DB_USER}" -p"${DB_PASSWORD}" --skip-ssl --ssl-verify-server-cert=FALSE "${DB_NAME}" \
    | gzip \
    | gpg --batch --yes --encrypt --recipient "${GPG_RECIPIENT}" --trust-model always \
    > "/tmp/${FILENAME}"

echo "[$(date)] Encryption complete. Uploading to Cloudflare R2..."

# Upload using native AWS CLI env vars
aws s3 cp "/tmp/${FILENAME}" "s3://${S3_BUCKET}/${FILENAME}" \
    --endpoint-url "${R2_ENDPOINT_URL}"

rm -f "/tmp/${FILENAME}"

echo "[$(date)] ✅ Backup ${FILENAME} secured and uploaded."