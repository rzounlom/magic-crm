<?php
namespace Generations\PlannerNext;
if (!defined('ABSPATH')) exit;
require_once __DIR__.'/itinerary.php';

/** Per-message HTML, with no global wp_mail content-type filter. */
final class Emails {
    private static function e($v){return esc_html((string)$v);}
    private static function title($text){return '<h2 style="margin:28px 0 12px;color:#142b42;font-size:19px;line-height:1.3">'.self::e($text).'</h2>';}
    private static function rows($rows){
        $html='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">';
        foreach($rows as $label=>$value)$html.='<tr><td width="36%" style="padding:10px 12px 10px 0;border-bottom:1px solid #e4e9ee;color:#526477;font-size:13px;vertical-align:top">'.self::e($label).'</td><td style="padding:10px 0;border-bottom:1px solid #e4e9ee;font-size:14px;vertical-align:top;overflow-wrap:anywhere">'.nl2br(self::e($value)).'</td></tr>';
        return $html.'</table>';
    }
    private static function columns($columns){
        $html='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;margin:12px 0 20px"><tr>';
        foreach($columns as $label=>$values){
            $html.='<td class="gap-email-col" width="33.33%" style="vertical-align:top;padding:14px 12px;border:1px solid #dce3e9;background:#f3f6f9;overflow-wrap:anywhere"><strong style="display:block;color:#142b42;font-size:12px;line-height:1.4;margin-bottom:10px">'.self::e($label).'</strong>';
            foreach($values?:['None'] as $value)$html.='<p style="font-size:14px;line-height:1.45;margin:5px 0;color:#142b42">'.self::e($value).'</p>';
            $html.='</td>';
        }
        return $html.'</tr></table>';
    }
    private static function shell($eyebrow,$heading,$intro,$body,$show_phone=true){
        return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.self::e($heading).'</title><style>@media only screen and (max-width:480px){.gap-email-col{display:block!important;width:100%!important}}</style></head><body style="margin:0;background:#edf1f5;color:#142b42;font-family:Arial,Helvetica,sans-serif;line-height:1.55"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #dce3e9"><tr><td style="padding:32px 28px;background:#10283f;border-top:5px solid #ed671c;color:#fff"><p style="margin:0 0 18px;color:#ffb17e;font-size:11px;letter-spacing:2px;font-weight:bold">GENERATIONS ADVENTUREPLEX</p><p style="margin:0 0 8px;color:#c9d9e6;font-size:12px">'.self::e($eyebrow).'</p><h1 style="margin:0;color:#fff;font-size:30px;line-height:1.15">'.self::e($heading).'</h1><p style="margin:14px 0 0;color:#e0eaf3;font-size:15px">'.self::e($intro).'</p></td></tr><tr><td style="padding:8px 28px 30px;font-size:15px">'.$body.'</td></tr><tr><td style="padding:23px 28px;background:#f6f8fa;border-top:1px solid #e4e9ee;font-size:12px;color:#526477"><strong style="color:#142b42">Generations AdventurePlex</strong><br>1018 W. Edison Rd · Mishawaka, IN 46545<br>'.($show_phone?'<a href="tel:5748551095" style="color:#155e89">574-855-1095</a> · ':'').'<a href="mailto:events@generations-adventureplex.com" style="color:#155e89">Email our events team</a></td></tr></table></td></tr></table></body></html>';
    }
    public static function customer($d){
        $activities=[];foreach($d['attractions'] as $key=>$answer)if($answer!=='no')$activities[]=Engine::ATTRACTIONS[$key].($answer==='open'?' — open to a recommendation':'');
        $body='<p style="margin:24px 0 12px">Hi '.self::e($d['first_name']).',</p><p>We’ve received your event request—thank you for considering Generations AdventurePlex! Our events team will review your preferences and put together a recommendation for your group.</p>';
        $body.=self::title('Your request at a glance').self::rows([
            'Event type'=>$d['event_type']??'Not supplied',
            'Group / organization'=>$d['company'],
            'Preferred date(s)'=>implode(', ',$d['dates']),
            'Preferred start'=>self::time($d['time']),
            'Guest count'=>$d['guests'].' total · '.$d['adults'].' adults · '.$d['children'].' children',
            'Event duration'=>$d['duration']==='Other'?$d['other_hours'].' hours':$d['duration'],
            'Attraction preferences'=>$activities?implode("\n",$activities):'Our team will review your event details.'
        ]);
        $body.=self::title('What happens next?').'<p>Our team will review your dates, activities and any food or space requests. We’ll be in touch to discuss the options and help shape your event.</p><p style="padding:14px 16px;background:#fff3e8;border-left:3px solid #ed671c;font-size:13px">Your request is an inquiry. Your date, activities and pricing are confirmed separately with our events team.</p>';
        $body.=self::title('A little inspiration, attached').'<p>We’ve attached our attraction pricing and catering menu so you can explore the possibilities.</p><p style="font-size:13px;color:#526477">Attached regular prices are before tax. Our team will confirm the options and final pricing for your event.</p><p>Need to add or change something? Simply reply to this email.</p><p style="margin-top:24px">We look forward to crafting a great experience for your group!<br><strong>The Generations Events Team</strong></p>';
        return self::shell('YOUR EVENT REQUEST','We’ve received your request.','Good times. Great company. Your event starts here.',$body,false);
    }
    private static function time($value){$dt=\DateTime::createFromFormat('!H:i',$value);return $dt?$dt->format('g:i A'):$value;}
    public static function internal($result,$id){
        $d=$result['inquiry'];
        $body='<p style="margin-top:24px"><strong>INTERNAL PLANNING · Inquiry #'.self::e($id).'</strong><br><span style="font-size:13px;color:#526477">Proposed recommendation for staff review. No calculated quote was sent to the guest.</span></p>';
        $source=$result['submission']??[];$body.='<p style="font-size:13px"><strong>Submitted by:</strong> '.self::e(($source['source']??'customer')==='staff'?(($source['staff_name']??'')?:'Staff member not identified').' · Staff':'Customer').'</p>';
        $duration=$d['duration']==='Other'?$d['other_hours'].' hours':$d['duration'];
        $contact=$d['first_name'].' '.$d['last_name']."\n".$d['company']."\n".$d['email']."\n".$d['phone'];
        $event=($d['event_type']??'Unclassified')."\n".$d['guests'].' guests · '.$d['adults'].' adults / '.$d['children'].' children'."\n".implode(', ',$d['dates'])."\n".self::time($d['time']).' · '.$duration;
        $body.=self::title('Contact & event summary').'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f3f6f9"><tr>';
        foreach(['CONTACT'=>$contact,'EVENT'=>$event] as $label=>$value)$body.='<td class="gap-email-col" width="50%" style="padding:14px;vertical-align:top;font-size:13px;overflow-wrap:anywhere"><strong style="font-size:10px;letter-spacing:1px;color:#526477">'.self::e($label).'</strong><br>'.nl2br(self::e($value)).'</td>';
        $body.='</tr></table>';
        $groups=['yes'=>[],'open'=>[],'no'=>[]];foreach($d['attractions'] as $key=>$answer)$groups[$answer][]=Engine::ATTRACTIONS[$key];
        $body.=self::title('Attraction preferences').self::columns([
            'Include'=>$groups['yes'],
            'Open to Suggestions'=>$groups['open'],
            'Exclude'=>$groups['no']
        ]);
        $body.=self::title('Food, drinks & space').self::columns([
            'Food & Beverages'=>[ucfirst($d['food'])],
            'Craft Beverages'=>[ucfirst($d['craft'])],
            'Private Room'=>[ucfirst($d['private_room'])]
        ]);
        $rows=[
            'Budget / referral'=>($d['has_budget']==='yes'?'Budget: '.Engine::money($d['budget']):'No budget specified').' · Referral: '.$d['referral'],
            'Event description'=>$d['description'],
            'Special requests'=>$d['comments']?:'None supplied'
        ];
        $body.=self::rows($rows);
        foreach($result['dates'] as $day){
            $p=$day['recommendation'];$body.=self::title('Date option · '.$day['date']);
            $hold=$p['hard_review']||!$p['fits_duration']||!empty($p['duration_review']);
            $body.='<p style="padding:12px 14px;background:'.($hold?'#fff0e5':'#eef5fa').';border-left:3px solid '.($hold?'#c64d0b':'#155e89').';font-size:13px"><strong>'.($hold?'PLANNING HOLD — resolve flagged requirements before quoting.':'PROPOSED PLAN — staff confirmation required.').'</strong></p><h3 style="font-size:20px;margin:16px 0 6px">'.self::e($p['name']).'</h3><p>'.self::e($p['why']).'</p>';
            $body.=self::title('Itemized estimate').'<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px"><tr style="background:#f1f5f8"><th scope="col" align="left" style="padding:9px">Item / unit price</th><th scope="col" align="right" style="padding:9px">Qty</th><th scope="col" align="right" style="padding:9px">Pretax</th><th scope="col" align="right" style="padding:9px">Tax</th></tr>';
            foreach($p['items'] as $i)$body.='<tr><td style="padding:10px 9px;border-bottom:1px solid #e4e9ee">'.self::e($i['label']).'<br><span style="color:#526477">'.Engine::money($i['unit_cents']).' each</span></td><td align="right" style="padding:10px 9px;border-bottom:1px solid #e4e9ee">'.self::e($i['quantity']).'</td><td align="right" style="padding:10px 9px;border-bottom:1px solid #e4e9ee">'.Engine::money($i['subtotal_cents']).'</td><td align="right" style="padding:10px 9px;border-bottom:1px solid #e4e9ee">'.Engine::money($i['tax_cents']).'</td></tr>';
            $body.='</table>';
            if(!empty($p['unpriced']))$body.='<p><strong>Total unavailable — staff must establish the scope and quote.</strong></p>';
            else $body.=self::rows(['Subtotal'=>Engine::money($p['subtotal_cents']),'Estimated tax'=>Engine::money($p['tax_cents']),'Estimated total'=>Engine::money($p['total_cents']),'Per guest'=>Engine::money($p['per_guest_cents'])]);
            if($p['budget_over_cents'])$body.='<p style="color:#9c3509"><strong>ABOVE TOTAL BUDGET: '.Engine::money($p['budget_over_cents']).'</strong></p>';
            if($p['suggested_attractions'])$body.='<p><strong>Optional suggestions:</strong> '.self::e(implode(', ',array_map(function($k){return Engine::ATTRACTIONS[$k];},$p['suggested_attractions']))).'</p>';
            $body.=self::title('PROPOSED ITINERARY').Itinerary::html($p['itinerary']);
            $body.=self::title('Inclusions & staff review');
            foreach($p['notes'] as $note)$body.='<p style="margin:8px 0;font-size:13px">'.self::e($note).'</p>';
            foreach(array_unique($p['review']) as $note)$body.='<p style="margin:8px 0;font-size:13px;color:#9c3509"><strong>STAFF REVIEW:</strong> '.self::e($note).'</p>';
            $body.=self::title('Alternatives');
            foreach($day['alternatives'] as $alt){
                $body.='<h3 style="font-size:16px;margin:20px 0 6px">'.self::e($alt['name']).'</h3><p style="font-size:13px;margin:4px 0">'.self::e($d['guests'].' guests · '.$d['adults'].' adults / '.$d['children'].' children').'<br>'.(($alt['hard_review']||!empty($alt['duration_review']))?'Needs staff resolution':($alt['fits_duration']?'Fits requested duration':'Requires more time')).'</p>';
                $activity=[];
                if($alt['bowling_minutes'])$activity[]='Bowling: '.$alt['bowling_minutes'].' minutes per group';
                if($alt['axe_minutes'])$activity[]='Axe: '.$alt['axe_minutes'].' minutes throwing + 15-minute briefing per group';
                if($activity)$body.='<p style="font-size:12px;margin:4px 0">'.self::e(implode(' · ',$activity)).'</p>';
                $altGroups=Itinerary::compact($alt['itinerary']);
                if($altGroups['groups'])$body.='<p style="font-size:12px;margin:4px 0">'.self::e(implode(' / ',$altGroups['groups'])).'</p>';
                $body.='<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:12px"><tr style="background:#eef3f7"><th align="left">Item</th><th align="right">Qty × rate</th><th align="right">Pretax</th><th align="right">Tax</th></tr>';
                foreach($alt['items'] as $i)$body.='<tr><td style="border-bottom:1px solid #e4e9ee">'.self::e($i['label']).'</td><td align="right" style="border-bottom:1px solid #e4e9ee">'.self::e($i['quantity']).' × '.Engine::money($i['unit_cents']).'</td><td align="right" style="border-bottom:1px solid #e4e9ee">'.Engine::money($i['subtotal_cents']).'</td><td align="right" style="border-bottom:1px solid #e4e9ee">'.Engine::money($i['tax_cents']).'</td></tr>';
                $body.='</table>';
                $body.=!empty($alt['unpriced'])?'<p><strong>Total unavailable — staff quote required.</strong></p>':'<p style="font-size:13px"><strong>Subtotal '.Engine::money($alt['subtotal_cents']).' + tax '.Engine::money($alt['tax_cents']).' = '.Engine::money($alt['total_cents']).'</strong> · '.Engine::money($alt['per_guest_cents']).' per guest</p>';
                if($alt['budget_over_cents'])$body.='<p style="font-size:12px;color:#9c3509">Above total budget: '.Engine::money($alt['budget_over_cents']).'</p>';
                foreach($alt['notes'] as $note)$body.='<p style="margin:4px 0;font-size:12px">'.self::e($note).'</p>';
                foreach(array_unique($alt['review']) as $note)$body.='<p style="margin:4px 0;font-size:12px;color:#9c3509"><strong>STAFF REVIEW:</strong> '.self::e($note).'</p>';
            }
        }
        $body.='<p style="margin-top:28px;padding-top:14px;border-top:1px solid #dce3e9;font-size:12px;color:#526477">Status: '.self::e($result['status']).'<br>Rules: '.self::e($result['rules_version']).'<br>Confirm availability, participant eligibility, seating and final arrangements before quoting.</p>';
        return self::shell('STAFF EVENT REVIEW','A new group is ready for fun.',$d['company'].' · '.$d['guests'].' guests · '.$d['dates'][0],$body);
    }
}
