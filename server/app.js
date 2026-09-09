const express = require("express");
const cors = require("cors");

const app = express();

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

app.use("/api", require("./routes/api"));

module.exports = app;
