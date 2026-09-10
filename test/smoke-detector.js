const path = require('path');
const { FaceDetector } = require('../index');

async function main() {
  const detector = new FaceDetector({ modelsDir: path.resolve(__dirname, '../models') });
  const imagePath = path.join(__dirname, 'fixtures', 'sample5.jpg');

  const detections = await detector.detectFaces(imagePath);
  console.log('Detected faces:', detections.length);
  detections.forEach((d, i) => {
    console.log(`  face ${i}: score=${d.detection.score.toFixed(3)} descriptor(${d.descriptor.length}) dims`);
  });
}

main().then(() => process.exit(0)).catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});