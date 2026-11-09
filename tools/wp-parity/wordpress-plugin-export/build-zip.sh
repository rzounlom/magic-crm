#!/usr/bin/env bash
# Build the installable WordPress plugin ZIP and run local validation (no live WP).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../../.." && pwd)"
PLUGIN_DIR="$ROOT/magiccrm-gapnext-pricing-export"
DIST_DIR="$ROOT/dist"
VERSION="$(grep -E '^ \* Version:' "$PLUGIN_DIR/magiccrm-gapnext-pricing-export.php" | awk '{print $3}')"
ZIP_NAME="magiccrm-gapnext-pricing-export-${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"
PHP_BIN="${PHP_BIN:-}"

if [[ -z "$PHP_BIN" ]]; then
  if [[ -x "$REPO/tmp/mamba-root/envs/php85/bin/php" ]]; then
    PHP_BIN="$REPO/tmp/mamba-root/envs/php85/bin/php"
  elif command -v php >/dev/null 2>&1; then
    PHP_BIN="$(command -v php)"
  else
    echo "PHP not found. Set PHP_BIN or install PHP 7.4+." >&2
    exit 1
  fi
fi

PLANNER_ROOT="${WP_PLANNER_ROOT:-$HOME/Downloads/WP Plugging- Event Planner Intake/generations-event-planner-next}"
OUT_DIR="$DIST_DIR/local-test-output"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"

# ZIP must contain a single top-level plugin folder for WP uploader.
(
  cd "$ROOT"
  zip -r "$ZIP_PATH" "magiccrm-gapnext-pricing-export" \
    -x "*.DS_Store" \
    -x "*/.git/*"
)

echo "Built $ZIP_PATH"
unzip -l "$ZIP_PATH" | head -30

echo ""
echo "== Local harness (Event Planner + exporter, offline) =="
"$PHP_BIN" "$ROOT/local-harness/run-export.php" \
  --planner-root "$PLANNER_ROOT" \
  --out "$OUT_DIR"

echo ""
echo "== MagicCRM schema validation =="
cd "$REPO"
pnpm exec tsx --tsconfig tsconfig.json \
  tools/wp-parity/wordpress-plugin-export/local-harness/validate-export-file.ts \
  "$OUT_DIR/effective-pricing-defaults.json"
pnpm exec tsx --tsconfig tsconfig.json \
  tools/wp-parity/wordpress-plugin-export/local-harness/validate-export-file.ts \
  "$OUT_DIR/effective-pricing-with-overrides.json"

# Compatibility missing-plugin check (classes not loaded)
echo ""
echo "== Missing Event Planner warning check =="
"$PHP_BIN" -r '
require "'"$ROOT"'/local-harness/wp-stubs.php";
require "'"$PLUGIN_DIR"'/includes/compatibility.php";
$a = MagicCRM\GapNextPricingExport\Compatibility::assess();
if ($a["ready"] || $a["errors"] === []) { fwrite(STDERR, "Expected missing-plugin error\n"); exit(1); }
echo "OK missing-plugin: ".$a["errors"][0]."\n";
'

echo ""
echo "ZIP=$ZIP_PATH"
echo "Done."
