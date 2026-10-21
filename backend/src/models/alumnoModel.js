const db = require('../db');

async function getAllAlumnos() {
  const [rows] = await db.query(
    `SELECT a.id, a.nombres, a.apellidos, a.fecha_nacimiento, a.alergias_condiciones,
      CONCAT_WS(' ', r.nombres, r.apellidos) as representante
     FROM alumno a
     LEFT JOIN representantes r ON a.id_representante = r.id`
  );
  return rows;
}

async function getAlumnosCount() {
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM alumno');
  return rows[0].total || 0;
}

async function getAlumnosPage(page = 1, limit = 8) {
  const offset = (page - 1) * limit;
  const [rows] = await db.query(
    `SELECT a.id, a.nombres, a.apellidos, a.fecha_nacimiento, a.alergias_condiciones,
      CONCAT_WS(' ', r.nombres, r.apellidos) as representante
     FROM alumno a
     LEFT JOIN representantes r ON a.id_representante = r.id
     ORDER BY a.id ASC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

async function searchAlumnosForPreinscripcion(searchTerm) {
  const term = `%${String(searchTerm).trim()}%`;
  const [rows] = await db.query(
    `SELECT a.id,
            a.nombres,
            a.apellidos,
            a.fecha_nacimiento,
            a.alergias_condiciones,
            CONCAT_WS(' ', r.nombres, r.apellidos) AS representante,
            r.cedula AS representante_cedula,
            t.numero_telefono AS telefono,
            d.municipio AS direccion_municipio,
            d.calle AS direccion_calle,
            d.avenida AS direccion_avenida,
            d.num_casa AS direccion_num_casa,
            (
              SELECT s.documento
                FROM solicitudes_preinscripciones s
               WHERE s.id_alumno = a.id
                 AND s.documento NOT LIKE 'PENDIENTE-%'
               ORDER BY s.id DESC
               LIMIT 1
            ) AS documento,
            p.id_periodo AS periodo_id,
            per.fecha_inicio AS periodo,
            g.id AS grado_actual_id,
            g.nombre_grado AS grado_actual
       FROM alumno a
       LEFT JOIN representantes r ON a.id_representante = r.id
       LEFT JOIN telefono t ON r.id_telefono = t.id
       LEFT JOIN direccion d ON r.id_direccion = d.id
       LEFT JOIN (
         SELECT rad.id_alumno, MAX(p.id) AS id_preinscripcion
           FROM preinscripciones p
           JOIN r_a_d rad ON rad.id = p.id_r_a_d
          GROUP BY rad.id_alumno
       ) latest ON latest.id_alumno = a.id
       LEFT JOIN preinscripciones p ON p.id = latest.id_preinscripcion
       LEFT JOIN periodo per ON per.id = p.id_periodo
       LEFT JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
       LEFT JOIN grados g ON g.id = rgs.id_grado
      WHERE a.nombres LIKE ?
         OR a.apellidos LIKE ?
         OR CONCAT_WS(' ', a.nombres, a.apellidos) LIKE ?
         OR CAST(a.id AS CHAR) = ?
         OR EXISTS (
              SELECT 1
                FROM solicitudes_preinscripciones s
               WHERE s.id_alumno = a.id
                 AND s.documento LIKE ?
         )
      ORDER BY a.apellidos, a.nombres, a.id
      LIMIT 20`,
    [term, term, term, String(searchTerm).trim(), term]
  );
  return rows;
}

async function searchStudentsForRepresentativeAccount(searchTerm) {
  const term = `%${String(searchTerm).trim()}%`;
  const exactTerm = String(searchTerm).trim();
  const [rows] = await db.query(
    `SELECT a.id,
            a.nombres,
            a.apellidos,
            r.nombres AS representante_nombre,
            r.apellidos AS representante_apellido,
            r.cedula AS representante_cedula,
            t.numero_telefono AS telefono,
            d.municipio,
            d.calle,
            d.avenida
       FROM alumno a
       JOIN representantes r ON r.id = a.id_representante
       LEFT JOIN telefono t ON t.id = r.id_telefono
       LEFT JOIN direccion d ON d.id = r.id_direccion
      WHERE a.nombres LIKE ?
         OR a.apellidos LIKE ?
         OR CONCAT_WS(' ', a.nombres, a.apellidos) LIKE ?
         OR CONCAT_WS(' ', r.nombres, r.apellidos) LIKE ?
         OR CAST(a.id AS CHAR) = ?
      ORDER BY a.apellidos, a.nombres, a.id
      LIMIT 20`,
    [term, term, term, term, exactTerm]
  );
  return rows;
}

async function getStudentRepresentativeForAccount(studentId) {
  const [[row]] = await db.query(
    `SELECT a.id,
            a.nombres,
            a.apellidos,
            r.nombres AS representante_nombre,
            r.apellidos AS representante_apellido,
            r.cedula AS representante_cedula,
            t.numero_telefono AS telefono,
            d.municipio,
            d.calle,
            d.avenida
       FROM alumno a
       JOIN representantes r ON r.id = a.id_representante
       LEFT JOIN telefono t ON t.id = r.id_telefono
       LEFT JOIN direccion d ON d.id = r.id_direccion
      WHERE a.id = ?
      LIMIT 1`,
    [studentId]
  );
  return row || null;
}

async function updateAlumno(id, data) {
  const [[existingAlumno]] = await db.query('SELECT id FROM alumno WHERE id = ?', [id]);
  if (!existingAlumno) {
    const error = new Error('Alumno no encontrado.');
    error.code = 'NOT_FOUND';
    throw error;
  }
  await db.query(
    `UPDATE alumno
        SET nombres = ?, apellidos = ?, fecha_nacimiento = ?, alergias_condiciones = ?
      WHERE id = ?`,
    [data.nombres, data.apellidos, data.fecha_nacimiento || null, data.alergias_condiciones || null, id]
  );
  return { id: Number(id), ...data };
}

async function deleteAlumnos(ids) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [students] = await connection.query(
      `SELECT id FROM alumno WHERE id IN (${ids.map(() => '?').join(', ')}) FOR UPDATE`,
      ids
    );
    if (students.length !== ids.length) {
      const error = new Error('Uno o más alumnos seleccionados ya no existen.');
      error.code = 'NOT_FOUND';
      throw error;
    }

    for (const id of ids) {
      const [documents] = await connection.query(
        'SELECT id_documento FROM r_a_d WHERE id_alumno = ?',
        [id]
      );
      const documentIds = [...new Set(documents.map((row) => Number(row.id_documento)).filter(Boolean))];
      const [enrollments] = await connection.query(
        `SELECT rgs.id_grado, COUNT(*) AS total
           FROM preinscripciones p
           JOIN r_a_d rad ON rad.id = p.id_r_a_d
           LEFT JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
          WHERE rad.id_alumno = ?
            AND p.id = (
              SELECT MAX(latest.id)
                FROM preinscripciones latest
                JOIN r_a_d latest_rad ON latest_rad.id = latest.id_r_a_d
               WHERE latest_rad.id_alumno = rad.id_alumno
            )
          GROUP BY rgs.id_grado`,
        [id]
      );

      for (const enrollment of enrollments) {
        if (enrollment.id_grado) {
          await connection.query(
            `UPDATE grados
                SET cupos_disponibles = cupos_disponibles + ?
              WHERE id = ? AND cupos_disponibles IS NOT NULL`,
            [Number(enrollment.total), enrollment.id_grado]
          );
        }
      }

      await connection.query(
        `UPDATE solicitudes_preinscripciones
            SET estado = 'Cancelada', id_alumno = NULL, id_preinscripcion = NULL, actualizado_en = NOW()
          WHERE id_alumno = ?`,
        [id]
      );
      await connection.query(
        `DELETE p FROM preinscripciones p
          JOIN r_a_d rad ON rad.id = p.id_r_a_d
         WHERE rad.id_alumno = ?`,
        [id]
      );
      await connection.query('DELETE FROM r_a_d WHERE id_alumno = ?', [id]);
      await connection.query('DELETE FROM alumno WHERE id = ?', [id]);

      if (documentIds.length > 0) {
        await connection.query(
          `DELETE FROM documento
            WHERE id IN (${documentIds.map(() => '?').join(', ')})
              AND id NOT IN (SELECT id_documento FROM r_a_d)`,
          documentIds
        );
      }
    }

    await connection.commit();
    return { deleted: ids.length };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No se pudo revertir la eliminación de alumnos:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllAlumnos,
  getAlumnosCount,
  getAlumnosPage,
  searchAlumnosForPreinscripcion,
  searchStudentsForRepresentativeAccount,
  getStudentRepresentativeForAccount,
  updateAlumno,
  deleteAlumnos
};
