<?php
namespace Generations\PlannerNext;

/** Administrator-only maintenance; rules and saved inquiry totals are not rewritten. */
final class Admin {
    const PAGE='gapnext-prices';
    public static function boot(){
        add_action('admin_menu',function(){add_submenu_page('gapnext','Prices & Email Attachments','Prices & Attachments','manage_options',self::PAGE,[__CLASS__,'page']);});
        add_action('admin_enqueue_scripts',[__CLASS__,'assets']);
        add_action('admin_post_gapnext_prices',[__CLASS__,'save_prices']);
        add_action('admin_post_gapnext_attachments',[__CLASS__,'save_attachments']);
    }
    public static function assets($hook){
        if(!current_user_can('manage_options')||!isset($_GET['page'])||$_GET['page']!==self::PAGE)return;
        wp_enqueue_media();wp_enqueue_script('gapnext-admin',GAPNEXT_URL.'assets/admin.js',[],(string)filemtime(GAPNEXT_DIR.'assets/admin.js'),true);
    }
    public static function slots(){return ['menu'=>['label'=>'Catering menu','default'=>GAPNEXT_DIR.'menus/Group_Catering_Menu_2026.pdf'],'pricing'=>['label'=>'Attraction price sheet','default'=>GAPNEXT_DIR.'menus/Attraction_Prices_Poster.png']];}
    public static function ids(){
        $saved=get_option('gapnext_email_attachments',[]);$out=[];
        foreach(self::slots() as $slot=>$v)$out[$slot]=is_array($saved)&&isset($saved[$slot])?absint($saved[$slot]):0;
        return $out;
    }
    /** Never email an arbitrary server path or download a remote URL. */
    public static function attachment_path($id){
        if(!$id||get_post_type($id)!=='attachment')return new \WP_Error('attachment','Choose a file from the WordPress Media Library.');
        $file=get_attached_file($id,true);$uploads=wp_upload_dir();$base=realpath($uploads['basedir']);$path=is_string($file)?realpath($file):false;
        if(!$base||!$path||strpos(wp_normalize_path($path),trailingslashit(wp_normalize_path($base)))!==0||!is_file($path)||!is_readable($path))return new \WP_Error('attachment','The selected file must be available locally in WordPress uploads.');
        if(filesize($path)<=0||filesize($path)>10*1024*1024)return new \WP_Error('attachment','Each attachment must be nonempty and no larger than 10 MB.');
        $allowed=['pdf'=>'application/pdf','png'=>'image/png','jpg|jpeg'=>'image/jpeg'];$check=wp_check_filetype_and_ext($path,basename($path),$allowed);
        if(empty($check['ext'])||empty($check['type'])||!in_array($check['type'],array_values($allowed),true))return new \WP_Error('attachment','Use a PDF, PNG or JPEG file.');
        // PDF extensions alone are not sufficient evidence of document content.
        if($check['type']==='application/pdf'){$handle=fopen($path,'rb');$head=$handle?fread($handle,5):'';if($handle)fclose($handle);if($head!=='%PDF-')return new \WP_Error('attachment','The selected PDF is not a valid PDF file.');}
        return $path;
    }
    public static function attachments(){
        $files=[];$ids=self::ids();foreach(self::slots() as $slot=>$v){$path=$ids[$slot]?self::attachment_path($ids[$slot]):null;$files[]=is_string($path)?$path:$v['default'];}return $files;
    }
    public static function parse_prices($raw){
        if(!is_array($raw))return new \WP_Error('prices','No prices were supplied.');$out=[];
        foreach(Catalog::fields() as $key=>$field){
            $v=$raw[$key]??null;
            if(!is_string($v)||!preg_match('/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/D',$v))return new \WP_Error('prices','Enter a dollar amount with up to two decimal places for '.$field['label'].'.');
            $parts=explode('.',$v);$amount=(int)$parts[0]*100+(int)str_pad($parts[1]??'',2,'0');
            if($amount>1000000000)return new \WP_Error('prices','Price exceeds the $10,000,000 limit.');$out[$key]=$amount;
        }
        return $out;
    }
    private static function notice($message,$error=false){set_transient('gapnext_admin_notice_'.get_current_user_id(),['message'=>$message,'error'=>$error],5*MINUTE_IN_SECONDS);}
    private static function finish(){wp_safe_redirect(admin_url('admin.php?page='.self::PAGE));exit;}
    private static function protect($nonce){if(!current_user_can('manage_options'))wp_die('Not allowed.');check_admin_referer($nonce);}
    public static function save_prices(){
        self::protect('gapnext_prices');$raw=wp_unslash($_POST);$prices=self::parse_prices($raw['prices']??null);
        if(is_wp_error($prices)){self::notice($prices->get_error_message(),true);self::finish();}
        $revision=$raw['price_revision']??'';
        if(!is_string($revision)||!hash_equals(Catalog::revision(),$revision)){self::notice('Prices changed while this screen was open. Reload and review the current prices before saving.',true);self::finish();}
        update_option('gapnext_price_overrides',$prices,false);update_option('gapnext_prices_updated',['at'=>time(),'user'=>get_current_user_id()],false);
        self::notice('Prices saved. New inquiries and manual recalculations use these rates. Existing saved inquiry totals were not changed.');self::finish();
    }
    public static function save_attachments(){
        self::protect('gapnext_attachments');$raw=wp_unslash($_POST);$values=$raw['attachments']??null;$ids=[];
        if(!is_array($values)){self::notice('Choose both attachment settings before saving.',true);self::finish();}
        foreach(self::slots() as $slot=>$v){
            $id=$values[$slot]??null;
            if(!is_string($id)||!preg_match('/^[0-9]+$/D',$id)){self::notice('Invalid attachment selection.',true);self::finish();}
            $ids[$slot]=(int)$id;if($ids[$slot]){$file=self::attachment_path($ids[$slot]);if(is_wp_error($file)){self::notice($v['label'].': '.$file->get_error_message(),true);self::finish();}}
        }
        update_option('gapnext_email_attachments',$ids,false);self::notice('Email attachments saved. Future customer acknowledgment sends use these files.');self::finish();
    }
    public static function page(){
        if(!current_user_can('manage_options'))return;
        echo '<div class="wrap"><h1>Prices &amp; Email Attachments</h1>';
        $notice=get_transient('gapnext_admin_notice_'.get_current_user_id());if(is_array($notice)){delete_transient('gapnext_admin_notice_'.get_current_user_id());echo '<div class="notice '.(!empty($notice['error'])?'notice-error':'notice-success').'"><p>'.esc_html($notice['message']).'</p></div>';}
        echo '<p>Prices are in dollars, before applicable tax. Saving rates changes new recommendations and deliberate staff recalculations; existing inquiry totals and sent emails stay as saved.</p><p><strong>Keep your attachments in sync:</strong> changing a price here does not edit text inside a PDF or image. Upload matching attraction pricing and catering documents when published prices change.</p>';
        echo '<h2>Customer email attachments</h2><p>Choose or upload a PDF, PNG or JPEG, up to 10 MB per file. Files stay in your WordPress Media Library across plugin updates. Offloaded files must also have a local copy.</p><form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="gapnext_attachments">';wp_nonce_field('gapnext_attachments');
        $ids=self::ids();foreach(self::slots() as $slot=>$v){$id=$ids[$slot];$path=$id?self::attachment_path($id):null;$name=$id?get_the_title($id):basename($v['default']);
            echo '<div data-gapnext-file style="background:#fff;border:1px solid #ccd0d4;padding:16px;margin:12px 0;max-width:760px"><h3>'.esc_html($v['label']).'</h3><input type="hidden" name="attachments['.esc_attr($slot).']" value="'.esc_attr($id).'" data-file-id><p data-file-name>'.esc_html($name).'</p>';
            if($id&&is_wp_error($path))echo '<p style="color:#b32d2e">Selected file is unavailable. Emails currently use the bundled default. Choose a replacement.</p>';
            if($id&&!is_wp_error($path))echo '<p><a href="'.esc_url(wp_get_attachment_url($id)).'" target="_blank" rel="noopener">View current file</a></p>';
            else echo '<p><a href="'.esc_url(GAPNEXT_URL.'menus/'.basename($v['default'])).'" target="_blank" rel="noopener">View bundled default</a></p>';
            echo '<button type="button" class="button" data-choose-file>Choose or upload file</button> <button type="button" class="button" data-default-file data-default-name="'.esc_attr(basename($v['default'])).'">Use bundled default</button></div>';
        }
        submit_button('Save email attachments');echo '</form><hr><h2>Recommendation prices</h2><p>These controls change monetary rates only. Package inclusions, play-credit amounts, capacities, Wednesday/Thursday specials and scheduling rules remain unchanged.</p>';
        $meta=get_option('gapnext_prices_updated',[]);if(is_array($meta)&&!empty($meta['at']))echo '<p>Last saved: '.esc_html(wp_date('M j, Y g:i a',(int)$meta['at'])).'</p>';
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="gapnext_prices"><input type="hidden" name="price_revision" value="'.esc_attr(Catalog::revision()).'">';wp_nonce_field('gapnext_prices');
        $prices=Catalog::all();$group='';foreach(Catalog::fields() as $key=>$field){if($group!==$field['group']){if($group!=='')echo '</tbody></table>';$group=$field['group'];echo '<h3>'.esc_html($group).'</h3><table class="widefat striped" style="max-width:800px"><thead><tr><th scope="col">Rate</th><th scope="col">Price ($)</th></tr></thead><tbody>';}$parts=explode('.',$key);$amount=count($parts)===2?$prices[$parts[0]][$parts[1]]:$prices[$key];$id='gapnext-price-'.str_replace('.','-',$key);
            echo '<tr><th scope="row"><label for="'.esc_attr($id).'">'.esc_html($field['label']).'</label></th><td><input id="'.esc_attr($id).'" name="prices['.esc_attr($key).']" type="number" min="0" max="10000000" step="0.01" required value="'.esc_attr(number_format($amount/100,2,'.','')).'" style="width:140px"></td></tr>';
        }echo '</tbody></table>';submit_button('Save recommendation prices');echo '</form></div>';
    }
}
