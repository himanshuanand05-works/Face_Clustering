const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { FaceDetector, FaceClusterer, ShortcutManager, FaceStore } = require('../index');

const MODELS = path.resolve(__dirname, '../models');
const FIXTURES = path.join(__dirname, 'fixtures');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function collectDescriptors(detector, dir) {
  const images = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.jpg'));
  const all = [];
  const mapping = [];

  for (const img of images) {
    const full = path.join(dir, img);
    const before = hashFile(full);
    const descriptors = await detector.getFaceDescriptors(full);
    const after = hashFile(full);
    assert.strictEqual(before, after, `Original image modified: ${img}`);
    descriptors.forEach(desc => {
      all.push(desc);
      mapping.push(full);
    });
  }

  return { all, mapping };
}

async function seed(store, clusterer, descriptors, mapping) {
  const { clusters, noise } = clusterer.clusterFaces(descriptors);
  const groups = [];
  for (const cluster of clusters) {
    const person = store.createPerson(cluster.descriptors);
    groups.push({ personId: person.id, indices: cluster.indices });
  }
  for (const item of noise) {
    const person = store.createPerson([item.descriptor]);
    groups.push({ personId: person.id, indices: [item.index] });
  }
  return groups;
}

async function processTest() {
  const detector = new FaceDetector({ modelsDir: MODELS });
  const clusterer = new FaceClusterer({ threshold: 0.6, minClusterSize: 2 });

  const workDir = path.resolve(__dirname, '../output/e2e');
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const storePath = path.join(workDir, 'face_store.json');
  const store = new FaceStore(storePath, { threshold: 0.6 });
  await store.load();

  const { all, mapping } = await collectDescriptors(detector, FIXTURES);
  const groups = await seed(store, clusterer, all, mapping);
  await store.save();

  assert(store.people.length === groups.length, 'Store must hold one person per learned group');
  console.log(`Run 1: ${groups.length} person(s) learned and persisted to ${storePath}`);

  const manager = new ShortcutManager(workDir);
  const clustersForOutput = groups.map(g => ({ id: g.personId, indices: g.indices }));
  const created = await manager.createShortcuts(clustersForOutput, mapping);
  for (const entry of created) {
    assert(fs.existsSync(entry.shortcut), `Shortcut missing: ${entry.shortcut}`);
  }
  console.log(`Run 1: created ${created.length} shortcut(s)`);

  const knownCount = store.people.length;
  const knownIds = store.people.map(p => p.id);

  const reloaded = new FaceStore(storePath, { threshold: 0.6 });
  await reloaded.load();
  assert.strictEqual(reloaded.people.length, knownCount, 'Store reload must restore people');

  for (const desc of all.slice(0, 5)) {
    const match = reloaded.match(desc);
    assert(match, 'Known descriptor must match a stored person');
    assert(knownIds.includes(match.personId), 'Match must return a valid person id');
  }
  console.log('Run 2: re-loaded store, faces from run 1 match existing people (incremental reuse works)');
  console.log(`Test output left in place at: ${workDir}`);
  console.log('E2E TEST PASSED');
}

processTest().then(() => process.exit(0)).catch(err => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});