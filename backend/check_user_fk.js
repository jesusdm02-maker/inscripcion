const db = require('./src/db');
(async () => {
  try {
    const [rows] = await db.query("SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME = 'user' AND REFERENCED_COLUMN_NAME = 'id_user'");
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  process.exit(0);
})();
