const { io: Client } = require("h:/Remote Desk/desktop/node_modules/socket.io-client");
const socket = Client("http://localhost:4000");

socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
  // Send a buffer
  const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  socket.emit("register-host", { deviceId: "TEST-HOST", deviceName: "Test", pin: "123" }, (res) => {
    console.log("Host registered:", res);
  });
});
