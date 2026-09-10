const fs = require('fs').promises;
const path = require('path');

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

class FaceStore {
  constructor(storePath, options = {}) {
    this.storePath = storePath;
    this.threshold = options.threshold ?? 0.6;
    this.people = [];
    this.nextId = 0;
    this.scanned = {};
  }

  async load() {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      const data = JSON.parse(raw);
      this.people = (data.people || []).map(p => ({
        id: p.id,
        descriptors: p.descriptors.map(d => Array.from(d))
      }));
      this.nextId = (typeof data.nextId === 'number') ? data.nextId : this.people.length;
      this.scanned = data.scanned || {};
    } catch (_) {
      this.people = [];
      this.nextId = 0;
      this.scanned = {};
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    const data = {
      version: 1,
      nextId: this.nextId,
      people: this.people,
      scanned: this.scanned
    };
    const tmp = `${this.storePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.rename(tmp, this.storePath);
  }

  createPerson(descriptors = []) {
    const person = {
      id: this.nextId,
      descriptors: descriptors.map(d => Array.from(d))
    };
    this.nextId += 1;
    this.people.push(person);
    return person;
  }

  getPersonById(id) {
    return this.people.find(p => p.id === id);
  }

  addDescriptor(personId, descriptor) {
    const person = this.getPersonById(personId);
    if (!person) return false;
    person.descriptors.push(Array.from(descriptor));
    return true;
  }

  match(descriptor) {
    let bestPerson = null;
    let bestDistance = Infinity;

    for (const person of this.people) {
      for (const stored of person.descriptors) {
        const distance = euclideanDistance(descriptor, stored);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPerson = person;
        }
      }
    }

    if (bestPerson && bestDistance <= this.threshold) {
      return { personId: bestPerson.id, distance: bestDistance };
    }
    return null;
  }

  wasScanned(imagePath, hash) {
    return this.scanned[imagePath] === hash;
  }

  markScanned(imagePath, hash) {
    this.scanned[imagePath] = hash;
  }
}

module.exports = FaceStore;
module.exports.euclideanDistance = euclideanDistance;