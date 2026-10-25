import {test,expect} from '@playwright/test';

test('block edges become spaces in text and ranges, while older unspaced snapshots still verify and locate',async({page})=>{
  await page.goto('/');
  const proof=await page.evaluate(async()=>{
    const {messageText,sourceEvidence,locateText}=await import('/src/message-text.js');
    const {passageRange}=await import('/src/search-range.js');
    const element=document.createElement('div');
    element.innerHTML='<h2>Make the first step easy</h2><p>Try a short session.<br>Then rest.</p><ul><li>Protect your attention</li><li>Put the phone away</li></ul>';
    document.body.append(element);
    const text=messageText(element),legacy=messageText(element,undefined,{blocks:false});
    const range=passageRange(element,'easy Try a short',0)?.toString();
    const legacyRange=passageRange(element,'easyTry a short',0)?.toString();
    const brRange=passageRange(element,'session. Then rest',0)?.toString();
    const evidence=sourceEvidence(element,legacy);
    element.querySelector('p').append(' Edited.');
    const edited=sourceEvidence(element,legacy);
    return {text,legacy,range,legacyRange,brRange,evidence,edited,
      located:locateText(text,'attentionPut the'),exact:locateText(text,'attention Put')};
  });
  expect(proof.text).toBe('Make the first step easy Try a short session. Then rest. Protect your attention Put the phone away');
  expect(proof.legacy).toBe('Make the first step easyTry a short session.Then rest.Protect your attentionPut the phone away');
  expect(proof.range).toBe('easyTry a short');
  expect(proof.legacyRange).toBe('easyTry a short');
  expect(proof.brRange).toBe('session.Then rest');
  expect(proof.evidence).toEqual({unchanged:true,comparison:'legacy-block-spacing'});
  expect(proof.edited.unchanged).toBe(false);
  expect(proof.located).toEqual({start:proof.text.indexOf('attention Put the'),length:'attention Put the'.length});
  expect(proof.exact.start).toBe(proof.text.indexOf('attention Put'));
});
