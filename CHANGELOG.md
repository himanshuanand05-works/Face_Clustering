# Changelog

All notable changes to this project are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-10

### Added

- **Face detection & embedding** — `FaceDetector` (lib/faceDetector.js) uses FaceNet (SSD MobileNet + 68-point landmarks + recognition model) via `@vladmandic/face-api` to detect faces and produce 128-dimension descriptors per face.
- **No-native-stack runtime** — runs on the TensorFlow.js **WASM backend** (`face-api.node-wasm.js`) with `sharp` for image decoding; no C++/Python build toolchain or admin rights required.
- **Clustering** — `FaceClusterer` (lib/faceClusterer.js) groups similar faces with DBSCAN (`density-clustering`), using euclidean descriptor distance as the threshold.
- **Persistent person identity** — `FaceStore` (lib/faceStore.js) saves every learned person's descriptors plus a sha256 of already-scanned images to a JSON store (`output/face_store.json`). Re-runs against new photo folders match faces to existing people instead of creating new folders.
- **Non-destructive output** — `ShortcutManager` (lib/shortcutManager.js) creates named per-person folders containing only shortcuts to the original images: real `.lnk` files on Windows (via WScript.Shell), symlinks on Linux/macOS. Originals are never copied, moved, cropped, or edited.
- **CLI** — `src/cli.js` (`npm start`, or `node src/cli.js <config>`) with JSON config (`config/default.json`) for input/output/model paths, similarity threshold, cluster size, and supported formats.
- **Configuration** — tunable `threshold`, `minClusterSize`, paths, and formats documented in README, resolved relative to the config file.
- **Tests** — unit tests for clustering and the store, a model/detection smoke test, and a full end-to-end test (learn → persist → reload → match) that asserts originals remain byte-identical and leaves its output in `output/e2e`.
- **Docs** — README (usage, config reference, architecture) and `instructions.md` (agent guidance, data-flow contract, non-negotiables).
- **Model weights** — FaceNet weight files committed under `models/`.

### Notes

- Initial release. No known issues tracked at this version.