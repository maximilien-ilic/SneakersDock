const os = require("node:os");
const path = require("node:path");
const express = require("express");
const mysql = require("mysql2/promise");

const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});

let baseConnectee = false;
let dernierMessage = "";
let reconnexionEnCours = false;

// Quelques chaussures inventées, ajoutées si la table est vide.
const CHAUSSURE_DE_DEPART = [
  ["Nike Air Force 1", "119.99", "1982", "42"],
  ["Air Jordan 1 Retro High", "180.00", "1985", "43"],
  ["Adidas Superstar", "100.00", "1970", "41"],
  ["Adidas Stan Smith", "95.00", "1971", "44"],
  ["Converse Chuck Taylor All Star", "70.00", "1917", "40"],
];

// Se connecte à la base, crée la table si besoin et ajoute les données de départ.
// Si la base n'est pas joignable, on réessaie toutes les 2 secondes
// au lieu de planter : l'application reste utilisable sans base.
async function connecterLaBase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chaussure (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nom VARCHAR(255) NOT NULL,
        prix DECIMAL(8,2) NOT NULL,
        annee_sortie INT NOT NULL,
        pointure INT NOT NULL
      )
    `);

    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM chaussure");
    if (rows[0].total === 0) {
      for (const r of CHAUSSURE_DE_DEPART) {
        await pool.execute(
          "INSERT INTO chaussure (nom, prix, annee_sortie, pointure) VALUES (?, ?, ?, ?)",
          r
        );
      }
      console.log("Base : table créée et remplie avec 5 chaussures d'exemple");
    }

    baseConnectee = true;
    reconnexionEnCours = false;
    console.log("Base : connectée");
  } catch (err) {
    baseConnectee = false;
    // On n'affiche le message que s'il change, pour ne pas inonder les logs.
    const message = "Base : non connectée (" + (err.message || err.code) + "), nouvel essai toutes les 2 s";
    if (message !== dernierMessage) console.log(message);
    dernierMessage = message;
    setTimeout(connecterLaBase, 2000);
  }
}

// Si une requête échoue parce que la base a disparu, on relance la connexion.
function verifierConnexion(err) {
  const codes = ["PROTOCOL_CONNECTION_LOST", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"];
  if (codes.includes(err.code) && !reconnexionEnCours) {
    console.error("Base : connexion perdue (" + err.code + ")");
    baseConnectee = false;
    reconnexionEnCours = true;
    setTimeout(connecterLaBase, 2000);
  }
}

const app = express();
app.use(express.json());

// La page web.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// L'état de l'application. "conteneur" est le nom de la machine :
// dans Docker, c'est l'identifiant du conteneur.
app.get("/api/sante", (req, res) => {
  res.json({
    api: "ok",
    base: baseConnectee ? "connectée" : "non connectée",
    conteneur: os.hostname(),
  });
});

// La liste des chaussures.
app.get("/api/chaussures", async (req, res) => {
  if (!baseConnectee) {
    return res.status(503).json({ erreur: "base non connectée" });
  }
  try {
    const [rows] = await pool.query(
      "SELECT id, nom, prix, annee_sortie, pointure FROM chaussure ORDER BY nom"
    );
    res.json(rows);
  } catch (err) {
    verifierConnexion(err);
    res.status(500).json({ erreur: err.message });
  }
});

// Ajouter une chaussure.
app.post("/api/chaussures", async (req, res) => {
  if (!baseConnectee) {
    return res.status(503).json({ erreur: "base non connectée" });
  }
  const { nom, prix, annee_sortie, pointure } = req.body || {};
  if (!nom || prix === undefined || prix === "" || !annee_sortie || !pointure) {
    return res.status(400).json({ erreur: "nom, prix, année de sortie et pointure sont obligatoires" });
  }
  try {
    const [resultat] = await pool.execute(
      "INSERT INTO chaussure (nom, prix, annee_sortie, pointure) VALUES (?, ?, ?, ?)",
      [nom, prix, annee_sortie, pointure]
    );
    const [rows] = await pool.query(
      "SELECT id, nom, prix, annee_sortie, pointure FROM chaussure WHERE id = ?",
      [resultat.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    verifierConnexion(err);
    res.status(400).json({ erreur: err.message });
  }
});

// On démarre le serveur web tout de suite, puis on tente la base en tâche de fond.
app.listen(PORT, () => {
  console.log("SneakersDock : application démarrée sur le port " + PORT);
  connecterLaBase();
});

// Arrêt propre quand Docker demande au conteneur de s'arrêter (docker stop).
process.on("SIGTERM", () => {
  console.log("SneakersDock : arrêt demandé, au revoir");
  process.exit(0);
});