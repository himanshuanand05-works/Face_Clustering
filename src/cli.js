#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { FaceDetector, FaceClusterer, ShortcutManager, FaceStore } = require('../index');

class FaceClusteringCLI {
  constructor(configPath) {
    this.configPath = configPath || path.resolve(__dirname, '../config/default.json');
  }

  async loadConfig() {
    const configData = await fs.readFile(this.configPath, 'utf8');
    this.config = JSON.parse(configData);
  }

  resolve(basePath) {
    return path.resolve(path.dirname(this.configPath), basePath);
  }

  async getImageFiles() {
    const inputDir = this.resolve(this.config.inputDir);
    const entries = await fs.readdir(inputDir);
    return entries
      .filter(file => this.config.supportedFormats.includes(path.extname(file).toLowerCase()))
      .map(file => ({ file, fullPath: path.join(inputDir, file) }));
  }

  async hashFile(filePath) {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async process() {
    await this.loadConfig();

    const store = new FaceStore(
      this.resolve(this.config.faceStoreFile || './output/face_store.json'),
      { threshold: this.config.clustering.threshold }
    );
    await store.load();

    const detector = new FaceDetector({ modelsDir: this.resolve(this.config.modelsDir) });
    const clusterer = new FaceClusterer(this.config.clustering);
    const shortcutManager = new ShortcutManager(this.resolve(this.config.outputDir));

    const imageFiles = await this.getImageFiles();
    console.log(`Found ${imageFiles.length} image(s) in input`);

    const freshDescriptors = [];
    const fileMapping = [];
    let skipped = 0;
    let noFaceImages = 0;

    for (const { fullPath } of imageFiles) {
      const hash = await this.hashFile(fullPath);
      if (store.wasScanned(fullPath, hash)) {
        skipped += 1;
        console.log(`  ${path.basename(fullPath)}: already scanned, skipping`);
        continue;
      }

      const descriptors = await detector.getFaceDescriptors(fullPath);
      if (descriptors.length === 0) noFaceImages += 1;
      descriptors.forEach(desc => {
        freshDescriptors.push(desc);
        fileMapping.push(fullPath);
      });
      store.markScanned(fullPath, hash);
      console.log(`  ${path.basename(fullPath)}: ${descriptors.length} face(s)`);
    }

    if (skipped > 0) console.log(`Skipped ${skipped} already-scanned image(s)`);
    if (noFaceImages > 0) console.log(`Contained no faces: ${noFaceImages} image(s) (skipped, marked scanned)`);
    console.log(`Loaded ${freshDescriptors.length} new face descriptor(s)`);

    const groups = [];
    let matchedFaceCount = 0;
    let newPersonCount = 0;

    if (freshDescriptors.length === 0) {
      console.log('Nothing new to process.');
    } else if (store.people.length === 0) {
      const { clusters, noise } = clusterer.clusterFaces(freshDescriptors);

      for (const cluster of clusters) {
        const person = store.createPerson(cluster.descriptors);
        groups.push({ personId: person.id, indices: cluster.indices });
        newPersonCount += 1;
        console.log(`  Learned new person ${person.id} (${cluster.indices.length} face(s))`);
      }
      for (const item of noise) {
        const person = store.createPerson([item.descriptor]);
        groups.push({ personId: person.id, indices: [item.index] });
        newPersonCount += 1;
        console.log(`  Learned new person ${person.id} (1 face)`);
      }
    } else {
      freshDescriptors.forEach((desc, index) => {
        const matched = store.match(desc);
        if (matched) {
          store.addDescriptor(matched.personId, desc);
          groups.push({ personId: matched.personId, indices: [index] });
          matchedFaceCount += 1;
          console.log(`  Matched face to person ${matched.personId} (distance ${matched.distance.toFixed(3)})`);
        } else {
          const person = store.createPerson([desc]);
          groups.push({ personId: person.id, indices: [index] });
          newPersonCount += 1;
          console.log(`  Learned new person ${person.id} (1 face)`);
        }
      });
    }

    const clustersForOutput = groups.map(group => ({
      id: group.personId,
      indices: group.indices
    }));

    const shortcuts = await shortcutManager.createShortcuts(clustersForOutput, fileMapping);
    const uniquePersonFolders = new Set(groups.map(g => g.personId)).size;
    console.log('');
    console.log('--- Run summary ---');
    console.log(`Images scanned new:     ${imageFiles.length - skipped}`);
    console.log(`Faces matched to known: ${matchedFaceCount}`);
    console.log(`New persons created:    ${newPersonCount}`);
    console.log(`Shortcuts created:      ${shortcuts.length}`);
    console.log(`Person folders updated: ${uniquePersonFolders}`);
    console.log(`Known persons in store: ${store.people.length}`);

    await store.save();
    console.log(`Saved face data to ${store.storePath} (${store.people.length} person(s) total)`);

    const structure = await shortcutManager.getOutputStructure();
    console.log('Output structure:', JSON.stringify(structure, null, 2));

    return { structure, groups, shortcuts, people: store.people.length };
  }
}

if (require.main === module) {
  const configPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const cli = new FaceClusteringCLI(configPath);
  cli.process().catch(err => {
    console.error('Failed:', err);
    process.exit(1);
  });
}

module.exports = FaceClusteringCLI;