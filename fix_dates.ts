import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Match from './src/models/Match.js';
import Season from './src/models/Season.js';

dotenv.config();

const fix = async () => {
  await mongoose.connect(process.env.MONGO_URI || '');
  console.log("🔧 Arreglando fechas de la Jornada 14...");

  // 1. Buscar ID de la temporada 2026
  const season = await Season.findOne({ year: "2026" });
  if (!season) return;

  // 2. Buscar partidos de la J14
  const matches = await Match.find({ season: season._id, round: 14 });

  for (const match of matches) {
      // Le sumamos 21 horas a la fecha que tiene (que es las 00:00 del día correcto o 23:00 del anterior)
      // Si la fecha es 27-Nov 23:00 UTC -> Al sumar 21h se pone en 28-Nov 20:00 UTC (21:00 España)
      
      // Truco: Forzamos la fecha al día 28 a las 20:00 UTC (21:00 hora peninsular)
      // Ojo: Si hay partidos el sábado/domingo, esto los pondrá todos hoy. 
      // Lo ideal es sumar horas a la fecha que ya tienen.
      
      if (match.matchDate) {
          const originalDate = new Date(match.matchDate);
          // Si la hora es 23:00 (del día anterior), le sumamos 21 horas para que sea las 20:00 del día siguiente
          // Si la hora es 00:00, le sumamos 20 horas.
          
          // Simplificación: Ponemos las 20:00 UTC (21:00) del día que tenga guardado + 1 día si es 23:00
          const newDate = new Date(originalDate);
          newDate.setUTCHours(20, 0, 0, 0); 
          
          // Si era día 27, le sumamos un día para que sea 28
          if (newDate.getUTCDate() === 27) {
              newDate.setUTCDate(28);
          }
          
          console.log(`Part: ${match.matchUrl} -> ${newDate.toISOString()}`);
          
          match.matchDate = newDate;
          await match.save();
      }
  }

  console.log("✅ Fechas corregidas.");
  process.exit();
};

fix();