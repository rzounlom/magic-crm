<?php
if(PHP_SAPI!=='cli'||!getenv('GAPNEXT_WP_ROOT'))exit(1);
require rtrim(getenv('GAPNEXT_WP_ROOT'),'/').'/wp-load.php';
use Generations\PlannerNext\Engine;use Generations\PlannerNext\Plugin;use Generations\PlannerNext\Emails;
if(!defined('WP_ENVIRONMENT_TYPE')||WP_ENVIRONMENT_TYPE!=='local')throw new Exception('Isolated local test only.');
$tests=0;function cok($v,$label){global $tests;$tests++;if(!$v)throw new Exception('FAIL '.$label);echo 'PASS '.$label."\n";}
$s=Plugin::sample();$s['event_type']='Sports Team';$s['adults']=5;$s['children']=10;$s['dates']=['2026-11-14'];$s['time']='12:00';$s['duration']='Other';$s['other_hours']='0.01';$s['food']='yes';$s['craft']='yes';foreach(['laser','golf','climbing','arcade'] as $a)$s['attractions'][$a]='yes';$s['attractions']['bowling']='open';
$r=(new Engine())->recommend($s);$p=$r['dates'][0]['recommendation'];
cok(strpos($p['name'],'Adventure Blast')!==false&&!$p['fits_duration']&&$r['inquiry']['minutes']===1,'exact mixed sports-team example retains the recorded duration hold and separate adult access');
cok($p['total_cents']===78330,'reallocation preserves the original $783.30 event total');
$cards=$p['arcade_cards'];$adults=array_values(array_filter($cards,function($c){return $c['audience']==='adult';}));$children=array_values(array_filter($cards,function($c){return $c['audience']==='child';}));
cok(count($adults)===1&&$adults[0]['quantity']===5&&$adults[0]['credit_cents']===1500&&$adults[0]['additional_cents_each']===1500,'five adults receive $15 cards, $75 additional');
cok(count($children)===1&&$children[0]['quantity']===10&&$children[0]['credit_cents']===1500&&$children[0]['included_cents_each']===1500&&$children[0]['additional_cents_each']===0,'ten children receive their included $15 cards without extra funding');
cok(array_sum(array_column($cards,'quantity'))===15,'arcade card quantity matches all fifteen guests');
$arcade=array_values(array_filter($p['items'],function($i){return strpos($i['label'],'Arcade credit')===0;}));cok(array_sum(array_column($arcade,'subtotal_cents'))===7500,'additional arcade funding is $75, not $155');
$golf=array_values(array_filter($p['items'],function($i){return strpos($i['label'],'Mini golf')===0;}));cok(array_sum(array_column($golf,'subtotal_cents'))===13000,'mini golf is funded separately for all five adults and ten children');
cok(strpos(implode(' ',$p['notes']),'Prepare 10 child arcade cards with $15.00 total credit each')!==false,'staff instructions show actual child card count and face value');
$mail=Emails::internal($r,4300);cok(strpos($mail,'$155.00 each')===false&&strpos($mail,'$15.00 total credit')!==false,'internal email no longer presents a single pooled $155 card');
$s['attractions']['arcade']='no';$p=(new Engine())->recommend($s)['dates'][0]['recommendation'];cok(empty($p['arcade_cards']),'excluded arcade does not generate guest cards');
// Unrestricted pooled credits can split by a cent; preserve exact monetary cost.
$engine=new Engine();$method=new ReflectionMethod(Engine::class,'arcade_lines');$method->setAccessible(true);$p=['items'=>[],'notes'=>[],'subtotal_cents'=>0,'tax_cents'=>0,'total_cents'=>0];$d=['guests'=>3,'adults'=>3,'children'=>0];$args=[&$p,$d,1000,1000];$method->invokeArgs($engine,$args);
cok(array_sum(array_column($p['items'],'subtotal_cents'))===2000&&array_sum(array_column($p['arcade_cards'],'quantity'))===3,'uneven credit is distributed across three cards without losing cents');
cok(array_sum(array_map(function($c){return $c['quantity']*$c['credit_cents'];},$p['arcade_cards']))===3000,'funding rows still represent three $10 face-value cards');
echo "\n$tests arcade allocation checks passed. No external mail sent.\n";
