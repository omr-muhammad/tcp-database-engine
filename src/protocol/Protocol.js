import { Buffer } from "node:buffer";

export default class Protocol {
  static #CMDs = {
    SET: 1,
    GET: 2,
    DEL: 3,
    LS: 4,
    RESPONSE_OK: 5,
    RESPONSE_FAIL: 6,
    RESPONSE_ERROR: 7,
  };

  static #allowedResponseStatus = ["ok", "fail", "error"];

  static #limits = {
    command: 1, // 1 Bytes
    key: 2, // 2 Bytes
    value: 4, // 4 Bytes
  };

  static #getAllocatedBuffer(key, value) {
    let size = this.#limits.command + this.#limits.key + key.length;

    if (value) size += this.#limits.value + value.length;

    return Buffer.alloc(size);
  }

  static #writeSerializedCmd(buffer, cmd) {
    buffer.writeUint8(this.#CMDs[cmd], 0);

    return this.#limits.command; // the offset
  }

  static #writeSerializedKey(key, buffer, offset) {
    const keyBuff = Buffer.from(key);
    const keyLen = key.length;

    buffer.writeUint16BE(keyLen, offset);
    offset += this.#limits.key;

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
    offset += this.#limits.value;

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
    const type = buffer.readUint8(offset);

    switch (type) {
      case 1:
        payload.type = "SET";
        break;
      case 2:
        payload.type = "GET";
        break;
      case 3:
        payload.type = "DEL";
        break;
      default:
        throw new Error("Error: Unkown type");
    }

    offset += this.#limits.command;

    // Deserialize Key
    const keyBytes = buffer.readUint16BE(offset);

    offset += this.#limits.key; // start reading
    const keyBuf = buffer.subarray(offset, keyBytes + offset);

    payload.key = keyBuf.toString("utf-8");

    offset += keyBytes;

    // Deserialize Value
    if (payload.type !== "SET") return payload;

    const valueBytes = buffer.readUint32BE(offset);
    offset += this.#limits.value;

    const valueBuf = buffer.subarray(offset, valueBytes + offset);

    payload.value = valueBuf.toString("utf-8");

    return payload;
  }

  static serializeResponse(status, data) {
    if (!status || !this.#allowedResponseStatus.includes(status))
      throw new Error("Error: Status Unkown.");

    const dataString = JSON.stringify(data);
    const dataBuff = Buffer.from(dataString);

    const size = this.#limits.command + this.#limits.value + dataString.length;
    const buffer = Buffer.alloc(size);

    let offset = 0;
    switch (status) {
      case "ok":
        buffer.writeUint8(this.#CMDs.RESPONSE_OK, offset);
        break;
      case "fail":
        buffer.writeUint8(this.#CMDs.RESPONSE_FAIL, offset);
        break;
      case "error":
        buffer.writeUint8(this.#CMDs.RESPONSE_ERROR, offset);
        break;
    }
    offset += this.#limits.command;

    buffer.writeUint32BE(dataString.length, offset);
    offset += this.#limits.value;

    dataBuff.copy(buffer, offset);

    return buffer;
  }

  static deserializeResponse(buffer) {
    const payload = {};
    let offset = 0;
    const status = buffer.readUint8(offset);

    switch (status) {
      case this.#CMDs.RESPONSE_OK:
        payload.status = "success";
        break;
      case this.#CMDs.RESPONSE_FAIL:
        payload.status = "fail";
        break;
      case this.#CMDs.RESPONSE_ERROR:
        payload.status = "error";
        break;
      default:
        throw new Error(`Unkown status type got ${status}`);
    }

    offset += this.#limits.command;
    const dataBytes = buffer.readUint32(offset);
    payload.dataBytes = dataBytes;

    offset += this.#limits.value;

    const dataString = buffer.subarray(offset).toString("utf-8");
    const dataObj = JSON.parse(dataString);
    payload.data = dataObj;

    return payload;
  }
}
