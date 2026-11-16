<?php
namespace Generations\PlannerNext;

/** Structured whole-group packages built from the existing attraction/catalog rules. */
final class Packages {
    const OPTION='gapnext_custom_packages';
    public static function boot(){
        add_action('admin_menu',function(){add_submenu_page('gapnext','Packages','Packages','manage_options','gapnext-packages',[__CLASS__,'page']);});
        add_action('admin_post_gapnext_package_save',[__CLASS__,'save']);
    }
    public static function food_labels(){return ['combo'=>'Pizza & pitcher combos','boneless'=>'36-piece boneless wing platters','traditional'=>'36-piece traditional wing platters','pitcher'=>'Separate fountain pitchers','salad'=>'Salad pans','pretzels'=>'Pretzel platters','strips'=>'Chicken strip platters','boards'=>'Sets of veggie, fruit & cheese boards','cookies'=>'Cookie trays','brownies'=>'Brownie trays'];}
    public static function defaults(){
        $p=['id'=>'','name'=>'','status'=>'draft','price'=>'0.00','basis'=>'person','size'=>'1','minimum'=>'1','maximum'=>'50','audience'=>'all','minimum_age'=>'0','days'=>['1','2','3','4','5','6','7'],'event_types'=>Engine::EVENT_TYPES,'from_date'=>'','to_date'=>'','from_time'=>'00:00','to_time'=>'23:59','bowling'=>'0','shoes'=>'0','axe'=>'0','laser_games'=>'0','laser_access'=>'0','golf'=>'0','climbs'=>'0','arcade'=>'0','credit'=>'0.00','bar'=>'none','food_amount'=>'0.00','room'=>'none','room_minutes'=>'0','notes'=>''];
        foreach(self::food_labels() as $k=>$v)$p['food_'.$k]='0';return $p;
    }
    private static function money($v){if(!is_string($v)||!preg_match('/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/D',$v))return null;$a=explode('.',$v);$n=(int)$a[0]*100+(int)str_pad($a[1]??'',2,'0');return $n<=1000000000?$n:null;}
    private static function date_ok($v){$d=\DateTimeImmutable::createFromFormat('!Y-m-d',$v);return $d&&$d->format('Y-m-d')===$v;}
    public static function validate($raw){
        if(!is_array($raw))return new \WP_Error('package','Package information is missing.');$p=[];
        foreach(self::defaults() as $k=>$v)if(!in_array($k,['days','event_types'],true)){
            if(!isset($raw[$k])||!is_string($raw[$k]))return new \WP_Error('package','Complete every package field before saving.');$p[$k]=$raw[$k];
        }
        $p['name']=sanitize_text_field($p['name']);$p['notes']=sanitize_textarea_field($p['notes']);
        if($p['name']===''||strlen($p['name'])>120||strlen($p['notes'])>2000)return new \WP_Error('package','Enter a package name (up to 120 characters) and notes up to 2,000 characters.');
        if($p['id']!==''&&!preg_match('/^[a-f0-9-]{36}$/D',$p['id']))return new \WP_Error('package','Invalid package ID.');
        foreach(['status'=>['draft','active','archived'],'basis'=>['person','group'],'audience'=>['all','adults','children'],'bar'=>['none','fajita','slider','bbq'],'room'=>['none','lower','upper','cove']] as $key=>$allowed)if(!in_array($p[$key],$allowed,true))return new \WP_Error('package','Choose a valid '.$key.'.');
        foreach(['price','credit','food_amount'] as $k){$p[$k]=self::money($p[$k]);if($p[$k]===null)return new \WP_Error('package','Enter dollar amounts with up to two decimal places.');}
        if($p['food_amount']>$p['price'])return new \WP_Error('package','The taxable food/beverage portion cannot exceed the package price.');
        foreach(['size'=>[1,999],'minimum'=>[1,999],'maximum'=>[1,999],'minimum_age'=>[0,99],'bowling'=>[0,120],'axe'=>[0,60],'laser_games'=>[0,10],'laser_access'=>[0,180],'climbs'=>[0,10],'room_minutes'=>[0,180]] as $k=>$bounds){
            if(!preg_match('/^[0-9]+$/D',$p[$k])||(int)$p[$k]<$bounds[0]||(int)$p[$k]>$bounds[1])return new \WP_Error('package','Invalid whole-number value for '.$k.'.');$p[$k]=(int)$p[$k];
        }
        if($p['basis']==='person')$p['size']=1;
        if($p['minimum']>$p['maximum'])return new \WP_Error('package','Minimum guests cannot exceed maximum guests.');
        if(!in_array($p['bowling'],[0,30,60,120],true)||!in_array($p['axe'],[0,30,60],true))return new \WP_Error('package','Use supported purchased bowling and axe durations.');
        foreach(['shoes','golf','arcade'] as $k){if(!in_array($p[$k],['0','1'],true))return new \WP_Error('package','Invalid inclusion selection.');$p[$k]=$p[$k]==='1';}
        if($p['shoes']&&!$p['bowling'])return new \WP_Error('package','Included shoes require bowling.');
        if($p['laser_games']&&$p['laser_access'])return new \WP_Error('package','Choose laser games OR a laser access window, rather than promising both.');
        if($p['arcade']&&$p['credit']===0)return new \WP_Error('package','An arcade package must include funded play credit.');
        foreach(self::food_labels() as $k=>$v){$key='food_'.$k;if(!preg_match('/^[0-9]+$/D',$p[$key])||(int)$p[$key]>99)return new \WP_Error('package','Food quantities must be whole numbers from 0 to 99 per purchased unit.');$p[$key]=(int)$p[$key];}
        if($p['bar']!=='none'&&($p['minimum']<15||$p['food_combo']||$p['food_boneless']||$p['food_traditional']))return new \WP_Error('package','Catering-bar packages need at least 15 guests and cannot also define pizza/wing meal quantities.');
        if(($p['room']==='none')!==($p['room_minutes']===0))return new \WP_Error('package','Select both an included room and its purchased room time, or neither.');
        if($p['room']!=='none'&&$p['maximum']>['lower'=>34,'upper'=>44,'cove'=>150][$p['room']])return new \WP_Error('package','Maximum guests exceed the included room’s seated capacity.');
        $food=self::has_food($p);if($p['price']>0&&$food&&$p['food_amount']===0)return new \WP_Error('package','Enter the food/beverage portion of this package price so tax can be calculated.');
        if(!$food&&$p['food_amount'])return new \WP_Error('package','A food/beverage tax allocation requires an included food or pitcher item.');
        if($p['status']==='active'&&!$p['bowling']&&!$p['axe']&&!$p['laser_games']&&!$p['laser_access']&&!$p['golf']&&!$p['climbs']&&!$p['arcade']&&!$food&&$p['room']==='none')return new \WP_Error('package','Include at least one attraction, food item, or private room before activating.');
        foreach(['days'=>['1','2','3','4','5','6','7'],'event_types'=>Engine::EVENT_TYPES] as $k=>$allowed){$values=$raw[$k]??[];if(!is_array($values)||!$values)return new \WP_Error('package','Select days and event types.');foreach($values as $v)if(!is_string($v)||!in_array($v,$allowed,true))return new \WP_Error('package','Invalid availability choice.');$p[$k]=array_values(array_unique($values));}
        foreach(['from_date','to_date'] as $k)if($p[$k]!==''&&!self::date_ok($p[$k]))return new \WP_Error('package','Use valid availability dates.');
        if($p['from_date']!==''&&$p['to_date']!==''&&$p['from_date']>$p['to_date'])return new \WP_Error('package','The first available date must precede the last date.');
        foreach(['from_time','to_time'] as $k)if(!preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D',$p[$k]))return new \WP_Error('package','Use valid start-window times.');
        if($p['from_time']>$p['to_time'])return new \WP_Error('package','Start windows cannot cross midnight.');
        return $p;
    }
    public static function has_food($p){if($p['bar']!=='none')return true;foreach(self::food_labels() as $k=>$v)if(!empty($p['food_'.$k]))return true;return false;}
    public static function raw($p){$out=self::defaults();foreach($out as $k=>$v)if(array_key_exists($k,$p))$out[$k]=is_array($p[$k])?$p[$k]:(is_bool($p[$k])?($p[$k]?'1':'0'):(string)$p[$k]);foreach(['price','credit','food_amount'] as $k)$out[$k]=isset($p[$k])&&is_int($p[$k])?number_format($p[$k]/100,2,'.',''):'';return $out;}
    public static function all(){
        if(!function_exists('get_option'))return [];$data=get_option(self::OPTION,[]);if(!is_array($data))return [];$out=[];
        foreach(array_slice($data,0,100,true) as $id=>$p){if(!is_array($p))continue;$v=self::validate(self::raw($p));if(!is_wp_error($v)&&$v['id']===$id)$out[$id]=$v;}return $out;
    }
    public static function active(){return array_slice(array_values(array_filter(self::all(),function($p){return $p['status']==='active';})),0,20);}
    public static function revision(){return substr(hash('sha256',json_encode(function_exists('get_option')?get_option(self::OPTION,[]):[])),0,16);}
    public static function attractions($p){$out=[];foreach(['bowling'=>'bowling','axe'=>'axe','golf'=>'golf','climbs'=>'climbing','arcade'=>'arcade'] as $k=>$a)if($p[$k])$out[]=$a;if($p['laser_games']||$p['laser_access'])$out[]='laser';return $out;}
    public static function eligible($p,$d,$sel,$o,$menu,$date){
        $n=$d['guests'];$day=(string)(new \DateTimeImmutable($date))->format('N');
        if($n<$p['minimum']||$n>$p['maximum']||!in_array($day,$p['days'],true)||!in_array($d['event_type'],$p['event_types'],true)||$d['time']<$p['from_time']||$d['time']>$p['to_time']||($p['from_date']!==''&&$date<$p['from_date'])||($p['to_date']!==''&&$date>$p['to_date']))return false;
        if(($p['audience']==='adults'&&$d['children']>0)||($p['audience']==='children'&&$d['adults']>0)||array_diff(self::attractions($p),$sel))return false;
        if(self::has_food($p)&&$menu==='none')return false;
        if($p['food_combo']&&!in_array($menu,['pizza','pizza_wings'],true))return false;
        if(($p['food_boneless']||$p['food_traditional'])&&!in_array($menu,['pizza_wings','wings','appetizers'],true))return false;
        $text=strtolower($d['description'].' '.$d['comments']);$wing=$o['wing_type']??(preg_match('/\btraditional\s+wings\b/',$text)&&!preg_match('/\b(?:no|not|without)\s+traditional\s+wings\b/',$text)?'traditional':'boneless');
        if(($p['food_boneless']&&$wing!=='boneless')||($p['food_traditional']&&$wing!=='traditional'))return false;
        if($p['bar']!=='none'&&$p['bar']!==$menu)return false;
        if($p['room']!=='none'&&($d['private_room']!=='yes'||(isset($o['room'])&&$o['room']!==$p['room'])||max($d['minutes'],(float)($o['room_hours']??0)*60)>$p['room_minutes']))return false;
        if($p['bowling']&&isset($o['bowling_hours'])&&$p['bowling']!==(int)round((float)$o['bowling_hours']*60))return false;
        if($p['axe']&&isset($o['axe_minutes'])&&$p['axe']!==(int)$o['axe_minutes'])return false;
        return true;
    }
    public static function save(){
        if(!current_user_can('manage_options'))wp_die('Not allowed.');check_admin_referer('gapnext_package_save');$raw=wp_unslash($_POST);$p=self::validate($raw['package']??null);$all=self::all();$message='';
        if(is_wp_error($p))$message=$p->get_error_message();
        elseif(!isset($raw['revision'])||!is_string($raw['revision'])||!hash_equals(self::revision(),$raw['revision']))$message='Packages changed while this page was open. Reload before saving.';
        elseif($p['id']!==''&&!isset($all[$p['id']]))$message='This package no longer exists.';
        elseif($p['id']===''&&count($all)>=100)$message='The package library is limited to 100 entries.';
        else{
            if($p['id']==='')$p['id']=wp_generate_uuid4();$next=$all;$next[$p['id']]=$p;$active=count(array_filter($next,function($v){return $v['status']==='active';}));
            if($active>20)$message='Keep no more than 20 custom packages active at once.';
            else{update_option(self::OPTION,$next,false);$message='Package saved. Active packages are compared for new inquiries and manual recalculations. Existing inquiry totals are unchanged.';}
        }
        if(is_wp_error($p)){
            $retry=self::defaults();$source=is_array($raw['package']??null)?$raw['package']:[];
            foreach($retry as $key=>$v){if(is_array($v)){$retry[$key]=isset($source[$key])&&is_array($source[$key])?array_values(array_intersect(array_filter($source[$key],'is_string'),$v)):[];}elseif(isset($source[$key])&&is_string($source[$key]))$retry[$key]=substr($source[$key],0,2000);}
            set_transient('gapnext_package_input_'.get_current_user_id(),$retry,5*MINUTE_IN_SECONDS);
        }
        set_transient('gapnext_package_notice_'.get_current_user_id(),$message,5*MINUTE_IN_SECONDS);wp_safe_redirect(admin_url('admin.php?page=gapnext-packages'.(!is_wp_error($p)&&$p['id']!==''?'&edit='.rawurlencode($p['id']):'')));exit;
    }
    private static function input($p,$key,$label,$type='number',$min='0',$max='999',$step='1'){
        echo '<p><label for="pkg-'.esc_attr($key).'">'.esc_html($label).'</label><br><input id="pkg-'.esc_attr($key).'" name="package['.esc_attr($key).']" type="'.esc_attr($type).'" value="'.esc_attr($p[$key]).'" '.($type==='number'?'min="'.esc_attr($min).'" max="'.esc_attr($max).'" step="'.esc_attr($step).'"':'').' '.(in_array($type,['date'],true)?'':'required').' style="width:320px;max-width:100%"></p>';
    }
    private static function select($p,$key,$label,$options){echo '<p><label for="pkg-'.esc_attr($key).'">'.esc_html($label).'</label><br><select id="pkg-'.esc_attr($key).'" name="package['.esc_attr($key).']">';foreach($options as $v=>$text)echo '<option value="'.esc_attr($v).'" '.selected((string)$p[$key],(string)$v,false).'>'.esc_html($text).'</option>';echo '</select></p>';}
    public static function page(){
        if(!current_user_can('manage_options'))return;$all=self::all();$edit=isset($_GET['edit'])&&is_string($_GET['edit'])?$_GET['edit']:'';$p=isset($all[$edit])?self::raw($all[$edit]):self::defaults();
        $retry=get_transient('gapnext_package_input_'.get_current_user_id());if(is_array($retry)){$p=$retry;delete_transient('gapnext_package_input_'.get_current_user_id());}
        echo '<div class="wrap"><h1>Packages</h1><p>Create whole-group packages using the existing attractions and catering items. Drafts are saved without entering recommendations. Activate a package when its price, inclusions and availability are ready.</p><p>Standard packages keep their existing inclusions; edit their prices in <a href="'.esc_url(admin_url('admin.php?page=gapnext-prices')).'">Prices &amp; Attachments</a>. This editor manages additional custom packages.</p>';
        $notice=get_transient('gapnext_package_notice_'.get_current_user_id());if(is_string($notice)&&$notice!==''){delete_transient('gapnext_package_notice_'.get_current_user_id());echo '<div class="notice notice-info"><p>'.esc_html($notice).'</p></div>';}
        echo '<h2>Custom package library</h2><p><a class="button" href="'.esc_url(admin_url('admin.php?page=gapnext-packages')).'">Add package</a></p><table class="widefat striped" style="max-width:1000px"><thead><tr><th>Name</th><th>Status</th><th>Price</th><th>Guests</th><th></th></tr></thead><tbody>';
        foreach($all as $id=>$v)echo '<tr><td>'.esc_html($v['name']).'</td><td>'.esc_html(ucfirst($v['status'])).'</td><td>'.esc_html(Engine::money($v['price']).($v['basis']==='person'?' / person':' / up to '.$v['size'].' guests')).'</td><td>'.esc_html($v['minimum'].'–'.$v['maximum']).'</td><td><a href="'.esc_url(admin_url('admin.php?page=gapnext-packages&edit='.$id)).'">Edit</a></td></tr>';
        if(!$all)echo '<tr><td colspan="5">No custom packages yet.</td></tr>';echo '</tbody></table><h2>'.($p['id']!==''?'Edit package':'New package').'</h2><form method="post" action="'.esc_url(admin_url('admin-post.php')).'" style="max-width:1000px"><input type="hidden" name="action" value="gapnext_package_save"><input type="hidden" name="revision" value="'.esc_attr(self::revision()).'"><input type="hidden" name="package[id]" value="'.esc_attr($p['id']).'">';wp_nonce_field('gapnext_package_save');
        self::input($p,'name','Package name','text');self::select($p,'status','Status',['draft'=>'Draft — do not recommend','active'=>'Active — compare when eligible','archived'=>'Archived — retain but do not recommend']);self::input($p,'price','Package price before tax ($)','number','0','10000000','0.01');self::select($p,'basis','Price applies to',['person'=>'Each person','group'=>'A purchased group package']);self::input($p,'size','Guests covered by one group package (ignored for per-person pricing)','number','1');self::input($p,'minimum','Minimum total event guests','number','1');self::input($p,'maximum','Maximum total event guests','number','1');self::select($p,'audience','Eligible group',['all'=>'Adults, children or mixed','adults'=>'Adults only','children'=>'Children only — no adults in participating group']);self::input($p,'minimum_age','Additional minimum age (0 = venue rules only)','number','0','99');
        echo '<h3>Availability</h3><p>Times below are inclusive limits on the requested event start time. Venue availability and participant ages still require staff confirmation.</p><fieldset><legend>Days</legend>';foreach([1=>'Monday',2=>'Tuesday',3=>'Wednesday',4=>'Thursday',5=>'Friday',6=>'Saturday',7=>'Sunday'] as $n=>$label)echo '<label style="margin-right:14px"><input type="checkbox" name="package[days][]" value="'.esc_attr($n).'" '.checked(in_array((string)$n,$p['days'],true),true,false).'>'.esc_html($label).'</label>';echo '</fieldset><fieldset style="margin-top:15px"><legend>Event types</legend>';foreach(Engine::EVENT_TYPES as $type)echo '<label style="display:inline-block;margin-right:14px"><input type="checkbox" name="package[event_types][]" value="'.esc_attr($type).'" '.checked(in_array($type,$p['event_types'],true),true,false).'>'.esc_html($type).'</label>';echo '</fieldset>';
        foreach(['from_date'=>'First available date (optional)','to_date'=>'Last available date (optional)'] as $key=>$label)self::input($p,$key,$label,'date');self::input($p,'from_time','Earliest event start','time');self::input($p,'to_time','Latest event start','time');
        echo '<h3>Activities included for each participant</h3><p>Use 0 or No for items not included. Bowling and axe use purchased play minutes; every axe rotation adds its own 15-minute briefing. Leisure attractions are not assigned fixed turns.</p>';
        self::select($p,'bowling','Bowling minutes',[0=>'None',30=>'30',60=>'60',120=>'120']);self::select($p,'shoes','Bowling shoes included?',[0=>'No — add normal shoe rental',1=>'Yes']);self::select($p,'axe','Axe throwing minutes',[0=>'None',30=>'30',60=>'60']);self::input($p,'laser_games','Laser games per guest (use games OR access window)','number','0','10');self::input($p,'laser_access','Laser access window minutes (0 = none)','number','0','180');self::select($p,'golf','One mini golf round per guest?',[0=>'No',1=>'Yes']);self::input($p,'climbs','Climbs per guest (0 = none)','number','0','10');self::select($p,'arcade','Package is intended to include arcade?',[0=>'No — any card is a bonus',1=>'Yes']);self::input($p,'credit','Included play credit per purchased price unit ($)','number','0','10000000','0.01');
        echo '<h3>Included food and private room</h3><p>Food quantities below are whole items per purchased price unit: per guest for per-person prices, or per purchased group package. Whole pizza/pitcher combos offset additional combos; separate pitchers offset separate pitcher purchases. No food packages are offered when the guest declines food.</p>';
        foreach(self::food_labels() as $key=>$label)self::input($p,'food_'.$key,$label.' / purchased unit','number','0','99');self::select($p,'bar','Full catering bar for all participating guests',['none'=>'None','fajita'=>'Fajita Bar','slider'=>'Slider Bar','bbq'=>'Smokehouse BBQ Bar']);self::input($p,'food_amount','Food/beverage portion of each package price for tax ($)','number','0','10000000','0.01');
        self::select($p,'room','Included private room',['none'=>'None','lower'=>'Lower Event Room — up to 34 seated','upper'=>'Skybox — up to 44 seated','cove'=>'Climbers Cove — up to 150 seated']);self::input($p,'room_minutes','Included room minutes (0 without room; up to 180)','number','0','180');
        echo '<p><label for="pkg-notes">Internal package notes</label><br><textarea id="pkg-notes" name="package[notes]" rows="4" style="width:650px;max-width:100%" maxlength="2000">'.esc_textarea($p['notes']).'</textarea></p><p>Packages apply to the whole participating group. Only one custom package is used in a candidate; remaining requested activities and food are priced separately. Specials are compared with the package, not automatically applied to its price. Update your published attachments separately when needed.</p>';submit_button('Save package');echo '</form></div>';
    }
}
