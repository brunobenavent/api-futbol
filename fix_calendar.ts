import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ScraperService } from './src/services/ScraperService.js';

dotenv.config();

const scraper = new ScraperService();

// --- CONFIGURACIÓN PARA TODO EL AÑO ---
const SEASON = "2026";
const START_ROUND = 1;  // <--- CAMBIO AQUÍ: Empezamos desde el principio
const END_ROUND = 38;   // Hasta el final

const fixCalendar = async () => {
  try {
    console.log("🔧 Conectando a la Base de Datos...");
    await mongoose.connect(process.env.MONGO_URI || '');
    console.log("✅ Conectado. Iniciando reparación TOTAL del calendario (J1-J38)...");

    for (let i = START_ROUND; i <= END_ROUND; i++) {
        console.log(`\n📅 Reparando fechas de la JORNADA ${i}...`);
        
        // Esto leerá la web y actualizará la fecha correcta en tu BD
        await scraper.scrapeRound(SEASON, i);
        
        // Pausa de seguridad
        console.log("⏳ Esperando 2s...");
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log("\n✨ CALENDARIO COMPLETO REPARADO.");

  } catch (error) {
    console.error("❌ Error fatal:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

fixCalendar();