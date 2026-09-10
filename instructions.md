# Developer Instructions

This file provides guidance for a coding agent (and future developers) working on the **Face Clustering** library. Read this before making any changes.

## Overview & Non-Negotiables

1. **Never modify original images.** The core rule of this project: input images are strictly read-only. Output must only ever contain **shortcuts** pointing back to the originals — never copies, moves, crops, or edits of source files.
2. **Shortcuts only.** Grouped results are organized as shortcuts to original image files in per-person named folders. Do not duplicate image content.
3. **FaceNet-based.** Face detection and 128-d embedding generation must use FaceNet, implemented via `@vladmandic/face-api` (the maintained fork of `face-api.js`) over TensorFlow.js.

## Architecture

The library is decomposed into four focused modules under `lib/`:

- `lib/faceDetector.js` — **FaceDetector**: loads FaceNet models, detects faces, returns face descriptors (128-d `Float32Array`s).
- `lib/faceClusterer.js` — **FaceClusterer**: takes an array of descriptors, runs DBSCAN, returns `{ clusters, noise }`.
- `lib/faceStore.js` — **FaceStore**: persistent person identity. Saves every learned person's 128-d descriptors plus a hash of already-scanned images to a JSON file, and matches new descriptors to existing people.
- `lib/shortcutManager.js` — **ShortcutManager**: given clusters and the original image file list, creates named output folders (`person_<id>`) containing shortcuts to the original files.

Entry points:

- `index.js` — exports the four public classes.
- `src/cli.js` — CLI wrapper (`npm start`, or `node src/cli.js <config>`), `FaceClusteringCLI` class. Config paths are resolved relative to the config file's directory.

## Runtime Stack (important — do not regress this)

This project intentionally avoids native bindings and browser-only APIs so it runs on any modern Node.js with **no C++ toolchain needed**:

- **TensorFlow.js WASM backend** (`@tensorflow/tfjs` + `@tensorflow/tfjs-backend-wasm`). NOT `@tensorflow/tfjs-node` (requires prebuilt binaries for the exact Node ABI and falls back to Python + VS build tools otherwise; it failed to install on Node 24/Windows).
- **face-api build**: `@vladmandic/face-api/dist/face-api.node-wasm.js` — this variant wires in the WASM backend. Do NOT switch to the default `face-api.node.js` build (it hard-requires `@tensorflow/tfjs-node`).
- **Image decoding via `sharp`** (prebuilt binaries, no compile step). `faceapi.fetchImage`/`bufferToImage` are browser-only and must not be used. Do NOT add node-canvas unless truly required.
- Image decode path: `sharp(...).ensureAlpha().raw()` → strip the alpha channel → `tf.tensor3d(rgb, [height, width, 3], 'int32')`. FaceNet needs 3 channels.

## Data Flow Contract (CLI pipeline)

1. Input: a list of image file paths (configurable via `config/default.json` → `inputDir`).
2. A `FaceStore` is loaded from `faceStoreFile`. Each image is sha256-hashed and skipped if already scanned (`store.wasScanned` / `store.markScanned` — saves re-embedding the same files on re-runs).
3. `FaceDetector.getFaceDescriptors(imagePath)` → array of 128-d descriptor arrays (one per detected face). Descriptors from un-scanned images are flattened into one master list while recording which original image each came from (the `fileMapping`).
4. **First run (store has no people):** `FaceClusterer.clusterFaces(allDescriptors)` → each DBSCAN cluster seeds one stored person; each noise descriptor also becomes its own stored person. Groups are recorded as `{ personId, indices }`.
5. **Later runs (store has people):** each fresh descriptor is matched against the store (`store.match`) and added to the matched person; unmatched faces create a new person. This is what reuses existing `person_<id>` folders across different input folders.
6. Groups are converted to `{ id: personId, indices }` clusters and passed to `ShortcutManager.createShortcuts(clusters, fileMapping)`, which creates one shortcut per image per person folder (deduplicated).
7. `store.save()` persists identities + scanned image hashes (atomic write via `.tmp` + rename).

### FaceStore file format (`face_store.json`)

```json
{
  "version": 1,
  "nextId": 7,
  "people": [{ "id": 0, "descriptors": [[...128 floats]] }],
  "scanned": { "<abs image path>": "<sha256 hex>" }
}
```

- Person ids are persistent, so the same id always maps to the same folder name across runs.
- `store.match(descriptor)` returns `{ personId, distance }` for the nearest stored descriptor if within `threshold`, else `null`.
- Matching is nearest-neighbor over stored descriptors (min euclidean distance). The store can grow large for thousands of faces; future work could cap/prune descriptors per person.

## Code Conventions

- **CommonJS** modules (`require`/`module.exports`), `"type": "commonjs"` in package.json.
- Each public class lives in its own file under `lib/`.
- Constructors accept an `options` object with sensible defaults.
- Methods are `async` where they perform I/O (model loading, file system, image parsing).
- Keep `index.js` as the sole public re-export surface.
- No hardcoded absolute paths; everything comes from `config/default.json` or constructor options.
- Add tests in `test/` and wire them up in `package.json` scripts.

## Important Implementation Notes

