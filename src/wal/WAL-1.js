import { Buffer } from "node:buffer";
import fs from "node:fs/promises";

import crc from "crc";

const opType = {
  BEGIN: 1,
  COMMIT: 2,
  ABORT: 3,
  UPDATE: 4,
  INSERT: 5,
  DELETE: 6,
};

const sizes = {
  lsn: 8,
  type: 1,
  txId: 8,
  pageId: 4,
  payloadLen: 4,
  checksum: 4,
  valueLen: 4,
  recordIdLen: 2,
};

const markerRecs = ["BEGIN", "COMMIT", "ABORT"];

async function initWAL(filePath) {
  const headerBuf = getHeaderBuf();

  let fd;
  try {
    fd = await fs.open(filePath, "w");
    await fd.write(fd, headerBuf);

    // ensure write to disk
    await fd.sync();
  } catch (error) {
    console.error("initWAL error: ", error.message);
    console.error(error);
  } finally {
    if (fd) await fd.close();
  }
}

/**
 *
 * @param {{
 *  lsn: BigInt, type: string, txId: string, prevLSN: BigInt, pageId: number, recordId: string }} record -
 * @returns {Buffer};
 */
function encodeMarkerRecord(record) {
  const headerSize = calcHeader();
  const headerBuf = bufferHeader(record, headerSize, 0);
  const checksumOffset = headerSize - sizes.checksum;

  headerBuf.writeUint32BE(0, checksumOffset);

  return headerBuf;
}

/**
 *
 * @param {{
 *  lsn: BigInt, type: string, txId: string, prevLSN: BigInt, pageId: number, recordId: string, oldValue: object, newValue: object }} record -
 * @returns {Buffer};
 */
function encodeLogRecord(record) {
  // markerRecs => BEGIN, COMMIT, ABORT
  if (markerRecs.includes(record.type)) return encodeLogRecord(record);

  const recIdBuf = Buffer.from(record.recordId);
  const oldValueBuf = Buffer.from(JSON.stringify(record.oldValue));
  const newValueBuf = Buffer.from(JSON.stringify(record.newValue));

  // 10 = 2(id length) + 8(old&new value lengths)
  const payloadSize =
    recIdBuf.length + oldValueBuf.length + newValueBuf.length + 10;
  const headerSize = calcHeader();

  // Last 4 bytes wasn't written (filled with zeros)
  const headerBuf = bufferHeader(record, headerSize, payloadSize);
  const payloadBuf = bufferPayload(
    payloadSize,
    recIdBuf,
    oldValueBuf,
    newValueBuf,
  );

  const checksum = getCRC32(headerBuf, payloadBuf);

  // write checksum to header
  const checksumOffset = headerSize - sizes.checksum;
  headerBuf.writeUint32BE(checksum, checksumOffset);

  const encodedRecord = Buffer.concat([headerBuf, payloadBuf]);

  return encodedRecord;
}

/**
 *
 * @param {Buffer} encodedRecord
 */
function decodeLogRecord(encodedRecord) {
  try {
    const headerSize = calcHeader();
    const payloadSizeOffset = headerSize - sizes.checksum - sizes.payloadLen;
    const checksumOffset = headerSize - sizes.checksum;

    const record = {};
    const headerBuf = encodedRecord.subarray(0, headerSize);
    decodeHeader(record, headerBuf);

    // markerRecs => BEGIN, COMMIT, ABORT
    if (markerRecs.includes(record.type)) return record;

    const payloadSize = encodedRecord.readUint32BE(payloadSizeOffset);
    const checksum = encodedRecord.readUint32BE(checksumOffset);

    // replace checksum with zeros after extracting it
    encodedRecord.writeUint32BE(0, checksumOffset);

    const curChecksum = getCRC32(encodedRecord);

    if (curChecksum !== checksum) throw new Error("Corrupted record.");

    const payloadBuf = encodedRecord.subarray(headerSize);

    if (payloadBuf.length !== payloadSize)
      throw new Error("Corrupted payload.");

    decodeHeader(record, headerBuf);
    decodePayload(record, payloadBuf);

    return record;
  } catch (error) {
    console.debug("Decode Error: ", error.message);
    console.error(error);
    process.exit(1);
  }
}

async function appendToWAL(filePath, record) {
  const recBuf = encodeLogRecord(record);

  let fd;
  try {
    fd = await fs.open(filePath, "a");
    const stats = await fd.stat();

    const lsn = stats.size;

    await fd.appendFile(recBuf);

    return lsn;
  } catch (error) {
    console.debug("Appending to Wal file Error: ", error.message);
    console.error(error);
  } finally {
    if (fd) await fd.close();
  }
}

