import net from "node:net";
import Protocol from "../protocol/Protocol.js";

class TCPClient {
  #host;
  #port;
  #clientSocket;
  #failedConnections = 0;

  #applyEventListeners() {
    let fullRes = Buffer.alloc(0);
    let messageSize;
    this.#clientSocket.on("data", (buffer) => {
      fullRes = Buffer.concat([fullRes, buffer]);

      // The message has a header with size 4 bytes to define the message length
      if (fullRes.byteLength > 3) messageSize = fullRes.readUint32BE(0);

      if (messageSize && fullRes.byteLength === messageSize + 4) {
        const responseBuff = fullRes.subarray(4);

        try {
          const res = Protocol.deserializeResponse(responseBuff);

          const label = res.data.value ? "Value" : "Message";

          console.log(`Response Status: ${res.status}.`);
          console.log(`${label}: ${res.data[label.toLowerCase()]}`);
        } catch (error) {
          console.log("Error Message: ", error.message);
          console.error("Client Deserialize Error: ", error);
        } finally {
          fullRes = Buffer.alloc(0);
          messageSize = null;
        }
      }
    });

    // Fires after `end` and `error`
    this.#clientSocket.on("close", () => {
      console.log("Connection End!\n");
    });

    this.#clientSocket.on("error", (error) => {
      console.log("Error Msg: ", error.message);
      console.log("Erorr: ", error);

      if (error.code === "ECONNREFUSED") {
        console.error(`Connection refused to ${this.#host}:${this.#port}`);

        this.reconnect();
      }
    });

    // Handling Timeouts
    this.#clientSocket.setTimeout(30000); // wait 30s for receiving chunks
    this.#clientSocket.on("timeout", () => {
      this.disconnect(); // leave server

      this.reconnect();
    });

    // Handle Ctrl+C without showing ABORT_ERR trace
    process.on("SIGINT", () => {
      this.#clientSocket.end();
    });
  }

  #sendRequest(action, key, value) {
    try {
      let reqBuff;
      if (action === "get") reqBuff = Protocol.serializeGet(key);
      else if (action === "set") reqBuff = Protocol.serializeSet(key, value);
      else if (action === "del") reqBuff = Protocol.serializeDelete(key);
      else if (action === "ls") reqBuff = Protocol.serializeList();
      else if (action === "range")
        reqBuff = Protocol.serializeRange(key.start, key.end);
      else throw new Error(`Invalid action type: ${action}.`);

      this.#clientSocket.write(reqBuff);
    } catch (error) {
      console.log("Error Message: ", error.message);
      console.log("Error: ", error);
    }
  }

  constructor(host, port) {
    this.#host = host;
    this.#port = port;
  }

  connect() {
    this.#clientSocket = net.connect(
      { host: this.#host, port: this.#port },
      () => {
        console.log(`Connected to ${this.#host}:${this.#port}`);
      },
    );

    this.#applyEventListeners();
  }

  disconnect() {
    this.#clientSocket.end();
    console.log("Disconnected.\n");
  }

  reconnect() {
    this.#failedConnections++;

    if (this.#failedConnections >= 3) {
      console.log("Reconnecting...");
      setTimeout(() => {
        this.connect();
      }, 3000);
    }
  }

  set(key, value) {
    this.#sendRequest("set", key, value);
  }

  get(key) {
    this.#sendRequest("get", key);
  }

  delete(key) {
    this.#sendRequest("del", key);
  }

  list() {
    this.#sendRequest("ls");
  }

  range(startKey, endKey) {
    this.#sendRequest("range", { start: startKey, end: endKey });
  }
}
