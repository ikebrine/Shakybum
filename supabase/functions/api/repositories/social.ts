import { db } from "../lib/db.ts";
import { newId } from "../lib/id.ts";

const UNIQUE_VIOLATION = "23505";

// ── Posts ──
function toPost(row: any) {
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, videoUrl: row.video_url, caption: row.caption,
    moveTag: row.move_tag, kind: row.kind, likesCount: row.likes_count,
    commentsCount: row.comments_count, createdAt: row.created_at,
    // Only present when the query joined against likes for a specific
    // viewer (see feed/byUser's viewerId param) — undefined otherwise,
    // not false, so callers can tell "unknown" from "confirmed not liked".
    likedByMe: row.liked_by_me === undefined ? undefined : !!row.liked_by_me,
  };
}
export const postsRepo = {
  async create({ userId, videoUrl, caption, moveTag, kind = "post" }: { userId: string; videoUrl?: string; caption?: string; moveTag?: string; kind?: string }) {
    const id = newId("post");
    const { rows } = await db.query(
      `INSERT INTO posts (id, user_id, video_url, caption, move_tag, kind) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, userId, videoUrl ?? null, caption ?? "", moveTag ?? null, kind]
    );
    return toPost(rows[0]);
  },
  async findById(id: string) {
    const { rows } = await db.query(`SELECT * FROM posts WHERE id = $1`, [id]);
    return toPost(rows[0]);
  },
  async feed({ kind = "post", limit = 30, before, viewerId }: { kind?: string; limit?: number; before?: string; viewerId?: string } = {}) {
    // viewerId present -> LEFT JOIN likes scoped to that user, so each row
    // carries whether THIS viewer liked it, without an N+1 query per post.
    if (viewerId && before) {
      const { rows } = await db.query(
        `SELECT p.*, (l.id IS NOT NULL) as liked_by_me FROM posts p
         LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = $4
         WHERE p.kind = $1 AND p.created_at < $2 ORDER BY p.created_at DESC LIMIT $3`,
        [kind, before, limit, viewerId]
      );
      return rows.map(toPost);
    }
    if (viewerId) {
      const { rows } = await db.query(
        `SELECT p.*, (l.id IS NOT NULL) as liked_by_me FROM posts p
         LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = $3
         WHERE p.kind = $1 ORDER BY p.created_at DESC LIMIT $2`,
        [kind, limit, viewerId]
      );
      return rows.map(toPost);
    }
    const { rows } = before
      ? await db.query(`SELECT * FROM posts WHERE kind = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3`, [kind, before, limit])
      : await db.query(`SELECT * FROM posts WHERE kind = $1 ORDER BY created_at DESC LIMIT $2`, [kind, limit]);
    return rows.map(toPost);
  },
  async byUser(userId: string, { kind, viewerId }: { kind?: string; viewerId?: string } = {}) {
    if (viewerId && kind) {
      const { rows } = await db.query(
        `SELECT p.*, (l.id IS NOT NULL) as liked_by_me FROM posts p
         LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = $3
         WHERE p.user_id = $1 AND p.kind = $2 ORDER BY p.created_at DESC`,
        [userId, kind, viewerId]
      );
      return rows.map(toPost);
    }
    if (viewerId) {
      const { rows } = await db.query(
        `SELECT p.*, (l.id IS NOT NULL) as liked_by_me FROM posts p
         LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = $2
         WHERE p.user_id = $1 ORDER BY p.created_at DESC`,
        [userId, viewerId]
      );
      return rows.map(toPost);
    }
    const { rows } = kind
      ? await db.query(`SELECT * FROM posts WHERE user_id = $1 AND kind = $2 ORDER BY created_at DESC`, [userId, kind])
      : await db.query(`SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows.map(toPost);
  },
  async countByUser(userId: string) {
    const { rows } = await db.query(`SELECT COUNT(*)::int as n FROM posts WHERE user_id = $1`, [userId]);
    return rows[0].n;
  },
  async delete(id: string, userId: string) {
    const { rowCount } = await db.query(`DELETE FROM posts WHERE id = $1 AND user_id = $2`, [id, userId]);
    return (rowCount ?? 0) > 0;
  },
  async incrementLikes(id: string, delta: number) {
    await db.query(`UPDATE posts SET likes_count = likes_count + $1 WHERE id = $2`, [delta, id]);
  },
  async incrementComments(id: string, delta: number) {
    await db.query(`UPDATE posts SET comments_count = comments_count + $1 WHERE id = $2`, [delta, id]);
  },
};

// ── Likes ──
export const likesRepo = {
  async add(postId: string, userId: string) {
    try {
      await db.query(`INSERT INTO likes (id, post_id, user_id) VALUES ($1, $2, $3)`, [newId("like"), postId, userId]);
      await postsRepo.incrementLikes(postId, 1);
      return true;
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) return false;
      throw err;
    }
  },
  async remove(postId: string, userId: string) {
    const { rowCount } = await db.query(`DELETE FROM likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    if ((rowCount ?? 0) > 0) await postsRepo.incrementLikes(postId, -1);
    return (rowCount ?? 0) > 0;
  },
  async hasLiked(postId: string, userId: string) {
    const { rows } = await db.query(`SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    return rows.length > 0;
  },
};

// ── Comments ──
function toComment(row: any) {
  if (!row) return null;
  return { id: row.id, postId: row.post_id, userId: row.user_id, text: row.text, createdAt: row.created_at };
}
export const commentsRepo = {
  async create({ postId, userId, text }: { postId: string; userId: string; text: string }) {
    const id = newId("cmt");
    const { rows } = await db.query(
      `INSERT INTO comments (id, post_id, user_id, text) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, postId, userId, text]
    );
    await postsRepo.incrementComments(postId, 1);
    return toComment(rows[0]);
  },
  async byPost(postId: string) {
    const { rows } = await db.query(`SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC`, [postId]);
    return rows.map(toComment);
  },
};

// ── Follows ──
export const followsRepo = {
  async follow(followerId: string, followeeId: string) {
    if (followerId === followeeId) return false;
    try {
      await db.query(`INSERT INTO follows (id, follower_id, followee_id) VALUES ($1, $2, $3)`, [newId("flw"), followerId, followeeId]);
      return true;
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) return false;
      throw err;
    }
  },
  async unfollow(followerId: string, followeeId: string) {
    const { rowCount } = await db.query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [followerId, followeeId]);
    return (rowCount ?? 0) > 0;
  },
  async isFollowing(followerId: string, followeeId: string) {
    const { rows } = await db.query(`SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2`, [followerId, followeeId]);
    return rows.length > 0;
  },
  async followerCount(userId: string) {
    const { rows } = await db.query(`SELECT COUNT(*)::int as n FROM follows WHERE followee_id = $1`, [userId]);
    return rows[0].n;
  },
  async followingCount(userId: string) {
    const { rows } = await db.query(`SELECT COUNT(*)::int as n FROM follows WHERE follower_id = $1`, [userId]);
    return rows[0].n;
  },
  async followers(userId: string) {
    const { rows } = await db.query(
      `SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = $1 ORDER BY f.created_at DESC`,
      [userId]
    );
    return rows;
  },
  async following(userId: string) {
    const { rows } = await db.query(
      `SELECT u.* FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = $1 ORDER BY f.created_at DESC`,
      [userId]
    );
    return rows;
  },
};

// ── Challenges ──
function toChallenge(row: any) {
  if (!row) return null;
  return { id: row.id, creatorId: row.creator_id, title: row.title, description: row.description, moveTag: row.move_tag, createdAt: row.created_at };
}
export const challengesRepo = {
  async create({ creatorId, title, description, moveTag }: { creatorId: string; title: string; description?: string; moveTag?: string }) {
    const id = newId("chal");
    const { rows } = await db.query(
      `INSERT INTO challenges (id, creator_id, title, description, move_tag) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, creatorId, title, description ?? "", moveTag ?? null]
    );
    return toChallenge(rows[0]);
  },
  async findById(id: string) {
    const { rows } = await db.query(`SELECT * FROM challenges WHERE id = $1`, [id]);
    return toChallenge(rows[0]);
  },
  async list({ limit = 30 }: { limit?: number } = {}) {
    const { rows } = await db.query(`SELECT * FROM challenges ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.map(toChallenge);
  },
  async addEntry({ challengeId, userId, postId }: { challengeId: string; userId: string; postId: string }) {
    const id = newId("entry");
    try {
      await db.query(
        `INSERT INTO challenge_entries (id, challenge_id, user_id, post_id) VALUES ($1, $2, $3, $4)`,
        [id, challengeId, userId, postId]
      );
      return true;
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) return false;
      throw err;
    }
  },
  async entries(challengeId: string) {
    const { rows } = await db.query(
      `SELECT ce.*, p.video_url, p.caption FROM challenge_entries ce JOIN posts p ON p.id = ce.post_id WHERE ce.challenge_id = $1 ORDER BY ce.created_at DESC`,
      [challengeId]
    );
    return rows;
  },
};
