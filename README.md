# TCP Database Engine 🚀

A custom key-value database built from scratch with TCP networking, binary protocol, persistence, and crash recovery.

**Status:** Week 2 Complete ✅ (Storage + Protocol + TCP Networking)

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

### Currently Implemented (Weeks 1-2)

- ✅ **In-Memory Storage** - Fast key-value operations using JavaScript Map
- ✅ **Disk Persistence** - Atomic writes with crash safety
- ✅ **Binary Protocol** - Custom wire protocol with length-prefix framing
- ✅ **TCP Server** - Multi-client connection handling with async I/O
- ✅ **TCP Client** - Auto-reconnection and connection pooling
- ✅ **Concurrency Control** - Lock mechanism for safe concurrent writes
- ✅ **Connection Management** - Max connections limit with graceful degradation
- ✅ **Timeout Handling** - Auto-disconnect idle clients after 30s
- ✅ **Data Validation** - Type checking and JSON serialization validation

### Coming Soon (Weeks 3-4)

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

        Multiple Clients
              ↓ ↓ ↓
        ┌──────────────┐
        │  TCP Server  │
        │  Port: 5432  │
        └──────────────┘
              ↓
        ┌──────────────┐
        │   Protocol   │ ← Length-Prefix Framing
        │   Parser     │ ← Binary Messages
        └──────────────┘
              ↓
        ┌──────────────┐
        │ Connection   │ ← Max Limit: 5000
        │ Manager      │ ← Timeout: 30s
        └──────────────┘
              ↓
        ┌──────────────┐
        │ Concurrency  │ ← Lock Mechanism
        │ Control      │ ← Safe Writes
        └──────────────┘
              ↓
        ┌──────────────┐
        │   Storage    │ ← In-Memory Map
        │   Engine     │ ← O(1) Operations
        └──────────────┘
              ↓
┌─────────────────────────────────┐
│     Persistence Layer           │
├─────────────────────────────────┤
│  • Atomic Writes (temp+rename)  │
│  • Auto-load on startup         │
│  • Graceful shutdown            │
└─────────────────────────────────┘
              ↓
        ┌────────────┐
        │ File System│
        │  /data/    │
        │  db.json   │
        └────────────┘
```

### Data Flow

**Write Operation:**

```
Client Request
    ↓
TCP Socket Connection
    ↓
Server receives binary message (length-prefix framing)
    ↓
Buffer accumulation (handle partial messages)
    ↓
Protocol.deserializeRequest() → { type: 'SET', key: 'user:1', value: 'John' }
    ↓
Acquire lock on key (prevent race conditions)
    ↓
DiskStore.set() → updates in-memory Map
    ↓
Release lock
    ↓
Protocol.serializeResponse() → { status: 'ok', data: {...} }
    ↓
TCP Server writes response to socket
    ↓
Client receives confirmation
```

**Read Operation:**

```
Client Request
    ↓
TCP Socket Connection
    ↓
Server receives binary message
    ↓
Protocol.deserializeRequest() → { type: 'GET', key: 'user:1' }
    ↓
DiskStore.get() → reads from in-memory Map (O(1))
    ↓
Protocol.serializeResponse() → { status: 'ok', data: { value: 'John' } }
    ↓
TCP Server writes response to socket
    ↓
Client receives value
```

**Server Startup:**

```
TCPServer constructor
    ↓
DiskStore.initialize()
    ↓
DiskStore.load() → reads db.json into memory
    ↓
(If load fails, start with empty Map)
    ↓
Server.listen(port, host)
    ↓
Ready to accept connections
```

**Connection Lifecycle:**

```
Client connects
    ↓
Check max connections limit
    ↓
If limit reached → Send error and close
    ↓
Assign client ID
    ↓
Track in connections Map
    ↓
Set 30s timeout
    ↓
Client sends requests... (multiple requests per connection)
    ↓
Client disconnects OR timeout
    ↓
Remove from connections Map
```

---

## 📡 Binary Protocol Specification

### Why Binary?

- **Efficiency**: Less overhead than JSON/text protocols
- **Performance**: Faster parsing and serialization
- **Learning**: Understanding how real databases (PostgreSQL, Redis) communicate

### Message Format

All multi-byte integers use **Big-Endian** byte order.

#### **Length-Prefix Framing** (Added in Week 2)

Every message is prefixed with its total length to enable proper message framing over TCP streams:

```
┌──────────────┬─────────────────────┐
│ Message Len  │  Message Payload    │
│  4 bytes     │  N bytes            │
└──────────────┴─────────────────────┘
   uint32BE      (command + data)
