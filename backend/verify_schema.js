const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'preinscripciones',
    port: 3306
  });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS solicitudes_preinscripciones (
        id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
        nombre_completo VARCHAR(255) NOT NULL,
        documento VARCHAR(100) NOT NULL,
        telefono VARCHAR(50) NOT NULL,
        correo VARCHAR(255) NOT NULL,
        contacto VARCHAR(255) NOT NULL,
        documentos JSON DEFAULT NULL,
        estado VARCHAR(50) DEFAULT 'Pendiente',
        aprobado_por VARCHAR(255) DEFAULT NULL,
        inscripcion_formal JSON DEFAULT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    const [rows] = await conn.query('SHOW TABLES LIKE "solicitudes_preinscripciones"');
    const [cols] = await conn.query('DESCRIBE solicitudes_preinscripciones');
    console.log(JSON.stringify({ exists: rows.length > 0, columns: cols }, null, 2));
  } finally {
    await conn.end();
  }
})();
