const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { FaceStore } = require('../index');

function descriptor(value) {
  return Array(128).fill(value);
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'face_store_test_'));
  const storePath = path.join(dir, 'face_store.json');

  const store = new FaceStore(storePath, { threshold: 0.6 });
  await store.load();
  assert.strictEqual(store.people.length, 0, 'Fresh store starts empty');

  const alice = store.createPerson([descriptor(0.1), descriptor(0.11)]);
  assert.strictEqual(store.people.length, 1);
  assert.strictEqual(alice.id, 0);

  const match = store.match(descriptor(0.1));
  assert(match, 'Similar descriptor must match Alice');
  assert.strictEqual(match.personId, alice.id);

  const noMatch = store.match(descriptor(0.9));
  assert.strictEqual(noMatch, null, 'Far descriptor must not match');

  const bob = store.createPerson([descriptor(0.9)]);
  assert.strictEqual(bob.id, 1);

  store.addDescriptor(bob.id, descriptor(0.92));
  assert.strictEqual(store.getPersonById(1).descriptors.length, 2);

  await store.save();

  const reloaded = new FaceStore(storePath, { threshold: 0.6 });
  await reloaded.load();
  assert.strictEqual(reloaded.people.length, 2, 'Reload restores people');
  assert.strictEqual(reloaded.nextId, 2, 'nextId restored');
  assert(reloaded.match(descriptor(0.11)).personId === 0, 'Match after reload');

  const scanned = { fake: 'hash' };
  store.markScanned('/tmp/a.jpg', 'abc');
  assert(store.wasScanned('/tmp/a.jpg', 'abc'));
  assert(!store.wasScanned('/tmp/a.jpg', 'zzz'));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('FaceStore tests passed!');
})().catch(err => {
  console.error('FaceStore test failed:', err);
  process.exit(1);
});