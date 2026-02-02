# LogProtocol.js - Write-Ahead Log (WAL) Protocol

## Overview

`LogProtocol.js` implements a binary protocol for Write-Ahead Logging (WAL) in a key-value store system. It serializes and deserializes database operations to/from persistent log files, enabling crash recovery, durability guarantees, and transaction replay.

## Purpose

The WAL protocol serves several critical functions:

1. **Durability**: Ensures all operations are persisted before acknowledgment
2. **Crash Recovery**: Allows database state reconstruction after failures
3. **Transaction Ordering**: Maintains sequential transaction IDs for replay
4. **Operation History**: Creates an immutable audit trail of all changes

## Protocol Specifications

### Log Entry Structure

Each log entry is a fixed-format binary record:

```
[4-byte TxnID][1-byte Operation][2-byte KeyLen][Key][4-byte ValueLen][Value]
```

### Data Type Limits

| Type | Maximum Size | Encoding |
|------|-------------|----------|
| Transaction ID | 4,294,967,295 (0xFFFFFFFF) | uint32BE |
| Key Length | 65,535 bytes (0xFFFF) | uint16BE |
| Value Length | 4,294,967,295 bytes (0xFFFFFFFF) | uint32BE |
| Operation Type | 1 byte | uint8 |

### Field Sizes (in bytes)

| Field | Size |
|-------|------|
| Transaction ID | 4 |
| Operation Type | 1 |
| Key Length | 2 |
| Value Length | 4 |

## Operation Types

The WAL protocol supports two operation types:

| Operation | Code | Description |
|-----------|------|-------------|
| SET | 0x01 | Insert or update a key-value pair |
| DEL | 0x02 | Delete a key-value pair |

## Log Entry Formats

### SET Operation

Records a key-value insertion or update.

**Binary Layout:**
```
[4-byte TxnID][0x01][2-byte KeyLen][Key][4-byte ValueLen][Value]
```

**Example:**
```javascript
const txnId = 42;
const key = "user:123";
const valueBuf = Buffer.from(JSON.stringify({ name: "Alice", age: 30 }));

const logEntry = LogProtocol.serialize(txnId, "SET", key, valueBuf);
```

**Hex Dump Example:**
```
00 00 00 2A                    // TxnID: 42
01                             // Operation: SET
00 08                          // Key length: 8
75 73 65 72 3A 31 32 33        // Key: "user:123"
00 00 00 1A                    // Value length: 26
7B 22 6E 61 6D 65 22 3A 22 41 6C 69 63 65 22 2C 22 61 67 65 22 3A 33 30 7D
// Value: {"name":"Alice","age":30}
```

**Fields:**
1. **TxnID**: 4 bytes (uint32BE) - Sequential transaction identifier
2. **Operation**: 1 byte (0x01 for SET)
3. **Key Length**: 2 bytes (uint16BE)
4. **Key**: Variable-length UTF-8 string
5. **Value Length**: 4 bytes (uint32BE)
6. **Value**: Variable-length binary data (typically JSON string as buffer)

---

### DEL Operation

Records a key deletion.

**Binary Layout:**
```
[4-byte TxnID][0x02][2-byte KeyLen][Key]
```

**Example:**
```javascript
const txnId = 43;
const key = "user:123";

const logEntry = LogProtocol.serialize(txnId, "DEL", key, null);
```

**Hex Dump Example:**
```
00 00 00 2B                    // TxnID: 43
02                             // Operation: DEL
00 08                          // Key length: 8
75 73 65 72 3A 31 32 33        // Key: "user:123"
```

**Fields:**
1. **TxnID**: 4 bytes (uint32BE)
2. **Operation**: 1 byte (0x02 for DEL)
3. **Key Length**: 2 bytes (uint16BE)
4. **Key**: Variable-length UTF-8 string
5. **Value**: Not present for DEL operations

## API Usage

### Serialization (Writing to WAL)

```javascript
import LogProtocol from './LogProtocol.js';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';

// Open WAL file in append mode
const walFile = fs.openSync('data.wal', 'a');

// Serialize SET operation
const setEntry = LogProtocol.serialize(
  1,                                           // Transaction ID
  "SET",                                       // Operation
  "user:123",                                  // Key
  Buffer.from(JSON.stringify({ name: "Alice" })) // Value as Buffer
);

// Write to WAL
fs.writeSync(walFile, setEntry);

// Serialize DEL operation
const delEntry = LogProtocol.serialize(
  2,           // Transaction ID
  "DEL",       // Operation
  "user:456",  // Key
  null         // No value for DELETE
);

// Write to WAL
fs.writeSync(walFile, delEntry);

fs.closeSync(walFile);
```

