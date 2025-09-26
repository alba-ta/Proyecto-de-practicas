import express from 'express';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3000;

app.use(express.json());

// ------------------------------------------------------------------
// --- CONFIGURACIÓN DE CONEXIÓN A LA BASE DE DATOS (Pool) ---
// ------------------------------------------------------------------
const pool = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'glpi',
    port: 3306
});


// ------------------------------------------------------------------
// --- FUNCIONES DE LÓGICA DE BASE DE DATOS (CRUD) ---
// ------------------------------------------------------------------

/**
 * LÓGICA DE CREACIÓN: Inserta un nuevo registro Computer.
 */
function insertSingleComputer(computer) {
    const { name, serial } = computer;
    return pool.then(connection => {
        return connection.execute(
            'INSERT INTO Computer (name, serial) VALUES (?, ?)',
            [name, serial]
        );
    })
    .then(([result]) => result.insertId);
}

/**
 * LÓGICA DE ACTUALIZACIÓN: Actualiza un registro Computer por ID (Usado por PUT/PATCH).
 */
async function updateComputerById(id, input) {
    // Para simplificar, actualiza 'name' o 'otherserial' (simulando campos)
    const newName = input.name || input.otherserial; 
    
    if (!newName) {
        return false;
    }

    const connection = await pool;

    try {
        const [result] = await connection.execute(
            'UPDATE Computer SET name = ? WHERE id = ?',
            [newName, id]
        );
        return result.affectedRows > 0;
    } catch (error) {
        throw error;
    }
}

/**
 * LÓGICA DE ACCIÓN MASIVA: Actualiza un registro por ID (Usado por POST Massive Action).
 */
async function applyUpdateAction(id, input) {
    // SIMULACIÓN: Usa el parámetro 'amendment' para actualizar el 'name'.
    const newName = input.amendment; 
    
    const connection = await pool;

    try {
        const [result] = await connection.execute(
            'UPDATE Computer SET name = ? WHERE id = ?',
            [newName, id]
        );
        return result.affectedRows > 0;
    } catch (error) {
        throw error;
    }
}

/**
 * LÓGICA DE ELIMINACIÓN: Elimina un registro Computer por ID (Usado por DELETE).
 * **ESTA ES LA NUEVA FUNCIÓN**
 */
