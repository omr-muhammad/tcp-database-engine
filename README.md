# TCP Database Engine 🚀

A custom key-value database built from scratch with TCP networking, binary protocol, persistence, and crash recovery.

**Status:** Week 1 Complete ✅ (Storage Layer + Binary Protocol)

---

## 📋 Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Binary Protocol Specification](#binary-protocol-specification)
- [Storage Layer Documentation](#storage-layer-documentation)
- [Installation & Usage](#installation--usage)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)

---

## ✨ Features

### Currently Implemented (Week 1)

- ✅ **In-Memory Storage** - Fast key-value operations using JavaScript Map
- ✅ **Disk Persistence** - Atomic writes with crash safety
- ✅ **Binary Protocol** - Custom wire protocol for efficient network communication
- ✅ **Data Validation** - Type checking and JSON serialization validation

### Coming Soon (Week 2-4)

- 🔄 TCP Server & Client
- 🔄 Multi-client connection handling
- 🔄 B-Tree indexing for fast queries
- 🔄 Write-Ahead Log (WAL) for crash recovery
- 🔄 Transaction support (BEGIN/COMMIT/ROLLBACK)
- 🔄 Range queries
- 🔄 Interactive CLI

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    TCP Database Engine                  │
└─────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   TCP        │      │   Binary     │      │   Storage    │
│   Server     │ ───> │   Protocol   │ ───> │   Engine     │
│   (Week 2)   │      │   (Week 1)   │      │   (Week 1)   │
└──────────────┘      └──────────────┘      └──────────────┘
                                                     │
                                                     ▼
                              ┌─────────────────────────────────┐
                              │     Persistence Layer           │
                              ├─────────────────────────────────┤
                              │  • MemoryStore (Map-based)      │
                              │  • DiskStore (JSON files)       │
                              │  • WAL (Write-Ahead Log)        │
                              └─────────────────────────────────┘
                                             │
                                             ▼
                                    ┌────────────────┐
                                    │   File System  │
                                    │   /data/       │
                                    │  - db.json     │
                                    │  - wal.log     │
                                    └────────────────┘
```

### Data Flow

**Write Operation:**

```
Client Request
    ↓
TCP Server (receives binary message)
    ↓
Protocol.deserializeRequest() → { type: 'SET', key: 'user:1', value: 'John' }
    ↓
WAL.append() → writes to wal.log (crash safety)
    ↓
DiskStore.set() → updates in-memory Map
    ↓
Protocol.serializeResponse() → { status: 'ok', data: null }
    ↓
TCP Server (sends binary response)
    ↓
Client receives confirmation
```

**Read Operation:**

```
Client Request
    ↓
TCP Server (receives binary message)
    ↓
Protocol.deserializeRequest() → { type: 'GET', key: 'user:1' }
    ↓
DiskStore.get() → reads from in-memory Map
    ↓
Protocol.serializeResponse() → { status: 'ok', data: 'John' }
    ↓
TCP Server (sends binary response)
    ↓
Client receives value
```

**Crash Recovery:**

```
Server Starts
    ↓
DiskStore.load() → reads db.json into memory
    ↓
WAL.replay() → applies uncommitted operations from wal.log
    ↓
In-memory state is now consistent
    ↓
Server ready to accept connections
```

---

## 📡 Binary Protocol Specification

### Why Binary?

- **Efficiency**: Less overhead than JSON/text protocols
- **Performance**: Faster parsing and serialization
- **Learning**: Understanding how real databases (PostgreSQL, Redis) communicate

### Message Format

All multi-byte integers use **Big-Endian** byte order.

#### Request Messages

**SET Command**

```
┌──────────┬────────────┬─────────┬──────────────┬───────────┐
│ Command  │ Key Length │   Key   │ Value Length │   Value   │
│ 1 byte   │  2 bytes   │ N bytes │   4 bytes    │  M bytes  │
└──────────┴────────────┴─────────┴──────────────┴───────────┘
   0x01        uint16       utf-8      uint32        utf-8
```

**GET Command**

```
┌──────────┬────────────┬─────────┐
│ Command  │ Key Length │   Key   │
│ 1 byte   │  2 bytes   │ N bytes │
└──────────┴────────────┴─────────┘
   0x02        uint16       utf-8
```

**DELETE Command**

```
┌──────────┬────────────┬─────────┐
│ Command  │ Key Length │   Key   │
│ 1 byte   │  2 bytes   │ N bytes │
└──────────┴────────────┴─────────┘
   0x03        uint16       utf-8
```

#### Response Messages

**Response Format**

```
┌──────────┬─────────────┬──────────┐
│  Status  │ Data Length │   Data   │
│ 1 byte   │  4 bytes    │ N bytes  │
└──────────┴─────────────┴──────────┘
  0x05-0x07    uint32    JSON string
```

### Command Types

| Command | Code   | Description             |
| ------- | ------ | ----------------------- |
| SET     | `0x01` | Store key-value pair    |
| GET     | `0x02` | Retrieve value by key   |
| DELETE  | `0x03` | Remove key-value pair   |
| LIST    | `0x04` | List all keys (planned) |

### Status Codes

| Status | Code   | Meaning                |
| ------ | ------ | ---------------------- |
| OK     | `0x05` | Operation successful   |
| FAIL   | `0x06` | Operation failed       |
| ERROR  | `0x07` | Error during execution |

### Example: SET Request Breakdown

**Command:** `SET user:1 "John Doe"`

**Binary Representation:**

```
Bytes:  01 00 06 75 73 65 72 3a 31 00 00 00 08 4a 6f 68 6e 20 44 6f 65

Breakdown:
01           - Command (SET = 0x01)
00 06        - Key length (6 bytes)
75 73 65 72  - Key bytes "user"
3a 31        - Key bytes ":1"
00 00 00 08  - Value length (8 bytes)
4a 6f 68 6e  - Value bytes "John"
20 44 6f 65  - Value bytes " Doe"
```

### Size Limits

| Field         | Max Size            | Reason                           |
| ------------- | ------------------- | -------------------------------- |
| Key Length    | 65,535 bytes        | 2-byte unsigned integer (2^16-1) |
| Value Length  | 4,294,967,295 bytes | 4-byte unsigned integer (2^32-1) |
| Total Message | ~4.3 GB             | Practical limit (configurable)   |

---

## 💾 Storage Layer Documentation

### 1. MemoryStore (In-Memory Storage)

**File:** `src/storage/MemoryStore.js`

**Purpose:** Fast in-memory key-value storage using JavaScript's native `Map`.

**Key Features:**

- O(1) average time complexity for get/set/delete operations
- Automatic type validation (keys must be strings)
- JSON serialization validation for values
- Protected internal storage using convention (`_store`)

**API:**

```javascript
const store = new MemoryStore();

// Store data
store.set("user:1", "John Doe");
store.set("product:100", { name: "Laptop", price: 999 });

// Retrieve data
const user = store.get("user:1"); // 'John Doe'

// Check existence
store.has("user:1"); // true

// Delete data
store.delete("user:1");

// Get size
store.size(); // Returns number of keys

// List all keys
store.keys(); // Returns array of keys
```

**Validation Rules:**

- Keys must be strings (throws error otherwise)
- Values must be JSON-serializable (throws error for functions, symbols, etc.)

---

### 2. DiskStore (Persistent Storage)

**File:** `src/storage/DiskStore.js`

**Purpose:** Extends `MemoryStore` with disk persistence using atomic writes.

**Key Features:**

- **Atomic Writes**: Uses temp file + rename pattern (POSIX atomic operation)
- **Auto-loading**: Loads database on instantiation
- **Crash Safety**: Incomplete writes never corrupt the database
- **Graceful Degradation**: Creates new database if file doesn't exist

**API:**

```javascript
const store = new DiskStore("./data/db.json");

// All MemoryStore methods available
store.set("key", "value");

// Persist to disk
await store.flush();

// Load from disk (automatic on construction)
await store.load();

// Clear database
await store.clear();
```

**How Atomic Writes Work:**

```javascript
// Normal (unsafe) write:
writeFile("db.json", data); // ❌ If crash happens here, file is corrupted!

// Atomic write (our implementation):
writeFile("tempDB.json", data); // Write to temp file
rename("tempDB.json", "db.json"); // ✅ Atomic operation - either succeeds completely or not at all
```

**File Structure:**

```json
{
  "user:1": "John Doe",
  "user:2": "Jane Smith",
  "product:100": {
    "name": "Laptop",
    "price": 999
  },
  "session:abc123": {
    "userId": 1,
    "expires": 1704123456789
  }
}
```

---

### 3. Protocol (Binary Serialization)

**File:** `src/protocol/Protocol.js`

**Purpose:** Convert between JavaScript objects and binary buffers for network transmission.

**Why Binary Protocol?**

- **Efficiency**: 30-50% smaller than JSON for typical payloads
- **Speed**: Faster parsing (no string manipulation)
- **Type Safety**: Explicit field sizes prevent ambiguity
- **Industry Standard**: Real databases (PostgreSQL, MySQL) use binary protocols

**API:**

```javascript
// Serialize commands (object → binary)
const setBuffer = Protocol.serializeSet("user:1", "John");
const getBuffer = Protocol.serializeGet("user:1");
const delBuffer = Protocol.serializeDelete("user:1");

// Deserialize request (binary → object)
const request = Protocol.deserializeRequest(buffer);
// { type: 'SET', key: 'user:1', value: 'John' }

// Serialize response (object → binary)
const responseBuffer = Protocol.serializeResponse("ok", { result: "success" });

// Deserialize response (binary → object)
const response = Protocol.deserializeResponse(buffer);
// { status: 'success', data: { result: 'success' } }
```

**Implementation Details:**

```javascript
// Example: Serializing SET command
static serializeSet(key, value) {
  // 1. Calculate total buffer size
  const size = 1 + 2 + key.length + 4 + value.length;
  const buffer = Buffer.alloc(size);

  // 2. Write command byte
  buffer.writeUint8(0x01, 0); // SET = 0x01

  // 3. Write key length (2 bytes)
  buffer.writeUint16BE(key.length, 1);

  // 4. Write key bytes
  Buffer.from(key).copy(buffer, 3);

  // 5. Write value length (4 bytes)
  buffer.writeUint32BE(value.length, 3 + key.length);

  // 6. Write value bytes
  Buffer.from(value).copy(buffer, 7 + key.length);

  return buffer;
}
```

---

## 🚀 Installation & Usage

### Prerequisites

- Node.js 18+ (for ES modules support)
- npm or yarn

### Setup

```bash
# Clone repository
git clone <your-repo-url>
cd tcp-database-engine

# Install dependencies (if any)
npm install

# Create data directory
mkdir data
```

### Running Tests

```bash
# Test MemoryStore
node tests/memory-store.test.js

# Test DiskStore
node tests/disk-store.test.js

# Test Protocol
node tests/protocol.test.js
```

### Example Usage (Current Week 1 Code)

```javascript
import DiskStore from "./src/storage/DiskStore.js";
import Protocol from "./src/protocol/Protocol.js";

// Initialize database
const db = new DiskStore("./data/db.json");

// Store data
db.set("user:1", "John Doe");
db.set("product:100", JSON.stringify({ name: "Laptop", price: 999 }));

// Retrieve data
console.log(db.get("user:1")); // 'John Doe'

// Persist to disk
await db.flush();

// Test binary protocol
const buffer = Protocol.serializeSet("key", "value");
console.log("Serialized:", buffer);

const request = Protocol.deserializeRequest(buffer);
console.log("Deserialized:", request); // { type: 'SET', key: 'key', value: 'value' }
```

---

## 📁 Project Structure

```
tcp-database-engine/
├── src/
│   ├── storage/
│   │   ├── MemoryStore.js      # In-memory Map-based storage
│   │   └── DiskStore.js        # Persistent storage with atomic writes
│   ├── protocol/
│   │   └── Protocol.js         # Binary protocol serialization
│   ├── server/                 # [Week 2] TCP server implementation
│   ├── client/                 # [Week 2] TCP client library
│   ├── wal/                    # [Week 3] Write-Ahead Log
│   ├── index/                  # [Week 3] B-Tree indexing
│   └── cli/                    # [Week 4] Interactive CLI
├── tests/                      # Unit and integration tests
├── data/                       # Database files (created at runtime)
│   ├── db.json                 # Main database snapshot
│   └── wal.log                 # Write-ahead log (Week 3)
├── package.json
└── README.md
```

---

## 🗺️ Roadmap

### ✅ Week 1: Storage Layer & Protocol (COMPLETED)

- [x] In-memory key-value store
- [x] Disk persistence with atomic writes
- [x] Binary protocol design
- [x] Request/response serialization
- [x] Basic validation

### 🔄 Week 2: TCP Networking (In Progress)

- [ ] TCP server implementation
- [ ] Connection handling
- [ ] Multi-client support
- [ ] TCP client library
- [ ] Network error handling

### 📅 Week 3: Indexing & Reliability

- [ ] B-Tree data structure
- [ ] Write-Ahead Log (WAL)
- [ ] Crash recovery
- [ ] Range queries

### 📅 Week 4: Advanced Features

- [ ] Transaction support (BEGIN/COMMIT/ROLLBACK)
- [ ] Connection pooling
- [ ] Performance benchmarks
- [ ] Security & rate limiting

### 📅 Bonus: CLI Interface

- [ ] Interactive REPL
- [ ] Command history
- [ ] Colored output
- [ ] Help system

---

## 🎯 Learning Outcomes

By building this project, you'll understand:

1. **Network Programming**

   - TCP socket programming in Node.js
   - Binary protocols vs text protocols
   - Connection lifecycle management

2. **Data Structures**

   - Hash maps (JavaScript Map)
   - B-Trees for indexing
   - Log-structured storage

3. **Systems Programming**

   - File I/O and persistence
   - Atomic operations
   - Crash recovery mechanisms
   - Concurrency and race conditions

4. **Database Internals**
   - How key-value stores work (Redis, Memcached)
   - ACID properties
   - Write-ahead logging
   - Query optimization

---

## 🤝 Contributing

This is a learning project, but feedback is welcome! If you spot bugs or have suggestions:

1. Open an issue describing the problem
2. Submit a PR with fixes (include tests!)
3. Follow the commit message format: `type: description`

---

## 📝 License

MIT License - Feel free to use this for learning!

---

## 🙏 Acknowledgments

- Inspired by Redis, Memcached, and LevelDB
- Built as a portfolio project to demonstrate low-level systems knowledge
- Thanks to the Node.js community for excellent documentation

---

**Current Version:** v0.1.0-week1  
**Last Updated:** [Current Date]  
**Status:** Active Development 🚀
