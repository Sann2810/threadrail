// Technical equivalences for meaning vectors only. These labels never become
// displayed excerpts or literal word matches.
export function codingSemanticContext(text) {
  if(/\bnode\.js\b/i.test(text)||
    (/\b(?:node|deno|bun)\b/i.test(text)&&/\b(?:toolchain|runtime|npm|npx|javascript|typescript)\b/i.test(text)))return 'JavaScript runtime';
  return '';
}
import { semanticQuery } from '../src/search-text.js';
import { terms } from '../src/search-index.js';

export function nativeMeaningQueries(query) {
  const full=semanticQuery(query),clause=/\s+(?:before|after|while|during)\s+/i.exec(query);
  if(!clause)return [full];
  const focus=query.slice(0,clause.index).trim(),background=query.slice(clause.index+clause[0].length);
  // Keep questions about temporal order intact. Otherwise a substantive event
  // before a background clause is the primary retrieval intent.
  if(terms(focus).length<3||terms(background).length<2||/^(?:what|which|who)\s+(?:happened|came|was|were)\b/i.test(focus))return [full];
  return [full,semanticQuery(focus)];
}

export function nativeQueryVector(vectors) {
  if(vectors.length===1)return vectors[0];
  const result=vectors[0].map((value,i)=>.25*value+.75*vectors[1][i]);
  const norm=Math.hypot(...result)||1;
  return result.map(value=>value/norm);
}
