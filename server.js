const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

// Statische Dateien ausliefern
app.use(express.static(path.join(__dirname, "public")));

// index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
