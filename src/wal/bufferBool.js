import fs from "node:fs/promises";
import * as pgManager from "./page.js";
import { appendToWAL, syncWAL } from "./WAL-1.js";
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

function analyse(records) {
  // Committed
  const committedRecs = new Set();
  for (const rec of records)
    if (rec.type === "COMMIT") committedRecs.add(rec.txId);

  // UnCommitted
  const ucRecords = records.filter((rec) => !committedRecs.has(rec.txId));
  const ucRecsMap = new Map(ucRecords.map((rec) => [rec.lsn, rec]));

  return [committedRecs, ucRecords, ucRecsMap];
}

function redo(records) {
  let applied = 0;
  let skipped = 0;
  for (const rec of records) {
    if (["COMMIT", "BEGIN", "ABORT"].includes(rec.type)) continue;

    const page = pages(rec.pageId);

    // Only apply what never reached the disk
    if (rec.lsn >= page.pageLSN) {
      page.data[rec.key] = rec.newValue;
      markDirty(page.pageId, rec.lsn);

      applied++;
    } else skipped++;
  }

  return [applied, records];
}

async function undo(records, ucRecords, ucRecsMap) {
  let rolled = 0;

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

    const CLRBatcher = [];
    while (current && current.prevLSN !== null) {
      const page = pages.get(current.pageId);

      page.data[current.key] = current.oldValue;
      markDirty(page.pageId);

      rolled++;

      // appendToWAL will add lsn before appending
      const clrRecord = {
        type: "CLR",
        txId: current.txId,
        undoNextLSN: current.prevLSN,
        pageId: current.pageId,
        key: current.key,
        oldValue: current.oldValue,
      };

      // add to memory then flush later
      CLRBatcher.push(appendToWAL(clrRecord));
      current = ucRecsMap.get(current.prevLSN);
    }

    await Promise.all(CLRBatcher);
    completedUndo.add(ucRec.txId);
  }

  return rolled;
}

export async function handleRecover(records) {
  await loadingPagesGroup(records);

  // Analyze Phase
  // uc => uncommitted
  const [committedRecs, ucRecords, ucRecsMap] = analyse(records);

  // Redo Phase
  let [applied, skipped] = redo(records);

  // Undo Phase
  let rolled = await undo(records, ucRecords, ucRecsMap);

  await syncWAL();
  await flushAll();

  return { applied, skipped, rolled };
}
// async function applyWALEntry(record)
