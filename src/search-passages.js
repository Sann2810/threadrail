// Smaller, verbatim retrieval units keep independent events from averaging into
// one embedding. Offsets always refer to the original message, never rewritten
// text. Whole-message chunks remain in the index for context and code coverage.
export function semanticPassages(text) {
  const candidates = [], seen = new Set();
  const words = value => value.match(/[\p{L}\p{N}_]+/gu)?.length ?? 0;
  const add = (start, end) => {
    const raw = text.slice(start, end), value = raw.trim();
    if (!value || words(value) < 4 || seen.has(value)) return;
    seen.add(value);
    candidates.push({text:value, offset:start + raw.indexOf(value)});
  };
  const split = (start, end, depth = 0) => {
    const value = text.slice(start, end);
    add(start, end);
    if (depth >= 3) return;
    // Require substantive text on both sides; retain the unsplit sentence for
    // dependent clauses and queries about the relation between the events.
    for (const match of value.matchAll(/\s+(?:while|whereas|but|and then|and|then)\s+|[;:]\s+/giu)) {
      const left = value.slice(0, match.index), right = value.slice(match.index + match[0].length);
      if (words(left) >= 4 && words(right) >= 4) {
        split(start, start + match.index, depth + 1);
        split(start + match.index + match[0].length, end, depth + 1);
        break;
      }
    }
  };
  const sentences = new Intl.Segmenter(undefined, {granularity:'sentence'}).segment(text);
  for (const sentence of sentences) {
    // DOM list items can meet without whitespace in textContent.
    let start = sentence.index;
    for (const match of sentence.segment.matchAll(/(?<=[.!?])(?=\p{Lu}\p{Ll})|\n+/gu)) {
      split(start, sentence.index + match.index);
      start = sentence.index + match.index + match[0].length;
    }
    split(start, sentence.index + sentence.segment.length);
  }
  return candidates.filter(p => p.offset !== 0 || p.text !== text);
}
