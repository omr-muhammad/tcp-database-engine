import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import crypto from "node:crypto";

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
};

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
 *  lsn: BigInt, type: string, txId: string, prevLSN: BigInt, pageId: number, recordId: string, oldValue: object, newValue: object }} record -
 */
function encodeLogRecord(record) {
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
    idBuf,
    oldValueBuf,
    newValueBuf,
  );

  const checksum = getCRC32(headerBuf, payloadBuf);

  // write checksum to header
  const checksumOffset = headerSize - 4;
  headerBuf.writeUint32BE(checksum, checksumOffset);

  return Buffer.concat([headerBuf, payloadBuf]);
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
 * @param {Buffer} buffer
 * @param {{ start: number, end: number }} exclude
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
  offset += 2;

  idBuf.copy(payloadBuf, offset);
  offset += idBuf.length;

  payloadBuf.writeUint32BE(oldValueBuf.length, offset);
  offset += 4;

  oldValueBuf.copy(payloadBuf, offset);
  offset += oldValueBuf.length;

  payloadBuf.writeUint32BE(newValueBuf.length, offset);
  offset += 4;

  newValueBuf.copy(payloadBuf, offset);
  offset += newValueBuf.length;

  return payloadBuf;
}
