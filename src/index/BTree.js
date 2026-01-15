import BTreeNode from "./BTreeNode.js";

export default class BTree {
  #binarySearch(pairs, key) {
    let min = 0;
    let max = pairs.length;

    let mid;
    while (min < max) {
      mid = Math.floor((min + max) / 2);

      if (pairs[mid].key === key) return mid;
      else if (pairs[mid].key > key) min = mid + 1;
      else max = mid - 1;
    }

    return mid;
  }

  #searchNode(node, key) {
    const idx = this.#binarySearch(node.pairs, key); // Potential index
    const pair = node.pairs[idx];

    // Found
    if (pair.key === key) return pair;

    // Return while not found while reached tree bottom
    if (node.isLeaf && pair.key !== key) return null;

    // Recursive if not tree bottom
    if (pair.key < key) this.#searchNode(node.children[idx], key);
    else if (pair.key > key) this.#searchNode(node.children[idx + 1], key);
  }

  constructor(order = 4) {
    this.order = order;
    this.root = new BTreeNode(order - 1, true);
  }

  search(key) {
    return this.#searchNode(this.root, key);
  }
}
