<?php
/**
 * Minimal WordPress stubs for offline export testing. Not a WordPress runtime.
 */

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

if (!class_exists('WP_Error', false)) {
    class WP_Error {
        private $code;
        private $message;
        public function __construct($code = '', $message = '') {
            $this->code = $code;
            $this->message = $message;
        }
        public function get_error_message() {
            return (string) $this->message;
        }
    }
}

$GLOBALS['magiccrm_wp_options'] = $GLOBALS['magiccrm_wp_options'] ?? [];
$GLOBALS['magiccrm_wp_actions'] = $GLOBALS['magiccrm_wp_actions'] ?? [];

if (!function_exists('get_option')) {
    function get_option($key, $default = false) {
        return array_key_exists($key, $GLOBALS['magiccrm_wp_options'])
            ? $GLOBALS['magiccrm_wp_options'][$key]
            : $default;
    }
}
if (!function_exists('update_option')) {
    function update_option($key, $value, $autoload = null) {
        $GLOBALS['magiccrm_wp_options'][$key] = $value;
        return true;
    }
}
if (!function_exists('is_wp_error')) {
    function is_wp_error($thing) {
        return $thing instanceof WP_Error;
    }
}
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($str) {
        return trim(strip_tags((string) $str));
    }
}
if (!function_exists('sanitize_textarea_field')) {
    function sanitize_textarea_field($str) {
        return trim((string) $str);
    }
}
if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data, $options = 0, $depth = 512) {
        return json_encode($data, $options, $depth);
    }
}
if (!function_exists('home_url')) {
    function home_url($path = '') {
        return 'https://local-test.example' . $path;
    }
}
if (!function_exists('wp_parse_url')) {
    function wp_parse_url($url, $component = -1) {
        return parse_url($url, $component);
    }
}
if (!function_exists('add_action')) {
    function add_action($hook, $callback, $priority = 10, $accepted_args = 1) {
        $GLOBALS['magiccrm_wp_actions'][$hook][] = $callback;
        return true;
    }
}
if (!function_exists('add_submenu_page')) {
    function add_submenu_page() {
        return 'magiccrm-gapnext-export-pricing';
    }
}
if (!function_exists('current_user_can')) {
    function current_user_can($cap) {
        return $cap === 'manage_options';
    }
}
if (!function_exists('admin_url')) {
    function admin_url($path = '') {
        return 'https://local-test.example/wp-admin/' . ltrim($path, '/');
    }
}
if (!function_exists('esc_html')) {
    function esc_html($text) {
        return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
    }
}
if (!function_exists('esc_attr')) {
    function esc_attr($text) {
        return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
    }
}
if (!function_exists('esc_url')) {
    function esc_url($url) {
        return (string) $url;
    }
}
if (!function_exists('__')) {
    function __($text, $domain = null) {
        return $text;
    }
}
if (!function_exists('wp_nonce_field')) {
    function wp_nonce_field($action) {
        echo '<input type="hidden" name="_wpnonce" value="test-nonce">';
    }
}
if (!function_exists('check_admin_referer')) {
    function check_admin_referer($action) {
        return true;
    }
}
if (!function_exists('wp_die')) {
    function wp_die($message = '', $title = '', $args = []) {
        throw new RuntimeException(is_string($message) ? $message : 'wp_die');
    }
}
if (!function_exists('nocache_headers')) {
    function nocache_headers() {
    }
}
if (!function_exists('submit_button')) {
    function submit_button($text = 'Save') {
        echo '<button type="submit">' . esc_html($text) . '</button>';
    }
}
