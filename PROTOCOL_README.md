# Protocol.js - TCP Communication Protocol

## Overview

`Protocol.js` implements a binary protocol for client-server communication in a key-value store system. It handles serialization and deserialization of requests and responses over TCP, supporting operations like SET, GET, DELETE, LIST, and RANGE queries.

## Protocol Specifications

### Message Structure

All messages use a **length-prefixed binary format**:

```
[4-byte Length Header][Message Payload]
```

- **Length Header**: 4 bytes (uint32BE) indicating the payload size in bytes
- **Message Payload**: Variable-length binary data containing the command and parameters

### Data Type Limits

| Type | Maximum Size | Encoding |
|------|-------------|----------|
| Key Length | 65,535 bytes (0xFFFF) | uint16BE |
| Value Length | 4,294,967,295 bytes (0xFFFFFFFF) | uint32BE |
| Command | 1 byte | uint8 |

### Field Sizes (in bytes)

| Field | Size |
|-------|------|
| Length Header | 4 |
| Command | 1 |
| Key Length | 2 |
| Value Length | 4 |

## Command Types

The protocol supports the following commands:

| Command | Code | Description |
|---------|------|-------------|
| SET | 1 | Store a key-value pair |
| GET | 2 | Retrieve a value by key |
| DEL | 3 | Delete a key-value pair |
| LS | 4 | List all keys |
| RANGE | 8 | Query keys within a range |
| RESPONSE_OK | 5 | Successful response |
| RESPONSE_FAIL | 6 | Failed operation |
| RESPONSE_ERROR | 7 | Error occurred |

## Request Formats

### SET Request

Stores a key-value pair in the database.

**Binary Layout:**
```
[4-byte Length][1-byte CMD=1][2-byte KeyLen][Key][4-byte ValueLen][Value]
```

**Example:**
```javascript
const buffer = Protocol.serializeSet("user:123", { name: "Alice", age: 30 });
// Sends: [length][0x01][keyLen][user:123][valueLen][{"name":"Alice","age":30}]
```

**Fields:**
1. Command: `0x01` (SET)
2. Key Length: 2 bytes (uint16BE)
3. Key: UTF-8 encoded string
4. Value Length: 4 bytes (uint32BE)
5. Value: JSON-stringified object as UTF-8

---

### GET Request

Retrieves a value by its key.

**Binary Layout:**
```
[4-byte Length][1-byte CMD=2][2-byte KeyLen][Key]
```

**Example:**
```javascript
const buffer = Protocol.serializeGet("user:123");
// Sends: [length][0x02][keyLen][user:123]
```

**Fields:**
1. Command: `0x02` (GET)
2. Key Length: 2 bytes (uint16BE)
3. Key: UTF-8 encoded string

---

### DEL Request

Deletes a key-value pair.

**Binary Layout:**
```
[4-byte Length][1-byte CMD=3][2-byte KeyLen][Key]
```

**Example:**
```javascript
const buffer = Protocol.serializeDelete("user:123");
// Sends: [length][0x03][keyLen][user:123]
```

**Fields:**
1. Command: `0x03` (DEL)
2. Key Length: 2 bytes (uint16BE)
3. Key: UTF-8 encoded string

---

### LS Request

Lists all keys in the database.

**Binary Layout:**
```
[4-byte Length=1][1-byte CMD=4]
```

**Example:**
```javascript
const buffer = Protocol.serializeList();
// Sends: [0x00000001][0x04]
```

**Fields:**
1. Command: `0x04` (LS)

---

### RANGE Request

Queries keys within a specified range (inclusive).

**Binary Layout:**
```
[4-byte Length][1-byte CMD=8][2-byte StartKeyLen][StartKey][2-byte EndKeyLen][EndKey]
```

**Example:**
```javascript
const buffer = Protocol.serializeRange("user:100", "user:999");
// Sends: [length][0x08][startKeyLen][user:100][endKeyLen][user:999]
```