// HELPER FUNCTIONS /////////////////////////////////////////////////////////////////////////////////
////////////////////// HELPER FUNCTIONS /////////////////////////////////////////////////////////////
////////////////////////////////////////// HELPER FUNCTIONS /////////////////////////////////////////
///////////////////////////////////////////////////////////// HELPER FUNCTIONS //////////////////////
///////////////////////////////////////////////////////////////////////////////// HELPER FUNCTIONS //
function getHeaderBuf(size = 256, lsnStart = 1) {
  const headerBuf = Buffer.alloc(size);
  let offset = 0;

  // magic number;
  headerBuf.writeUint32BE(0xdeadbeef, offset);
  offset += 4;

  // version number;
  headerBuf.writeUint32BE(2, offset);
  offset += 4;

  // block size 8KB
  headerBuf.writeUint32BE(8192, offset);
  offset += 4;

  // timestamp
  headerBuf.writeBigUint64BE(BigInt(Date.now()), offset);
  offset += 8;

  // first LSN
  headerBuf.writeBigUint64BE(BigInt(lsnStart), offset);
  offset += 8;

  return headerBuf;
}

/**
 *
 * @param {...Buffer} buffers
 * @returns {number}
 */
function getCRC32(...buffers) {
  const data = Buffer.concat(buffers);

  return crc.crc32(data);
}

function calcHeader() {
  return (
    sizes.lsn * 2 +
    sizes.type +
    sizes.txId +
    sizes.pageId +
    sizes.payloadLen +
    sizes.checksum
  );
}

function bufferHeader(record, headSize, payloadSize) {
  const buf = Buffer.alloc(headSize);
  let offset = 0;

  buf.writeBigUint64BE(BigInt(record.lsn), offset);
  offset += sizes.lsn;

  buf.writeUint8(opType[record.type], offset);
  offset += sizes.type;

  const txIdNum = parseInt(record.txId.split("_")[1]);
  buf.writeBigUint64BE(BigInt(txIdNum), offset);
  offset += sizes.txId;

  buf.writeBigUint64BE(record.prevLSN, offset);
  offset += sizes.lsn;

  buf.writeUint32BE(record.pageId, offset);
  offset += sizes.pageId;

  buf.writeUint32BE(payloadSize, offset);
  offset += sizes.payloadLen;

  // Last 4 bytes for the checksum when calculated
  return buf;
}

function bufferPayload(payloadSize, idBuf, oldValueBuf, newValueBuf) {
  const payloadBuf = Buffer.alloc(payloadSize);
  let offset = 0;

  payloadBuf.writeUint16BE(idBuf.length, offset);
  offset += sizes.recordIdLen;

  idBuf.copy(payloadBuf, offset);
  offset += idBuf.length;

  payloadBuf.writeUint32BE(oldValueBuf.length, offset);
  offset += sizes.valueLen;

  oldValueBuf.copy(payloadBuf, offset);
  offset += oldValueBuf.length;

  payloadBuf.writeUint32BE(newValueBuf.length, offset);
  offset += sizes.valueLen;

  newValueBuf.copy(payloadBuf, offset);
  offset += newValueBuf.length;

  return payloadBuf;
}

function decodeType(type) {
  const commands = Object.keys(opType);

  return commands[type - 1];
}

function decodeHeader(record, headerBuf) {
  let offset = 0;

  record.lsn = headerBuf.readBigUint64BE(offset);
  offset += sizes.lsn;

  const type = headerBuf.readUint8(offset);
  record.type = decodeType(type);
  offset += sizes.type;

  const txId = headerBuf.readBigUint64BE(offset);
  record.txId = `tx_${txId}`;
  offset += sizes.txId;

  record.prevLSN = headerBuf.readBigUint64BE(offset);
  offset += sizes.lsn;

  record.pageId = headerBuf.readUint32BE(offset);
  offset += sizes.pageId;
}

function decodePayload(record, payloadBuf) {
  let offset = 0;

  const idLen = payloadBuf.readUint16BE(offset);
  offset += sizes.recordIdLen;

  const idBuf = payloadBuf.subarray(offset, idLen + offset);
  record.recordId = idBuf.toString("utf-8");
  offset += idLen;

  const oldValueLen = payloadBuf.readUint32BE(offset);
  offset += sizes.valueLen;

  const oldValueBuf = payloadBuf.subarray(offset, oldValueLen + offset);
  record.oldValue = JSON.parse(oldValueBuf.toString());
  offset += oldValueLen;

  const newValueLen = payloadBuf.readUint32BE(offset);
  offset += sizes.valueLen;

  const newValueBuf = payloadBuf.subarray(offset, newValueLen + offset);
  record.newValue = JSON.parse(newValueBuf.toString());
  offset += newValueLen;
}
