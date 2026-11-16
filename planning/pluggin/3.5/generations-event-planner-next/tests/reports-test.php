<?php
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
if(!getenv('GAPNEXT_WP_ROOT')){fwrite(STDERR,"Set GAPNEXT_WP_ROOT to an isolated test WordPress.\n");exit(1);}
require rtrim(getenv('GAPNEXT_WP_ROOT'),'/').'/wp-load.php';
use Generations\PlannerNext\Plugin;use Generations\PlannerNext\Reports;use Generations\PlannerNext\Engine;
if(!defined('WP_ENVIRONMENT_TYPE')||WP_ENVIRONMENT_TYPE!=='local')throw new Exception('Isolated local test required.');
$tests=0;$ids=[];function report_ok($v,$label){global $tests;$tests++;if(!$v)throw new Exception('FAIL '.$label);echo 'PASS '.$label."\n";}
$zone=new DateTimeZone(Reports::ZONE);$clock=new DateTimeImmutable('2026-11-02 07:00:00',$zone);
$make=function($type,$n,$received,$date='2026-11-10',$test=false)use(&$ids){$s=Plugin::sample();$s['event_type']=$type;$s['adults']=$n;$s['company']='<img src=x onerror=alert(1)>';$s['dates']=[$date,'2026-12-01'];$s['attractions']['bowling']='yes';$id=Plugin::save($s);if(is_wp_error($id))throw new Exception($id->get_error_message());$ids[]=$id;wp_update_post(['ID'=>$id,'post_date'=>$received,'post_date_gmt'=>$received]);update_post_meta($id,'_gapnext_test',$test?'yes':'no');return $id;};
$isolate=function($query)use(&$ids){if($query->get('post_type')===Plugin::TYPE&&$query->get('date_query'))$query->set('post__in',$ids?:[0]);};add_action('pre_get_posts',$isolate);
update_option('gapnext_test_mode','yes');
try{
    $p=Reports::period('daily',$clock);report_ok($p['start']->format('Y-m-d H:i')==='2026-11-01 00:00'&&$p['end']->format('Y-m-d H:i')==='2026-11-02 07:00','daily report covers current month through report time');
    report_ok($p['end']->getTimestamp()-$p['start']->getTimestamp()===32*3600,'month-to-date period includes fall DST hour and current morning');
    $p=Reports::period('weekly',$clock);report_ok($p['start']->format('Y-m-d')==='2026-10-26'&&$p['end']->format('Y-m-d')==='2026-11-02','Monday weekly report covers previous Monday through Sunday');
    $p=Reports::period('daily',new DateTimeImmutable('2027-03-15 07:00',$zone));report_ok($p['end']->getTimestamp()-$p['start']->getTimestamp()===(14*24+6)*3600,'month-to-date period spans spring DST correctly');
    report_ok((new DateTimeImmutable('@'.Reports::next_run(new DateTimeImmutable('2026-10-31 08:00',$zone))))->setTimezone($zone)->format('Y-m-d H:i T')==='2026-11-01 07:00 EST','next digest remains 7 AM across fall clock change');
    report_ok((new DateTimeImmutable('@'.Reports::next_run(new DateTimeImmutable('2027-03-13 08:00',$zone))))->setTimezone($zone)->format('Y-m-d H:i T')==='2027-03-14 07:00 EDT','next digest remains 7 AM across spring clock change');
    $birthday=$make('Birthday',8,'2026-11-01 04:00:00');
    $late=$make('Corporate or Team Event',30,'2026-11-01 12:00:00','2026-11-10');
    $early=$make('Corporate or Team Event',30,'2026-11-01 13:00:00','2026-11-05');
    $small=$make('Corporate or Team Event',10,'2026-11-02 04:59:59','2026-11-04');
    $legacy=$make('Other',5,'2026-11-01 14:00:00');$r=get_post_meta($legacy,'_gapnext_result',true);unset($r['inquiry']['event_type']);update_post_meta($legacy,'_gapnext_result',wp_slash($r));
    $before=$make('Birthday',11,'2026-11-01 03:59:59');$after=$make('Birthday',12,'2026-11-02 12:00:00');$test=$make('Birthday',99,'2026-11-01 15:00:00','2026-11-10',true);
    $report=Reports::collect('daily',$clock);$got=array_column($report['rows'],'id');
    report_ok(count($got)===5&&in_array($birthday,$got,true)&&in_array($small,$got,true),'daily report includes both exact lower bound and last instant of period');
    report_ok(!in_array($before,$got,true)&&!in_array($after,$got,true),'daily report excludes both outside boundaries');
    report_ok(!in_array($test,$got,true),'test inquiries excluded from reports');
    report_ok($got===[$birthday,$early,$late,$small,$legacy],'sort is event type, descending guest count, then earliest requested event date');
    report_ok(array_sum(array_column($report['rows'],'guests'))===83,'alternative event dates do not duplicate guest totals');
    report_ok($report['rows'][4]['type']==='Unclassified (earlier inquiry)','older inquiries are clearly marked unclassified');
    $html=Reports::html($report);report_ok(strpos($html,'<img src=x')===false&&strpos(Reports::xlsx($report),'&lt;img')!==false,'report and spreadsheet escape guest-supplied content');
    report_ok(strpos($html,'5 submitted inquiries · 83 requested guests')!==false&&strpos($html,'not confirmed bookings')!==false,'report has totals and distinguishes inquiries from confirmed events');
    $empty=Reports::collect('daily',new DateTimeImmutable('2028-01-01 07:00',$zone));report_ok(!$empty['rows']&&strpos(Reports::html($empty),'No submitted inquiries')!==false,'zero-inquiry day still produces a useful report');
    $sent=[];$capture=function($result,$args)use(&$sent){$sent[]=$args;return true;};add_filter('pre_wp_mail',$capture,1000,2);
    report_ok(Reports::send('daily',$clock)===false&&count($sent)===0,'test mode suppresses digest emails');
    update_option('gapnext_test_mode','no');$dailyKey='gapnext_digest_daily_20261102';$weeklyKey='gapnext_digest_weekly_20261026';delete_option($dailyKey);delete_option($weeklyKey);
    report_ok(Reports::send('daily',$clock)&&count($sent)===1,'live path sends one intercepted daily digest');
    report_ok($sent[0]['to']===Reports::TO&&strpos($sent[0]['message'],'5 submitted inquiries')!==false,'digest goes only to the approved events inbox with expected rows');
    report_ok(Reports::send('daily',$clock)&&count($sent)===1,'accepted report is not sent twice for the same period');
    add_option($weeklyKey.'_lock',time(),'','no');report_ok(Reports::send('weekly',$clock)===false&&count($sent)===1,'concurrent report lock blocks duplicate send');delete_option($weeklyKey.'_lock');
    $fail=function(){return false;};add_filter('pre_wp_mail',$fail,1001,2);report_ok(Reports::send('weekly',$clock)===false&&get_option($weeklyKey)!=='accepted','failed digest is not marked accepted');
    report_ok(wp_next_scheduled('gapnext_retry_digest',['weekly','2026-11-02',1])!==false,'failed digest schedules a retry in 15 minutes');
    remove_filter('pre_wp_mail',$fail,1001);Reports::retry('weekly','2026-11-02',1);report_ok(get_option($weeklyKey)==='accepted','retry preserves the original weekly period and recovers delivery');
    Reports::ensure_schedule();$when=wp_next_scheduled(Reports::HOOK);Reports::ensure_schedule();report_ok($when&&wp_next_scheduled(Reports::HOOK)===$when,'initialization schedules one next 7 AM run without duplicates');
    $s=Plugin::sample();unset($s['event_type']);report_ok(!(new Engine())->validate($s)['valid'],'missing event type is rejected by server validation');
    $s['event_type']='Invented category';report_ok(!(new Engine())->validate($s)['valid'],'unknown event category is rejected');
    foreach(Engine::EVENT_TYPES as $type){$s['event_type']=$type;if(!(new Engine())->validate($s)['valid'])throw new Exception('Approved category rejected.');}report_ok(true,'all six approved event types are accepted');
    wp_set_current_user(0);ob_start();Reports::page();$page=ob_get_clean();report_ok($page==='','anonymous users cannot view private report dashboard');
    remove_filter('pre_wp_mail',$capture,1000);
}finally{
    remove_action('pre_get_posts',$isolate);
    update_option('gapnext_test_mode','yes');foreach($ids as $id)wp_delete_post($id,true);
    foreach(['gapnext_digest_daily_20261102','gapnext_digest_weekly_20261026'] as $key){delete_option($key);delete_option($key.'_lock');}
    foreach([1,2,3] as $attempt)wp_clear_scheduled_hook('gapnext_retry_digest',['weekly','2026-11-02',$attempt]);
}
echo "\n$tests report checks passed. All email intercepted locally.\n";
