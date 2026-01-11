import net from "node:net";

const pool = new Map();
let id = 1;

const server = net.createServer();

const port = process.env.TCP_PORT;
server.listen(port, () => `Server is running on port ${port}`);

server.on("connection", handleConnections);

function handleConnections(socket) {
  const clientId = id;
  console.log(`New connection with id: ${clientId}`);

  socket.on("end", () => {
    pool.delete(clientId);
    console.log(`Client with id: ${clientId} left!`);
  });

  pool.set(clientId, socket);
  id++;
}
