import express from 'express';
import mysql from 'mysql2/promise'; // Nota: mysql2/promise sigue siendo necesario para .execute()
import dotenv from 'dotenv';

// Carga las variables de entorno del archivo .env
dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware para parsear el JSON en el cuerpo de la solicitud
app.use(express.json());

// --- Configuración de Conexión a la Base de Datos (Pool) ---

// Mantenemos createConnection ya que devuelve una Promise de conexión
// NOTA: Para usar las variables de entorno, este bloque debería usar process.env.DB_...
const pool = mysql.createConnection({
    host: 'localhost', // dirección del servidor MySQL
    user: 'root', // usuario de MySQL
    password: '1234', // la contraseña de MySQL
    database: 'glpi',
    port: 3306 // puerto de MySQL (por defecto es 3306)
});

/**
 * Función para insertar un solo objeto Computer en la DB
 * @param {object} computer - El objeto con 'name' y 'serial'.
 * @returns {Promise<number>} Una promesa que resuelve con el ID del registro insertado.
 */
function insertSingleComputer(computer) {
    const { name, serial } = computer;

    // pool.execute devuelve una Promise, la cual retornamos
    return pool.then(connection => {
        return connection.execute(
            'INSERT INTO Computer (name, serial) VALUES (?, ?)',
            [name, serial]
        );
    })
    .then(([result]) => {
        // Retornamos el ID, que será el valor con el que resuelva la Promise de insertSingleComputer
        return result.insertId;
    });
}


// ------------------------------------------------------------------
// --- NUEVA FUNCIÓN: applyUpdateAction (Necesaria para la Acción Masiva) ---
// ------------------------------------------------------------------
/**
 * Función para aplicar la acción masiva 'amend_comment' (simulado como actualizar el nombre)
 * @param {number} id - ID del registro a actualizar.
 * @param {object} input - Objeto con los parámetros de la acción (e.g., { "amendment": "nuevo_texto" }).
 * @returns {Promise<boolean>} Una promesa que resuelve a true si se actualizó, false en caso de no encontrar.
 */
async function applyUpdateAction(id, input) {
    // SIMULACIÓN: Usamos el parámetro 'amendment' para actualizar el campo 'name' del Computer.
    const newName = input.amendment; 
    
    // Obtenemos la conexión
    const connection = await pool;

    try {
        const [result] = await connection.execute(
            'UPDATE Computer SET name = ? WHERE id = ?',
            [newName, id]
        );
        // Si rowCount es > 0, se actualizó
        return result.affectedRows > 0;
    } catch (error) {
        // Relanzar el error para que el bloque que llama lo capture
        throw error;
    }
}


// --- Endpoint de la API: POST /Computer/ (CREACIÓN - Tu código original) ---
// NOTA: El callback de express NO debe ser async al usar .then()
app.post('/Computer/', (req, res) => {
    // 1. Simulación de Autenticación con Tokens
    // CORRECCIÓN: Renombrada la variable a 'session_token' para coincidir con el header en minúsculas.
    const session_token = req.headers['session-token']; 
    const appToken = req.headers['app-token'];

    if (!session_token || !appToken) { // Cambiada 'sessionToken' por 'session_token'
        return res.status(401).json({ error: "Missing required tokens" });
    }

    const inputData = req.body.input;

    if (!inputData) {
        return res.status(400).json({ error: "Missing 'input' data in body" });
    }

    // 2. Manejo de un solo registro (Objeto)
    if (!Array.isArray(inputData)) {
        // Llamamos a la función que retorna la Promise y usamos .then()/.catch()
        insertSingleComputer(inputData)
            .then(newId => {
                // Simula la respuesta 201 OK de GLPI
                res.status(201).set({
                    'Location': `http://path/to/glpi/api/Computer/${newId}`
                }).json({ id: newId });
            })
            .catch(error => {
                console.error('Error al insertar un registro:', error.message);
                // Manejo de errores
                res.status(409).json({ error: 'Conflict or Database Error', message: error.message });
            });
        return;
    }

    // 3. Manejo de múltiples registros (Array de objetos)
    if (Array.isArray(inputData)) {
        let results = [];
        let linkHeader = [];

        // Esta parte requiere Promesas encadenadas o Promise.all.
        // Usaremos un bucle secuencial a través de la reducción de la promesa (.reduce)
        // para mantener la misma lógica secuencial que tenías con 'for...of' y 'await'.
        
        inputData.reduce((promiseChain, item) => {
            return promiseChain.then(() => {
                // Ejecuta la promesa de inserción para el elemento actual
                return insertSingleComputer(item)
                    .then(newId => {
                        // Éxito:
                        results.push({ id: newId, message: "" });
                        linkHeader.push(`http://path/to/glpi/api/Computer/${newId}`);
                    })
                    .catch(error => {
                        // Fallo (e.g., serial duplicado):
                        console.error(`Error al insertar registro ${item.name}:`, error.message);
                        results.push({ id: false, message: error.message });
                    });
            });
        }, Promise.resolve()) // Empieza la cadena con una promesa resuelta
        .then(() => {
            // Este .then() se ejecuta cuando *toda* la cadena de promesas ha finalizado
            
            // Simula la respuesta 207 OK de GLPI
            res.status(207).set({
                'Link': linkHeader.join(',')
            }).json(results);
        })
        .catch(error => {
            // Manejo de error general (aunque la lógica de reduce ya maneja errores internos)
            console.error("Error inesperado en el procesamiento del array:", error.message);
            res.status(500).json({ error: 'Internal Server Error' });
        });
    }
});


