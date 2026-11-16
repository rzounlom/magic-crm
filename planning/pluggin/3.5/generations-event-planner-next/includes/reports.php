<?php
namespace Generations\PlannerNext;
if(!defined('ABSPATH'))exit;

/** Private inquiry digests. Dates are venue-local; persisted timestamps are UTC. */
final class Reports {
    const HOOK='gapnext_morning_reports';
    const ZONE='America/Indiana/Indianapolis';
    const TO='events@generations-adventureplex.com';
    public static function boot(){
        add_action('init',[__CLASS__,'ensure_schedule']);
        add_action(self::HOOK,[__CLASS__,'run']);
        add_action('gapnext_retry_digest',[__CLASS__,'retry'],10,3);
        add_action('admin_menu',function(){add_submenu_page('gapnext','Inquiry Reports','Inquiry Reports','manage_options','gapnext-reports',[__CLASS__,'page']);});
    }
    public static function next_run($now=null){
        $now=($now?:new \DateTimeImmutable('now'))->setTimezone(new \DateTimeZone(self::ZONE));
        $next=$now->setTime(7,0);return ($next<=$now?$next->modify('+1 day'):$next)->getTimestamp();
    }
    public static function ensure_schedule(){if(!wp_next_scheduled(self::HOOK))wp_schedule_single_event(self::next_run(),self::HOOK);}
    public static function period($kind,$now=null){
        $now=($now?:new \DateTimeImmutable('now'))->setTimezone(new \DateTimeZone(self::ZONE));
        $today=$now->setTime(0,0);
        if($kind==='daily')return ['start'=>$today->modify('first day of this month'),'end'=>$now];
        $end=$today->modify('-'.((int)$today->format('N')-1).' days');
        return ['start'=>$end->modify('-7 days'),'end'=>$end];
    }
    public static function collect($kind,$now=null){
        $period=self::period($kind,$now);$utc=new \DateTimeZone('UTC');
        $ids=get_posts(['post_type'=>Plugin::TYPE,'post_status'=>'private','numberposts'=>-1,'fields'=>'ids','orderby'=>'ID','order'=>'ASC','date_query'=>[['column'=>'post_date_gmt','after'=>$period['start']->setTimezone($utc)->format('Y-m-d H:i:s'),'before'=>$period['end']->setTimezone($utc)->format('Y-m-d H:i:s'),'inclusive'=>true]]]);
        $rows=[];
        foreach($ids as $id){
            if(get_post_meta($id,'_gapnext_test',true)==='yes')continue;
            $post=get_post($id);$stamp=\DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',$post->post_date_gmt,$utc);
            if(!$stamp||$stamp<$period['start']||$stamp>=$period['end'])continue;
            $result=get_post_meta($id,'_gapnext_result',true);$d=$result['inquiry']??null;if(!$d)continue;
            $dates=$d['dates'];sort($dates,SORT_STRING);
            $rows[]=['id'=>$id,'type'=>in_array($d['event_type']??'',Engine::EVENT_TYPES,true)?$d['event_type']:'Unclassified (earlier inquiry)','guests'=>(int)$d['guests'],'dates'=>$dates,'time'=>$d['time'],'duration'=>$d['duration']==='Other'?$d['other_hours'].' hours':$d['duration'],'company'=>$d['company'],'contact'=>$d['first_name'].' '.$d['last_name'],'email'=>$d['email'],'phone'=>$d['phone'],'data'=>$d,'submission'=>$result['submission']??get_post_meta($id,'_gapnext_submission',true),'received_stamp'=>$stamp->getTimestamp(),'received'=>$stamp->setTimezone(new \DateTimeZone(self::ZONE))->format('M j, g:i A')];
        }
        usort($rows,function($a,$b){$type=strcasecmp($a['type'],$b['type']);return $type?:($b['guests']<=>$a['guests'])?:strcmp($a['dates'][0],$b['dates'][0])?:($a['id']<=>$b['id']);});
        return ['kind'=>$kind,'start'=>$period['start'],'end'=>$period['end'],'rows'=>$rows,'drafts'=>Staff::unfinished($period['start'],$period['end'])];
    }
    private static function e($v){return esc_html((string)$v);}
    private static function preference($d,$answer,$draft=false){$names=[];$answered=0;foreach(Engine::ATTRACTIONS as $key=>$label){$choice=$d['attractions'][$key]??'';if(in_array($choice,['yes','no','open'],true))$answered++;if($choice===$answer)$names[]=$label;}return $names?implode(', ',$names):($draft?($answered?'None selected so far':'Not answered'):'None');}
    private static function answer($value){return in_array($value,['yes','no'],true)?ucfirst($value):'Not answered';}
    private static function who($source){return ($source['source']??'customer')==='staff'?(($source['staff_name']??'')?:'Staff member not identified').' (staff)':'Customer';}
    private static function date_time($stamp){return wp_date('Y-m-d H:i:s',$stamp,new \DateTimeZone(self::ZONE));}
    private static function display_time($time){$date=\DateTimeImmutable::createFromFormat('!H:i',(string)$time);return $date?$date->format('g:i A'):($time?:'Not provided');}
    private static function duration($d){return ($d['duration']??'')==='Other'?(!empty($d['other_hours'])?$d['other_hours'].' hours':'Other — duration not provided'):($d['duration']??'');}
    private static function phone_link($phone){$value=preg_replace('/[^0-9+]/','',(string)$phone);return $value?'tel:'.$value:'';}
    private static function email_link($email){if(!is_string($email)||!filter_var($email,FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$email))return '';$at=strrpos($email,'@');return 'mailto:'.rawurlencode(substr($email,0,$at)).'@'.substr($email,$at+1);}
    private static function link($text,$url){return $url?'<a style="color:#155e89" href="'.esc_url($url,['http','https','mailto','tel']).'">'.self::e($text).'</a>':self::e($text?:'Not provided');}
    private static function table($headers,$rows){
        $html='<div style="overflow-x:auto"><table width="100%" cellpadding="9" cellspacing="0" style="border-collapse:collapse;font-size:12px"><thead><tr style="background:#142b42;color:#fff">';foreach($headers as $header)$html.='<th scope="col" align="left" style="vertical-align:top">'.self::e($header).'</th>';$html.='</tr></thead><tbody>';
        foreach($rows as $row){$html.='<tr>';foreach($row as $cell)$html.='<td style="vertical-align:top;border-bottom:1px solid #dce3e9;overflow-wrap:anywhere">'.$cell.'</td>';$html.='</tr>';}
        return $html.'</tbody></table></div>';
    }
    public static function html($report){
        $rows=$report['rows'];$drafts=$report['drafts']??[];$title=$report['kind']==='daily'?'Month-to-date event inquiry report':'Weekly event inquiry report';$range=self::range($report);$total=array_sum(array_column($rows,'guests'));
        $html='<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:18px;background:#eef2f6;font:14px/1.5 Arial,sans-serif;color:#142b42"><div style="max-width:1200px;margin:auto;background:white;padding:22px;border-top:5px solid #ed671c"><p style="font-size:11px;letter-spacing:1px">GENERATIONS ADVENTUREPLEX · INTERNAL</p><h1 style="font-size:26px">'.self::e($title).'</h1><p>'.self::e($range).' · Venue local time</p><p style="padding:14px;background:#edf4fa"><strong>'.count($rows).' submitted inquiries · '.$total.' requested guests</strong><br>'.count($drafts).' retained unfinished staff inquiries — counted separately</p><p style="font-size:12px;color:#526477">These are requests, not confirmed bookings. Sorted by event type, guest count (largest first), then requested event date. Each inquiry and guest count is counted once. Full request details are in the attached Excel workbook.</p><h2 style="font-size:20px">Submitted inquiries</h2>';
        $table=[];foreach($rows as $r)$table[]=[self::e($r['type']),self::e(implode(', ',$r['dates'])),self::e(self::display_time($r['time'])),self::e($r['guests']),self::e($r['contact']),self::link($r['email'],self::email_link($r['email'])),self::link($r['phone'],self::phone_link($r['phone'])),self::e(self::who($r['submission']??[])),self::link('View Inquiry',admin_url('post.php?post='.$r['id'].'&action=edit'))];
        $html.=$table?self::table(['Event type','Event date(s)','Start time','Guests','Customer','Email','Phone','Submitted by','Record'],$table):'<p>No inquiries were received during this period.</p>';
        $html.='<h2 style="font-size:20px;margin-top:28px">Unfinished staff inquiries</h2>';$table=[];
        foreach($drafts as $r){$d=$r['data'];$name=trim(($d['first_name']??'').' '.($d['last_name']??''));$table[]=[self::e(wp_date('M j, g:i A',$r['started'],new \DateTimeZone(self::ZONE))),self::e($name?:'Not provided'),self::link($d['email']??'',self::email_link($d['email']??'')),self::link($d['phone']??'',self::phone_link($d['phone']??'')),self::e(($d['staff_name']??'')?:'Staff member not identified'),self::e(implode(', ',Staff::missing($d))?:'Required fields complete; not submitted'),self::link('Review Draft',Staff::review_url($r['id']))];}
        $html.=$table?self::table(['Started','Customer','Email','Phone','Staff member','Missing / invalid information','Record'],$table):'<p>No timed-out staff inquiries were captured during this period.</p>';
        return $html.'<p style="margin-top:24px;padding:14px;background:#f2f5f8"><strong>Excel attachment:</strong> Submitted Inquiries + Unfinished Staff Inquiries</p><p style="font-size:12px;color:#526477">Unfinished staff records send no customer email or recommendation. Stored unfinished records are deleted 14 days after timeout, so the unfinished list and its count include retained records only, not a full-month historical total. Test inquiries are excluded. Record links require WordPress administrator access.</p></div></body></html>';
    }
    private static function cell($value,$style=0,$link=''){return ['value'=>$value,'style'=>$link?5:$style,'link'=>$link];}
    public static function sheets($report){
        $headers=['Inquiry #','Received','Event type','Event purpose','Requested date','Alternative requested dates','Start time','Duration','Adults','Children','Total guests','Include','Open to Suggestions','Exclude','Food & Beverages','Craft Beverages','Private Room','Budget','Customer name','Organization','Email','Phone','Submitted by','Special requests','Referral','Full record'];$rows=[];
        foreach($report['rows'] as $r){$d=$r['data']??[];$date=$r['dates'][0]??'';$rows[]=[(int)$r['id'],self::cell(isset($r['received_stamp'])?Xlsx::date(self::date_time($r['received_stamp']),true):$r['received'],3),$r['type'],$d['description']??'',self::cell(Xlsx::date($date)??$date,2),implode(', ',array_slice($r['dates'],1)),self::cell(Xlsx::time($r['time'])??self::display_time($r['time']),6),$r['duration'],isset($d['adults'])?(int)$d['adults']:null,isset($d['children'])?(int)$d['children']:null,$r['guests'],self::preference($d,'yes'),self::preference($d,'open'),self::preference($d,'no'),self::answer($d['food']??''),self::answer($d['craft']??''),self::answer($d['private_room']??''),self::cell(($d['has_budget']??'')==='yes'&&isset($d['budget'])?$d['budget']/100:'No budget specified',4),$r['contact'],$r['company'],self::cell($r['email'],0,self::email_link($r['email'])),self::cell($r['phone'],0,self::phone_link($r['phone'])),self::who($r['submission']??[]),$d['comments']??'',$d['referral']??'',self::cell('View Inquiry',0,admin_url('post.php?post='.$r['id'].'&action=edit'))];}
        $draftHeaders=['Draft #','Status','Started','Last activity','Timed out','Delete after','Staff member','Customer name','Organization','Email','Phone','Event type','Event purpose','Requested date','Alternative requested dates','Start time','Duration','Adults','Children','Include','Open to Suggestions','Exclude','Food & Beverages','Craft Beverages','Private Room','Budget answer','Budget amount','Special requests','Referral','Missing / invalid information','Full record'];$draftRows=[];
        foreach($report['drafts']??[] as $r){$d=$r['data'];$dates=array_values(array_filter($d['dates']??[],function($date){return $date!=='';}));$first=$dates[0]??'';$draftRows[]=['D-'.$r['id'],'Timed out — not submitted',self::cell(Xlsx::date(self::date_time($r['started']),true),3),self::cell(Xlsx::date(self::date_time($r['last_activity']),true),3),self::cell(Xlsx::date(self::date_time($r['deadline']),true),3),self::cell(Xlsx::date(self::date_time($r['expires']),true),3),($d['staff_name']??'')?:'Staff member not identified',trim(($d['first_name']??'').' '.($d['last_name']??'')),$d['company']??'',self::cell($d['email']??'',0,self::email_link($d['email']??'')),self::cell($d['phone']??'',0,self::phone_link($d['phone']??'')),$d['event_type']??'',$d['description']??'',self::cell(Xlsx::date($first)??$first,2),implode(', ',array_slice($dates,1)),self::cell(Xlsx::time($d['time']??'')??self::display_time($d['time']??''),6),self::duration($d),isset($d['adults'])&&preg_match('/^\d{1,3}$/D',$d['adults'])?(int)$d['adults']:($d['adults']??null),isset($d['children'])&&preg_match('/^\d{1,3}$/D',$d['children'])?(int)$d['children']:($d['children']??null),self::preference($d,'yes',true),self::preference($d,'open',true),self::preference($d,'no',true),self::answer($d['food']??''),self::answer($d['craft']??''),self::answer($d['private_room']??''),self::answer($d['has_budget']??''),self::cell(isset($d['budget'])&&is_numeric($d['budget'])?(float)$d['budget']:($d['budget']??null),4),$d['comments']??'',$d['referral']??'',implode(', ',Staff::missing($d))?:'Required fields complete; not submitted',self::cell('Review Draft',0,Staff::review_url($r['id']))];}
        return [['name'=>'Summary','headers'=>['Measure','Value'],'widths'=>[40,48],'rows'=>[['Report',$report['kind']==='daily'?'Month-to-date':'Weekly'],['Period',self::range($report)],['Submitted inquiries',count($report['rows'])],['Requested guests',array_sum(array_column($report['rows'],'guests'))],['Retained unfinished inquiries',count($report['drafts']??[])],['Unfinished retention','14 days after timeout; older drafts excluded']]],['name'=>'Submitted Inquiries','headers'=>$headers,'rows'=>$rows,'widths'=>[12,22,27,46,17,28,15,17,10,10,13,32,32,36,20,20,16,18,24,28,30,23,27,48,26,21]],['name'=>'Unfinished Staff Inquiries','headers'=>$draftHeaders,'rows'=>$draftRows,'widths'=>[12,27,22,22,22,22,26,24,28,30,23,27,46,17,28,15,20,10,10,32,32,36,20,20,16,18,18,48,26,60,21]]];
    }
    public static function xlsx($report){return Xlsx::build(self::sheets($report));}
    public static function run(){
        // Single events are recalculated in local time so DST never shifts 7 AM.
        self::ensure_schedule();if(Plugin::test_mode())return;
        $now=new \DateTimeImmutable('now',new \DateTimeZone(self::ZONE));
        self::send('daily',$now);if($now->format('N')==='1')self::send('weekly',$now);
    }
    public static function send($kind,$now=null,$attempt=0){
        if(Plugin::test_mode()||!in_array($kind,['daily','weekly'],true))return false;
        $report=self::collect($kind,$now);$key='gapnext_digest_'.$kind.'_'.($kind==='daily'?$report['end']:$report['start'])->format('Ymd');
        if(get_option($key)==='accepted')return true;
        $lock=$key.'_lock';$held=get_option($lock);if($held&&is_numeric($held)&&(int)$held<time()-600)delete_option($lock);if(!add_option($lock,time(),'','no'))return false;
        try{
            $attachment=null;$ok=false;
            try{$attachment=Xlsx::temporary(self::xlsx($report),'Generations_Inquiries_'.$report['end']->format('Y-m-d').'_'.$kind.'.xlsx');$ok=wp_mail(self::TO,'Generations | '.($kind==='daily'?'Month-to-date':'Weekly').' Inquiry Report | '.self::range($report),self::html($report),['Content-Type: text/html; charset=UTF-8','Reply-To: '.self::TO],[$attachment]);}catch(\Throwable $e){$ok=false;}finally{Xlsx::remove($attachment);}
            if($ok)update_option($key,'accepted',false);
            elseif($attempt<3){$args=[$kind,$report['end']->format($kind==='daily'?'Y-m-d H:i:s':'Y-m-d'),$attempt+1];if(!wp_next_scheduled('gapnext_retry_digest',$args))wp_schedule_single_event(time()+15*MINUTE_IN_SECONDS,'gapnext_retry_digest',$args);}
            update_option('gapnext_digest_last_'.$kind,['at'=>current_time('mysql'),'status'=>$ok?'accepted':'failed','period'=>$report['start']->format('Y-m-d'),'count'=>count($report['rows']),'draft_count'=>count($report['drafts'])],false);
            return $ok;
        }finally{delete_option($lock);}
    }
    public static function retry($kind,$anchor,$attempt){
        if(!in_array($kind,['daily','weekly'],true)||!is_string($anchor)||!preg_match('/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/D',$anchor)||!is_numeric($attempt)||(int)$attempt<1||(int)$attempt>3)return;
        $value=strlen($anchor)===10?$anchor.' 07:00:00':$anchor;
        $now=\DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',$value,new \DateTimeZone(self::ZONE));
        if(!$now||$now->format('Y-m-d H:i:s')!==$value)return;
        self::send($kind,$now,(int)$attempt);
    }
    private static function range($report){
        return $report['start']->format('M j, Y').' – '.($report['kind']==='daily'?$report['end']->format('M j, Y g:i A'):$report['end']->modify('-1 day')->format('M j, Y'));
    }
    public static function page(){
        if(!current_user_can('manage_options'))return;
        echo '<div class="wrap"><h1>Event Inquiry Reports</h1><p>Daily: running month-to-date inquiries, from the first of the current month through the report time. Resets automatically each month. Monday weekly: previous Monday–Sunday. Both scheduled for <strong>7:00 a.m. America/Indiana/Indianapolis</strong> and sent to '.esc_html(self::TO).'.</p><p>'.(Plugin::test_mode()?'TEST MODE: reports can be previewed; scheduled email is suppressed.':'LIVE MODE: scheduled internal report emails enabled.').'</p><p>WordPress Cron runs when the site is visited. For dependable 7:00 a.m. execution, configure the host to run WordPress Cron every minute.</p><p>Next scheduled run: '.esc_html(wp_date('M j, Y g:i A',wp_next_scheduled(self::HOOK),new \DateTimeZone(self::ZONE))).'</p>';
        foreach(['daily','weekly'] as $kind){$last=get_option('gapnext_digest_last_'.$kind);if($last)echo '<p>'.esc_html(ucfirst($kind).': '.$last['status'].' · period '.$last['period'].' · '.$last['count'].' inquiries').'</p>';}
        echo '<form method="get"><input type="hidden" name="page" value="gapnext-reports">';wp_nonce_field('gapnext_report_preview');echo '<select name="report_kind"><option value="daily">Month-to-date preview</option><option value="weekly">Weekly preview</option></select> <button class="button">Preview without sending</button></form>';
        if(isset($_GET['report_kind'])&&in_array($_GET['report_kind'],['daily','weekly'],true)&&check_admin_referer('gapnext_report_preview')){echo '<iframe title="Inquiry report preview" style="width:100%;height:800px;border:1px solid #ccd0d4;margin-top:20px" sandbox srcdoc="'.esc_attr(self::html(self::collect($_GET['report_kind']))).'"></iframe>';}
        echo '</div>';
    }
}
