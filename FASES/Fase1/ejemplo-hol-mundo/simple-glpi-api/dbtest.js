import mysql from 'mysql2';

// create the connection
const conn = mysql.createConnection({
  host: 'localhost', // dirección del servidor MySQL
  user: 'root', // usuario de MySQL
  password: '1234', // la contraseña de MySQL
  database: 'glpi',
  port: 3306 // puerto de MySQL (por defecto es 3306)
});

conn
  .promise()
  .query('SELECT 1')
  .then(([rows, fields]) => {
    console.log(rows);
  })
  .catch(console.log)
  .then(() => conn.end());
