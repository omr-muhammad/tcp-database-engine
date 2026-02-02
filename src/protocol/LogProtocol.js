import { Buffer } from "node:buffer";

export default class LogProtocol {
  static #maxKeyLength = 0xffff; // 0xFFFF = 65535
  static #maxValueLength = 0xffffffff; // 0xFFFFFFFF = 4294967295

  static #opTypes = {
    SET: 0x01,
    DEL: 0x02,
  };

  static #limits = {
    opt: 1,
    key: 2,
    value: 4,
    txnId: 4,
  };

  // value is buffer type
  static #allocBuffer(key, value) {
    let size = this.#limits.opt + this.#limits.key + key.length;

    if (value) size += this.#limits.value + value.byteLength;

    return Buffer.alloc(size);
  }

  /**
   *
   * @param {*} id
   * @param {Buffer} buffer
   * @param {*} offset
   * @returns
   */
  static #szTnxId(id, buffer, offset) {
    buffer.writeUint32BE(id, offset);

    return offset + this.#limits.txnId; // the offset for next write;
  }

  static #szOpt(opt, buffer, offset) {
    if (!this.#opTypes[opt])
      throw new Error(
        `Unkonw command got: ${opt} use: ${Object.keys(this.#opTypes).join(" - ")}`,
      );

    buffer.writeUint8(this.#opTypes[opt], offset);

    return offset + this.#limits.opt;
  }

  static #szKey(key, buffer, offset) {
    if (key.length > this.#maxKeyLength)
      throw new Error(
        `Error: out of range ${key.length} > ${this.#maxKeyLength}`,
      );

    const keyLen = key.length;
    const keyBuff = Buffer.from(key);

    buffer.writeUint16BE(keyLen, offset);

    keyBuff.copy(buffer, offset + this.#limits.key);

    return offset + this.#limits.key + keyLen;
  }

  // static #szValue(value, buffer, offset) {
  //   if (!value) throw new Error(`Invalid value type got: ${typeof value}`);

  //   const valueStr = JSON.stringify(value);

  //   if (valueStr.length > this.#maxValueLength)
  //     throw new Error(
  //       `Error: out of range ${valueStr.length} > ${this.#maxValueLength}`,
  //     );

  //   const valueLen = valueStr.length;
  //   const valueBuff = Buffer.from(valueStr);

  //   buffer.writeUint32BE(valueLen, offset);

  //   valueBuff.copy(buffer, offset + this.#limits.value);

  //   return offset + this.#limits.value + valueLen;
  // }

  // constructor() {}

  static serialize(txnId, opt, key, valueBuf) {
    const buff = this.#allocBuffer(key, valueBuf);

    let offset = 0;

    offset = this.#szTnxId(txnId, buff, offset);
    offset = this.#szOpt(opt, buff, offset);
    offset = this.#szKey(key, buff, offset);

    if (opt === "SET") valueBuf.copy(buff, offset);

    return buff;
  }

  static deserialize(buffer) {
    let offset = 0;

    const log = {};

    log.txnId = buffer.readUint32BE(0);
    offset += this.#limits.txnId;

    const opt = buffer.readUint8(offset);

    const validOpts = Object.values(this.#opTypes);

    if (!validOpts.includes(opt))
      throw new Error(
        `Invalid operation type. Expected ${Object.keys(this.#opTypes).join(" - ")}`,
      );

    log.opt = opt === 1 ? "SET" : "DEL";

    offset += this.#limits.opt;

    const keyLen = buffer.readUint16BE(offset);
    offset += this.#limits.key;

    log.key = buffer.subarray(offset, keyLen + offset).toString("utf-8");
    offset += keyLen;

    if (opt === 1) {
      const valueLen = buffer.readUint32BE(offset);
      offset += this.#limits.value;

      // Since serialization will run on replay() to ensure successfull writes
      // No need to parse the value data since it will be written to a buffer as string again;
      log.value = buffer.subarray(offset, valueLen + offset).toString("utf-8");
      offset += valueLen;
    }

    return log;
  }
}