```

This solves the **TCP streaming problem**: TCP delivers bytes as a stream, not discrete messages. The length prefix allows the server to buffer data until a complete message arrives.

#### Request Messages

**SET Command**

```
┌──────────────┬──────────┬────────────┬─────────┬──────────────┬───────────┐
│ Message Len  │ Command  │ Key Length │   Key   │ Value Length │   Value   │
│  4 bytes     │ 1 byte   │  2 bytes   │ N bytes │   4 bytes    │  M bytes  │
└──────────────┴──────────┴────────────┴─────────┴──────────────┴───────────┘
   uint32BE       0x01        uint16       utf-8      uint32        JSON
```

**GET Command**

```
┌──────────────┬──────────┬────────────┬─────────┐
│ Message Len  │ Command  │ Key Length │   Key   │
│  4 bytes     │ 1 byte   │  2 bytes   │ N bytes │
└──────────────┴──────────┴────────────┴─────────┘
   uint32BE       0x02        uint16       utf-8
```

**DELETE Command**

```
┌──────────────┬──────────┬────────────┬─────────┐
│ Message Len  │ Command  │ Key Length │   Key   │
│  4 bytes     │ 1 byte   │  2 bytes   │ N bytes │
└──────────────┴──────────┴────────────┴─────────┘
   uint32BE       0x03        uint16       utf-8
```

**LIST Command**

```
┌──────────────┬──────────┐
│ Message Len  │ Command  │
│  4 bytes     │ 1 byte   │
└──────────────┴──────────┘
   uint32BE       0x04
```

#### Response Messages

**Response Format**

```
┌──────────┬─────────────┬──────────┐
│  Status  │ Data Length │   Data   │
│ 1 byte   │  4 bytes    │ N bytes  │
└──────────┴─────────────┴──────────┘
  0x05-0x07    uint32    JSON object
```

**Note:** Responses do NOT have a length prefix. The client reads the status byte, then the data length, then buffers until it has received all data bytes.

### Command Types

| Command | Code   | Description           |
| ------- | ------ | --------------------- |
| SET     | `0x01` | Store key-value pair  |
| GET     | `0x02` | Retrieve value by key |
| DELETE  | `0x03` | Remove key-value pair |
| LIST    | `0x04` | List all keys         |

### Status Codes

| Status | Code   | Meaning                |
| ------ | ------ | ---------------------- |
| OK     | `0x05` | Operation successful   |
| FAIL   | `0x06` | Operation failed       |
| ERROR  | `0x07` | Error during execution |

### Example: SET Request Breakdown

**Command:** `SET user:1 "John Doe"`

**Binary Representation (with length prefix):**

```
Bytes:  00 00 00 14 01 00 06 75 73 65 72 3a 31 00 00 00 0a 22 4a 6f 68 6e 20 44 6f 65 22

Breakdown:
00 00 00 14  - Message length (20 bytes)
01           - Command (SET = 0x01)
00 06        - Key length (6 bytes)
75 73 65 72  - Key bytes "user"
3a 31        - Key bytes ":1"
00 00 00 0a  - Value length (10 bytes = JSON-stringified "John Doe")
22 4a 6f 68 6e - Value bytes "\"John"
20 44 6f 65 22 - Value bytes " Doe\""
```

**How the Server Processes This:**

1. **Receive first 4 bytes**: `00 00 00 14` → Message is 20 bytes long
2. **Buffer until 20 bytes received**: Wait for complete message
3. **Extract payload** (skip length prefix): Bytes 4-24
4. **Deserialize**: Command=SET, Key="user:1", Value="John Doe"
5. **Execute**: Store in Map
6. **Respond**: Send success response

### Size Limits

| Field          | Max Size            | Reason                           |
| -------------- | ------------------- | -------------------------------- |
| Message Length | 4,294,967,295 bytes | 4-byte unsigned integer (2^32-1) |
| Key Length     | 65,535 bytes        | 2-byte unsigned integer (2^16-1) |
| Value Length   | 4,294,967,295 bytes | 4-byte unsigned integer (2^32-1) |
| Total Message  | ~4.3 GB             | Practical limit (configurable)   |

**Note:** In practice, you should set lower limits (e.g., 1MB max message size) to prevent DoS attacks.

---

## 🌐 TCP Networking Layer

### Server Architecture

**File:** `src/server/TCPServer.js`

**Purpose:** Accept and manage multiple client connections over TCP, process requests, and send responses.

**Key Features:**

1. **Connection Management**

   - Tracks active connections in a Map with unique IDs
   - Enforces max connection limit (default: 5000)
   - Gracefully kicks oldest connections when limit exceeded
   - Monitors last activity time for each client

2. **Message Framing**

   - Implements length-prefix protocol for TCP streaming
   - Buffers incomplete messages until fully received
   - Handles partial message delivery automatically

3. **Concurrency Control**

   - Simple lock mechanism prevents race conditions
   - Locks acquired per-key during writes
   - Non-blocking: waits 1ms if key is locked

4. **Timeout Handling**

   - 30-second idle timeout per connection
   - Automatically disconnects inactive clients
   - Frees server resources

5. **Graceful Shutdown**
   - Flushes database to disk before closing
   - Closes server socket cleanly

**API:**

```javascript
import TCPServer from "./src/server/TCPServer.js";