### Cross-platform shortcuts
- On Windows, `fs.symlink` (and PowerShell `New-Item -ItemType SymbolicLink`) require admin privileges or Developer Mode. This project instead creates real **`.lnk` files** via the WScript.Shell COM object (no admin needed), driven through a UTF-16LE base64 `-EncodedCommand` PowerShell invocation to avoid quoting/escaping bugs.
- On Linux/macOS, `fs.symlink(..., 'file')` is used.
- `ShortcutManager.createShortcuts` dedupes by target filename so each original image appears at most once per cluster folder (a cluster may contain multiple faces from the same image).
- If you change shortcut handling, preserve: no admin required on Windows, cross-platform behavior, and source files left untouched.

### FaceNet model files
- Weight files are checked into `models/` (`ssd_mobilenetv1_model`, `face_landmark_68_model`, `face_recognition_model`: `.bin` + `-weights_manifest.json`). If they are absent, download from `https://raw.githubusercontent.com/vladmandic/face-api/master/model/`.
- `FaceDetector.loadModels()` is lazy and cached. Model loading: set WASM paths to the resolved `@tensorflow/tfjs-backend-wasm` dir, `setBackend('wasm')`, `await tf.ready()`, then `loadFromDisk(this.modelsDir)`.

### FaceStore / persistence
- `FaceStore` persists all learned people plus scanned-image hashes to `faceStoreFile` (default `output/face_store.json`, configurable). First run seeds people via DBSCAN clustering; later runs match each new face by nearest stored descriptor within `threshold`.
- `store.save()` writes atomically (`.tmp` + rename) and `store.load()` treats a missing/corrupt file as an empty store. Descriptors are stored as plain arrays in JSON.
- The CLI hashes every image (sha256) each run and skips already-scanned files — re-runs are cheap and never duplicate a person.
- Keep matching semantics scale-consistent with clustering: both use euclidean descriptor distance against the same `threshold`.

### Clustering
- `threshold` in `config/default.json` IS the DBSCAN epsilon = euclidean distance between two 128-d descriptors (NOT a 0–1 similarity). Default `0.6`.
- DBSCAN is invoked as `dbscan.run(descriptors, threshold, minClusterSize, euclideanDistance)` using `density-clustering`'s custom distance-function support. Keep passing descriptors directly — do not revert to the "distance-matrix as dataset" trick (its epsilon has no clean interpretation).
- `minClusterSize` is DBSCAN's minimum cluster size. Unassigned descriptors are returned as `noise`. On first-run seeding, each noise descriptor becomes its own stored person (so it can be matched later).

### Configuration
- All runtime config lives in JSON under `config/`. Paths inside config files are resolved relative to the config file's location (`src/cli.js` → `FaceClusteringCLI.resolve`). Adding a new tunable setting should be reflected there and documented in README's config table.

## Testing

- `npm test` — fast unit tests (`test/clusterer.test.js` + `test/faceStore.test.js`).
- `npm run test:smoke` — model loading + detection on one fixture.
- `npm run test:e2e` — full pipeline on `test/fixtures`: detects faces, asserts originals are byte-identical (sha256), seeds the store via clustering, persists, reloads, and verifies known descriptors match their stored people (incremental reuse). Output is written to `output/e2e` (person folders + `.lnk` shortcuts + `face_store.json`) and is **left in place** after the run — the folder is wiped only at the start of the next run. Never add a cleanup step that deletes it after completion.
- `test/fixtures/` contains sample images with faces (~22 faces across 6 photos, includes the same people appearing in multiple shots).
- Always run `npm test` after changes; run `test:smoke`/`test:e2e` when touching detection, store, or shortcut logic. The CPU-only WASM backend makes the E2E test take a few minutes — budget accordingly.

## Task Checklist for Agents

When assigned a task, follow this flow:

1. Read `README.md` and this `instructions.md` fully.
2. Inspect the current files under `lib/`, `src/`, and `config/` before editing.
3. Make isolated, convention-matching changes (see above).
4. Add/adjust tests in `test/`.
5. Run `npm test` (and the appropriate smoke/E2E test if detection/shortcuts changed).
6. Update README/config docs if behavior or options changed.
7. Keep `CHANGELOG.md` up to date: add each finished change under an "Unreleased" or the next version heading (bump per semver when cutting a release), then update `package.json`'s `version` to match.

## Known Limitations / Future Work

- [ ] CLI arg parsing is minimal; consider a proper CLI framework if more flags are needed.
- [ ] Batch processing could be parallelized for large photo sets (currently sequential per image).
- [ ] Optional human-readable naming (e.g. labeling clusters "Person A", picking a representative thumbnail) could be added.
- [ ] The store keeps every descriptor ever matched; for thousands of faces consider capping/pruning descriptors per person (e.g. keep N nearest or a centroid) to keep matching fast and memory bounded.
- [ ] Store entries reference scanned images by absolute path; moving/renaming input folders changes the `scanned` keys (harmless — re-scans and re-matches against existing people, no new folders).
- [ ] Detection only runs the SSD MobileNet model; MTCNN/tiny variants could be offered as options.
- [ ] A GUI or core integration is a possible future direction.
- [ ] The WASM backend is CPU-only; a GPU path (`tfjs-node-gpu`) could be added for speed on machines with CUDA + a working native build toolchain.