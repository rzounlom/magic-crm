<?php
namespace Generations\PlannerNext;

final class Plugin {
    const TYPE='gapnext_inquiry';
    public static function boot(){
        add_action('init',[__CLASS__,'register']);
        add_shortcode('generations_event_request',[__CLASS__,'form']);
        add_action('wp_ajax_gapnext_email_domain',[__CLASS__,'email_domain']);add_action('wp_ajax_nopriv_gapnext_email_domain',[__CLASS__,'email_domain']);
        add_action('wp_ajax_gapnext_ticket',[__CLASS__,'ticket']);add_action('wp_ajax_nopriv_gapnext_ticket',[__CLASS__,'ticket']);
        add_action('wp_ajax_gapnext_submit',[__CLASS__,'submit']);add_action('wp_ajax_nopriv_gapnext_submit',[__CLASS__,'submit']);
        add_action('admin_menu',[__CLASS__,'menu']);add_action('add_meta_boxes',[__CLASS__,'boxes']);
        add_action('admin_post_gapnext_settings',[__CLASS__,'settings']);add_action('admin_post_gapnext_retry',[__CLASS__,'retry']);
        add_action('admin_post_gapnext_recalculate',[__CLASS__,'recalculate']);
        add_action('gapnext_expire_lock',function($key){if(is_string($key)&&strpos($key,'gapnext_lock_')===0)delete_option($key);});
    }
    public static function test_mode(){return get_option('gapnext_test_mode','yes')!=='no';}
    public static function register(){
        register_post_type(self::TYPE,['labels'=>['name'=>'Event Inquiries','singular_name'=>'Event Inquiry'],'public'=>false,'publicly_queryable'=>false,'exclude_from_search'=>true,'show_ui'=>true,'show_in_menu'=>'gapnext','show_in_rest'=>false,'supports'=>['title'],'map_meta_cap'=>false,'capabilities'=>['edit_post'=>'manage_options','read_post'=>'manage_options','delete_post'=>'manage_options','edit_posts'=>'manage_options','edit_others_posts'=>'manage_options','publish_posts'=>'manage_options','read_private_posts'=>'manage_options','delete_posts'=>'manage_options','delete_private_posts'=>'manage_options','delete_published_posts'=>'manage_options','delete_others_posts'=>'manage_options','edit_private_posts'=>'manage_options','edit_published_posts'=>'manage_options','create_posts'=>'do_not_allow']]);
    }
    public static function form(){return self::render_form(false);}
    public static function render_form($staff=false){
        wp_enqueue_style('gapnext',GAPNEXT_URL.'assets/planner.css',[],(string)filemtime(GAPNEXT_DIR.'assets/planner.css'));
        wp_enqueue_script('gapnext',GAPNEXT_URL.'assets/planner.js',[],(string)filemtime(GAPNEXT_DIR.'assets/planner.js'),true);
        wp_localize_script('gapnext','GAPNext',['ajax'=>admin_url('admin-ajax.php'),'emailDomains'=>EmailDomain::TYPOS]);
        ob_start();include GAPNEXT_DIR.'includes/form.php';return ob_get_clean();
    }
    public static function ticket(){
        nocache_headers();
        $raw=wp_unslash($_POST);$staff=isset($raw['staff_key']);if($staff&&!Staff::valid_key($raw['staff_key']))wp_send_json_error(['message'=>'This staff link is unavailable.'],403);
        $key=wp_generate_password(40,false,false);set_transient('gapnext_token_'.hash('sha256',$key),$staff?['staff'=>true]:true,30*MINUTE_IN_SECONDS);
        wp_send_json_success(['token'=>$key,'nonce'=>wp_create_nonce('gapnext_submit')]);
    }
    public static function email_domain(){
        nocache_headers();$raw=wp_unslash($_POST);
        if(!isset($raw['nonce'])||!is_string($raw['nonce'])||!wp_verify_nonce($raw['nonce'],'gapnext_submit'))wp_send_json_error(['message'=>'Your form session expired. Please try again.'],403);
        $domain=isset($raw['domain'])&&is_string($raw['domain'])?$raw['domain']:'';
        if(strlen($domain)>253)wp_send_json_error(['message'=>'Invalid domain.'],400);
        $ip=(string)($_SERVER['REMOTE_ADDR']??'');$key='gapnext_dns_rate_'.hash_hmac('sha256',$ip,wp_salt('nonce'));$n=(int)get_transient($key);
        if($n>=60)wp_send_json_error(['message'=>'Please double-check your email address.'],429);
        set_transient($key,$n+1,15*MINUTE_IN_SECONDS);
        $confirmed=isset($raw['confirmed'])&&is_string($raw['confirmed'])?$raw['confirmed']:'';
        wp_send_json_success(EmailDomain::check($domain,$confirmed));
    }
    private static function clean($v){if(is_array($v))return array_map([__CLASS__,'clean'],$v);return is_scalar($v)?sanitize_textarea_field((string)$v):'';}
    public static function submit(){
        nocache_headers();
        $raw=wp_unslash($_POST);
        if(!isset($raw['nonce'])||!is_string($raw['nonce'])||!wp_verify_nonce($raw['nonce'],'gapnext_submit'))wp_send_json_error(['message'=>'Your form session expired. Please try again.'],403);
        if(!empty($raw['website']))wp_send_json_error(['message'=>'Unable to submit this request.'],400);
        $token=isset($raw['token'])&&is_string($raw['token'])?$raw['token']:'';$hash=hash('sha256',$token);
        if(!preg_match('/^[a-zA-Z0-9]{40}$/',$token)||!get_transient('gapnext_token_'.$hash))wp_send_json_error(['message'=>'Your form session expired. Please try again.'],403);
        $ticket=get_transient('gapnext_token_'.$hash);$isStaff=is_array($ticket)&&!empty($ticket['staff']);if(($isStaff||isset($raw['staff_key'])||isset($raw['staff_session']))&&!Staff::authorise($raw))wp_send_json_error(['message'=>'This staff form session expired. Please refresh the staff link.'],403);
        $input=self::clean($raw);$v=(new Engine())->validate($input);
        if(!$v['valid'])wp_send_json_error(['message'=>'Please complete the highlighted fields.','errors'=>$v['errors']],422);
        $ip=isset($_SERVER['REMOTE_ADDR'])?(string)$_SERVER['REMOTE_ADDR']:'';
        $rate='gapnext_rate_'.hash_hmac('sha256',$ip.'|'.strtolower($v['data']['email']),wp_salt('nonce'));
        $attempts=(int)get_transient($rate);if($attempts>=10)wp_send_json_error(['message'=>'Too many requests. Please try again later or call 574-855-1095.'],429);
        $lock='gapnext_lock_'.$hash;
        if(!add_option($lock,'processing','','no')){
            $existing=get_option($lock);if(is_numeric($existing))wp_send_json_success(['message'=>'Your request has already been received.']);
            wp_send_json_error(['message'=>'Your request is being processed. Please wait before retrying.'],409);
        }
        $result=$isStaff?Staff::submit($input):self::save($input);
        if(is_wp_error($result)){delete_option($lock);if(in_array($result->get_error_code(),['staff_expired','staff_missing','staff_busy'],true))wp_send_json_error(['message'=>$result->get_error_message(),'staff_expired'=>$result->get_error_code()==='staff_expired'],$result->get_error_code()==='staff_expired'?410:409);if($result->get_error_code()==='gapnext_invalid_email')wp_send_json_error(['message'=>$result->get_error_message(),'errors'=>$result->get_error_data()],422);wp_send_json_error(['message'=>'We could not save your request. Please try again or call 574-855-1095.'],500);}
        update_option($lock,(string)$result,false);wp_schedule_single_event(time()+DAY_IN_SECONDS,'gapnext_expire_lock',[$lock]);
        set_transient($rate,$attempts+1,HOUR_IN_SECONDS);
        // Retain the token briefly for idempotent retries; only the saved ID is returned internally.
        wp_send_json_success(['message'=>self::test_mode()?'Your test request was saved. No emails were sent.':'','acknowledgment_sent'=>!self::test_mode()&&(get_post_meta($result,'_gapnext_mail',true)['customer']??'')==='accepted']);
    }
    /** Validate before doing any persistence, calculation or email work. */
    public static function save($input,$source=[],$deadline=0){
        $engine=new Engine();$valid=$engine->validate($input);
        if(!$valid['valid'])return new \WP_Error('gapnext_invalid','Incomplete inquiry',$valid['errors']);
        $emailCheck=EmailDomain::validate($valid['data']['email'],$input['email_domain_confirmed']??'');
        if(in_array($emailCheck['status'],['invalid','suggestion'],true))return new \WP_Error('gapnext_invalid_email',$emailCheck['message'],['email'=>$emailCheck['message']]);
        if($deadline&&time()>=$deadline)return new \WP_Error('staff_expired','The 15-minute window has ended. The unfinished inquiry is saved for a manager.');
        $result=$engine->recommend($input);
        if(!$result['valid'])return new \WP_Error('gapnext_invalid','Incomplete inquiry',$result['errors']);
        $result['submission']=['source'=>($source['source']??'customer')==='staff'?'staff':'customer','staff_name'=>sanitize_text_field($source['staff_name']??''),'submitted_at'=>time(),'started_at'=>(int)($source['started_at']??time())];
        $d=$result['inquiry'];
        if($emailCheck['status']==='unknown')foreach($result['dates'] as &$day)$day['recommendation']['review'][]='Email domain could not be verified temporarily. Double-check the customer address before follow-up.';unset($day);
        if($deadline&&time()>=$deadline)return new \WP_Error('staff_expired','The 15-minute window has ended. The unfinished inquiry is saved for a manager.');
        $id=wp_insert_post(['post_type'=>self::TYPE,'post_status'=>'private','post_title'=>$d['dates'][0].' — '.$d['company'].' — '.$d['guests'].' guests'],true);
        if(is_wp_error($id))return $id;
        update_post_meta($id,'_gapnext_submission',$result['submission']);update_post_meta($id,'_gapnext_email_domain',$emailCheck);update_post_meta($id,'_gapnext_result',wp_slash($result));update_post_meta($id,'_gapnext_test',self::test_mode()?'yes':'no');
        update_post_meta($id,'_gapnext_mail',['internal'=>'not_sent','customer'=>'not_sent']);
        if(!self::test_mode())self::deliver($id);
        return $id;
    }
    public static function report_text($result){
        require_once __DIR__.'/itinerary.php';
        $d=$result['inquiry'];$text="GENERATIONS ADVENTUREPLEX — INTERNAL EVENT RECOMMENDATION\n".$result['status']."\nRules: ".$result['rules_version']."\n\nFULL INQUIRY\n";
        $source=$result['submission']??[];$text.='Submitted by: '.(($source['source']??'customer')==='staff'?(($source['staff_name']??'')?:'Staff member not identified').' (staff)':'Customer')."\n";
        foreach($d as $k=>$v){if($k==='attractions'){foreach($v as $a=>$answer)$text.=Engine::ATTRACTIONS[$a].': '.['yes'=>'Yes, include it','no'=>'No, leave it out','open'=>'Open to your recommendation'][$answer]."\n";continue;}$text.=ucwords(str_replace('_',' ',$k)).': '.($k==='budget'&&$v!==null?Engine::money($v):(is_array($v)?wp_json_encode($v,JSON_UNESCAPED_UNICODE):($v===null?'Not supplied':(string)$v)))."\n";}
        foreach($result['dates'] as $day){$p=$day['recommendation'];$text.="\nDATE: ".$day['date']."\nRECOMMENDATION: ".$p['name']."\n".$p['why']."\n";
            if($p['hard_review']||!$p['fits_duration']||!empty($p['duration_review']))$text.="PLANNING HOLD — resolve flagged requirements before quoting.\n";
            $text.='Suggested optional attractions: '.($p['suggested_attractions']?implode(', ',array_map(function($k){return Engine::ATTRACTIONS[$k];},$p['suggested_attractions'])):'None')."\n";
            foreach($p['items'] as $i)$text.=$i['quantity'].' × '.$i['label'].' @ '.Engine::money($i['unit_cents']).' = '.Engine::money($i['subtotal_cents']).' + tax '.Engine::money($i['tax_cents'])."\n";
            if(!empty($p['unpriced']))$text.="Total unavailable — staff must establish the event scope and quote.\n";else $text.='Subtotal '.Engine::money($p['subtotal_cents']).'; tax '.Engine::money($p['tax_cents']).'; total '.Engine::money($p['total_cents']).'; per guest '.Engine::money($p['per_guest_cents'])."\n";
            if($p['budget_over_cents'])$text.='ABOVE TOTAL BUDGET: '.Engine::money($p['budget_over_cents'])."\n";
            $text.="PROPOSED ITINERARY\n";$text.=Itinerary::text($p['itinerary']);
            foreach($p['notes'] as $n)$text.='Included / planning: '.$n."\n";
            foreach(array_unique($p['review']) as $n)$text.='STAFF REVIEW: '.$n."\n";
            $text.="ALTERNATIVES\n";foreach($day['alternatives'] as $alt){
                $text.=$alt['name'].' — '.$d['guests'].' guests ('.$d['adults'].' adults / '.$d['children'].' children)'."\n";
                $text.=($alt['hard_review']||!empty($alt['duration_review'])?'Needs staff resolution':($alt['fits_duration']?'Fits requested duration':'Requires more time'))."\n";
                foreach($alt['items'] as $i)$text.=$i['quantity'].' × '.$i['label'].' @ '.Engine::money($i['unit_cents']).' = '.Engine::money($i['subtotal_cents']).' + tax '.Engine::money($i['tax_cents'])."\n";
                $text.=!empty($alt['unpriced'])?"Total unavailable — staff quote required.\n":'Subtotal '.Engine::money($alt['subtotal_cents']).'; tax '.Engine::money($alt['tax_cents']).'; total '.Engine::money($alt['total_cents']).'; per guest '.Engine::money($alt['per_guest_cents'])."\n";
                if($alt['budget_over_cents'])$text.='ABOVE TOTAL BUDGET: '.Engine::money($alt['budget_over_cents'])."\n";
                foreach($alt['notes'] as $note)$text.='Included / planning: '.$note."\n";
                foreach(array_unique($alt['review']) as $note)$text.='STAFF REVIEW: '.$note."\n";
            }
        }
        return $text;
    }
    private static function deliver($id){
        if(self::test_mode()||get_post_meta($id,'_gapnext_test',true)==='yes')return;
        $r=get_post_meta($id,'_gapnext_result',true);if(!$r)return;
        $lock='gapnext_lock_mail_'.$id;if(!add_option($lock,time(),'','no'))return;
        wp_schedule_single_event(time()+5*MINUTE_IN_SECONDS,'gapnext_expire_lock',[$lock]);
        try {
        $status=get_post_meta($id,'_gapnext_mail',true);$d=$r['inquiry'];$subject='Event Inquiry #'.$id.' | '.$d['dates'][0].' | '.$d['guests'].' Guests';
        if(($status['internal']??'')!=='accepted')$status['internal']=wp_mail('events@generations-adventureplex.com',$subject,Emails::internal($r,$id),['Content-Type: text/html; charset=UTF-8','Reply-To: '.$d['email']])?'accepted':'failed';
        if(($status['customer']??'')!=='accepted'){
            $body=Emails::customer($d);
            $files=Admin::attachments();
            $status['customer']=wp_mail($d['email'],'We received your Generations event request',$body,['Content-Type: text/html; charset=UTF-8','Reply-To: events@generations-adventureplex.com'],$files)?'accepted':'failed';
        }
        $status['attempted_at']=current_time('mysql');update_post_meta($id,'_gapnext_mail',$status);
        } finally {wp_clear_scheduled_hook('gapnext_expire_lock',[$lock]);delete_option($lock);}
    }
    public static function menu(){add_menu_page('Generations Event Planner','Event Planner','manage_options','gapnext',[__CLASS__,'dashboard'],'dashicons-calendar-alt',26);}
    public static function dashboard(){
        if(!current_user_can('manage_options'))return;
        echo '<div class="wrap"><h1>Generations Event Planner — Next</h1><p>Rules '.esc_html(Catalog::VERSION).' · Plugin '.esc_html(GAPNEXT_VERSION).'</p>';
        echo '<p><a class="button" href="'.esc_url(admin_url('admin.php?page=gapnext-prices')).'">Manage prices &amp; email attachments</a></p>';
        echo '<p><strong>'.(self::test_mode()?'TEST MODE — inquiries saved, emails suppressed.':'LIVE EMAIL MODE — valid inquiries generate internal and acknowledgment emails.').'</strong></p>';
        echo '<p>Add shortcode <code>[generations_event_request]</code> to a staging page. This new shortcode does not replace a legacy planner automatically.</p><p><a class="button button-primary" href="'.esc_url(admin_url('edit.php?post_type='.self::TYPE)).'">View saved inquiries</a></p>';
        $inquiry=isset($_GET['inquiry'])?absint($_GET['inquiry']):0;
        if($inquiry&&get_post_type($inquiry)===self::TYPE){
            $opts=get_post_meta($inquiry,'_gapnext_options',true);if(!is_array($opts))$opts=[];
            echo '<h2>Planning controls for inquiry #'.esc_html($inquiry).'</h2><p>Recalculates the saved inquiry without sending email. Explicit attraction exclusions remain in force.</p><form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="gapnext_recalculate"><input type="hidden" name="id" value="'.esc_attr($inquiry).'">';wp_nonce_field('gapnext_recalculate_'.$inquiry);
            foreach(['menu'=>['default'=>'Use customer request / default','pizza'=>'Pizza & pitchers','pizza_wings'=>'Pizza, pitchers & wings','wings'=>'Wings & pitchers','appetizers'=>'Appetizers & shareables','fajita'=>'Fajita Bar','slider'=>'Slider Bar','bbq'=>'Smokehouse BBQ'],'wing_type'=>['boneless'=>'Boneless wings','traditional'=>'Traditional wings'],'room'=>['lower'=>'Lower Event Room','upper'=>'Skybox / Upper Event Room','cove'=>'Climbers Cove (explicit request)'],'rental'=>['bowling'=>'Private bowling','axe'=>'Private Axe Den','laser'=>'Private laser tag','mezzanine'=>'Mezzanine','full'=>'Full Facility'],'bowling_hours'=>['0.5'=>'30 minutes bowling','1'=>'1 hour bowling','2'=>'2 hours bowling'],'axe_minutes'=>['30'=>'30 minutes axe','60'=>'60 minutes axe'],'laser_mode'=>['session'=>'Fuller laser experience','single'=>'One laser game per guest']] as $key=>$choices){echo '<p><label>'.esc_html(ucwords(str_replace('_',' ',$key))).' <select name="'.esc_attr($key).'"><option value="">Use approved default</option>';foreach($choices as $v=>$label)echo '<option value="'.esc_attr($v).'" '.selected((string)($opts[$key]??''),(string)$v,false).'>'.esc_html($label).'</option>';echo '</select></label></p>';}
            echo '<p><label>Explicitly requested room hours <input name="room_hours" type="number" min="0.25" max="24" step="0.25" value="'.esc_attr($opts['room_hours']??'').'"></label> Leave blank for the three-hour room rate; extensions are only added when explicitly requested.</p>';
            foreach(['salad','pretzels','strips','brownies','cookies','traditional'] as $k)echo '<p><label>'.esc_html(ucfirst($k)).' platters / trays <input name="extras['.esc_attr($k).']" type="number" min="0" max="999" value="'.esc_attr($opts['extras'][$k]??0).'"></label></p>';
            submit_button('Recalculate and save revision');echo '</form>';
        }
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="gapnext_settings">';wp_nonce_field('gapnext_settings');
        echo '<label><input type="checkbox" name="test_mode" value="yes" '.checked(self::test_mode(),true,false).'> Test mode (recommended during staging)</label> ';submit_button('Save mode','secondary','submit',false);echo '</form>';
        if(isset($_GET['saved']))echo '<p>Mode saved.</p>';
        if(isset($_GET['retry']))echo '<p>Email retry processed. Check the inquiry’s submission status below.</p>';
        echo '<h2>Private recommendation test</h2><p>Run examples here without saving an inquiry or sending email.</p>';
        if($_SERVER['REQUEST_METHOD']==='POST'&&isset($_POST['gapnext_preview'])){
            check_admin_referer('gapnext_preview');$sample=self::sample();$raw=wp_unslash($_POST);
            $count=isset($raw['guests'])?filter_var($raw['guests'],FILTER_VALIDATE_INT):false;
            if(!$count||$count<1||$count>999)echo '<p>Enter 1–999 guests.</p>';
            else{$sample['adults']=$count;$sample['children']=0;$case=isset($raw['case'])&&is_string($raw['case'])?$raw['case']:'bowling_axe';foreach($sample['attractions'] as $k=>$a)$sample['attractions'][$k]='no';foreach(['bowling_axe'=>['bowling','axe'],'axe'=>['axe'],'laser'=>['laser'],'laser_arcade'=>['laser','arcade'],'bowling'=>['bowling']][$case]??[] as $k)$sample['attractions'][$k]='yes';$preview=(new Engine())->recommend($sample);echo '<pre style="white-space:pre-wrap;background:#fff;padding:20px">'.esc_html(self::report_text($preview)).'</pre>';}
        }
        echo '<form method="post">';wp_nonce_field('gapnext_preview');echo '<input type="hidden" name="gapnext_preview" value="1"><label>Guests <input name="guests" type="number" min="1" max="999" value="10" required></label> <select name="case"><option value="bowling_axe">Bowling + axe</option><option value="axe">Axe only</option><option value="laser">Laser only</option><option value="laser_arcade">Laser + arcade</option><option value="bowling">Bowling only</option></select> ';submit_button('Preview Friday example','secondary','submit',false);echo '</form></div>';
    }
    public static function settings(){if(!current_user_can('manage_options'))wp_die('Not allowed.');check_admin_referer('gapnext_settings');update_option('gapnext_test_mode',isset($_POST['test_mode'])?'yes':'no',false);wp_safe_redirect(admin_url('admin.php?page=gapnext&saved=1'));exit;}
    public static function boxes(){add_meta_box('gapnext_details','Inquiry, recommendations and itinerary',[__CLASS__,'details'],self::TYPE,'normal','high');}
    public static function details($post){
        if(!current_user_can('manage_options'))return;$r=get_post_meta($post->ID,'_gapnext_result',true);if(!$r)return;
        $revision=get_post_meta($post->ID,'_gapnext_revision_note',true);if($revision)echo '<p><strong>'.esc_html($revision).'</strong></p>';
        $status=get_post_meta($post->ID,'_gapnext_mail',true);echo '<p><strong>'.(get_post_meta($post->ID,'_gapnext_test',true)==='yes'?'Saved in test mode.':'Live inquiry.').'</strong> Mail status: '.esc_html(wp_json_encode($status)).'</p>';
        echo '<p>“accepted” means WordPress accepted the send request; delivery is not confirmed.</p><pre style="white-space:pre-wrap">'.esc_html(self::report_text($r)).'</pre>';
        echo '<p><a class="button" href="'.esc_url(admin_url('admin.php?page=gapnext&inquiry='.$post->ID)).'">Adjust menu, activity time or platters</a></p>';
        if(!self::test_mode()&&get_post_meta($post->ID,'_gapnext_test',true)!=='yes'){
            $url=wp_nonce_url(admin_url('admin-post.php?action=gapnext_retry&id='.$post->ID),'gapnext_retry_'.$post->ID);echo '<p><a class="button" href="'.esc_url($url).'">Retry failed / unsent emails only</a></p>';
        }
    }
    public static function retry(){if(!current_user_can('manage_options'))wp_die('Not allowed.');$id=isset($_GET['id'])?absint($_GET['id']):0;check_admin_referer('gapnext_retry_'.$id);if(get_post_type($id)!==self::TYPE||self::test_mode()||get_post_meta($id,'_gapnext_test',true)==='yes')wp_die('Email retry is not allowed for this inquiry.');self::deliver($id);wp_safe_redirect(get_edit_post_link($id,'raw'));exit;}
    public static function recalculate(){
        if(!current_user_can('manage_options'))wp_die('Not allowed.');$id=isset($_POST['id'])?absint($_POST['id']):0;check_admin_referer('gapnext_recalculate_'.$id);if(get_post_type($id)!==self::TYPE)wp_die('Invalid inquiry.');
        $old=get_post_meta($id,'_gapnext_result',true);if(!$old)wp_die('Missing inquiry.');$raw=wp_unslash($_POST);$opts=[];
        foreach(['menu'=>['pizza','pizza_wings','wings','appetizers','fajita','slider','bbq'],'wing_type'=>['boneless','traditional'],'room'=>['lower','upper','cove'],'rental'=>['bowling','axe','laser','mezzanine','full'],'bowling_hours'=>['0.5','1','2'],'axe_minutes'=>['30','60'],'laser_mode'=>['single','session']] as $k=>$allowed)if(isset($raw[$k])&&is_string($raw[$k])&&in_array($raw[$k],$allowed,true))$opts[$k]=$raw[$k];
        foreach(['salad','pretzels','strips','brownies','cookies','traditional'] as $k)if(isset($raw['extras'][$k])&&is_scalar($raw['extras'][$k])&&ctype_digit((string)$raw['extras'][$k])&&(int)$raw['extras'][$k]>0&&(int)$raw['extras'][$k]<=999)$opts['extras'][$k]=(int)$raw['extras'][$k];
        if(isset($raw['room_hours'])&&is_scalar($raw['room_hours'])&&is_numeric($raw['room_hours'])&&(float)$raw['room_hours']>0&&(float)$raw['room_hours']<=24)$opts['room_hours']=(float)$raw['room_hours'];
        $saved=$old['inquiry'];if(empty($saved['event_type']))$saved['event_type']='Other';$next=(new Engine())->recommend($saved,$opts);if(!$next['valid'])wp_die('Saved inquiry is incomplete; no revision saved.');
        $next['submission']=$old['submission']??get_post_meta($id,'_gapnext_submission',true);
        add_post_meta($id,'_gapnext_history',wp_slash(['at'=>current_time('mysql'),'staff'=>get_current_user_id(),'result'=>$old]));
        update_post_meta($id,'_gapnext_result',wp_slash($next));update_post_meta($id,'_gapnext_options',$opts);
        update_post_meta($id,'_gapnext_revision_note','Recalculated by staff; earlier email content may differ. No emails sent by recalculation.');
        wp_safe_redirect(get_edit_post_link($id,'raw'));exit;
    }
    public static function sample(){return ['event_type'=>'Corporate or Team Event','first_name'=>'Sample','last_name'=>'Guest','company'=>'Sample Company','phone'=>'574-555-0100','email'=>'sample@example.com','dates'=>['2026-11-06'],'time'=>'13:00','adults'=>10,'children'=>0,'duration'=>'3 hours','other_hours'=>'','food'=>'no','private_room'=>'no','craft'=>'no','has_budget'=>'no','budget'=>'','description'=>'Corporate outing','comments'=>'','referral'=>'Website','attractions'=>array_fill_keys(array_keys(Engine::ATTRACTIONS),'no')];}
}
