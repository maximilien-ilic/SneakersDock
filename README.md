# SneakersDock

SneakersDock est une application web permettant de consulter et d’ajouter des sneakers à une collection. Développée avec Node.js, Express et MySQL, elle se lance avec Docker Compose.

## Lancer le projet

**Prérequis :** Git, Docker et Docker Compose.

### 1. Cloner le dépôt

```bash
git clone https://github.com/maximilien-ilic/SneakersDock.git
cd SneakersDock
```

### 2. Configurer les variables d’environnement

```bash
cp .env.exemple .env
```

Les mots de passe MySQL sont fournis dans `.env.exemple` et copiés dans `.env` avec cette commande. Tu peux les modifier dans `.env` si nécessaire.

### 3. Démarrer l’application

```bash
docker compose up -d --build
```

Ouvre [http://localhost:3000](http://localhost:3000).

Au premier lancement, attends l’initialisation de MySQL puis recharge la page si nécessaire.

### Arrêter l’application

```bash
docker compose down
```

Les données sont conservées dans un volume Docker.
