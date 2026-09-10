const path = require('path');
const tfwasm = require('@tensorflow/tfjs-backend-wasm');
const sharp = require('sharp');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');

class FaceDetector {
  constructor(options = {}) {
    this.modelsDir = options.modelsDir || path.resolve(__dirname, '../models');
    this.minConfidence = options.minConfidence || 0.2;
    this.maxResults = options.maxResults || 50;
    this.modelLoaded = false;
  }

  async loadModels() {
    if (this.modelLoaded) return;

    const wasmPath = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm'));
    tfwasm.setWasmPaths(path.join(wasmPath, '/'));

    await faceapi.tf.setBackend('wasm');
    await faceapi.tf.ready();

    await faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelsDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsDir);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsDir);

    this.modelLoaded = true;
  }

  async decodeImage(imagePath) {
    const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgb = new Uint8Array(info.width * info.height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4) {
      rgb[j++] = data[i];
      rgb[j++] = data[i + 1];
      rgb[j++] = data[i + 2];
    }
    return faceapi.tf.tensor3d(Array.from(rgb), [info.height, info.width, 3], 'int32');
  }

  async detectFaces(imagePath) {
    await this.loadModels();

    const tensor = await this.decodeImage(imagePath);
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: this.minConfidence, maxResults: this.maxResults });

    try {
      const detections = await faceapi
        .detectAllFaces(tensor, options)
        .withFaceLandmarks()
        .withFaceDescriptors();
      return detections;
    } finally {
      tensor.dispose();
    }
  }

  async getFaceDescriptors(imagePath) {
    const detections = await this.detectFaces(imagePath);
    return detections.map(d => d.descriptor);
  }
}

module.exports = FaceDetector;