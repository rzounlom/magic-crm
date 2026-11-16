<?php
namespace Generations\PlannerNext;
if(!defined('ABSPATH'))exit;

/** DNS mail-routing check, not mailbox ownership or delivery verification. */
final class EmailDomain {
    const TYPOS=['gmial.com'=>'gmail.com','gamil.com'=>'gmail.com','gmai.com'=>'gmail.com','gnail.com'=>'gmail.com','gmail.con'=>'gmail.com','gmail.cmo'=>'gmail.com','gmail.co'=>'gmail.com','gmail.cm'=>'gmail.com','gmaill.com'=>'gmail.com','yaho.com'=>'yahoo.com','yahoo.con'=>'yahoo.com','yahoo.cmo'=>'yahoo.com','hotmial.com'=>'hotmail.com','hotmai.com'=>'hotmail.com','hotmail.con'=>'hotmail.com','outlok.com'=>'outlook.com','outllook.com'=>'outlook.com','outlook.con'=>'outlook.com','icloud.con'=>'icloud.com'];
    public static function domain($email){$pos=strrpos($email,'@');return $pos===false?'':strtolower(substr($email,$pos+1));}
    private static function answer($status,$domain,$message){return ['status'=>$status,'domain'=>$domain,'message'=>$message];}
    private static function lookup($domain,$type){
        $override=apply_filters('gapnext_dns_records',null,$domain,$type);if($override!==null)return $override;
        if(!function_exists('dns_get_record'))return false;
        $failed=false;set_error_handler(function()use(&$failed){$failed=true;return true;});
        try{$records=dns_get_record($domain,$type);}catch(\Throwable $e){$records=false;$failed=true;}finally{restore_error_handler();}
        return $failed?false:$records;
    }
    public static function check($domain,$confirmed=''){
        $domain=strtolower(trim((string)$domain));
        if(strlen($domain)>253||!preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/D',$domain)){
            if(isset(self::TYPOS[$domain]))return ['status'=>'suggestion','domain'=>$domain,'suggested_domain'=>self::TYPOS[$domain],'message'=>'Did you mean '.self::TYPOS[$domain].'?'];
            return self::answer('invalid',$domain,'Enter a valid email domain, such as gmail.com or your company domain.');
        }
        if(isset(self::TYPOS[$domain])&&$confirmed!==$domain)return ['status'=>'suggestion','domain'=>$domain,'suggested_domain'=>self::TYPOS[$domain],'message'=>'Did you mean '.self::TYPOS[$domain].'? Choose the correction or confirm the address you entered.'];
        $key='gapnext_dns_'.hash('sha256',$domain);$saved=get_transient($key);if(is_array($saved))return $saved;
        $mx=self::lookup($domain,DNS_MX);
        if($mx===false)$result=self::answer('unknown',$domain,'We could not check this email domain right now. Please double-check the address.');
        else{
            $mail=false;$null=false;foreach($mx as $record){$target=trim((string)($record['target']??''));if(($record['type']??'MX')==='MX'){if($target===''||$target==='.')$null=true;else $mail=true;}}
            if($null&&!$mail)$result=self::answer('invalid',$domain,'This email domain does not accept email. Please use another address.');
            elseif($mail)$result=self::answer('valid',$domain,'Email domain checked.');
            else{
                // SMTP permits delivery to A/AAAA when an explicit MX is absent.
                $a=self::lookup($domain,DNS_A);$aaaa=self::lookup($domain,DNS_AAAA);
                if((is_array($a)&&count(array_filter($a,function($r){return !empty($r['ip'])&&filter_var($r['ip'],FILTER_VALIDATE_IP,FILTER_FLAG_IPV4);})))||(is_array($aaaa)&&count(array_filter($aaaa,function($r){return !empty($r['ipv6'])&&filter_var($r['ipv6'],FILTER_VALIDATE_IP,FILTER_FLAG_IPV6);}))))$result=self::answer('valid',$domain,'Email domain checked.');
                elseif(count(array_filter(array_merge(is_array($a)?$a:[],is_array($aaaa)?$aaaa:[]),function($r){return ($r['type']??'')==='CNAME';})))$result=self::answer('unknown',$domain,'We could not fully check this email domain right now. Please double-check the address.');
                elseif($a===false||$aaaa===false)$result=self::answer('unknown',$domain,'We could not check this email domain right now. Please double-check the address.');
                else $result=self::answer('invalid',$domain,'We could not find an email destination for this domain. Please check for a typo.');
            }
        }
        set_transient($key,$result,$result['status']==='valid'?6*HOUR_IN_SECONDS:($result['status']==='invalid'?5*MINUTE_IN_SECONDS:MINUTE_IN_SECONDS));
        return $result;
    }
    public static function validate($email,$confirmed=''){
        if(!is_string($email)||!filter_var($email,FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$email))return self::answer('invalid','','Enter a valid email address.');
        return self::check(self::domain($email),is_string($confirmed)?$confirmed:'');
    }
}
