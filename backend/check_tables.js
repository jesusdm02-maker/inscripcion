const db = require('./src/db');
(async () => {
  try {
    const tables = ['r_m_p', 'r_mp_per', 'r_u_r', 'usuarios'];
    for (const table of tables) {
      const [rows] = await db.query(`SHOW TABLES LIKE '${table}'`);
      console.log(`${table} exists`, rows.length);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  process.exit(0);
})();
