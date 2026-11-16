<?php
if(PHP_SAPI!=='cli')exit;
define('ABSPATH',__DIR__.'/');define('GAPNEXT_VERSION','3.5.0');define('HOUR_IN_SECONDS',3600);define('MINUTE_IN_SECONDS',60);
$hooks=[];$opts=[];$cache=[];$requests=[];$remote=null;$tests=0;$caps=false;
class WP_Error {private $message;public function __construct($code,$message){$this->message=$message;}public function get_error_message(){return $this->message;}}
function is_wp_error($v){return $v instanceof WP_Error;}
function plugin_basename($file){return basename(dirname($file)).'/'.basename($file);}
function add_filter($name,$cb,$priority=10,$argc=1){$GLOBALS['hooks'][$name]=[$cb,$argc];}
function add_action($name,$cb,$priority=10,$argc=1){add_filter($name,$cb,$priority,$argc);}
function wp_parse_url($url,$component=-1){return parse_url($url,$component);}
function wp_http_validate_url($url){$p=parse_url($url);if(!$p||!empty($p['port'])&&!in_array($p['port'],[80,443],true))return false;$h=$p['host']??'';return filter_var($url,FILTER_VALIDATE_URL)&&$h!=='localhost'&&(!filter_var($h,FILTER_VALIDATE_IP)||filter_var($h,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE))?$url:false;}
function get_site_option($key,$default=''){return $GLOBALS['opts'][$key]??$default;}
function get_site_transient($key){return $GLOBALS['cache'][$key]['value']??false;}
function set_site_transient($key,$v,$ttl=0){$GLOBALS['cache'][$key]=['value'=>$v,'ttl'=>$ttl];}
function delete_site_transient($key){unset($GLOBALS['cache'][$key]);}
function wp_kses_post($html){return preg_replace('/<script\b[^>]*>.*?<\/script>/is','',$html);}
function wp_safe_remote_get($url,$options){$GLOBALS['requests'][]=[$url,$options];return $GLOBALS['remote'];}
function wp_remote_retrieve_response_code($r){return $r['code'];}
function wp_remote_retrieve_body($r){return $r['body'];}
function current_user_can($cap){return $GLOBALS['caps'];}
function get_transient($key){return false;}
function get_current_user_id(){return 1;}
function is_multisite(){return false;}
function esc_html($v){return htmlspecialchars($v,ENT_QUOTES,'UTF-8');}
function esc_attr($v){return esc_html($v);}
function esc_url($v){return esc_html($v);}
function admin_url($v){return 'https://venue.example/wp-admin/'.$v;}
function wp_nonce_field($v){echo '<input type="hidden" name="_wpnonce" value="test">';}
function submit_button($text,$kind='primary'){echo '<button>'.esc_html($text).'</button>';}
function check_admin_referer($nonce){$GLOBALS['nonce_checked']=$nonce;}
function wp_die($message){throw new Exception('Denied: '.$message);}
function yes($v,$name){global $tests;$tests++;if(!$v)throw new Exception('FAIL '.$name);echo 'PASS '.$name."\n";}
require __DIR__.'/../includes/updater.php';
use Generations\PlannerNext\Updater;
$file='/tmp/plugins/generations-event-planner-next/generations-event-planner-next.php';$basename='generations-event-planner-next/generations-event-planner-next.php';Updater::boot($file);
yes(isset($hooks['update_plugins_generations-adventureplex.com'])&&$hooks['update_plugins_generations-adventureplex.com'][1]===4,'native Update URI filter registered with four arguments');
yes(isset($hooks['plugins_api'])&&$hooks['plugins_api'][1]===3,'release details filter registered');
yes(isset($hooks['network_admin_menu'])&&isset($hooks['admin_post_gapnext_update_feed'])&&isset($hooks['admin_post_gapnext_check_updates']),'network-aware settings and protected actions registered');
yes(is_wp_error(Updater::release())&&!$requests,'unconfigured installation performs no HTTP request');
$feed='https://updates.example/releases/update.json';$opts[Updater::OPTION]=$feed;
$manifest=['slug'=>Updater::SLUG,'version'=>'3.5.1','requires'=>'6.4','requires_php'=>'7.4','download_url'=>'https://updates.example/releases/generations-event-planner-next-3.5.1.zip','sections'=>['changelog'=>'<p>Changes</p><script>alert(1)</script>']];
yes(is_array(Updater::validate($manifest,$feed)),'valid HTTPS release accepted');
foreach(['http://updates.example/update.json','https://admin:password@updates.example/update.json','https://127.0.0.1/update.json','https://10.0.0.1/update.json','https://localhost/update.json','https://updates.example/update.json#fragment',"https://updates.example/\nheader"] as $url)yes(Updater::secure_url($url)===false,'reject unsafe URL '.str_replace("\n",' ',$url));
foreach([['slug'=>'different-plugin'],['version'=>'tomorrow'],['download_url'=>'http://updates.example/plugin.zip'],['download_url'=>'https://other.example/plugin.zip'],['requires_php'=>'<script>'],['download_url'=>['unexpected']]] as $change)yes(is_wp_error(Updater::validate(array_replace($manifest,$change),$feed)),'reject invalid release field '.key($change));
$remote=['code'=>200,'body'=>json_encode($manifest)];$release=Updater::release();yes(!is_wp_error($release)&&count($requests)===1,'valid feed fetched');
yes(strpos($release['sections']['changelog'],'<script>')===false,'release HTML sanitized');
Updater::release();yes(count($requests)===1,'cached release avoids duplicate network requests');
$entry=reset($cache);yes($entry['ttl']===6*HOUR_IN_SECONDS,'valid metadata cached for six hours');
$offer=Updater::offer(false,[],$basename,[]);yes($offer['version']==='3.5.1'&&$offer['package']===$manifest['download_url'],'new version and package supplied to native update flow');
yes(!array_key_exists('autoupdate',$offer),'does not force automatic installation');
yes(!array_key_exists('tested',$offer),'does not claim an unverified WordPress tested version');
yes(Updater::offer('other',[],'some-other-plugin/plugin.php',[])==='other','other plugins are untouched');
$info=Updater::information(false,'plugin_information',(object)['slug'=>Updater::SLUG]);yes(is_object($info)&&$info->version==='3.5.1'&&$info->download_url===$manifest['download_url'],'native release-details response includes the download and version');
yes(Updater::information('existing','query_plugins',(object)['slug'=>Updater::SLUG])==='existing','unrelated API actions untouched');
yes(Updater::information('existing','plugin_information',(object)['slug'=>'other'])==='existing','unrelated plugin information untouched');
$remote=['code'=>200,'body'=>'not-json'];yes(is_wp_error(Updater::release(true)),'malformed JSON fails closed');$n=count($requests);Updater::release();yes(count($requests)===$n,'failed check is cached');$entry=reset($cache);yes($entry['ttl']===15*MINUTE_IN_SECONDS,'failed checks back off for fifteen minutes');
$remote=new WP_Error('timeout','timeout');yes(is_wp_error(Updater::release(true)),'HTTP transport failure handled');
$remote=['code'=>302,'body'=>'redirect'];yes(is_wp_error(Updater::release(true)),'redirect not accepted');
$remote=['code'=>503,'body'=>'unavailable'];yes(Updater::offer(false,[],$basename,[])===false,'unavailable feed offers no update');
$remote=['code'=>200,'body'=>json_encode(array_replace($manifest,['version'=>'3.5.0']))];$current=Updater::release(true);$offer=Updater::offer(false,[],$basename,[]);yes($offer['version']===GAPNEXT_VERSION,'same-version metadata lets WordPress record no-update status');
$remote=['code'=>200,'body'=>json_encode(array_replace($manifest,['version'=>'3.4.0']))];Updater::release(true);yes(version_compare(Updater::offer(false,[],$basename,[])['version'],GAPNEXT_VERSION,'<'),'older feed remains older so core does not offer a downgrade');
$last=end($requests);yes($last[1]['sslverify']===true&&$last[1]['redirection']===0&&$last[1]['limit_response_size']===131072,'TLS validation, redirect blocking and bounded responses enforced');
yes(!isset($last[1]['body'])&&!isset($last[1]['cookies'])&&!isset($last[1]['headers']['Authorization'])&&$last[0]===$feed,'feed request includes no inquiry payload, cookies, credentials or site URL');
ob_start();Updater::page();$page=ob_get_clean();yes($page==='','unauthorized users cannot view settings');
try{Updater::save();yes(false,'unauthorized save denied');}catch(Exception $e){yes(strpos($e->getMessage(),'Denied:')===0&&!isset($GLOBALS['nonce_checked']),'unauthorized save blocked before mutation');}
try{Updater::check();yes(false,'unauthorized forced check denied');}catch(Exception $e){yes(strpos($e->getMessage(),'Denied:')===0,'unauthorized forced check blocked');}
$caps=true;ob_start();Updater::page();$page=ob_get_clean();yes(strpos($page,'Installed version: 3.5.0')!==false&&strpos($page,'Check for updates')!==false,'authorized settings show version, feed and check control');
Updater::upgraded(null,['action'=>'update','type'=>'plugin','plugins'=>[$basename]]);yes(!$cache,'own successful update hook invalidates release cache');
echo "\n$tests updater checks passed. HTTP calls intercepted; no live updates.\n";
