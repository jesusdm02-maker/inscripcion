const fs = require('fs/promises');
const path = require('path');

const STORAGE_DIRECTORY = path.resolve(__dirname, '..', '..', 'storage');
const STORAGE_FILE = path.join(STORAGE_DIRECTORY, 'pending-solicitudes.json');
const LEGACY_DIRECTORY = path.join(STORAGE_DIRECTORY, 'pending-solicitudes');
const ATTACHMENT_FIELDS = ['foto_cedula', 'foto_alumno'];
let writeQueue = Promise.resolve();

function normalizeId(id) {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error('Identificador de solicitud inválido para almacenamiento temporal.');
  }
  return String(numericId);
}

function serializeMutation(operation) {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.catch(() => {});
  return result;
}

async function ensureStorageRoot() {
  await fs.mkdir(STORAGE_DIRECTORY, { recursive: true, mode: 0o700 });
}

async function readStore() {
  try {
    const contents = await fs.readFile(STORAGE_FILE, 'utf8');
    const store = JSON.parse(contents);
    if (store.version !== 1 || !store.solicitudes || typeof store.solicitudes !== 'object') {
      throw new Error('El archivo JSON de solicitudes temporales tiene un formato inválido.');
    }
    return store;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, solicitudes: {} };
    throw error;
  }
}

async function writeStore(store) {
  await ensureStorageRoot();
  const temporaryPath = `${STORAGE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(store), { mode: 0o600 });
  try {
    await fs.rename(temporaryPath, STORAGE_FILE);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

function buildEntry(formData, files = {}) {
  const attachments = {};
  for (const field of ATTACHMENT_FIELDS) {
    const file = files[field];
    if (!file) {
      attachments[field] = null;
      continue;
    }
    if (!Buffer.isBuffer(file.buffer)) {
      throw new Error(`El archivo temporal ${field} no tiene contenido válido.`);
    }
    attachments[field] = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: Number(file.size),
      content: file.buffer.toString('base64')
    };
  }

  return {
    version: 1,
    formData: {
      ...formData,
      foto_cedula: attachments.foto_cedula
        ? {
            originalname: attachments.foto_cedula.originalname,
            mimetype: attachments.foto_cedula.mimetype,
            size: attachments.foto_cedula.size
          }
        : formData.foto_cedula || null,
      foto_alumno: attachments.foto_alumno
        ? {
            originalname: attachments.foto_alumno.originalname,
            mimetype: attachments.foto_alumno.mimetype,
            size: attachments.foto_alumno.size
          }
        : formData.foto_alumno || null
    },
    attachments
  };
}

async function writePendingSolicitud(id, formData, files = {}) {
  const key = normalizeId(id);
  const entry = buildEntry(formData, files);
  return serializeMutation(async () => {
    const store = await readStore();
    store.solicitudes[key] = entry;
    await writeStore(store);
    return entry;
  });
}

async function readPendingSolicitud(id) {
  const key = normalizeId(id);
  await writeQueue;
  const store = await readStore();
  const entry = store.solicitudes[key];
  if (!entry) return null;

  const files = {};
  for (const field of ATTACHMENT_FIELDS) {
    const attachment = entry.attachments?.[field];
    files[field] = attachment ? {
      fieldname: field,
      originalname: attachment.originalname,
      mimetype: attachment.mimetype,
      size: Number(attachment.size),
      buffer: Buffer.from(attachment.content, 'base64')
    } : null;
  }
  return { formData: entry.formData || {}, files };
}

async function removePendingSolicitud(id) {
  const key = normalizeId(id);
  return serializeMutation(async () => {
    const store = await readStore();
    delete store.solicitudes[key];
    await writeStore(store);
  });
}

async function pendingSolicitudExists(id) {
  const key = normalizeId(id);
  await writeQueue;
  const store = await readStore();
  return Object.prototype.hasOwnProperty.call(store.solicitudes, key);
}

async function migrateLegacyDirectories(validIds) {
  const retainedIds = new Set(validIds.map(normalizeId));
  return serializeMutation(async () => {
    const store = await readStore();
    let entries;
    try {
      entries = await fs.readdir(LEGACY_DIRECTORY, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      const directory = path.join(LEGACY_DIRECTORY, entry.name);
      if (!retainedIds.has(entry.name)) {
        await fs.rm(directory, { recursive: true, force: true });
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(store.solicitudes, entry.name)) {
        const legacyDocument = JSON.parse(
          await fs.readFile(path.join(directory, 'solicitud.json'), 'utf8')
        );
        const files = {};
        const legacyFilenames = {
          foto_cedula: 'foto-cedula.bin',
          foto_alumno: 'foto-alumno.bin'
        };
        for (const field of ATTACHMENT_FIELDS) {
          const metadata = legacyDocument.attachments?.[field];
          if (!metadata) {
            files[field] = null;
            continue;
          }
          files[field] = {
            ...metadata,
            buffer: await fs.readFile(path.join(directory, legacyFilenames[field]))
          };
        }
        store.solicitudes[entry.name] = buildEntry(legacyDocument.formData || {}, files);
      }
      await writeStore(store);
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}

async function removeOrphanedPendingSolicitudes(validIds) {
  const retainedIds = new Set(validIds.map(normalizeId));
  await serializeMutation(async () => {
    const store = await readStore();
    let changed = false;
    for (const id of Object.keys(store.solicitudes)) {
      if (!retainedIds.has(id)) {
        delete store.solicitudes[id];
        changed = true;
      }
    }
    if (changed) {
      await writeStore(store);
    }

    try {
      await fs.rm(LEGACY_DIRECTORY, { recursive: true, force: true });
    } catch (error) {
      console.error('No se pudo limpiar el directorio de JSON temporales anterior:', error.message);
      throw error;
    }
  });
}

module.exports = {
  ensureStorageRoot,
  writePendingSolicitud,
  readPendingSolicitud,
  removePendingSolicitud,
  pendingSolicitudExists,
  migrateLegacyDirectories,
  removeOrphanedPendingSolicitudes
};
