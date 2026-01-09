export default class MemoryStore {
  #store = new Map();

  // Database will be loaded here while initiating the engine
  constructor() {}

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

    this.#store.set(key, value);
  }
}
