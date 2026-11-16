<?php
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
require __DIR__.'/../includes/catalog.php';require __DIR__.'/../includes/engine.php';require __DIR__.'/../includes/plugin.php';
use Generations\PlannerNext\Engine;use Generations\PlannerNext\Plugin;
$engine=new Engine();$tests=0;
function ok($condition,$message){global $tests;$tests++;if(!$condition)throw new Exception('FAIL '.$message);echo 'PASS '.$message."\n";}
function run_case($n,$attractions,$date='2026-11-06',$changes=[],$options=[]){global $engine;$s=Plugin::sample();$s['adults']=$n;foreach($attractions as $a)$s['attractions'][$a]='yes';$s['dates']=[$date];$s=array_replace_recursive($s,$changes);$options=array_merge(['bowling_hours'=>1],$options);$r=$engine->recommend($s,$options);if(!$r['valid'])throw new Exception(json_encode($r));return $r;}
function main_plan($r){return $r['dates'][0]['recommendation'];}
