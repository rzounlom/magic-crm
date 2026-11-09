<?php
/**
 * Plugin Name: MagicCRM GapNext Pricing Export
 * Description: Admin-only export of effective Generations Event Planner 3.3.0 pricing (catalog overrides + active custom packages) for MagicCRM import. Does not modify Event Planner files or customer data.
 * Version: 1.0.0
 * Author: MagicCRM
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: magiccrm-gapnext-pricing-export
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MAGICCRM_GAPNEXT_EXPORT_VERSION', '1.0.0');
define('MAGICCRM_GAPNEXT_EXPORT_FILE', __FILE__);
define('MAGICCRM_GAPNEXT_EXPORT_DIR', __DIR__ . '/');

require_once MAGICCRM_GAPNEXT_EXPORT_DIR . 'includes/compatibility.php';
require_once MAGICCRM_GAPNEXT_EXPORT_DIR . 'includes/payload.php';
require_once MAGICCRM_GAPNEXT_EXPORT_DIR . 'includes/admin.php';

\MagicCRM\GapNextPricingExport\Admin::boot();
