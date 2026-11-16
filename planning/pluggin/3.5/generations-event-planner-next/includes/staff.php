<?php
namespace Generations\PlannerNext;
if(!defined('ABSPATH'))exit;

/** Unlisted write-only staff intake; saved records remain administrator-only. */
final class Staff {
    const TYPE='gapnext_staff_draft';
    const WINDOW=900;
    const RETENTION=14*DAY_IN_SECONDS;
    public static function boot(){
        add_action('init',[__CLASS__,'register']);
        add_action('template_redirect',[__CLASS__,'route']);
        foreach(['begin','save','finish'] as $operation){add_action('wp_ajax_gapnext_staff_'.$operation,[__CLASS__,'ajax']);add_action('wp_ajax_nopriv_gapnext_staff_'.$operation,[__CLASS__,'ajax']);}
        add_action('gapnext_staff_expire',[__CLASS__,'expire']);
        add_action('gapnext_staff_delete',[__CLASS__,'delete_expired']);
        add_action('gapnext_staff_cleanup',[__CLASS__,'cleanup']);
        add_action('admin_menu',function(){add_submenu_page('gapnext','Staff Intake & Unfinished Inquiries','Staff Intake','manage_options','gapnext-staff',[__CLASS__,'page']);});
    }
    public static function key(){
        $key=get_option('gapnext_staff_link_key');if(!is_string($key)||!preg_match('/^[a-zA-Z0-9]{40}$/D',$key)){add_option('gapnext_staff_link_key',wp_generate_password(40,false,false),'','no');$key=get_option('gapnext_staff_link_key');}return $key;
    }
    public static function valid_key($key){return is_string($key)&&hash_equals(self::key(),$key);}
    public static function url(){return add_query_arg('gapnext_staff',self::key(),home_url('/'));}
    public static function register(){
        register_post_type(self::TYPE,['labels'=>['name'=>'Unfinished Staff Inquiries','singular_name'=>'Unfinished Staff Inquiry'],'public'=>false,'publicly_queryable'=>false,'exclude_from_search'=>true,'show_ui'=>false,'show_in_rest'=>false,'supports'=>[],'map_meta_cap'=>false,'capabilities'=>array_fill_keys(['edit_post','read_post','delete_post','edit_posts','edit_others_posts','publish_posts','read_private_posts','delete_posts'],'manage_options')]);
        self::key();if(!wp_next_scheduled('gapnext_staff_cleanup'))wp_schedule_event(time()+HOUR_IN_SECONDS,'daily','gapnext_staff_cleanup');
    }
    public static function route(){
        if(!isset($_GET['gapnext_staff']))return;
        if(!self::valid_key(wp_unslash($_GET['gapnext_staff'])))wp_die('This staff link is unavailable.','Not found',['response'=>404]);
        nocache_headers();header('X-Robots-Tag: noindex, nofollow, noarchive');header('Referrer-Policy: no-referrer');
        $form=Plugin::render_form(true);
        echo '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>Staff Event Inquiry · Generations AdventurePlex</title>';wp_head();echo '</head><body style="margin:0;background:#eef2f6"><main>'.$form.'</main>';wp_footer();echo '</body></html>';exit;
    }
    public static function authorise($raw){
        if(!self::valid_key($raw['staff_key']??null))return false;
        if(!isset($raw['nonce'])||!is_string($raw['nonce'])||!wp_verify_nonce($raw['nonce'],'gapnext_submit'))return false;
        $token=$raw['token']??'';if(!is_string($token)||!preg_match('/^[a-zA-Z0-9]{40}$/D',$token))return false;
        $ticket=get_transient('gapnext_token_'.hash('sha256',$token));return is_array($ticket)&&!empty($ticket['staff']);
    }
    private static function lookup($session){return 'gapnext_staff_session_'.hash_hmac('sha256',$session,wp_salt('nonce'));}
    private static function record($session){
        if(!is_string($session)||!preg_match('/^[a-f0-9]{64}$/D',$session))return 0;
        $id=(int)get_option(self::lookup($session));return get_post_type($id)===self::TYPE?$id:0;
    }
    public static function payload($raw){
        $out=[];foreach(['first_name','last_name','company','phone','email','event_type','time','adults','children','duration','other_hours','food','private_room','craft','has_budget','budget','description','comments','referral','staff_name','email_domain_confirmed'] as $field){$value=$raw[$field]??'';$limit=$field==='comments'?8000:($field==='description'?4000:200);$out[$field]=is_scalar($value)?mb_substr(sanitize_textarea_field((string)$value),0,$limit):'';}
        $out['dates']=[];foreach(array_slice(is_array($raw['dates']??null)?$raw['dates']:[],0,5) as $value)if(is_scalar($value))$out['dates'][]=mb_substr(sanitize_text_field((string)$value),0,30);
        $out['attractions']=[];foreach(Engine::ATTRACTIONS as $key=>$label){$value=$raw['attractions'][$key]??'';$out['attractions'][$key]=is_string($value)&&in_array($value,['yes','no','open'],true)?$value:'';}
        return $out;
    }
    private static function lock($id){$key='gapnext_staff_lock_'.$id;$held=get_option($key);if(is_numeric($held)&&(int)$held<time()-300)delete_option($key);return add_option($key,time(),'','no')?$key:false;}
    private static function details($id){$state=get_post_meta($id,'_gapnext_state',true);return ['saved'=>true,'expired'=>$state==='timed_out','completed'=>$state==='completed','deadline'=>(int)get_post_meta($id,'_gapnext_deadline',true),'remaining_seconds'=>max(0,(int)get_post_meta($id,'_gapnext_deadline',true)-time())];}
    public static function begin($raw){
        $session=$raw['staff_session']??'';if(!is_string($session)||!preg_match('/^[a-f0-9]{64}$/D',$session))return new \WP_Error('staff_session','Unable to start this staff inquiry.');
        if($id=self::record($session))return self::autosave($raw,!empty($raw['staff_finish']));
        $payload=self::payload($raw);$hasData=false;foreach($payload as $field=>$value){if(in_array($field,['staff_name','email_domain_confirmed'],true))continue;if(is_array($value)?count(array_filter($value,function($v){return $v!=='';}))>0:$value!==''){$hasData=true;break;}}if(!$hasData)return new \WP_Error('staff_empty','Enter a customer or event detail to start the inquiry.');
        $ip=(string)($_SERVER['REMOTE_ADDR']??'');$rate='gapnext_staff_starts_'.hash_hmac('sha256',$ip,wp_salt('nonce'));$n=(int)get_transient($rate);if($n>=60)return new \WP_Error('staff_limit','Too many new staff inquiries. Please contact a manager.');
        $map=self::lookup($session);$claim=get_option($map);if(is_numeric($claim)&&(int)$claim<0&&abs((int)$claim)<time()-60)delete_option($map);if(!add_option($map,-time(),'','no'))return new \WP_Error('staff_busy','This inquiry is being saved. Please wait and try again.');
        $elapsed=isset($raw['staff_elapsed'])&&is_numeric($raw['staff_elapsed'])?max(0,min(self::WINDOW,(int)$raw['staff_elapsed'])):0;$started=time()-$elapsed;$deadline=$started+self::WINDOW;
        $id=wp_insert_post(['post_type'=>self::TYPE,'post_status'=>'private','post_title'=>'Unfinished staff inquiry — '.gmdate('Y-m-d H:i',$started)],true);
        if(is_wp_error($id)){delete_option($map);return $id;}
        update_option($map,$id,false);set_transient($rate,$n+1,HOUR_IN_SECONDS);
        update_post_meta($id,'_gapnext_session_map',$map);update_post_meta($id,'_gapnext_started',$started);update_post_meta($id,'_gapnext_deadline',$deadline);update_post_meta($id,'_gapnext_expires',$deadline+self::RETENTION);update_post_meta($id,'_gapnext_state',$deadline<=time()?'timed_out':'active');update_post_meta($id,'_gapnext_test',Plugin::test_mode()?'yes':'no');
        update_post_meta($id,'_gapnext_payload',wp_slash(self::payload($raw)));update_post_meta($id,'_gapnext_last_activity',time());
        if($deadline>time())wp_schedule_single_event($deadline,'gapnext_staff_expire',[$id]);
        wp_schedule_single_event($deadline+self::RETENTION,'gapnext_staff_delete',[$id]);
        return self::details($id);
    }
    public static function autosave($raw,$finish=false){
        $id=self::record($raw['staff_session']??'');if(!$id)return new \WP_Error('staff_missing','This staff inquiry is no longer available. Please start another inquiry.');
        $lock=self::lock($id);if(!$lock)return new \WP_Error('staff_busy','This inquiry is being saved. Please wait and try again.');
        try{
            $state=get_post_meta($id,'_gapnext_state',true);$deadline=(int)get_post_meta($id,'_gapnext_deadline',true);
            if($state==='completed')return self::details($id);
            if(time()>=$deadline){
                if($finish&&time()<=$deadline+60&&!get_post_meta($id,'_gapnext_final_payload',true)){
                    $payload=self::payload($raw);if($payload!==get_post_meta($id,'_gapnext_payload',true)){update_post_meta($id,'_gapnext_payload',wp_slash($payload));update_post_meta($id,'_gapnext_last_activity',min(time(),$deadline));}update_post_meta($id,'_gapnext_final_payload','yes');
                }
                update_post_meta($id,'_gapnext_state','timed_out');return self::details($id);
            }
            if($state!=='active')return self::details($id);
            $payload=self::payload($raw);if($payload!==get_post_meta($id,'_gapnext_payload',true)){update_post_meta($id,'_gapnext_payload',wp_slash($payload));update_post_meta($id,'_gapnext_last_activity',time());}
            return self::details($id);
        }finally{delete_option($lock);}
    }
    public static function submit($raw){
        $id=self::record($raw['staff_session']??'');if(!$id)return new \WP_Error('staff_missing','Please wait for the staff inquiry to save, then submit again.');
        $lock=self::lock($id);if(!$lock)return new \WP_Error('staff_busy','This inquiry is being saved. Please wait and try again.');
        try{
            $existing=(int)get_post_meta($id,'_gapnext_inquiry_id',true);if($existing&&get_post_type($existing)===Plugin::TYPE)return $existing;
            if(get_post_meta($id,'_gapnext_state',true)!=='active'||time()>=(int)get_post_meta($id,'_gapnext_deadline',true)){update_post_meta($id,'_gapnext_state','timed_out');return new \WP_Error('staff_expired','The 15-minute window has ended. The unfinished inquiry is saved for a manager.');}
            $data=self::payload($raw);$source=['source'=>'staff','staff_name'=>$data['staff_name']?:'Staff member not identified','started_at'=>(int)get_post_meta($id,'_gapnext_started',true)];
            $result=Plugin::save($data,$source,(int)get_post_meta($id,'_gapnext_deadline',true));
            if(is_wp_error($result)){if($result->get_error_code()==='staff_expired')update_post_meta($id,'_gapnext_state','timed_out');return $result;}
            update_post_meta($id,'_gapnext_inquiry_id',$result);update_post_meta($id,'_gapnext_state','completed');delete_post_meta($id,'_gapnext_payload');wp_update_post(['ID'=>$id,'post_title'=>'Completed staff inquiry session']);wp_clear_scheduled_hook('gapnext_staff_expire',[$id]);
            return $result;
        }finally{delete_option($lock);}
    }
    public static function ajax(){
        nocache_headers();$raw=wp_unslash($_POST);
        if(!self::authorise($raw))wp_send_json_error(['message'=>'This staff form session expired. Please refresh the staff link.'],403);
        if(!empty($raw['website']))wp_send_json_error(['message'=>'Unable to save this request.'],400);
        $op=$raw['action']??'';$result=$op==='gapnext_staff_begin'?self::begin($raw):self::autosave($raw,$op==='gapnext_staff_finish');
        if(is_wp_error($result))wp_send_json_error(['message'=>$result->get_error_message()],$result->get_error_code()==='staff_busy'?409:400);
        wp_send_json_success($result);
    }
    public static function expire($id){
        if(get_post_type($id)!==self::TYPE||get_post_meta($id,'_gapnext_state',true)!=='active')return;
        $deadline=(int)get_post_meta($id,'_gapnext_deadline',true);if($deadline>time())return;
        $lock=self::lock($id);if(!$lock){wp_schedule_single_event(time()+30,'gapnext_staff_expire',[$id]);return;}
        try{if(get_post_meta($id,'_gapnext_state',true)==='active')update_post_meta($id,'_gapnext_state','timed_out');}finally{delete_option($lock);}
    }
    public static function delete_expired($id){
        if(get_post_type($id)!==self::TYPE||(int)get_post_meta($id,'_gapnext_expires',true)>time())return;
        $map=get_post_meta($id,'_gapnext_session_map',true);if($map)delete_option($map);delete_option('gapnext_staff_lock_'.$id);wp_clear_scheduled_hook('gapnext_staff_expire',[$id]);wp_clear_scheduled_hook('gapnext_staff_delete',[$id]);wp_delete_post($id,true);
    }
    public static function cleanup(){
        foreach(get_posts(['post_type'=>self::TYPE,'post_status'=>'private','numberposts'=>-1,'fields'=>'ids']) as $id){self::expire($id);self::delete_expired($id);}
    }
    public static function unfinished($start,$end){
        self::cleanup();$rows=[];
        foreach(get_posts(['post_type'=>self::TYPE,'post_status'=>'private','numberposts'=>-1,'fields'=>'ids','meta_query'=>[['key'=>'_gapnext_state','value'=>'timed_out']]]) as $id){
            if(get_post_meta($id,'_gapnext_test',true)==='yes')continue;
            $started=(int)get_post_meta($id,'_gapnext_started',true);if($started<$start->getTimestamp()||$started>=$end->getTimestamp())continue;
            $data=get_post_meta($id,'_gapnext_payload',true);if(!is_array($data))continue;
            $rows[]=['id'=>$id,'data'=>$data,'started'=>$started,'last_activity'=>(int)get_post_meta($id,'_gapnext_last_activity',true),'deadline'=>(int)get_post_meta($id,'_gapnext_deadline',true),'remaining_seconds'=>max(0,(int)get_post_meta($id,'_gapnext_deadline',true)-time()),'expires'=>(int)get_post_meta($id,'_gapnext_expires',true)];
        }
        usort($rows,function($a,$b){return $a['started']<=>$b['started'];});return $rows;
    }
    public static function missing($data){
        $result=(new Engine())->validate($data);$labels=['first_name'=>'First name','last_name'=>'Last name','company'=>'Organization','event_type'=>'Event type','email'=>'Email','phone'=>'Phone','dates'=>'Event date','time'=>'Start time','adults'=>'Adults','children'=>'Children','duration'=>'Duration','other_hours'=>'Other duration','food'=>'Food & beverages','private_room'=>'Private room','craft'=>'Craft beverages','has_budget'=>'Budget answer','budget'=>'Budget amount','description'=>'Event purpose','referral'=>'Referral'];
        $out=[];foreach($result['errors'] as $key=>$message)$out[]=strpos($key,'attractions.')===0?(Engine::ATTRACTIONS[substr($key,12)]??$key):($labels[$key]??$key);return $out;
    }
    public static function review_url($id){return admin_url('admin.php?page=gapnext-staff&draft='.(int)$id);}
    public static function page(){
        if(!current_user_can('manage_options'))return;
        self::cleanup();echo '<div class="wrap"><h1>Staff Intake & Unfinished Inquiries</h1><p>Bookmark this unlisted staff link. Employees enter their name; no WordPress login or access code is required. Anyone with the link can submit, but saved inquiries and unfinished records require administrator access.</p><input type="url" readonly style="width:100%;max-width:1000px" aria-label="Unlisted staff intake link" value="'.esc_attr(self::url()).'"><p>15-minute completion window. Unfinished records are deleted 14 days after timeout. Public customer forms do not save drafts.</p>';
        if(isset($_GET['draft'])){
            $id=absint($_GET['draft']);$data=get_post_meta($id,'_gapnext_payload',true);
            if(get_post_type($id)!==self::TYPE||!is_array($data))echo '<p>This unfinished inquiry is unavailable or has been deleted under the retention policy.</p>';
            else{echo '<h2>Unfinished inquiry #'.esc_html($id).'</h2><p>No customer email or recommendation has been generated.</p><table class="widefat striped"><tbody>';foreach($data as $key=>$value)echo '<tr><th>'.esc_html(ucwords(str_replace('_',' ',$key))).'</th><td>'.nl2br(esc_html(is_array($value)?wp_json_encode($value,JSON_UNESCAPED_UNICODE):(string)$value)).'</td></tr>';echo '</tbody></table><p>Missing / invalid: '.esc_html(implode(', ',self::missing($data))).'</p>';}
        }else{
            $ids=get_posts(['post_type'=>self::TYPE,'post_status'=>'private','numberposts'=>200,'orderby'=>'date','order'=>'DESC','meta_query'=>[['key'=>'_gapnext_state','value'=>'completed','compare'=>'!=']]]);
            echo '<h2>Recent unfinished staff inquiries</h2><table class="widefat striped"><thead><tr><th>Started</th><th>Customer</th><th>Staff member</th><th>Status</th><th>Record</th></tr></thead><tbody>';
            foreach($ids as $post){$d=get_post_meta($post->ID,'_gapnext_payload',true);echo '<tr><td>'.esc_html(wp_date('M j, Y g:i A',(int)get_post_meta($post->ID,'_gapnext_started',true),new \DateTimeZone(Reports::ZONE))).'</td><td>'.esc_html(trim(($d['first_name']??'').' '.($d['last_name']??''))?:'Not provided').'</td><td>'.esc_html(($d['staff_name']??'')?:'Staff member not identified').'</td><td>'.esc_html(get_post_meta($post->ID,'_gapnext_state',true)).'</td><td><a href="'.esc_url(self::review_url($post->ID)).'">Review draft</a></td></tr>';}
            echo '</tbody></table>';
        }
        echo '</div>';
    }
}
