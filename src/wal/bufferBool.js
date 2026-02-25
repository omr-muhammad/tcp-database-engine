import fs from "node:fs/promises";
import * as pgManager from "./page.js";
import { appendToWAL, currLSN, encode, walPath } from "./WAL-1.js";
/**
 * @constant { Map<number, { pageId: number, pageLSN: BigInt, data: Object, dirty: boolean, }> }
 */
const pages = new Map();
const dirtyPages = new Set();
let accessOrder = [];
const CLRs = [];
const maxSize = 100;

export async function flushPage(pageId) {
  if (!dirtyPages.has(pageId))
    throw new Error(`Cannot flush non dirty page id: ${pageId}`);

  const page = pages.get(pageId);
  if (!page) throw new Error(`Page with id: ${pageId}, not found.`);

  const pageFile = pgManager.getPageFilePath(pageId);
  let fd;
  try {
    fd = await fs.open(pageFile, "w");
    await pgManager.save(page, fd);
    await fd.sync();
  } catch (error) {
    console.log("Error syncing page: ", error.message);
    console.error(error);
  } finally {
    if (fd) await fd.close();
  }

  page.dirty = false;
  dirtyPages.delete(pageId);
}

export async function flushAll() {
  const dirtyPagesIDs = Array.from(dirtyPages.keys());
  const dirtyCount = dirtyPagesIDs.length;

  await Promise.all(dirtyPagesIDs.map((pageId) => flushPage(pageId)));

  return dirtyCount;
}

function evict() {
  for (let i = 0; i < accessOrder.length; ++i) {
    const oldPageId = accessOrder[i];

    if (!dirtyPages.has(oldPageId)) {
      pages.delete(oldPageId);
      accessOrder = accessOrder.filter((id) => id !== oldPageId);
      return 1;
    }
  }

  return 0;
}

// This function called only when all LRU pages are dirty
async function evictDirtyLRUPage() {
  const oldPageId = accessOrder[0];

  if (!dirtyPages.has(oldPageId)) {
    console.info("This action can not be done unless all LRU pages are dirty.");
    return;
  }

  await flushPage(oldPageId);
}

function updateAccessOrder(pageId) {
  const lruPos = accessOrder.indexOf(pageId);

  if (lruPos !== -1) accessOrder = accessOrder.filter((id) => id !== pageId);

  accessOrder.push(pageId);
}

function getPageFromPool(pageId) {
  return pages.has(pageId) ? pages.get(pageId) : null;
}

async function getPageFromDisk(pageId) {
  return await pgManager.load(pageId);
}

function markDirty(pageId, lsn) {
  const page = pages.get(pageId);

  if (!page) throw new Error(`Page with id: ${pageId} was not found.`);

  page.dirty = true;

  if (lsn) page.pageLSN = lsn;

  dirtyPages.add(pageId);
}

async function loadingPagesGroup(records) {
  const pagesIDs = new Set();

  for (const rec of records) {
    if (rec.pageId !== null || rec.pageId !== undefined)
      pagesIDs.add(rec.pageId);
  }

  const loadedPages = await Promise.all(
    Array.from(pagesIDs).map((id) => getPageFromDisk(id)),
  );

  loadedPages.forEach((pg) => pages.set(pg.pageId, pg));
}

async function handleRecover(records) {
  await loadingPagesGroup(records);

  const committedRecs = new Set();
  for (const rec of records)
    if (rec.type === "COMMIT") committedRecs.add(rec.txId);

  // REDO all
  let applied, skipped, rolled;
  for (const rec of records) {
    if (["COMMIT", "BEGIN", "ABORT"].includes(rec.type)) continue;

    const page = pages(rec.pageId);

    // Only apply what never reached the disk
    if (rec.lsn >= page.pageLSN) {
      applied++;
      page.data[rec.key] = rec.newValue;
      markDirty(page.pageId, rec.lsn);
    } else skipped++;
  }

  // uc => un committed
  const ucRecords = records.filter((rec) => !committedRecs.has(rec.txId));
  const ucRecsMap = new Map(ucRecords.map((rec) => [rec.lsn, rec]));

  const lastCLRPerTx = new Map();
  for (const rec of records)
    if (rec.type === "CLR") lastCLRPerTx.set(rec.txId, rec);

  const completedUndo = new Set();
  // UNDO uncommitted
  for (let i = ucRecords.length - 1; i >= 0; --i) {
    const ucRec = ucRecords[i];

    if (ucRec.prevLSN === null) continue; // BEGIN
    if (completedUndo.has(ucRec.txId)) continue; // already undo

    let current = ucRec; // start Optimistic

    // Resume from where we left off if crash happened during previous recover
    if (lastCLRPerTx.has(ucRec.txId)) {
      const clr = lastCLRPerTx.get(ucRec.txId);
      current = ucRecsMap.get(clr.undoNextLSN);
    }

    while (current && current.prevLSN !== null) {
      const page = pages.get(current.pageId);

      page.data[current.key] = current.oldValue;
      markDirty(page.pageId);

      rolled++;

      const clrLSN = currLSN++;
      const clrRecord = {
        lsn: clrLSN,
        type: "CLR",
        txId: current.txId,
        undoNextLSN: current.prevLSN,
        pageId: current.pageId,
        key: current.key,
        oldValue: current.oldValue,
      };

      // add to memory then flush later
      await appendToWAL(walPath, clrRecord);
      current = ucRecsMap.get(current.prevLSN);
    }

    completedUndo.add(ucRec.txId);
  }

  let fd;
  try {
    fd = await fs.open(walPath, "a");
    await fd.sync();
  } catch (error) {
    console.log("Error syncing the wal file during recover: ", error.message);
    console.error(error);
  } finally {
    if (fd) await fd.close();
  }

  await flushAll();
}
// async function applyWALEntry(record)