**Fields:**
1. Command: `0x08` (RANGE)
2. Start Key Length: 2 bytes (uint16BE)
3. Start Key: UTF-8 encoded string
4. End Key Length: 2 bytes (uint16BE)
5. End Key: UTF-8 encoded string

## Response Format

All responses follow the same structure regardless of the operation.

**Binary Layout:**
```
[4-byte Length][1-byte Status][4-byte ResultLen][Result]
```

**Status Codes:**
- `0x05` - RESPONSE_OK: Operation successful
- `0x06` - RESPONSE_FAIL: Operation failed
- `0x07` - RESPONSE_ERROR: Server error occurred

**Example:**
```javascript
const buffer = Protocol.serializeResponse("ok", { value: { name: "Alice" } });
// Sends: [length][0x05][resultLen][{"value":{"name":"Alice"}}]
```

**Fields:**
1. Status: 1 byte (uint8)
2. Result Length: 4 bytes (uint32BE)
3. Result: JSON-stringified response as UTF-8

### Response Payloads

**GET Success:**
```json
{
  "value": { "name": "Alice", "age": 30 }
}
```

**SET/DEL Success:**
```json
{
  "success": true
}
```

**LS Success:**
```json
{
  "keys": ["user:123", "user:456", "config:app"]
}
```

**RANGE Success:**
```json
{
  "entries": [
    { "key": "user:100", "value": { "name": "Bob" } },
    { "key": "user:200", "value": { "name": "Carol" } }
  ]
}
```

**Error Response:**
```json
{
  "error": "Key not found",
  "code": "KEY_NOT_FOUND"
}
```

## API Usage

### Serialization (Client-Side)

```javascript
import Protocol from './Protocol.js';

// SET operation
const setBuffer = Protocol.serializeSet("user:123", { name: "Alice", age: 30 });
socket.write(setBuffer);

// GET operation
const getBuffer = Protocol.serializeGet("user:123");
socket.write(getBuffer);

// DELETE operation
const delBuffer = Protocol.serializeDelete("user:123");
socket.write(delBuffer);

// LIST operation
const listBuffer = Protocol.serializeList();
socket.write(listBuffer);

// RANGE operation
const rangeBuffer = Protocol.serializeRange("user:100", "user:999");
socket.write(rangeBuffer);
```

### Deserialization (Server-Side)

```javascript
import Protocol from './Protocol.js';

// Deserialize incoming request (without length header)
const payload = Protocol.deserializeRequest(buffer);

switch(payload.type) {
  case 'SET':
    // payload.key, payload.valueBuf
    break;
  case 'GET':
    // payload.key
    break;
  case 'DEL':
    // payload.key
    break;
  case 'LS':
    // No additional fields
    break;
  case 'RANGE':
    // payload.key (start), payload.endKey
    break;
}
```

### Response Handling

**Server-Side (Sending Response):**
```javascript
// Success response
const response = Protocol.serializeResponse("ok", { 
  value: { name: "Alice" } 
});
socket.write(response);

// Error response
const errorResponse = Protocol.serializeResponse("error", { 
  error: "Key not found" 
});
socket.write(errorResponse);
```

**Client-Side (Receiving Response):**
```javascript
// After stripping the 4-byte length header
const response = Protocol.deserializeResponse(buffer);

if (response.status === "ok") {
  console.log("Success:", response.result);
} else if (response.status === "error") {
  console.error("Error:", response.result.error);
}
```

## Implementation Details

### Length-Prefixed Framing

The protocol uses a 4-byte length prefix to handle TCP stream boundaries:

1. **Sending**: Length header is automatically added by `#addLengthHead()`
2. **Receiving**: Read 4 bytes first to determine payload size, then read exact payload

