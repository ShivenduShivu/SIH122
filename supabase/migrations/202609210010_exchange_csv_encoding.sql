-- Help spreadsheet applications identify UTF-8 when opening CSV directly.
-- Stored exports are immutable; only newly generated packages use the BOM.
create or replace function app_private.exchange_csv(p_rows jsonb,p_columns text[]) returns text
language plpgsql immutable set search_path='' as $$
declare result text=''; row jsonb; col text; cell text; line text;
begin
 foreach col in array p_columns loop result=result||case when result='' then '' else ',' end||'"'||replace(col,'"','""')||'"';end loop;
 result=result||E'\r\n';
 for row in select value from jsonb_array_elements(p_rows) loop
  line='';foreach col in array p_columns loop
   cell=coalesce(row->>col,'');
   if replace(cell,chr(65279),'') ~ '^[[:space:]]*[=+@-]' or cell ~ '^[\t\r\n]' then cell=''''||cell;end if;
   line=line||case when line='' then '' else ',' end||'"'||replace(cell,'"','""')||'"';
  end loop;result=result||line||E'\r\n';
 end loop;return chr(65279)||result;
end $$;
revoke all on function app_private.exchange_csv(jsonb,text[]) from public,anon,authenticated;
