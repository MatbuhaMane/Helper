// Counting tries in one statement (rate limits and the app lock's code), so parallel requests cannot all read the same
// count and slip through together: each request counts itself and gets its own number back (RETURNING).
// Pure strings, tested on SQLite by server/test-rate.mjs.

/** binds: key, reset_at for a new window (now + window), now, now → RETURNING count */
export const RATE_HIT_SQL =
  `INSERT INTO rate_hits (key, count, reset_at) VALUES (?, 1, ?)
   ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at < ? THEN 1 ELSE count + 1 END,
                                  reset_at = CASE WHEN reset_at < ? THEN excluded.reset_at ELSE reset_at END
   RETURNING count`;

/** a try at the app lock's code, counted before it is checked; the pause (every PAUSE_EVERY) and the close (at CLOSE_AT)
    are set by the try that reaches them. binds: PAUSE_EVERY, now + PAUSE_MS, CLOSE_AT, email, now → no row: closed or paused */
export const PIN_TRY_SQL =
  `UPDATE user_locks SET fails = COALESCE(fails, 0) + 1,
     pause_until = CASE WHEN (COALESCE(fails, 0) + 1) % ? = 0 THEN ? ELSE pause_until END,
     closed = CASE WHEN COALESCE(fails, 0) + 1 >= ? THEN 1 ELSE closed END
   WHERE email = ? AND COALESCE(closed, 0) = 0 AND COALESCE(pause_until, 0) <= ?
   RETURNING fails, pause_until, closed`;
