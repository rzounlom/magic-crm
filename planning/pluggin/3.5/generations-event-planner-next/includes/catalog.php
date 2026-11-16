<?php
namespace Generations\PlannerNext;
final class Catalog {
    const VERSION = '2026-11-02';
    public static function defaults() {
        return [
            'bowling'=>['hour_weekday'=>3000,'hour_weekend'=>4000,'half_weekday'=>1750,'half_weekend'=>2500,'game_weekday'=>600,'game_weekend'=>800,'shoes'=>350,'exclusive_hour'=>52500,'exclusive_two'=>75000,'exclusive_peak'=>85000,'pins'=>4999,'all_access'=>5500],
            'axe'=>['half'=>1750,'hour'=>3000,'xtreme'=>4500,'private'=>150000,'private_sat'=>199500],
            'laser'=>['game'=>800,'pass'=>2500,'thursday'=>2000,'plex'=>2000,'games'=>3999,'blast'=>2999,'private'=>55000,'private_sat'=>59900],
            'golf'=>['adult'=>1000,'child'=>800],'climb'=>500,'pitcher'=>800,'drink_card'=>800,
            'food'=>['combo'=>2000,'boneless'=>3699,'traditional'=>3849,'pretzels'=>2699,'strips'=>4999,'salad'=>2499,'boards'=>18113,'cookies'=>2070,'brownies'=>4554,'fajita'=>2500,'slider'=>3000,'bbq'=>3500],
            'rooms'=>['lower'=>15000,'upper'=>25000,'cove'=>65000,'lower_extra'=>7500,'upper_extra'=>9900],
            'mezzanine'=>['sun_thu'=>275000,'fri'=>475000,'sat_before'=>549500,'sat_after'=>599500,'two'=>309500],
            'facility'=>['before'=>549500,'sat_before'=>879500,'sun_thu_after'=>599500,'fri_after'=>979500,'sat_after'=>1079500],
        ];
    }
    /** Only known monetary values can be overridden; amounts remain integer cents. */
    public static function all() {
        $prices=self::defaults();
        $saved=function_exists('get_option')?get_option('gapnext_price_overrides',[]):[];
        if(!is_array($saved))return $prices;
        foreach(self::fields() as $key=>$field){
            if(!isset($saved[$key])||!is_int($saved[$key])||$saved[$key]<0||$saved[$key]>1000000000)continue;
            $parts=explode('.',$key);if(count($parts)===2)$prices[$parts[0]][$parts[1]]=$saved[$key];else $prices[$key]=$saved[$key];
        }
        return $prices;
    }
    public static function revision(){return substr(hash('sha256',json_encode(self::all())),0,12);}
    public static function fields(){
        $groups=['bowling'=>'Bowling & bowling packages','axe'=>'Axe throwing','laser'=>'Laser tag & laser packages','golf'=>'Mini golf','food'=>'Catering','rooms'=>'Private rooms','mezzanine'=>'Mezzanine rentals','facility'=>'Full facility rentals'];
        $labels=[
            'bowling'=>['hour_weekday'=>'Tuesday–Thursday / lane / hour','hour_weekend'=>'Friday–Sunday / lane / hour','half_weekday'=>'Tuesday–Thursday / lane / 30 minutes','half_weekend'=>'Friday–Sunday / lane / 30 minutes','game_weekday'=>'Tuesday–Thursday / person / game','game_weekend'=>'Friday–Sunday / person / game','shoes'=>'Shoes / bowler','exclusive_hour'=>'Private bowling / 1 hour (shoes included)','exclusive_two'=>'Private bowling / 2 hours (shoes included)','exclusive_peak'=>'Private bowling / 2 hours — Friday/Saturday from 4 PM','pins'=>'Pizza & Pins / up to 6 guests','all_access'=>'All-Access / person'],
            'axe'=>['half'=>'30 minutes / person','hour'=>'60 minutes / person','xtreme'=>'AxeTreme / person','private'=>'Private Axe Den / 2 hours — Sunday–Friday','private_sat'=>'Private Axe Den / 2 hours — Saturday'],
            'laser'=>['game'=>'Single laser game / person','pass'=>'90-minute laser access / person (except Thursday)','thursday'=>'Thursday unlimited laser / person','plex'=>'LaserPlex / person','games'=>'Laser Tag & Games / person','blast'=>'Adventure Blast / participating child','private'=>'Private laser / 90 minutes — Sunday–Friday','private_sat'=>'Private laser / 60 minutes — Saturday'],
            'golf'=>['adult'=>'Mini golf / adult','child'=>'Mini golf / child'],
            'food'=>['combo'=>'Pizza & pitcher combo','boneless'=>'36-piece boneless wing platter','traditional'=>'36-piece traditional wing platter','pretzels'=>'Pretzel bite platter','strips'=>'Chicken strip platter','salad'=>'Salad pan','boards'=>'Veggie, fruit & cheese / 3-board set','cookies'=>'Cookie tray','brownies'=>'Brownie tray','fajita'=>'Fajita Bar / person','slider'=>'Slider Bar / person','bbq'=>'Smokehouse BBQ Bar / person'],
            'rooms'=>['lower'=>'Lower Event Room / 3 hours','upper'=>'Skybox / 3 hours','cove'=>'Climbers Cove / 3 hours','lower_extra'=>'Lower Event Room / requested extra hour','upper_extra'=>'Skybox / requested extra hour'],
            'mezzanine'=>['sun_thu'=>'Sunday–Thursday / 3 hours','fri'=>'Friday / 3 hours','sat_before'=>'Saturday before 4 PM / 3 hours','sat_after'=>'Saturday from 4 PM / 3 hours','two'=>'Friday/Saturday / 2 hours'],
            'facility'=>['before'=>'Sunday–Friday before 4 PM / 3 hours','sat_before'=>'Saturday before 4 PM / 3 hours','sun_thu_after'=>'Sunday–Thursday from 4 PM / 3 hours','fri_after'=>'Friday from 4 PM / 3 hours','sat_after'=>'Saturday from 4 PM / 3 hours'],
        ];
        $single=['climb'=>['Climbing','One climb / person'],'pitcher'=>['Beverages','Fountain beverage pitcher'],'drink_card'=>['Beverages','Default Beer Wall drink card / eligible adult']];$out=[];
        foreach(self::defaults() as $group=>$values){
            if(is_array($values)){foreach($values as $key=>$amount)$out[$group.'.'.$key]=['group'=>$groups[$group],'label'=>$labels[$group][$key],'default'=>$amount];}
            else $out[$group]=['group'=>$single[$group][0],'label'=>$single[$group][1],'default'=>$values];
        }
        return $out;
    }
}
