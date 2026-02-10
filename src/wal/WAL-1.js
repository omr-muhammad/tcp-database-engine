import { Buffer } from "node:buffer";
import fs from "node:fs/promises";

function prepHeaderBuf(size = 256, lsnStart = 1) {
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

async function initWAL(filePath) {
  const headerBuf = prepHeaderBuf();

  let fd;
  try {
    fd = await fs.open(filePath, "w");
    await fs.writeFile(fd, headerBuf);

    // ensure write to disk
    await fd.sync();
  } catch (error) {
    console.error("initWAL error: ", error.message);
    console.error(error);
  } finally {
    if (fd) await fd.close();
  }
}
