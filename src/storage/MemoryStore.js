import { Buffer } from "node:buffer";
import path from "node:path";
import fs from "node:fs/promises";

import BPTree from "../index/BPTree.js";
import BPTreeNode from "../index/BPTreeNode.js";

export default class MemoryStore {
  #size;
  #tree;
  #treePath;
  #tempPath;

  #getFileDir() {
    const fileIdx = this.#treePath.lastIndexOf("/");

    return this.#treePath.slice(0, fileIdx);
  }

  async #ensureWriteDir() {
    await fs.mkdir(this.#getFileDir(), { recursive: true });
  }

  #BFS(queue = [], pos = 0, result = []) {
    const node = queue[pos];

    if (!node) return result;

    if (!node.isLeaf) {
      // Override children with their positions in BFS array
      node.childIndices = node.children.map((child) => {
        // `.push()` returns the length after pushing
        // subtract one to get the element position
        const chPos = queue.push(child) - 1;

        return chPos;
      });
    }

    result.push(node);

    return this.#BFS(queue, ++pos, result);
  }

  #serializeNode(node) {
    const buffer = Buffer.allocUnsafe(4 * 1024); // 4 KB

    let offset = 0;

    buffer.writeUint8(node.isLeaf ? 1 : 0, offset);
    offset++;

    buffer.writeUint8(node.maxKeys, offset);
    offset++;

    const jsonKeys = JSON.stringify(node.keys);
    const keysBuf = Buffer.from(jsonKeys);

    buffer.writeUint16BE(keysBuf.byteLength, offset);
    offset += 2; // 2 bytes;

    keysBuf.copy(buffer, offset);

    offset += keysBuf.byteLength;

    if (node.isLeaf) {
      const jsonPairs = JSON.stringify(node.pairs);
      const pairsBuf = Buffer.from(jsonPairs);

      buffer.writeUint16BE(pairsBuf.byteLength, offset);
      offset += 2;

      pairsBuf.copy(buffer, offset);

      offset += pairsBuf.byteLength;

      return buffer;
    } else {
      const jsonPos = JSON.stringify(node.childIndices);
      const posBuf = Buffer.from(jsonPos);

      buffer.writeUint16BE(posBuf.byteLength, offset);
      offset += 2;

      posBuf.copy(buffer, offset);
      offset += posBuf.byteLength;
    }

    return buffer;
  }

  #serialize(root) {
    const bfsNodes = this.#BFS([root]);

    return bfsNodes.map((node) => this.#serializeNode(node));
  }

  #deserializeNode(nodeBuff) {
    let offset = 0;
    const isLeaf = nodeBuff.readUint8(offset) === 1;
    offset++;

    const maxKeys = nodeBuff.readUint8(offset);
    offset++;

    const kyesBytes = nodeBuff.readUint16BE(offset);
    offset += 2;

    const deserializedNode = new BPTreeNode(maxKeys, isLeaf);

    // Keys
    const keysStr = nodeBuff
      .subarray(offset, kyesBytes + offset)
      .toString("utf-8");

    offset += kyesBytes;

    deserializedNode.keys = JSON.parse(keysStr);

    if (!deserializedNode.isLeaf) {
      const childrenBytes = nodeBuff.readUint16BE(offset);
      offset += 2;

      const childrenStr = nodeBuff
        .subarray(offset, childrenBytes + offset)
        .toString("utf-8");

      // the parsed value is an array carry the position of each child in the dz nodes array
      // map after finishing the dz operation to replace
      deserializedNode.children = JSON.parse(childrenStr);
    } else if (deserializedNode.isLeaf) {
      const pairsBytes = nodeBuff.readUint16BE(offset);
      offset += 2;

      const pairsStr = nodeBuff
        .subarray(offset, pairsBytes + offset)
        .toString("utf-8");

      offset += pairsBytes;

      deserializedNode.pairs = JSON.parse(pairsStr);
    }

    return deserializedNode;
  }

  #deserializeNodes(serializedNodes) {
    const nodes = serializedNodes.map((nodeBuff) =>
      this.#deserializeNode(nodeBuff),
    );

    // replace positions with actual nodes
    nodes.forEach((node, idx) => {
      if (!node.isLeaf)
        node.children = node.children.map((childPos) => {
          nodes[childPos].parent = node;
          return nodes[childPos];
        });

      // `BFS` was used in sz operation so the next node will be the idx after current
      if (node.isLeaf) node.next = nodes[idx + 1] || null;
    });

    return nodes;
  }

  async #readSerialized(blockSize) {
    try {
      // No streams data will live in memory.
      const fileContent = await fs.readFile(this.#treePath);

      if (fileContent.byteLength === 0) return [];

      const serializedNodes = [];

      for (let i = 0; i < fileContent.byteLength; i += blockSize)
        serializedNodes.push(fileContent.subarray(i, i + blockSize));

      return serializedNodes;
    } catch (err) {
      if (err.code === "ENOENT") {
        console.log(`Cannot access file ${err.path}, file does not exist.`);
      } else if (err.code === "EACCES") {
        console.log(`Cannot access file ${err.path}, permission denied.`);
      } else console.error("Error Reading Tree File: ", err);

      return [];
    }
  }

  async #loadTree(blockSize) {
    this.#tree = new BPTree(4);

    try {
      const serializedNodes = await this.#readSerialized(blockSize);

      // return empty tree if read fail or file not exist on start
      if (serializedNodes.length === 0) return;

      const deserializedNodes = this.#deserializeNodes(serializedNodes);

      this.#tree.root = deserializedNodes[0];
    } catch (err) {
      console.error("Error loading tree 💥", err);
    }
  }

  constructor(treePath) {
    this.#size = 0;
    this.#treePath = treePath;

    this.#tempPath = path.resolve(this.#getFileDir(), "tempTree.db");
  }

  // value will be the start read point in the file that stored the data
  set(key, value) {
    if (!key || typeof key !== "string")
      throw new Error(`Invalid key type: Expected string, got ${typeof key}`);

    if (typeof value !== "number" || value < 0)
      throw new Error(
        `Invalid value type: Expected number, got ${typeof value}`,
      );

    this.#tree.insert(key, value);
    ++this.#size;
  }

  get(key) {
    const value = this.#tree.search(key); // { key, value }
    return value;
  }

  range(startKey, endKey) {
    const result = this.#tree.range(startKey, endKey);

    return result; // array carrying the offsets of data in storage file
  }

  delete(key) {
    this.#tree.delete(key);
  }

  has(key) {
    return !!this.#tree.search(key);
  }

  size() {
    return this.#size;
  }

  keys() {
    return this.#tree.keys();
  }

  async writeBTree() {
    try {
      await this.#ensureWriteDir();

      const serializedTree = this.#serialize(this.#tree.root);
      const treeBuf = Buffer.concat(serializedTree);

      // Write to temp file for safety
      // No streams data already in memory 😎😎
      await fs.writeFile(this.#tempPath, treeBuf);

      // Replace old with new
      await fs.rename(this.#tempPath, this.#treePath);
      console.info("Write File Successfully.");
    } catch (err) {
      console.error("Failed to write Error: ", err);
    }
  }

  /**
   *
   * @param {String} filePath - A path to store data
   * @param {Number} blockSize - The space for node in file in bytes default (4 * 1024 => 4 KB)
   * @returns {MemoryStore}
   */
  static async create(treePath = "data/btree.db", blockSize = 4 * 1024) {
    const store = new MemoryStore(treePath);

    await store.#loadTree(blockSize);
    return store;
  }
}
