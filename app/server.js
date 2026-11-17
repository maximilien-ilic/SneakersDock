
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { Pool } = require("pg");


const PORT = process.env.PORT || 3000;

const pool = new Pool();

// Évite que l'application plante si la base disparaît en cours de route.
pool.on("error", (err) => {
  console.error("Base : connexion perdue (" + err.message + ")");
  baseConnectee = false;
  setTimeout(connecterLaBase, 2000);
});

let baseConnectee = false;
let dernierMessage = "";

// Quelques chaussures inventées, ajoutées si la table est vide.
const CHAUSSURE_DE_DEPART = [
  ["NOM", "PRIX", "année de sortie", "pointure"],
  ["Lab Mac", "2026-10-12", "14:00 - 16:00", "Projet A3 - groupe 4"],
  ["Amphi B", "2026-10-13", "12:30 - 13:30", "Réunion BDE"],
  ["Salle 204", "2026-10-14", "10:00 - 12:00", "Atelier portfolio"],
  ["Studio son", "2026-10-15", "15:00 - 17:00", "Enregistrement podcast"],
];

// Se connecte à la base, crée la table si besoin et ajoute les données de départ.
// Si la base n'est pas joignable, on réessaie toutes les 2 secondes
// au lieu de planter : l'application reste utilisable sans base.
async function connecterLaBase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chaussure (
        id serial PRIMARY KEY,
        nom text NOT NULL,
        prix float NOT NULL,
        annee_sortie integer NOT NULL,
        pointure integer NOT NULL
      )
    `);

    const { rows } = await pool.query("SELECT count(*)::int AS total FROM chaussure");
    if (rows[0].total === 0) {
      for (const r of CHAUSSURE_DE_DEPART) {
        await pool.query(
          "INSERT INTO chaussure (nom, prix, annee_sortie, pointure) VALUES ($1, $2, $3, $4)",
          r
        );
      }
      console.log("Base : table créée et remplie avec 5 chaussures d'exemple");
    }

    baseConnectee = true;
    console.log("Base : connectée");
  } catch (err) {
    baseConnectee = false;
    // On n'affiche le message que s'il change, pour ne pas inonder les logs.
    const message = "Base : non connectée (" + err.message + "), nouvel essai toutes les 2 s";
    if (message !== dernierMessage) console.log(message);
    dernierMessage = message;
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
    const { rows } = await pool.query(
      "SELECT id, nom, prix, annee_sortie, pointure FROM chaussure ORDER BY nom"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Ajouter une chaussure.
app.post("/api/chaussures", async (req, res) => {
  if (!baseConnectee) {
    return res.status(503).json({ erreur: "base non connectée" });
  }
  const { nom, prix, annee_sortie, pointure } = req.body || {};
  if (!nom || !prix || !annee_sortie || !pointure) {
    return res.status(400).json({ erreur: "nom, prix, année de sortie et pointure sont obligatoires" });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO chaussure (nom, prix, annee_sortie, pointure) VALUES ($1, $2, $3, $4) RETURNING id, nom, prix, annee_sortie, pointure",
      [nom, prix, annee_sortie, pointure]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
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
