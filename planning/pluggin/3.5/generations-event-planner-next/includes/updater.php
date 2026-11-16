<?php
namespace Generations\PlannerNext;
if(!defined('ABSPATH'))exit;

/** Native WordPress updates from an administrator-configured HTTPS release feed. */
final class Updater {
    const SLUG='generations-event-planner-next';
    const ID='https://generations-adventureplex.com/generations-event-planner-next/';
    const OPTION='gapnext_update_feed';
    const PAGE='gapnext-updates';
    private static $file='';
    public static function boot($file){
        self::$file=plugin_basename($file);
        add_filter('update_plugins_generations-adventureplex.com',[__CLASS__,'offer'],10,4);
        add_filter('plugins_api',[__CLASS__,'information'],10,3);
        add_action('admin_menu',function(){if(!is_multisite())add_submenu_page('gapnext','Plugin Updates','Plugin Updates','update_plugins',self::PAGE,[__CLASS__,'page']);});
        add_action('network_admin_menu',function(){add_submenu_page('plugins.php','Event Planner Updates','Event Planner Updates','update_plugins',self::PAGE,[__CLASS__,'page']);});
        add_action('admin_post_gapnext_update_feed',[__CLASS__,'save']);
        add_action('admin_post_gapnext_check_updates',[__CLASS__,'check']);
        add_action('upgrader_process_complete',[__CLASS__,'upgraded'],10,2);
    }
    /** Disallow insecure, credential-bearing and private-network feed/package URLs. */
    public static function secure_url($url){
        if(!is_string($url)||strlen($url)>2048||preg_match('/[\x00-\x20\x7f]/',$url))return false;
        $parts=wp_parse_url($url);
        if(!is_array($parts)||($parts['scheme']??'')!=='https'||empty($parts['host'])||isset($parts['user'])||isset($parts['pass'])||isset($parts['fragment']))return false;
        return wp_http_validate_url($url)?$url:false;
    }
    public static function feed(){
        $url=defined('GAPNEXT_UPDATE_FEED_URL')?GAPNEXT_UPDATE_FEED_URL:get_site_option(self::OPTION,'');
        return self::secure_url($url)?:'';
    }
    private static function cache_key($url){return 'gapnext_release_'.md5($url);}
    private static function version($value){return is_string($value)&&preg_match('/^\d+\.\d+(?:\.\d+){0,2}$/D',$value);}
    public static function validate($data,$feed){
        if(!is_array($data)||($data['slug']??'')!==self::SLUG||!self::version($data['version']??null))return new \WP_Error('release_invalid','The update feed has an invalid plugin identifier or version.');
        $package=self::secure_url($data['download_url']??null);
        if(!$package||strtolower(wp_parse_url($package,PHP_URL_HOST))!==strtolower(wp_parse_url($feed,PHP_URL_HOST)))return new \WP_Error('release_package','The release ZIP must use HTTPS on the same host as the update feed.');
        $out=['name'=>'Generations Event Planner — Next','slug'=>self::SLUG,'version'=>$data['version'],'download_url'=>$package,'homepage'=>self::ID,'requires'=>'6.4','requires_php'=>'7.4','sections'=>[]];
        foreach(['requires','requires_php','tested'] as $key)if(isset($data[$key])){if(!self::version($data[$key]))return new \WP_Error('release_requirements','The update feed contains an invalid compatibility version.');$out[$key]=$data[$key];}
        if(isset($data['last_updated'])&&is_string($data['last_updated'])&&preg_match('/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/D',$data['last_updated']))$out['last_updated']=$data['last_updated'];
        foreach(['description','changelog','installation'] as $key)if(isset($data['sections'][$key])&&is_string($data['sections'][$key]))$out['sections'][$key]=wp_kses_post($data['sections'][$key]);
        return $out;
    }
    public static function release($force=false){
        $url=self::feed();if(!$url)return new \WP_Error('release_not_configured','An update feed has not been connected yet.');
        $key=self::cache_key($url);$cached=$force?false:get_site_transient($key);
        if(is_array($cached))return isset($cached['error'])?new \WP_Error('release_unavailable',$cached['error']):$cached;
        $response=wp_safe_remote_get($url,['timeout'=>8,'redirection'=>0,'sslverify'=>true,'limit_response_size'=>131072,'headers'=>['Accept'=>'application/json'],'user-agent'=>'GenerationsEventPlanner/'.GAPNEXT_VERSION]);
        if(is_wp_error($response))$result=new \WP_Error('release_unavailable','The update server could not be reached. Your installed plugin is unchanged.');
        elseif(wp_remote_retrieve_response_code($response)!==200)$result=new \WP_Error('release_http','The update server did not return a release feed (HTTP '.(int)wp_remote_retrieve_response_code($response).').');
        else $result=self::validate(json_decode(wp_remote_retrieve_body($response),true),$url);
        if(is_wp_error($result))set_site_transient($key,['error'=>$result->get_error_message()],15*MINUTE_IN_SECONDS);
        else set_site_transient($key,$result,6*HOUR_IN_SECONDS);
        return $result;
    }
    public static function offer($existing,$plugin_data,$plugin_file,$locales){
        if($plugin_file!==self::$file)return $existing;
        $release=self::release();if(is_wp_error($release))return false;
        // WordPress compares this version with the installed one and owns installation,
        // compatibility checks, credentials, rollback, and the user's auto-update choice.
        $offer=['id'=>self::ID,'slug'=>self::SLUG,'version'=>$release['version'],'url'=>self::ID,'package'=>$release['download_url'],'requires'=>$release['requires'],'requires_php'=>$release['requires_php']];
        if(isset($release['tested']))$offer['tested']=$release['tested'];
        return $offer;
    }
    public static function information($existing,$action,$args){
        if($action!=='plugin_information'||!is_object($args)||($args->slug??'')!==self::SLUG)return $existing;
        $release=self::release();
        if(is_wp_error($release))return new \WP_Error('release_info',$release->get_error_message());
        return (object)array_merge($release,['author'=>'Generations AdventurePlex','external'=>true]);
    }
    private static function protect($nonce){if(!current_user_can('update_plugins'))wp_die('Not allowed.');check_admin_referer($nonce);}
    private static function url(){return is_multisite()?network_admin_url('plugins.php?page='.self::PAGE):admin_url('admin.php?page='.self::PAGE);}
    private static function finish($message,$error=false){set_transient('gapnext_update_notice_'.get_current_user_id(),['message'=>$message,'error'=>$error],5*MINUTE_IN_SECONDS);wp_safe_redirect(self::url());exit;}
    public static function save(){
        self::protect('gapnext_update_feed');
        if(defined('GAPNEXT_UPDATE_FEED_URL'))self::finish('The update feed is managed in wp-config.php.',true);
        $raw=isset($_POST['feed_url'])?wp_unslash($_POST['feed_url']):'';
        if(!is_string($raw))self::finish('Enter a valid HTTPS update feed URL.',true);
        $raw=trim($raw);$url=$raw===''?'':self::secure_url($raw);
        if($url===false)self::finish('Use a public HTTPS update feed URL without embedded credentials or fragments.',true);
        $old=self::feed();if($old)delete_site_transient(self::cache_key($old));
        update_site_option(self::OPTION,$url);
        if($url)delete_site_transient(self::cache_key($url));
        delete_site_transient('update_plugins');
        self::finish($url?'Update feed saved. Use Check for updates to verify the connection.':'Update feed disconnected. Your installed plugin is unchanged.');
    }
    public static function check(){
        self::protect('gapnext_check_updates');$release=self::release(true);
        // Rebuild the native update list only after a successful feed check.
        if(is_wp_error($release))self::finish($release->get_error_message(),true);
        delete_site_transient('update_plugins');wp_update_plugins();
        $newer=version_compare($release['version'],GAPNEXT_VERSION,'>');
        self::finish($newer?'Version '.$release['version'].' is available. Open Plugins or Dashboard → Updates to install it.':'Connected. No newer release is published (installed '.GAPNEXT_VERSION.'; published '.$release['version'].').');
    }
    public static function upgraded($upgrader,$options){
        if(($options['action']??'')!=='update'||($options['type']??'')!=='plugin')return;
        $plugins=$options['plugins']??[];if(isset($options['plugin']))$plugins[]=$options['plugin'];
        if(!in_array(self::$file,$plugins,true))return;
        $url=self::feed();if($url)delete_site_transient(self::cache_key($url));
    }
    public static function page(){
        if(!current_user_can('update_plugins'))return;
        echo '<div class="wrap"><h1>Event Planner Updates</h1><p><strong>Installed version: '.esc_html(GAPNEXT_VERSION).'</strong></p>';
        $notice=get_transient('gapnext_update_notice_'.get_current_user_id());
        if(is_array($notice)){delete_transient('gapnext_update_notice_'.get_current_user_id());echo '<div class="notice '.(!empty($notice['error'])?'notice-error':'notice-success').'"><p>'.esc_html($notice['message']).'</p></div>';}
        $url=self::feed();$locked=defined('GAPNEXT_UPDATE_FEED_URL');
        echo '<p>Connect the permanent HTTPS release feed supplied by your plugin publisher. WordPress will then show new releases in Plugins and Dashboard → Updates. Saved prices, inquiries and attachment selections remain in the database across updates.</p>';
        if(!$url)echo '<div class="notice notice-warning inline"><p>Update hosting is not connected yet. The current plugin continues working; updates will appear after a release feed is published and connected.</p></div>';
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="gapnext_update_feed">';wp_nonce_field('gapnext_update_feed');
        echo '<p><label for="gapnext-feed"><strong>Update feed URL</strong></label></p><input id="gapnext-feed" name="feed_url" type="url" style="width:100%;max-width:820px" value="'.esc_attr($url).'" placeholder="https://your-update-host.example/releases/update.json" '.($locked?'readonly':'').'><p class="description">Use only a trusted publisher’s URL. The release ZIP must be hosted on the same HTTPS hostname. Connecting a feed permits WordPress to download executable plugin updates from that publisher.</p>';
        if(!$locked)submit_button('Save update connection');else echo '<p>Managed in wp-config.php through GAPNEXT_UPDATE_FEED_URL.</p>';
        echo '</form><form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="gapnext_check_updates">';wp_nonce_field('gapnext_check_updates');submit_button('Check for updates','secondary');echo '</form>';
        echo '<h2>Installing future updates</h2><ol><li>The publisher uploads a new release ZIP and updates the release feed.</li><li>WordPress detects the newer version.</li><li>Choose <strong>Update now</strong> beside the plugin.</li></ol><p>Automatic installation stays under WordPress’s normal auto-update controls; this plugin does not enable it for you. No event inquiries or customer information are sent to the release feed.</p><p>Publisher setup instructions are included in <code>docs/UPDATES.md</code> inside the plugin ZIP.</p></div>';
    }
}
