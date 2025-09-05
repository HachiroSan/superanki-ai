import { DatabaseConnectionManager } from "../adapters/database/DatabaseConnectionManager";

async function resetFilesTable() {
  const manager = DatabaseConnectionManager.getInstance();
  const db = await manager.getConnection();

  await new Promise<void>((resolve, reject) => {
    // Use function keyword to access this.changes from sqlite3
    db.run("DELETE FROM files", function (err) {
      if (err) return reject(err);
      const changes = (this as unknown as { changes?: number }).changes ?? 0;
      console.log(`Cleared files table (${changes} rows).`);
      resolve();
    });
  });

  await manager.close();
}

resetFilesTable().catch((err) => {
  console.error("Failed to reset files table:", err);
  process.exit(1);
});

