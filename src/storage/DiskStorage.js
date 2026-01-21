import fs from "node:fs/promises";
import MemoryStore from "./MemoryStore.js";
import path from "node:path";

export default class DiskStore extends MemoryStore {
  #filePath;
  #tmpFileName = "tempDB.json";

  constructor(filePath = "./data/db.json") {
    super();
    this.#filePath = filePath;

    // Auto load store when start
    this.load();
  }

  #getFileDir() {
    const fileIdx = this.#filePath.lastIndexOf("/");

    return this.#filePath.slice(0, fileIdx);
  }

  async #ensureDataDir() {
    await fs.mkdir("data", { recursive: true });
  }

  async flush() {
    await this.#ensureDataDir();

    const dataObject = Object.fromEntries(this._store);
    const dataJson = JSON.stringify(dataObject);

    const dbDir = this.#getFileDir();
    const tempFilePath = path.resolve(dbDir, this.#tmpFileName);

    // write to tmp first
    await fs.writeFile(tempFilePath, dataJson, "utf-8");

    // rename to override old data (atomic)
    await fs.rename(tempFilePath, this.#filePath);
  }

  async load() {
    try {
      const fileData = await fs.readFile(this.#filePath, "utf-8");
      const parsedData = JSON.parse(fileData);

      this._store = new Map(Object.entries(parsedData));
    } catch (error) {
      if (error.code === "ENOENT") {
        // When file not exits
        this._store = new Map();
        return;
      }

      throw error;
    }
  }

  async clear() {
    try {
      await fs.unlink(this.#filePath);
    } catch (error) {
      console.log("ERROR Msg: ", error.message);
      console.log("ERROR: ", error);
    } finally {
      this._store = new Map();
    }
  }
}
