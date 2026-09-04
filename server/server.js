const express = require("express");
const cors = require("cors");
const os = require("os");
const qrcode = require("qrcode-terminal");
require("dotenv").config();

const app = express();

const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get("/health", (req, res) => {
  res.json({
    name: "LANBox",
    message: "LANBox server is running",
  });
});

app.use(
  "/api",
  require("./routes/api")
);

function getLocalIPAddress() {
  const interfaces =
    os.networkInterfaces();

  for (const interfaceName in interfaces) {
    for (
      const network of interfaces[
        interfaceName
      ]
    ) {
      if (
        network.family === "IPv4" &&
        !network.internal
      ) {
        return network.address;
      }
    }
  }

  return null;
}

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    const ip =
      getLocalIPAddress();

    const url = ip
      ? `http://${ip}:5173`
      : `http://localhost:5173`;

    console.log("\n========================");
    console.log("   LANBox Server Ready");
    console.log("========================\n");

    console.log(
      `Backend: http://${ip}:${PORT}`
    );

    console.log(
      `Frontend: ${url}`
    );

    console.log(
      "\nScan this QR code with your phone:\n"
    );

    qrcode.generate(
      url,
      {
        small: true,
      }
    );

    console.log(
      "\n========================\n"
    );
  }
);