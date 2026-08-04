import { db } from "../db/index.js";
import { newId } from "../lib/id.js";

// Postgres unique-violation error code — replaces the SQLITE_CONSTRAINT_UNIQUE
// string check from the pre-migration SQLite version.
const UNIQUE_VIOLATION = "23505";

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
  async create({ userId, videoUrl, caption, moveTag, kind = "post" }) {
    const id = newId("post");
    const { rows } = await db.query(
      `INSERT INTO posts (id, user_id, video_url, caption, move_tag, kind) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, userId, videoUrl ?? null, caption ?? "", moveTag ?? null, kind]
    );
    return toPost(rows[0]);
  },
  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM posts WHERE id = $1`, [id]);
    return toPost(rows[0]);
  },
  async feed({ kind = "post", limit = 30, before } = {}) {
    const { rows } = before
      ? await db.query(`SELECT * FROM posts WHERE kind = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3`, [kind, before, limit])
      : await db.query(`SELECT * FROM posts WHERE kind = $1 ORDER BY created_at DESC LIMIT $2`, [kind, limit]);
    return rows.map(toPost);
  },
  async byUser(userId, { kind } = {}) {
    const { rows } = kind
      ? await db.query(`SELECT * FROM posts WHERE user_id = $1 AND kind = $2 ORDER BY created_at DESC`, [userId, kind])
      : await db.query(`SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows.map(toPost);
  },
  async countByUser(userId) {
    const { rows } = await db.query(`SELECT COUNT(*)::int as n FROM posts WHERE user_id = $1`, [userId]);
    return rows[0].n;
  },
  async delete(id, userId) {
    const { rowCount } = await db.query(`DELETE FROM posts WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rowCount > 0;
  },
  async incrementLikes(id, delta) {
    await db.query(`UPDATE posts SET likes_count = likes_count + $1 WHERE id = $2`, [delta, id]);
  },
  async incrementComments(id, delta) {
    await db.query(`UPDATE posts SET comments_count = comments_count + $1 WHERE id = $2`, [delta, id]);
  },
};

// ── Likes ──
export const likesRepo = {
  async add(postId, userId) {
    try {
      await db.query(`INSERT INTO likes (id, post_id, user_id) VALUES ($1, $2, $3)`, [newId("like"), postId, userId]);
      await postsRepo.incrementLikes(postId, 1);
      return true;
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) return false; // already liked — idempotent
      throw err;
    }
  },
  async remove(postId, userId) {
    const { rowCount } = await db.query(`DELETE FROM likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    if (rowCount > 0) await postsRepo.incrementLikes(postId, -1);
    return rowCount > 0;
  },
  async hasLiked(postId, userId) {
    const { rows } = await db.query(`SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    return rows.length > 0;
  },
};

// ── Comments ──
function toComment(row) {
  if (!row) return null;
  return { id: row.id, postId: row.post_id, userId: row.user_id, text: row.text, createdAt: row.created_at };
}
export const commentsRepo = {
  async create({ postId, userId, text }) {
    const id = newId("cmt");
    const { rows } = await db.query(
      `INSERT INTO comments (id, post_id, user_id, text) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, postId, userId, text]
    );
    await postsRepo.incrementComments(postId, 1);
    return toComment(rows[0]);
  },
  async byPost(postId) {
    const { rows } = await db.query(`SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC`, [postId]);
    return rows.map(toComment);
  },
};

// ── Follows ──
export const followsRepo = {
  async follow(followerId, followeeId) {
    if (followerId === followeeId) return false;
    try {
      await db.query(`INSERT INTO follows (id, follower_id, followee_id) VALUES ($1, $2, $3)`, [newId("flw"), followerId, followeeId]);
      return true;
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) return false; // already following — idempotent
      throw err;
    }
  },
  async unfollow(followerId, followeeId) {
    const { rowCount } = await db.query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [followerId, followeeId]);
    return rowCount > 0;
  },
  async isFollowing(followerId, followeeId) {
    const { rows } = await db.query(`SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2`, [followerId, followeeId]);
    return rows.length > 0;
  },
  async followerCount(userId) {
    const { rows } = await db.query(`SELECT COUNT(*)::int as n FROM follows WHERE followee_id = $1`, [userId]);
    return rows[0].n;
  },
  async followingCount(userId) {
    const { rows } = await db.query(`SELECT COUNT(*)::int as n FROM follows WHERE follower_id = $1`, [userId]);
    return rows[0].n;
  },
  async followers(userId) {
    const { rows } = await db.query(
      `SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = $1 ORDER BY f.created_at DESC`,
      [userId]
    );
    return rows;
  },
  async following(userId) {
    const { rows } = await db.query(
      `SELECT u.* FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = $1 ORDER BY f.created_at DESC`,
      [userId]
    );
    return rows;
  },
};

// ── Challenges ──
function toChallenge(row) {
  if (!row) return null;
  return { id: row.id, creatorId: row.creator_id, title: row.title, description: row.description, moveTag: row.move_tag, createdAt: row.created_at };
}
export const challengesRepo = {
  async create({ creatorId, title, description, moveTag }) {
    const id = newId("chal");
    const { rows } = await db.query(
      `INSERT INTO challenges (id, creator_id, title, description, move_tag) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, creatorId, title, description ?? "", moveTag ?? null]
    );
    return toChallenge(rows[0]);
  },
  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM challenges WHERE id = $1`, [id]);
    return toChallenge(rows[0]);
  },
  async list({ limit = 30 } = {}) {
    const { rows } = await db.query(`SELECT * FROM challenges ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.map(toChallenge);
  },
  async addEntry({ challengeId, userId, postId }) {
    const id = newId("entry");
    try {
      await db.query(
        `INSERT INTO challenge_entries (id, challenge_id, user_id, post_id) VALUES ($1, $2, $3, $4)`,
        [id, challengeId, userId, postId]
      );
      return true;
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) return false;
      throw err;
    }
  },
  async entries(challengeId) {
    const { rows } = await db.query(
      `SELECT ce.*, p.video_url, p.caption FROM challenge_entries ce JOIN posts p ON p.id = ce.post_id WHERE ce.challenge_id = $1 ORDER BY ce.created_at DESC`,
      [challengeId]
    );
    return rows;
  },
};