// Create server
const server = new TCPServer(
  "localhost", // host
  5432, // port
  5000 // maxConnections (optional)
);

// Start accepting connections
server.start();

// Adjust connection limit dynamically
server.setMaxConnections(10000);

// Shutdown gracefully
await server.shutdown();
```

**How Message Buffering Works:**

```javascript
// Problem: TCP delivers bytes as a stream, not discrete messages
// Client sends: [Message1: 100 bytes][Message2: 50 bytes]
// TCP might deliver: [75 bytes][75 bytes] - split across boundaries!

// Solution: Length-prefix framing
socket.on("data", (chunk) => {
  // Accumulate bytes
  requestBuffer = Buffer.concat([requestBuffer, chunk]);

  // Try to read message length
  if (requestBuffer.length >= 4) {
    const messageSize = requestBuffer.readUint32BE(0);

    // Check if we have the complete message
    if (requestBuffer.length >= messageSize + 4) {
      // Extract message (skip 4-byte length header)
      const message = requestBuffer.subarray(4, messageSize + 4);

      // Process message
      handleRequest(message);

      // Remove processed bytes
      requestBuffer = requestBuffer.subarray(messageSize + 4);
    }
  }
});
```

**Concurrency Control Example:**

```javascript
// Without locks: Race condition!
// Client A: SET user:1 "Alice"
// Client B: SET user:1 "Bob"
// Result: Unpredictable! Could be "Alice" or "Bob"

// With locks: Safe!
async function handleSet(key, value) {
  await acquireLock(key); // Wait if another client is writing this key
  try {
    store.set(key, value); // Safe to write
  } finally {
    releaseLock(key); // Always release
  }
}
```

---

### Client Library

**File:** `src/client/TCPClient.js`

**Purpose:** Connect to the database server and send commands programmatically.

**Key Features:**

1. **Auto-Reconnection**

   - Retries up to 3 times on connection failure
   - 3-second delay between retries
   - Handles `ECONNREFUSED` gracefully

2. **Message Parsing**

   - Deserializes binary responses
   - Handles partial response delivery
   - Displays results in human-readable format

3. **Timeout Handling**

   - 30-second timeout for responses
   - Auto-disconnect on timeout
   - Triggers reconnection logic

4. **Graceful Shutdown**
   - Handles SIGINT (Ctrl+C) cleanly
   - Closes socket properly

**API:**

```javascript
import TCPClient from "./src/client/TCPClient.js";

// Create client
const client = new TCPClient("localhost", 5432);

// Connect
client.connect();

// Commands
client.set("user:1", "John Doe");
client.get("user:1");
client.delete("user:1");
client.list(); // Get all keys

// Disconnect
client.disconnect();
```

**Response Format:**

All responses include:

- `status`: "ok" | "fail" | "error"
- `data`: Object containing:
  - `message`: Success/error message
  - `value`: Retrieved value (for GET)
  - `keys`: Array of keys (for LIST)

**Example Usage:**

```javascript
const client = new TCPClient("localhost", 5432);
client.connect();

// Wait for connection
setTimeout(() => {
  // Store data
  client.set(
    "session:abc",
    JSON.stringify({
      userId: 123,
      expires: Date.now() + 3600000,
    })
  );

  // Retrieve data
  client.get("session:abc");

  // List all keys
  client.list();

  // Cleanup
  client.delete("session:abc");
}, 1000);

