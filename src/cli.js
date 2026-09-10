#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;
const { FaceDetector, FaceClusterer, ShortcutManager } = require('../index');

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

  async process() {
    await this.loadConfig();
    console.log('Starting face clustering...');

    const detector = new FaceDetector({ modelsDir: this.resolve(this.config.modelsDir) });
    const clusterer = new FaceClusterer(this.config.clustering);
    const shortcutManager = new ShortcutManager(this.resolve(this.config.outputDir));

    const imageFiles = await this.getImageFiles();
    console.log(`Found ${imageFiles.length} images`);

    const allDescriptors = [];
    const fileMapping = [];

    for (const { fullPath } of imageFiles) {
      const descriptors = await detector.getFaceDescriptors(fullPath);
      descriptors.forEach(desc => {
        allDescriptors.push(desc);
        fileMapping.push(fullPath);
      });
      console.log(`  ${path.basename(fullPath)}: ${descriptors.length} face(s)`);
    }

    console.log(`Detected ${allDescriptors.length} faces total`);

    const { clusters, noise } = clusterer.clusterFaces(allDescriptors);
    console.log(`Created ${clusters.length} cluster(s) (${noise.length} unassigned face(s))`);

    const shortcuts = await shortcutManager.createShortcuts(clusters, fileMapping);
    console.log(`Created ${shortcuts.length} shortcut(s)`);

    const structure = await shortcutManager.getOutputStructure();
    console.log('Output structure:', JSON.stringify(structure, null, 2));

    return { structure, clusters, noise, shortcuts };
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