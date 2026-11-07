#!/bin/bash
# Автообновление сайта (бета без аккаунтов, режим static): сервер сам забирает новую сборку из публичного
# репозитория сайта github.com/asperAsd/turkce и ставит её в /var/www/cepteturk. Ключи и пароли не нужны:
# репозиторий публичный, в нём только собранный сайт.
#
#   Установка (один раз, на сервере):
#     sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/asperAsd/turkce/main/deploy/autopull.sh)" -- install
#   Дальше: каждые 2 минуты служба проверяет репозиторий; журнал — journalctl -u cepteturk-autopull -n 30
#   Обновить вручную сейчас: sudo systemctl start cepteturk-autopull
#
# Пустую или битую сборку не ставит: главная и приложение должны быть настоящего размера.
set -euo pipefail
REPO=${AUTOPULL_REPO:-https://github.com/asperAsd/turkce.git}
BRANCH=${AUTOPULL_BRANCH:-main}
SRC=/opt/cepteturk-site
WEB=/var/www/cepteturk
REV=/var/lib/cepteturk-site.rev
BIN=/usr/local/bin/cepteturk-autopull

if [ "${1:-}" = install ]; then
  [ "$(id -u)" = 0 ] || { echo "запускайте через sudo"; exit 1; }
  command -v git >/dev/null || { apt-get update -y -q && apt-get install -y -q git; }
  command -v rsync >/dev/null || apt-get install -y -q rsync
  curl -fsSL "https://raw.githubusercontent.com/asperAsd/turkce/$BRANCH/deploy/autopull.sh" -o "$BIN.new" 2>/dev/null || cp "$0" "$BIN.new"
  chmod 755 "$BIN.new"; mv "$BIN.new" "$BIN"
  cat > /etc/systemd/system/cepteturk-autopull.service <<EOF
[Unit]
Description=CepteTurk: забрать новую сборку сайта с GitHub
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=$BIN
EOF
  cat > /etc/systemd/system/cepteturk-autopull.timer <<EOF
[Unit]
Description=CepteTurk: проверять новую сборку сайта каждые 2 минуты
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now cepteturk-autopull.timer >/dev/null
  systemctl start cepteturk-autopull.service || true
  journalctl -u cepteturk-autopull -n 5 --no-pager -o cat || true
  echo "Готово: сайт обновляется сам каждые 2 минуты из $REPO ($BRANCH)"
  exit 0
fi

exec 9>/run/cepteturk-autopull.lock
flock -n 9 || exit 0
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q --depth 1 origin "$BRANCH"
  NEW=$(git -C "$SRC" rev-parse FETCH_HEAD)
else
  rm -rf "$SRC"; git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
  NEW=$(git -C "$SRC" rev-parse HEAD)
fi
[ "$NEW" = "$(cat "$REV" 2>/dev/null || true)" ] && exit 0
git -C "$SRC" reset -q --hard "$NEW"

size() { stat -c%s "$1" 2>/dev/null || echo 0; }
if [ "$(size "$SRC/index.html")" -lt 10000 ] || [ "$(size "$SRC/app/index.html")" -lt 100000 ]; then
  echo "сборка ${NEW:0:7} выглядит пустой — не ставлю, на сайте остаётся прежняя версия"; exit 1
fi
mkdir -p "$WEB"
rsync -a --delete --exclude '/.git' --exclude '/deploy/' --exclude '/README.md' "$SRC/" "$WEB/"
echo "$NEW" > "$REV"
echo "сайт обновлён до ${NEW:0:7}: $(git -C "$SRC" log -1 --format=%s)"