// ------------------------------------------------------------------
// --- NUEVO ENDPOINT: POST /apirest.php/applyMassiveAction/:itemtype/:action ---
// ------------------------------------------------------------------
app.post('/apirest.php/applyMassiveAction/:itemtype/:action', async (req, res) => {
    // El callback es 'async' para poder usar await dentro.
    
    // 1. Simulación de Autenticación y Validación
    // CORRECCIÓN: Renombrada la variable a 'session_token' para coincidir con el header en minúsculas.
    const session_token = req.headers['session-token']; 
    const appToken = req.headers['app-token'];
    const { itemtype, action } = req.params;
    const { ids, input } = req.body; // Obtenemos 'ids' y 'input' del body

    if (!session_token || !appToken) { // Cambiada 'sessionToken' por 'session_token'
        return res.status(401).json({ error: "UNAUTHORIZED: Missing required tokens" });
    }

    // Validación de parámetros específicos de la acción
    if (!ids || !Array.isArray(ids) || !input) {
        return res.status(400).json({ error: "Bad Request: Missing 'ids' array or 'input' payload" });
    }

    // 2. Procesamiento Masivo
    let ok = 0;
    let ko = 0;
    let noright = 0;
    let messages = [];

    // Usamos Promise.all para ejecutar todas las actualizaciones en paralelo 
    // y esperar a que todas terminen. Esto simula el trabajo en la DB.
    try {
        const updatePromises = ids.map(id => {
            // Usamos la función de actualización
            return applyUpdateAction(id, input)
                .then(wasUpdated => {
                    if (wasUpdated) {
                        ok++;
                    } else {
                        // Si no se encuentra el ID, simulamos un fallo (ko).
                        ko++;
                        messages.push({ message: `ID ${id} no encontrado en ${itemtype}.`, id: id });
                    }
                })
                .catch(error => {
                    // Si ocurre un error de DB (e.g., sintaxis, campo, etc.), lo capturamos como ko
                    console.error(`Error procesando ID ${id}:`, error.message);
                    ko++;
                    messages.push({ message: `Fallo de DB para ID ${id}: ${error.message}`, id: id });
                });
        });

        await Promise.all(updatePromises);

    } catch (error) {
        // Manejo de un error catastrófico (p. ej., la conexión de la pool se pierde)
        console.error("Error inesperado durante Promise.all:", error.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    // 3. Devolver la Respuesta con Multi-Status (207 o 200)
    // Devolvemos 207 si hay algún fallo, 200 si todo fue OK.
    const statusCode = ko > 0 ? 207 : 200;

    res.status(statusCode).json({
        ok: ok,
        ko: ko,
        noright: noright,
        messages: messages.filter(msg => msg.id) // Solo mensajes con fallos
    });
});


// --- Inicialización del Servidor ---
// Nota: pool.connect() no es necesario en mysql2/promise; createConnection ya establece la configuración.
app.listen(PORT, () => {
    console.log(`🚀 Servidor de API simple corriendo en http://localhost:${PORT}`);
    // Mantenemos tu console.log para mostrar cómo se está leyendo la variable
    console.log(`Base de datos conectada a: ${process.env.DB_DATABASE || 'glpi (hardcodeado)'}`);
});
