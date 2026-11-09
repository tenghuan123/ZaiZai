import type Database from 'better-sqlite3'

export function addTaskCategories(db: Database.Database): void {
  db.exec(`
    ALTER TABLE repeat_plans ADD COLUMN category TEXT CHECK(category IN ('work','life'));
    ALTER TABLE task_occurrences ADD COLUMN category TEXT
      CHECK(category IS NULL OR (plan_id IS NULL AND category IN ('work','life')));
    CREATE INDEX ix_occurrence_completed ON task_occurrences(completed_at_ms,id) WHERE status='completed';
  `)
}
