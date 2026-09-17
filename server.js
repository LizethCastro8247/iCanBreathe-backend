const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const app = express();

// Configuración de CORS para permitir solicitudes desde Vercel o local
app.use(cors({
    origin: '*', 
    credentials: true
}));

app.use(express.json({ limit: '10mb' })); // Límite amplio para imágenes en base64 de avatar

// --- CONFIGURACIÓN DE AWS DYNAMODB PARA RENDER ---
const awsCredentials = {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim()
};

// Si opcionalmente aún usas un token temporal, se añade
if (process.env.AWS_SESSION_TOKEN) {
    awsCredentials.sessionToken = process.env.AWS_SESSION_TOKEN.trim();
}

const client = new DynamoDBClient({ 
    region: process.env.AWS_REGION || "us-east-1",
    credentials: awsCredentials.accessKeyId ? awsCredentials : undefined
}); 

const dynamo = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMO_TABLE_USERS || "Usuarios";

// 1. RUTA DE SALUD (Health Check para Render)
app.get('/', (req, res) => {
    res.send("Servidor iCanBreathe funcionando en Render");
});

// 2. RUTA DE REGISTRO
app.post('/api/registro', async (req, res) => {
    const { nombres, apellidos, fechaNacimiento, edad, telefono, correo, contraseña } = req.body;

    if (!correo || !contraseña || !nombres) {
        return res.status(400).json({ mensaje: "Faltan campos obligatorios" });
    }

    try {
        const checkUser = new GetCommand({
            TableName: TABLE_NAME,
            Key: { correo: correo }
        });
        const existing = await dynamo.send(checkUser);
        
        if (existing.Item) {
            return res.status(400).json({ mensaje: "El correo ya está registrado" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(contraseña, salt);

        const nuevoUsuario = {
            correo,
            contraseña: hashedPassword,
            nombres,
            apellidos,
            fechaNacimiento,
            edad,
            telefono,
            fechaRegistro: new Date().toISOString(),
            estacion_asignada: "Estacion_iCanBreath_01" 
        };

        await dynamo.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: nuevoUsuario
        }));

        res.status(201).json({ mensaje: "Usuario creado exitosamente" });

    } catch (error) {
        console.error("Error en /api/registro:", error);
        res.status(500).json({ mensaje: "Error al registrar en la base de datos" });
    }
});

// 3. RUTA DE LOGIN
app.post('/api/login', async (req, res) => {
    const { correo, contraseña } = req.body;

    if (!correo || !contraseña) {
        return res.status(400).json({ mensaje: "Ingresa correo y contraseña" });
    }

    try {
        const comando = new GetCommand({
            TableName: TABLE_NAME,
            Key: { correo: correo }
        });
        
        const respuesta = await dynamo.send(comando);
        const usuario = respuesta.Item;

        if (!usuario) {
            return res.status(400).json({ mensaje: "El usuario no existe" });
        }

        const esValida = await bcrypt.compare(contraseña, usuario.contraseña);

        if (!esValida) {
            return res.status(400).json({ mensaje: "Contraseña incorrecta" });
        }

        const { contraseña: _, ...datosPublicos } = usuario;
        res.json({ 
            mensaje: "Login exitoso", 
            usuario: datosPublicos 
        });

    } catch (error) {
        console.error("Error en /api/login:", error);
        res.status(500).json({ mensaje: "Error de conexión con el servidor" });
    }
});

// 4. OBTENER PERFIL DE USUARIO
app.get('/api/perfil/:correo', async (req, res) => {
    try {
        const comando = new GetCommand({
            TableName: TABLE_NAME,
            Key: { correo: req.params.correo }
        });
        const respuesta = await dynamo.send(comando);
        
        if (respuesta.Item) {
            const { contraseña: _, ...perfilSinPassword } = respuesta.Item;
            res.json(perfilSinPassword);
        } else {
            res.status(404).json({ mensaje: "Perfil no encontrado" });
        }
    } catch (error) {
        console.error("Error en GET /api/perfil:", error);
        res.status(500).json({ mensaje: "Error al obtener perfil" });
    }
});

// 5. ACTUALIZAR/GUARDAR PERFIL DE USUARIO
app.post('/api/perfil', async (req, res) => {
    const datos = req.body;
    const correoUsuario = datos.email || datos.correo;

    if (!correoUsuario) {
        return res.status(400).json({ mensaje: "Se requiere un correo para actualizar el perfil" });
    }

    try {
        const busqueda = new GetCommand({
            TableName: TABLE_NAME,
            Key: { correo: correoUsuario }
        });
        const existente = await dynamo.send(busqueda);
        const usuarioPrevio = existente.Item || {};

        const usuarioActualizado = {
            ...usuarioPrevio,
            ...datos,
            correo: correoUsuario,
            ultimaActualizacion: new Date().toISOString()
        };

        await dynamo.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: usuarioActualizado
        }));

        res.json({ mensaje: "Perfil guardado con éxito", usuario: usuarioActualizado });
    } catch (error) {
        console.error("Error en POST /api/perfil:", error);
        res.status(500).json({ mensaje: "Error al guardar perfil en la base de datos" });
    }
});

// 6. OBTENER LECTURAS DE SENSORES
app.get('/api/lecturas', (req, res) => {
    // Retorna estructura compatible con Dashboard
    const lecturasSimuladas = [
        { device_id: 'PA', 'ritmo cardiaco': Math.floor(Math.random() * (95 - 65 + 1)) + 65, 'Presion sanguinea': '120/80' },
        { device_id: 'SPO2', Spo2: Math.floor(Math.random() * (100 - 95 + 1)) + 95 },
        { device_id: 'tc', 'temperatura corporal': (Math.random() * (37.2 - 36.1) + 36.1).toFixed(1) },
        { device_id: 'dht', Temperatura: 22, Humedad: 45 },
        { device_id: 'voc', 'Calidad de aire': Math.floor(Math.random() * 150) },
        { device_id: 'pm25', pm25: Math.floor(Math.random() * 20) },
        { device_id: 'co2', co2: Math.floor(Math.random() * (800 - 400 + 1)) + 400 },
        { device_id: 'rp', rp: (Math.random() * (1.2 - 0.8) + 0.8).toFixed(1) }
    ];

    res.json(lecturasSimuladas);
});

// INICIO DEL SERVIDOR EN PUERTO DINÁMICO PARA RENDER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado correctamente en el puerto ${PORT}`);
});