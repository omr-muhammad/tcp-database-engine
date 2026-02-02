import net from "node:net";
import { Buffer } from "node:buffer";

import Protocol from "../protocol/Protocol.js";
import DiskStore from "../storage/DiskStorage.js";
import MemoryStore from "../storage/MemoryStore.js";
import WAL from "../wal/WAL.js";

// const port = process.env.TCP_PORT;
// const host = process.env.HOST;

export default class TCPServer {
  #server = net.createServer();
  #disk = new DiskStore();
  #store;
  #host = "0.0.0.0";
  #port = 8000;
  #connections = new Map();
  #globalWriteLock = false;
  #idIncrementer = 1;

  async #acquireGlobalWriteLock() {
    while (true) {
      if (!this.#globalWriteLock) {
        this.#globalWriteLock = true;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }

  #releaseGlobalWriteLock() {
    this.#globalWriteLock = false;
  }

  async #handleRequest(req) {
    if (req.type === "SET") {
      const log = new WAL("SET", req.key, req.valueBuf);

      try {
        await this.#acquireGlobalWriteLock();

        await log.writeLog();

        const writeResult = await this.#disk.writeValue(req.valueBuf);

        console.log("Disk write result: ", writeResult);

        if (writeResult.offset === null)
          return {
            status: "fail",
            result: writeResult.message,
          };

        this.#store.set(req.key, writeResult.offset);

        console.log("key offset: ", this.#store.get(req.key));

        return {
          status: "ok",
          result: `${req.key} successfully set.`,
        };
      } catch (error) {
        if (!error.message) console.log("SET Error: ", error);

        return {
          status: error.message ? "fail" : "error",
          result: error.message || "Unkown Error.",
        };
      } finally {
        // Commit both succeed and fail to not be used in replay
        await log.commit();
        this.#releaseGlobalWriteLock();
      }
    } else if (req.type === "GET") {
      const offset = this.#store.get(req.key);

      if (typeof offset !== "number" || offset < 0)
        return {
          status: "ok",
          result: `Key does not exist.`,
        };

      const readResult = await this.#disk.readValue(offset);

      if (!readResult.data)
        return {
          status: "fail",
          result: readResult.message,
        };

      const dataStr = readResult.data.toString("utf-8");

      return {
        status: "ok",
        result: JSON.parse(dataStr),
      };
    } else if (req.type === "DEL") {
      const log = new WAL("DEL", req.key);

      await log.writeLog();

      this.#store.delete(req.key);

      await log.commit();

      return {
        status: "ok",
        result: "Key is successfully deleted.",
      };
    } else if (req.type === "LS") {
      return {
        status: "ok",
        result: this.#store.keys(),
      };
    } else if (req.type === "RANGE") {
      const offsets = this.#store.range(req.key, req.endKey);

      const rangeResult = await this.#disk.readRange(offsets);

      if (!rangeResult.data)
        return {
          status: "fail",
          result: rangeResult.message,
        };

      const values = rangeResult.data.map((buff) =>
        JSON.parse(buff.toString("utf-8")),
      );

      return {
        status: "ok",
        result: values,
      };
    } else {
      return {
        status: "fail",
        result: `Invalid action type got ${req.type}`,
      };
    }
  }

  #handleConnections(socket) {
    // Stop accepting new connections when limit reached.
    if (this.#connections.size >= this.maxConnections) {
      console.warn("Limit reached.");

      try {
        const removeResponse = Protocol.serializeResponse("error", {
          message: "ERR max connections reached\n",
        });

        return socket.end(removeResponse);
      } catch (error) {
        console.log("Error Message: ", error.message);
        console.log("Error: ", error);
      }
    }

    const clientId = this.#idIncrementer;
    console.log(`New connection with id: ${clientId}`);

    let requestBuff = Buffer.alloc(0);
    let messageSize;
    socket.on("data", async (chunk) => {
      try {
        requestBuff = Buffer.concat([requestBuff, chunk]);

        if (requestBuff.byteLength > 3)
          messageSize = requestBuff.readUint32BE(0);

        // Add 4 for header buffer
        if (messageSize && requestBuff.byteLength >= messageSize + 4) {
          const messageBuff = requestBuff.subarray(4, messageSize + 4);

          const request = Protocol.deserializeRequest(messageBuff);

          console.log("Deserialized request: ", request);

          const { status, result } = await this.#handleRequest(request);

          const responseBuff = Protocol.serializeResponse(status, result);

          socket.write(responseBuff);
          const activeClient = this.#connections.get(clientId);

          if (activeClient) activeClient.lastActiveTime = new Date();

          requestBuff = Buffer.alloc(0);
          messageSize = null;
        }
      } catch (error) {
        console.error("Request Processing Error: ", error);

        try {
          const errorResponse = Protocol.serializeResponse("error", {
            message: error.message
              ? error.message + "\n"
              : "Internal server error!",
          });

          socket.write(errorResponse);
        } catch (serializeError) {
          console.error("Failed to send error response:", serializeError);
        }

        requestBuff = Buffer.alloc(0);
        messageSize = null;
      }
    });

    socket.on("end", () => {
      this.#connections.delete(clientId);
      console.log(`Client with id: ${clientId} left!`);
    });

    socket.on("error", (err) => {
      console.log("Socket Error: ", err);
    });

    // Handling Timeouts
    socket.setTimeout(30000); // wait 30s for receiving chunks
    socket.on("timeout", () => {
      socket.end(); // kick from server
      this.#connections.delete(clientId);
    });

    this.#connections.set(clientId, { socket, lastActiveTime: new Date() });
    this.#idIncrementer++;
  }

  #reduceConnectionSize(newLimit) {
    if (newLimit >= this.#connections.size) return;

    const toClose = newLimit - this.#connections.size;
    const connectionsArr = Array.from(this.#connections.entries());

    // Sort by last activity time (oldest first)
    connectionsArr.sort((a, b) => a[1].lastActiveTime - b[1].lastActiveTime);

    for (let i = 0; i < toClose; ++i) {
      const [id, client] = connectionsArr[i];

      const removeResponse = Protocol.serializeResponse("error", {
        message: "ERR max connections reached\n",
      });

      client.socket.end(removeResponse);

      this.#connections.delete(id);
    }
  }

  constructor(host = "localhost", port = 8000, maxConnections = 5000) {
    this.#host = host;
    this.#port = port;
    this.maxConnections = maxConnections;
  }

  async start() {
    this.#store = await MemoryStore.create();

    await WAL.replay(this.#disk, this.#store);

    this.#server.listen(this.#port, this.#host, () => {
      console.log(`Server is running on ${this.#host}:${this.#port}`);
    });

    this.#server.on("connection", this.#handleConnections.bind(this));
  }

  async shutdown() {
    await this.#store.writeBTree();
    this.#server.close(() => {
      console.log("Server closed successfully.");
    });
  }

  setMaxConnections(newLimit) {
    if (newLimit === this.maxConnections) {
      console.info(`Max connection is already set to ${newLimit}`);
      return;
    }

    if (newLimit < 1) throw new Error("Max connections must be positive");

    if (newLimit < this.#connections.size) {
      console.warn(
        `Warning new limit value: ${newLimit} is less than current ${
          this.#connections.size
        } clients`,
      );
      // Handle asking to perform later

      this.#reduceConnectionSize(newLimit);
    }

    this.maxConnections = newLimit;
    console.log(`Max connections updated to ${newLimit}`);
  }
}
