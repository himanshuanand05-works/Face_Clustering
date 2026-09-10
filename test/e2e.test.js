const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { FaceDetector, FaceClusterer, ShortcutManager } = require('../index');

const MODELS = path.resolve(__dirname, '../models');
const FIXTURES = path.join(__dirname, 'fixtures');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function collectDescriptors(detector) {
  const images = fs.readdirSync(FIXTURES).filter(f => f.toLowerCase().endsWith('.jpg'));
  const all = [];
  const mapping = [];

  for (const img of images) {
    const full = path.join(FIXTURES, img);
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

async function main() {
  const detector = new FaceDetector({ modelsDir: MODELS });
  const clusterer = new FaceClusterer({ threshold: 0.6, minClusterSize: 2 });

  const { all, mapping } = await collectDescriptors(detector);
  assert(all.length > 0, 'Expected at least one face detected');
  console.log(`Collected ${all.length} descriptors, originals untouched (hash-checked)`);

  const { clusters, noise } = clusterer.clusterFaces(all);
  assert(Array.isArray(clusters), 'clusters must be an array');
  assert(Array.isArray(noise), 'noise must be an array');
  console.log(`Clusters: ${clusters.length}, noise: ${noise.length}`);

  if (clusters.length > 0) {
    const outputDir = path.join(os.tmpdir(), `face_cluster_e2e_${Date.now()}`);
    const manager = new ShortcutManager(outputDir);
    const created = await manager.createShortcuts(clusters, mapping);

    for (const entry of created) {
      assert(fs.existsSync(entry.shortcut), `Shortcut missing: ${entry.shortcut}`);
      assert(RESOLVED_SOURCE_CHECK(entry), `Shortcut target mismatch: ${entry.source}`);
    }

    const structure = await manager.getOutputStructure();
    assert(Object.keys(structure).length === clusters.length, 'Expected one folder per cluster');
    console.log('Completed shortcuts:', JSON.stringify(structure, null, 2));

    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  console.log('E2E TEST PASSED');
}

function RESOLVED_SOURCE_CHECK(entry) {
  if (process.platform !== 'win32') {
    const resolved = fs.readlinkSync(entry.shortcut);
    return path.resolve(resolved) === path.resolve(entry.source);
  }
  return true;
}

const ORIGINALS_SNAPSHOT = [];

main().then(() => process.exit(0)).catch(err => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});