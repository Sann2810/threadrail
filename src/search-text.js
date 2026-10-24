// Normalize a small set of common English spelling variants only for embedding
// queries. The visible query and exact-word matching retain the user's spelling.
const SPELLINGS = new Map(Object.entries({
  recognise:'recognize',recognises:'recognizes',recognised:'recognized',recognising:'recognizing',recognisable:'recognizable',
  organise:'organize',organises:'organizes',organised:'organized',organising:'organizing',organisation:'organization',organisations:'organizations',
  colour:'color',colours:'colors',coloured:'colored',colourful:'colorful',
  behaviour:'behavior',behaviours:'behaviors',behavioural:'behavioral',
  optimise:'optimize',optimised:'optimized',optimising:'optimizing',optimisation:'optimization',
  normalise:'normalize',normalised:'normalized',normalising:'normalizing',normalisation:'normalization',
  centre:'center',centres:'centers',catalogue:'catalog',catalogues:'catalogs',
}));
export function semanticQuery(query) {
  return query.normalize('NFKC').replace(/\b[\p{L}]+\b/gu,word=>{
    const replacement=SPELLINGS.get(word.toLowerCase());
    if(!replacement)return word;
    return word===word.toUpperCase()?replacement.toUpperCase():word[0]===word[0].toUpperCase()?replacement[0].toUpperCase()+replacement.slice(1):replacement;
  });
}
// A host render failure isn't an assistant answer. Also filters snapshots saved
// before the real ChatGPT failure marker was recognized.
export const isUnavailableResponse = text => /^this response couldn['’]t load[.!]?$/i.test(text.replace(/\s+/g,' ').trim());
