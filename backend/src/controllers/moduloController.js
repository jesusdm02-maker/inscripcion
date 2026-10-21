const Modulo = require('../models/moduloModel')

async function listModulos(req, res) {
  try {
    const modulos = await Modulo.getAllModulos()
    res.json(modulos)
  } catch (err) {
    console.error('No se pudieron obtener los módulos y sus páginas:', err)
    res.status(500).json({ error: 'No se pudieron obtener los módulos' })
  }
}

module.exports = { listModulos }
