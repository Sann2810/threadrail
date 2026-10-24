export async function expandWord(page, word, {library=false}={}) {
  const button=page.locator(library?'#words':'.search-words').getByRole('button',{name:word,exact:true});
  if(await button.getAttribute('aria-expanded')!=='true')await button.click();
  return page.getByRole('region',{name:`${word} matches`,exact:true});
}
