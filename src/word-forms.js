// Conservative English word families for literal lookup, never substring or
// fuzzy matching. Leave other scripts, identifiers and short words unchanged.
// Words whose suffix is not an inflection; stripping it would merge them with
// unrelated words (evening/even, news/new, wedding/wed).
const KEEP = new Set(['evening','morning','during','nothing','something','anything','everything','ceiling','wedding','pudding','news','lens','series','species','does']);
export function wordFamily(word) {
  if (!/^[a-z]{4,}$/.test(word) || KEEP.has(word)) return word;
  let base = word;
  if (/ies$/.test(base) && base.length > 4) base = base.slice(0,-3)+'y';
  else if (/(?:ches|shes|xes|zes|sses)$/.test(base)) base = base.slice(0,-2);
  else if (/s$/.test(base) && !/(?:ss|us|is)$/.test(base)) base = base.slice(0,-1);
  if (KEEP.has(base)) return base;
  if (base.endsWith('ing')) {
    let root = base.slice(0,-3);
    if (root.length >= 3 && /[aeiouy]/.test(root)) {
      if (/([bdfgmnprt])\1$/.test(root)) root = root.slice(0,-1);
      base = root;
    }
  }
  return base;
}
