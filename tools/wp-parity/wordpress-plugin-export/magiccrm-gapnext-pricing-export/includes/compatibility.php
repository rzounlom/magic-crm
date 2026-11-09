<?php
namespace MagicCRM\GapNextPricingExport;

/**
 * Detect Generations Event Planner — Next without modifying it.
 */
final class Compatibility {
    const EXPECTED_PLUGIN_VERSION = '3.3.0';
    const EXPECTED_CATALOG_VERSION = '2026-11-02';

    /**
     * @return array{
     *   ok: bool,
     *   ready: bool,
     *   warnings: string[],
     *   errors: string[],
     *   plugin_version: string|null,
     *   catalog_version: string|null,
     *   event_planner_active: bool
     * }
     */
    public static function assess() {
        $warnings = [];
        $errors = [];
        $pluginVersion = defined('GAPNEXT_VERSION') ? (string) GAPNEXT_VERSION : null;
        $catalogVersion = null;
        $eventPlannerActive = self::isEventPlannerLoaded();

        if (!$eventPlannerActive) {
            $errors[] = 'Generations Event Planner — Next is not active (or its classes are not loaded). Activate that plugin first. This exporter does not change Event Planner files.';
            return [
                'ok' => false,
                'ready' => false,
                'warnings' => $warnings,
                'errors' => $errors,
                'plugin_version' => $pluginVersion,
                'catalog_version' => null,
                'event_planner_active' => false,
            ];
        }

        $catalogClass = '\\Generations\\PlannerNext\\Catalog';
        $packagesClass = '\\Generations\\PlannerNext\\Packages';

        foreach (['defaults', 'all', 'revision', 'fields'] as $method) {
            if (!method_exists($catalogClass, $method)) {
                $errors[] = "Catalog::{$method}() is missing — incompatible Event Planner build.";
            }
        }
        foreach (['all', 'active', 'revision'] as $method) {
            if (!method_exists($packagesClass, $method)) {
                $errors[] = "Packages::{$method}() is missing — incompatible Event Planner build.";
            }
        }

        if (defined('Generations\\PlannerNext\\Catalog::VERSION')) {
            $catalogVersion = (string) \Generations\PlannerNext\Catalog::VERSION;
        } else {
            $errors[] = 'Catalog::VERSION is missing.';
        }

        if ($pluginVersion === null) {
            $warnings[] = 'GAPNEXT_VERSION is not defined; Event Planner may be partially loaded.';
        } elseif ($pluginVersion !== self::EXPECTED_PLUGIN_VERSION) {
            $warnings[] = 'Event Planner plugin version is ' . $pluginVersion . '; MagicCRM validated against ' . self::EXPECTED_PLUGIN_VERSION . '. Review the export carefully before import.';
        }

        if ($catalogVersion !== null && $catalogVersion !== self::EXPECTED_CATALOG_VERSION) {
            $warnings[] = 'Catalog::VERSION is ' . $catalogVersion . '; MagicCRM port expects ' . self::EXPECTED_CATALOG_VERSION . '.';
        }

        $ok = $errors === [];
        return [
            'ok' => $ok,
            'ready' => $ok,
            'warnings' => $warnings,
            'errors' => $errors,
            'plugin_version' => $pluginVersion,
            'catalog_version' => $catalogVersion,
            'event_planner_active' => true,
        ];
    }

    public static function isEventPlannerLoaded() {
        return class_exists('\\Generations\\PlannerNext\\Catalog', false)
            && class_exists('\\Generations\\PlannerNext\\Packages', false);
    }
}
