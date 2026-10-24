const normalize=text=>text.replace(/\s+/g,' ').trim();
export function searchSources(rows){
  let input='',exchange='';
  return rows.flatMap(row=>{
    const text=normalize(row.text);if(!text)return [];
    if(row.role==='prompt'){input=text;exchange=row.id;}
    const source={id:row.id,messageId:row.id,exchangeId:exchange||row.id,role:row.role,text,sourceText:text,inputText:input,context:input};
    const blocks=[];let cursor=0;
    if(row.role==='answer'&&text.split(/\s+/).length>140)for(const [i,raw]of row.text.split(/\n\s*\n/).entries()){
      const block=normalize(raw);if(!block)continue;
      const offset=text.indexOf(block,cursor);if(offset<0)continue;cursor=offset+block.length;
      blocks.push({...source,id:row.id+':block:'+i,text:block,isPassage:true,sourceOffset:offset});
    }
    return [source,...blocks];
  });
}
export function exchangesOf(rows){
  const exchanges=[];for(const row of rows){
    if(row.role==='prompt')exchanges.push({id:row.id,text:row.text,completed:false});
    else if(exchanges.length&&row.complete)exchanges.at(-1).completed=true;
  }
  return exchanges;
}
export function nearby(rows,activeId){
  const exchanges=exchangesOf(rows).filter(e=>e.completed);
  const active=Math.max(0,exchanges.findIndex(e=>e.id===activeId));
  const start=Math.max(0,Math.min(exchanges.length-10,active-4));
  return exchanges.slice(start,start+10);
}
