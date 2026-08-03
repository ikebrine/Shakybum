import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

// ── Posts ──
function toPost(row) {
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, videoUrl: row.video_url, caption: row.caption,
    moveTag: row.move_tag, kind: row.kind, likesCount: row.likes_count,
    commentsCount: row.comments_count, createdAt: row.created_at,
  };
}
export const postsRepo = {
  create({ userId, videoUrl, caption, moveTag, kind = "post" }) {
    const id = newId("post");
    db.prepare(
      `INSERT INTO posts (id, user_id, video_url, caption, move_tag, kind) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, userId, videoUrl ?? null, caption ?? "", moveTag ?? null, kind);
    return this.findById(id);
  },
  findById(id) {
    return toPost(db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id));
  },
  feed({ kind = "post", limit = 30, before } = {}) {
    const rows = before
      ? db.prepare(`SELECT * FROM posts WHERE kind = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`).all(kind, before, limit)
      : db.prepare(`SELECT * FROM posts WHERE kind = ? ORDER BY created_at DESC LIMIT ?`).all(kind, limit);
    return rows.map(toPost);
  },
  byUser(userId, { kind } = {}) {
    const rows = kind
      ? db.prepare(`SELECT * FROM posts WHERE user_id = ? AND kind = ? ORDER BY created_at DESC`).all(userId, kind)
      : db.prepare(`SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
    return rows.map(toPost);
  },
  countByUser(userId) {
    return db.prepare(`SELECT COUNT(*) as n FROM posts WHERE user_id = ?`).get(userId).n;
  },
  delete(id, userId) {
    const info = db.prepare(`DELETE FROM posts WHERE id = ? AND user_id = ?`).run(id, userId);
    return info.changes > 0;
  },
  incrementLikes(id, delta) {
    db.prepare(`UPDATE posts SET likes_count = likes_count + ? WHERE id = ?`).run(delta, id);
  },
  incrementComments(id, delta) {
    db.prepare(`UPDATE posts SET comments_count = comments_count + ? WHERE id = ?`).run(delta, id);
  },
};

// ── Likes ──
export const likesRepo = {
  add(postId, userId) {
    try {
      db.prepare(`INSERT INTO likes (id, post_id, user_id) VALUES (?, ?, ?)`).run(newId("like"), postId, userId);
      postsRepo.incrementLikes(postId, 1);
      return true;
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") return false; // already liked — idempotent
      throw err;
    }
  },
  remove(postId, userId) {
    const info = db.prepare(`DELETE FROM likes WHERE post_id = ? AND user_id = ?`).run(postId, userId);
    if (info.changes > 0) postsRepo.incrementLikes(postId, -1);
    return info.changes > 0;
  },
  hasLiked(postId, userId) {
    return !!db.prepare(`SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?`).get(postId, userId);
  },
};

// ── Comments ──
function toComment(row) {
  if (!row) return null;
  return { id: row.id, postId: row.post_id, userId: row.user_id, text: row.text, createdAt: row.created_at };
}
export const commentsRepo = {
  create({ postId, userId, text }) {
    const id = newId("cmt");
    db.prepare(`INSERT INTO comments (id, post_id, user_id, text) VALUES (?, ?, ?, ?)`).run(id, postId, userId, text);
    postsRepo.incrementComments(postId, 1);
    return this.findById(id);
  },
  findById(id) {
    return toComment(db.prepare(`SELECT * FROM comments WHERE id = ?`).get(id));
  },
  byPost(postId) {
    return db.prepare(`SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC`).all(postId).map(toComment);
  },
};

// ── Follows ──
export const followsRepo = {
  follow(followerId, followeeId) {
    if (followerId === followeeId) return false;
    try {
      db.prepare(`INSERT INTO follows (id, follower_id, followee_id) VALUES (?, ?, ?)`).run(newId("flw"), followerId, followeeId);
      return true;
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") return false; // already following — idempotent
      throw err;
    }
  },
  unfollow(followerId, followeeId) {
    const info = db.prepare(`DELETE FROM follows WHERE follower_id = ? AND followee_id = ?`).run(followerId, followeeId);
    return info.changes > 0;
  },
  isFollowing(followerId, followeeId) {
    return !!db.prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?`).get(followerId, followeeId);
  },
  followerCount(userId) {
    return db.prepare(`SELECT COUNT(*) as n FROM follows WHERE followee_id = ?`).get(userId).n;
  },
  followingCount(userId) {
    return db.prepare(`SELECT COUNT(*) as n FROM follows WHERE follower_id = ?`).get(userId).n;
  },
  followers(userId) {
    return db.prepare(
      `SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? ORDER BY f.created_at DESC`
    ).all(userId);
  },
  following(userId) {
    return db.prepare(
      `SELECT u.* FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY f.created_at DESC`
    ).all(userId);
  },
};

// ── Challenges ──
function toChallenge(row) {
  if (!row) return null;
  return { id: row.id, creatorId: row.creator_id, title: row.title, description: row.description, moveTag: row.move_tag, createdAt: row.created_at };
}
export const challengesRepo = {
  create({ creatorId, title, description, moveTag }) {
    const id = newId("chal");
    db.prepare(`INSERT INTO challenges (id, creator_id, title, description, move_tag) VALUES (?, ?, ?, ?, ?)`)
      .run(id, creatorId, title, description ?? "", moveTag ?? null);
    return this.findById(id);
  },
  findById(id) {
    return toChallenge(db.prepare(`SELECT * FROM challenges WHERE id = ?`).get(id));
  },
  list({ limit = 30 } = {}) {
    return db.prepare(`SELECT * FROM challenges ORDER BY created_at DESC LIMIT ?`).all(limit).map(toChallenge);
  },
  addEntry({ challengeId, userId, postId }) {
    const id = newId("entry");
    try {
      db.prepare(`INSERT INTO challenge_entries (id, challenge_id, user_id, post_id) VALUES (?, ?, ?, ?)`).run(id, challengeId, userId, postId);
      return true;
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") return false;
      throw err;
    }
  },
  entries(challengeId) {
    return db.prepare(
      `SELECT ce.*, p.video_url, p.caption FROM challenge_entries ce JOIN posts p ON p.id = ce.post_id WHERE ce.challenge_id = ? ORDER BY ce.created_at DESC`
    ).all(challengeId);
  },
};
