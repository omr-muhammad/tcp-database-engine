import { Buffer } from "node:buffer";
import fs from "node:fs/promises";

import BPTree from "../index/BPTree.js";
import path from "node:path";
import BPTreeNode from "../index/BPTreeNode.js";

export default class MemoryStore {
  #size;
  #tree;
  #treePath;
  #tempPath = path.resolve(this.#getFileDir(), "tempTree.db");

  #getFileDir() {
    const fileIdx = this.#treePath.lastIndexOf("/");

    return this.#treePath.slice(0, fileIdx);
  }

  async #ensureWriteDir() {
    await fs.mkdir(this.#getFileDir(), { recursive: true });
  }

  #serializeNode(node, positions) {
    const buffer = Buffer.allocUnsafe(4096); // 4 KB

    let offset = 0;

    buffer.writeUint8(node.isLeaf ? 1 : 0, offset);
    offset++;

    buffer.writeUint8(node.maxKeys);
    offset++;

    buffer.writeUint16BE(node.keys.length, offset);
    offset += 2; // 2 bytes;

    const jsonKeys = JSON.stringify(node.keys);
    buffer.write(jsonKeys, offset);
    offset += jsonKeys.length;

    if (node.isLeaf) {
      const jsonPairs = JSON.stringify(node.pairs);

      buffer.writeUint16BE(jsonPairs.length, offset);
      offset += 2;

      buffer.write(jsonPairs);
      offset += jsonPairs.length;

      return buffer;
    }

    if (positions) {
      const jsonPos = JSON.stringify(positions);

      buffer.writeUint16BE(jsonPos.length, offset);
      offset += 2;

      buffer.write(jsonPos, offset);
      offset += jsonPos.length;
    }

    return buffer;
  }

  #serialize(node, nodePos = 0, childrenQ = [], result = []) {
    // No need for all just one does the job but for explicit
    if (
      !node ||
      nodePos === childrenQ.length ||
      result.length === childrenQ.length
    )
      return result;

    let buffer;
    // store children positions
    if (node.children.length > 0) {
      const positions = [];
      node.children.forEach((child) => {
        const pos = childrenQ.push(child);

        // pos is the length after push so pos - 1 is the last element
        positions.push(pos - 1);
      });

      buffer = this.#serializeNode(node, positions);
    } else {
      buffer = this.#serializeNode(node);
    }

    result.push(buffer);

    return this.#serialize(childrenQ[++nodePos], nodePos, childrenQ, result);
  }

  #deserializeNode(nodeBuff) {
    let offset = 0;
    const isLeaf = nodeBuff.readUint8(offset) === 1;
    offset++;

    const maxKeys = nodeBuff.readUint8(offset);
    offset++;

    const keysLen = nodeBuff.readUint16BE(offset);
    offset += 2;

    const deserializedNode = new BPTreeNode(maxKeys, isLeaf);

    // Keys
    const keysStr = nodeBuff
      .subarray(offset, keysLen + offset)
      .toString("utf-8");
    offset += keysStr.length;

    deserializedNode.keys = JSON.parse(keysStr);

    if (!deserializedNode.isLeaf) {
      const childrenBytes = nodeBuff.readUint16BE(offset);
      offset += 2;

      const childrenStr = nodeBuff
        .subarray(offset, childrenBytes + offset)
        .toString("utf-8");

      deserializedNode.children = JSON.parse(childrenStr);
    } else if (deserializedNode.isLeaf) {
      const pairsLen = nodeBuff.readUint16BE(offset);
      offset += 2;

      const pairsStr = nodeBuff
        .subarray(offset, pairsLen + offset)
        .toString("utf-8");
      offset += pairsLen;

      deserializedNode.pairs = JSON.parse(pairsStr);
    }

    return deserializedNode;
  }

  #deserializeNodes(serializedNodes) {
    const nodes = serializedNodes.map((nodeBuff) =>
      this.#deserializeNode(nodeBuff),
    );

    // replace children position with actual nodes
    nodes.forEach((node, idx) => {
      node.children = node.children.map((childPos) => nodes[childPos]);

      // node.next will always point to the next node since we applied `BFS` when serializing
      if (node.isLeaf) {
        node.next = nodes[idx + 1] || null;
      }
    });

    return nodes;
  }

  async #readSerialized(blockSize) {
    try {
      const readStream = fs.createReadStream(this.#treePath);
      const serializedNodes = [];
      let block = Buffer.alloc(0);

      return new Promise((resolve, reject) => {
        readStream.on("data", (chunk) => {
          block = Buffer.concat([block, chunk]);

          while (block.byteLength >= blockSize) {
            serializedNodes.push(block.subarray(0, blockSize));
            block = block.subarray(blockSize);
          }
        });

        readStream.on("end", () => {
          if (block.byteLength > 0) {
            serializedNodes.push(block);
          }

          resolve(serializedNodes);
        });

        readStream.on("error", reject);
      });
    } catch (err) {
      console.error("Error reading data: 💥", err);
    }
  }

  async #loadTree(blockSize = 4 * 1024) {
    try {
      const serializedNodes = await this.#readSerialized(blockSize);
      const deserializedNodes = this.#deserializeNodes(serializedNodes);

      this.#tree = new newBTree(4);
      this.#tree.root = deserializedNodes[0];
    } catch (err) {
      console.error("Error loading tree 💥", err);

      // Start clean
      this.#tree = new BPTree(4);
    }
  }

  constructor(treePath = "./data/btree.db") {
    this.#size = 0;
    this.#treePath = treePath;
  }

  /**
   *
   * @param {String} filePath - A path to store data
   * @param {Number} blockSize - The space for node in file in bytes default (4 * 1024 => 4 KB)
   * @returns {MemoryStore}
   */
  static async create(filePath, blockSize) {
    const store = new MemoryStore(filePath);
    await store.#loadTree(blockSize);
    return store;
  }

  // #isJsonSerializable(data) {
  //   return JSON.stringify(data) ? true : false;
  // }

  // value will be the start read point in the file that stored the data
  set(key, value) {
    if (!key || typeof key !== "string" || !value || typeof value !== "number")
      throw new Error(`Invalid key type: Expected string, got ${typeof key}`);

    // Validate `value` JSON serializable
    // if (!this.#isJsonSerializable(value))
    //   throw new Error(
    //     `Invalid value type, ${typeof value} is not JSON serializable.`,
    //   );

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

  // delete(key) {
  //   if (this.has(key)) this._store.delete(key);
  // }

  has(key) {
    return !!this.#tree.search(key);
  }

  size() {
    return this.#size;
  }

  async writeBTree() {
    try {
      await this.#ensureWriteDir();

      const serializedTree = this.#serialize(this.#tree.root);
      const fullBuff = Buffer.concat(serializedTree);

      // Write to temp file for safety
      await fs.writeFile(this.#tempPath, fullBuff);

      // Replace old with new
      await fs.rename(this.#tempPath, this.#treePath);
      console.info("Write File Successfully.");
    } catch (err) {
      console.log("Failed to write tree.");
      console.error("Error: ", err);
    }
  }

  // keys() {
  //   return Array.from(this.#tree.keys());
  // }
}
