const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Para cifrar contraseñas
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE AWS ---
const client = new DynamoDBClient({ region: "us-east-1" }); 
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "Usuarios";

// 1. RUTA DE REGISTRO
app.post('/api/registro', async (req, res) => {
    const { nombres, apellidos, fechaNacimiento, edad, telefono, correo, contraseña } = req.body;

    // --- VERIFICACIÓN 1: Campos vacíos ---
    if (!correo || !contraseña || !nombres) {
        return res.status(400).json({ mensaje: "Faltan campos obligatorios" });
    }

    try {
        // --- VERIFICACIÓN 2: ¿El usuario ya existe? ---
        const checkUser = new GetCommand({
            TableName: TABLE_NAME,
            Key: { correo: correo }
        });
        const existing = await dynamo.send(checkUser);
        
        if (existing.Item) {
            return res.status(400).json({ mensaje: "El correo ya está registrado" });
        }

        // --- VERIFICACIÓN 3: Cifrado de contraseña ---
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(contraseña, salt);

        // Preparar el objeto del usuario
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

        // Guardar en DynamoDB
        await dynamo.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: nuevoUsuario
        }));

        res.status(201).json({ mensaje: "Usuario creado exitosamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error al registrar en la base de datos" });
    }
});

// 2. RUTA DE LOGIN
app.post('/api/login', async (req, res) => {
    const { correo, contraseña } = req.body;

    // --- VERIFICACIÓN 1: Datos de entrada ---
    if (!correo || !contraseña) {
        return res.status(400).json({ mensaje: "Ingresa correo y contraseña" });
    }

    try {
        // --- VERIFICACIÓN 2: Buscar usuario ---
        const comando = new GetCommand({
            TableName: TABLE_NAME,
            Key: { correo: correo }
        });
        
        const respuesta = await dynamo.send(comando);
        const usuario = respuesta.Item;

        if (!usuario) {
            return res.status(400).json({ mensaje: "El usuario no existe" });
        }

        // --- VERIFICACIÓN 3: Comparar contraseñas ---
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
        console.error(error);
        res.status(500).json({ mensaje: "Error de conexión con el servidor" });
    }
});

// ==========================================
// 4. OBTENER PERFIL DE USUARIO
// ==========================================
app.get('/api/perfil/:correo', async (req, res) => {
    try {
        const comando = new GetCommand({
            TableName: TABLE_NAME,
            Key: { correo: req.params.correo }
        });
        const respuesta = await dynamo.send(comando);
        
        if (respuesta.Item) {
            res.json(respuesta.Item);
        } else {
            res.status(404).json({ mensaje: "Perfil no encontrado" });
        }
    } catch (error) {
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
        // Obtenemos el usuario actual para no sobreescribir datos importantes
        const existente = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { correo: correoUsuario } }));
        if (!existente.Item) return res.status(404).json({ mensaje: "Usuario no encontrado" });

        let usuarioActualizado = { ...existente.Item, ...datos };

        // Si el usuario cambió la contraseña, la volvemos a cifrar
        if (datos.password && datos.password !== existente.Item.contraseña) {
             const salt = await bcrypt.genSalt(10);
             usuarioActualizado.contraseña = await bcrypt.hash(datos.password, salt);
        }

        // Guardamos en DynamoDB
        await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: usuarioActualizado }));
        res.json({ mensaje: "Perfil actualizado correctamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error al actualizar perfil" });
    }
});

// ==========================================
// 3. RUTA PARA OBTENER LECTURAS EN TIEMPO REAL
// ==========================================
app.get('/api/lecturas', async (req, res) => {
    try {
        // Obtenemos los datos de la tabla de sensores
        const comando = new ScanCommand({
            TableName: "Sensores"
        });
        const respuesta = await dynamo.send(comando);
        
        // Ordenamos los datos por "tiempo" (del más reciente al más antiguo)
        const datosOrdenados = respuesta.Items.sort((a, b) => b.tiempo - a.tiempo);

        // Enviamos los datos a React
        res.json(datosOrdenados);
    } catch (error) {
        console.error("Error obteniendo lecturas:", error);
        // Le agregamos "detalle" para que el servidor nos confiese qué salió mal
        res.status(500).json({ 
            mensaje: "Error al obtener lecturas de DynamoDB", 
            detalle: error.message,
            tipo_de_error: error.name
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor iCanBreath corriendo en puerto ${PORT}`));