export default class BTreeNode {
  constructor(maxKeys, isLeaf) {
    this.pairs = [];
    this.children = [];
    this.maxKeys = maxKeys;
    this.isLeaf = isLeaf;
    parent = null;
  }

  isFull() {
    return this.pairs.length >= this.maxKeys;
  }

  insertAt(idx, key, value) {
    this.pairs = this.keys.toSpliced(idx, 0, { key, value });
  }

  getIndexToInsert(key) {
    return this.pairs.findIndex((pair) => pair.key > key);
  }
}
