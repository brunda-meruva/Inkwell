// db.js — Neo4j driver singleton with full schema support
import neo4j from "neo4j-driver";
import bcrypt from "bcrypt";

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  { disableLosslessIntegers: true }
);

export async function runQuery(cypher, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

// ── Knowledge Graph Bootstrap ─────────────────────────────────────────────────
// Creates constraints and indexes for the knowledge graph
export async function bootstrapSchema() {
  const constraints = [
    "CREATE CONSTRAINT user_username IF NOT EXISTS FOR (u:User) REQUIRE u.username IS UNIQUE",
    "CREATE CONSTRAINT post_id IF NOT EXISTS FOR (p:Post) REQUIRE p.id IS UNIQUE",
    "CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE",
    "CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (tp:Topic) REQUIRE tp.name IS UNIQUE",
  ];
  for (const c of constraints) {
    try { await runQuery(c); } catch (_) { /* already exists */ }
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
export async function seedIfEmpty() {
  await bootstrapSchema();

  // Seed admin user
  const adminCheck = await runQuery("MATCH (u:User {username: 'admin'}) RETURN u");
  if (!adminCheck.length) {
    const hash = await bcrypt.hash("admin123", 10);
    await runQuery(
      `CREATE (u:User {
        id: randomUUID(),
        username: 'admin',
        displayName: 'Administrator',
        passwordHash: $hash,
        role: 'admin',
        createdAt: $now
      })`,
      { hash, now: new Date().toISOString() }
    );
    console.log("✅ Admin user created  →  username: admin  |  password: admin123");
  }

  const existing = await runQuery("MATCH (p:Post) RETURN count(p) AS cnt");
  if (existing[0].get("cnt") > 0) return;

  console.log("🌱 Seeding Neo4j with sample posts…");

  const adminRec = await runQuery("MATCH (u:User {username:'admin'}) RETURN u");
  const adminId = adminRec[0].get("u").properties.id;

  const posts = [
    {
      id: 1,
      title: "The Rise of Decentralized Finance",
      content:
        "Decentralized Finance (DeFi) is an emerging and rapidly evolving field in the blockchain industry. It refers to the shift from traditional, centralized financial systems to peer-to-peer finance enabled by decentralized technologies built on Ethereum and other blockchains.",
      authorId: adminId,
      date: "2023-08-01T10:00:00Z",
      tags: ["DeFi", "Blockchain", "Finance"],
      topic: "Technology",
    },
    {
      id: 2,
      title: "The Impact of Artificial Intelligence on Modern Businesses",
      content:
        "Artificial Intelligence (AI) is no longer a concept of the future. It's very much a part of our present, reshaping industries and enhancing the capabilities of existing systems.",
      authorId: adminId,
      date: "2023-08-05T14:30:00Z",
      tags: ["AI", "Machine Learning", "Business"],
      topic: "Technology",
    },
    {
      id: 3,
      title: "Sustainable Living: Tips for an Eco-Friendly Lifestyle",
      content:
        "Sustainability is more than just a buzzword; it's a way of life. As the effects of climate change become more pronounced, there's a growing realization about the need to live sustainably.",
      authorId: adminId,
      date: "2023-08-10T09:15:00Z",
      tags: ["Sustainability", "Climate", "Lifestyle"],
      topic: "Environment",
    },
  ];

  for (const p of posts) {
    await runQuery(
      `MATCH (u:User {id: $authorId})
       CREATE (post:Post {
         id: $id, title: $title, content: $content,
         date: $date, likes: 0
       })
       CREATE (u)-[:AUTHORED]->(post)`,
      { id: p.id, title: p.title, content: p.content, date: p.date, authorId: p.authorId }
    );
    // Knowledge graph: tags
    for (const tag of p.tags) {
      await runQuery(
        `MERGE (t:Tag {name: $tag})
         WITH t
         MATCH (post:Post {id: $id})
         MERGE (post)-[:TAGGED_WITH]->(t)`,
        { tag, id: p.id }
      );
    }
    // Knowledge graph: topic
    await runQuery(
      `MERGE (tp:Topic {name: $topic})
       WITH tp
       MATCH (post:Post {id: $id})
       MERGE (post)-[:BELONGS_TO]->(tp)`,
      { topic: p.topic, id: p.id }
    );
  }
  console.log("✅ Seed complete.");
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
export async function findUserByUsername(username) {
  const recs = await runQuery("MATCH (u:User {username: $username}) RETURN u", { username });
  return recs.length ? recs[0].get("u").properties : null;
}

export async function createUser({ username, displayName, password }) {
  const exists = await findUserByUsername(username);
  if (exists) throw new Error("Username already taken");
  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  await runQuery(
    `CREATE (u:User {
      id: randomUUID(),
      username: $username,
      displayName: $displayName,
      passwordHash: $hash,
      role: 'user',
      createdAt: $now
    })`,
    { username, displayName, hash, now }
  );
  return findUserByUsername(username);
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

// ── Post helpers ──────────────────────────────────────────────────────────────
export async function nextPostId() {
  const res = await runQuery("MATCH (p:Post) RETURN max(p.id) AS maxId");
  const max = res[0].get("maxId");
  return (max == null ? 0 : max) + 1;
}

export async function createPost({ title, content, authorId, tags = [], topic = "" }) {
  const id = await nextPostId();
  const date = new Date().toISOString();
  await runQuery(
    `MATCH (u:User {id: $authorId})
     CREATE (p:Post {id: $id, title: $title, content: $content, date: $date, likes: 0})
     CREATE (u)-[:AUTHORED]->(p)`,
    { id, title, content, authorId, date }
  );
  // Knowledge graph tags
  for (const tag of tags.filter(Boolean)) {
    await runQuery(
      `MERGE (t:Tag {name: $tag})
       WITH t MATCH (p:Post {id: $id})
       MERGE (p)-[:TAGGED_WITH]->(t)`,
      { tag: tag.trim(), id }
    );
  }
  if (topic) {
    await runQuery(
      `MERGE (tp:Topic {name: $topic})
       WITH tp MATCH (p:Post {id: $id})
       MERGE (p)-[:BELONGS_TO]->(tp)`,
      { topic, id }
    );
  }
  return id;
}

export async function getPostWithMeta(id) {
  const recs = await runQuery(
    `MATCH (u:User)-[:AUTHORED]->(p:Post {id: $id})
     OPTIONAL MATCH (p)-[:TAGGED_WITH]->(t:Tag)
     OPTIONAL MATCH (p)-[:BELONGS_TO]->(tp:Topic)
     RETURN p, u, collect(DISTINCT t.name) AS tags, tp.name AS topic`,
    { id }
  );
  if (!recs.length) return null;
  const r = recs[0];
  return {
    ...r.get("p").properties,
    author: r.get("u").properties,
    tags: r.get("tags"),
    topic: r.get("topic"),
  };
}

export async function getAllPostsWithMeta() {
  const recs = await runQuery(
    `MATCH (u:User)-[:AUTHORED]->(p:Post)
     OPTIONAL MATCH (p)-[:TAGGED_WITH]->(t:Tag)
     OPTIONAL MATCH (p)-[:BELONGS_TO]->(tp:Topic)
     OPTIONAL MATCH (c:Comment)-[:ON]->(p)
     RETURN p, u,
       collect(DISTINCT t.name) AS tags,
       tp.name AS topic,
       count(DISTINCT c) AS commentCount
     ORDER BY p.date DESC`
  );
  return recs.map((r) => ({
    ...r.get("p").properties,
    author: r.get("u").properties,
    tags: r.get("tags"),
    topic: r.get("topic"),
    commentCount: r.get("commentCount"),
  }));
}

export async function updatePost({ id, title, content, tags = [], topic = "" }) {
  const date = new Date().toISOString();
  await runQuery(
    `MATCH (p:Post {id: $id})
     SET p.title = $title, p.content = $content, p.date = $date`,
    { id, title, content, date }
  );
  // Replace tags
  await runQuery(`MATCH (p:Post {id: $id})-[r:TAGGED_WITH]->() DELETE r`, { id });
  for (const tag of tags.filter(Boolean)) {
    await runQuery(
      `MERGE (t:Tag {name: $tag})
       WITH t MATCH (p:Post {id: $id})
       MERGE (p)-[:TAGGED_WITH]->(t)`,
      { tag: tag.trim(), id }
    );
  }
  if (topic) {
    await runQuery(`MATCH (p:Post {id: $id})-[r:BELONGS_TO]->() DELETE r`, { id });
    await runQuery(
      `MERGE (tp:Topic {name: $topic})
       WITH tp MATCH (p:Post {id: $id})
       MERGE (p)-[:BELONGS_TO]->(tp)`,
      { topic, id }
    );
  }
}

export async function deletePost(id) {
  await runQuery(
    `MATCH (p:Post {id: $id})
     OPTIONAL MATCH (c:Comment)-[:ON]->(p)
     DETACH DELETE p, c`,
    { id }
  );
}

// ── Likes ─────────────────────────────────────────────────────────────────────
export async function toggleLike(postId, userId) {
  const existing = await runQuery(
    `MATCH (u:User {id: $userId})-[r:LIKED]->(p:Post {id: $postId}) RETURN r`,
    { userId, postId }
  );
  if (existing.length) {
    await runQuery(
      `MATCH (u:User {id: $userId})-[r:LIKED]->(p:Post {id: $postId})
       DELETE r
       SET p.likes = p.likes - 1`,
      { userId, postId }
    );
    return "unliked";
  } else {
    await runQuery(
      `MATCH (u:User {id: $userId}), (p:Post {id: $postId})
       CREATE (u)-[:LIKED]->(p)
       SET p.likes = p.likes + 1`,
      { userId, postId }
    );
    return "liked";
  }
}

export async function getUserLikedPosts(userId) {
  const recs = await runQuery(
    `MATCH (u:User {id: $userId})-[:LIKED]->(p:Post) RETURN p.id AS postId`,
    { userId }
  );
  return recs.map((r) => r.get("postId"));
}

// ── Comments ──────────────────────────────────────────────────────────────────
export async function addComment({ postId, userId, content }) {
  const now = new Date().toISOString();
  await runQuery(
    `MATCH (u:User {id: $userId}), (p:Post {id: $postId})
     CREATE (c:Comment {id: randomUUID(), content: $content, createdAt: $now})
     CREATE (c)-[:ON]->(p)
     CREATE (u)-[:WROTE]->(c)`,
    { userId, postId, content, now }
  );
}

export async function getComments(postId) {
  const recs = await runQuery(
    `MATCH (u:User)-[:WROTE]->(c:Comment)-[:ON]->(p:Post {id: $postId})
     RETURN c, u ORDER BY c.createdAt ASC`,
    { postId }
  );
  return recs.map((r) => ({
    ...r.get("c").properties,
    author: r.get("u").properties,
  }));
}

export async function deleteComment(commentId, requesterId, requesterRole) {
  const recs = await runQuery(
    `MATCH (u:User)-[:WROTE]->(c:Comment {id: $commentId}) RETURN u`,
    { commentId }
  );
  if (!recs.length) throw new Error("Comment not found");
  const ownerId = recs[0].get("u").properties.id;
  if (ownerId !== requesterId && requesterRole !== "admin")
    throw new Error("Forbidden");
  await runQuery(`MATCH (c:Comment {id: $commentId}) DETACH DELETE c`, { commentId });
}

// ── Knowledge Graph Query ─────────────────────────────────────────────────────
export async function getKnowledgeGraph() {
  const recs = await runQuery(
    `MATCH (u:User)-[:AUTHORED]->(p:Post)
     OPTIONAL MATCH (p)-[:TAGGED_WITH]->(t:Tag)
     OPTIONAL MATCH (p)-[:BELONGS_TO]->(tp:Topic)
     OPTIONAL MATCH (u2:User)-[:LIKED]->(p)
     RETURN
       p.id AS postId, p.title AS postTitle,
       u.username AS author, u.displayName AS authorName,
       collect(DISTINCT t.name) AS tags,
       tp.name AS topic,
       count(DISTINCT u2) AS likeCount`
  );
  return recs.map((r) => ({
    postId: r.get("postId"),
    postTitle: r.get("postTitle"),
    author: r.get("author"),
    authorName: r.get("authorName"),
    tags: r.get("tags"),
    topic: r.get("topic"),
    likeCount: r.get("likeCount"),
  }));
}

export default driver;
