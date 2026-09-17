const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema(
  {
    correo: { type: String, required: true, unique: true, lowercase: true, trim: true },
    contraseña: { type: String, required: true },

    // Datos de registro
    nombres: String,
    apellidos: String,
    fechaNacimiento: String,
    edad: String,
    telefono: String,
    fechaRegistro: { type: Date, default: Date.now },
    estacion_asignada: { type: String, default: 'Estacion_iCanBreath_01' },

    // Datos de perfil (editables desde el Dashboard)
    nombre: String,
    genero: String,
    tipoSangre: String,
    peso: String,
    estatura: String,
    avatar: String,
    notificaciones: {
      criticas: { type: Boolean, default: true },
      silencio: { type: Boolean, default: false },
      reportes: { type: Boolean, default: true }
    }
  },
  {
    // strict: false permite guardar campos adicionales que el frontend
    // llegue a mandar en el futuro sin tener que tocar este archivo.
    strict: false,
    collection: 'usuarios'
  }
);

module.exports = mongoose.model('Usuario', UsuarioSchema);
