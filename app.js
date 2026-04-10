// app.js — Single server: frontend + API + Neo4j
import express from "express";
import bodyParser from "body-parser";
import { runQuery, seedIfEmpty } from "./db.js";

const app = express();
const port = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ── Helpers ───────────────────────────────────────────────────────────────────
function recordToPost(rec) {
  return rec.get("p").properties;
}

async function nextId() {
  const res = await runQuery("MATCH (p:Post) RETURN max(p.id) AS maxId");
  const max = res[0].get("maxId");
  return (max == null ? 0 : max) + 1;
}

// ── Frontend routes ───────────────────────────────────────────────────────────

// Home — list all posts
app.get("/", async (req, res) => {
  try {
    const records = await runQuery("MATCH (p:Post) RETURN p ORDER BY p.date DESC");
    const posts = records.map(recordToPost);
    res.render("index", { posts });
  } catch (err) {
    res.status(500).send("Error fetching posts: " + err.message);
  }
});

// New post form
app.get("/new", (req, res) => {
  res.render("modify", { heading: "New Post", submit: "Publish Post", post: null });
});

// Edit post form
app.get("/edit/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const records = await runQuery("MATCH (p:Post {id: $id}) RETURN p", { id });
    if (!records.length) return res.status(404).send("Post not found");
    res.render("modify", { heading: "Edit Post", submit: "Save Changes", post: recordToPost(records[0]) });
  } catch (err) {
    res.status(500).send("Error fetching post: " + err.message);
  }
});

// ── Form action routes ────────────────────────────────────────────────────────

// Create post
app.post("/api/posts", async (req, res) => {
  try {
    const { title, content, author } = req.body;
    if (!title || !content || !author)
      return res.status(400).send("title, content, author are required");

    const id = await nextId();
    const date = new Date().toISOString();
    await runQuery(
      `CREATE (p:Post {id: $id, title: $title, content: $content, author: $author, date: $date})`,
      { id, title, content, author, date }
    );
    res.redirect("/");
  } catch (err) {
    res.status(500).send("Error creating post: " + err.message);
  }
});

// Update post
app.post("/api/posts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, content, author } = req.body;
    const date = new Date().toISOString();
    await runQuery(
      `MATCH (p:Post {id: $id})
       SET p.title   = CASE WHEN $title   IS NOT NULL THEN $title   ELSE p.title   END,
           p.content = CASE WHEN $content IS NOT NULL THEN $content ELSE p.content END,
           p.author  = CASE WHEN $author  IS NOT NULL THEN $author  ELSE p.author  END,
           p.date    = $date`,
      { id, title: title ?? null, content: content ?? null, author: author ?? null, date }
    );
    res.redirect("/");
  } catch (err) {
    res.status(500).send("Error updating post: " + err.message);
  }
});

// Delete post
app.get("/api/posts/delete/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await runQuery("MATCH (p:Post {id: $id}) DELETE p", { id });
    res.redirect("/");
  } catch (err) {
    res.status(500).send("Error deleting post: " + err.message);
  }
});

// ── API routes (JSON) ─────────────────────────────────────────────────────────

app.get("/api/posts", async (req, res) => {
  try {
    const records = await runQuery("MATCH (p:Post) RETURN p ORDER BY p.date DESC");
    res.json(records.map(recordToPost));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const records = await runQuery("MATCH (p:Post {id: $id}) RETURN p", { id });
    if (!records.length) return res.status(404).json({ message: "Post not found" });
    res.json(recordToPost(records[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
await seedIfEmpty();
app.listen(port, () =>
  console.log(`✅ Inkwell running at http://localhost:${port}`)
);
