require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const Usuario = require('./models/Usuario');
const Lectura = require('./models/Lectura');

const app = express();

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS: ' + origin));
      }
    },
    credentials: true
  })
);

app.use(express.json());

// CONEXIÓN A MONGODB ATLAS
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch((err) => console.error('❌ Error conectando a MongoDB:', err.message));

app.get('/', (req, res) => {
  res.json({ status: 'ok', mensaje: 'iCanBreathe backend funcionando 🚀' });
});

// ==========================================
// 1. RUTA DE REGISTRO
// ==========================================
app.post('/api/registro', async (req, res) => {
  const { nombres, apellidos, fechaNacimiento, edad, telefono, correo, contraseña } = req.body;

  if (!correo || !contraseña || !nombres) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
  }

  try {
    const existente = await Usuario.findOne({ correo });
    if (existente) {
      return res.status(400).json({ mensaje: 'El correo ya está registrado' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(contraseña, salt);

    const nuevoUsuario = new Usuario({
      correo,
      contraseña: hashedPassword,
      nombres,
      apellidos,
      fechaNacimiento,
      edad,
      telefono,
      fechaRegistro: new Date(),
      estacion_asignada: 'Estacion_iCanBreath_01'
    });

    await nuevoUsuario.save();
    res.status(201).json({ mensaje: 'Usuario creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar en la base de datos' });
  }
});

// ==========================================
// 2. RUTA DE LOGIN
// ==========================================
app.post('/api/login', async (req, res) => {
  const { correo, contraseña } = req.body;

  if (!correo || !contraseña) {
    return res.status(400).json({ mensaje: 'Ingresa correo y contraseña' });
  }

  try {
    const usuario = await Usuario.findOne({ correo });
    if (!usuario) {
      return res.status(400).json({ mensaje: 'El usuario no existe' });
    }

    const esValida = await bcrypt.compare(contraseña, usuario.contraseña);
    if (!esValida) {
      return res.status(400).json({ mensaje: 'Contraseña incorrecta' });
    }

    const datosPublicos = usuario.toObject();
    delete datosPublicos.contraseña;

    res.json({ mensaje: 'Login exitoso', usuario: datosPublicos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error de conexión con el servidor' });
  }
});

// ==========================================
// 3. OBTENER PERFIL DE USUARIO
// ==========================================
app.get('/api/perfil/:correo', async (req, res) => {
  try {
    const usuario = await Usuario.findOne({ correo: req.params.correo });

    if (!usuario) {
      return res.status(404).json({ mensaje: 'Perfil no encontrado' });
    }

    const datosPublicos = usuario.toObject();
    delete datosPublicos.contraseña;
    res.json(datosPublicos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener perfil' });
  }
});

// ==========================================
// 4. ACTUALIZAR PERFIL DE USUARIO
// ==========================================
app.post('/api/perfil', async (req, res) => {
  const datos = { ...req.body };
  const correoUsuario = datos.email || datos.correo;

  if (!correoUsuario) return res.status(400).json({ mensaje: 'Correo requerido' });

  try {
    const existente = await Usuario.findOne({ correo: correoUsuario });
    if (!existente) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    // Si mandan una contraseña nueva en texto plano, la ciframos antes de guardar
    if (datos.password) {
      const salt = await bcrypt.genSalt(10);
      datos.contraseña = await bcrypt.hash(datos.password, salt);
    }
    delete datos.password; // nunca se guarda en texto plano

    Object.assign(existente, datos);
    await existente.save();

    res.json({ mensaje: 'Perfil actualizado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar perfil' });
  }
});

// ==========================================
// 5. RECIBIR LECTURA DE UN SENSOR (ESP32 -> Backend, por HTTP)
// ==========================================
app.post('/api/lecturas', async (req, res) => {
  try {
    const cuerpo = req.body || {};

    // Modo lote: el ESP32 manda las 8 lecturas juntas en un solo POST,
    // como { lecturas: [ {...}, {...}, ... ] }. Esto evita hacer 8
    // conexiones HTTPS separadas (8 handshakes TLS) por cada ciclo.
    if (Array.isArray(cuerpo.lecturas)) {
      if (cuerpo.lecturas.length === 0) {
        return res.status(400).json({ mensaje: 'El arreglo "lecturas" viene vacío' });
      }

      const ahora = Date.now() / 1000;
      const documentos = cuerpo.lecturas
        .filter((l) => l && l.device_id)
        .map((l) => ({ ...l, tiempo: l.tiempo || ahora }));

      if (documentos.length === 0) {
        return res.status(400).json({ mensaje: 'Ninguna lectura trae device_id' });
      }

      await Lectura.insertMany(documentos);
      return res.status(201).json({ mensaje: `${documentos.length} lecturas guardadas` });
    }

    // Modo individual (se mantiene por compatibilidad): una sola lectura
    if (!cuerpo.device_id) {
      return res.status(400).json({ mensaje: 'device_id requerido' });
    }

    const lectura = new Lectura({
      ...cuerpo,
      tiempo: cuerpo.tiempo || Date.now() / 1000
    });

    await lectura.save();
    res.status(201).json({ mensaje: 'Lectura guardada' });
  } catch (error) {
    console.error('Error guardando lectura(s):', error);
    res.status(500).json({ mensaje: 'Error al guardar lectura(s)', detalle: error.message });
  }
});

// ==========================================
// 6. OBTENER LECTURAS EN TIEMPO REAL (Backend -> React)
// ==========================================
app.get('/api/lecturas', async (req, res) => {
  try {
    // Traemos las últimas 200 lecturas, más recientes primero
    const datos = await Lectura.find().sort({ tiempo: -1 }).limit(200).lean();
    res.json(datos);
  } catch (error) {
    console.error('Error obteniendo lecturas:', error);
    res.status(500).json({
      mensaje: 'Error al obtener lecturas de MongoDB',
      detalle: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en el puerto ${PORT}`));
