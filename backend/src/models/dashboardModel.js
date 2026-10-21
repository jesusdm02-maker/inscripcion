const db = require('../db');
const pendingSolicitudStorage = require('../services/pendingSolicitudStorage');

async function getSummary() {
  const [summaryRows] = await db.query(
    `SELECT
      (SELECT COUNT(*) FROM alumno) AS total_alumnos,
      (SELECT COUNT(*)
         FROM (
           SELECT MAX(p.id) AS id_preinscripcion
             FROM preinscripciones p
             JOIN r_a_d rad ON rad.id = p.id_r_a_d
            WHERE rad.id_alumno IS NOT NULL
            GROUP BY rad.id_alumno
         ) latest_enrollments
      ) AS total_inscritos,
      (SELECT COUNT(*) FROM grados) AS total_grados,
      (SELECT COUNT(*) FROM solicitudes_preinscripciones) AS total_solicitudes,
      (SELECT COUNT(*) FROM solicitudes_preinscripciones WHERE estado = 'Pendiente') AS total_solicitudes_pendientes,
      (SELECT COUNT(*) FROM solicitudes_preinscripciones WHERE estado <> 'Pendiente') AS total_solicitudes_procesadas`
  );

  const [gradeRows] = await db.query(
    `SELECT
      g.id,
      g.nombre_grado,
      COALESCE(s.nombre_seccion, 'Sin sección') AS seccion,
      COUNT(current_enrollments.id_alumno) AS estudiantes_inscritos
     FROM grados g
     LEFT JOIN r_g_s rgs ON g.id = rgs.id_grado
     LEFT JOIN seccion s ON s.id = rgs.id_seccion
     LEFT JOIN (
       SELECT current_p.id_r_g_s, current_rad.id_alumno
         FROM preinscripciones current_p
         JOIN r_a_d current_rad ON current_rad.id = current_p.id_r_a_d
         JOIN (
           SELECT latest_rad.id_alumno, MAX(latest_p.id) AS latest_id
             FROM preinscripciones latest_p
             JOIN r_a_d latest_rad ON latest_rad.id = latest_p.id_r_a_d
            WHERE latest_rad.id_alumno IS NOT NULL
            GROUP BY latest_rad.id_alumno
         ) latest_enrollments ON latest_enrollments.latest_id = current_p.id
     ) current_enrollments ON current_enrollments.id_r_g_s = rgs.id
     GROUP BY g.id, g.nombre_grado, s.nombre_seccion
     ORDER BY g.id`
  );

  const [pendingRequests] = await db.query(
    `SELECT id
       FROM solicitudes_preinscripciones
      WHERE estado = 'Pendiente'`
  );
  const pendingRequestCounts = {
    total_solicitudes_pendientes_nuevo_ingreso: 0,
    total_solicitudes_pendientes_preinscripciones: 0
  };
  const pendingData = await Promise.all(
    pendingRequests.map((request) => pendingSolicitudStorage.readPendingSolicitud(request.id))
  );
  pendingData.forEach((request) => {
    const requestType = request?.formData?.tipo_solicitud;
    if (requestType === 'preinscripcion_existente') {
      pendingRequestCounts.total_solicitudes_pendientes_preinscripciones += 1;
    } else {
      pendingRequestCounts.total_solicitudes_pendientes_nuevo_ingreso += 1;
    }
  });

  return {
    ...(summaryRows[0] || {}),
    ...pendingRequestCounts,
    grades: gradeRows || []
  };
}

module.exports = { getSummary };
