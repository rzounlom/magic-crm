<?php
/** Standalone regression checks; no network, WordPress database or email delivery. */
namespace Generations\PlannerNext {
    final class Staff {
        public static function unfinished($start,$end){return [];}
        public static function missing($d){return [];}
        public static function review_url($id){return 'https://example.test/draft/'.$id;}
    }
}
namespace {
if(PHP_SAPI!=='cli')exit;
define('ABSPATH',__DIR__.'/');define('MINUTE_IN_SECONDS',60);
$options=['gapnext_test_mode'=>'no'];$mail=[];$scheduled=[];$posts=[];$metadata=[];
function esc_html($v){return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');}
function esc_url($v,$protocols=[]){return esc_html($v);}
function wp_json_encode($v,$flags=0){return json_encode($v,$flags);}
function wp_check_invalid_utf8($v){return $v;}
function wp_date($format,$stamp,$zone){return (new \DateTimeImmutable('@'.$stamp))->setTimezone($zone)->format($format);}
function admin_url($url){return 'https://example.test/wp-admin/'.$url;}
function get_option($key,$default=false){return $GLOBALS['options'][$key]??$default;}
function update_option($key,$value,$autoload=false){$GLOBALS['options'][$key]=$value;return true;}
function add_option($key,$value,$deprecated='',$autoload=''){if(isset($GLOBALS['options'][$key]))return false;$GLOBALS['options'][$key]=$value;return true;}
function delete_option($key){unset($GLOBALS['options'][$key]);}
function get_posts($args){return array_keys($GLOBALS['posts']);}
function get_post($id){return $GLOBALS['posts'][$id];}
function get_post_meta($id,$key,$single=true){return $GLOBALS['metadata'][$id][$key]??'';}
function wp_generate_password($n,$a=false,$b=false){return substr(bin2hex(random_bytes($n)),0,$n);}
function sanitize_file_name($name){return basename($name);}
function wp_mail($to,$subject,$message,$headers,$attachments){$GLOBALS['mail'][]=compact('to','subject','message','headers','attachments');return empty($GLOBALS['fail_mail']);}
function wp_next_scheduled($hook,$args=[]){return false;}
function wp_schedule_single_event($time,$hook,$args=[]){$GLOBALS['scheduled'][]=compact('time','hook','args');}
function current_time($type){return '2026-11-04 07:00:00';}
require __DIR__.'/test-helpers.php';
require __DIR__.'/../includes/emails.php';
require __DIR__.'/../includes/reports.php';
require __DIR__.'/../includes/xlsx.php';
use Generations\PlannerNext\Engine;use Generations\PlannerNext\Plugin;use Generations\PlannerNext\Itinerary;use Generations\PlannerNext\Emails;use Generations\PlannerNext\Reports;
foreach([50,56] as $cap)foreach(range(1,999) as $n){$sizes=Engine::group_sizes($n,$cap);if(array_sum($sizes)!==$n||max($sizes)>$cap||max($sizes)-min($sizes)>1)throw new Exception('Unbalanced or over-capacity groups');}
ok(true,'all guest counts 1–999 split evenly within both existing capacity limits');
ok(Engine::group_sizes(70,50)===[35,35]&&Engine::group_sizes(71,50)===[36,35],'approved 70- and 71-guest examples');
ok(Engine::lanes(80)===14,'regular bowling lane charges match balanced 40/40 cohorts');
$r=run_case(70,['bowling','axe','arcade'],'2026-11-06',['food'=>'yes','time'=>'19:00']);$p=main_plan($r);
$groups=[];foreach($p['itinerary'] as $slot)if($slot['label']==='Bowling')$groups[]=$slot['group'];
ok(count($groups)===2&&strpos(implode(' ',$groups),'50 guests')===false&&substr_count(implode(' ',$groups),'35 guests')===2,'schedule uses 35/35 groups');
$before=$p['itinerary'];$compact=Itinerary::compact($before);$html=Emails::internal($r,123);$text=Plugin::report_text($r);
ok($before===$p['itinerary'],'presentation leaves exact activity schedule unchanged');
ok(count($compact['rows'])===4,'70-person dining, two rotations and arcade compact to four rows');
ok(strpos($html,'colspan="2"')!==false&&strpos($html,'Group A — 35 guests</th>')!==false,'shared rows span group columns and counts are in headings');
ok(strpos($html,'Axe briefing')!==false&&strpos($html,'Bowling shoes')!==false,'preparation details remain visible below the table');
foreach($before as $slot)if(in_array($slot['label'],['Bowling check-in & shoes','Axe Throwing','Axe Check-In & Safety Briefing'],true))if(strpos($html,$slot['start'])===false||strpos($html,$slot['end'])===false)throw new Exception('Missing exact prep/play time');
ok(true,'exact shoe, briefing and axe play times remain visible');
ok(strpos($html,'Qty × rate')!==false&&substr_count($html,'70 guests · 70 adults / 0 children')>=count($r['dates'][0]['alternatives']),'each HTML alternative has quantities, rates and guest counts');
foreach($r['dates'][0]['alternatives'] as $alt){$sum=array_sum(array_map(function($i){return $i['subtotal_cents']+$i['tax_cents'];},$alt['items']));if($sum!==$alt['total_cents']||strpos($text,Engine::money($sum))===false)throw new Exception('Alternative total mismatch');}
ok(true,'every alternative reconciles to its displayed line items and tax');
$single=Itinerary::html(main_plan(run_case(10,['bowling']))['itinerary']);ok(strpos($single,'Group 1')===false&&strpos($single,'Activity</th>')!==false,'single group hides unnecessary group labels');
$hostile=$before;$hostile[0]['label']='<script>alert(1)</script>';ok(strpos(Itinerary::html($hostile),'<script>')===false,'itinerary escapes supplied text');
$z=new \DateTimeZone(Reports::ZONE);$clock=new \DateTimeImmutable('2026-11-04 07:00:00',$z);$period=Reports::period('daily',$clock);
ok($period['start']->format('Y-m-d H:i')==='2026-11-01 00:00'&&$period['end']==$clock,'daily report covers month start through current report time');
$first=Reports::period('daily',new \DateTimeImmutable('2026-12-01 07:00:00',$z));ok($first['start']->format('Y-m-d')==='2026-12-01','monthly running report resets on the first');
$weekly=Reports::period('weekly',new \DateTimeImmutable('2026-11-02 07:00',$z));ok($weekly['start']->format('Y-m-d')==='2026-10-26'&&$weekly['end']->format('Y-m-d')==='2026-11-02','weekly range remains previous Monday–Sunday');
foreach(['2026-11-01 04:00:00','2026-11-02 15:00:00','2026-11-04 11:59:59','2026-11-01 03:59:59','2026-11-04 12:00:00'] as $i=>$date){$id=$i+1;$posts[$id]=(object)['post_date_gmt'=>$date];$metadata[$id]=['_gapnext_test'=>'no','_gapnext_result'=>$r];}
$metadata[6]=['_gapnext_test'=>'yes','_gapnext_result'=>$r];$posts[6]=(object)['post_date_gmt'=>'2026-11-03 10:00:00'];
$report=Reports::collect('daily',$clock);ok(count($report['rows'])===3,'collect includes month-to-date rows and excludes prior month, cutoff and tests');
$sheet=Reports::sheets($report);ok($sheet[0]['name']==='Summary'&&$sheet[0]['rows'][2][1]===3&&$sheet[0]['rows'][3][1]===210,'Excel summary counts submitted inquiries and guests once');
file_put_contents('/tmp/gap-340-report.xlsx',Reports::xlsx($report));file_put_contents('/tmp/gap-340-email.html',$html);
ok(Reports::send('daily',$clock)&&count($mail)===1,'daily report sends through intercepted mail');
ok(Reports::send('daily',$clock)&&count($mail)===1,'same-day retry does not duplicate delivery');
ok(Reports::send('daily',$clock->modify('+1 day'))&&count($mail)===2,'next day sends again within the same month');
$GLOBALS['fail_mail']=true;Reports::send('daily',$clock->modify('+2 days'));$retry=end($scheduled);ok($retry['args']===['daily','2026-11-06 07:00:00',1],'failure retries with original date and exact cutoff');
$GLOBALS['fail_mail']=false;Reports::retry(...$retry['args']);ok(get_option('gapnext_digest_daily_20261106')==='accepted','retry recovers and marks original daily send accepted');
$options['gapnext_test_mode']='yes';$sent=count($mail);ok(Reports::send('daily',$clock->modify('+3 days'))===false&&count($mail)===$sent,'test mode still suppresses report emails');
echo "\n$tests refinement checks passed. All email intercepted; no external side effects.\n";
}