### Deserialization (Reading from WAL)

```javascript
import LogProtocol from './LogProtocol.js';
import fs from 'node:fs';

// Read entire WAL file
const walData = fs.readFileSync('data.wal');
let offset = 0;
const entries = [];

while (offset < walData.length) {
  // Read enough bytes for transaction ID + operation + key length (7 bytes minimum)
  const header = walData.subarray(offset, offset + 7);
  
  const txnId = header.readUint32BE(0);
  const operation = header.readUint8(4);
  const keyLen = header.readUint16BE(5);
  
  // Calculate total entry size
  let entrySize = 4 + 1 + 2 + keyLen; // txnId + op + keyLen + key
  
  if (operation === 0x01) { // SET operation includes value
    const valueLenOffset = 4 + 1 + 2 + keyLen;
    const valueLen = walData.readUint32BE(offset + valueLenOffset);
    entrySize += 4 + valueLen; // valueLen + value
  }
  
  // Extract complete entry
  const entryBuffer = walData.subarray(offset, offset + entrySize);
  const entry = LogProtocol.deserialize(entryBuffer);
  
  entries.push(entry);
  offset += entrySize;
}

console.log('Recovered entries:', entries);
```

### Log Entry Object Structure

After deserialization, each entry becomes a JavaScript object:

**SET Entry:**
```javascript
{
  txnId: 42,
  opt: "SET",
  key: "user:123",
  value: '{"name":"Alice","age":30}' // String representation
}
```

**DEL Entry:**
```javascript
{
  txnId: 43,
  opt: "DEL",
  key: "user:123"
  // No value field
}
```

## Transaction ID Management

Transaction IDs are critical for maintaining operation order:

```javascript
class WALManager {
  #currentTxnId = 0;
  
  getNextTxnId() {
    return ++this.#currentTxnId;
  }
  
  async writeOperation(operation, key, value) {
    const txnId = this.getNextTxnId();
    const valueBuf = value ? Buffer.from(JSON.stringify(value)) : null;
    
    const entry = LogProtocol.serialize(txnId, operation, key, valueBuf);
    
    // Write to WAL and fsync
    await this.appendToWAL(entry);
    
    return txnId;
  }
}
```

## WAL Replay for Recovery

### Basic Replay

```javascript
async function replayWAL(walPath, database) {
  const entries = readAllWALEntries(walPath);
  
  for (const entry of entries) {
    if (entry.opt === "SET") {
      const value = JSON.parse(entry.value);
      await database.set(entry.key, value);
    } else if (entry.opt === "DEL") {
      await database.delete(entry.key);
    }
  }
  
  console.log(`Replayed ${entries.length} operations`);
}
```

### Idempotent Replay with Checkpointing

```javascript
class WALReplayer {
  async replayFrom(walPath, database, lastTxnId = 0) {
    const entries = readAllWALEntries(walPath);
    let replayed = 0;
    
    for (const entry of entries) {
      // Skip already-applied transactions
      if (entry.txnId <= lastTxnId) continue;
      
      // Apply operation
      if (entry.opt === "SET") {
        const value = JSON.parse(entry.value);
        await database.set(entry.key, value);
      } else if (entry.opt === "DEL") {
        await database.delete(entry.key);
      }
      
      replayed++;
    }
    
    return {
      totalEntries: entries.length,
      replayed,
      lastTxnId: entries[entries.length - 1]?.txnId || lastTxnId
    };
  }
}
```

## WAL File Management

### File Structure

A typical WAL file contains a sequence of log entries:

```
[Entry 1][Entry 2][Entry 3]...[Entry N]
```

Each entry is self-contained with its own length information embedded in the structure.

### Rotation Strategy

