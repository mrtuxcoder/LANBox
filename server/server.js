const os = require("os");
const qrcode = require("qrcode-terminal");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
const app = require("./app");

const PORT = Number(process.env.PORT) || 3000;

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
