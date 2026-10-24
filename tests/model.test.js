import test from 'node:test';
import assert from 'node:assert/strict';
import { activeExchange, isReadingCurrent, nearbyExchanges } from '../src/model.js';

const exchanges = Array.from({ length: 8 }, (_, index) => ({ id: `e${index}`, top: index * 600, completed: index !== 7 }));

test('exchange boundaries distinguish a long current answer from history', () => {
  assert.equal(activeExchange(exchanges, -10), -1);
  assert.equal(activeExchange(exchanges, 1200), 2);
  assert.equal(activeExchange(exchanges, 1199), 1);
  assert.equal(isReadingCurrent(exchanges, 4199), false);
  assert.equal(isReadingCurrent(exchanges, 4200), true);
  assert.equal(isReadingCurrent(exchanges, 20000), true);
});

test('long histories expose only ten consecutive exchanges around the reading position', () => {
  const many = Array.from({ length: 1000 }, (_, index) => ({ id: `${index}`, top: index * 50, completed: true }));
  assert.deepEqual(nearbyExchanges(many, '500').map(e => e.ordinal), [497,498,499,500,501,502,503,504,505,506]);
  assert.deepEqual(nearbyExchanges(many, '0').map(e => e.ordinal), [1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(nearbyExchanges(many, '999').map(e => e.ordinal), [991,992,993,994,995,996,997,998,999,1000]);
});

test('nearby window excludes incomplete exchanges and preserves original ordinals', () => {
  const mixed = exchanges.map((e,i) => ({...e, completed: i % 2 === 0}));
  assert.deepEqual(nearbyExchanges(mixed, 'e3').map(e => e.ordinal), [1,3,5,7]);
  assert.deepEqual(nearbyExchanges(exchanges, 'e7').map(e => e.id), exchanges.slice(0,7).map(e => e.id));
});

test('empty or incomplete history has no selectable targets', () => {
  assert.deepEqual(nearbyExchanges([], null), []);
  assert.deepEqual(nearbyExchanges([{id:'a',top:0,completed:false}], 'a'), []);
});
