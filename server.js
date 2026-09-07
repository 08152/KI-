const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(path.join(__dirname)));


/*
  ------------------------------------------------
  HUE KONFIGURATION
  ------------------------------------------------

  Auf Render kann der Server deine Hue Bridge
  zuhause NICHT direkt erreichen.

  Deshalb muss die Hue Bridge über einen
  erreichbaren Netzwerkweg angebunden werden.

  Die Variablen werden über Render Environment
  Variables gesetzt.
*/

const HUE_BRIDGE =
  process.env.HUE_BRIDGE || "";

const HUE_USERNAME =
  process.env.HUE_USERNAME || "";


/*
  Hue API Anfrage
*/

async function hueRequest(endpoint, options={}){

  if(!HUE_BRIDGE){

    throw new Error(
      "HUE_BRIDGE ist nicht konfiguriert."
    );

  }

  if(!HUE_USERNAME){

    throw new Error(
      "HUE_USERNAME ist nicht konfiguriert."
    );

  }


  const url =
    `http://${HUE_BRIDGE}/api/${HUE_USERNAME}${endpoint}`;


  const response =
    await fetch(url,{
      ...options,

      headers:{
        "Content-Type":"application/json",
        ...(options.headers || {})
      }
    });


  const text =
    await response.text();


  let data;

  try{
    data=JSON.parse(text);
  }catch{
    data={raw:text};
  }


  if(!response.ok){

    throw new Error(
      `Hue HTTP ${response.status}`
    );

  }


  if(Array.isArray(data) && data[0]?.error){

    throw new Error(
      data[0].error.description ||
      "Hue API Fehler"
    );

  }


  return data;

}


/*
  Lampen abrufen
*/

app.get("/api/lights",async(req,res)=>{

  try{

    const lights =
      await hueRequest("/lights");

    res.json({
      lights:lights
    });

  }catch(error){

    console.error(error);

    res.status(500).json({
      error:error.message
    });

  }

});


/*
  AN / AUS
*/

app.post(
  "/api/lights/:id/power",
  async(req,res)=>{

    try{

      const id =
        req.params.id;

      const on =
        Boolean(req.body.on);


      const result =
        await hueRequest(
          `/lights/${id}/state`,
          {
            method:"PUT",
            body:JSON.stringify({
              on:on
            })
          }
        );


      res.json({
        success:true,
        result:result
      });

    }catch(error){

      console.error(error);

      res.status(500).json({
        error:error.message
      });

    }

  }
);


/*
  Helligkeit
*/

app.post(
  "/api/lights/:id/brightness",
  async(req,res)=>{

    try{

      const id =
        req.params.id;

      let brightness =
        Number(req.body.brightness);


      brightness =
        Math.max(
          1,
          Math.min(
            100,
            brightness
          )
        );


      const bri =
        Math.round(
          brightness * 254 / 100
        );


      const result =
        await hueRequest(
          `/lights/${id}/state`,
          {
            method:"PUT",
            body:JSON.stringify({
              on:true,
              bri:bri
            })
          }
        );


      res.json({
        success:true,
        brightness:brightness,
        result:result
      });

    }catch(error){

      console.error(error);

      res.status(500).json({
        error:error.message
      });

    }

  }
);


/*
  Farbe
*/

app.post(
  "/api/lights/:id/color",
  async(req,res)=>{

    try{

      const id =
        req.params.id;

      let x =
        Number(req.body.x);

      let y =
        Number(req.body.y);


      if(
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ){

        return res.status(400).json({
          error:"Ungültige Farbe"
        });

      }


      x =
        Math.max(0,Math.min(1,x));

      y =
        Math.max(0,Math.min(1,y));


      const result =
        await hueRequest(
          `/lights/${id}/state`,
          {
            method:"PUT",
            body:JSON.stringify({
              on:true,
              xy:[x,y]
            })
          }
        );


      res.json({
        success:true,
        result:result
      });

    }catch(error){

      console.error(error);

      res.status(500).json({
        error:error.message
      });

    }

  }
);


/*
  Start
*/

app.listen(
  PORT,
  "0.0.0.0",
  ()=>{
    console.log(
      `Hue Controller läuft auf Port ${PORT}`
    );
  }
);