**Example TCP Stream Handling:**
```javascript
// Server-side framing
let buffer = Buffer.alloc(0);

socket.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  
  while (buffer.length >= 4) {
    const messageLength = buffer.readUint32BE(0);
    
    if (buffer.length >= 4 + messageLength) {
      const message = buffer.subarray(4, 4 + messageLength);
      const payload = Protocol.deserializeRequest(message);
      
      // Process payload...
      
      buffer = buffer.subarray(4 + messageLength);
    } else {
      break; // Wait for more data
    }
  }
});
```

### Value Encoding

- All values are **JSON-stringified** before serialization
- This allows storing complex objects, arrays, and primitive types
- Values are automatically parsed back to JavaScript objects on deserialization

### Error Handling

The protocol includes built-in validation:

```javascript
// Key length validation
if (key.length > 0xFFFF) {
  throw new Error(`Key too long: ${key.length} > 65535`);
}

// Value length validation
if (valueStr.length > 0xFFFFFFFF) {
  throw new Error(`Value too long: ${valueStr.length} > 4294967295`);
}

// Unknown command validation
if (!validCommand) {
  throw new Error(`Unknown command: ${cmd}`);
}
```

## Wire Format Examples

### SET "user:1" = {"name":"Alice"}

```
Hex Dump:
00 00 00 1F                    // Length: 31 bytes
01                             // Command: SET
00 06                          // Key length: 6
75 73 65 72 3A 31              // Key: "user:1"
00 00 00 11                    // Value length: 17
7B 22 6E 61 6D 65 22 3A 22 41 6C 69 63 65 22 7D  // Value: {"name":"Alice"}
```

### GET "user:1"

```
Hex Dump:
00 00 00 09                    // Length: 9 bytes
02                             // Command: GET
00 06                          // Key length: 6
75 73 65 72 3A 31              // Key: "user:1"
```

### Response OK with value

```
Hex Dump:
00 00 00 2A                    // Length: 42 bytes
05                             // Status: RESPONSE_OK
00 00 00 25                    // Result length: 37
7B 22 76 61 6C 75 65 22 3A 7B 22 6E 61 6D 65 22 3A 22 41 6C 69 63 65 22 7D 7D
// Result: {"value":{"name":"Alice"}}
```

## Performance Considerations

1. **Binary Encoding**: More efficient than text-based protocols (JSON/HTTP)
2. **Fixed-Size Headers**: Enables fast parsing and zero-copy operations
3. **Length Prefixing**: Eliminates need for delimiters and allows streaming
4. **Buffer Reuse**: Pre-allocate buffers based on known sizes

## Error Scenarios

| Scenario | Error Type | Response |
|----------|-----------|----------|
| Key not found | RESPONSE_FAIL | `{"error": "Key not found"}` |
| Invalid command | Exception | Connection terminated |
| Key too long | Exception | Connection terminated |
| Value too long | Exception | Connection terminated |
| Malformed data | Exception | Connection terminated |
| Server error | RESPONSE_ERROR | `{"error": "Internal error"}` |

## Protocol Extensions

To add new commands:

1. Add command code to `#CMDs` object
2. Implement serialization method (e.g., `serializeCustom()`)
3. Update `deserializeRequest()` to handle new command type
4. Document binary format and usage

## Best Practices

1. **Always validate input** before serialization
2. **Handle partial messages** when reading from TCP streams
3. **Use try-catch blocks** around deserialization
4. **Close connections** on protocol violations
5. **Log protocol errors** for debugging
6. **Version your protocol** for future compatibility

## Compatibility Notes

- Requires Node.js `Buffer` API
- Big-endian byte order (network byte order)
- UTF-8 string encoding
- JSON value serialization

## Security Considerations

1. **Input validation**: Always validate key/value lengths
2. **Resource limits**: Enforce maximum message sizes
3. **Timeout handling**: Implement read/write timeouts
4. **Error disclosure**: Avoid leaking internal details in error messages
5. **DoS protection**: Rate-limit connections and message sizes
