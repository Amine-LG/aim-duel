const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPresenceId, normalizeNickname, normalizeRoomCode } = require('../src/validation');

test('isValidPresenceId accepts uuid-like ids and rejects junk', () => {
  assert.equal(isValidPresenceId('3f2c8a1e-aaaa-bbbb-cccc-1234567890ab'), true);
  assert.equal(isValidPresenceId('presence-1700000000-abc123'), true);
  assert.equal(isValidPresenceId('short'), false);
  assert.equal(isValidPresenceId('has spaces here'), false);
  assert.equal(isValidPresenceId('x'.repeat(129)), false);
  assert.equal(isValidPresenceId(null), false);
  assert.equal(isValidPresenceId(42), false);
});

test('normalizeNickname trims, collapses whitespace, bounds length, rejects control chars', () => {
  assert.equal(normalizeNickname('  Alice   B  '), 'Alice B');
  assert.equal(normalizeNickname('x'.repeat(21)), null);
  // Tabs/newlines are whitespace and collapse into a single space.
  assert.equal(normalizeNickname('two\twords'), 'two words');
  // Non-whitespace control characters are rejected outright.
  assert.equal(normalizeNickname('badname'), null);
  assert.equal(normalizeNickname(''), null);
  assert.equal(normalizeNickname(undefined), null);
});

test('normalizeRoomCode uppercases, trims, and enforces the 6-char safe alphabet', () => {
  assert.equal(normalizeRoomCode(' abq234 '), 'ABQ234');
  assert.equal(normalizeRoomCode('ABQ23'), null); // too short
  assert.equal(normalizeRoomCode('ABI234'), null); // I not in alphabet
  assert.equal(normalizeRoomCode('AB0234'), null); // 0 not in alphabet
  assert.equal(normalizeRoomCode(123456), null);
});
