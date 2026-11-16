<?php
namespace Generations\PlannerNext;
if(!defined('ABSPATH'))exit;

/** Presentation only: never shortens purchased play or changes schedule timestamps. */
final class Itinerary {
    public static function compact($slots){
        $groups=[];$notes=[];$display=[];
        foreach($slots as $slot)if($slot['group']!=='All guests')$groups[$slot['group']]=true;
        foreach($slots as $slot){
            $group=$slot['group'];$label=$slot['label'];
            if($label==='Bowling check-in & shoes'){
                $notes[]=((count($groups)>1)?$group.': ':'').'Bowling shoes '.$slot['start'].'–'.$slot['end'].'.';continue;
            }
            if($label==='Axe Check-In & Safety Briefing')continue;
            if($label==='Axe Throwing'){
                foreach($slots as $prep)if($prep['group']===$group&&$prep['label']==='Axe Check-In & Safety Briefing'&&$prep['end_minute']===$slot['start_minute']){
                    $notes[]=((count($groups)>1)?$group.': ':'').'Axe briefing '.$prep['start'].'–'.$prep['end'].'; throwing '.$slot['start'].'–'.$slot['end'].'.';
                    $slot['start']=$prep['start'];$slot['start_minute']=$prep['start_minute'];$slot['label']='Axe briefing + throwing';break;
                }
            }
            $display[]=$slot;
        }
        // Preserve an unmatched briefing rather than accidentally hiding information.
        foreach($slots as $prep)if($prep['label']==='Axe Check-In & Safety Briefing'){
            $paired=false;foreach($slots as $slot)if($slot['label']==='Axe Throwing'&&$slot['group']===$prep['group']&&$prep['end_minute']===$slot['start_minute'])$paired=true;
            if(!$paired)$display[]=$prep;
        }
        usort($display,function($a,$b){return $a['start_minute']<=>$b['start_minute'];});
        $buckets=[];
        foreach($display as $slot){
            $key=$slot['start_minute'].($slot['group']==='All guests'?'_all':'_groups');
            if(!isset($buckets[$key]))$buckets[$key]=['start'=>$slot['start'],'end'=>$slot['end'],'end_minute'=>$slot['end_minute'],'slots'=>[],'all'=>$slot['group']==='All guests'];
            if($slot['end_minute']>$buckets[$key]['end_minute']){$buckets[$key]['end']=$slot['end'];$buckets[$key]['end_minute']=$slot['end_minute'];}
            $buckets[$key]['slots'][]=$slot;
        }
        return ['groups'=>count($groups)>1?array_keys($groups):[],'rows'=>array_values($buckets),'notes'=>array_values(array_unique($notes))];
    }
    private static function label($slot,$row){return $slot['label'].($slot['end_minute']<$row['end_minute']?' (ends '.$slot['end'].')':'');}
    public static function html($slots){
        $data=self::compact($slots);if(!$data['rows'])return '<p>No itinerary available.</p>';
        $e=function($v){return esc_html((string)$v);};$groups=$data['groups'];$width=max(1,count($groups));
        $html='<div style="overflow-x:auto"><table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;font-size:13px"><thead><tr style="background:#eef3f7"><th scope="col" align="left" style="width:28%;padding:8px">Time</th>';
        foreach($groups?:['Activity'] as $group)$html.='<th scope="col" align="left" style="padding:8px">'.$e($group).'</th>';
        $html.='</tr></thead><tbody>';
        foreach($data['rows'] as $row){
            $html.='<tr><td style="padding:8px;vertical-align:top;overflow-wrap:anywhere;border-bottom:1px solid #e4e9ee">'.$e($row['start'].'–'.$row['end']).'</td>';
            if($row['all']||!$groups){$labels=[];foreach($row['slots'] as $slot)$labels[]=self::label($slot,$row);$html.='<td colspan="'.$width.'" style="padding:8px;overflow-wrap:anywhere;border-bottom:1px solid #e4e9ee">'.$e(implode('; ',$labels)).($row['all']&&$groups?' — all guests':'').'</td>';}
            else foreach($groups as $group){$labels=[];foreach($row['slots'] as $slot)if($slot['group']===$group)$labels[]=self::label($slot,$row);$html.='<td style="padding:8px;vertical-align:top;overflow-wrap:anywhere;border-bottom:1px solid #e4e9ee">'.$e(implode('; ',$labels)).'</td>';}
            $html.='</tr>';
        }
        $html.='</tbody></table></div>';
        if($data['notes'])$html.='<p style="font-size:12px;color:#526477;line-height:1.5">'.implode('<br>',array_map($e,$data['notes'])).'</p>';
        return $html;
    }
    public static function text($slots){
        $data=self::compact($slots);$text='';
        foreach($data['rows'] as $row){$labels=[];foreach($row['slots'] as $slot)$labels[]=($data['groups']?$slot['group'].' — ':'').self::label($slot,$row);$text.=$row['start'].'–'.$row['end'].' | '.implode(' | ',$labels)."\n";}
        foreach($data['notes'] as $note)$text.=$note."\n";
        return $text;
    }
}
