import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {

  res.json({
    name: "GHOST PRINT CONNECTOR",
    online: true
  });

});


app.get(
  "/api/printer/status",
  async (req, res) => {

    const ip =
      process.env.PRINTER_IP;

    if(!ip){

      return res.json({
        online: false,
        error: "PRINTER_IP fehlt"
      });

    }

    try{

      const response =
        await fetch(
          "http://" + ip,
          {
            signal:
              AbortSignal.timeout(2000)
          }
        );

      res.json({
        online: true,
        printer: "Bambu Lab A1 Mini"
      });

    }catch{

      res.json({
        online: false,
        printer: "Bambu Lab A1 Mini"
      });

    }

  }
);


const port =
  process.env.PORT || 3000;


app.listen(
  port,
  () => {

    console.log(
      "GHOST PRINT CONNECTOR läuft auf Port "
      + port
    );

  }
);
