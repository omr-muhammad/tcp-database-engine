import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import LogProtocol from "../protocol/LogProtocol.js";

export default class WAL {
  static #tnxIdCounter = 1;
  static #logFile = "data/wal.log";
  static #div = "-_-#C#O#M#M#I#T#-_-";

  static #getFileDir() {
    const fileIdx = this.#logFile.lastIndexOf("/");

    console.log(this.#logFile.slice(0, fileIdx));
    return this.#logFile.slice(0, fileIdx);
  }

  static async #ensureWriteDir() {
    await fs.mkdir(this.#getFileDir(), { recursive: true });
  }

  constructor(opt, key, value) {
    if (opt === "SET" && !value)
      throw new Error("Missing `value` with opteration require a value.");

    this.write = {
      tnxId: WAL.#tnxIdCounter,
      opt,
      key,
    };

    if (opt === "SET") this.write.value = value;

    WAL.#tnxIdCounter++;
  }

  async writeLog() {
    let fileHandler;
    try {
      await WAL.#ensureWriteDir();
    } catch (err) {
      console.log("Creating Writing log file.");
    }
    try {
      console.debug("Log To Write: ", this.write);

      const { tnxId, opt, key, value } = this.write;
      const buffer = LogProtocol.serialize(tnxId, opt, key, value);

      console.debug("SZ LOG", buffer);

      fileHandler = await fs.open(WAL.#logFile, "a");

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
      await WAL.#ensureWriteDir();

      fileHandler = await fs.open(WAL.#logFile, "a");

      const divBuff = Buffer.from(WAL.#div);

      await fileHandler.appendFile(divBuff);
      await fileHandler.sync();
    } catch (err) {
      console.error("Commit Error: ", err.message || "Failed to commit log.");
      console.error("Error: ", err);
    } finally {
      if (fileHandler) await fileHandler.close();
    }
  }

  static async replay(disk, tree) {
    let fileHandler;
    try {
      await this.#ensureWriteDir();
      fileHandler = await fs.open(this.#logFile, "r+");
      const readStream = fileHandler.createReadStream({ autoClose: false });

      let buff = Buffer.alloc(0);

      // Wrap in Promise to ensure that truncate run after stream events
      await new Promise((resolve, reject) => {
        readStream.on("data", (chunk) => {
          console.log("Reading from stream...");

          buff = Buffer.concat([buff, chunk]);
          const lastCommitIdx = buff.lastIndexOf(this.#div);
          if (lastCommitIdx !== -1)
            buff = buff.subarray(lastCommitIdx + this.#div.length);
        });

        readStream.on("end", async () => {
          try {
            const lastCommitIdx = buff.lastIndexOf(this.#div);
            if (lastCommitIdx !== -1)
              buff = buff.subarray(lastCommitIdx + this.#div.length);

            if (buff.byteLength > 0) {
              const log = LogProtocol.deserialize(buff);
              const { tnxId, opt, key, value } = log;

              if (!tnxId || !opt || !key || (opt === "SET" && !value)) {
                console.warn("Failed to write non-full log.", log);
                resolve();
                return;
              }

              if (opt === "SET") {
                const writeResult = await disk.writeValue(Buffer.from(value));
                if (writeResult.offset === null) {
                  console.error(writeResult.message);
                  resolve();
                  return;
                }
                tree.set(key, writeResult.offset);
              }

              console.log("Successfully replayed a set log operation.");
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        });

        readStream.on("error", reject);
      });
    } catch (err) {
      if (err.code === "ENOENT") {
        console.log(`Cannot open file ${err.path}, file does not exist.`);
      } else if (err.code === "EACCES") {
        console.log(`Cannot access file ${err.path}, permission denied.`);
      } else {
        console.error(
          "Replay Error: ",
          err.message || "Failed to replay logs.",
        );
        console.error(err);
      }
    } finally {
      if (fileHandler) {
        await fileHandler.truncate(0);
        await fileHandler.close();
      }
    }
  }
}