async function deleteComputerById(id, forcePurge = false) {
    const connection = await pool;

    try {
        const [result] = await connection.execute(
            'DELETE FROM Computer WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    } catch (error) {
        throw error;
    }
}


// ------------------------------------------------------------------
// 🎯 ENDPOINT 1: POST /Computer/ (CREACIÓN)
// ------------------------------------------------------------------
app.post('/Computer/', (req, res) => {
    // Lógica de autenticación
    const session_token = req.headers['session-token']; 
    const appToken = req.headers['app-token'];

    if (!session_token || !appToken) { 
        return res.status(401).json({ error: "Missing required tokens" });
    }

    const inputData = req.body.input;

    if (!inputData) {
        return res.status(400).json({ error: "Missing 'input' data in body" });
    }

    // Lógica para un solo registro (Objeto)
    if (!Array.isArray(inputData)) {
        insertSingleComputer(inputData)
            .then(newId => {
                res.status(201).set({
                    'Location': `http://path/to/glpi/api/Computer/${newId}`
                }).json({ id: newId });
            })
            .catch(error => {
                console.error('Error al insertar un registro:', error.message);
                res.status(409).json({ error: 'Conflict or Database Error', message: error.message });
            });
        return;
    }

    // Lógica para múltiples registros (Array de objetos)
    let results = [];
    let linkHeader = [];
    
    inputData.reduce((promiseChain, item) => {
        return promiseChain.then(() => {
            return insertSingleComputer(item)
                .then(newId => {
                    results.push({ id: newId, message: "" });
                    linkHeader.push(`http://path/to/glpi/api/Computer/${newId}`);
                })
                .catch(error => {
                    console.error(`Error al insertar registro ${item.name}:`, error.message);
                    results.push({ id: false, message: error.message });
                });
        });
    }, Promise.resolve())
    .then(() => {
        res.status(207).set({
            'Link': linkHeader.join(',')
        }).json(results);
    })
    .catch(error => {
        console.error("Error inesperado en el procesamiento del array:", error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    });
});

// ------------------------------------------------------------------
// 🎯 ENDPOINT 2: POST /apirest.php/applyMassiveAction/:itemtype/:action (ACCIÓN MASIVA)
// ------------------------------------------------------------------
app.post('/apirest.php/applyMassiveAction/:itemtype/:action', async (req, res) => {
    // 1. Autenticación y Validación
    const session_token = req.headers['session-token']; 
    const appToken = req.headers['app-token'];
    const { itemtype, action } = req.params;
    const { ids, input } = req.body; 

    if (!session_token || !appToken) { 
        return res.status(401).json({ error: "UNAUTHORIZED: Missing required tokens" });
    }

    if (!ids || !Array.isArray(ids) || !input) {
        return res.status(400).json({ error: "Bad Request: Missing 'ids' array or 'input' payload" });
    }

    // 2. Procesamiento Masivo
    let ok = 0;
    let ko = 0;
    let noright = 0;
    let messages = [];

    try {
        const updatePromises = ids.map(id => {
            return applyUpdateAction(id, input)
                .then(wasUpdated => {
                    if (wasUpdated) {
                        ok++;
                    } else {
                        ko++;
                        messages.push({ message: `ID ${id} no encontrado en ${itemtype}.`, id: id });
                    }
                })
                .catch(error => {
                    console.error(`Error procesando ID ${id}:`, error.message);
                    ko++;
                    messages.push({ message: `Fallo de DB para ID ${id}: ${error.message}`, id: id });
                });
        });

        await Promise.all(updatePromises);

    } catch (error) {
        console.error("Error inesperado durante Promise.all:", error.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    // 3. Devolver la Respuesta con Multi-Status (207 o 200)
    const statusCode = ko > 0 ? 207 : 200;

    res.status(statusCode).json({
        ok: ok,
        ko: ko,
        noright: noright,
        messages: messages.filter(msg => msg.id)
    });
});


// ------------------------------------------------------------------
// 🎯 ENDPOINT 3: PUT/PATCH (ACTUALIZACIÓN)
// ------------------------------------------------------------------

// 3a. ACTUALIZACIÓN INDIVIDUAL (ID viene en la URL) o BULK (ID viene en el Body)
app.put('/apirest.php/:itemtype/:id', async (req, res) => {
    // Aquí usamos una función interna que hemos extraído para evitar código duplicado.
    await handlePutRequest(req, res);
});

// 3b. ACTUALIZACIÓN BULK (El ID viene en el Body JSON del array, la URL no tiene ID)
app.put('/apirest.php/:itemtype', async (req, res) => {
    // Ambos endpoints llaman a la misma lógica principal, ya que el código dentro
    // maneja si 'id' viene de la URL o del Body.
    await handlePutRequest(req, res);
});

/**
 * Función centralizada para manejar la lógica de PUT/PATCH (Actualización).
 * Se utiliza para evitar duplicar el código del endpoint 3.
 */
async function handlePutRequest(req, res) {
    // 1. Autenticación
    const session_token = req.headers['session-token']; 
    const appToken = req.headers['app-token'];
    // El ID puede estar en req.params si se usó la ruta 3a, o ser undefined si se usó la 3b.
    const { id: idInUrl } = req.params; 
    const inputData = req.body.input;

    if (!session_token || !appToken) { 
        return res.status(401).json({ error: "UNAUTHORIZED: Missing required tokens" });
    }

    if (!inputData) {
        return res.status(400).json({ error: "Bad Request: Missing 'input' payload" });
    }

    const finalResults = [];

    try {
        // Lógica de Actualización Individual
        if (!Array.isArray(inputData)) {
            const idToUpdate = idInUrl || inputData.id;

            if (!idToUpdate) {
                return res.status(400).json({ error: "Bad Request: Missing 'id' in URL or payload." });
            }

            const wasUpdated = await updateComputerById(idToUpdate, inputData);
            finalResults.push({ [idToUpdate]: wasUpdated, message: wasUpdated ? "" : "Item not found" });

        } else {
            // Lógica de Actualización Múltiple
            if (idInUrl) {
                return res.status(400).json({ error: "Bad Request: Cannot provide 'id' in URL for multiple updates." });
            }

            const updatePromises = inputData.map(item => {
                const idToUpdate = item.id;
                if (!idToUpdate) {
                     return Promise.resolve({ [false]: false, message: "Missing ID in array element" });
                }
                
                return updateComputerById(idToUpdate, item)
                    .then(wasUpdated => {
                         return { [idToUpdate]: wasUpdated, message: wasUpdated ? "" : "Item not found" }; 
                    })
                    .catch(error => {
                        console.error(`Error DB en ID ${idToUpdate}:`, error.message);
                        return { [idToUpdate]: false, message: `Database Error: ${error.message}` };
                    });
            });

            const results = await Promise.all(updatePromises);
            finalResults.push(...results);
        }

    } catch (error) {
        console.error("Error inesperado en el procesamiento de PUT:", error.message);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }

    // Devolver 200/207
    const hasFailures = finalResults.some(result => Object.values(result).includes(false));
    const statusCode = hasFailures ? 207 : 200;

    res.status(statusCode).json(finalResults);
}


// ------------------------------------------------------------------
// 🎯 ENDPOINT 4: DELETE /apirest.php/:itemtype/:id? (ELIMINACIÓN)
// ------------------------------------------------------------------

// 4a. ELIMINACIÓN INDIVIDUAL (ID en URL)
app.delete('/apirest.php/:itemtype/:id', async (req, res) => {
    await handleDeleteRequest(req, res);
});

// 4b. ELIMINACIÓN BULK (ID(s) en Body JSON)
app.delete('/apirest.php/:itemtype', async (req, res) => {
    await handleDeleteRequest(req, res);
});

/**
 * Función centralizada para manejar la lógica de DELETE (Eliminación).
 */
async function handleDeleteRequest(req, res) {
    // 1. Autenticación y Extracción de Parámetros
    const session_token = req.headers['session-token']; 
    const appToken = req.headers['app-token'];
    
    // Parámetros de la URL/Query
    const { id: idInUrl } = req.params;  // ID si viene en la URL
    // Se usa 'true' si force_purge=true está en la URL Query String
    const forcePurgeQuery = req.query.force_purge === 'true'; 

    // Parámetros del Body (payload)
    const { input: inputData, force_purge: forcePurgeBody } = req.body;
    
    // Prioridad: Body > Query
    const forcePurge = forcePurgeBody || forcePurgeQuery || false;
    
    if (!session_token || !appToken) { 
        return res.status(401).json({ error: "UNAUTHORIZED: Missing required tokens" });
    }

    const finalResults = [];
    let isSingleDeletion = false;

    try {
        // --- CASO A: Eliminación Individual (ID en URL o en input simple del Body) ---
        // inputData simple: {"input": {"id": 11}}
        if (idInUrl || (inputData && !Array.isArray(inputData) && inputData.id)) {
            isSingleDeletion = true;
            const idToDelete = idInUrl || inputData.id;

            if (!idToDelete) {
                return res.status(400).json({ error: "Bad Request: Missing 'id' in URL or payload." });
            }

            const wasDeleted = await deleteComputerById(idToDelete, forcePurge);
            
            if (wasDeleted) {
                // Éxito en eliminación individual: 204 No Content
                return res.status(204).send();
            } else {
                // Fallo (No encontrado), devolvemos el array con el mensaje de error.
                finalResults.push({ [idToDelete]: false, message: "Item not found" });
            }


        } else if (inputData && Array.isArray(inputData)) {
            // --- CASO B: Eliminación Múltiple (Array de IDs en el Body) ---
            if (idInUrl) {
                return res.status(400).json({ error: "Bad Request: Cannot provide 'id' in URL for multiple deletions." });
            }
            
            const deletePromises = inputData.map(item => {
                const idToDelete = item.id;
                if (!idToDelete) {
                    return Promise.resolve({ [false]: false, message: "Missing ID in array element" });
                }
                
                return deleteComputerById(idToDelete, forcePurge)
                    .then(wasDeleted => {
                        return { [idToDelete]: wasDeleted, message: wasDeleted ? "" : "Item not found" }; 
                    })
                    .catch(error => {
                        console.error(`Error DB en ID ${idToDelete}:`, error.message);
                        return { [idToDelete]: false, message: `Database Error: ${error.message}` };
                    });
            });

            const results = await Promise.all(deletePromises);
            finalResults.push(...results);
        } else {
            return res.status(400).json({ error: "Bad Request: Missing ID in URL or 'input' payload." });
        }

    } catch (error) {
        console.error("Error inesperado en el procesamiento de DELETE:", error.message);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }

    // --- RESPUESTAS (Solo si no se devolvió 204) ---
    
    // Si la eliminación individual falló (no existe), finalResults tiene un resultado.
    if (isSingleDeletion && finalResults.length > 0) {
        // En caso de fallo individual, devolvemos 200 o 207 con el resultado.
        const statusCode = finalResults.some(result => !Object.values(result)[0]) ? 207 : 200;
        return res.status(statusCode).json(finalResults);
    }
    
    // Si fue múltiple:
    const hasFailures = finalResults.some(result => !Object.values(result)[0]);
    const statusCode = hasFailures ? 207 : 200; // 207 si hay fallos, 200 si todo OK

    res.status(statusCode).json(finalResults);
}


// ------------------------------------------------------------------
// --- INICIALIZACIÓN DEL SERVIDOR ---
// ------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`🚀 Servidor de API simple corriendo en http://localhost:${PORT}`);
    console.log(`Base de datos conectada a: ${process.env.DB_DATABASE || 'glpi (hardcodeado)'}`);
});
