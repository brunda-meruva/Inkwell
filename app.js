// app.js — Inkwell: full-featured blog with auth, likes, comments, knowledge graph
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import {
  seedIfEmpty,
  findUserByUsername,
  createUser,
  verifyPassword,
  createPost,
  getPostWithMeta,
  getAllPostsWithMeta,
  updatePost,
  deletePost,
  toggleLike,
  getUserLikedPosts,
  addComment,
  getComments,
  deleteComment,
  getKnowledgeGraph,
} from "./db.js";

const app = express();
const port = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "inkwell-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
  })
);

// Inject current user into all views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Auth guard middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/signin?next=" + encodeURIComponent(req.path));
  next();
}

// ── Auth Routes ───────────────────────────────────────────────────────────────

app.get("/signin", (req, res) => {
  res.render("signin", { error: null, next: req.query.next || "/" });
});

app.post("/signin", async (req, res) => {
  const { username, password, next } = req.body;
  const redirect = next || "/";
  try {
    const user = await findUserByUsername(username);
    if (!user || !(await verifyPassword(user, password))) {
      return res.render("signin", { error: "Invalid username or password", next: redirect });
    }
    req.session.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
    res.redirect(redirect);
  } catch (err) {
    res.render("signin", { error: err.message, next: redirect });
  }
});

app.get("/signup", (req, res) => {
  res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
  const { username, displayName, password, confirmPassword } = req.body;
  if (password !== confirmPassword)
    return res.render("signup", { error: "Passwords do not match" });
  if (password.length < 6)
    return res.render("signup", { error: "Password must be at least 6 characters" });
  try {
    const user = await createUser({ username, displayName: displayName || username, password });
    req.session.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
    res.redirect("/");
  } catch (err) {
    res.render("signup", { error: err.message });
  }
});

app.get("/signout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ── Frontend Routes ───────────────────────────────────────────────────────────

app.get("/", async (req, res) => {
  try {
    const posts = await getAllPostsWithMeta();
    const likedPostIds = req.session.user
      ? await getUserLikedPosts(req.session.user.id)
      : [];
    res.render("index", { posts, likedPostIds });
  } catch (err) {
    res.status(500).send("Error fetching posts: " + err.message);
  }
});

app.get("/post/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const post = await getPostWithMeta(id);
    if (!post) return res.status(404).send("Post not found");
    const comments = await getComments(id);
    const likedPostIds = req.session.user
      ? await getUserLikedPosts(req.session.user.id)
      : [];
    res.render("post", { post, comments, likedPostIds });
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

app.get("/new", requireAuth, (req, res) => {
  res.render("modify", { heading: "New Post", submit: "Publish Post", post: null, error: null });
});

app.get("/edit/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const post = await getPostWithMeta(id);
    if (!post) return res.status(404).send("Post not found");
    const user = req.session.user;
    if (post.author.id !== user.id && user.role !== "admin")
      return res.status(403).send("Forbidden: You can only edit your own posts");
    res.render("modify", { heading: "Edit Post", submit: "Save Changes", post, error: null });
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

// ── Post CRUD ─────────────────────────────────────────────────────────────────

app.post("/api/posts", requireAuth, async (req, res) => {
  try {
    const { title, content, tags, topic } = req.body;
    if (!title || !content)
      return res.status(400).send("title and content are required");
    const tagList = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    await createPost({
      title, content,
      authorId: req.session.user.id,
      tags: tagList,
      topic: topic || "",
    });
    res.redirect("/");
  } catch (err) {
    res.status(500).send("Error creating post: " + err.message);
  }
});

app.post("/api/posts/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const post = await getPostWithMeta(id);
    if (!post) return res.status(404).send("Post not found");
    const user = req.session.user;
    if (post.author.id !== user.id && user.role !== "admin")
      return res.status(403).send("Forbidden");
    const { title, content, tags, topic } = req.body;
    const tagList = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    await updatePost({ id, title, content, tags: tagList, topic: topic || "" });
    res.redirect("/");
  } catch (err) {
    res.status(500).send("Error updating post: " + err.message);
  }
});

app.get("/api/posts/delete/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const post = await getPostWithMeta(id);
    if (!post) return res.status(404).send("Post not found");
    const user = req.session.user;
    if (post.author.id !== user.id && user.role !== "admin")
      return res.status(403).send("Forbidden");
    await deletePost(id);
    res.redirect("/");
  } catch (err) {
    res.status(500).send("Error deleting post: " + err.message);
  }
});

// ── Likes ─────────────────────────────────────────────────────────────────────

app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const action = await toggleLike(postId, req.session.user.id);
    const post = await getPostWithMeta(postId);
    res.json({ action, likes: post.likes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Comments ──────────────────────────────────────────────────────────────────

app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Comment cannot be empty" });
    await addComment({ postId, userId: req.session.user.id, content: content.trim() });
    res.redirect("/post/" + postId);
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

app.get("/api/comments/:commentId/delete", requireAuth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { postId } = req.query;
    await deleteComment(commentId, req.session.user.id, req.session.user.role);
    res.redirect("/post/" + postId);
  } catch (err) {
    res.status(403).send(err.message);
  }
});

// ── Knowledge Graph ───────────────────────────────────────────────────────────

app.get("/graph", async (req, res) => {
  try {
    const data = await getKnowledgeGraph();
    res.render("graph", { graphData: JSON.stringify(data) });
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

// ── JSON API ──────────────────────────────────────────────────────────────────

app.get("/api/posts", async (req, res) => {
  try {
    const posts = await getAllPostsWithMeta();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const post = await getPostWithMeta(id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
await seedIfEmpty();
app.listen(port, () =>
  console.log(`✅ Inkwell running at http://localhost:${port}`)
);
