<?php
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
if(!getenv('GAPNEXT_WP_ROOT')){fwrite(STDERR,"Set GAPNEXT_WP_ROOT to an isolated test WordPress.\n");exit(1);}
require rtrim(getenv('GAPNEXT_WP_ROOT'),'/').'/wp-load.php';
use Generations\PlannerNext\Plugin;use Generations\PlannerNext\Staff;use Generations\PlannerNext\Reports;use Generations\PlannerNext\Emails;use Generations\PlannerNext\Xlsx;
if(!defined('WP_ENVIRONMENT_TYPE')||WP_ENVIRONMENT_TYPE!=='local')throw new Exception('Isolated local WordPress required.');
$checks=0;$drafts=[];$inquiries=[];function staff_ok($v,$label){global $checks;$checks++;if(!$v)throw new Exception('FAIL '.$label);echo 'PASS '.$label."\n";}
$idFor=function($key){return (int)get_option('gapnext_staff_session_'.hash_hmac('sha256',$key,wp_salt('nonce')));};
$raw=function($changes=[])use(&$drafts,$idFor){$s=array_replace_recursive(Plugin::sample(),$changes);$s['staff_name']='Ashley';$s['staff_session']=bin2hex(random_bytes(32));return $s;};
$sent=[];$mail=function($old,$args)use(&$sent){$copy=$args;if(!empty($args['attachments'])){$copy['attachment_bytes']=file_get_contents($args['attachments'][0]);$copy['attachment_exists_during_send']=is_file($args['attachments'][0]);}$sent[]=$copy;return true;};add_filter('pre_wp_mail',$mail,1000,2);
$dns=function(){return [['type'=>'MX','target'=>'fixture-mail.example']];};add_filter('gapnext_dns_records',$dns,10,3);update_option('gapnext_test_mode','yes');
$count=function(){return count(get_posts(['post_type'=>Plugin::TYPE,'post_status'=>'private','numberposts'=>-1]));};
try{
 $public=Plugin::form();$staff=Plugin::render_form(true);
 staff_ok(strpos($public,'data-staff-key')===false&&strpos($public,'name="staff_name"')===false,'public form has no staff link key, name field or autosave workflow');
 staff_ok(strpos($staff,'data-staff-key=')!==false&&strpos($staff,'name="staff_name"')!==false,'staff form reuses intake with optional name and separate staff context');
 staff_ok(strpos($public,'You don’t need every detail figured out.')!==false,'approved reassurance appears before attraction choices');
 staff_ok(Staff::valid_key(Staff::key())&&!Staff::valid_key('incorrect'),'unlisted link validates its own key without a WordPress login');
 staff_ok(!Staff::authorise(['staff_key'=>Staff::key()]),'staff APIs reject missing session ticket and nonce');
 $token=wp_generate_password(40,false,false);set_transient('gapnext_token_'.hash('sha256',$token),true,60);$auth=['staff_key'=>Staff::key(),'token'=>$token,'nonce'=>wp_create_nonce('gapnext_submit')];
 staff_ok(!Staff::authorise($auth),'a public-form ticket cannot save staff records');set_transient('gapnext_token_'.hash('sha256',$token),['staff'=>true],60);staff_ok(Staff::authorise($auth),'valid staff link, nonce and staff ticket authorize write-only intake');
 $empty=['staff_name'=>'Ashley','staff_session'=>bin2hex(random_bytes(32))];staff_ok(is_wp_error(Staff::begin($empty)),'staff name alone never starts an empty unfinished inquiry');
 $s=$raw(['first_name'=>'Jamie','email'=>'unfinished']);$before=$count();$result=Staff::begin($s);$id=$idFor($s['staff_session']);$drafts[]=$id;
 staff_ok($result['saved']&&$id&&get_post_status($id)==='private','first customer data is saved privately even while incomplete');
 staff_ok($result['remaining_seconds']<=900&&$result['remaining_seconds']>=898,'server issues a fixed 15-minute completion deadline');
 staff_ok(!isset($result['id'])&&!isset($result['data'])&&!isset($result['email']),'autosave response contains no private record data or record ID');
 staff_ok($count()===$before&&count($sent)===0&&!get_post_meta($id,'_gapnext_result',true),'unfinished data does not calculate recommendations, save submitted inquiries or send email');
 $deadline=$result['deadline'];$s['phone']='574-555-0199';Staff::autosave($s);$again=Staff::begin($s);
 staff_ok($idFor($s['staff_session'])===$id&&$again['deadline']===$deadline,'retrying start or autosaving cannot create another draft or extend the deadline');
 staff_ok(get_post_meta($id,'_gapnext_payload',true)['phone']==='574-555-0199','autosave captures newly entered customer details');
 $lock='gapnext_staff_lock_'.$id;add_option($lock,time(),'','no');staff_ok(is_wp_error(Staff::autosave($s)),'concurrent draft mutation is locked');delete_option($lock);
 update_post_meta($id,'_gapnext_deadline',time()-1);Staff::expire($id);staff_ok(get_post_meta($id,'_gapnext_state',true)==='timed_out','server expires unfinished inquiry when 15 minutes have elapsed');
 $s['first_name']='Changed after timeout';$result=Staff::autosave($s);staff_ok($result['expired']&&get_post_meta($id,'_gapnext_payload',true)['first_name']==='Jamie','regular save cannot edit or reopen an expired inquiry');
 $s['first_name']='Final captured details';Staff::autosave($s,true);$s['first_name']='Another late edit';Staff::autosave($s,true);staff_ok(get_post_meta($id,'_gapnext_payload',true)['first_name']==='Final captured details','only one terminal in-flight snapshot is accepted within the timeout grace period');
 $result=Staff::submit($s);staff_ok(is_wp_error($result)&&$result->get_error_code()==='staff_expired'&&$count()===$before,'expired inquiry cannot become a submission');
 $s=$raw(['email'=>'customer@example.test']);$s['attractions']['bowling']='yes';Staff::begin($s);$id=$idFor($s['staff_session']);$drafts[]=$id;$result=Staff::submit($s);if(is_int($result))$inquiries[]=$result;
 staff_ok(is_int($result)&&$count()===$before+1,'complete active staff inquiry follows normal validated submission');
 $saved=get_post_meta($result,'_gapnext_result',true);staff_ok($saved['submission']['source']==='staff'&&$saved['submission']['staff_name']==='Ashley','staff source and employee name are saved internally');
 staff_ok(strpos(Emails::internal($saved,$result),'Ashley')!==false&&strpos(Emails::customer($saved['inquiry']),'Ashley')===false,'staff attribution appears internally, not in customer acknowledgment');
 staff_ok(get_post_meta($id,'_gapnext_state',true)==='completed'&&!get_post_meta($id,'_gapnext_payload',true),'submitted session clears duplicate customer draft data');
 staff_ok(Staff::submit($s)===$result&&$count()===$before+1,'repeated staff submission returns same saved inquiry without duplication');
 $s=$raw();$s['staff_name']='';Staff::begin($s);$id=$idFor($s['staff_session']);$drafts[]=$id;$savedId=Staff::submit($s);if(is_int($savedId))$inquiries[]=$savedId;
 staff_ok(is_int($savedId)&&get_post_meta($savedId,'_gapnext_submission',true)['staff_name']==='Staff member not identified','missing employee name never blocks a complete customer inquiry');
 $s=$raw();$s['email']='';Staff::begin($s);$id=$idFor($s['staff_session']);$drafts[]=$id;$n=$count();$invalid=Staff::submit($s);staff_ok(is_wp_error($invalid)&&$count()===$n&&get_post_meta($id,'_gapnext_state',true)==='active','missing required customer details prevent submission while preserving staff progress');
 $expired=Plugin::save(Plugin::sample(),['source'=>'staff','staff_name'=>'Ashley'],time()-1);staff_ok(is_wp_error($expired)&&$expired->get_error_code()==='staff_expired','deadline is checked again after email-domain validation');
 $s=$raw(['first_name'=>'Draft Contact','email'=>'draft@example.test','comments'=>'=HYPERLINK("https://example.test","test")']);$s['staff_elapsed']=900;Staff::begin($s);$draftId=$idFor($s['staff_session']);$drafts[]=$draftId;
 $clock=new DateTimeImmutable('now',new DateTimeZone(Reports::ZONE));$period=Reports::period('daily',$clock);$started=$period['start']->getTimestamp()+3600;
 update_post_meta($draftId,'_gapnext_started',$started);update_post_meta($draftId,'_gapnext_last_activity',$started+360);update_post_meta($draftId,'_gapnext_deadline',$started+900);update_post_meta($draftId,'_gapnext_expires',$started+900+Staff::RETENTION);update_post_meta($draftId,'_gapnext_test','no');
 $report=Reports::collect('daily',$clock);$draftRows=array_values(array_filter($report['drafts'],function($r)use($draftId){return $r['id']===$draftId;}));
 staff_ok(count($draftRows)===1,'morning report includes timed-out staff records from its reporting period');
 staff_ok(!in_array($draftId,array_column($report['rows'],'id'),true),'unfinished records never inflate submitted inquiry or guest totals');
 $report['rows']=[];$report['drafts']=$draftRows;$html=Reports::html($report);staff_ok(strpos($html,'Unfinished staff inquiries')!==false&&strpos($html,'Draft Contact')!==false&&strpos($html,'<th')!==false,'daily email presents a separate tabular unfinished section with contact details');
 $sampleResult=get_post_meta($inquiries[0],'_gapnext_result',true);$d=$sampleResult['inquiry'];$report['rows']=[['id'=>$inquiries[0],'type'=>$d['event_type'],'guests'=>$d['guests'],'dates'=>$d['dates'],'time'=>$d['time'],'duration'=>$d['duration'],'company'=>$d['company'],'contact'=>$d['first_name'].' '.$d['last_name'],'email'=>$d['email'],'phone'=>$d['phone'],'data'=>$d,'submission'=>$sampleResult['submission'],'received_stamp'=>time(),'received'=>'Now']];
 $bytes=Reports::xlsx($report);staff_ok(substr($bytes,0,4)==="PK\x03\x04"&&strpos($bytes,'Submitted Inquiries')!==false&&strpos($bytes,'Unfinished Staff Inquiries')!==false,'self-contained generator produces an XLSX archive with exactly the requested sheet names');
 staff_ok(strpos($bytes,'<f>')===false&&strpos($bytes,'=HYPERLINK')!==false,'customer text beginning with equals remains text, never an executable spreadsheet formula');
 staff_ok(strpos($bytes,'state="frozen"')!==false&&strpos($bytes,'autoFilter')!==false,'spreadsheet has frozen header rows and filter controls');
 staff_ok(strpos($bytes,'mailto:customer@example.test')!==false&&strpos($bytes,'tel:5745550100')!==false,'spreadsheet contact email and phone values have clickable links');
 if(getenv('GAPNEXT_SAMPLE_XLSX'))file_put_contents(getenv('GAPNEXT_SAMPLE_XLSX'),$bytes);
 $emptyPeriod=Reports::period('daily',new DateTimeImmutable('2028-01-01 07:00',new DateTimeZone(Reports::ZONE)));$digestKey='gapnext_digest_daily_'.$emptyPeriod['start']->format('Ymd');delete_option($digestKey);update_option('gapnext_test_mode','no');$sentBefore=count($sent);Reports::send('daily',new DateTimeImmutable('2028-01-01 07:00',new DateTimeZone(Reports::ZONE)));$email=$sent[$sentBefore]??[];
 staff_ok(!empty($email['attachment_exists_during_send'])&&substr($email['attachment_bytes'],0,4)==="PK\x03\x04"&&substr($email['attachments'][0],-5)==='.xlsx','scheduled report actually attaches a readable Excel file with a proper filename');
 staff_ok(!file_exists($email['attachments'][0])&&strpos($email['attachments'][0],'wp-content/uploads')===false,'temporary report attachment is private and removed immediately after sending');delete_option($digestKey);update_option('gapnext_test_mode','yes');
 $s=$raw();$s['staff_elapsed']=900;Staff::begin($s);$old=$idFor($s['staff_session']);$drafts[]=$old;$map=get_post_meta($old,'_gapnext_session_map',true);update_post_meta($old,'_gapnext_expires',time()-1);Staff::delete_expired($old);
 staff_ok(!get_post($old)&&!get_option($map),'14-day expiration permanently deletes unfinished data and its session lookup');
 update_post_meta($draftId,'_gapnext_expires',time()+60);Staff::delete_expired($draftId);staff_ok(get_post($draftId)!==null,'unfinished inquiry remains available before retention expires');
 $completed=$drafts[1];update_post_meta($completed,'_gapnext_expires',time()-1);Staff::delete_expired($completed);staff_ok(get_post($inquiries[0])!==null,'session cleanup never deletes a submitted customer inquiry');
 wp_set_current_user(0);ob_start();Staff::page();$page=ob_get_clean();staff_ok($page==='','staff draft review page is not visible to anonymous visitors');
 staff_ok(Staff::RETENTION===14*DAY_IN_SECONDS,'unfinished retention is exactly 14 days after timeout');
}finally{
 update_option('gapnext_test_mode','yes');foreach($drafts as $id){if(get_post($id)){update_post_meta($id,'_gapnext_expires',time()-1);Staff::delete_expired($id);}}foreach($inquiries as $id)wp_delete_post($id,true);remove_filter('pre_wp_mail',$mail,1000);remove_filter('gapnext_dns_records',$dns,10);
}
echo "\n$checks staff workflow checks passed. All mail intercepted locally.\n";
