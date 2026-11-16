<?php
namespace Generations\PlannerNext;
if(!defined('ABSPATH'))exit;

/** Small dependency-free OOXML writer. User text is always inline text, never formulas. */
final class Xlsx {
    private static function xml($text){return htmlspecialchars(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/','',wp_check_invalid_utf8((string)$text)),ENT_XML1|ENT_QUOTES,'UTF-8');}
    public static function column($number){$text='';while($number>0){$number--;$text=chr(65+$number%26).$text;$number=(int)floor($number/26);}return $text;}
    public static function date($text,$time=false){
        if(!$text)return null;
        $format=$time?'!Y-m-d H:i:s':'!Y-m-d';$date=\DateTimeImmutable::createFromFormat($format,$text,new \DateTimeZone('UTC'));
        if(!$date||$date->format($time?'Y-m-d H:i:s':'Y-m-d')!==$text)return null;
        return ($date->getTimestamp()-(new \DateTimeImmutable('1899-12-30',new \DateTimeZone('UTC')))->getTimestamp())/86400;
    }
    public static function time($text){$date=\DateTimeImmutable::createFromFormat('!H:i',(string)$text);return $date&&$date->format('H:i')===$text?((int)$date->format('H')*60+(int)$date->format('i'))/1440:null;}
    private static function zip($files){
        $body='';$directory='';$count=0;
        foreach($files as $name=>$data){
            $offset=strlen($body);$length=strlen($data);$crc=crc32($data);$nameLength=strlen($name);
            $body.=pack('VvvvvvVVVvv',0x04034b50,20,0,0,0,0x21,$crc,$length,$length,$nameLength,0).$name.$data;
            $directory.=pack('VvvvvvvVVVvvvvvVV',0x02014b50,20,20,0,0,0,0x21,$crc,$length,$length,$nameLength,0,0,0,0,0,$offset).$name;$count++;
        }
        return $body.$directory.pack('VvvvvVVv',0x06054b50,0,0,$count,$count,strlen($directory),strlen($body),0);
    }
    public static function build($sheets){
        $ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';$rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
        $files=[];$types='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
        $workbook='<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="'.$ns.'" xmlns:r="'.$rel.'"><bookViews><workbookView/></bookViews><sheets>';$relationships='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        foreach(array_values($sheets) as $index=>$sheet){
            $id=$index+1;$headers=$sheet['headers'];$width=count($headers);$last=self::column($width);$height=max(1,count($sheet['rows'])+1);$range='A1:'.$last.$height;
            $workbook.='<sheet name="'.self::xml($sheet['name']).'" sheetId="'.$id.'" r:id="rId'.$id.'"/>';$relationships.='<Relationship Id="rId'.$id.'" Type="'.$rel.'/worksheet" Target="worksheets/sheet'.$id.'.xml"/>';$types.='<Override PartName="/xl/worksheets/sheet'.$id.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            $xml='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="'.$ns.'" xmlns:r="'.$rel.'"><dimension ref="'.$range.'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="45"/><cols>';
            foreach($headers as $col=>$header){$w=$sheet['widths'][$col]??22;$xml.='<col min="'.($col+1).'" max="'.($col+1).'" width="'.$w.'" customWidth="1"/>';}
            $xml.='</cols><sheetData><row r="1" ht="42" customHeight="1">';foreach($headers as $col=>$header)$xml.='<c r="'.self::column($col+1).'1" t="inlineStr" s="1"><is><t>'.self::xml($header).'</t></is></c>';$xml.='</row>';$links=[];$rels=[];
            foreach($sheet['rows'] as $rowIndex=>$row){$rowNum=$rowIndex+2;$lines=1;foreach($row as $col=>$cell){$value=is_array($cell)?($cell['value']??''):$cell;if(is_string($value)){$count=0;foreach(explode("\n",$value) as $paragraph)$count+=max(1,(int)ceil(mb_strlen($paragraph)/max(10,($sheet['widths'][$col]??22)-2)));$lines=max($lines,$count);}}$rowHeight=min(409,max(60,$lines*16+12));$xml.='<row r="'.$rowNum.'" ht="'.$rowHeight.'" customHeight="1">';foreach($headers as $col=>$header){$cell=$row[$col]??null;$value=is_array($cell)?($cell['value']??null):$cell;$style=is_array($cell)?($cell['style']??0):0;$ref=self::column($col+1).$rowNum;
                    if($value===null||$value==='')$value='Not provided';if(is_float($value)&&!is_finite($value))$value='Invalid number';
                    if(!is_int($value)&&!is_float($value)&&in_array($style,[2,3,4,6],true))$style=0;
                    if((is_int($value)||is_float($value))&&$style===0)$style=7;
                    if(is_int($value)||is_float($value))$xml.='<c r="'.$ref.'" s="'.$style.'"><v>'.self::xml($value).'</v></c>';
                    else $xml.='<c r="'.$ref.'" s="'.$style.'" t="inlineStr"><is><t xml:space="preserve">'.self::xml($value).'</t></is></c>';
                    if(is_array($cell)&&!empty($cell['link'])&&preg_match('/^(?:https?:\/\/|mailto:|tel:)/i',$cell['link'])){$rid='rId'.(count($links)+1);$links[]='<hyperlink ref="'.$ref.'" r:id="'.$rid.'"/>';$rels[]='<Relationship Id="'.$rid.'" Type="'.$rel.'/hyperlink" Target="'.self::xml($cell['link']).'" TargetMode="External"/>';}
                }$xml.='</row>';}
            $xml.='</sheetData><autoFilter ref="'.$range.'"/>';if($links)$xml.='<hyperlinks>'.implode('',$links).'</hyperlinks>';$xml.='<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>';$files['xl/worksheets/sheet'.$id.'.xml']=$xml;
            if($rels)$files['xl/worksheets/_rels/sheet'.$id.'.xml.rels']='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.implode('',$rels).'</Relationships>';
        }
        $files['[Content_Types].xml']=$types.'</Types>';$files['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'.$rel.'/officeDocument" Target="xl/workbook.xml"/></Relationships>';
        $files['xl/workbook.xml']=$workbook.'</sheets></workbook>';$files['xl/_rels/workbook.xml.rels']=$relationships.'<Relationship Id="rIdStyles" Type="'.$rel.'/styles" Target="styles.xml"/></Relationships>';
        $files['xl/styles.xml']='<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="'.$ns.'"><numFmts count="4"><numFmt numFmtId="164" formatCode="mm/dd/yy"/><numFmt numFmtId="165" formatCode="mm/dd/yy h:mm AM/PM"/><numFmt numFmtId="166" formatCode="$#,##0.00"/><numFmt numFmtId="167" formatCode="h:mm AM/PM"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/><color rgb="FF142B42"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><sz val="11"/><name val="Calibri"/><color rgb="FF125C89"/><u/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF142B42"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFDCE3E9"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" indent="1" vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" indent="1" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" indent="1" vertical="top"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" indent="1" vertical="top"/></xf><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" indent="1" vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" indent="1" vertical="top" wrapText="1"/></xf><xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" indent="1" vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" indent="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
        return self::zip($files);
    }
    public static function temporary($bytes,$filename){
        $dir=rtrim(sys_get_temp_dir(),DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.'gap-report-'.wp_generate_password(24,false,false);
        if(!mkdir($dir,0700))throw new \RuntimeException('Unable to create private report directory.');$path=$dir.DIRECTORY_SEPARATOR.sanitize_file_name($filename);
        if(file_put_contents($path,$bytes)===false){rmdir($dir);throw new \RuntimeException('Unable to write report attachment.');}chmod($path,0600);return $path;
    }
    public static function remove($path){if($path&&is_file($path)){unlink($path);rmdir(dirname($path));}}
}
