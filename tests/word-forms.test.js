import test from 'node:test';
import assert from 'node:assert/strict';
import {wordFamily} from '../src/word-forms.js';

test('word families group inflections without merging unrelated words',()=>{
  for(const [a,b] of [['singing','sing'],['running','run'],['stories','story'],['boxes','box'],['evenings','evening']])
    assert.equal(wordFamily(a),wordFamily(b),`${a} and ${b}`);
  for(const [a,b] of [['evening','even'],['news','new'],['wedding','wed'],['during','dur'],['does','doe']])
    assert.notEqual(wordFamily(a),wordFamily(b),`${a} and ${b}`);
});
