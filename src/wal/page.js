import fs from "node:fs/promises";

const PAGE_SIZE = 1024 * 8; // 8 KB
const PAGE_HEADER_SIZE = 64; // Byte
const MAGIC_NUM = 0xcafebabe;

const LIMITS = {
  lsn: 8,
  pageId: 4,
  magic: 4,
  keysNum: 4,
  reserved: 44,
  keyLen: 2,
  valueLen: 4,
};

/**
 * @param {String} key
 * @returns {Number} Page id
 */
export function getPageId(key) {
  // Simple hash
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 10; // 10 pages
}

/**
 * @param {Number} pageId
 * @returns {{ pageId, pageLSN: 0, data: {}, dirty: false }}
 */
export function createPage(pageId) {
  return {
    pageId,
    pageLSN: 0,
    data: {},
    dirty: false,
  };
}

/**
 * @param {Number} pageId
 * @returns {String} Path where data shoud be stored
 */
export function getPageFilePath(pageId) {
  return `data/page_${pageId}.bin`;
}

/**
 * @param {{ pageId, pageLSN: 0, data: {}, dirty: false }} page - Page object to serialize
 */
export async function save(page) {
  const pageFilePath = getPageFilePath(page.pageId);
  const pageBuf = serializePage(page);

  try {
    await fs.writeFile(pageFilePath, pageBuf);
    console.info("Write Page Successfully.");
  } catch (error) {
    console.log("Error Writing Page to File: ", error.message);
    console.error(error);
  }
}

/**
 *
 * @param {Number} pageId
 * @return {Promise<{ pageId, pageLSN: 0, data: {}, dirty: false }>}
 */
export async function load(pageId) {
  const pageFile = getPageFilePath(pageId);

  try {
    const pageBuf = await fs.readFile(pageFile);
    const page = deserializePage(pageBuf);

    return page;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.info("Page not found, Creating One...");
    } else {
      console.log("Error Loading Page: ", error.message);
      console.error(error);
    }

    return createPage(pageId);
  }
}

// HELPER FUNCTIONS

/**
 * @param {{ pageId, pageLSN: 0, data: {}, dirty: false }} page - Page object to serialize
 * @returns {Buffer} Serialized page in buffer format for disk write
 */
export function serializePage(page) {
  const buffer = Buffer.alloc(PAGE_SIZE);
  let offset = 0;

  // --- Header (64 bytes) ---
  buffer.writeUInt32BE(MAGIC_NUM, offset);
  offset += LIMITS.magic;

  // Page ID (4 bytes)
  buffer.writeUInt32BE(page.pageId, offset);
  offset += LIMITS.pageId;

  // Page LSN (8 bytes)
  buffer.writeBigUInt64BE(BigInt(page.pageLSN), offset);
  offset += LIMITS.lsn;

  // Record count (4 bytes)
  const recordCount = Object.keys(page.data).length;
  buffer.writeUInt32BE(recordCount, offset);
  offset += LIMITS.keysNum;

  // Reserved (44 bytes) for future fields
  offset += LIMITS.reserved;

  // --- Data section 8192 - 64 (8128 bytes) ---
  const dataOffset = PAGE_HEADER_SIZE;
  offset = dataOffset;

  for (const [key, value] of Object.entries(page.data)) {
    const keyBuf = Buffer.from(key, "utf-8");
    buffer.writeUInt16BE(keyBuf.length, offset);
    offset += LIMITS.keyLen;

    // Key string
    keyBuf.copy(buffer, offset);
    offset += keyBuf.length;

    // Value length (4 bytes)
    const valueBuf = Buffer.from(JSON.stringify(value), "utf-8");
    buffer.writeUInt32BE(valueBuf.length, offset);
    offset += LIMITS.valueLen;

    // Value string
    valueBuf.copy(buffer, offset);
    offset += valueBuf.length;

    // Check if we're running out of space
    if (offset > PAGE_SIZE - 100) {
      // Custom Error Object will be used in future for better error handling
      throw new Error(`Page ${page.pageId} is full!`);
    }
  }

  return buffer;
}

/**
 * @param {Buffer} buffer
 * @returns {{ pageId, pageLSN: 0, data: {}, dirty: false }}
 */
export function deserializePage(buffer) {
  let offset = 0;

  // Read header
  const magic = buffer.readUint32BE(offset);
  offset += LIMITS.magic;
  if (magic !== MAGIC_NUM) {
    throw new Error("Invalid page magic number");
  }

  const pageId = buffer.readUInt32BE(offset);
  offset += LIMITS.pageId;

  const pageLSN = Number(buffer.readBigUInt64BE(offset));
  offset += LIMITS.lsn;

  const recordCount = buffer.readUInt32BE(offset);
  offset += LIMITS.keysNum;

  // Skip reserved
  offset += LIMITS.reserved;

  // Read data section
  const data = {};

  for (let i = 0; i < recordCount; i++) {
    // Read key
    const keyLen = buffer.readUInt16BE(offset);
    offset += LIMITS.keyLen;

    const keyBuf = buffer.subarray(offset, offset + keyLen);
    const key = keyBuf.toString("utf-8");
    offset += keyLen;

    // Read value
    const valueLen = buffer.readUInt32BE(offset);
    offset += LIMITS.valueLen;

    const valueBuf = buffer.subarray(offset, offset + valueLen);
    const value = JSON.parse(valueBuf.toString("utf-8"));
    offset += valueLen;

    data[key] = value;
  }

  return {
    pageId,
    pageLSN,
    data,
    dirty: false,
  };
}
