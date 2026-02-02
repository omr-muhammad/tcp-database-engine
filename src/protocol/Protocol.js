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
    RANGE: 8,
  };

  static #allowedResponseStatus = ["ok", "fail", "error"];

  static #maxKeyLength = 0xffff; // 0xFFFF = 65535
  static #maxValueLength = 0xffffffff; // 0xFFFFFFFF = 4294967295

  // In Bytes
  static #limits = {
    lengthHead: 4,
    command: 1,
    key: 2,
    value: 4,
  };

  static #addLengthHead(buffer) {
    const headBuff = Buffer.allocUnsafe(this.#limits.lengthHead);
    headBuff.writeUint32BE(buffer.byteLength);

    return Buffer.concat([headBuff, buffer]);
  }

  static #getAllocatedBuffer(key, value) {
    let size = this.#limits.command + this.#limits.key;

    if (typeof key === "object") {
      if (key.start && key.end)
        size += key.start.length + this.#limits.key + key.end.length;
      else throw new Error("Missing range key values.");
    } else size += key.length;

    if (value) size += this.#limits.value + value.length;

    return Buffer.alloc(size);
  }

  static #writeSerializedCmd(buffer, cmd) {
    if (!this.#CMDs[cmd])
      throw new Error(
        `Unkonw command got: ${cmd} use: ${Object.keys(this.#CMDs).join(" - ")}`,
      );

    buffer.writeUint8(this.#CMDs[cmd], 0);

    return this.#limits.command; // the offset
  }

  static #writeSerializedKey(key, buffer, offset) {
    if (key.length > this.#maxKeyLength)
      throw new Error(
        `Error: out of range ${key.length} > ${this.#maxKeyLength}`,
      );

    const keyBuff = Buffer.from(key);
    const keyLen = key.length;

    buffer.writeUint16BE(keyLen, offset);
    offset += this.#limits.key;

    keyBuff.copy(buffer, offset);
    offset += keyLen;

    return offset;
  }

  static #writeSerializedValue(valueStr, buffer, offset) {
    if (!valueStr || typeof valueStr !== "string")
      throw new Error(`Invalid value type got: ${typeof value}`);

    if (valueStr.length > this.#maxValueLength)
      throw new Error(
        `Error: out of range ${valueStr.length} > ${this.#maxValueLength}`,
      );

    const valueBuff = Buffer.from(valueStr);
    const valueLen = valueStr.length;

    buffer.writeUint32BE(valueLen, offset);
    offset += this.#limits.value;

    valueBuff.copy(buffer, offset);
    offset += valueLen;

    return offset;
  }

  // *************** Public Methods ***************
  static serializeSet(key, value) {
    const valueStr = JSON.stringify(value);
    const buffer = this.#getAllocatedBuffer(key, valueStr);

    // Command must match one of the CMDs properties
    let offset = this.#writeSerializedCmd(buffer, "SET");

    offset = this.#writeSerializedKey(key, buffer, offset);
    offset = this.#writeSerializedValue(valueStr, buffer, offset);

    return this.#addLengthHead(buffer);
  }

  static serializeGet(key) {
    const buffer = this.#getAllocatedBuffer(key);

    let offset = this.#writeSerializedCmd(buffer, "GET");
    this.#writeSerializedKey(key, buffer, offset);

    return this.#addLengthHead(buffer);
  }

  static serializeDelete(key) {
    const buffer = this.#getAllocatedBuffer(key);

    let offset = this.#writeSerializedCmd(buffer, "DEL");
    this.#writeSerializedKey(key, buffer, offset);

    return this.#addLengthHead(buffer);
  }

  static serializeList() {
    const buffer = Buffer.alloc(this.#limits.lengthHead + this.#limits.command);

    let offset = 0;
    buffer.writeUint32BE(this.#limits.command, offset);
    offset += this.#limits.lengthHead;

    buffer.writeUint8(this.#CMDs.LS, offset);

    return buffer;
  }

  static serializeRange(startKey, endKey) {
    const buffer = this.#getAllocatedBuffer({ start: startKey, end: endKey });

    let offset = 0;

    offset = this.#writeSerializedCmd(buffer, "RANGE");
    offset = this.#writeSerializedKey(startKey, buffer, offset);
    offset = this.#writeSerializedKey(endKey, buffer, offset);

    return this.#addLengthHead(buffer);
  }

  static deserializeRequest(buffer) {
    const payload = {};
    let offset = 0;

    // deserialize command
    const type = buffer.readUint8(offset);

    if (type === this.#CMDs.SET) payload.type = "SET";
    else if (type === this.#CMDs.GET) payload.type = "GET";
    else if (type === this.#CMDs.DEL) payload.type = "DEL";
    else if (type === this.#CMDs.LS) {
      payload.type = "LS";
      return payload;
    } else if (type === this.#CMDs.RANGE) payload.type = "RANGE";
    else
      throw new Error(
        `Deserialize Error: Unkown command type got ${type}. expect ${Object.keys(this.#CMDs).join(" - ")}`,
      );

    offset += this.#limits.command;

    // Deserialize Key
    const keyBytes = buffer.readUint16BE(offset);

    offset += this.#limits.key; // start reading
    const keyBuf = buffer.subarray(offset, keyBytes + offset);

    payload.key = keyBuf.toString("utf-8");

    offset += keyBytes;

    // Deserialize Value
    if (payload.type === "RANGE") {
      const endKeyBytes = buffer.readUint16BE(offset);

      offset += this.#limits.key;
      const endKeyBuf = buffer.subarray(offset, endKeyBytes + offset);

      payload.endKey = endKeyBuf.toString("utf-8");
    } else if (payload.type === "SET") {
      const valueBytes = buffer.readUint32BE(offset);
      offset += this.#limits.value;

      const valueBuf = buffer.subarray(offset, valueBytes + offset);

      payload.valueBuf = valueBuf;
    }

    return payload;
  }

  static serializeResponse(status, result) {
    if (!status || !this.#allowedResponseStatus.includes(status))
      throw new Error("Error: Status Unkown.");

    if (!result) throw new Error("Response must contain the server result.");

    const resString = JSON.stringify(result);
    const resBuff = Buffer.from(resString);

    const size = this.#limits.command + this.#limits.value + resString.length;
    const buffer = Buffer.alloc(size);

    let offset = 0;

    if (status === "ok") buffer.writeUint8(this.#CMDs.RESPONSE_OK, offset);
    else if (status === "fail")
      buffer.writeUint8(this.#CMDs.RESPONSE_FAIL, offset);
    else if (status === "error")
      buffer.writeUint8(this.#CMDs.RESPONSE_ERROR, offset);

    offset += this.#limits.command;

    buffer.writeUint32BE(resString.length, offset);
    offset += this.#limits.value;

    resBuff.copy(buffer, offset);

    return this.#addLengthHead(buffer);
  }

  // the head is subtracted from buffer before passing to function
  static deserializeResponse(buffer) {
    const payload = {};
    let offset = 0;
    const status = buffer.readUint8(offset);

    if (status === this.#CMDs.RESPONSE_OK) payload.status = "ok";
    else if (status === this.#CMDs.RESPONSE_FAIL) payload.status = "fail";
    else if (status === this.#CMDs.RESPONSE_ERROR) payload.status = "error";
    else throw new Error(`Unkown status type got ${status}`);

    offset += this.#limits.command;
    const dataBytes = buffer.readUint32BE(offset);

    offset += this.#limits.value;

    const strData = buffer
      .subarray(offset, dataBytes + offset)
      .toString("utf-8");

    console.log("Data: ", strData);

    const data = JSON.parse(strData);
    payload.result = data;

    return payload;
  }
}
