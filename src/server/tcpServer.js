import net from "node:net";

import Protocol from "../protocol/Protocol.js";
import DiskStorage from "../storage/DiskStorage.js";

const port = process.env.TCP_PORT;
const host = process.env.HOST;

class TCPServer {
  #server = net.createServer();
  #store = new DiskStorage();
  #pool = new Map();
  #idIncrementer = 1;

  #handleRequest(req) {
    if (req.type === "SET") {
      try {
        this.#store.set(req.key, req.value);
        return {
          status: "ok",
          data: {
            message: `${req.key} successfully set to ${req.value}`,
          },
        };
      } catch (error) {
        if (!error.message) console.log("SET Error: ", error);

        return {
          status: error.message ? "fail" : "error",
          data: {
            message: error.message || "Unkown Error.",
          },
        };
      }
    } else if (req.type === "GET") {
      const value = this.#store.get(req.key);

      return {
        status: "ok",
        data: {
          value,
        },
      };
    } else if (req.type === "DEL") {
      this.#store.delete(req.key);

      return {
        status: "ok",
        data: { message: "Key is successfully deleted." },
      };
    } else {
      return {
        status: "fail",
        data: {
          message: `Invalid action type got ${req.type}`,
        },
      };
    }
  }

  #handleConnections(socket) {
    const clientId = idIncrementer;
    console.log(`New connection with id: ${clientId}`);

    let requestBuff = Buffer.alloc(0);
    let messageSize;
    socket.on("data", (chunk) => {
      requestBuff = Buffer.concat([requestBuff, chunk]);

      if (requestBuff.byteLength > 3) messageSize = requestBuff.readUint32BE(0);

      if (messageSize && requestBuff.byteLength === messageSize) {
        const messageBuff = requestBuff.subarray(4);

        const request = Protocol.deserializeRequest(messageBuff);

        const { status, data } = this.#handleRequest(request);

        const responseBuff = Protocol.serializeResponse(status, data);

        socket.write(responseBuff);
      }
    });

    socket.on("end", () => {
      this.#pool.delete(clientId);
      console.log(`Client with id: ${clientId} left!`);
    });

    socket.on("error", (err) => {
      console.log("Socket Error: ", err);
      socket.end();
    });

    this.#pool.set(clientId, socket);
    this.#idIncrementer++;
  }

  constructor(host = "localhost", port = 5000) {
    this.#server.listen(port, host, () => {
      console.log(`Server is running on ${host}:${port}`);
    });
  }

  start() {
    server.on("connection", this.#handleConnections);
  }

  async shutdown() {
    await this.#store.flush();
    this.#server.close(() => {
      console.log("Server closed successfully.");
    });
  }
}

const server = new TCPServer(host, port);

server.start();
