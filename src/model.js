export const State = Object.freeze({
  SEARCH: 'SEARCH', IDLE: 'IDLE', NAVIGATING: 'NAVIGATING', PREVIEW: 'PREVIEW',
  JUMPING: 'JUMPING', READING_CURRENT: 'READING_CURRENT',
});

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Positions are in the scroll container's coordinate space, not page coordinates.
export function activeExchange(exchanges, readingLine) {
  let low = 0;
  let high = exchanges.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (exchanges[mid].top <= readingLine) {
      result = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return result;
}

export function isReadingCurrent(exchanges, readingLine) {
  return !exchanges.length || readingLine >= exchanges.at(-1).top;
}

// A bounded, contiguous window around the reading position. No coordinate can
// silently select an exchange outside the ten buttons actually on screen.
export function nearbyExchanges(exchanges, activeId, limit = 10) {
  const completed = exchanges.flatMap((exchange, index) => exchange.completed ? [{ ...exchange, ordinal: index + 1 }] : []);
  if (!completed.length) return [];
  const active = exchanges.find(exchange => exchange.id === activeId);
  let anchor = completed.findIndex(exchange => exchange.id === activeId);
  if (anchor < 0) anchor = Math.max(0, activeExchange(completed, active?.top ?? -Infinity));
  const size = Math.min(limit, completed.length);
  const start = clamp(anchor - Math.floor((size - 1) / 2), 0, completed.length - size);
  return completed.slice(start, start + size);
}
