// Conservative English word families for literal lookup, never substring or
// fuzzy matching. Leave other scripts, identifiers and short words unchanged.
export function wordFamily(word) {
  if (!/^[a-z]{4,}$/.test(word)) return word;
  let base = word;
  if (/ies$/.test(base) && base.length > 4) base = base.slice(0,-3)+'y';
  else if (/(?:ches|shes|xes|zes|sses)$/.test(base)) base = base.slice(0,-2);
  else if (/s$/.test(base) && !/(?:ss|us|is)$/.test(base)) base = base.slice(0,-1);
  if (base.endsWith('ing')) {
    let root = base.slice(0,-3);
    if (root.length >= 3 && /[aeiouy]/.test(root)) {
      if (/([bdfgmnprt])\1$/.test(root)) root = root.slice(0,-1);
      base = root;
    }
  }
  return base;
}
