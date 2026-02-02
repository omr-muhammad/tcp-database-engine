import TCPServer from "./src/server/TCPServer.js";

process.on("uncaughtException", async (err) => {
  console.log("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.log(err.name, err.message);
  await safeClose(1);
});

const host = process.env.host || "0.0.0.0";
const port = parseInt(process.env.port, 10) || 8000;

const server = new TCPServer(host, port);

console.log("╔════════════════════════════════════════════╗");
console.log("║     Key-Value Database Engine              ║");
console.log("╚════════════════════════════════════════════╝\n");

await server.start();

process.on("SIGINT", async () => {
  console.log("Shutting down server...");

  await safeClose(0);
});

process.on("unhandledRejection", async (err) => {
  console.log("UNHANDLED REJECTION! 💥 Shutting down...");
  console.log(err.name, err.message);

  await safeClose(1);
});

process.on("SIGTERM", async () => {
  console.log("👋 SIGTERM RECEIVED. Shutting down gracefully");

  await safeClose(0);
});

async function safeClose(exitCode = 1) {
  await server.shutdown();
  process.exit(exitCode);
}
