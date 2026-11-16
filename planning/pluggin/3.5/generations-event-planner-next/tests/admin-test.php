<?php
if(PHP_SAPI!=='cli'||!getenv('GAPNEXT_WP_ROOT'))exit(1);
require rtrim(getenv('GAPNEXT_WP_ROOT'),'/').'/wp-load.php';
require_once ABSPATH.'wp-admin/includes/template.php';
use Generations\PlannerNext\Admin;use Generations\PlannerNext\Catalog;use Generations\PlannerNext\Plugin;use Generations\PlannerNext\Engine;
if(!defined('WP_ENVIRONMENT_TYPE')||WP_ENVIRONMENT_TYPE!=='local')throw new Exception('Isolated local fixture only.');
$tests=0;function aok($v,$label){global $tests;$tests++;if(!$v)throw new Exception('FAIL '.$label);echo 'PASS '.$label."\n";}
add_filter('pre_wp_mail',function(){return true;},1000);add_filter('gapnext_dns_records',function($v,$domain,$type){return $type===DNS_MX?[['target'=>'mail.example.test']]:[];},10,3);delete_transient('gapnext_dns_'.hash('sha256','example.com'));
$beforePrices=get_option('gapnext_price_overrides',null);$beforeFiles=get_option('gapnext_email_attachments',null);$beforeMode=get_option('gapnext_test_mode','yes');$ids=[];$paths=[];
try{
 delete_option('gapnext_price_overrides');delete_option('gapnext_email_attachments');update_option('gapnext_test_mode','yes');
 $raw=[];foreach(Catalog::fields() as $key=>$v)$raw[$key]=number_format($v['default']/100,2,'.','');
 $parsed=Admin::parse_prices($raw);aok(!is_wp_error($parsed)&&$parsed['bowling.shoes']===350,'all default rates parse to integer cents');
 foreach(['-1','1.001','1e2','NaN',' 1','1,000.00',[],true,'','10000000.01'] as $bad){$x=$raw;$x['bowling.shoes']=$bad;aok(is_wp_error(Admin::parse_prices($x)),'reject malformed price '.json_encode($bad));}
 $x=$raw;unset($x['food.salad']);aok(is_wp_error(Admin::parse_prices($x)),'missing rate prevents a partial save');
 $x=$raw;$x['food.salad']='0.00';aok(Admin::parse_prices($x)['food.salad']===0,'zero price remains a valid explicit value');
 $raw['unknown.path']='1.00';aok(!isset(Admin::parse_prices($raw)['unknown.path']),'unknown keys cannot enter the catalog');
 $input=Plugin::sample();$input['attractions']['bowling']='yes';$input['attractions']['axe']='yes';$old=Plugin::save($input);aok(is_int($old),'baseline valid inquiry saves before price change');$saved=get_post_meta($old,'_gapnext_result',true);$revision=Catalog::revision();
 $changed=$parsed;$changed['bowling.shoes']=450;$changed['rooms.upper_extra']=10900;update_option('gapnext_price_overrides',$changed,false);
 $next=(new Engine())->recommend($input);aok($next['dates'][0]['recommendation']['total_cents']===38000,'updated shoes affect new fully priced recommendation');
 aok(get_post_meta($old,'_gapnext_result',true)===$saved,'price edit preserves all saved historical inquiry data');
 aok(Catalog::revision()!==$revision&&$next['pricing_revision']!==$saved['pricing_revision'],'price revision follows effective catalog');
 $room=$input;$room['private_room']='yes';$r=(new Engine())->recommend($room,['bowling_hours'=>1,'room'=>'upper','room_hours'=>4]);$lines=$r['dates'][0]['recommendation']['items'];$extra=array_values(array_filter($lines,function($l){return $l['label']==='Explicitly requested extra room hour';}));aok(count($extra)===1&&$extra[0]['unit_cents']===10900,'room extra-hour control feeds calculation');
 update_option('gapnext_price_overrides',['bowling.shoes'=>'999','unknown.path'=>500,'food.salad'=>-1]);aok(Catalog::all()['bowling']['shoes']===350&&Catalog::all()['food']['salad']===2499,'invalid stored values fall back to typed defaults');
 aok(count(Admin::attachments())===2&&is_file(Admin::attachments()[0])&&is_file(Admin::attachments()[1]),'bundled files remain available without custom selections');
 $uploads=wp_upload_dir();wp_mkdir_p($uploads['path']);
 foreach(['menu'=>GAPNEXT_DIR.'menus/Group_Catering_Menu_2026.pdf','pricing'=>GAPNEXT_DIR.'menus/Attraction_Prices_Poster.png'] as $slot=>$src){$path=$uploads['path'].'/admin-test-'.$slot.'.'.pathinfo($src,PATHINFO_EXTENSION);copy($src,$path);$paths[]=$path;$ids[$slot]=wp_insert_attachment(['post_title'=>'Test '.$slot,'post_mime_type'=>$slot==='menu'?'application/pdf':'image/png','post_status'=>'inherit'],$path);}
 update_option('gapnext_email_attachments',$ids,false);$files=Admin::attachments();aok($files===$paths,'custom menu and pricing resolve to local Media Library files');
 $captured=[];add_filter('pre_wp_mail',function($result,$args)use(&$captured){$captured[]=$args;return true;},1001,2);update_option('gapnext_test_mode','no');$new=Plugin::save($input);aok(count($captured)===2&&$captured[1]['attachments']===$paths,'customer email delivery uses selected attachments');update_option('gapnext_test_mode','yes');
 aok(is_wp_error(Admin::attachment_path($new)),'inquiry post cannot masquerade as attachment');
 $outside=wp_insert_attachment(['post_title'=>'Outside','post_mime_type'=>'application/pdf']);update_attached_file($outside,GAPNEXT_DIR.'menus/Group_Catering_Menu_2026.pdf');aok(is_wp_error(Admin::attachment_path($outside)),'server path outside uploads is rejected');wp_delete_post($outside,true);
 $fake=$uploads['path'].'/fake.pdf';file_put_contents($fake,'Not a PDF');$fakeId=wp_insert_attachment(['post_title'=>'Fake','post_mime_type'=>'application/pdf'],$fake);aok(is_wp_error(Admin::attachment_path($fakeId)),'fake PDF content is rejected');wp_delete_attachment($fakeId,true);@unlink($fake);
 $big=$uploads['path'].'/big.pdf';$handle=fopen($big,'wb');fwrite($handle,'%PDF-');ftruncate($handle,10*1024*1024+1);fclose($handle);$bigId=wp_insert_attachment(['post_title'=>'Big','post_mime_type'=>'application/pdf'],$big);aok(is_wp_error(Admin::attachment_path($bigId)),'oversized attachment rejected');wp_delete_attachment($bigId,true);@unlink($big);
 wp_delete_attachment($ids['menu'],true);unset($ids['menu']);aok(Admin::attachments()[0]===GAPNEXT_DIR.'menus/Group_Catering_Menu_2026.pdf','deleted custom menu safely falls back to bundled menu');
 wp_set_current_user(0);ob_start();Admin::page();aok(ob_get_clean()==='','anonymous visitor cannot render maintenance page');
 $user=get_user_by('login','planner_admin');wp_set_current_user($user->ID);ob_start();Admin::page();$html=ob_get_clean();aok(strpos($html,'Save recommendation prices')!==false&&strpos($html,'Save email attachments')!==false,'administrator sees separate save controls');
 $form=Plugin::render_form();aok(strpos($form,'>Yes</span>')!==false&&strpos($form,'>No</span>')!==false&&strpos($form,'>Open to recommendations</span>')!==false&&strpos($form,'Yes, include it')===false,'short attraction labels render with original yes/no/open values');
 aok(strpos($form,'value="open"')!==false&&strpos($form,'value="yes"')!==false,'stored attraction values stay compatible');
 echo "\n$tests administration checks passed; all mail intercepted.\n";
}finally{
 foreach($ids as $id)wp_delete_attachment($id,true);foreach($paths as $p)@unlink($p);
 if($beforePrices===null)delete_option('gapnext_price_overrides');else update_option('gapnext_price_overrides',$beforePrices,false);
 if($beforeFiles===null)delete_option('gapnext_email_attachments');else update_option('gapnext_email_attachments',$beforeFiles,false);update_option('gapnext_test_mode',$beforeMode);
}
