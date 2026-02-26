import { syncWAL } from "./WAL-1.js";

const pendingCommits = [];
let delay = 10; // ms
let timer = null;

export function setDelay(time) {
  delay = time;
}

export async function addToGroup(txId) {
  return new Promise((resolve, reject) => {
    pendingCommits.push({ txId, resolve, reject });

    if (!timer) {
      timer = setTimeout(() => {
        flushGroup();
      }, delay);
    }
  });
}

export async function shutdown() {
  if (timer) clearTimeout(timer);

  await flushGroup();
}

async function flushGroup() {
  timer = null;
  if (pendingCommits.length === 0) return;

  const toFlush = [...pendingCommits];

  // clear pending commits
  pendingCommits.length = 0;
  try {
    await syncWAL();

    for (const commit of toFlush) commit.resolve();

    console.log(`Group commit: fsynced ${toFlush.length} transaction`);
  } catch (err) {
    for (const commit of toFlush) commit.reject();
    console.log("Error flushing commits to wal file: ", err.message);
    console.error(err);
  }
}
