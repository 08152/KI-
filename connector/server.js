import express from "express";
import cors from "cors";
import mqtt from "mqtt";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const IP = process.env.BAMBU_IP;
const SERIAL = process.env.BAMBU_SERIAL;
const ACCESS_CODE = process.env.BAMBU_ACCESS_CODE;

let printer = {
  connected: false,
  status: "offline",
  progress: 0,
  nozzle: null,
  bed: null,
  raw: null
};

let mqttClient = null;

function connectBambu() {
  if (!IP || !SERIAL || !ACCESS_CODE) {
    console.log("Bambu-Daten fehlen in .env");
    return;
  }

  const url = `mqtts://${IP}:8883`;

  mqttClient = mqtt.connect(url, {
    username: "bblp",
    password: ACCESS_CODE,

    // Bambu-Drucker verwenden ein lokales Zertifikat.
    rejectUnauthorized: false,

    reconnectPeriod: 5000,
    connectTimeout: 10000
  });

  mqttClient.on("connect", () => {
    console.log("🟢 A1 Mini verbunden");

    printer.connected = true;
    printer.status = "connected";

    const topic = `device/${SERIAL}/report`;

    mqttClient.subscribe(topic, (error) => {
      if (error) {
        console.error("MQTT Subscribe Fehler:", error);
      } else {
        console.log("📡 Statuskanal abonniert");
      }
    });

    // Vollständigen Status anfordern
    const requestTopic = `device/${SERIAL}/request`;

    const request = {
      pushing: {
        sequence_id: String(Date.now()),
        command: "pushall"
      }
    };

    mqttClient.publish(
      requestTopic,
      JSON.stringify(request)
    );
  });

  mqttClient.on("message", (topic, message) => {
    try {
      const data = JSON.parse(message.toString());

      printer.raw = data;

      updatePrinterState(data);

    } catch (error) {
      console.error(
        "Ungültige MQTT-Nachricht:",
        error.message
      );
    }
  });

  mqttClient.on("close", () => {
    printer.connected = false;
    printer.status = "offline";

    console.log("🔴 A1 Mini Verbindung getrennt");
  });

  mqttClient.on("error", (error) => {
    console.error(
      "MQTT Fehler:",
      error.message
    );
  });
}

function updatePrinterState(data) {
  const printData = data.print;

  if (!printData) return;

  if (typeof printData.mc_percent === "number") {
    printer.progress = printData.mc_percent;
  }

  if (typeof printData.nozzle_temper === "number") {
    printer.nozzle = printData.nozzle_temper;
  }

  if (typeof printData.bed_temper === "number") {
    printer.bed = printData.bed_temper;
  }

  if (printData.gcode_state) {
    printer.status = printData.gcode_state;
  }
}

app.get("/", (req, res) => {
  res.json({
    name: "GHOST PRINT CONNECTOR",
    version: "1.0.0",
    printer: "Bambu Lab A1 Mini"
  });
});

app.get("/api/printer/status", (req, res) => {
  res.json({
    connected: printer.connected,
    status: printer.status,
    progress: printer.progress,
    nozzle: printer.nozzle,
    bed: printer.bed
  });
});

app.get("/api/printer/raw", (req, res) => {
  res.json(printer.raw || {});
});

app.listen(PORT, () => {
  console.log(
    `GHOST PRINT läuft auf http://localhost:${PORT}`
  );

  connectBambu();
});