```javascript
class WALRotation {
  #maxFileSize = 100 * 1024 * 1024; // 100MB
  #currentFile = 0;
  
  shouldRotate(currentSize) {
    return currentSize >= this.#maxFileSize;
  }
  
  rotate() {
    const oldFile = `data-${this.#currentFile}.wal`;
    this.#currentFile++;
    const newFile = `data-${this.#currentFile}.wal`;
    
    return { oldFile, newFile };
  }
}
```

### Compaction

```javascript
async function compactWAL(walFiles, outputFile) {
  const state = new Map();
  
  // Build final state from all WAL files
  for (const file of walFiles) {
    const entries = readAllWALEntries(file);
    
    for (const entry of entries) {
      if (entry.opt === "SET") {
        state.set(entry.key, entry.value);
      } else if (entry.opt === "DEL") {
        state.delete(entry.key);
      }
    }
  }
  
  // Write compacted WAL with sequential txnIds
  let txnId = 1;
  for (const [key, value] of state) {
    const entry = LogProtocol.serialize(
      txnId++,
      "SET",
      key,
      Buffer.from(value)
    );
    
    await fs.appendFile(outputFile, entry);
  }
}
```

## Error Handling

### Validation During Serialization

```javascript
try {
  const entry = LogProtocol.serialize(txnId, "SET", key, valueBuf);
} catch (error) {
  if (error.message.includes('out of range')) {
    console.error('Key or value exceeds maximum length');
  } else if (error.message.includes('Unkonw command')) {
    console.error('Invalid operation type');
  }
}
```

### Corruption Detection During Deserialization

```javascript
function readWALSafely(walPath) {
  const entries = [];
  const data = fs.readFileSync(walPath);
  let offset = 0;
  
  while (offset < data.length) {
    try {
      // Calculate entry size
      const header = data.subarray(offset, offset + 7);
      const operation = header.readUint8(4);
      const keyLen = header.readUint16BE(5);
      
      let entrySize = 7 + keyLen;
      if (operation === 0x01) {
        const valueLen = data.readUint32BE(offset + 7 + keyLen);
        entrySize += 4 + valueLen;
      }
      
      // Verify we have enough data
      if (offset + entrySize > data.length) {
        console.error('Truncated entry detected at offset', offset);
        break;
      }
      
      const entryBuffer = data.subarray(offset, offset + entrySize);
      const entry = LogProtocol.deserialize(entryBuffer);
      
      entries.push(entry);
      offset += entrySize;
      
    } catch (error) {
      console.error('Corruption detected at offset', offset, error);
      break;
    }
  }
  
  return entries;
}
```

## Implementation Details

### Buffer Pre-allocation

The protocol pre-calculates buffer sizes to avoid reallocations:

```javascript
// For SET operation
const size = 4 + 1 + 2 + key.length + 4 + valueBuf.length;
// [txnId][op][keyLen][key][valueLen][value]

// For DEL operation
const size = 4 + 1 + 2 + key.length;
// [txnId][op][keyLen][key]
```

### Zero-Copy Operations

During deserialization, value data remains as a string to avoid double-parsing:

```javascript
// Value is stored as string, not parsed to object
log.value = buffer.subarray(offset, valueLen + offset).toString("utf-8");

// This allows efficient re-serialization during replay
// without JSON.parse -> JSON.stringify round-trip
```

### Binary Encoding Benefits

1. **Compact**: ~30% smaller than JSON text format
2. **Fast**: No text parsing overhead
3. **Predictable**: Fixed-size headers enable quick scanning
4. **Platform-independent**: Big-endian byte order

## Use Cases

### 1. Crash Recovery

```javascript
async function recoverFromCrash() {
  const db = new Database();
  const wal = new WALReader('data.wal');
  
  console.log('Starting recovery...');
  const stats = await wal.replay(db);
  
  console.log(`Recovery complete: ${stats.replayed} operations replayed`);
  return db;
}
```

### 2. Replication

```javascript
async function replicateToFollower(followerSocket) {
  const wal = fs.readFileSync('data.wal');
  let offset = 0;
  
  while (offset < wal.length) {
    // Read entry
    const entry = readEntryAt(wal, offset);
    
    // Send to follower
    await followerSocket.write(entry.buffer);
    
    offset += entry.size;
  }
}
```

### 3. Point-in-Time Recovery

```javascript
async function recoverToTransaction(targetTxnId) {
  const db = new Database();
  const entries = readAllWALEntries('data.wal');
  
  for (const entry of entries) {
    if (entry.txnId > targetTxnId) break;
    
    applyEntry(db, entry);
  }
  
  return db;
}
```

### 4. Audit Trail

```javascript
function getOperationHistory(key) {
  const entries = readAllWALEntries('data.wal');
  
  return entries
    .filter(e => e.key === key)
    .map(e => ({
      txnId: e.txnId,
      operation: e.opt,
      timestamp: txnIdToTimestamp(e.txnId),
      value: e.value
    }));
}
```

## Performance Considerations

### Write Performance

1. **Batch Writes**: Group multiple operations before fsync
2. **Buffered I/O**: Use write buffers to reduce syscalls
3. **Pre-allocation**: Pre-allocate file space to reduce fragmentation

```javascript
class BatchWALWriter {
  #buffer = [];
  #batchSize = 100;
  
