import Buffer from "node:buffer";
import fs from "node:fs/promises";
import LogProtocol from "../protocol/LogProtocol.js";

export default class WAL {
  #tnxIdCounter = 1;
  #logFile = "data/wal.log";
  #div = "--COMMIT--";

  constructor(opt, key, value) {
    this.write = {
      tnxId: this.#tnxIdCounter,
      opt,
      key,
    };

    if (opt === "SET") {
      if (!value)
        throw new Error("Missing `value` with opteration require a value.");

      this.write.value = value;
    }

    this.#tnxIdCounter++;
  }

  async write() {
    let fileHandler;
    try {
      const { tnxId, opt, key, value } = this.write;
      const buffer = LogProtocol.serialize(tnxId, opt, key, value);

      fileHandler = await fs.open(this.#logFile, "a");

      await fileHandler.appendFile(this.#logFile, buffer);

      // Ensure data written to disk
      await fileHandler.sync();
    } catch (err) {
      console.error("Append Error: ", err.message || "Failed to append log.");
      console.error("Error: ", err);
    } finally {
      if (fileHandler) await fileHandler.close();
    }
  }

  async commit() {
    let fileHandler;
    try {
      fileHandler = await fs.open(this.#logFile, "a");

      const divBuff = Buffer.from(this.#div);

      await fileHandler.appendFile(this.#logFile, divBuff);
      await fileHandler.sync();
    } catch (err) {
      console.error("Commit Error: ", err.message || "Failed to commit log.");
      console.error("Error: ", err);
    } finally {
      if (fileHandler) await fileHandler.close();
    }
  }
}
