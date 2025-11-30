import dotenv from 'dotenv';
dotenv.config();


import app from './app.js';
import { connectDB } from './config/db.js';
// 👇 IMPORTANTE: Importamos el iniciador de tareas (Recuerda el .js)
import { initJobs } from './jobs/scheduler.js'; 

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  // 1. Conectamos la BD
  await connectDB();

  // 2. Iniciamos el servidor Web
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    
    // 3. 👇 ARRANCAMOS EL BUCLE AUTOMÁTICO 👇
    initJobs(); 
  });
};

startServer();