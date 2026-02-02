import net from "node:net";
import { fork, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import TCPServer from "./src/server/TCPServer.js";
import TCPClient from "./src/client/TCPClient.js";
import { startRepl } from "./cli/repl.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const host = process.env.HOST || "localhost";
const port = parseInt(process.env.TCP_PORT, 10) || 8000;

/**
 * Wait for server to be ready by attempting connections
 * @param {string} host - Server host
 * @param {number} port - Server port
 * @param {number} maxAttempts - Maximum connection attempts
 * @param {number} delay - Delay between attempts in ms
 * @returns {Promise<boolean>}
 */
async function waitForServer(host, port, maxAttempts = 30, delay = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect({ host, port }, () => {
          socket.end();
          resolve();
        });

        socket.on("error", reject);
        socket.setTimeout(1000, () => {
          socket.destroy();
          reject(new Error("Connection timeout"));
        });
      });

      return true;
    } catch (error) {
      if (attempt < maxAttempts) {
        console.log(
          `Waiting for server... (attempt ${attempt}/${maxAttempts})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return false;
}

/**
 * Start the CLI client
 */
async function startClient(server) {
  console.log("🔌 Connecting CLI client...\n");

  const client = new TCPClient(host, port);
  client.connect();

  // Give a moment for connection to establish
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Start the REPL interface
  await startRepl(client);
}

/**
 * Main application entry point
 */
async function main() {
  const serverReady = await waitForServer(host, port);

  if (!serverReady) {
    console.error("❌ Server failed to start within timeout period.");
    process.exit(1);
  }

  console.log("✅ Server is ready!\n");

  // Start the client
  try {
    await startClient();
  } catch (error) {
    console.error("Client error:", error.message);
  }

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 Shutting down...");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