// Disconnect after 5 seconds
setTimeout(() => {
  client.disconnect();
}, 5000);
```

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

**Asynchronous Initialization:**

To handle potential load errors gracefully, DiskStore now uses an explicit `initialize()` method:

```javascript
const store = new DiskStore("./data/db.json");

// Initialize (loads data from disk)
await store.initialize();

// Now safe to use
store.set("key", "value");
```

The server uses `.finally()` to ensure it starts even if database loading fails:

```javascript
store.initialize().finally(() => {
  server.listen(port, host); // Start regardless of load result
});
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

### Running the Server

```bash
# Start the database server
node src/server/TCPServer.js

# Output:
# Server is running on localhost:5432
```

**Environment Variables (optional):**

```bash
export TCP_PORT=5432
export HOST=localhost
node src/server/TCPServer.js
```

### Using the Client

**Option 1: Programmatic Usage**

```javascript
import TCPClient from "./src/client/TCPClient.js";

const client = new TCPClient("localhost", 5432);
client.connect();

// Wait a moment for connection
setTimeout(() => {
  // Store data
  client.set("user:1", "John Doe");

  // Retrieve data
  setTimeout(() => client.get("user:1"), 500);

  // List all keys
  setTimeout(() => client.list(), 1000);

  // Cleanup
  setTimeout(() => client.disconnect(), 2000);
}, 500);
```

**Option 2: Interactive Testing**

```javascript
// test-client.js
import TCPClient from "./src/client/TCPClient.js";
import readline from "readline";

const client = new TCPClient("localhost", 5432);
client.connect();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("Commands: SET key value | GET key | DELETE key | LIST | EXIT");

rl.on("line", (input) => {
  const [cmd, key, ...value] = input.split(" ");

  if (cmd === "SET") client.set(key, value.join(" "));
  else if (cmd === "GET") client.get(key);
  else if (cmd === "DELETE") client.delete(key);
  else if (cmd === "LIST") client.list();
  else if (cmd === "EXIT") {
    client.disconnect();
    process.exit(0);
  }
});
```

### Running Tests

```bash
# Test MemoryStore
node tests/memory-store.test.js

# Test DiskStore
node tests/disk-store.test.js

# Test Protocol
node tests/protocol.test.js

# Test TCP Server/Client integration
node tests/integration.test.js
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
│   ├── server/
│   │   └── TCPServer.js        # TCP server with connection management
│   ├── client/
│   │   └── TCPClient.js        # TCP client library
│   ├── wal/                    # [Week 3] Write-Ahead Log
│   ├── index/                  # [Week 3] B-Tree indexing
│   └── cli/                    # [Week 4] Interactive CLI
├── tests/                      # Unit and integration tests
├── data/                       # Database files (created at runtime)
│   └── db.json                 # Main database snapshot
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

### ✅ Week 2: TCP Networking (COMPLETED)

- [x] TCP server implementation
- [x] Length-prefix message framing
- [x] Multi-client connection handling
- [x] TCP client library
- [x] Connection limits and timeouts
- [x] Concurrency control (locks)
- [x] Network error handling
- [x] Graceful shutdown

### 🔄 Week 3: Indexing & Reliability (In Progress)

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

By building this project, hands-on experience gained with:

1. **Network Programming**

   - TCP socket programming in Node.js
   - Binary protocols vs text protocols
   - Message framing and buffering
   - Connection lifecycle management
   - Handling partial message delivery
   - Client-server architecture

2. **Concurrency & Race Conditions**

   - Why locks are needed in multi-client scenarios
   - Per-key locking strategies
   - Async/await in event-driven systems

3. **Data Structures**

   - Hash maps (JavaScript Map) - O(1) operations
   - B-Trees for indexing (Week 3)
   - Log-structured storage (Week 3)

4. **Systems Programming**

   - File I/O and persistence
   - Atomic operations (write-to-temp + rename)
   - Buffer management in Node.js
   - Binary data serialization
   - Error handling in distributed systems

5. **Database Internals**
   - How key-value stores work (Redis, Memcached)
   - Length-prefix framing (used by PostgreSQL, MySQL)
   - Connection pooling and limits
   - Graceful degradation under load
   - ACID properties (upcoming weeks)
   - Write-ahead logging (upcoming)
   - Query optimization (upcoming)

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

**Current Version:** v0.2.0-week2  
**Last Updated:** [Current Date]  
**Status:** Active Development 🚀

**Next Milestone:** Week 3 - B-Tree Indexing & Write-Ahead Log
