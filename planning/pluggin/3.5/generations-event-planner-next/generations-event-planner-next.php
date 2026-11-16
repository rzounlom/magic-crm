<?php
/**
 * Plugin Name: Generations Event Planner — Next
 * Description: AdventurePlex event inquiries, private staff recommendations and proposed itineraries. Starts in test mode.
 * Version: 3.5.0
 * Update URI: https://generations-adventureplex.com/generations-event-planner-next/
 * Author: Generations AdventurePlex
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 */
if (!defined('ABSPATH')) exit;
define('GAPNEXT_DIR',__DIR__.'/');
define('GAPNEXT_URL',plugin_dir_url(__FILE__));
define('GAPNEXT_VERSION','3.5.0');
require_once GAPNEXT_DIR.'includes/catalog.php';
require_once GAPNEXT_DIR.'includes/engine.php';
require_once GAPNEXT_DIR.'includes/packages.php';
require_once GAPNEXT_DIR.'includes/emails.php';
require_once GAPNEXT_DIR.'includes/email-domain.php';
require_once GAPNEXT_DIR.'includes/plugin.php';
require_once GAPNEXT_DIR.'includes/admin.php';
require_once GAPNEXT_DIR.'includes/updater.php';
\Generations\PlannerNext\Updater::boot(__FILE__);
\Generations\PlannerNext\Plugin::boot();
\Generations\PlannerNext\Admin::boot();
\Generations\PlannerNext\Packages::boot();

require_once GAPNEXT_DIR.'includes/xlsx.php';
require_once GAPNEXT_DIR.'includes/staff.php';
\Generations\PlannerNext\Staff::boot();
require_once GAPNEXT_DIR.'includes/reports.php';
\Generations\PlannerNext\Reports::boot();
register_deactivation_hook(__FILE__,function(){wp_clear_scheduled_hook(\Generations\PlannerNext\Reports::HOOK);wp_unschedule_hook('gapnext_retry_digest');wp_unschedule_hook('gapnext_staff_expire');wp_unschedule_hook('gapnext_staff_delete');wp_unschedule_hook('gapnext_staff_cleanup');});
