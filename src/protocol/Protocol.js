import { Buffer } from "node:buffer";

export default class Protocol {
  static #CMDs = {
    SET: 1,
    GET: 2,
    DEL: 3,
    LS: 4,
  };

  static #LIMITS = {
    command: 1, // 1 Bytes
    key: 2, // 2 Bytes
    value: 4, // 4 Bytes
  };

  static #getAllocatedBuffer(key, value) {
    let size = this.#LIMITS.command + this.#LIMITS.key + key.length;

    if (value) size += this.#LIMITS.value + value.length;

    return Buffer.alloc(size);
  }

  static #writeSerializedCmd(buffer, cmd) {
    buffer.writeUint8(this.#CMDs[cmd], 0);

    return this.#LIMITS.command; // the offset
  }

  static #writeSerializedKey(key, buffer, offset) {
    const keyBuff = Buffer.from(key);
    const keyLen = key.length;

    buffer.writeUint16BE(keyLen, offset);
    offset += this.#LIMITS.key;

    keyBuff.copy(buffer, offset);
    offset += keyLen;

    return offset;
  }

  // *************** Public Methods ***************
  static serializeSet(key, value) {
    const valueBuff = Buffer.from(value);
    const valueLen = value.length;

    const buffer = this.#getAllocatedBuffer(key, value);

    // Command must match one of the CMDs properties
    let offset = this.#writeSerializedCmd(buffer, "SET");

    offset = this.#writeSerializedKey(key, buffer, offset);

    buffer.writeUInt32BE(valueLen, offset);
    offset += this.#LIMITS.value;

    valueBuff.copy(buffer, offset);

    return buffer;
  }

  static serializeGet(key) {
    const buffer = this.#getAllocatedBuffer(key);

    let offset = this.#writeSerializedCmd(buffer, "GET");
    this.#writeSerializedKey(key, buffer, offset);

    return buffer;
  }

  static serializeDelete(key) {
    const buffer = this.#getAllocatedBuffer(key);

    let offset = this.#writeSerializedCmd(buffer, "DEL");
    this.#writeSerializedKey(key, buffer, offset);

    return buffer;
  }

  static deserializeRequest(buffer) {
    const payload = {};
    let offset = 0;

    // deserialize command
    const type = buffer.readUint8(0);

    if (type === 1) payload.type = "SET";
    else if (type === 2) payload.type = "GET";
    else if (type === 3) payload.type = "DEL";
    else throw new Error("Error: Unkown type");

    offset += this.#LIMITS.command;

    // Deserialize Key
    const keyBytes = buffer.readUint16BE(offset);

    offset += this.#LIMITS.key; // start reading
    const keyBuf = buffer.subarray(offset, keyBytes + offset);

    payload.key = keyBuf.toString("utf-8");

    offset += keyBytes;

    // Deserialize Value
    if (payload.type !== "SET") return payload;

    const valueBytes = buffer.readUint32BE(offset);
    offset += this.#LIMITS.value;

    const valueBuf = buffer.subarray(offset, valueBytes + offset);

    payload.value = valueBuf.toString("utf-8");

    return payload;
  }
}
