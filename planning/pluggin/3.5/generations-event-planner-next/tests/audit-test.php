<?php
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
require __DIR__.'/test-helpers.php';
use Generations\PlannerNext\Plugin;
// Tests added by the pre-upload audit. These check business outcomes, not implementation shape.
$r=run_case(6,['bowling','laser'],'2026-11-06',['food'=>'yes'],['menu'=>'pizza','laser_mode'=>'single']);$p=main_plan($r);
ok($p['name']==='Pizza & Pins + Laser tag games'&&$p['total_cents']===9509,'included $25 Pins credit offsets laser games; six guests total $95.09');
$r=run_case(12,['bowling','laser'],'2026-11-06',['food'=>'yes'],['menu'=>'pizza','laser_mode'=>'single']);ok(main_plan($r)['total_cents']===16878,'two issued Pins cards offset $50 of requested laser play once');
$r=run_case(6,['bowling','laser'],'2026-11-04',['food'=>'yes'],['menu'=>'pizza','laser_mode'=>'single']);ok(main_plan($r)['total_cents']===7209,'Wednesday discounted laser games can be fully funded by included Pins credit');
$r=run_case(6,['axe','laser','golf','climbing'],'2026-11-06',[],['laser_mode'=>'single']);$p=main_plan($r);ok(strpos($p['name'],'AxeTreme')!==false&&$p['total_cents']===28800,'AxeTreme credit compares requested non-arcade attractions correctly');
ok(!in_array('arcade',$p['selected_attractions'],true),'using a play card never adds an excluded arcade activity');
$r=run_case(6,['bowling','axe','laser','golf','climbing'],'2026-11-06',[],['laser_mode'=>'single','axe_minutes'=>60]);ok(main_plan($r)['total_cents']===34800&&strpos(main_plan($r)['name'],'All-Access')!==false,'All-Access credit offsets eligible requested laser, golf and climbing');
$r=run_case(6,['bowling']);ok(main_plan($r)['bowling_minutes']===60,'explicit one-hour bowling is preserved');
ok(count(array_filter($r['dates'][0]['alternatives'],function($p){return $p['bowling_minutes']===30&&$p['total_cents']===4600;}))>0,'Friday 30-minute bowling is a clearly shorter $46 alternative');
$r=run_case(6,['bowling'],'2026-11-03',[],['bowling_hours'=>0.5]);ok(main_plan($r)['bowling_minutes']===30&&main_plan($r)['total_cents']===3850,'explicit Tuesday half-hour uses $17.50 lane price, not prorated $15');
$r=run_case(6,['bowling'],'2026-11-04',[],['bowling_hours'=>0.5]);ok(main_plan($r)['total_cents']===2975,'Wednesday half-hour discounts only the $17.50 lane rate');
$r=run_case(10,['bowling','axe'],'2026-11-06',['duration'=>'2 hours'],['bowling_hours'=>1,'axe_minutes'=>60]);ok(main_plan($r)['bowling_minutes']===60&&main_plan($r)['axe_minutes']===60&&!main_plan($r)['fits_duration'],'a short event never silently cuts either explicitly requested fixed activity');
$r=run_case(50,[],'2026-11-06',['private_room'=>'yes','duration'=>'Other','other_hours'=>4]);$p=main_plan($r);ok($p['total_cents']===65000,'four-hour event does not automatically buy a Cove extension');
$r=run_case(50,[],'2026-11-06',['private_room'=>'yes','duration'=>'Other','other_hours'=>4],['room'=>'cove','room_hours'=>3.5]);$p=main_plan($r);ok($p['total_cents']===75833,'explicit half-hour Cove extension is prorated to $108.33');
ok(array_reduce($p['items'],function($ok,$i){return $ok&&is_int($i['unit_cents']);},true),'extension line items use whole cents and reconcile with displayed unit prices');
$r=run_case(20,['laser','golf','climbing','arcade'],'2026-11-06',['private_room'=>'yes'],['rental'=>'full']);$p=main_plan($r);
ok($p['total_cents']===549500&&in_array('full',$p['rental_kinds'],true),'an explicitly requested Full Facility rental is evaluated below 126 guests');
ok(count($p['items'])===1,'included Full Facility attractions are not charged a second time');
$labels=implode(' ',array_column($p['itinerary'],'label'));foreach(['Laser Tag','Mini Golf','Climbing','Arcade'] as $a)ok(strpos($labels,$a)!==false,'Full Facility itinerary retains requested '.$a);
ok(strpos($labels,'Bowling')===false&&strpos($labels,'Axe')===false,'Full Facility access never schedules explicitly excluded attractions');
$r=run_case(8,['laser'],'2026-11-06',[],['rental'=>'laser']);ok(in_array('laser',main_plan($r)['rental_kinds'],true)&&main_plan($r)['total_cents']===55000,'explicit private laser request takes precedence over cheaper individual passes');
$r=run_case(10,['laser'],'2026-11-06',[],['rental'=>'mezzanine']);ok(main_plan($r)['hard_review']&&!in_array('bowling',main_plan($r)['selected_attractions'],true),'conflicting rental request is held rather than overriding explicit attraction No');
$r=run_case(8,['bowling'],'2026-11-06',['food'=>'yes','description'=>'Pizza and traditional wings, please.']);$items=main_plan($r)['items'];$labels=implode(' ',array_column($items,'label'));ok(strpos($labels,'traditional wing')!==false&&strpos($labels,'boneless')===false,'traditional-wing request replaces default boneless wings');
$r=run_case(8,['bowling'],'2026-11-06',['food'=>'yes','description'=>'Pizza only, no wings.']);ok(strpos(implode(' ',array_column(main_plan($r)['items'],'label')),'wing platter')===false,'explicit no-wings request is honored');
$r=run_case(8,['bowling'],'2026-11-06',['food'=>'yes','description'=>'Traditional wings only, no pizza.']);ok(strpos(implode(' ',array_column(main_plan($r)['items'],'label')),'Pizza')===false,'wings-only request does not automatically add pizza');
$r=run_case(8,['bowling'],'2026-11-06',['food'=>'yes','description'=>'No slider or fajita bar, pizza only.']);ok(strpos(implode(' ',array_column(main_plan($r)['items'],'label')),'Bar')===false,'negated catering menu list does not become an unwanted bar quote');
$r=run_case(100,['bowling','axe'],'2026-11-06',['food'=>'yes']);$p=main_plan($r);$dining=array_values(array_filter($p['itinerary'],function($x){return $x['label']==='Dining';}))[0];$overlap=false;
foreach($p['itinerary'] as $block)if($block['label']==='Bowling check-in & shoes'&&max($block['start_minute'],$dining['start_minute'])<min($block['end_minute'],$dining['end_minute']))$overlap=true;
ok(!$overlap,'separate dining receives the full 30 minutes without a conflicting shoe-preparation block');
$r=run_case(8,['laser','climbing','arcade'],'2026-11-06',['adults'=>0,'children'=>8,'duration'=>'Other','other_hours'=>1.5]);$p=main_plan($r);ok($p['fits_duration']&&!$p['hard_review'],'child Blast + arcade leisure can fit its 90-minute access window');
$r=run_case(10,['bowling','axe','arcade'],'2026-11-06',['duration'=>'Other','other_hours'=>1.75]);ok(main_plan($r)['hard_review'],'no-time-left flexible attraction is flagged, not silently omitted');
$r=run_case(10,[]);ok(!empty(main_plan($r)['unpriced'])&&main_plan($r)['hard_review'],'empty event scope is unpriced, not a zero-dollar recommendation');
// Cross-combination invariants across days, capacity edges and explicit exclusions.
$checked=0;
foreach([6,8,25,26,49,50,56,57,100,126] as $n)foreach(['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07'] as $date)foreach([['bowling','axe'],['laser','arcade'],['axe','laser','golf','climbing'],['bowling','laser']] as $wanted){
    $r=run_case($n,$wanted,$date);$plans=array_merge([main_plan($r)],$r['dates'][0]['alternatives']);
    foreach($plans as $p){
        foreach($wanted as $a)if(!in_array($a,$p['selected_attractions'],true))throw new Exception('Requested attraction missing: '.$a);
        foreach($p['selected_attractions'] as $a)if(!in_array($a,$wanted,true))throw new Exception('Excluded attraction added: '.$a);
        $sum=0;foreach($p['items'] as $i){if($i['subtotal_cents']<0||$i['tax_cents']<0)throw new Exception('Negative price');$sum+=$i['subtotal_cents']+$i['tax_cents'];}
        if($sum!==$p['total_cents'])throw new Exception('Items do not reconcile');
        foreach(['Bowling','Axe Throwing'] as $label){$blocks=array_values(array_filter($p['itinerary'],function($x)use($label){return $x['label']===$label;}));usort($blocks,function($a,$b){return $a['start_minute']<=>$b['start_minute'];});$end=-1;foreach($blocks as $block){if($block['start_minute']<$end)throw new Exception('Resource overlap');$end=$block['end_minute'];}}
        if($p['fits_duration']&&!$p['hard_review'])foreach($p['itinerary'] as $block)if($block['end_minute']>$r['inquiry']['minutes'])throw new Exception('Accepted plan exceeds event window');
    }$checked++;
}
ok($checked===200,'200 cross-combination cases preserve requested attractions, exclusions, totals, resource limits and event windows');
// Requested event duration must be accounted for, not treated only as a ceiling.
$s=Plugin::sample();$s['attractions']['bowling']='yes';$s['attractions']['axe']='yes';
$p=main_plan($engine->recommend($s));
ok($p['bowling_minutes']===120&&$p['axe_minutes']===30&&$p['total_cents']===37000,'three-hour event buys two bowling hours plus shoes and 30-minute axe: $370');
ok($p['required_minutes']===165&&$p['unallocated_minutes']===15&&!$p['duration_review'],'three-hour plan has 165 purchased/briefing minutes plus 15-minute wrap-up');
$wrap=array_values(array_filter($p['itinerary'],function($x){return $x['label']==='Event wrap-up / departure';}));
ok(count($wrap)===1&&$wrap[0]['start']==='3:45 PM'&&$wrap[0]['end']==='4:00 PM','three-hour sample itinerary ends at the requested 4 PM');
ok($p['selected_attractions']===['axe','bowling'],'filling event duration never adds excluded attractions');
$fixed=main_plan($engine->recommend($s,['bowling_hours'=>1]));
ok($fixed['bowling_minutes']===60&&$fixed['duration_review']&&$fixed['unallocated_minutes']===75,'explicit one-hour bowling remains intact and leaves a disclosed 75-minute gap');
$s['has_budget']='yes';$s['budget']=300;$p=main_plan($engine->recommend($s));
ok($p['total_cents']===29000&&$p['duration_review'],'budget-limited shorter plan discloses its unresolved duration instead of pretending to fill three hours');
$s['has_budget']='no';$s['duration']='2 hours';$p=main_plan($engine->recommend($s));
ok($p['bowling_minutes']===60&&$p['unallocated_minutes']===15&&$p['total_cents']===29000,'two-hour bowling and axe event retains one-hour bowling and full briefing');
$s['attractions']['axe']='no';$p=main_plan($engine->recommend($s));
ok($p['bowling_minutes']===120&&$p['required_minutes']===120&&$p['total_cents']===19500,'two-hour bowling-only event buys two hours with shoes charged once');
echo "\n$tests pre-upload audit checks passed, including $checked combination cases.\n";
