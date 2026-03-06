const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Connect to the SQLite database
const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening SQLite database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");
    
    // Create tables if they don't exist
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          user_id TEXT PRIMARY KEY,
          bearer_token TEXT,
          workspace_id TEXT
        )
      `, (err) => {
        if (err) {
          console.error("Error creating users table:", err.message);
        } else {
          console.log("Users table ready.");
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS sites (
          site_id TEXT PRIMARY KEY,
          user_id TEXT,
          workspace_id TEXT,
          project_key TEXT,
          domain TEXT
        )
      `, (err) => {
        if (err) {
          console.error("Error creating sites table:", err.message);
        } else {
          console.log("Sites table ready.");
        }
      });
    });
  }
});

module.exports = db;
