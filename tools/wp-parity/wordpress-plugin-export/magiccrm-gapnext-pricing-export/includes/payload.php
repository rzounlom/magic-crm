<?php
namespace MagicCRM\GapNextPricingExport;

use Generations\PlannerNext\Catalog;
use Generations\PlannerNext\Packages;

/**
 * Build the MagicCRM `gapnext_effective_pricing_v1` document from live Event Planner APIs.
 * No customer, inquiry, credential, or PII fields.
 */
final class Payload {
    /**
     * @return array<string,mixed>
     */
    public static function build() {
        $compat = Compatibility::assess();
        if (!$compat['ready']) {
            throw new \RuntimeException(implode(' ', $compat['errors']));
        }

        $defaults = Catalog::defaults();
        $effective = Catalog::all();
        $overrides = function_exists('get_option') ? get_option('gapnext_price_overrides', []) : [];
        if (!is_array($overrides)) {
            $overrides = [];
        }

        $packagesAll = Packages::all();
        $packagesActive = Packages::active();
        if (!is_array($packagesAll)) {
            $packagesAll = [];
        }
        if (!is_array($packagesActive)) {
            $packagesActive = [];
        }

        $pricesUpdated = function_exists('get_option') ? get_option('gapnext_prices_updated', null) : null;
        if (!is_array($pricesUpdated)) {
            $pricesUpdated = null;
        } else {
            // Keep only non-PII metadata keys if present.
            $safeUpdated = [];
            if (isset($pricesUpdated['at'])) {
                $safeUpdated['at'] = $pricesUpdated['at'];
            }
            // Intentionally omit user id / emails.
            $pricesUpdated = $safeUpdated === [] ? null : $safeUpdated;
        }

        $host = null;
        if (function_exists('home_url') && function_exists('wp_parse_url')) {
            $parsed = wp_parse_url(home_url(), PHP_URL_HOST);
            $host = is_string($parsed) ? $parsed : null;
        }

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
        if (method_exists(Packages::class, 'revision')) {
            $packagesRevision = Packages::revision();
        } elseif ($packagesActive !== []) {
            $encoded = function_exists('wp_json_encode')
                ? wp_json_encode(array_values($packagesActive))
                : json_encode(array_values($packagesActive));
            $packagesRevision = is_string($encoded) ? substr(hash('sha256', $encoded), 0, 16) : null;
        }

        // JSON-encode empty maps as objects `{}` (not arrays `[]`) for MagicCRM schema.
        $overridesObject = $overrides === [] ? new \stdClass() : $overrides;
        $diffsObject = $diffFromDefaults === [] ? new \stdClass() : $diffFromDefaults;

        return [
            'format' => 'gapnext_effective_pricing_v1',
            'effective_source' => 'live_wordpress',
            'plugin_version' => defined('GAPNEXT_VERSION') ? GAPNEXT_VERSION : null,
            'catalog_version' => Catalog::VERSION,
            'rules_version' => Catalog::VERSION,
            'exported_at' => gmdate('c'),
            'site_host' => $host,
            'catalog_revision' => Catalog::revision(),
            'packages_revision' => $packagesRevision,
            'prices_updated' => $pricesUpdated,
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
            'price_overrides_option' => $overridesObject,
            'price_diffs_from_defaults' => $diffsObject,
            'custom_packages_all' => array_values($packagesAll),
            'custom_packages_active' => array_values($packagesActive),
            'exporter' => [
                'name' => 'magiccrm-gapnext-pricing-export',
                'version' => defined('MAGICCRM_GAPNEXT_EXPORT_VERSION') ? MAGICCRM_GAPNEXT_EXPORT_VERSION : null,
                'compatibility_warnings' => $compat['warnings'],
            ],
        ];
    }
}
