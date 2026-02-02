import BPTreeNode from "./BPTreeNode.js";

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
    const found = node.keys[idx] === key;

    // Recursive if not tree bottom
    // Look at #binarySearch to know why passing idx directly is correct
    if (!node.isLeaf) {
      const childIdx = found ? idx + 1 : idx;
      return this.#searchNode(node.children[childIdx], key, mode);
    }

    if (mode === "range") return { node, start: idx };

    return found ? node.pairs[idx]?.value : null;
  }

  /* ******************************** INSERTION ******************************** */
  #split(node) {
    const splitIndex = Math.ceil(node.keys.length / 2);
    const splitKey = node.keys[splitIndex];

    const rightNode = new BPTreeNode(this.order - 1, true);
    const leftNode = new BPTreeNode(this.order - 1, true);

    // split key will be in right side always
    rightNode.keys = node.keys.slice(splitIndex);
    leftNode.keys = node.keys.slice(0, splitIndex);

    // Root Case
    if (node === this.root) {
      const newRoot = new BPTreeNode(this.order - 1, false);

      // push since keys in newRoot is empty also children
      newRoot.keys.push(splitKey);
      newRoot.children.push(leftNode, rightNode);

      rightNode.parent = newRoot;
      leftNode.parent = newRoot;

      this.root = newRoot;
    }

    if (node.isLeaf) {
      leftNode.next = rightNode;
      rightNode.next = node.next;

      // move data to new nodes
      rightNode.pairs = node.pairs.slice(splitIndex);
      leftNode.pairs = node.pairs.slice(0, splitIndex);
    } else {
      // 2) Non-Leaf Node Split.

      // remove the split key from right side since not leaf
      rightNode.keys.shift();

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

    // Link splitted node to its parent
    // If parent splitted later => will be covered in children splitting in previous else block
    if (node.parent) {
      rightNode.parent = node.parent;
      leftNode.parent = node.parent;

      const insertIdx = node.parent.getIndexToInsert(splitKey);

      // replace node in its parent's children with the 2 split nodes
      node.parent.children = node.parent.children.toSpliced(
        insertIdx,
        1,
        leftNode,
        rightNode,
      );

      // check full before insert to split parent
      if (node.parent.isFull()) {
        node.parent.insertAt(insertIdx, splitKey);
        return this.#split(node.parent);
      }

      node.parent.insertAt(insertIdx, splitKey);
    }
  }

  #addToNode(node, key, value) {
    const idx = node.getIndexToInsert(key);

    if (!node.isLeaf) return this.#addToNode(node.children[idx], key, value);

    if (node.isFull()) {
      node.insertAt(idx, key, value);
      return this.#split(node);
    }

    node.insertAt(idx, key, value);
  }

  /**
   *
   * @param {BPTreeNode} node
   * @param {BPTreeNode} sibNode
   * @param {"right" | "left"} sibNodeDir
   */
  #borrow(node, sibNode, sibNodeDir) {
    let borrowedKey, borrowedPairs, newDiv, newDivIdx;

    if (sibNodeDir === "right") {
      /* ****************** BORROWING FROM RIGHT SIDE ****************** */
      // get first from right sibling then push to node end
      borrowedKey = sibNode.keys.shift();
      node.keys.push(borrowedKey);

      newDiv = sibNode.keys.at(0);
      newDivIdx = node.parent.getIndexToInsert(newDiv) - 1;

      if (node.isLeaf) {
        borrowedPairs = sibNode.pairs.shift();
        node.pairs.push(borrowedPairs);

        // updating parent key
        node.parent.keys[newDivIdx] = newDiv;
      } else {
        node.children.push(sibNode.children.shift());

        // switching
        const parentKey = node.parent.keys.at(newDivIdx);
        node.parent.keys[newDivIdx] = newDiv;
        node.keys[node.keys.length - 1] = parentKey;
      }

      /* ************************************************************** */
      /* ************************************************************** */
    } else {
      /* ****************** BORROWING FROM LEFT SIDE ****************** */

      // get last from left sibling then push to node beginning
      borrowedKey = sibNode.keys.pop();
      node.keys.unshift(borrowedKey);

      newDiv = borrowedKey;
      newDivIdx = node.parent.getIndexToInsert(newDiv);

      if (node.isLeaf) {
        borrowedPairs = sibNode.pairs.pop();
        node.pairs.unshift(borrowedPairs);

        node.parent.keys[newDivIdx] = newDiv;
      } else {
        node.children.unshift(sibNode.children.pop());

        // switching
        const parentKey = node.parent.keys[newDivIdx];
        node.parent.keys[newDivIdx] = newDiv;
        node.keys[0] = parentKey;
      }
    }
  }

  /**
   *
   * @param {BPTreeNode} node
   * @param {BPTreeNode} sibNode
   * @param {"right" | "left"} sibNodeDir
   */
  #merge(node, sibNode, sibNodeDir) {
    const mergedNode = new BPTreeNode(this.order - 1, node.isLeaf);

    let separatorIdx, separatorKey;
    if (sibNodeDir === "right") {
      separatorIdx = node.parent.children.indexOf(node);
      separatorKey = node.parent.keys[separatorIdx];

      if (node.isLeaf) {
        mergedNode.keys = node.keys.concat(sibNode.keys);
        mergedNode.pairs = node.pairs.concat(sibNode.pairs);
      } else {
        mergedNode.keys = node.keys.concat(separatorKey, sibNode.keys);
        mergedNode.children = node.children.concat(sibNode.children);
      }
    } else {
      separatorIdx = node.parent.children.indexOf(sibNode);
      separatorKey = node.parent.keys[separatorIdx];

      if (node.isLeaf) {
        mergedNode.keys = sibNode.keys.concat(node.keys);
        mergedNode.pairs = sibNode.pairs.concat(node.pairs);
      } else {
        mergedNode.keys = sibNode.keys.concat(separatorKey, node.keys);
        mergedNode.children = sibNode.children.concat(node.children);
      }
    }

    if (!node.isLeaf)
      mergedNode.children.forEach((child) => (child.parent = mergedNode));

    // replace old children with mergedNode
    // since key divider index will refer to the child on left
    // which the place to start remove from
    node.parent.children = node.parent.children.toSpliced(
      separatorIdx,
      2,
      mergedNode,
    );

    mergedNode.parent = node.parent;

    return this.#handleDeletion(node.parent, separatorKey);
  }

  /**
   * @param {BPTreeNode} node
   * @param {string} key
   * @returns
   */
  #handleDeletion(node, key) {
    node.keys = node.keys.filter((k, i) => k !== key);

    if (node === this.root) {
      if (node.keys.length === 0) {
        this.root = node.children[0];
        node.children[0].parent = null;
      }

      return;
    }

    if (node.isLeaf) node.pairs = node.pairs.filter((p, i) => p.key !== key);

    const minKeys = Math.floor((this.order - 1) / 2);

    // no underflow after removing.
    if (node.keys.length >= minKeys) return;

    // get sibling to borrow
    // NOTE: next pointer will mess up here since we could merge nodes don't share same parent
    const nodeIdx = node.parent.children.indexOf(node);
    const rightSib = node.parent.children.at(nodeIdx + 1);
    const sibNode = rightSib || node.parent.children.at(nodeIdx - 1);
    const sibNodeDir = rightSib ? "right" : "left";

    if (sibNode.keys.length - 1 >= minKeys) {
      // Borrow when sibNode won't underflow after borrowing

      this.#borrow(node, sibNode, sibNodeDir);
    } else {
      this.#merge(node, sibNode, sibNodeDir);
    }
  }

  /**
   * @param {BPTreeNode} node
   * @param {String} key
   * @returns
   */
  #deleteFromNode(node, key) {
    const idx = node.getIndexToInsert(key);

    if (!node.isLeaf) {
      const childIdx = node.keys[idx] === key ? idx + 1 : idx;
      return this.#deleteFromNode(node.children[childIdx], key);
    }

    if (node.keys[idx] !== key) return;

    this.#handleDeletion(node, key);
  }

  #getInRange(node, endKey, result, startIdx = 0) {
    // Tree End
    if (!node) return;

    for (let i = startIdx; i < node.pairs.length; ++i) {
      if (node.pairs[i].key <= endKey) result.push(node.pairs[i]);
      // Recursion exit point (out of range)
      else return;
    }

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

  delete(key) {
    this.#deleteFromNode(this.root, key);
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
