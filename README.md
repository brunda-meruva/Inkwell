# Inkwell v2 — Setup Guide

## New Features
- **Sign in / Sign up** — session-based auth with bcrypt passwords
- **Role-based access** — only post authors (or admin) can edit/delete
- **Admin account** — auto-seeded on first run
- **Author name on posts** — display name shown with avatar initial
- **Likes** — toggle like/unlike per post (auth required)
- **Comments** — add & delete comments on each post (auth required)
- **Knowledge Graph** — interactive D3 graph at `/graph` showing Posts ↔ Authors ↔ Tags ↔ Topics

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set environment variables
Create a `.env` file or export these:
```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
SESSION_SECRET=change-this-to-a-random-string
PORT=3000
```

### 3. Run
```bash
npm start
```

The server auto-seeds Neo4j on first run with 3 sample posts and the admin account.

## Admin Account
| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

**Change the admin password after first login** (update manually in Neo4j or add a change-password route).

## Folder Structure
```
├── app.js              # Express server & routes
├── db.js               # Neo4j driver, all DB helpers
├── package.json
└── views/
    ├── _nav.ejs        # Shared nav partial
    ├── index.ejs       # Home — post list
    ├── post.ejs        # Single post + comments
    ├── modify.ejs      # Create / Edit post form
    ├── signin.ejs      # Sign in page
    ├── signup.ejs      # Sign up page
    └── graph.ejs       # D3 knowledge graph
```

## Knowledge Graph in Neo4j

The app builds a rich property graph:

```
(:User)-[:AUTHORED]->(:Post)
(:User)-[:LIKED]->(:Post)
(:User)-[:WROTE]->(:Comment)-[:ON]->(:Post)
(:Post)-[:TAGGED_WITH]->(:Tag)
(:Post)-[:BELONGS_TO]->(:Topic)
```

You can explore this directly in Neo4j Browser with:
```cypher
MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100
```

Or visit `/graph` in the app for the interactive D3 visualization.

## Routes Summary

| Method | Path                          | Description                  | Auth     |
|--------|-------------------------------|------------------------------|----------|
| GET    | `/`                           | Home — all posts             | —        |
| GET    | `/post/:id`                   | Single post + comments       | —        |
| GET    | `/new`                        | New post form                | Required |
| POST   | `/api/posts`                  | Create post                  | Required |
| GET    | `/edit/:id`                   | Edit post form               | Owner/Admin |
| POST   | `/api/posts/:id`              | Update post                  | Owner/Admin |
| GET    | `/api/posts/delete/:id`       | Delete post                  | Owner/Admin |
| POST   | `/api/posts/:id/like`         | Toggle like (JSON)           | Required |
| POST   | `/api/posts/:id/comments`     | Add comment                  | Required |
| GET    | `/api/comments/:id/delete`    | Delete comment               | Owner/Admin |
| GET    | `/graph`                      | Knowledge graph page         | —        |
| GET    | `/signin`                     | Sign in page                 | —        |
| POST   | `/signin`                     | Authenticate                 | —        |
| GET    | `/signup`                     | Sign up page                 | —        |
| POST   | `/signup`                     | Create account               | —        |
| GET    | `/signout`                    | Sign out                     | —        |
