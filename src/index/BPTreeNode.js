export default class BPTreeNode {
  constructor(maxKeys, isLeaf) {
    this.keys = [];
    this.children = [];
    this.isLeaf = isLeaf;
    this.maxKeys = maxKeys;
    this.parent = null;

    if (isLeaf) {
      this.next = null;
      this.pairs = [];
    }
  }

  isFull() {
    return this.keys.length >= this.maxKeys;
  }

  getIndexToInsert(key) {
    let min = 0;
    let max = this.keys.length - 1;

    let mid;
    while (min < max) {
      mid = Math.floor((min + max) / 2);

      if (key === this.keys[mid]) return mid;
      else if (key < this.keys[mid]) max = mid - 1;
      else min = mid + 1;
    }

    // min will be the insertion index if key is not exist
    return min;
  }

  insertAt(idx, key, value) {
    this.keys = this.keys.toSpliced(idx, 0, key);

    if (this.isLeaf) this.pairs = this.pairs.toSpliced(idx, 0, { key, value });
  }
}
