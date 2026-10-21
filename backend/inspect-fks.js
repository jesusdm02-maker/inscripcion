const db = require('./src/db');
(async () => {
  try {
    const [rows] = await db.query("SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME = 'usuarios' OR REFERENCED_TABLE_NAME = 'user'");
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
})();
