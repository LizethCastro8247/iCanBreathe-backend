const mongoose = require('mongoose');

// Cada sensor (PA, tc, dht, SPO2, voc, pm25, co2, rp) manda campos distintos,
// así que usamos un esquema flexible (strict: false) en lugar de forzar
// una estructura fija para todos los documentos.
const LecturaSchema = new mongoose.Schema(
  {
    device_id: { type: String, required: true },
    Sensor: String,
    tiempo: { type: Number, required: true } // epoch en segundos, lo manda el ESP32
  },
  {
    strict: false,
    collection: 'lecturas'
  }
);

// Índice para que las consultas "más reciente primero" sean rápidas
LecturaSchema.index({ tiempo: -1 });

module.exports = mongoose.model('Lectura', LecturaSchema);
