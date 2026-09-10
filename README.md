# Face Clustering

A Node.js library that uses **FaceNet** to detect all faces in images and cluster them into named folders. The original images are **never modified** — only shortcuts (`.lnk` on Windows, symlinks elsewhere) to the original files are created and organized into per-person folders.

## Key Features

- **Face detection** using FaceNet (SSD MobileNet + 68-point landmarks + recognition model), running on the TensorFlow.js **WASM backend** (no native C++/Python build toolchain required)
- **Face embedding** generation (128-dimension descriptors)
- **Clustering** of similar faces using Density-Based Spatial Clustering (DBSCAN)
- **Zero-touch originals** — input images are read-only; output is shortcuts only
- **Windows shortcut support** — creates real `.lnk` files (no admin privileges needed); uses symlinks on Linux/macOS
- **Configurable** thresholds, cluster sizes, and paths via JSON config

## How It Works

```
Input Images (read-only)
        │
        ▼
  [FaceDetector] ── detects faces + 128-d descriptors
        │
        ▼
  [FaceClusterer] ── groups similar faces (DBSCAN)
        │
        ▼
  [ShortcutManager] ── creates shortcuts in named folders
        │
        ▼
Named folders (shortcuts only, originals untouched)
```

For each detected cluster of faces, a folder `person_<id>` is created in the output directory. Inside it, shortcuts point to the original image files containing that person's faces. If a photo contains multiple people, the same image appears as a shortcut in multiple folders.

## Project Structure

```
Face_Clustering/
├── index.js                 # Library entry point / exports
├── package.json
├── config/
│   ├── default.json         # Default configuration
│   └── e2e.json             # Example config used by the E2E test
├── src/
│   └── cli.js               # CLI entry point
├── lib/
│   ├── faceDetector.js      # FaceNet face detection + embeddings
│   ├── faceClusterer.js     # DBSCAN clustering of descriptors
│   └── shortcutManager.js   # Creates shortcuts (.lnk on Windows)
├── models/                  # FaceNet model weights (checked in)
├── test/
│   ├── fixtures/            # Sample images with faces
│   ├── clusterer.test.js    # Unit tests
│   ├── smoke-detector.js    # Quick model+detection sanity check
│   └── e2e.test.js          # Full pipeline test
└── instructions.md          # Guidance for coding agents
```

## Requirements

- Node.js >= 18
- No native build toolchain required (TensorFlow.js WASM backend + sharp prebuilt binaries)

## Installation

```bash
cd Face_Clustering
npm install
```

When cloning fresh, the FaceNet weights are checked into `models/`. If they are missing, download them from the [face-api model folder](https://raw.githubusercontent.com/vladmandic/face-api/master/model/):

- `ssd_mobilenetv1_model-weights_manifest.json` + `ssd_mobilenetv1_model.bin`
- `face_landmark_68_model-weights_manifest.json` + `face_landmark_68_model.bin`
- `face_recognition_model-weights_manifest.json` + `face_recognition_model.bin`

## Usage

### Library API

```js
const { FaceDetector, FaceClusterer, ShortcutManager } = require('face_clustering');

const detector = new FaceDetector({ modelsDir: 'models' });
const descriptors = await detector.getFaceDescriptors('./input/photo.jpg');

const clusterer = new FaceClusterer({ threshold: 0.6, minClusterSize: 2 });
const { clusters, noise } = clusterer.clusterFaces(descriptors);

const manager = new ShortcutManager('./output');
const shortcuts = await manager.createShortcuts(clusters, imageFiles);
```

### CLI

```bash
# Configure paths in config/default.json (paths are relative to config file), then:
npm start
# or point at another config:
node src/cli.js config/e2e.json
```

## Configuration (`config/default.json`)

| Key | Description | Default |
|-----|-------------|---------|
| `inputDir` | Directory of input images (relative to config file) | `./input` |
| `outputDir` | Directory for clustered shortcut folders | `./output` |
| `modelsDir` | Location of FaceNet model files | `./models` |
| `clustering.threshold` | FaceNet euclidean descriptor distance for "same person" | `0.6` |
| `clustering.minClusterSize` | Minimum faces per cluster | `2` |
| `supportedFormats` | Accepted image extensions | `.jpg .jpeg .png .bmp .gif` |

`threshold` is the euclidean distance between two 128-d descriptors: the smaller the value, the more strictly faces must match. Typical same-person distances are ~0.45–0.60; values ≥ 0.8 start to mix different people.

## Tests

```bash
npm test          # Unit tests (fast)
npm run test:smoke  # Model loading + single-image detection
npm run test:e2e  # Full pipeline: detect -> cluster -> shortcuts (a few minutes on CPU)
```

## License

MIT