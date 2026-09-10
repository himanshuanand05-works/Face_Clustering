const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === 'win32';

class ShortcutManager {
  constructor(outputDir, options = {}) {
    this.outputDir = outputDir;
    this.options = options;
  }

  async createShortcuts(clusters, imageFiles) {
    await fs.mkdir(this.outputDir, { recursive: true });
    const created = [];

    for (const cluster of clusters) {
      const clusterDir = path.join(this.outputDir, this.folderName(cluster));
      await fs.mkdir(clusterDir, { recursive: true });

      const linked = new Set();
      for (const index of cluster.indices) {
        const sourcePath = path.resolve(imageFiles[index]);
        const fileName = path.basename(sourcePath);
        const targetName = IS_WINDOWS ? `${fileName}.lnk` : fileName;

        if (linked.has(targetName)) continue;
        linked.add(targetName);

        const targetPath = path.join(clusterDir, targetName);
        await this.createShortcut(sourcePath, targetPath);

        created.push({ folder: this.folderName(cluster), shortcut: targetPath, source: sourcePath });
      }
    }

    return created;
  }

  folderName(cluster) {
    return cluster.label || `person_${cluster.id}`;
  }

  async createShortcut(sourcePath, targetPath) {
    if (IS_WINDOWS) {
      await this.createWindowsLink(sourcePath, targetPath);
    } else {
      await fs.symlink(sourcePath, targetPath, 'file');
    }
  }

  async createWindowsLink(sourcePath, targetPath) {
    const ps = [
      `$ws = New-Object -ComObject WScript.Shell`,
      `$sc = $ws.CreateShortcut('${this.escapePs(targetPath)}')`,
      `$sc.TargetPath = '${this.escapePs(sourcePath)}'`,
      `$sc.Save()`
    ].join('; ');
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true });
  }

  escapePs(value) {
    return value.replace(/'/g, "''");
  }

  async getOutputStructure() {
    const structure = {};
    const entries = await fs.readdir(this.outputDir);

    for (const entry of entries) {
      const entryPath = path.join(this.outputDir, entry);
      const stat = await fs.stat(entryPath);

      if (stat.isDirectory()) {
        const files = await fs.readdir(entryPath);
        structure[entry] = files;
      }
    }

    return structure;
  }
}

module.exports = ShortcutManager;