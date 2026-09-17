const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Para cifrar contraseñas
const mongoose = require('mongoose');

const app = express();

// --- CONFIGURACIÓN DE CORS ---
// Permite peticiones desde Vercel o local
app.use(cors({
    origin: process.env.FRONTEND_URL || '*'
}));
app.use(express.json());

// --- CONEXIÓN A MONGO DB ATLAS ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("Error: La variable de entorno MONGO_URI no está configurada.");
}

mongoose.connect(MONGO_URI)
    .then(() => console.log('Conectado con éxito a MongoDB Atlas'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// --- MODELOS Y ESQUEMAS DE MONGOOSE ---

// Esquema para la colección "Usuarios"
const usuarioSchema = new mongoose.Schema({
    correo: { type: String, required: true, unique: true },
    contraseña: { type: String, required: true },
    nombres: String,
    apellidos: String,
    fechaNacimiento: String,
    edad: SchemaTypes = Number,
    telefono: String,
    fechaRegistro: { type: String, default: () => new Date().toISOString() },
    estacion_asignada: { type: String, default: "Estacion_iCanBreath_01" }
}, { strict: false }); // strict: false permite campos flexibles si actualizas el perfil con nuevos datos

const Usuario = mongoose.model('Usuario', usuarioSchema, 'Usuarios');

// Esquema para la colección "Sensores"
const sensorSchema = new mongoose.Schema({
    tiempo: Number
}, { strict: false }); // Permite recibir cualquier tipo de lectura/medición de sensores

const Sensor = mongoose.model('Sensor', sensorSchema, 'Sensores');


// ==========================================
// 1. RUTA DE REGISTRO
// ==========================================
app.post('/api/registro', async (req, res) => {
    const { nombres, apellidos, fechaNacimiento, edad, telefono, correo, contraseña } = req.body;

    // --- VERIFICACIÓN 1: Campos vacíos ---
    if (!correo || !contraseña || !nombres) {
        return res.status(400).json({ mensaje: "Faltan campos obligatorios" });
    }

    try {
        // --- VERIFICACIÓN 2: ¿El usuario ya existe? ---
        const existing = await Usuario.findOne({ correo: correo });
        
        if (existing) {
            return res.status(400).json({ mensaje: "El correo ya está registrado" });
        }

        // --- VERIFICACIÓN 3: Cifrado de contraseña ---
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(contraseña, salt);

        // Crear el objeto del usuario
        const nuevoUsuario = new Usuario({
            correo,
            contraseña: hashedPassword,
            nombres,
            apellidos,
            fechaNacimiento,
            edad,
            telefono,
            fechaRegistro: new Date().toISOString(),
            estacion_asignada: "Estacion_iCanBreath_01" 
        });

        // Guardar en MongoDB
        await nuevoUsuario.save();

        res.status(201).json({ mensaje: "Usuario creado exitosamente" });

    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ mensaje: "Error al registrar en la base de datos" });
    }
});

// ==========================================
// 2. RUTA DE LOGIN
// ==========================================
app.post('/api/login', async (req, res) => {
    const { correo, contraseña } = req.body;

    // --- VERIFICACIÓN 1: Datos de entrada ---
    if (!correo || !contraseña) {
        return res.status(400).json({ mensaje: "Ingresa correo y contraseña" });
    }

    try {
        // --- VERIFICACIÓN 2: Buscar usuario ---
        const usuario = await Usuario.findOne({ correo: correo }).lean();

        if (!usuario) {
            return res.status(400).json({ mensaje: "El usuario no existe" });
        }

        // --- VERIFICACIÓN 3: Comparar contraseñas ---
        const esValida = await bcrypt.compare(contraseña, usuario.contraseña);

        if (!esValida) {
            return res.status(400).json({ mensaje: "Contraseña incorrecta" });
        }

        const { contraseña: _, _id, __v, ...datosPublicos } = usuario;
        res.json({ 
            mensaje: "Login exitoso", 
            usuario: datosPublicos 
        });

    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ mensaje: "Error de conexión con el servidor" });
    }
});

// ==========================================
// 4. OBTENER PERFIL DE USUARIO
// ==========================================
app.get('/api/perfil/:correo', async (req, res) => {
    try {
        const usuario = await Usuario.findOne({ correo: req.params.correo }).lean();
        
        if (usuario) {
            const { contraseña: _, _id, __v, ...datosPerfil } = usuario;
            res.json(datosPerfil);
        } else {
            res.status(404).json({ mensaje: "Perfil no encontrado" });
        }
    } catch (error) {
        console.error("Error obteniendo perfil:", error);
        res.status(500).json({ mensaje: "Error al obtener perfil" });
    }
});

// ==========================================
// 5. ACTUALIZAR PERFIL DE USUARIO
// ==========================================
app.post('/api/perfil', async (req, res) => {
    const datos = req.body;
    const correoUsuario = datos.email || datos.correo;

    if (!correoUsuario) return res.status(400).json({ mensaje: "Correo requerido" });

    try {
        const existente = await Usuario.findOne({ correo: correoUsuario });
        if (!existente) return res.status(404).json({ mensaje: "Usuario no encontrado" });

        // Si el usuario cambia la contraseña, la ciframos
        if (datos.password && datos.password !== existente.contraseña) {
            const salt = await bcrypt.genSalt(10);
            datos.contraseña = await bcrypt.hash(datos.password, salt);
            delete datos.password;
        }

        // Actualizamos los campos recibidos
        Object.assign(existente, datos);
        await existente.save();

        res.json({ mensaje: "Perfil actualizado correctamente" });
    } catch (error) {
        console.error("Error al actualizar perfil:", error);
        res.status(500).json({ mensaje: "Error al actualizar perfil" });
    }
});

// ==========================================
// 3. RUTA PARA OBTENER LECTURAS EN TIEMPO REAL
// ==========================================
app.get('/api/lecturas', async (req, res) => {
    try {
        // Obtenemos los datos ordenados por "tiempo" del más reciente al más antiguo (-1)
        const lecturas = await Sensor.find().sort({ tiempo: -1 }).lean();

        res.json(lecturas);
    } catch (error) {
        console.error("Error obteniendo lecturas:", error);
        res.status(500).json({ 
            mensaje: "Error al obtener lecturas de MongoDB", 
            detalle: error.message,
            tipo_de_error: error.name
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});