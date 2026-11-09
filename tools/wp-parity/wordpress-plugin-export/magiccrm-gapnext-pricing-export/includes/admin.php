<?php
namespace MagicCRM\GapNextPricingExport;

/**
 * Admin-only Export pricing UI + nonce-protected download.
 * No public REST routes or unauthenticated endpoints.
 */
final class Admin {
    const PAGE = 'magiccrm-gapnext-export-pricing';
    const ACTION = 'magiccrm_gapnext_export_pricing';
    const PARENT_GAPNEXT = 'gapnext';
    const PARENT_TOOLS = 'tools.php';

    public static function boot() {
        add_action('admin_menu', [__CLASS__, 'register_menu']);
        add_action('admin_post_' . self::ACTION, [__CLASS__, 'download']);
    }

    public static function register_menu() {
        $compat = Compatibility::assess();
        $parent = $compat['event_planner_active'] ? self::PARENT_GAPNEXT : self::PARENT_TOOLS;
        $title = 'Export pricing';
        $menu = $compat['ready'] ? 'Export pricing' : 'Export pricing ⚠';

        add_submenu_page(
            $parent,
            $title,
            $menu,
            'manage_options',
            self::PAGE,
            [__CLASS__, 'page']
        );
    }

    public static function page() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to export pricing.', 'magiccrm-gapnext-pricing-export'));
        }

        $compat = Compatibility::assess();
        echo '<div class="wrap">';
        echo '<h1>MagicCRM — Export Event Planner pricing</h1>';
        echo '<p>Downloads a JSON file of the <strong>effective</strong> Generations Event Planner pricing (catalog defaults + administrator overrides + active custom packages) for MagicCRM import.</p>';
        echo '<p><strong>This plugin does not modify</strong> the Event Planner plugin, catalog options, packages, or any customer/inquiry records.</p>';

        if ($compat['errors'] !== []) {
            echo '<div class="notice notice-error"><p><strong>Cannot export.</strong></p><ul>';
            foreach ($compat['errors'] as $error) {
                echo '<li>' . esc_html($error) . '</li>';
            }
            echo '</ul></div>';
        }

        if ($compat['warnings'] !== []) {
            echo '<div class="notice notice-warning"><p><strong>Compatibility warnings</strong></p><ul>';
            foreach ($compat['warnings'] as $warning) {
                echo '<li>' . esc_html($warning) . '</li>';
            }
            echo '</ul></div>';
        }

        if (!$compat['ready']) {
            echo '<p>Activate a compatible Generations Event Planner — Next (3.3.0) plugin, then return here.</p>';
            echo '</div>';
            return;
        }

        try {
            $payload = Payload::build();
        } catch (\Throwable $e) {
            echo '<div class="notice notice-error"><p>' . esc_html($e->getMessage()) . '</p></div></div>';
            return;
        }

        $diffCount = count((array) $payload['price_diffs_from_defaults']);
        $activeCount = count($payload['custom_packages_active']);
        echo '<table class="widefat striped" style="max-width:720px"><tbody>';
        echo '<tr><th scope="row">Event Planner version</th><td><code>' . esc_html((string) $payload['plugin_version']) . '</code></td></tr>';
        echo '<tr><th scope="row">Catalog / rules version</th><td><code>' . esc_html((string) $payload['catalog_version']) . '</code></td></tr>';
        echo '<tr><th scope="row">Catalog revision</th><td><code>' . esc_html((string) $payload['catalog_revision']) . '</code></td></tr>';
        echo '<tr><th scope="row">Packages revision</th><td><code>' . esc_html((string) ($payload['packages_revision'] ?? '—')) . '</code></td></tr>';
        echo '<tr><th scope="row">Price diffs from defaults</th><td>' . esc_html((string) $diffCount) . '</td></tr>';
        echo '<tr><th scope="row">Active custom packages</th><td>' . esc_html((string) $activeCount) . '</td></tr>';
        echo '<tr><th scope="row">Export format</th><td><code>gapnext_effective_pricing_v1</code> · <code>live_wordpress</code></td></tr>';
        echo '</tbody></table>';

        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="margin-top:1.5em">';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::ACTION) . '">';
        wp_nonce_field(self::ACTION);
        submit_button('Download effective pricing JSON', 'primary', 'submit', false);
        echo '</form>';
        echo '<p class="description" style="margin-top:1em">Administrators only (<code>manage_options</code>). Download is nonce-protected via <code>admin-post.php</code>. No public URL.</p>';
        echo '</div>';
    }

    public static function download() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Not allowed.', 'magiccrm-gapnext-pricing-export'), 403);
        }
        check_admin_referer(self::ACTION);

        $compat = Compatibility::assess();
        if (!$compat['ready']) {
            wp_die(esc_html(implode(' ', $compat['errors'])), 400);
        }

        try {
            $payload = Payload::build();
        } catch (\Throwable $e) {
            wp_die(esc_html($e->getMessage()), 500);
        }

        $json = function_exists('wp_json_encode')
            ? wp_json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            : json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            wp_die(esc_html__('Unable to encode pricing export.', 'magiccrm-gapnext-pricing-export'), 500);
        }

        $filename = 'gapnext-effective-pricing-' . gmdate('Ymd-His') . '.json';
        nocache_headers();
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . (string) strlen($json));
        echo $json;
        exit;
    }
}
