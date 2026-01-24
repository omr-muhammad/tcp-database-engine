import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
// import path from "node:path";

export default class DiskStore {
  #dataPath;
  // #tmpFileName = path.resolve(this.#getFileDir(), "tempDB.db");
  #maxDataBytes = 4.194e6;
  #isInitialized = false;

  #getFileDir() {
    const fileIdx = this.#dataPath.lastIndexOf("/");

    return this.#dataPath.slice(0, fileIdx);
  }

  async #ensureDataDir() {
    await fs.mkdir(this.#getFileDir(), { recursive: true });
  }

  constructor(dataPath = "./data/data.db") {
    this.#dataPath = dataPath;
  }

  // async initialize() {
  //   try {
  //     await this.load();
  //   } catch (error) {
  //     console.error("Error Loading DB: ", error);
  //     // this._store = new Map();
  //   }
  // }

  async writeValue(buffer) {
    if (!this.#isInitialized) {
      this.#isInitialized = true;
      await this.#ensureDataDir();
    }

    if (!(buffer instanceof Buffer) || buffer.byteLength > this.#maxDataBytes)
      throw new Error(
        `Invalid data format expect buffer or data exceeded limit max ${this.#maxDataBytes}`,
      );

    const head = Buffer.alloc(4); // 4 Bytes
    head.writeUint32BE(buffer.byteLength, 0);

    let fileHandler;
    try {
      fileHandler = await fs.open(this.#dataPath, "a+");
      const fileStats = await fileHandler.stat();
      const offset = fileStats.size;

      await fileHandler.writev([head, buffer], offset);

      return { offset };
    } catch (err) {
      console.error("Error Writing to file 💥", err);
      return { offset: null, message: err.message || "failed to write data." };
    } finally {
      await fileHandler.close();
    }
  }

  async readValue(offset) {
    let fileHandler;
    try {
      fileHandler = await fs.open(this.#dataPath, "r");
      const stats = await fileHandler.stat();

      if (offset > stats.size) throw new Error("Invalid range");

      const headBuff = Buffer.alloc(4);

      await fileHandler.read({
        buffer: headBuff,
        offset: 0,
        length: headBuff.byteLength,
        position: offset,
      });

      const dataBytes = headBuff.readUint32BE(0);

      const dataBuff = Buffer.alloc(dataBytes);

      await fileHandler.read({
        buffer: dataBuff,
        offset: 0, // start place to write in buffer
        length: dataBuff.byteLength, // number of bytes to read
        position: offset + 4, // start place to read from file
      });

      return { data: dataBuff };
    } catch (err) {
      console.error("Error Reading file 💥", err);
      return {
        data: undefined,
        message: err.message || "Failed to read data.",
      };
    } finally {
      await fileHandler.close();
    }
  }

  async readRange(offsets, concurrency = 20) {
    const results = [];

    for (let i = 0; i < offsets.length; i += concurrency) {
      const chunk = offsets.slice(i, i + concurrency);

      try {
        const data = await Promise.all(
          chunk.map((offset) => this.readValue(offset)),
        );

        const buffers = data.map(({ data }) => data);

        results.push(...buffers);
      } catch (err) {
        console.error("Error Reading file 💥", err);
        return {
          data: undefined,
          message: err.message || "Failed to read data in range",
        };
      }
    }

    return {
      data: results,
    };
  }

  // async flush() {
  //   await this.#ensureDataDir();

  //   const dataObject = Object.fromEntries(this._store);
  //   const dataJson = JSON.stringify(dataObject);

  //   const dbDir = this.#getFileDir();
  //   const tempFilePath = path.resolve(dbDir, this.#tmpFileName);

  //   // write to tmp first
  //   await fs.writeFile(tempFilePath, dataJson, "utf-8");

  //   // rename to override old data (atomic)
  //   await fs.rename(tempFilePath, this.#dataPath);
  // }

  // async load() {
  //   try {
  //     const fileData = await fs.readFile(this.#dataPath, "utf-8");
  //     const parsedData = JSON.parse(fileData);

  //     this._store = new Map(Object.entries(parsedData));
  //   } catch (error) {
  //     if (error.code === "ENOENT") {
  //       // When file not exits
  //       this._store = new Map();
  //       return;
  //     }

  //     throw error;
  //   }
  // }

  async clear() {
    try {
      await fs.unlink(this.#dataPath);
    } catch (error) {
      console.log("ERROR Msg: ", error.message);
      console.log("ERROR: ", error);
    } finally {
      this._store = new Map();
    }
  }
}
