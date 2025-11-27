import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || '', {
      serverSelectionTimeoutMS: 5000, // Tiempo máximo para encontrar el servidor
      socketTimeoutMS: 45000, // Tiempo máximo de inactividad
    } as mongoose.ConnectOptions);

    console.log(`✅ MongoDB Conectado: ${conn.connection.host}`);
    
    // Manejar errores después de la conexión inicial
    mongoose.connection.on('error', err => {
      console.error('❌ Error de conexión en tiempo de ejecución:', err);
    });

  } catch (error) {
    console.error(`❌ Error de conexión inicial: ${error}`);
    process.exit(1);
  }
};