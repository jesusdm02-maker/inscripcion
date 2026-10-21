const db = require('../db')

async function getAllGrados() {
  const [rows] = await db.query(
    `SELECT g.id,
            g.nombre_grado,
            g.cupos_disponibles,
            COALESCE(
              GROUP_CONCAT(DISTINCT s.nombre_seccion ORDER BY s.id SEPARATOR ', '),
              'Sin secciones'
            ) AS secciones
       FROM grados g
       LEFT JOIN r_g_s rgs ON rgs.id_grado = g.id
       LEFT JOIN seccion s ON s.id = rgs.id_seccion
       GROUP BY g.id, g.nombre_grado, g.cupos_disponibles
       ORDER BY g.id ASC`
  )
  return rows
}

async function getAllSecciones() {
  const [rows] = await db.query(
    `SELECT s.id,
            s.nombre_seccion,
            COALESCE(GROUP_CONCAT(DISTINCT g.nombre_grado ORDER BY g.id SEPARATOR ', '), 'Sin asignar') AS grados
       FROM seccion s
       LEFT JOIN r_g_s rgs ON rgs.id_seccion = s.id
       LEFT JOIN grados g ON g.id = rgs.id_grado
       GROUP BY s.id, s.nombre_seccion
       ORDER BY s.id ASC`
  )
  return rows
}

async function createGrado({ nombre_grado, cupos_disponibles, id_secciones = [] }) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    const [result] = await connection.query(
      'INSERT INTO grados (nombre_grado, cupos_disponibles) VALUES (?, ?)',
      [nombre_grado, cupos_disponibles]
    )

    for (const idSeccion of id_secciones) {
      await connection.query(
        'INSERT INTO r_g_s (id_grado, id_seccion) VALUES (?, ?)',
        [result.insertId, idSeccion]
      )
    }

    await connection.commit()
    return { id_grado: result.insertId, nombre_grado, cupos_disponibles }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function createSeccion({ nombre_seccion, id_grado = null }) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    const [result] = await connection.query(
      'INSERT INTO seccion (nombre_seccion) VALUES (?)',
      [nombre_seccion]
    )

    if (id_grado) {
      await connection.query(
        'INSERT INTO r_g_s (id_grado, id_seccion) VALUES (?, ?)',
        [id_grado, result.insertId]
      )
    }

    await connection.commit()
    return { id_seccion: result.insertId, nombre_seccion, id_grado }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function updateGrado(id, { nombre_grado, cupos_disponibles }) {
  const [result] = await db.query(
    'UPDATE grados SET nombre_grado = ?, cupos_disponibles = ? WHERE id = ?',
    [nombre_grado, cupos_disponibles, id]
  )
  if (!result.affectedRows) {
    const [rows] = await db.query('SELECT id FROM grados WHERE id = ?', [id])
    if (!rows.length) return null
  }
  return { id: Number(id), nombre_grado, cupos_disponibles }
}

async function updateSeccion(id, { nombre_seccion }) {
  const [result] = await db.query(
    'UPDATE seccion SET nombre_seccion = ? WHERE id = ?',
    [nombre_seccion, id]
  )
  if (!result.affectedRows) {
    const [rows] = await db.query('SELECT id FROM seccion WHERE id = ?', [id])
    if (!rows.length) return null
  }
  return { id: Number(id), nombre_seccion }
}

async function deleteGrados(ids) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    const [grades] = await connection.query('SELECT id FROM grados WHERE id IN (?) FOR UPDATE', [ids])
    if (grades.length !== ids.length) {
      await connection.rollback()
      return { deleted: 0, missing: true }
    }

    const [[{ registrationCount }]] = await connection.query(
      `SELECT COUNT(*) AS registrationCount
         FROM preinscripciones p
         JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
        WHERE rgs.id_grado IN (?)`,
      [ids]
    )
    if (Number(registrationCount) > 0) {
      throw Object.assign(new Error('No se pueden eliminar los grados seleccionados porque alguno tiene preinscripciones asociadas'), { statusCode: 409 })
    }

    await connection.query('DELETE FROM r_g_s WHERE id_grado IN (?)', [ids])
    await connection.query('DELETE FROM grados WHERE id IN (?)', [ids])
    await connection.commit()
    return { deleted: grades.length }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function deleteGrado(id) {
  const result = await deleteGrados([id])
  return { deleted: result.deleted }
}

async function deleteSecciones(ids) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    const [sections] = await connection.query('SELECT id FROM seccion WHERE id IN (?) FOR UPDATE', [ids])
    if (sections.length !== ids.length) {
      await connection.rollback()
      return { deleted: 0, missing: true }
    }

    const [[{ registrationCount }]] = await connection.query(
      `SELECT COUNT(*) AS registrationCount
         FROM preinscripciones p
         JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
        WHERE rgs.id_seccion IN (?)`,
      [ids]
    )
    if (Number(registrationCount) > 0) {
      throw Object.assign(new Error('No se pueden eliminar las secciones seleccionadas porque alguna tiene preinscripciones asociadas'), { statusCode: 409 })
    }
    await connection.query('DELETE FROM r_g_s WHERE id_seccion IN (?)', [ids])
    await connection.query('DELETE FROM r_g_s WHERE id_seccion IN (?)', [ids])
    await connection.query('DELETE FROM seccion WHERE id IN (?)', [ids])
    await connection.commit()
    return { deleted: sections.length }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function deleteSeccion(id) {
  const result = await deleteSecciones([id])
  return { deleted: result.deleted }
}

module.exports = { getAllGrados, getAllSecciones, createGrado, createSeccion, updateGrado, updateSeccion, deleteGrado, deleteSeccion, deleteGrados, deleteSecciones }
