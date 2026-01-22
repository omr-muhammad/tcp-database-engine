import Buffer from "node:buffer";

export default class LogProtocol {
  static #maxKeyLength = 0xffff; // 0xFFFF = 65535
  static #maxValueLength = 0xffffffff; // 0xFFFFFFFF = 4294967295

  static #opTypes = {
    set: 0x01,
    delete: 0x02,
  };

  static #limits = {
    opt: 1,
    key: 2,
    value: 4,
    lengthHead: 4,
    txnId: 8,
  };

  static #addLengthHead(buffer) {
    const headBuff = Buffer.allocUnsafe(this.#limits.lengthHead);
    headBuff.writeUint32BE(buffer.byteLength);

    return Buffer.concat([headBuff, buffer]);
  }

  static #allocBuffer(key, value) {
    let size = this.#limits.opt + this.#limits.key + key.length;

    if (value) size += this.#limits.value + value.length;

    return Buffer.alloc(size);
  }

  static #szTnxId(id, buffer) {
    buffer.writeBigUint64BE(id, 0);

    return this.#limits.txnId; // the offset for next write;
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

  static #szValue(value, buffer, offset) {
    if (!value) throw new Error(`Invalid value type got: ${typeof value}`);

    const valueStr = JSON.stringify(value);

    if (valueStr.length > this.#maxValueLength)
      throw new Error(
        `Error: out of range ${valueStr.length} > ${this.#maxValueLength}`,
      );

    const valueLen = valueStr.length;
    const valueBuff = Buffer.from(valueStr);

    buffer.writeUint32BE(valueLen, offset);

    valueBuff.copy(buffer, offset + this.#limits.value);

    return offset + this.#limits.value + valueLen;
  }

  constructor() {}

  static serialize(txnId, opt, key, value) {
    const buff = this.#allocBuffer(key, value);

    let offset = this.#szTnxId(txnId, buff);
    offset = this.#szOpt(opt, buff, offset);
    offset = this.#szKey(key, buff, offset);

    if (opt === "set") {
      offset = this.#szValue(value, buff, offset);
    }

    return this.#addLengthHead(buff);
  }
}
