const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function installDiagnostics({readyMessage,allowedURL}){
  const runs=new Map(),pageURL=chrome.runtime.getURL('diagnostics.html');
  const trusted=sender=>sender.id===chrome.runtime.id&&sender.url?.split(/[?#]/)[0]===pageURL;
  const persist=()=>chrome.storage.session.set({diagnosticTabs:[...runs.values()].flatMap(run=>[...run.tabs])});
  const cleanup=async token=>{
    const run=runs.get(token);if(!run)return;
    run.cancelled=true;runs.delete(token);
    await Promise.all([...run.tabs].map(async id=>{
      try{await chrome.tabs.sendMessage(id,{type:'threadrail:archive-cancel'});}catch{}
      try{await chrome.tabs.remove(id);}catch{}
    }));await persist();
  };
  chrome.tabs.onRemoved.addListener(id=>{
    for(const [token,run]of runs)if(run.owner===id)cleanup(token).catch(()=>{});
  });
  // Recover only temporary tabs created by this runner in this browser session.
  const recovered=chrome.storage.session.get('diagnosticTabs').then(async({diagnosticTabs=[]})=>{
    await Promise.all(diagnosticTabs.map(id=>chrome.tabs.remove(id).catch(()=>{})));
    await chrome.storage.session.remove('diagnosticTabs');
  });
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!message.type?.startsWith('threadrail:diagnostic-'))return;
    const task=async()=>{
      if(!trusted(sender))throw Error('Open ThreadRail diagnostics to run tests.');
      await recovered;
      if(message.type==='threadrail:diagnostic-begin'){
        const tab=await chrome.tabs.get(message.owner);
        if(tab.url?.split(/[?#]/)[0]!==pageURL)throw Error('Open diagnostics in a tab.');
        const token=crypto.randomUUID();runs.set(token,{owner:tab.id,tabs:new Set(),cancelled:false});return {token};
      }
      const run=runs.get(message.token);
      if(!run)throw Error('This diagnostic run has ended.');
      if(message.type==='threadrail:diagnostic-finish'){await cleanup(message.token);return {ok:true};}
      if(message.type!=='threadrail:diagnostic-jump')throw Error('Unknown diagnostic action.');
      const target=message.target,expected=message.expectedPassage;
      const url=await allowedURL(target?.chatURL);
      if(!['prompt','answer'].includes(target?.role)||typeof target.sourceText!=='string'||target.sourceText.length>2000000||
        typeof target.matchText!=='string'||!target.matchText||target.matchText.length>20000||
        typeof expected!=='string'||expected.length<3||expected.length>1200)throw Error('Invalid passage test.');
      if(run.cancelled)throw Error('Stopped.');
      const tab=await chrome.tabs.create({url:'about:blank',active:true});run.tabs.add(tab.id);await persist();
      try{
        await chrome.tabs.update(tab.id,{url});
        const jumped=await readyMessage(tab.id,{type:'threadrail:archive-jump',target},15000,()=>run.cancelled);
        if(!jumped?.ok)throw Error(jumped?.error??'The saved passage could not be restored.');
        const verify=()=>readyMessage(tab.id,{type:'threadrail:archive-verify',target,expectedPassage:expected},15000,()=>run.cancelled);
        const first=await verify();await pause(400);const second=await verify();
        const stable=first.ok&&second.ok&&Math.abs(first.top-second.top)<3;
        return {ok:!!stable,reason:!second.ok?second.reason:!first.ok?first.reason:!stable?'Passage moved after landing':undefined,
          first,second};
      }finally{
        run.tabs.delete(tab.id);try{await chrome.tabs.remove(tab.id);}catch{}await persist();
        if(!run.cancelled)try{await chrome.tabs.update(run.owner,{active:true});}catch{}
      }
    };
    task().then(respond).catch(error=>respond({error:error.message}));return true;
  });
}
