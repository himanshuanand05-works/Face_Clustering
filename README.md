# Face Clustering

A Node.js library that uses **FaceNet** to detect all faces in images and cluster them into named folders. The original images are **never modified** — only shortcuts (`.lnk` on Windows, symlinks elsewhere) to the original files are created and organized into per-person folders.

## Key Features

- **Face detection** using FaceNet (SSD MobileNet + 68-point landmarks + recognition model), running on the TensorFlow.js **WASM backend** (no native C++/Python build toolchain required)
- **Face embedding** generation (128-dimension descriptors)
- **Clustering** of similar faces using Density-Based Spatial Clustering (DBSCAN)
- **Persistent person identity** — learned faces are saved to a store file, so re-running on new photo folders reuses the same `person_<id>` folders instead of re-creating them
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
  [FaceStore] ── first run: DBSCAN learns people (clusters)
        │        later runs: matches new faces to learned people
        ▼
  [ShortcutManager] ── creates shortcuts in named folders
        │
        ▼
Named folders (shortcuts only, originals untouched)
```

For each learned person, a folder `person_<id>` is created in the output directory. Inside it, shortcuts point to the original image files containing that person's faces. If a photo contains multiple people, the same image appears as a shortcut in multiple folders.

### Why no duplicate folders?

On the **first run** the app has no prior knowledge, so it batch-clusters all detected faces with DBSCAN and writes every person's 128-d signatures to `faceStoreFile` (default `output/face_store.json`, along with a hash of the images already scanned).

On **later runs** (including runs against entirely different folders), each new face is compared to the stored signatures. If it matches within `threshold`, the image shortcut is added to that existing `person_<id>` folder; only genuinely new faces get a new folder. Already-scanned images (same file + hash) are skipped entirely, so re-running is fast.

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
│   ├── faceStore.js         # Persistent person identity (store file)
│   └── shortcutManager.js   # Creates shortcuts (.lnk on Windows)
├── models/                  # FaceNet model weights (checked in)
├── test/
│   ├── fixtures/            # Sample images with faces
│   ├── clusterer.test.js    # Unit tests
│   ├── faceStore.test.js    # FaceStore persistence unit tests
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
const { FaceDetector, FaceClusterer, ShortcutManager, FaceStore } = require('face_clustering');

const detector = new FaceDetector({ modelsDir: 'models' });
const descriptors = await detector.getFaceDescriptors('./input/photo.jpg');

const clusterer = new FaceClusterer({ threshold: 0.6, minClusterSize: 2 });
const { clusters, noise } = clusterer.clusterFaces(descriptors);

const manager = new ShortcutManager('./output');
const shortcuts = await manager.createShortcuts(clusters, imageFiles);

// Persist/reuse person identity across runs:
const store = new FaceStore('./output/face_store.json', { threshold: 0.6 });
await store.load();
const match = store.match(descriptors[0]); // { personId, distance } or null
if (!match) store.createPerson([descriptors[0]]);
await store.save();
```

### CLI

```bash
# Configure paths in config/default.json (paths are relative to config file), then:
npm start
# or point at another config:
node src/cli.js config/e2e.json
```

## Configuration (`config/default.json`)

| Key | What it does | Default |
|-----|--------------|---------|
| `inputDir` | Folder you drop photos into; the app reads every supported image from here. | `./input` |
| `outputDir` | Where the named person folders (`person_0`, ...) with `.lnk` shortcuts get created. | `./output` |
| `modelsDir` | Folder holding the FaceNet weight files the app loads to do detection. | `./models` |
| `faceStoreFile` | Where learned person identities are saved (and loaded from next run). Point it at the same file across runs/folders to keep identities. | `./output/face_store.json` |
| `clustering.threshold` | How close two faces' 128-d signatures must be to count as the same person (lower = stricter). | `0.6` |
| `clustering.minClusterSize` | Minimum number of matched faces needed before a person folder is created (lower = more tiny folders, higher = fewer, only well-summed people). | `2` |
| `supportedFormats` | Which image extensions the scanner accepts (e.g. `.jpg`, `.png`); anything else is ignored. | `.jpg .jpeg .png .bmp .gif` |
| `shortcutType` | Reserved switch for how output links are created (`.lnk` on Windows, symlink elsewhere) — currently auto-detected, not yet user-selectable. | `link` |

All paths are resolved relative to the config file's location, so you can run the app against any folder of photos by editing `inputDir`/`outputDir`.

`threshold` is the euclidean distance between two 128-d descriptors: the smaller the value, the more strictly faces must match. Typical same-person distances are ~0.45–0.60; values ≥ 0.8 start to mix different people.

## Tests

```bash
npm test          # Unit tests (fast)
npm run test:smoke  # Model loading + single-image detection
npm run test:e2e  # Full pipeline: learn -> persist -> reload & match (a few minutes on CPU)
```

## License

MIT