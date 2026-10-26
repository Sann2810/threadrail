import {waitForStable} from './scroll-landing.js';
// A newly opened host can render readable rows before its own initial scroll,
// fonts and virtual window finish initializing. Do not compete with that scroll.
// Each read syncs every drawn message, so it polls sparingly.
export async function waitForHost({read,active=()=>true,now,pause,timeout=12000,minimum=1000,quiet=650,interval=250}){
  const result=await waitForStable({read,active,now,pause,timeout,minimum,quiet,interval});
  return result.ok?result:{ok:false,reason:active()?'Chat initialization did not settle':'Restoration cancelled before chat initialization settled',elapsedMs:result.elapsedMs};
}
