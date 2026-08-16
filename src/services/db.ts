import { FactItem } from '../types';
import { RECIPIENT_EMAILS } from '../config';

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

export interface SubscriberRecord {
  id: number;
  email: string;
  created_at: string;
}

/**
 * Initializes the history and subscribers database tables if they don't already exist.
 */
export async function initDb(db?: D1Database): Promise<void> {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        fact TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Check if subscribers is empty, seed with initial list
    const countRes = await db.prepare(`SELECT COUNT(*) as count FROM subscribers`).first<{ count: number }>();
    if (countRes && countRes.count === 0 && RECIPIENT_EMAILS.length > 0) {
      const statements = RECIPIENT_EMAILS.map(email =>
        db.prepare(`INSERT OR IGNORE INTO subscribers (email) VALUES (?)`).bind(email.trim().toLowerCase())
      );
      await db.batch(statements);
      console.log(`[DB] Seeded ${RECIPIENT_EMAILS.length} default subscribers into database.`);
    }
  } catch (e) {
    console.error('[DB] Error initializing database tables:', e);
  }
}

/**
 * Retrieves the dynamic subscriber email list from database.
 */
export async function getSubscribers(db?: D1Database): Promise<string[]> {
  if (!db) return RECIPIENT_EMAILS;
  try {
    await initDb(db);
    const { results } = await db
      .prepare(`SELECT email FROM subscribers ORDER BY id ASC`)
      .all<{ email: string }>();
    
    if (!results || results.length === 0) {
      return RECIPIENT_EMAILS;
    }
    return results.map(r => r.email);
  } catch (err) {
    console.warn('[DB] Error querying subscribers, using fallback:', err);
    return RECIPIENT_EMAILS;
  }
}

/**
 * Retrieves detailed subscriber records for the management page.
 */
export async function getSubscriberRecords(db?: D1Database): Promise<SubscriberRecord[]> {
  if (!db) {
    return RECIPIENT_EMAILS.map((email, idx) => ({
      id: idx + 1,
      email,
      created_at: new Date().toISOString()
    }));
  }
  try {
    await initDb(db);
    const { results } = await db
      .prepare(`SELECT id, email, created_at FROM subscribers ORDER BY id DESC`)
      .all<SubscriberRecord>();
    return results || [];
  } catch (err) {
    console.warn('[DB] Error querying subscriber records:', err);
    return [];
  }
}

/**
 * Adds a new email subscriber to the database.
 */
export async function addSubscriber(db: D1Database | undefined, email: string): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    return { success: false, message: 'Invalid email address format.' };
  }

  if (!db) {
    return { success: false, message: 'Database binding not available.' };
  }

  try {
    await initDb(db);
    await db
      .prepare(`INSERT INTO subscribers (email) VALUES (?)`)
      .bind(cleanEmail)
      .run();
    console.log(`[DB] Added subscriber: ${cleanEmail}`);
    return { success: true, message: `Successfully added ${cleanEmail} to mailing list.` };
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE') || err?.message?.includes('constraint')) {
      return { success: false, message: `${cleanEmail} is already in your mailing list.` };
    }
    return { success: false, message: `Failed to add subscriber: ${err?.message || String(err)}` };
  }
}

/**
 * Removes an email subscriber from the database.
 */
export async function removeSubscriber(db: D1Database | undefined, email: string): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!db) {
    return { success: false, message: 'Database binding not available.' };
  }

  try {
    await initDb(db);
    const res = await db
      .prepare(`DELETE FROM subscribers WHERE email = ?`)
      .bind(cleanEmail)
      .run();

    if (res.meta.changes === 0) {
      return { success: false, message: `${cleanEmail} was not found in your mailing list.` };
    }

    console.log(`[DB] Removed subscriber: ${cleanEmail}`);
    return { success: true, message: `Successfully removed ${cleanEmail} from mailing list.` };
  } catch (err: any) {
    return { success: false, message: `Failed to remove subscriber: ${err?.message || String(err)}` };
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
