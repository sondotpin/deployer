import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { log } from "./utils/logger.js";

mkdirSync("data", { recursive: true });

const sqlite = new Database("data/bot.db");
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS developers (
    user_id INTEGER PRIMARY KEY
  )
`);

// Seed from DEVELOPER_IDS env on first run (only if table is empty)
const count = sqlite.prepare("SELECT COUNT(*) as c FROM developers").get() as {
  c: number;
};
if (count.c === 0) {
  const raw = process.env.DEVELOPER_IDS;
  if (raw) {
    try {
      const ids = JSON.parse(raw) as number[];
      const insert = sqlite.prepare(
        "INSERT OR IGNORE INTO developers (user_id) VALUES (?)",
      );
      const seedMany = sqlite.transaction((devIds: number[]) => {
        for (const id of devIds) insert.run(id);
      });
      seedMany(ids);
      log.info(`Seeded ${ids.length} developers from env`);
    } catch {
      log.warn("Failed to parse DEVELOPER_IDS env for seeding");
    }
  }
}

const stmts = {
  add: sqlite.prepare("INSERT OR IGNORE INTO developers (user_id) VALUES (?)"),
  remove: sqlite.prepare("DELETE FROM developers WHERE user_id = ?"),
  getAll: sqlite.prepare("SELECT user_id FROM developers"),
  isDev: sqlite.prepare("SELECT 1 FROM developers WHERE user_id = ?"),
};

export const db = {
  addDev(id: number) {
    stmts.add.run(id);
  },
  removeDev(id: number) {
    stmts.remove.run(id);
  },
  getAllDevs(): number[] {
    return (stmts.getAll.all() as { user_id: number }[]).map(
      (r) => r.user_id,
    );
  },
  isDev(id: number): boolean {
    return stmts.isDev.get(id) !== undefined;
  },
};