  async write(entry) {
    this.#buffer.push(entry);
    
    if (this.#buffer.length >= this.#batchSize) {
      await this.flush();
    }
  }
  
  async flush() {
    const combined = Buffer.concat(this.#buffer);
    await fs.appendFile('data.wal', combined);
    await fs.fsync('data.wal');
    
    this.#buffer = [];
  }
}
```

### Read Performance

1. **Sequential Reads**: WAL format optimized for sequential access
2. **Memory Mapping**: Use mmap for large files
3. **Index Building**: Create in-memory index of txnId → offset

```javascript
class WALIndex {
  #index = new Map();
  
  buildIndex(walPath) {
    const data = fs.readFileSync(walPath);
    let offset = 0;
    
    while (offset < data.length) {
      const txnId = data.readUint32BE(offset);
      this.#index.set(txnId, offset);
      
      offset += calculateEntrySize(data, offset);
    }
  }
  
  getEntryByTxnId(txnId) {
    const offset = this.#index.get(txnId);
    if (!offset) return null;
    
    return readEntryAt(this.walPath, offset);
  }
}
```

## Best Practices

1. **Always fsync**: Ensure durability with `fs.fsync()` after writes
2. **Monotonic TxnIDs**: Never reuse or skip transaction IDs
3. **Atomic writes**: Write complete entries atomically
4. **Validate on read**: Always validate entries during deserialization
5. **Regular compaction**: Prevent unbounded WAL growth
6. **Checkpointing**: Periodically snapshot state and truncate WAL
7. **Backup WALs**: Keep old WAL files for disaster recovery

## Integration Example

```javascript
class TransactionalDatabase {
  #db = new Map();
  #wal = null;
  #currentTxnId = 0;
  
  async init(walPath) {
    this.#wal = fs.openSync(walPath, 'a+');
    await this.#replayWAL(walPath);
  }
  
  async #replayWAL(path) {
    const entries = readAllWALEntries(path);
    
    for (const entry of entries) {
      this.#currentTxnId = Math.max(this.#currentTxnId, entry.txnId);
      
      if (entry.opt === "SET") {
        this.#db.set(entry.key, JSON.parse(entry.value));
      } else {
        this.#db.delete(entry.key);
      }
    }
  }
  
  async set(key, value) {
    const txnId = ++this.#currentTxnId;
    const valueBuf = Buffer.from(JSON.stringify(value));
    
    // Write to WAL first
    const entry = LogProtocol.serialize(txnId, "SET", key, valueBuf);
    fs.writeSync(this.#wal, entry);
    fs.fsyncSync(this.#wal);
    
    // Then update in-memory state
    this.#db.set(key, value);
    
    return txnId;
  }
  
  async delete(key) {
    const txnId = ++this.#currentTxnId;
    
    // Write to WAL first
    const entry = LogProtocol.serialize(txnId, "DEL", key, null);
    fs.writeSync(this.#wal, entry);
    fs.fsyncSync(this.#wal);
    
    // Then update in-memory state
    this.#db.delete(key);
    
    return txnId;
  }
}
```

## Compatibility Notes

- Requires Node.js `Buffer` API
- Big-endian byte order (network byte order)
- UTF-8 string encoding
- Works with any filesystem supporting append operations

## Security Considerations

1. **File permissions**: Restrict WAL file access (chmod 600)
2. **Data integrity**: Consider checksums for corruption detection
3. **Encryption**: Encrypt WAL files for sensitive data
4. **Secure deletion**: Overwrite before deleting old WAL files

## Future Enhancements

Potential protocol extensions:

1. **Checksums**: Add CRC32 or SHA256 for entry validation
2. **Compression**: Compress value data for space savings
3. **Encryption**: Built-in encryption support
4. **Timestamps**: Add wall-clock time to entries
5. **Multi-version**: Support schema versioning
6. **Batch operations**: Group multiple operations in single entry
