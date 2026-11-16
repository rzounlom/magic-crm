<?php
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
require __DIR__.'/test-helpers.php';
use Generations\PlannerNext\Engine;use Generations\PlannerNext\Plugin;
$r=run_case(6,['bowling']);ok(main_plan($r)['total_cents']===6100,'six Friday bowlers $61');
$r=run_case(7,['bowling']);ok(main_plan($r)['total_cents']===10450,'seven Friday bowlers $104.50');
$r=run_case(6,['bowling'],'2026-11-03');ok(main_plan($r)['total_cents']===5100,'Tuesday bowling $51');
$r=run_case(6,['bowling'],'2026-11-04');ok(main_plan($r)['total_cents']===3600,'Wednesday bowling shoes not discounted');
$r=run_case(10,['bowling','axe']);$p=main_plan($r);ok($p['total_cents']===29000,'ten bowling + 30-minute axe $290');ok($p['required_minutes']===105,'bowling + axe protects 15-minute briefing');
$brief=array_values(array_filter($p['itinerary'],function($r){return $r['label']==='Axe Check-In & Safety Briefing';}));ok($brief[0]['start']==='2:00 PM'&&$brief[0]['end']==='2:15 PM','axe briefing starts after bowling');
$r=run_case(10,['axe']);$p=main_plan($r);ok($p['total_cents']===30000&&$p['axe_minutes']===60,'axe-only main is full hour $300');ok($r['dates'][0]['alternatives'][0]['total_cents']===17500,'axe shorter alternative $175');
$r=run_case(8,['laser']);ok(main_plan($r)['total_cents']===20000,'eight laser-only pass $200');ok(strpos(main_plan($r)['name'],'90-Minute')!==false,'90-minute pass reinstated');
$r=run_case(50,['laser']);ok(main_plan($r)['total_cents']===55000,'fifty laser-only private $550');
$r=run_case(50,['laser'],'2026-11-07');ok(main_plan($r)['total_cents']===59900,'Saturday private laser $599');
$r=run_case(8,['laser'],'2026-11-05');ok(main_plan($r)['total_cents']===16000,'Thursday eight laser $160');
$r=run_case(8,['laser','arcade']);ok(main_plan($r)['total_cents']===31992,'eight laser + arcade fuller package $319.92');
$r=run_case(8,['laser','arcade'],'2026-11-04');ok(main_plan($r)['total_cents']===30400,'Wednesday direct two games + $30 credit beats package');ok($r['dates'][0]['alternatives'][0]['total_cents']===15200,'Wednesday one game + $15 arcade $152');
$r=run_case(0,['laser','climbing','arcade'],'2026-11-06',['children'=>8]);$p=main_plan($r);ok($p['total_cents']===23992,'eight child Blast wristbands $239.92');ok(strpos(implode(' ',$p['notes']),'No seating')!==false,'Blast never promises seating');
$r=run_case(8,['laser','climbing','arcade']);ok(strpos(main_plan($r)['name'],'Blast')===false,'adults never sold Blast');
$r=run_case(4,['golf'],'2026-11-06',['children'=>4]);ok(main_plan($r)['total_cents']===7200,'golf four adults/four children $72');
$r=run_case(15,[],'2026-11-06',['food'=>'yes'],['menu'=>'fajita']);$p=main_plan($r);ok($p['subtotal_cents']===40700&&$p['tax_cents']===2849,'fifteen Fajita and pitchers $435.49 tax included');
$r=run_case(14,[],'2026-11-06',['food'=>'yes'],['menu'=>'fajita']);ok(main_plan($r)['hard_review'],'fourteen cannot qualify catering bar');
$r=run_case(15,[],'2026-11-06',['food'=>'yes','private_room'=>'yes'],['menu'=>'fajita']);ok(main_plan($r)['total_cents']===58549,'catering does not waive requested Lower room fee');
$r=run_case(25,['bowling'],'2026-11-06',['food'=>'yes'],['menu'=>'pizza_wings']);ok(main_plan($r)['dining_minutes']===0,'25 pizza wings drinks can eat at lanes');
$r=run_case(25,['bowling'],'2026-11-06',['food'=>'yes'],['menu'=>'slider']);ok(main_plan($r)['dining_minutes']===30,'25 sliders require separate dining');
$r=run_case(26,['bowling'],'2026-11-06',['food'=>'yes']);ok(main_plan($r)['dining_minutes']===30,'26 pizza requires separate dining');
$r=run_case(100,['bowling','axe']);$p=main_plan($r);$brief=array_filter($p['itinerary'],function($r){return $r['label']==='Axe Check-In & Safety Briefing';});ok(count($brief)===2,'100-person split has two briefings');ok($p['required_minutes']===120,'100-person 50/50 rotation fits 120 fixed minutes');ok(Engine::lanes(100)===16&&Engine::lanes(50)===8,'lane-one exception used only for approved large cohorts');
$r=run_case(10,[],'2026-11-06',['attractions'=>['bowling'=>'open','axe'=>'open']]);ok(in_array('bowling',main_plan($r)['selected_attractions'],true),'adult open guidance suggests bowling');
$r=run_case(8,['laser'],'2026-11-06',['has_budget'=>'yes','budget'=>70]);ok(main_plan($r)['total_cents']===6400,'budget may choose shorter complete laser alternative');
$r=run_case(10,['axe'],'2026-11-06',['has_budget'=>'yes','budget'=>1]);ok(in_array('axe',main_plan($r)['selected_attractions'],true)&&main_plan($r)['budget_over_cents']>0,'overbudget preserves explicit attraction');
$r=run_case(10,[]);ok(main_plan($r)['selected_attractions']===[],'all No never adds attractions');
$s=Plugin::sample();unset($s['attractions']['bowling']);ok(!$engine->recommend($s)['valid'],'missing attraction answer blocked');
$s=Plugin::sample();$s['duration']='Other';$s['other_hours']='';ok(!$engine->recommend($s)['valid'],'Other duration conditional validation');
$s=Plugin::sample();$s['has_budget']='yes';ok(!$engine->recommend($s)['valid'],'budget amount conditional validation');
$s=Plugin::sample();$s['email']="a@example.com\r\nBcc:evil@example.com";ok(!$engine->recommend($s)['valid'],'email header injection blocked');
$s=Plugin::sample();$s['adults']='1.5';ok(!$engine->recommend($s)['valid'],'fractional guest count blocked');
$s=Plugin::sample();$s['dates']=['2026-02-30'];ok(!$engine->recommend($s)['valid'],'invalid calendar date blocked');
$s=Plugin::sample();$s['dates']=['2026-11-03','2026-11-06'];$s['adults']=6;$s['attractions']['bowling']='yes';$r=$engine->recommend($s,['bowling_hours'=>1]);ok(count($r['dates'])===2&&$r['dates'][0]['recommendation']['total_cents']===5100&&$r['dates'][1]['recommendation']['total_cents']===6100,'alternative dates priced independently');
$r=run_case(10,['bowling','axe'],'2026-11-06',['duration'=>'2 hours'],['axe_minutes'=>60]);ok(main_plan($r)['axe_minutes']===60&&!main_plan($r)['fits_duration'],'explicit 60-minute axe is not silently shortened to fit');
$r=run_case(100,['bowling']);ok(main_plan($r)['required_minutes']===120,'bowling-only rotations allow shoes before each slot, not inside purchased play');
$r=run_case(100,['axe'],'2026-11-06',[],['axe_minutes'=>60]);ok(strpos(main_plan($r)['name'],'Private Axe Den')===false,'private axe rental excluded when full cohort time cannot fit');
$r=run_case(25,['bowling'],'2026-11-06',['food'=>'yes'],['menu'=>'pizza','extras'=>['traditional'=>1]]);ok(main_plan($r)['dining_minutes']===0,'extra traditional wings retain lane-dining exception');
$r=run_case(25,['bowling'],'2026-11-06',['food'=>'yes'],['menu'=>'pizza','extras'=>['salad'=>1]]);ok(main_plan($r)['dining_minutes']===30,'salad forces separate setup');
$r=run_case(10,[],'2026-11-06',['food'=>'yes','description'=>'Breakfast event']);ok(main_plan($r)['hard_review']&&strpos(implode(' ',main_plan($r)['review']),'Breakfast Bar has been removed')!==false,'removed breakfast request held for staff');
$r=run_case(6,['bowling'],'2026-11-02');ok(strpos(main_plan($r)['name'],'1 hour bowling')===false,'no invented Monday regular bowling rate');
$r=run_case(4,['laser','climbing'],'2026-11-06',['children'=>4]);foreach(main_plan($r)['items'] as $i)if(strpos($i['label'],'Blast child')!==false)ok($i['quantity']===4,'mixed-group Blast charges children only');
foreach([null,[],true,'wrong',-1] as $bad){$s=Plugin::sample();$s['attractions']['axe']=$bad;ok(!$engine->recommend($s)['valid'],'malformed attraction value rejected: '.gettype($bad));}
foreach([1,6,7,8,10,25,26,48,49,50,51,56,57,100,125,126] as $n){$r=run_case($n,['bowling','axe','laser','arcade']);$p=main_plan($r);ok($p['total_cents']===array_sum(array_map(function($i){return $i['subtotal_cents']+$i['tax_cents'];},$p['items'])),'line totals reconcile for '.$n.' guests');}
echo "\n$tests checks passed.\n";
