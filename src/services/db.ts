import { FactItem } from '../types';

export interface HistoryRecord {
  id: number;
  date: string;
  category: string;
  title: string;
  fact: string;
  created_at: string;
}

export interface TopicTitleOnly {
  category: string;
  title: string;
}

/**
 * Initializes the history database table if it doesn't already exist.
 */
export async function initDb(db?: D1Database): Promise<void> {
  if (!db) return;
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, fact TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
  } catch (e) {
    console.error('[DB] Error initializing history table:', e);
  }
}

/**
 * Retrieves only category & title to minimize input token usage in AI prompts.
 */
export async function getRecentTopicTitles(db?: D1Database, limit = 60): Promise<TopicTitleOnly[]> {
  if (!db) return [];
  try {
    await initDb(db);
    const { results } = await db
      .prepare(`SELECT category, title FROM history ORDER BY id DESC LIMIT ?`)
      .bind(limit)
      .all<TopicTitleOnly>();
    return results || [];
  } catch (err) {
    console.warn('[DB] Error querying topic titles:', err);
    return [];
  }
}

/**
 * Retrieves the full historical topics for the /history viewer.
 */
export async function getRecentTopics(db?: D1Database, limit = 150): Promise<HistoryRecord[]> {
  if (!db) return [];
  try {
    await initDb(db);
    const { results } = await db
      .prepare(`SELECT id, date, category, title, fact, created_at FROM history ORDER BY id DESC LIMIT ?`)
      .bind(limit)
      .all<HistoryRecord>();
    return results || [];
  } catch (err) {
    console.warn('[DB] Error querying history:', err);
    return [];
  }
}

/**
 * Saves newly generated facts to the database history.
 */
export async function saveGeneratedFacts(db: D1Database | undefined, facts: FactItem[], dateKey: string): Promise<void> {
  if (!db || !facts || facts.length === 0) return;

  try {
    await initDb(db);
    const statements = facts.map(f =>
      db
        .prepare(`INSERT INTO history (date, category, title, fact) VALUES (?, ?, ?, ?)`)
        .bind(dateKey, f.category, f.title, f.fact)
    );
    await db.batch(statements);
    console.log(`[DB] Successfully saved ${facts.length} facts to history table.`);
  } catch (err) {
    console.error('[DB] Error saving facts to history:', err);
  }
}
