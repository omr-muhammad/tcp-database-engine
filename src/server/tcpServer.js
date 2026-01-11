import net from "node:net";

import Protocol from "../protocol/Protocol.js";
import DiskStorage from "../storage/DiskStorage.js";

const store = new DiskStorage();

const pool = new Map();
let id = 1;

const server = net.createServer();

const port = process.env.TCP_PORT;
server.listen(port, () => `Server is running on port ${port}`);

server.on("connection", handleConnections);

function handleConnections(socket) {
  const clientId = id;
  console.log(`New connection with id: ${clientId}`);

  let requestBuff = Buffer.alloc(0);
  let messageSize;
  socket.on("data", (chunk) => {
    requestBuff = Buffer.concat([requestBuff, chunk]);

    if (requestBuff.byteLength > 3) messageSize = requestBuff.readUint32BE(0);

    if (messageSize && requestBuff.byteLength === messageSize) {
      const messageBuff = requestBuff.subarray(4);

      const request = Protocol.deserializeRequest(messageBuff);

      const { status, data } = handleRequest(request);

      const responseBuff = Protocol.serializeResponse(status, data);

      socket.write(responseBuff);
    }
  });

  socket.on("end", () => {
    pool.delete(clientId);
    console.log(`Client with id: ${clientId} left!`);
  });

  pool.set(clientId, socket);
  id++;
}

function handleRequest(req) {
  if (req.type === "SET") {
    try {
      store.set(req.key, req.value);
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
    const value = store.get(req.key);

    return {
      status: "ok",
      data: {
        value,
      },
    };
  } else if (req.type === "DEL") {
    store.delete(req.key);

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
