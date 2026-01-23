import Buffer from "node:buffer";
import fs from "node:fs/promises";
import LogProtocol from "../protocol/LogProtocol.js";

export default class WAL {
  static #tnxIdCounter = 1;
  #logFile = "data/wal.log";
  #div = "-_-#C#O#M#M#I#T#-_-";

  constructor(opt, key, value) {
    this.write = {
      tnxId: WAL.#tnxIdCounter,
      opt,
      key,
    };

    if (opt === "SET") {
      if (!value)
        throw new Error("Missing `value` with opteration require a value.");

      this.write.value = value;
    }

    WAL.#tnxIdCounter++;
  }

  async write() {
    let fileHandler;
    try {
      const { tnxId, opt, key, value } = this.write;
      const buffer = LogProtocol.serialize(tnxId, opt, key, value);

      fileHandler = await fs.open(this.#logFile, "a");

      await fileHandler.appendFile(buffer);

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

      await fileHandler.appendFile(divBuff);
      await fileHandler.sync();
    } catch (err) {
      console.error("Commit Error: ", err.message || "Failed to commit log.");
      console.error("Error: ", err);
    } finally {
      if (fileHandler) await fileHandler.close();
    }
  }

  async replay(disk, tree) {
    let fileHandler;

    try {
      fileHandler = await fs.open(this.#logFile, "r");
      const readStream = fileHandler.createReadStream();

      let buff = Buffer.alloc(0);
      readStream.on("data", (chunk) => {
        buff = Buffer.concat([buff, chunk]);

        const lastCommitIdx = buff.lastIndexOf(this.#div);

        if (lastCommitIdx !== -1)
          buff = buff.subarray(lastCommitIdx + this.#div.length);
      });

      // Wait until read end and replay uncommitted logs
      readStream.on("end", async () => {
        const lastCommitIdx = buff.lastIndexOf(this.#div);

        if (lastCommitIdx !== -1)
          buff = buff.subarray(lastCommitIdx + this.#div.length);

        if (buff.byteLength > 0) {
          const log = LogProtocol.deserialize(buff);

          const { tnxId, opt, key, value } = log;

          if (!tnxId || !opt || !key || (opt === "SET" && !value)) {
            console.warn("Failed to write non-full log.", log);
            return;
          }

          if (opt === "SET") {
            const writeResult = await disk.writeValue(Buffer.from(value));

            if (writeResult.offset === null) {
              console.error(writeResult.message);
              return;
            }

            tree.set(key, writeResult.offset);
          }

          console.log("Successfully replayed a set log operation.");
        }
      });
    } catch (err) {
      console.error("Replay Error: ", err.message || "Failed to replay logs.");
      console.error("Error: ", err);
    } finally {
      if (fileHandler) {
        // Empty the log file after replay
        await fileHandler.truncate(0);
        await fileHandler.close();
      }
    }
  }
}
