import { Buffer } from "node:buffer";

export default class Protocol {
  static #CMDs = {
    SET: 1,
    GET: 2,
    DEL: 3,
    LS: 4,
  };

  static #BYTES_LIMITS = {
    COMMAND: 1, // 1 Bytes
    KEY: 2, // 2 Bytes
    VALUE: 4, // 4 Bytes
  };

  static serializeSet(key, value) {
    const keyBuff = Buffer.from(key);
    const valueBuff = Buffer.from(value);
    const keyLen = key.length;
    const valueLen = value.length;

    const totalBuffSize =
      this.#BYTES_LIMITS.COMMAND +
      this.#BYTES_LIMITS.KEY +
      keyLen +
      this.#BYTES_LIMITS.VALUE +
      valueLen;

    const buffer = Buffer.alloc(totalBuffSize);
    let offset = 0;

    buffer.writeUint8(this.#CMDs.SET, offset);
    offset += this.#BYTES_LIMITS.COMMAND;

    buffer.writeUint16BE(keyLen, offset);
    offset += this.#BYTES_LIMITS.KEY;

    keyBuff.copy(buffer, offset);
    offset += keyLen;

    buffer.writeUInt32BE(valueLen, offset);
    offset += this.#BYTES_LIMITS.VALUE;

    valueBuff.copy(buffer, offset);
  }
}
