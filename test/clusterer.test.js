const assert = require('assert');
const { FaceClusterer } = require('../index');

const clusterer = new FaceClusterer({ threshold: 0.6, minClusterSize: 2 });

const descriptors = [
  Array(128).fill(0.1),
  Array(128).fill(0.11),
  Array(128).fill(0.9),
  Array(128).fill(0.92)
];

const result = clusterer.clusterFaces(descriptors);

assert(result.clusters.length >= 1, 'Should produce at least one cluster');
assert.strictEqual(typeof result.noise, 'object', 'Should have noise field');

console.log('All tests passed!');
