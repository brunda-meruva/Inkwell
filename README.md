# Inkwell Blog — Neo4j Edition

A beautiful editorial blog backed by **Neo4j** graph database.

## Stack
- **API server** — Express on port 4000
- **Frontend server** — Express + EJS on port 3000
- **Database** — Neo4j (local or AuraDB)

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Neo4j
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

**Options for Neo4j:**
- **Local**: Install [Neo4j Desktop](https://neo4j.com/download/) and create a database
- **Cloud free tier**: [Neo4j AuraDB](https://neo4j.com/cloud/platform/aura-graph-database/) — free 512MB instance
  - Use the `neo4j+s://` URI from AuraDB instead of `bolt://`

### 3. Start the servers

**Terminal 1 — API:**
```bash
node index.js
```

**Terminal 2 — Frontend:**
```bash
node server.js
```

Visit **http://localhost:3000**

## Neo4j Data Model

```
(:Post {
  id:      Integer,
  title:   String,
  content: String,
  author:  String,
  date:    String (ISO 8601)
})
```

The database auto-seeds 3 sample posts on first run.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /posts | All posts |
| GET | /posts/:id | Single post |
| POST | /posts | Create post |
| PATCH | /posts/:id | Update post |
| DELETE | /posts/:id | Delete post |
