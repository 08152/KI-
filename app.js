let connector =
  localStorage.getItem("ghostConnector")
  || "http://localhost:3000";


document.getElementById("connectorUrl").value =
  connector;


function saveConnector(){

  connector =
    document.getElementById("connectorUrl").value;

  localStorage.setItem(
    "ghostConnector",
    connector
  );

  alert("Connector gespeichert!");
}


async function checkPrinter(){

  const status =
    document.getElementById("printerStatus");

  status.textContent =
    "Suche Drucker...";

  try{

    const response =
      await fetch(
        connector + "/api/printer/status"
      );

    const data =
      await response.json();

    if(data.online){

      status.textContent =
        "A1 Mini verbunden";

      document.getElementById(
        "statusDot"
      ).style.background =
        "#00ff88";

    }else{

      status.textContent =
        "Drucker offline";

    }

  }catch(error){

    status.textContent =
      "Connector nicht erreichbar";

    console.error(error);

  }

}


document
  .getElementById("fileInput")
  .addEventListener(
    "change",
    function(){

      if(this.files.length){

        document.getElementById(
          "fileName"
        ).textContent =
          this.files[0].name;

      }

    }
  );
