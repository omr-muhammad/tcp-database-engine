import net from "node:net";

class TCPClient {
  #host;
  #port;

  constructor(host, port) {
    this.#host = host;
    this.#port = port;
  }
}
