<?php
namespace Generations\PlannerNext;

/** Pure PHP planner. Money is integer cents. No WordPress or network dependencies. */
final class Engine {
    const ATTRACTIONS = ['bowling'=>'Bowling','axe'=>'Axe Throwing','laser'=>'Laser Tag','golf'=>'Mini Golf','climbing'=>'Climbing','arcade'=>'Arcade'];
    const EVENT_TYPES=['Birthday','Corporate or Team Event','Sports Team','School or Youth Group','Family or Social Gathering','Other'];
    private $c;
    private $packages=[];
    public function __construct() { $this->c = Catalog::all();$this->packages=class_exists(Packages::class,false)?Packages::active():[]; }
    public static function money($cents) { return '$'.number_format($cents/100,2); }
    private static function scalar($v) { return is_string($v)||is_int($v)||is_float($v); }
    public function validate($raw) {
        $e=[];$d=[];
        foreach(['first_name','last_name','company','event_type','phone','email','time','duration','food','private_room','craft','has_budget','description','referral'] as $f) {
            $d[$f]=isset($raw[$f])&&self::scalar($raw[$f])?trim((string)$raw[$f]):'';
            if($d[$f]==='')$e[$f]='Please complete this field.';
            if(strlen($d[$f])>4000)$e[$f]='Please use fewer than 4,000 characters.';
        }
        if(!in_array($d['event_type'],self::EVENT_TYPES,true))$e['event_type']='Choose an event type.';
        if(!filter_var($d['email'],FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$d['email']))$e['email']='Enter a valid email address.';
        if(!preg_match('/^[+()0-9 .x-]{7,30}$/i',$d['phone'])||strlen(preg_replace('/\D/','',$d['phone']))<7)$e['phone']='Enter a valid phone number.';
        if(!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/',$d['time']))$e['time']='Choose a valid start time.';
        $dates=$raw['dates']??[];if(!is_array($dates))$dates=[];$d['dates']=[];
        if(count($dates)<1||count($dates)>5)$e['dates']='Choose between one and five preferred dates.';
        foreach($dates as $s) {
            if(!is_string($s)||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$s)){$e['dates']='Choose valid dates.';continue;}
            $x=\DateTimeImmutable::createFromFormat('!Y-m-d',$s);
            if(!$x||$x->format('Y-m-d')!==$s)$e['dates']='Choose valid dates.';else $d['dates'][]=$s;
        }
        $d['dates']=array_values(array_unique($d['dates']));
        foreach(['adults','children'] as $f) {
            $v=$raw[$f]??null;
            if(!self::scalar($v)||!preg_match('/^\d{1,3}$/',(string)$v)){$e[$f]='Enter a whole-number guest count.';$d[$f]=0;}
            else $d[$f]=(int)$v;
        }
        $d['guests']=$d['adults']+$d['children'];
        if($d['guests']<1||$d['guests']>999)$e['adults']='Enter a combined guest count between 1 and 999.';
        if(!in_array($d['duration'],['2 hours','3 hours','Other'],true))$e['duration']='Choose an event duration.';
        $v=$raw['other_hours']??'';
        if($d['duration']==='Other'&&(!self::scalar($v)||!is_numeric($v)||(float)$v<=0||(float)$v>24))$e['other_hours']='Enter the desired duration in hours, up to 24.';
        $d['minutes']=$d['duration']==='2 hours'?120:($d['duration']==='3 hours'?180:(is_numeric($v)?(int)round((float)$v*60):0));
        $d['other_hours']=$d['duration']==='Other'?(float)(is_numeric($v)?$v:0):null;
        foreach(['food','private_room','craft','has_budget'] as $f)if(!in_array($d[$f],['yes','no'],true))$e[$f]='Choose Yes or No.';
        $b=$raw['budget']??'';
        if($d['has_budget']==='yes'&&(!self::scalar($b)||!is_numeric($b)||(float)$b<=0||(float)$b>10000000))$e['budget']='Enter a positive total event budget.';
        $d['budget']=$d['has_budget']==='yes'&&is_numeric($b)?(int)round((float)$b*100):null;
        $d['attractions']=[];
        foreach(self::ATTRACTIONS as $k=>$label){$a=$raw['attractions'][$k]??null;if(!is_string($a)||!in_array($a,['yes','no','open'],true))$e['attractions.'.$k]='Choose an answer for '.$label.'.';else $d['attractions'][$k]=$a;}
        $d['comments']=isset($raw['comments'])&&is_string($raw['comments'])?trim($raw['comments']):'';
        if(strlen($d['comments'])>8000)$e['comments']='Please use fewer than 8,000 characters.';
        return ['valid'=>!$e,'errors'=>$e,'data'=>$d];
    }
    private function line(&$p,$label,$qty,$unit,$taxable=false,$allocation=1.0) {
        if($qty<=0)return;
        $sub=(int)round($qty*$unit);$tax=$taxable?(int)round($sub*.07*$allocation):0;
        $p['items'][]=['label'=>$label,'quantity'=>$qty,'unit_cents'=>$unit,'subtotal_cents'=>$sub,'tax_cents'=>$tax];
        $p['subtotal_cents']+=$sub;$p['tax_cents']+=$tax;$p['total_cents']+=$sub+$tax;
    }
    private function product($label,$tier=0) {return ['name'=>$label,'tier'=>$tier,'items'=>[],'subtotal_cents'=>0,'tax_cents'=>0,'total_cents'=>0,'notes'=>[],'review'=>[],'included_credit_cents'=>0,'included_combos'=>0,'bowling_minutes'=>0,'axe_minutes'=>0,'access_minutes'=>0,'room_included'=>false,'private_activities'=>false];}
    public static function group_sizes($n,$capacity){
        if($n<=0)return [];
        $count=(int)ceil($n/$capacity);$base=(int)floor($n/$count);$extra=$n%$count;$sizes=[];
        for($i=0;$i<$count;$i++)$sizes[]=$base+($i<$extra?1:0);
        return $sizes;
    }
    public static function lanes($n){$lanes=0;foreach(self::group_sizes($n,50) as $size)$lanes+=$size>48?8:(int)ceil($size/6);return $lanes;}
    private function weekday($date){return (int)(new \DateTimeImmutable($date))->format('N');}
    private function foodPath($d,$o){
        if($d['food']==='no')return 'none';
        if(isset($o['menu'])&&in_array($o['menu'],['pizza','pizza_wings','wings','appetizers','fajita','slider','bbq'],true))return $o['menu'];
        $text=strtolower($d['description'].' '.$d['comments']);
        $positive=preg_replace('/\b(?:no|not|without|do not|don\x27t)\b[^,.;\n]*/i','',$text);
        foreach(['fajita'=>'fajita','slider'=>'slider','smokehouse'=>'bbq','bbq'=>'bbq'] as $word=>$path)if(preg_match('/\b'.preg_quote($word,'/').'\b/',$positive))return $path;
        if(preg_match('/\bwings\b/',$positive))return preg_match('/\bpizza\b/',$positive)?'pizza_wings':'wings';
        if(preg_match('/\bpizza\b/',$positive)||preg_match('/\b(?:no|without)\s+(?:boneless\s+|traditional\s+)?wings\b/',$text))return 'pizza';
        return $d['adults']>0&&$d['children']===0?'pizza_wings':'pizza';
    }
    private function food_line(&$p,$label,$quantity,$key){
        $included=min($quantity,$p['included_food'][$key]??0);
        if($included){$p['included_food'][$key]-=$included;$p['notes'][]=$included.' included '.$label.' offset the additional purchase.';}
        $unit=$key==='pitcher'?$this->c['pitcher']:$this->c['food'][$key];$this->line($p,$label,max(0,$quantity-$included),$unit,true);
    }
    /** Show guest cards and top-ups, never a pooled dollar balance as one card. */
    private function arcade_lines(&$p,$d,$target,$applied){
        $groups=!empty($p['child_credit_only'])?
            [['adult',$d['adults'],0],['child',$d['children'],$applied]]:
            [['guest',$d['guests'],$applied]];
        $p['arcade_cards']=[];
        foreach($groups as $group){
            list($audience,$count,$included)=$group;if(!$count)continue;
            $extra=$count*$target-$included;$base=(int)floor($extra/$count);$remainder=$extra%$count;
            foreach([[$count-$remainder,$base],[$remainder,$base+1]] as $part){
                list($quantity,$unit)=$part;if(!$quantity)continue;$includedEach=$target-$unit;
                $label='Arcade credit — '.$audience.' card, '.self::money($target).' total credit';
                if($includedEach)$label.=' ('.self::money($includedEach).' included; '.($unit?'top-up':'no additional charge').')';
                $this->line($p,$label,$quantity,$unit);
                $p['arcade_cards'][]=['audience'=>$audience,'quantity'=>$quantity,'credit_cents'=>$target,'included_cents_each'=>$includedEach,'additional_cents_each'=>$unit];
            }
            $p['notes'][]='Prepare '.$count.' '.$audience.' arcade card'.($count===1?'':'s').' with '.self::money($target).' total credit each: '.self::money($included).' from included credit and '.self::money($extra).' additional funding for this group.';
        }
    }
    private function complete($p,$d,$sel,$o,$menu,$date) {
        $n=$d['guests'];$w=$this->weekday($date);$factor=$w===3?.5:1;
        // Included monetary credit may fund requested flexible attractions. Never schedule a No attraction.
        $need=$p['deferred_play']??[];
        if(in_array('golf',$sel,true)&&empty($p['covers_golf']))$need['Mini golf — one round: '.$d['adults'].' adults + '.$d['children'].' children']=(int)round(($d['adults']*$this->c['golf']['adult']+$d['children']*$this->c['golf']['child'])*$factor);
        if(in_array('climbing',$sel,true)&&empty($p['covers_climbing']))$need['Climbing — one climb per participant']=(int)round(($p['climb_count']??$n)*$this->c['climb']*$factor);
        if(in_array('arcade',$sel,true)&&empty($p['covers_arcade']))$need['Arcade credit']=$n*($p['arcade_target']??1000);
        // Preserve the promised arcade allowance before funding other requested play.
        if(isset($need['Arcade credit']))$need=['Arcade credit'=>$need['Arcade credit']]+$need;
        $credit=$p['included_credit_cents'];
        foreach($need as $label=>$amount){$eligible=$amount;if(!empty($p['child_credit_only'])){$eligible=strpos($label,'Mini golf')===0?(int)round($d['children']*$this->c['golf']['child']*$factor):(strpos($label,'Arcade')===0?$d['children']*1500:0);}$applied=min($credit,$amount,$eligible);$credit-=$applied;$amount-=$applied;if($applied)$p['notes'][]=self::money($applied).' included play credit allocated to '.(!empty($p['child_credit_only'])?'participating children’s ':'').$label.'.';if($label==='Arcade credit')$this->arcade_lines($p,$d,$p['arcade_target']??1000,$applied);else $this->line($p,$label.' (additional funding)',1,$amount);}
        if($credit>0)$p['notes'][]=self::money($credit).' included play credit remains available; no excluded attraction is added to the itinerary.';
        if($menu==='pizza'||$menu==='pizza_wings'){
            $combos=(int)ceil($d['adults']/4+$d['children']/5);
            $this->food_line($p,'Pizza & Pitcher Combo (additional)',max(0,$combos-$p['included_combos']),'combo');
            if($menu==='pizza_wings'){$wing=$this->wingType($d,$o);$this->food_line($p,'36-piece '.$wing.' wing platter',(int)ceil($n*4/36),$wing);}
        }elseif($menu==='wings'){
            $wing=$this->wingType($d,$o);$this->food_line($p,'36-piece '.$wing.' wing platter',(int)ceil($n*4/36),$wing);
            $this->food_line($p,'Fountain beverage pitcher',(int)ceil($d['adults']/4+$d['children']/5),'pitcher');
        }elseif(in_array($menu,['fajita','slider','bbq'],true)){
            $this->food_line($p,['fajita'=>'Fajita Bar','slider'=>'Slider Bar','bbq'=>'Smokehouse BBQ'][$menu],$n,$menu);
            if($n<15)$p['review'][]='Catering bars require at least 15 guests; this requested menu needs staff follow-up.';
            $this->food_line($p,'Fountain beverage pitcher',(int)ceil($d['adults']/4+$d['children']/5),'pitcher');
        }elseif($menu==='appetizers'){
            $wing=$this->wingType($d,$o);$this->food_line($p,'36-piece '.$wing.' wing platter',(int)ceil($n*4/36),$wing);
            $this->food_line($p,'Veggie, fruit and cheese — set of 3 boards',min(4,(int)ceil($n/30)),'boards');
            if($n>120)$p['review'][]='Confirm appetizer quantities above the retained four-set board planning limit.';
            $this->food_line($p,'Cookie tray',(int)ceil($n/20),'cookies');
            $this->food_line($p,'Fountain beverage pitcher',(int)ceil($d['adults']/4+$d['children']/5),'pitcher');
        }
        $extra=$o['extras']??[];
        foreach(['salad','pretzels','strips','brownies','cookies','traditional'] as $k)if(isset($extra[$k])&&is_numeric($extra[$k])&&(int)$extra[$k]>0&&$menu!=='none')$this->food_line($p,ucfirst($k).' platter / tray',(int)$extra[$k],$k);
        $p['dining_minutes']=$menu==='none'?0:((count(array_diff(array_keys($extra),['traditional']))===0&&$n<=25&&in_array('bowling',$sel,true)&&in_array($menu,['pizza','pizza_wings','wings'],true))?0:30);
        if(!empty($p['separate_package_dining'])&&$menu!=='none')$p['dining_minutes']=30;
        if($d['craft']==='yes'){$this->line($p,'Beer Wall drink card — eligible adult estimate',$d['adults'],$this->c['drink_card'],true);$p['review'][]='Verify eligible adult drink-card recipients before finalizing.';}
        if($d['private_room']==='yes'&&!$p['room_included']){
            $room=$n<=34&&!in_array('bowling',$sel,true)&&!in_array('axe',$sel,true)?'lower':($n<=44?'upper':'cove');
            if(isset($o['room'])&&in_array($o['room'],['lower','upper','cove'],true))$room=$o['room'];
            $label=['lower'=>'Lower Event Room','upper'=>'Skybox / Upper Event Room','cove'=>isset($o['room'])&&$o['room']==='cove'?'Climbers Cove':'Private gathering space'][$room];
            $this->line($p,$label.' — 3 hours',1,$this->c['rooms'][$room]);
            if($n>150)$p['review'][]='The requested group exceeds the 150-seat space; seating/private-space configuration requires staff review.';
            $roomHours=isset($o['room_hours'])&&is_numeric($o['room_hours'])&&is_finite((float)$o['room_hours'])?(float)$o['room_hours']:3;
            if($roomHours>3){$extraHours=$roomHours-3;if($room==='cove'){$this->line($p,'Explicitly requested prorated gathering-space extension — '.$extraHours.' hours',1,(int)round($extraHours*$this->c['rooms']['cove']/3));$p['review'][]='Confirm availability for the explicitly requested prorated room extension.';}else $this->line($p,'Explicitly requested extra room hour',(int)ceil($extraHours),$this->c['rooms'][$room==='upper'?'upper_extra':'lower_extra']);}
            elseif($d['minutes']>180)$p['review'][]='Private space is priced for three hours. Confirm whether any room extension is actually requested; no extension has been added automatically.';
        }
        if(in_array('axe',$sel,true))$p['review'][]='Axe eligibility: regular weekdays 10+, weekends 16+; private axe 10+; check actual participants.';
        if(in_array('climbing',$sel,true))$p['review'][]='Climbing participants must weigh at least 40 lbs.';
        if(in_array('laser',$sel,true))$p['review'][]='Laser tag age 4+; play is unscheduled, with no guaranteed number of turns for access passes.';
        if(in_array('golf',$sel,true))$p['review'][]='Confirm outdoor mini golf availability and weather.';
        if($w===1&&in_array('bowling',$sel,true)&&($p['bowl_mode']??'')==='regular')$p['review'][]='Monday regular bowling rate is not published; do not treat this reference estimate as a Monday quote.';
        if($d['comments']!=='')$p['review'][]='Review the customer’s special requests before final approval.';
        $breakfastRequested=$menu!=='none'&&stripos($d['description'].' '.$d['comments'],'breakfast')!==false;
        if($breakfastRequested)$p['review'][]='Breakfast Bar has been removed. Any alternative food shown is provisional and requires staff discussion; no breakfast is quoted.';
        $emptyScope=!$sel&&$menu==='none'&&$d['private_room']==='no';
        if($emptyScope)$p['unpriced']=true;
        if($emptyScope)$p['review'][]='No attraction, dining or private space was requested. Staff follow-up is required before quoting an event.';
        $p['selected_attractions']=$sel;
        $p['itinerary']=$this->schedule($p,$d,$date);
        $rentalConflict=false;
        foreach(['private_bowl_window'=>['Bowling'],'private_axe_window'=>['Axe Check-In & Safety Briefing','Axe Throwing']] as $key=>$labels){
            if(empty($p[$key]))continue;$blocks=array_values(array_filter($p['itinerary'],function($r)use($labels){return in_array($r['label'],$labels,true);}));
            if($blocks){$span=max(array_column($blocks,'end_minute'))-min(array_column($blocks,'start_minute'));if($span>$p[$key]){$rentalConflict=true;$p['review'][]='The cohort schedule exceeds the published private rental window; a different configuration or staff-approved extension is needed.';}}
        }
        if(in_array('bowling',$sel,true)&&max(self::group_sizes($n,50))>48)$p['notes'][]='Large-group rotation uses lane 1’s approved up-to-10 capacity to allow 50-person bowling cohorts. Verify lane 1 availability.';
        $p['per_guest_cents']=(int)round($p['total_cents']/$n);
        $p['fits_duration']=$p['required_minutes']<=$d['minutes'];
        if(!$p['fits_duration'])$p['review'][]='This plan needs '.$p['required_minutes'].' minutes; requested event is '.$d['minutes'].' minutes. Do not shorten purchased play time.';
        $shorterThanRequested=isset($o['axe_minutes'])&&$p['axe_minutes']>0&&$p['axe_minutes']<(int)$o['axe_minutes'];
        if($shorterThanRequested)$p['review'][]='This shorter alternative does not provide the explicitly requested axe duration.';
        $shorterBowling=isset($o['bowling_hours'])&&$p['bowling_minutes']>0&&$p['bowling_minutes']<(float)$o['bowling_hours']*60;
        if($shorterBowling)$p['review'][]='This shorter alternative does not provide the explicitly requested bowling duration.';
        $missingRental=isset($o['rental'])&&in_array($o['rental'],['bowling','axe','laser','mezzanine','full'],true)&&!in_array($o['rental'],$p['rental_kinds']??[],true);
        if($missingRental)$p['review'][]='This configuration does not provide the explicitly requested private attraction rental. Resolve the request before quoting; exclusions remain in force.';
        if(in_array('mezzanine',$p['rental_kinds']??[],true)&&$d['private_room']==='yes'&&$n>44)$p['review'][]='Included Skybox seats 44; confirm the actual gathering/seating arrangement for the larger event.';
        $p['hard_review']=($n<15&&in_array($menu,['fajita','slider','bbq'],true))||($n>150&&$d['private_room']==='yes'&&!$p['room_included'])||$shorterThanRequested||$shorterBowling||$breakfastRequested||$emptyScope||$rentalConflict||$missingRental||!empty($p['missing_leisure_time']);
        $p['budget_over_cents']=$d['budget']===null?0:max(0,$p['total_cents']-$d['budget']);
        return $p;
    }
    private function wingType($d,$o) {
        if(isset($o['wing_type'])&&in_array($o['wing_type'],['boneless','traditional'],true))return $o['wing_type'];
        $text=strtolower($d['description'].' '.$d['comments']);
        return preg_match('/\btraditional\s+wings\b/',$text)&&!preg_match('/\b(?:no|not|without)\s+traditional\s+wings\b/',$text)?'traditional':'boneless';
    }
    private function schedule(&$p,$d,$date) {
        $rows=[];$n=$d['guests'];$offset=$p['dining_minutes'];
        $add=function($start,$end,$label,$cohort='All guests')use(&$rows){$rows[]=['start_minute'=>$start,'end_minute'=>$end,'label'=>$label,'group'=>$cohort];};
        if($offset)$add(0,$offset,'Dining');
        $b=$p['bowling_minutes'];$a=$p['axe_minutes'];$last=$offset;
        if($b&&$a){
            $sizes=self::group_sizes($n,50);$groups=count($sizes);$resource=['b'=> $offset,'a'=>$offset];$jobs=[];
            for($i=0;$i<$groups;$i++)$jobs[]=['id'=>$i,'n'=>$sizes[$i],'order'=>$i%2===0?['b','a']:['a','b'],'step'=>0,'ready'=>$offset];
            for($step=0;$step<$groups*2;$step++){
                $pick=null;$time=PHP_INT_MAX;
                foreach($jobs as $j=>$job){if($job['step']>=2)continue;$op=$job['order'][$job['step']];$prep=$op==='b'&&$job['step']>0?5:0;$start=max($job['ready']+$prep,$resource[$op]);if($start<$time){$time=$start;$pick=$j;}}
                $job=&$jobs[$pick];$op=$job['order'][$job['step']];$label='Group '.chr(65+$job['id']).' — '.$job['n'].' guests';
                if($op==='b'){$prepEnd=$offset>0&&$job['step']===0?0:$time;$add($prepEnd-5,$prepEnd,'Bowling check-in & shoes',$label);$add($time,$time+$b,'Bowling',$label);$end=$time+$b;}
                else{$add($time,$time+15,'Axe Check-In & Safety Briefing',$label);$add($time+15,$time+15+$a,'Axe Throwing',$label);$end=$time+15+$a;}
                $resource[$op]=$end;$job['ready']=$end;$job['step']++;$last=max($last,$end);unset($job);
            }
        }elseif($b){foreach(self::group_sizes($n,50) as $i=>$size){$label='Group '.($i+1).' — '.$size.' guests';$start=$offset+$i*$b;$prepEnd=$offset>0?0:$start;$add($prepEnd-5,$prepEnd,'Bowling check-in & shoes',$label);$add($start,$start+$b,'Bowling',$label);$last=$start+$b;}}
        elseif($a){foreach(self::group_sizes($n,56) as $i=>$size){$label='Group '.($i+1).' — '.$size.' guests';$add($last,$last+15,'Axe Check-In & Safety Briefing',$label);$add($last+15,$last+15+$a,'Axe Throwing',$label);$last+=15+$a;}}
        $flex=array_values(array_intersect(['laser','golf','climbing','arcade'],$p['selected_attractions']));
        $names=array_map(function($k){return self::ATTRACTIONS[$k];},$flex);
        if($p['access_minutes']){
            $accessStart=$last;$last+=$p['access_minutes'];
            $add($accessStart,$last,$p['access_label']??'Laser tag at leisure — access window');
            $otherFlex=array_values(array_diff($flex,!empty($p['covers_climbing'])?['laser','climbing']:['laser']));
            if($otherFlex){$otherNames=array_map(function($k){return self::ATTRACTIONS[$k];},$otherFlex);$add($accessStart,$last,'Enjoy '.implode(', ',$otherNames).' at leisure during this window');}
        }elseif($flex){
            $end=max($d['minutes'],(int)($p['rental_minutes']??0));
            if($end>$last)$add($last,$end,'Enjoy '.implode(', ',$names).' at leisure');
            else{
                // A rotation may leave different free windows for each cohort.
                $groups=[];foreach($rows as $row)if($row['group']!=='All guests')$groups[$row['group']][]=$row;
                $allHaveFree=!empty($groups);
                foreach($groups as $group=>$blocks){
                    usort($blocks,function($x,$y){return $x['start_minute']<=>$y['start_minute'];});$cursor=$offset;$free=false;
                    foreach($blocks as $block){$s=max(0,$block['start_minute']);if($s>$cursor&&$cursor<$end){$add($cursor,min($s,$end),'Enjoy '.implode(', ',$names).' at leisure',$group);$free=true;}$cursor=max($cursor,$block['end_minute']);}
                    if($end>$cursor){$add($cursor,$end,'Enjoy '.implode(', ',$names).' at leisure',$group);$free=true;}
                    if(!$free)$allHaveFree=false;
                }
                if(!$allHaveFree){$p['missing_leisure_time']=true;$p['review'][]='No leisure window remains for every participant. Add event time or revise fixed activities before including the requested flexible play.';}
            }
        }
        // Account for the requested window without inventing paid activity or space.
        $coveredEnd=$last;
        if($flex&&!$p['access_minutes']&&!empty($rows))$coveredEnd=max($coveredEnd,max(array_column($rows,'end_minute')));
        $p['unallocated_minutes']=max(0,$d['minutes']-$coveredEnd);
        $p['duration_review']=$p['unallocated_minutes']>15;
        if($p['unallocated_minutes']>0){
            if($p['duration_review']){
                $add($coveredEnd,$d['minutes'],'Unallocated event time — staff to resolve');
                $p['review'][]=$p['unallocated_minutes'].' minutes of the requested event have no planned activity or dining. Resolve before presenting this as a full-length event; no extra attraction or seating is promised.';
            }else{$add($coveredEnd,$d['minutes'],'Event wrap-up / departure');}
        }
        if(!$offset&&$d['food']==='yes')$p['notes'][]='Pizza, wings and drinks may be enjoyed at the bowling lanes for this group of 25 or fewer.';
        $p['required_minutes']=max($last,(int)($p['rental_minutes']??0));
        usort($rows,function($x,$y){return $x['start_minute']<=>$y['start_minute'];});
        $start=new \DateTimeImmutable($date.' '.$d['time'],new \DateTimeZone('America/Indiana/Indianapolis'));
        foreach($rows as &$row){$row['start']=$start->modify(($row['start_minute']>=0?'+':'').$row['start_minute'].' minutes')->format('g:i A');$row['end']=$start->modify(($row['end_minute']>=0?'+':'').$row['end_minute'].' minutes')->format('g:i A');}unset($row);
        return $rows;
    }
    private function candidates($d,$sel,$o,$date) {
        $n=$d['guests'];$w=$this->weekday($date);$peak=in_array($w,[5,6],true)&&$d['time']>='16:00';$discount=$w===3?.5:1;$menu=$this->foodPath($d,$o);
        $bowls=[];$axes=[];$flex=[];$b=in_array('bowling',$sel,true);$a=in_array('axe',$sel,true);$laser=in_array('laser',$sel,true);$arcade=in_array('arcade',$sel,true);
        $bh=isset($o['bowling_hours'])&&in_array((float)$o['bowling_hours'],[0.5,1.0,2.0],true)?(float)$o['bowling_hours']:1.0;
        $am=isset($o['axe_minutes'])&&in_array((int)$o['axe_minutes'],[30,60],true)?(int)$o['axe_minutes']:($b?30:60);
        if($b){
            foreach(array_unique([$bh,0.5]) as $playHours){
                $short=$playHours<$bh?1:0;$half=$playHours==0.5;
                $x=$this->product($half?'30-minute bowling':($playHours==1?'1 hour bowling':$playHours.' hours bowling'),$short);$x['alternative_only']=(bool)$short;$x['bowl_mode']='regular';$x['bowling_minutes']=(int)round($playHours*60);
                $rate=$this->c['bowling'][$half?($w<=4?'half_weekday':'half_weekend'):($w<=4?'hour_weekday':'hour_weekend')];
                $this->line($x,$half?'Bowling lane — 30 minutes':'Bowling lane-hour',self::lanes($n)*($half?1:$playHours),(int)round($rate*$discount));
                $this->line($x,'Bowling shoes',$n,$this->c['bowling']['shoes']);if($w!==1)$bowls[]=$x;
                $hours=max(1,(int)ceil(ceil($n/50)*$playHours));
                if($hours<=2){$x=$this->product($short?'Private bowling — shorter play':'Private bowling buyout',$short);$x['alternative_only']=(bool)$short;$x['bowling_minutes']=(int)round($playHours*60);$x['private_activities']=true;$x['rental_minutes']=$hours*60;$x['private_bowl_window']=$hours*60;$x['rental_kind']='bowling';$this->line($x,$hours.'-hour private bowling rental — shoes included',1,$this->c['bowling'][$hours===1?'exclusive_hour':($peak?'exclusive_peak':'exclusive_two')]);$bowls[]=$x;}
            }
            if(in_array($menu,['pizza','pizza_wings'],true)&&$bh==1){$x=$this->product('Pizza & Pins');$x['bowling_minutes']=60;$x['included_combos']=(int)ceil($n/6);$x['included_credit_cents']=$x['included_combos']*2500;$this->line($x,'Pizza & Pins — up to 6 per package',$x['included_combos'],$this->c['bowling']['pins'],true,.2);$x['notes'][]='Each package includes one pizza, one pitcher, shoes and one issued $25 play card; credit can be distributed.';$bowls[]=$x;}
        }else $bowls[]=$this->product('');
        if($a){
            foreach(array_unique([$am,30]) as $minutes){$x=$this->product(($minutes===60?'1-hour':'30-minute').' axe',$minutes<$am?1:0);$x['alternative_only']=$minutes<$am;$x['axe_minutes']=$minutes;$count=$w===4?(int)ceil($n/2):$n;$this->line($x,'Axe throwing — '.$minutes.' minutes'.($w===4?' (2-for-1)':''),$count,(int)round($this->c['axe'][$minutes===30?'half':'hour']*$discount));$axes[]=$x;}
            if(array_intersect($sel,['laser','golf','climbing','arcade'])){$x=$this->product('AxeTreme');$x['axe_minutes']=60;$x['included_credit_cents']=$n*2000;$this->line($x,'AxeTreme — 1 hour axe + $20 play card',$n,$this->c['axe']['xtreme']);$axes[]=$x;}
            if((int)ceil($n/($b?50:56))*($am+15)<=120){$x=$this->product('Private Axe Den');$x['axe_minutes']=$am;$x['rental_minutes']=120;$x['private_axe_window']=120;$x['rental_kind']='axe';$x['private_activities']=true;$this->line($x,'Private Axe Den — 2 hours',1,$this->c['axe'][$w===6?'private_sat':'private']);$x['notes'][]='Two-hour private rental access; proposed rotations protect the desired throwing time per participant. Confirm rental/briefing arrangements with staff.';$axes[]=$x;}
        }else $axes[]=$this->product('');
        if($laser){
            $single=isset($o['laser_mode'])&&$o['laser_mode']==='single';
            $x=$this->product('Laser tag games',$single?0:1);$x['deferred_play']=['Laser tag — one game per guest'=>(int)round($n*$this->c['laser']['game']*$discount)];$flex[]=$x;
            $x=$this->product($w===4?'Thursday laser special':'90-Minute Laser Tag Pass',$single?1:0);$this->line($x,$x['name'],$n,$this->c['laser'][$w===4?'thursday':'pass']);if($w!==4)$x['access_minutes']=90;$flex[]=$x;
            $x=$this->product('Private laser tag buyout',$single?1:0);$x['rental_kind']='laser';$x['private_activities']=true;$x['access_minutes']=$w===6?60:90;$x['access_label']='Private laser tag at leisure — '.$x['access_minutes'].'-minute rental';$this->line($x,'Private laser tag — '.$x['access_minutes'].' minutes',1,$this->c['laser'][$w===6?'private_sat':'private']);$flex[]=$x;
            if($arcade){
                $x=$this->product('LaserPlex',1);$x['included_credit_cents']=$n*1500;$x['arcade_target']=1500;$this->line($x,'LaserPlex — 1 laser game + $15 arcade',$n,$this->c['laser']['plex']);$flex[]=$x;
                $x=$this->product('Laser Tag & Games');$x['included_credit_cents']=$n*3000;$x['arcade_target']=3000;$this->line($x,'Laser Tag & Games — 2 games + $30 play card',$n,$this->c['laser']['games']);$flex[]=$x;
                $x=$this->product('Laser + arcade purchased separately');$x['arcade_target']=3000;$x['deferred_play']=['Laser tag — 2 games per guest'=>(int)round($n*2*$this->c['laser']['game']*$discount)];$flex[]=$x;
                $x=$this->product('One laser game + $15 arcade separately',1);$x['arcade_target']=1500;$x['deferred_play']=['Laser tag — 1 game per guest'=>(int)round($n*$this->c['laser']['game']*$discount)];$flex[]=$x;
            }
            if(in_array('climbing',$sel,true)&&$d['children']>0){$x=$this->product('Adventure Blast Pass'.($d['adults']?' for children + separate adult access':''));$x['included_credit_cents']=$d['children']*1500;$x['child_credit_only']=true;$x['arcade_target']=1500;$x['covers_climbing']=$d['adults']===0;$x['climb_count']=$d['adults'];$x['access_minutes']=90;$x['access_label']='Laser tag and climbing at leisure — 90-minute access';$x['notes'][]='Only children receive Blast wristbands and $15 arcade credit. Adults priced separately. No seating is promised.';$this->line($x,'Adventure Blast child wristband',$d['children'],$this->c['laser']['blast']);if($d['adults'])$this->line($x,$w===4?'Adult Thursday laser special':'Adult 90-Minute Laser Tag Pass',$d['adults'],$this->c['laser'][$w===4?'thursday':'pass']);$flex[]=$x;}
            if($arcade)foreach($flex as &$f)if(!isset($f['arcade_target']))$f['arcade_target']=3000;unset($f);
        }else $flex[]=$this->product('');
        $out=[];
        foreach($bowls as $bo)foreach($axes as $ax)foreach($flex as $fl){
            $p=$this->merge([$bo,$ax,$fl]);
            if($d['private_room']==='yes')$p['notes'][]='Private gathering space is separate from attraction exclusivity.';
            $out[]=$this->complete($p,$d,$sel,$o,$menu,$date);
        }
        if($b&&$a&&$bh==1){foreach($flex as $fl){$x=$this->product('All-Access');$x['bowling_minutes']=60;$x['axe_minutes']=60;$x['included_credit_cents']=$n*2000;$this->line($x,'All-Access — bowling, shoes, axe, $20 card',$n,$this->c['bowling']['all_access']);$out[]=$this->complete($this->merge([$x,$fl]),$d,$sel,$o,$menu,$date);}}
        if($n<=125&&$b&&$a&&($n>=50||($o['rental']??'')==='mezzanine')){
            foreach([180,120] as $mins){if($mins===120&&!in_array($w,[5,6],true))continue;$x=$this->product('Mezzanine buyout — '.($mins/60).' hours');$x['rental_kind']='mezzanine';$x['bowling_minutes']=$bh*60;$x['axe_minutes']=$am;$x['room_included']=true;$x['rental_minutes']=$mins;$x['private_activities']=true;
                $price=$this->c['mezzanine'][$mins===120?'two':($w===6?($d['time']>='16:00'?'sat_after':'sat_before'):($w===5?'fri':'sun_thu'))];$this->line($x,$x['name'],1,$price);foreach($flex as $fl)$out[]=$this->complete($this->merge([$x,$fl]),$d,$sel,$o,$menu,$date);
            }
        }
        if($n>125||($o['rental']??'')==='full'||($d['private_room']==='yes'&&count($sel)>=3)){$x=$this->product('Full Facility — 3 hours');$x['room_included']=true;$x['rental_minutes']=180;$x['private_activities']=true;$x['rental_kind']='full';$x['rental_kinds']=['full'];$x['bowling_minutes']=$b?$bh*60:0;$x['axe_minutes']=$a?$am:0;$x['covers_climbing']=true;$x['covers_golf']=true;$x['covers_arcade']=true;
            $price=$this->c['facility'][$w===6?($d['time']>='16:00'?'sat_after':'sat_before'):($d['time']>='16:00'?($w===5?'fri_after':'sun_thu_after'):'before')];$this->line($x,'Full Facility rental — food and drinks extra',1,$price);
            $x['notes'][]='Facility attraction access included; only selected attractions are proposed. Food/drink cards are extra.';
            $p=$this->complete($x,$d,$sel,$o,$menu,$date);$p['review'][]='Verify distributed attraction access and seating for this large group; no guaranteed play cycles.';$out[]=$p;
        }
        foreach($this->custom_candidates($d,$sel,$o,$menu,$date,$bowls,$axes,$flex) as $p)$out[]=$p;
        if(!$out){$p=$this->product('Staff quote required');$p['unpriced']=true;$p['dining_minutes']=0;$p['selected_attractions']=$sel;$p['itinerary']=[];$p['required_minutes']=0;$p['fits_duration']=false;$p['hard_review']=true;$p['per_guest_cents']=0;$p['budget_over_cents']=0;$p['review'][]='No fully priced eligible configuration is available for these parameters. Staff must prepare the quote; no missing rate has been invented.';$out[]=$p;}
        return $out;
    }
    private function custom_candidates($d,$sel,$o,$menu,$date,$bowls,$axes,$flex){
        $out=[];$n=$d['guests'];
        foreach($this->packages as $def){
            if(!Packages::eligible($def,$d,$sel,$o,$menu,$date))continue;
            $units=$def['basis']==='person'?$n:(int)ceil($n/$def['size']);$laser=$def['laser_games']||$def['laser_access'];
            $tier=$laser&&$def['laser_games']===1&&($o['laser_mode']??'')!=='single'?1:0;
            $x=$this->product($def['name'],$tier);$x['bowling_minutes']=$def['bowling'];$x['axe_minutes']=$def['axe'];$x['access_minutes']=$def['laser_access'];$x['covers_golf']=$def['golf'];$x['covers_climbing']=$def['climbs']>0;
            $x['included_credit_cents']=$units*$def['credit'];$x['included_food']=[];
            $this->line($x,'Custom package — '.$def['name'],$units,$def['price'],$def['food_amount']>0,$def['price']>0?$def['food_amount']/$def['price']:0);
            foreach(Packages::food_labels() as $key=>$label)if($def['food_'.$key]){$x['included_food'][$key]=$units*$def['food_'.$key];$x['notes'][]=$x['included_food'][$key].' included '.$label.'.';if(!in_array($key,['combo','boneless','traditional','pitcher'],true))$x['separate_package_dining']=true;}
            if($def['bar']!=='none'){$x['included_food'][$def['bar']]=$n;$x['separate_package_dining']=true;$x['notes'][]='Included '.$def['bar'].' catering bar for all '.$n.' participants; pitchers as specified separately.';}
            if($def['bowling']&&!$def['shoes'])$this->line($x,'Bowling shoes',$n,$this->c['bowling']['shoes']);
            if($def['bowling']&&$def['shoes'])$x['notes'][]='Bowling shoes included for all participants.';
            if($def['laser_games'])$x['notes'][]=$def['laser_games'].' laser game(s) per guest included; play at leisure, no fixed cycles.';
            if($def['climbs'])$x['notes'][]=$def['climbs'].' climb(s) per participant included; play at leisure.';
            if($def['arcade'])$x['arcade_target']=max(1000,(int)ceil($x['included_credit_cents']/$n));
            if($def['room']!=='none'){$x['room_included']=true;$x['notes'][]=['lower'=>'Lower Event Room','upper'=>'Skybox','cove'=>'Climbers Cove'][$def['room']].' included for '.$def['room_minutes'].' minutes, subject to availability.';}
            if($def['minimum_age'])$x['review'][]='Custom package minimum age '.$def['minimum_age'].'; verify actual participants in addition to venue attraction age rules.';
            if($def['notes']!=='')$x['review'][]='Package notes: '.$def['notes'];
            $x['custom_package']=['id'=>$def['id'],'revision'=>substr(hash('sha256',json_encode($def)),0,16),'definition'=>$def];
            $bs=$def['bowling']?[$this->product('')]:$bowls;$as=$def['axe']?[$this->product('')]:$axes;$fs=$laser?[$this->product('')]:$flex;
            foreach($bs as $bo)foreach($as as $ax)foreach($fs as $fl){
                // A child-restricted pool cannot absorb unrestricted custom credit.
                if($def['credit']>0&&!empty($fl['child_credit_only']))continue;
                $out[]=$this->complete($this->merge([$x,$bo,$ax,$fl]),$d,$sel,$o,$menu,$date);
            }
        }
        return $out;
    }
    private function merge($parts){$p=$this->product('');$p['rental_kinds']=[];$names=[];foreach($parts as $x){if(isset($x['rental_kind']))$p['rental_kinds'][]=$x['rental_kind'];if($x['name']!=='')$names[]=$x['name'];foreach(['subtotal_cents','tax_cents','total_cents','included_credit_cents','included_combos'] as $k)$p[$k]+=$x[$k];foreach(['items','notes','review'] as $k)$p[$k]=array_merge($p[$k],$x[$k]);$p['tier']=max($p['tier'],$x['tier']);foreach(['bowling_minutes','axe_minutes','access_minutes','rental_minutes'] as $k)$p[$k]=max($p[$k]??0,$x[$k]??0);foreach(['room_included','private_activities','covers_climbing','covers_golf','covers_arcade','alternative_only','separate_package_dining'] as $k)$p[$k]=!empty($p[$k])||!empty($x[$k]);foreach(['arcade_target','access_label','bowl_mode','climb_count','private_bowl_window','private_axe_window','child_credit_only','deferred_play','rental_kind','included_food','custom_package'] as $k)if(isset($x[$k]))$p[$k]=$x[$k];}$p['name']=implode(' + ',$names)?:'Gathering and catering';return $p;}
    public function recommend($data,$options=[]) {
        // Always revalidate; callers cannot bypass required-field validation.
        $raw=$data;if(isset($data['budget'])&&is_int($data['budget'])&&isset($data['guests']))$raw['budget']=$data['budget']/100;
        $v=$this->validate($raw);if(!$v['valid'])return ['valid'=>false,'errors'=>$v['errors']];$d=$v['data'];$results=[];
        $required=[];$open=[];foreach($d['attractions'] as $k=>$a){if($a==='yes')$required[]=$k;elseif($a==='open')$open[]=$k;}
        $preferred=$d['children']>0?['laser','climbing','arcade']:['bowling','axe'];
        $target=array_values(array_intersect($open,$preferred));if(!$required&&!$target&&$open)$target=[$open[0]];
        $sets=[$required];foreach($open as $suggestion)$sets[]=array_values(array_unique(array_merge($required,[$suggestion])));if($target)$sets[]=array_values(array_unique(array_merge($required,$target)));
        foreach($target as $k)$sets[]=array_values(array_unique(array_merge($required,[$k])));
        $unique=[];foreach($sets as $s){sort($s);$unique[implode(',',$s)]=$s;}
        foreach($d['dates'] as $date){$all=[];foreach($unique as $s){$plans=$this->candidates($d,$s,$options,$date);if(in_array('bowling',$s,true)&&!isset($options['bowling_hours'])&&$d['minutes']>=120){$long=$options;$long['bowling_hours']=2;foreach($this->candidates($d,$s,$long,$date) as $extra)if($extra['bowling_minutes']===120){$extra['notes'][]='Longer bowling is recommended to use the requested event time; its full price is included.';$plans[]=$extra;}}foreach($plans as $p){$p['suggested_attractions']=array_values(array_diff($s,$required));$p['optional_fit']=count(array_intersect($s,$target));$all[]=$p;}}
            $budget=$d['budget'];$fillBowling=in_array('bowling',$required,true)&&!isset($options['bowling_hours']);usort($all,function($a,$b)use($budget,$fillBowling){$aScore=[!$a['fits_duration']||$a['hard_review']?1:0,$budget!==null&&$a['total_cents']>$budget?1:0,-$a['optional_fit'],$fillBowling?max(0,($a['unallocated_minutes']??0)-15):0,$a['tier'],$a['total_cents']];$bScore=[!$b['fits_duration']||$b['hard_review']?1:0,$budget!==null&&$b['total_cents']>$budget?1:0,-$b['optional_fit'],$fillBowling?max(0,($b['unallocated_minutes']??0)-15):0,$b['tier'],$b['total_cents']];return $aScore<=>$bScore;});
            $main=$all[0];foreach($all as $candidate)if(empty($candidate['alternative_only'])){$main=$candidate;break;}$seen=[$main['name'].'-'.$main['total_cents']=>true];$alts=[];
            // Include a shorter/lower-price alternative, then useful different configurations.
            $cheap=$all;usort($cheap,function($a,$b){return [$a['hard_review']?1:0,$a['fits_duration']?0:1,$a['total_cents']]<=>[$b['hard_review']?1:0,$b['fits_duration']?0:1,$b['total_cents']];});
            foreach(array_merge($cheap,$all) as $p){$key=$p['name'].'-'.$p['total_cents'];if(isset($seen[$key])||count($alts)>=3)continue;$seen[$key]=true;$alts[]=$p;}
            $main['why']=($main['hard_review']||!$main['fits_duration']||!empty($main['duration_review']))?'Planning hold: resolve the flagged requirements before quoting this configuration.':($main['tier']===0?'Fits the selected attractions and the preferred experience; compared with eligible packages, specials and rentals.':'Lower-cost or shorter experience selected to fit the requested time or budget.');
            $results[]=['date'=>$date,'recommendation'=>$main,'alternatives'=>$alts];
        }
        return ['valid'=>true,'rules_version'=>Catalog::VERSION,'pricing_revision'=>substr(hash('sha256',json_encode($this->c)),0,12),'inquiry'=>$d,'dates'=>$results,'status'=>'Proposed internal recommendation — availability and eligibility require staff confirmation'];
    }
}
