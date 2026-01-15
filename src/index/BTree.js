import BTreeNode from "./BTreeNode.js";

export default class BTree {
  #binarySearch(pairs, key) {
    let min = 0;
    let max = pairs.length;

    let mid;
    while (min < max) {
      mid = Math.floor((min + max) / 2);

      if (pairs[mid].key === key) return mid;
      else if (pairs[mid].key < key) min = mid + 1;
      else max = mid - 1;
    }

    return mid;
  }

  #searchNode(node, key) {
    const idx = this.#binarySearch(node.pairs, key); // Potential index
    const pair = node.pairs[idx];

    // Found
    if (pair.key === key) return pair;

    // Return while not found and reached tree bottom
    if (node.isLeaf) return null;

    // Recursive if not tree bottom
    if (pair.key > key) return this.#searchNode(node.children[idx], key);
    else if (pair.key < key)
      return this.#searchNode(node.children[idx + 1], key);
  }

  #split(node) {
    const midIdx = Math.floor(node.pairs.length / 2);
    const splitPair = node.pairs[midIdx];

    // set right side
    const rightNode = new BTreeNode(this.order - 1, true);
    rightNode.pairs = node.pairs.slice(midIdx + 1);

    // set left side
    const leftNode = new BTreeNode(this.order - 1, true);
    leftNode.pairs = node.pairs.slice(0, midIdx);

    if (!node.parent) {
      const newRoot = new BTreeNode(this.order - 1, false);

      newRoot.pairs.push(splitPair);
      newRoot.children.push(leftNode, rightNode);

      rightNode.parent = newRoot;
      leftNode.parent = newRoot;

      this.root = newRoot;

      return;
    }

    // Has Parent
    rightNode.parent = node.parent;
    leftNode.parent = node.parent;

    // raise splitter to parent
    const insertIdx = node.parent.getIndexToInsert(splitPair.key);
    node.parent.insertAt(insertIdx, splitPair.key, splitPair.value);

    if (!node.isLeaf) {
      rightNode.isLeaf = false;
      leftNode.isLeaf = false;

      const childrenSplitter = leftNode.pairs.length + 1;

      const rightSideChildren = node.children.slice(childrenSplitter);
      const leftSideChildren = node.children.slice(0, childrenSplitter);

      rightNode.children = rightSideChildren;
      leftNode.children = leftSideChildren;
    }

    // replace node in its parent's children with the 2 split nodes
    node.parent.children = node.parent.children.toSpliced(
      insertIdx,
      1,
      leftNode,
      rightNode
    );

    if (node.parent.isFull()) return this.#split(node.parent);
  }

  #addToNode(node, key, value) {
    const idx = node.getIndexToInsert(key);

    if (node.isLeaf) {
      node.insertAt(idx, key, value);

      if (node.isFull()) {
        this.#split(node);
      }
    } else this.#addToNode(node.children[idx], key, value);
  }

  constructor(order = 4) {
    this.order = order;
    this.root = new BTreeNode(order - 1, true);
  }

  search(key) {
    return this.#searchNode(this.root, key);
  }

  insert(key, value) {
    this.#addToNode(this.root, key, value);
  }
}
