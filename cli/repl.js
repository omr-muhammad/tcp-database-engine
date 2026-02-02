/**
 * REPL - Read-Eval-Print Loop for CLI interface
 * Main entry point for the CLI client
 */
import {
  createInterface,
  displayMenu,
  displayError,
  displaySuccess,
  displayResponse,
  prompt,
  isExitCommand,
} from "./prompts.js";
import { validateOperationNumber, validateKey } from "./validators.js";
import {
  selectDataType,
  buildValueByType,
  ExitException,
} from "./valueBuilders.js";

/**
 * Available operations
 */
const OPERATIONS = [
  { name: "SET", description: "Set a key-value pair" },
  { name: "GET", description: "Get value by key" },
  { name: "DEL", description: "Delete a key" },
  { name: "LS", description: "List all keys" },
  { name: "RANGE", description: "Get range of keys" },
];

/**
 * Helper to get a valid key from user
 * @param {readline.Interface} rl - Readline interface
 * @param {string} keyLabel - Label for the key prompt
 * @returns {Promise<string>}
 * @throws {ExitException} if user exits
 */
async function getValidKey(rl, keyLabel = "key") {
  while (true) {
    const input = await prompt(rl, `Enter ${keyLabel}: `);

    if (isExitCommand(input)) {
      throw new ExitException();
    }

    const result = validateKey(input);

    if (result.valid) {
      return result.value;
    }

    displayError(result.error);
  }
}

/**
 * Handle SET operation
 * @param {readline.Interface} rl - Readline interface
 * @param {object} client - TCP client instance
 */
async function handleSet(rl, client) {
  // Get key
  const key = await getValidKey(rl);

  // Select data type
  const type = await selectDataType(rl, "Select value type:");

  // Build value
  const value = await buildValueByType(rl, type);

  // Show what will be sent
  console.log("\n📤 Sending SET request:");
  console.log(`   Key: "${key}"`);
  console.log(`   Value: ${value}`);

  // Send to server
  client.set(key, value);
}

/**
 * Handle GET operation
 * @param {readline.Interface} rl - Readline interface
 * @param {object} client - TCP client instance
 */
async function handleGet(rl, client) {
  const key = await getValidKey(rl);

  console.log(`\n📤 Sending GET request for key: "${key}"`);

  client.get(key);
}

/**
 * Handle DEL operation
 * @param {readline.Interface} rl - Readline interface
 * @param {object} client - TCP client instance
 */
async function handleDel(rl, client) {
  const key = await getValidKey(rl);

  console.log(`\n📤 Sending DEL request for key: "${key}"`);

  client.delete(key);
}

/**
 * Handle LS operation
 * @param {readline.Interface} rl - Readline interface
 * @param {object} client - TCP client instance
 */
async function handleLs(rl, client) {
  console.log("\n📤 Sending LS request...");

  client.list();
}

/**
 * Handle RANGE operation
 * @param {readline.Interface} rl - Readline interface
 * @param {object} client - TCP client instance
 */
async function handleRange(rl, client) {
  const startKey = await getValidKey(rl, "start key");
  const endKey = await getValidKey(rl, "end key");

  console.log(`\n📤 Sending RANGE request: "${startKey}" to "${endKey}"`);

  client.range(startKey, endKey);
}

/**
 * Process selected operation
 * @param {number} operationNum - Selected operation number (1-based)
 * @param {readline.Interface} rl - Readline interface
 * @param {object} client - TCP client instance
 */
async function processOperation(operationNum, rl, client) {
  const operation = OPERATIONS[operationNum - 1];

  console.log(`\n━━━ ${operation.name}: ${operation.description} ━━━`);

  switch (operation.name) {
    case "SET":
      await handleSet(rl, client);
      break;
    case "GET":
      await handleGet(rl, client);
      break;
    case "DEL":
      await handleDel(rl, client);
      break;
    case "LS":
      await handleLs(rl, client);
      break;
    case "RANGE":
      await handleRange(rl, client);
      break;
    default:
      displayError(`Unknown operation: ${operation.name}`);
  }
}

/**
 * Main REPL loop
 * @param {object} client - TCP client instance
 */
export async function startRepl(client) {
  const rl = createInterface();

  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║     Key-Value Database CLI                 ║");
  console.log('║     Type ".exit" at any prompt to quit     ║');
  console.log("╚════════════════════════════════════════════╝");

  const operationOptions = OPERATIONS.map(
    (op) => `${op.name} - ${op.description}`,
  );

  while (true) {
    try {
      // Display menu and get selection
      const input = await displayMenu(
        rl,
        "Available Operations:",
        operationOptions,
      );

      // Check for exit command
      if (isExitCommand(input)) {
        console.log("\n👋 Goodbye!\n");
        rl.close();
        process.exit(0);
      }

      // Validate operation selection
      const result = validateOperationNumber(input, OPERATIONS.length);

      if (!result.valid) {
        displayError(result.error);
        continue;
      }

      // Process the selected operation
      await processOperation(result.value, rl, client);

      // Small delay to allow response to come back
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      if (error instanceof ExitException) {
        console.log("\n⬅️  Operation cancelled. Returning to menu...");
        continue;
      }

      displayError(error.message || "An unexpected error occurred.");
      console.error("Debug:", error);
    }
  }
}

export default startRepl;
