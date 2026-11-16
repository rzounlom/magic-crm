<?php
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
// Run only against an isolated test WordPress with pre_wp_mail interception.
if(!getenv('GAPNEXT_WP_ROOT')){fwrite(STDERR,"Set GAPNEXT_WP_ROOT to an isolated test WordPress.\n");exit(1);}
require rtrim(getenv('GAPNEXT_WP_ROOT'),'/').'/wp-load.php';
use Generations\PlannerNext\Plugin;
if(!defined('WP_ENVIRONMENT_TYPE')||WP_ENVIRONMENT_TYPE!=='local')throw new Exception('Local test installation required.');
add_filter('pre_wp_mail',function(){return true;},999);
$tests=0;function wpok($v,$label){global $tests;$tests++;if(!$v)throw new Exception('FAIL '.$label);echo 'PASS '.$label."\n";}
$count=function(){return count(get_posts(['post_type'=>Plugin::TYPE,'post_status'=>'private','numberposts'=>-1]));};
update_option('gapnext_test_mode','yes');$before=$count();$invalid=Plugin::sample();unset($invalid['first_name']);$result=Plugin::save($invalid);
wpok(is_wp_error($result)&&$count()===$before,'incomplete inquiry does not save');
$input=Plugin::sample();$input['attractions']['bowling']='yes';$input['attractions']['axe']='yes';$id=Plugin::save($input);wpok(is_int($id)&&$count()===$before+1,'complete inquiry saved privately');
$p=get_post($id);wpok($p->post_status==='private','inquiry not public');$data=get_post_meta($id,'_gapnext_result',true);
wpok($data['dates'][0]['recommendation']['total_cents']===37000,'WordPress saved calculated recommendation');
$mail=get_post_meta($id,'_gapnext_mail',true);wpok($mail['internal']==='not_sent'&&$mail['customer']==='not_sent','test mode suppresses both emails');
$captured=[];add_filter('pre_wp_mail',function($r,$args)use(&$captured){$captured[]=$args;return true;},1000,2);
update_option('gapnext_test_mode','no');$live=Plugin::save($input);update_option('gapnext_test_mode','yes');
wpok(count($captured)===2,'live path makes exactly two intercepted send attempts');
wpok($captured[0]['to']==='events@generations-adventureplex.com','internal recommendation goes to approved recipient');
wpok(strpos($captured[0]['message'],'$370.00')!==false&&strpos($captured[0]['message'],'PROPOSED ITINERARY')!==false,'internal email includes itemized total and itinerary');
wpok($captured[1]['to']===$input['email']&&strpos($captured[1]['message'],'$370.00')===false,'customer acknowledgment contains no calculated quote');
wpok(count($captured[1]['attachments'])===2&&file_exists($captured[1]['attachments'][0])&&file_exists($captured[1]['attachments'][1]),'current catering menu and attraction poster attached');
wpok(strpos($captured[1]['message'],'shoe price')===false&&strpos($captured[1]['message'],'$4')===false&&strpos($captured[1]['message'],'A little inspiration, attached')!==false,'acknowledgment introduces reference attachments without obsolete shoe-price correction');
// Exercise retry behavior with local interception; no transport is contacted.
$method=new ReflectionMethod(Plugin::class,'deliver');$method->setAccessible(true);
update_option('gapnext_test_mode','no');update_post_meta($live,'_gapnext_mail',['internal'=>'failed','customer'=>'accepted']);
$sent=count($captured);add_option('gapnext_lock_mail_'.$live,time(),'','no');$method->invoke(null,$live);
wpok(count($captured)===$sent,'an existing mail lock prevents a concurrent duplicate send');delete_option('gapnext_lock_mail_'.$live);
$method->invoke(null,$live);wpok(count($captured)===$sent+1&&$captured[$sent]['to']==='events@generations-adventureplex.com','retry sends failed internal mail without duplicating accepted customer acknowledgment');
$method->invoke(null,$live);wpok(count($captured)===$sent+1,'accepted emails are not resent on another retry');
update_option('gapnext_test_mode','yes');update_post_meta($live,'_gapnext_mail',['internal'=>'failed','customer'=>'failed']);$method->invoke(null,$live);
wpok(count($captured)===$sent+1,'test mode blocks retry delivery as well as initial delivery');
update_option('gapnext_test_mode','no');$forceFailure=function(){return false;};add_filter('pre_wp_mail',$forceFailure,1001,2);
$failed=Plugin::save($input);$failedStatus=get_post_meta($failed,'_gapnext_mail',true);
wpok(is_int($failed)&&get_post_meta($failed,'_gapnext_result',true)&&$failedStatus['internal']==='failed'&&$failedStatus['customer']==='failed','transport failure preserves the inquiry and records both failed email paths');
remove_filter('pre_wp_mail',$forceFailure,1001);$method->invoke(null,$failed);$recovered=get_post_meta($failed,'_gapnext_mail',true);
wpok($recovered['internal']==='accepted'&&$recovered['customer']==='accepted','a failed transport can be retried successfully');update_option('gapnext_test_mode','yes');
wp_set_current_user(0);wpok(!current_user_can('manage_options'),'anonymous visitor cannot access admin recommendations');
$subscriber=wp_insert_user(['user_login'=>'planner_subscriber','user_pass'=>'local-test-only-42','user_email'=>'subscriber@example.test','role'=>'subscriber']);if(is_wp_error($subscriber))$subscriber=get_user_by('login','planner_subscriber')->ID;
wp_set_current_user($subscriber);wpok(!current_user_can('edit_post',$id),'subscriber cannot edit inquiry');wpok(!current_user_can('read_private_posts'),'subscriber has no private-post listing capability');
echo "\n$tests WordPress integration checks passed. No external mail sent.\n";
