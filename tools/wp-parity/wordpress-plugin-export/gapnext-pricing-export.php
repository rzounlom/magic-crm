<?php
/**
 * DEPRECATED — do not patch Event Planner with this file.
 * Use the standalone ZIP: dist/magiccrm-gapnext-pricing-export-1.0.0.zip
 * (see INSTALL.md). Kept only as historical reference.
 *
 * Admin-only effective pricing export for Generations Event Planner Next 3.3.0.
 */
namespace Generations\PlannerNext;

final class PricingExport {
    const PAGE = 'gapnext-export-pricing';
    const ACTION = 'gapnext_export_pricing';

    public static function boot() {
        add_action('admin_menu', function () {
            add_submenu_page(
                'gapnext',
                'Export pricing',
                'Export pricing',
                'manage_options',
                self::PAGE,
                [__CLASS__, 'page']
            );
        });
        add_action('admin_post_' . self::ACTION, [__CLASS__, 'download']);
    }

    /** Effective configuration MagicCRM can import as tenant_live after verification. */
    public static function payload() {
        $defaults = Catalog::defaults();
        $effective = Catalog::all();
        $overrides = function_exists('get_option') ? get_option('gapnext_price_overrides', []) : [];
        if (!is_array($overrides)) {
            $overrides = [];
        }
        $packagesAll = class_exists(Packages::class, false) ? Packages::all() : [];
        $packagesActive = class_exists(Packages::class, false) ? Packages::active() : [];
        $pricesUpdated = function_exists('get_option') ? get_option('gapnext_prices_updated', null) : null;
        $host = function_exists('home_url') ? wp_parse_url(home_url(), PHP_URL_HOST) : null;

        // Flatten only keys that differ from defaults for clarity.
        $diffFromDefaults = [];
        foreach (Catalog::fields() as $key => $field) {
            $parts = explode('.', $key);
            $default = count($parts) === 2 ? $defaults[$parts[0]][$parts[1]] : $defaults[$key];
            $value = count($parts) === 2 ? $effective[$parts[0]][$parts[1]] : $effective[$key];
            if ($value !== $default) {
                $diffFromDefaults[$key] = $value;
            }
        }

        $packagesRevision = null;
        if (class_exists(Packages::class, false) && method_exists(Packages::class, 'revision')) {
            $packagesRevision = Packages::revision();
        } elseif ($packagesActive !== []) {
            $packagesRevision = substr(hash('sha256', wp_json_encode(array_values($packagesActive))), 0, 16);
        }

        return [
            'format' => 'gapnext_effective_pricing_v1',
            'effective_source' => 'live_wordpress',
            'plugin_version' => defined('GAPNEXT_VERSION') ? GAPNEXT_VERSION : null,
            'catalog_version' => Catalog::VERSION,
            'rules_version' => Catalog::VERSION,
            'exported_at' => gmdate('c'),
            'site_host' => is_string($host) ? $host : null,
            'catalog_revision' => Catalog::revision(),
            'packages_revision' => $packagesRevision,
            'prices_updated' => is_array($pricesUpdated) ? $pricesUpdated : null,
            'tax' => [
                'food_beverage_rate' => 0.07,
                'note' => 'Hardcoded in Engine line-item tax for F&B; not a WP option.',
            ],
            'engine_embedded_rules' => [
                'weekday_specials' => true,
                'package_eligibility' => true,
                'arcade_credit_allocation' => true,
                'note' => 'Specials and eligibility live in Engine/Packages PHP, not separate option rows.',
            ],
            'catalog_defaults' => $defaults,
            'catalog_effective' => $effective,
            'price_overrides_option' => $overrides,
            'price_diffs_from_defaults' => $diffFromDefaults,
            'custom_packages_all' => array_values($packagesAll),
            'custom_packages_active' => array_values($packagesActive),
        ];
    }

    public static function page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $payload = self::payload();
        echo '<div class="wrap"><h1>Export pricing</h1>';
        echo '<p>Download the <strong>effective</strong> Event Planner pricing used for new recommendations (defaults + admin overrides + active custom packages).</p>';
        echo '<p>Catalog revision: <code>' . esc_html($payload['catalog_revision']) . '</code> · Diffs from defaults: <strong>' . esc_html((string) count($payload['price_diffs_from_defaults'])) . '</strong> · Active custom packages: <strong>' . esc_html((string) count($payload['custom_packages_active'])) . '</strong></p>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::ACTION) . '">';
        wp_nonce_field(self::ACTION);
        submit_button('Download effective pricing JSON');
        echo '</form></div>';
    }

    public static function download() {
        if (!current_user_can('manage_options')) {
            wp_die('Not allowed.');
        }
        check_admin_referer(self::ACTION);
        $payload = self::payload();
        $json = wp_json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            wp_die('Unable to encode pricing export.');
        }
        $filename = 'gapnext-effective-pricing-' . gmdate('Ymd-His') . '.json';
        nocache_headers();
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . (string) strlen($json));
        echo $json;
        exit;
    }
}

if (function_exists('add_action')) {
    PricingExport::boot();
}
