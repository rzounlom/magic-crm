<?php
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
if(!getenv('GAPNEXT_WP_ROOT')){fwrite(STDERR,"Set GAPNEXT_WP_ROOT to an isolated test WordPress.\n");exit(1);}
require rtrim(getenv('GAPNEXT_WP_ROOT'),'/').'/wp-load.php';
use Generations\PlannerNext\Plugin;use Generations\PlannerNext\EmailDomain;
if(!defined('WP_ENVIRONMENT_TYPE')||WP_ENVIRONMENT_TYPE!=='local')throw new Exception('Local test required.');
$tests=0;$ids=[];$lookups=0;$sent=0;function email_ok($v,$label){global $tests;$tests++;if(!$v)throw new Exception('FAIL '.$label);echo 'PASS '.$label."\n";}
$records=[
 'gmail.com'=>[DNS_MX=>[['type'=>'MX','target'=>'mail.gmail.test']]],
 'gmial.com'=>[DNS_MX=>[['type'=>'MX','target'=>'mail.gmial.test']]],
 'company.example'=>[DNS_MX=>[['type'=>'MX','target'=>'mail.company.test']]],
 'null.example'=>[DNS_MX=>[['type'=>'MX','target'=>'.']],DNS_A=>[['ip'=>'192.0.2.1']]],
 'address.example'=>[DNS_MX=>[],DNS_A=>[['type'=>'A','ip'=>'192.0.2.1']],DNS_AAAA=>[]],
 'ipv6.example'=>[DNS_MX=>[],DNS_A=>[],DNS_AAAA=>[['type'=>'AAAA','ipv6'=>'2001:db8::1']]],
 'absent.example'=>[DNS_MX=>[],DNS_A=>[],DNS_AAAA=>[]],
 'temporary.example'=>[DNS_MX=>false],
 'fallback-error.example'=>[DNS_MX=>[],DNS_A=>false,DNS_AAAA=>[]],
 'cname-only.example'=>[DNS_MX=>[],DNS_A=>[['type'=>'CNAME','target'=>'unresolved.example']],DNS_AAAA=>[]]
];
$dns=function($old,$domain,$type)use(&$records,&$lookups){$lookups++;return $records[$domain][$type]??[];};add_filter('gapnext_dns_records',$dns,10,3);
$mail=function()use(&$sent){$sent++;return true;};add_filter('pre_wp_mail',$mail,1000);
foreach(array_keys($records) as $d)delete_transient('gapnext_dns_'.hash('sha256',$d));
update_option('gapnext_test_mode','yes');
try{
 $n=$lookups;$r=EmailDomain::validate('alex@gmial.com');email_ok($r['status']==='suggestion'&&$r['suggested_domain']==='gmail.com'&&$lookups===$n,'Gmail typo prompts correction before DNS lookup');
 email_ok(EmailDomain::validate('alex@gamil.com')['suggested_domain']==='gmail.com','second common Gmail typo recognized');
 email_ok(EmailDomain::validate('alex@outlok.com')['suggested_domain']==='outlook.com','Outlook typo recognized without restricting business domains');
 email_ok(EmailDomain::validate('not-an-email')['status']==='invalid','invalid email format rejected');
 email_ok(EmailDomain::check('bad/host.example')['status']==='invalid','non-hostname input rejected before DNS');
 email_ok(EmailDomain::check('company.example')['status']==='valid','company domain with mail routing accepted');
 $n=$lookups;EmailDomain::check('company.example');email_ok($lookups===$n,'DNS results cached for repeat checks');
 email_ok(EmailDomain::validate('alex@GMAIL.COM')['status']==='valid','domain case normalized');
 email_ok(EmailDomain::check('null.example')['status']==='invalid','Null MX rejected even when the domain also has an address record');
 email_ok(EmailDomain::check('address.example')['status']==='valid','implicit IPv4 mail route accepted when explicit MX absent');
 email_ok(EmailDomain::check('ipv6.example')['status']==='valid','implicit IPv6 mail route accepted');
 email_ok(EmailDomain::check('absent.example')['status']==='invalid','domain with no mail or address records rejected');
 email_ok(EmailDomain::check('cname-only.example')['status']==='unknown','unresolved alias is flagged uncertain rather than falsely rejected');
 email_ok(EmailDomain::check('temporary.example')['status']==='unknown','temporary DNS error is not mislabeled invalid');
 email_ok(EmailDomain::check('fallback-error.example')['status']==='unknown','address-record lookup error preserves uncertainty');
 email_ok(EmailDomain::check('gmial.com','gmial.com')['status']==='valid','guest may explicitly retain a suggested-typo domain if it has real mail routing');
 email_ok(EmailDomain::check('gmial.com','different.example')['status']==='suggestion','confirmation applies only to the exact entered domain');
 $count=function(){return count(get_posts(['post_type'=>Plugin::TYPE,'post_status'=>'private','numberposts'=>-1]));};$before=$count();
 $s=Plugin::sample();$s['email']='alex@gmial.com';$r=Plugin::save($s);email_ok(is_wp_error($r)&&$r->get_error_code()==='gapnext_invalid_email'&&$count()===$before&&$sent===0,'unconfirmed typo cannot save an inquiry or send email');
 $s['email']='alex@absent.example';$r=Plugin::save($s);email_ok(is_wp_error($r)&&isset($r->get_error_data()['email'])&&$count()===$before&&$sent===0,'server-side no-mail-domain rejection occurs before save or email');
 $s['email']='alex@company.example';$id=Plugin::save($s);if(is_int($id))$ids[]=$id;email_ok(is_int($id)&&$count()===$before+1,'valid business domain saves normally');
 $s['email']='alex@gmial.com';$s['email_domain_confirmed']='gmial.com';$id=Plugin::save($s);if(is_int($id))$ids[]=$id;$saved=get_post_meta($id,'_gapnext_result',true);email_ok(is_int($id)&&$saved['inquiry']['email']==='alex@gmial.com','confirmation never silently rewrites the entered customer address');
 $s['email']='alex@temporary.example';unset($s['email_domain_confirmed']);$id=Plugin::save($s);if(is_int($id))$ids[]=$id;$saved=get_post_meta($id,'_gapnext_result',true);email_ok(is_int($id)&&get_post_meta($id,'_gapnext_email_domain',true)['status']==='unknown'&&strpos(implode(' ',$saved['dates'][0]['recommendation']['review']),'Email domain could not be verified')!==false,'DNS outage preserves the inquiry with an internal review flag');
 email_ok($sent===0,'test mode sends no emails during domain validation tests');
}finally{foreach($ids as $id)wp_delete_post($id,true);foreach(array_keys($records) as $d)delete_transient('gapnext_dns_'.hash('sha256',$d));remove_filter('gapnext_dns_records',$dns,10);remove_filter('pre_wp_mail',$mail,1000);}
echo "\n$tests email-domain checks passed. DNS and email use local test fixtures.\n";
