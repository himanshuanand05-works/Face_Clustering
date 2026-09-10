const density = require('density-clustering');

class FaceClusterer {
  constructor(options = {}) {
    this.threshold = options.threshold ?? 0.6;
    this.minClusterSize = options.minClusterSize ?? 2;
  }

  clusterFaces(descriptors) {
    if (!descriptors || descriptors.length === 0) {
      return { clusters: [], noise: [] };
    }

    const dbscan = new density.DBSCAN();
    const clusters = dbscan.run(
      descriptors,
      this.threshold,
      this.minClusterSize,
      (a, b) => this.euclideanDistance(a, b)
    );

    const assigned = new Set(clusters.flat());
    const noise = descriptors
      .map((descriptor, index) => ({ index, descriptor }))
      .filter(({ index }) => !assigned.has(index));

    return {
      clusters: clusters.map((indices, id) => ({
        id,
        indices,
        descriptors: indices.map(index => descriptors[index])
      })),
      noise
    };
  }

  euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }
}

module.exports = FaceClusterer;