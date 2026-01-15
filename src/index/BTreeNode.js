export default class BTreeNode {
  constructor(maxKeys, isLeaf) {
    this.pairs = [];
    this.children = [];
    this.maxKeys = maxKeys;
    this.isLeaf = isLeaf;
    this.parent = null;
  }

  isFull() {
    return this.pairs.length >= this.maxKeys;
  }

  insertAt(idx, key, value) {
    this.pairs = this.pairs.toSpliced(idx, 0, { key, value });
  }

  getIndexToInsert(key) {
    const insertIndex = this.pairs.findIndex((pair) => pair.key > key);

    return insertIndex !== -1 ? insertIndex : this.pairs.length;
  }
}
