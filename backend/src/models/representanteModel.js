const db = require('../db');

async function getAllRepresentantes() {
  const [rows] = await db.query(
    `SELECT r.id, r.nombres AS nombre, r.apellidos AS apellido, r.cedula, r.parentesco,
      d.municipio, d.calle, d.avenida, d.num_casa, t.numero_telefono,
      (
        SELECT GROUP_CONCAT(
                 CONCAT_WS(' ', a.nombres, a.apellidos)
                 ORDER BY a.apellidos, a.nombres
                 SEPARATOR ', '
               )
          FROM alumno a
         WHERE a.id_representante = r.id
      ) AS alumnos
     FROM representantes r
     LEFT JOIN direccion d ON r.id_direccion = d.id
     LEFT JOIN telefono t ON r.id_telefono = t.id`
  );
  return rows;
}

async function updateRepresentante(id, data) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[representante]] = await connection.query(
      'SELECT id, id_direccion, id_telefono FROM representantes WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!representante) {
      const error = new Error('Representante no encontrado.');
      error.code = 'NOT_FOUND';
      throw error;
    }

    let addressId = representante.id_direccion;
    if (addressId) {
      const [[{ shared: sharedAddress }]] = await connection.query(
        'SELECT COUNT(*) > 1 AS shared FROM representantes WHERE id_direccion = ?',
        [addressId]
      );
      if (sharedAddress) {
        const [result] = await connection.query(
          'INSERT INTO direccion (municipio, calle, avenida, num_casa) VALUES (?, ?, ?, ?)',
          [data.municipio || null, data.calle || null, data.avenida || null, data.num_casa || null]
        );
        addressId = result.insertId;
      } else {
        await connection.query(
          'UPDATE direccion SET municipio = ?, calle = ?, avenida = ?, num_casa = ? WHERE id = ?',
          [data.municipio || null, data.calle || null, data.avenida || null, data.num_casa || null, addressId]
        );
      }
    } else {
      const [result] = await connection.query(
        'INSERT INTO direccion (municipio, calle, avenida, num_casa) VALUES (?, ?, ?, ?)',
        [data.municipio || null, data.calle || null, data.avenida || null, data.num_casa || null]
      );
      addressId = result.insertId;
    }

    let phoneId = representante.id_telefono;
    if (phoneId) {
      const [[{ shared: sharedPhone }]] = await connection.query(
        'SELECT COUNT(*) > 1 AS shared FROM representantes WHERE id_telefono = ?',
        [phoneId]
      );
      if (sharedPhone) {
        const [result] = await connection.query(
          'INSERT INTO telefono (numero_telefono) VALUES (?)',
          [data.numero_telefono]
        );
        phoneId = result.insertId;
      } else {
        await connection.query('UPDATE telefono SET numero_telefono = ? WHERE id = ?', [data.numero_telefono, phoneId]);
      }
    } else {
      const [result] = await connection.query(
        'INSERT INTO telefono (numero_telefono) VALUES (?)',
        [data.numero_telefono]
      );
      phoneId = result.insertId;
    }

    await connection.query(
      `UPDATE representantes
          SET nombres = ?, apellidos = ?, cedula = ?, parentesco = ?, id_direccion = ?, id_telefono = ?
        WHERE id = ?`,
      [data.nombre, data.apellido, data.cedula, data.parentesco, addressId, phoneId, id]
    );
    await connection.commit();
    return { id: Number(id), ...data };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No se pudo revertir la actualización del representante:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteRepresentantes(ids) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, id_direccion, id_telefono FROM representantes
        WHERE id IN (${ids.map(() => '?').join(', ')}) FOR UPDATE`,
      ids
    );
    if (rows.length !== ids.length) {
      const error = new Error('Uno o más representantes seleccionados ya no existen.');
      error.code = 'NOT_FOUND';
      throw error;
    }
    const [linkedStudents] = await connection.query(
      `SELECT id_representante, COUNT(*) AS total
         FROM alumno
        WHERE id_representante IN (${ids.map(() => '?').join(', ')})
        GROUP BY id_representante`,
      ids
    );
    if (linkedStudents.length > 0) {
      const error = new Error('No se pueden eliminar representantes vinculados a alumnos. Elimina o reasigna primero esos alumnos.');
      error.code = 'HAS_STUDENTS';
      throw error;
    }

    const addressIds = rows.map((row) => row.id_direccion).filter(Boolean);
    const phoneIds = rows.map((row) => row.id_telefono).filter(Boolean);
    await connection.query(
      `DELETE FROM representantes WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids
    );
    if (addressIds.length > 0) {
      await connection.query(
        `DELETE FROM direccion WHERE id IN (${addressIds.map(() => '?').join(', ')})
          AND id NOT IN (SELECT id_direccion FROM representantes WHERE id_direccion IS NOT NULL)`,
        addressIds
      );
    }
    if (phoneIds.length > 0) {
      await connection.query(
        `DELETE FROM telefono WHERE id IN (${phoneIds.map(() => '?').join(', ')})
          AND id NOT IN (SELECT id_telefono FROM representantes WHERE id_telefono IS NOT NULL)`,
        phoneIds
      );
    }
    await connection.commit();
    return { deleted: ids.length };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No se pudo revertir la eliminación de representantes:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { getAllRepresentantes, updateRepresentante, deleteRepresentantes };
