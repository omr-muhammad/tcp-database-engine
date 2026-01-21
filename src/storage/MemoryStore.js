export default class MemoryStore {
  constructor() {
    this._store = new Map();
  }

  #isJsonSerializable(data) {
    return JSON.stringify(data) ? true : false;
  }

  set(key, value) {
    if (!key || typeof key !== "string")
      throw new Error(`Invalid key type: Expected string, got ${typeof key}`);

    // Validate `value` JSON serializable
    if (!this.#isJsonSerializable(value))
      throw new Error(
        `Invalid value type, ${typeof value} is not JSON serializable.`
      );

    this._store.set(key, value);
  }

  get(key) {
    return this._store.get(key);
  }

  delete(key) {
    if (this.has(key)) this._store.delete(key);
  }

  has(key) {
    return this._store.has(key);
  }

  size() {
    return this._store.size;
  }

  keys() {
    return Array.from(this._store.keys());
  }
}
