import BPTreeNode from "./bptreeNode.js";

export default class BPlusTree {
  /* ******************************** SEARCHING ******************************** */
  #binarySearch(list, key) {
    let min = 0;
    let max = list.length - 1;

    let mid;
    while (min <= max) {
      mid = Math.floor((min + max) / 2);

      if (key === list[mid]) return mid;
      else if (key < list[mid]) max = mid - 1;
      else min = mid + 1;
    }

    // min will be the insertion index if key is not exist
    return min;
  }

  #searchNode(node, key, mode = "search") {
    const idx = this.#binarySearch(node.keys, key); // Potential index
    const susKey = node.keys[idx];

    // Recursive if not tree bottom
    // Look at #binarySearch to know why passing idx directly is correct
    if (!node.isLeaf) return this.#searchNode(node.children[idx], key);

    if (susKey && susKey !== key)
      return mode === "range" ? { node, start: idx } : null;

    return mode === "range" ? { node, start: idx } : node.pairs[idx].value; // data pairs key/value
  }

  /* ******************************** INSERTION ******************************** */
  #split(node) {
    const splitIndex = Math.ceil(node.keys.length / 2);
    const splitKey = node.keys[splitIndex];

    // set right side
    const rightNode = new BPTreeNode(this.order - 1, true);

    // split key always stays in the right side not removed to parent like BTree
    rightNode.keys = node.keys.slice(splitIndex);

    // set left side
    const leftNode = new BPTreeNode(this.order - 1, true);
    leftNode.keys = node.keys.slice(0, splitIndex);

    // Edge Case: root splitting
    if (!node.parent) {
      const newRoot = new BPTreeNode(this.order - 1, false);

      this.root = newRoot;

      // push since keys in newRoot is empty also children
      newRoot.keys.push(splitKey);
      newRoot.children.push(leftNode, rightNode);

      rightNode.parent = newRoot;
      leftNode.parent = newRoot;

      leftNode.next = rightNode;
      rightNode.next = node.next;

      // split the data
      rightNode.pairs = this.root.pairs.slice(splitIndex);
      leftNode.pairs = this.root.pairs.slice(0, splitIndex);

      return;
    }

    if (node.isLeaf) {
      leftNode.next = rightNode;
      rightNode.next = node.next;

      // Since we split leaf node we node to put the data in new ones
      rightNode.pairs = node.pairs.slice(splitIndex);
      leftNode.pairs = node.pairs.slice(0, splitIndex);
    } else {
      // Remove the split key from right side since not leaf
      rightNode.keys.shift();

      // if current node isn't leaf so splitter will be
      rightNode.isLeaf = false;
      leftNode.isLeaf = false;

      // children must be more than keys by one
      const childrenSplitter = leftNode.keys.length + 1;

      // split children and modifying to new splitted node
      const rightSideChildren = node.children.slice(childrenSplitter);
      rightSideChildren.forEach((child) => (child.parent = rightNode));

      const leftSideChildren = node.children.slice(0, childrenSplitter);
      leftSideChildren.forEach((child) => (child.parent = leftNode));

      rightNode.children = rightSideChildren;
      leftNode.children = leftSideChildren;
    }

    // Get previous node to modify next pointer
    const nodeIndex = node.parent.children.findIndex((child) => child === node);
    const prevNode = node.parent.children[nodeIndex - 1];

    if (prevNode) prevNode.next = leftNode;

    // Link splitted node to its parent
    // If parent splitted later => will be covered in children splitting in previous else block
    rightNode.parent = node.parent;
    leftNode.parent = node.parent;

    // put splitter in parent node
    const insertIdx = node.parent.getIndexToInsert(splitKey);

    // We only need key for not leaf nodes
    node.parent.insertAt(insertIdx, splitKey);

    // replace node in its parent's children with the 2 split nodes
    node.parent.children = node.parent.children.toSpliced(
      insertIdx,
      1,
      leftNode,
      rightNode,
    );

    if (node.parent.isFull()) return this.#split(node.parent);
  }

  #addToNode(node, key, value) {
    const idx = node.getIndexToInsert(key);

    if (!node.isLeaf) return this.#addToNode(node.children[idx], key, value);

    node.insertAt(idx, key, value);

    if (node.isFull()) return this.#split(node);
  }

  #getInRange(node, endKey, result, startIdx = 0) {
    // For the end of the tree
    if (node === null) return;

    for (let i = startIdx; i < node.keys.length; ++i) {
      if (node.keys[i] <= endKey) result.push(node.pairs[i].value);
      // Recursion exit point
      else return;
    }

    // if no return go next node
    this.#getInRange(node.next, endKey, result);
  }

  #collectKeys(node, result) {
    if (!node) return;

    if (node.isLeaf) {
      result.push(...node.keys);
    } else {
      for (let i = 0; i < node.children.length; i++) {
        this.#collectKeys(node.children[i], result);
      }
    }
  }

  constructor(m = 4) {
    this.order = m;
    this.root = new BPTreeNode(m - 1, true);
  }

  search(key) {
    return this.#searchNode(this.root, key);
  }

  insert(key, value) {
    this.#addToNode(this.root, key, value);
  }

  keys() {
    const result = [];

    this.#collectKeys(this.root, result);

    return result;
  }

  range(startKey, endKey) {
    const startPoint = this.#searchNode(this.root, startKey, "range");
    const range = [];

    if (!startPoint || !startPoint.node) return range;

    this.#getInRange(startPoint.node, endKey, range, startPoint.start);

    return range;
  }
}
