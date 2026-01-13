import net from "node:net";
import Protocol from "../protocol/Protocol";

class TCPClient {
  #host;
  #port;
  #clientSocket;

  #applyEventListeners() {
    const fullRes = Buffer.alloc(0);
    let messageSize;
    this.#clientSocket.on("data", (buffer) => {
      fullRes = Buffer.concat([fullRes, buffer]);

      // The message has a header with size 4 bytes to define the message length
      if (fullRes.byteLength > 3) messageSize = fullRes.readUint32BE(0);

      if (messageSize && fullRes.byteLength === messageSize + 4) {
        const responseBuff = fullRes.subarray(4);

        const res = Protocol.deserializeResponse(responseBuff);

        const label = res.data.value ? "Value" : "Message";

        console.log(`Response Status: ${res.status}.`);
        console.log(`${label}: ${res.data[label.toLowerCase()]}`);

        fullRes = Buffer.alloc(0);
      }
    });

    // Fires after `end` and `error`
    this.#clientSocket.on("close", () => {
      console.log("Connection End!\n");
    });

    this.#clientSocket.on("error", (error) => {
      console.log("Error Msg: ", error.message);
      console.log("Erorr: ", error);
    });

    // Handle Ctrl+C without showing ABORT_ERR trace
    process.on("SIGINT", () => {
      this.#clientSocket.end();
    });
  }

  constructor(host, port) {
    this.#host = host;
    this.#port = port;
  }

  connect() {
    this.#clientSocket = net.connect({ host: this.#host, port: this.#port });

    this.#applyEventListeners();
  }

  disconnect() {
    this.#clientSocket.end();
  }
}
