import net from "node:net";

class TCPClient {
  #host;
  #port;
  #clientSocket;

  constructor(host, port) {
    this.#host = host;
    this.#port = port;
  }

  connect() {
    this.#clientSocket = net.connect({ host: this.#host, port: this.#port });
  }

  disconnect() {
    this.#clientSocket.end();
  }
}
