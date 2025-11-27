import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Match from './src/models/Match.js';
import Team from './src/models/Team.js';
import Season from './src/models/Season.js';
import { ScraperService } from './src/services/ScraperService.js';

dotenv.config();

const scraper = new ScraperService();

// Las jornadas que te dieron problemas según tu log
const BAD_ROUNDS = [1, 2, 3, 8, 9, 10, 11];
const SEASON = "2026";

const repair = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || '');
    console.log("🚑 INICIANDO REPARACIÓN QUIRÚRGICA...");

    // 1. BORRAR PARTIDOS CORRUPTOS
    console.log(`\n🗑️ Borrando partidos de las jornadas: ${BAD_ROUNDS.join(', ')}...`);
    const deleteResult = await Match.deleteMany({ 
        season: { $in: await getSeasonIds(SEASON) }, // Busca por ID de temporada
        round: { $in: BAD_ROUNDS } 
    });
    console.log(`✅ Eliminados ${deleteResult.deletedCount} partidos corruptos/incompletos.`);

    // 2. RESCRAPEAR JORNADAS
    console.log(`\n🔄 Re-descargando jornadas afectadas...`);
    for (const round of BAD_ROUNDS) {
        console.log(`\n--- Reparando Jornada ${round} ---`);
        await scraper.scrapeRound(SEASON, round);
        // Pequeña pausa para no saturar
        await new Promise(r => setTimeout(r, 2000));
    }

    // 3. LIMPIEZA DE EQUIPOS FANTASMA
    console.log(`\n👻 Buscando equipos fantasma (Sabadell, Murcia, etc.)...`);
    
    const allTeams = await Team.find();
    let deletedTeams = 0;

    for (const team of allTeams) {
        // Buscamos si este equipo juega algún partido (Local o Visitante)
        const count = await Match.countDocuments({
            $or: [{ homeTeam: team._id }, { awayTeam: team._id }]
        });

        if (count === 0) {
            console.log(`❌ Eliminando intruso: ${team.name} (0 partidos)`);
            await Team.findByIdAndDelete(team._id);
            deletedTeams++;
        }
    }
    console.log(`🧹 Limpieza completada. ${deletedTeams} equipos eliminados.`);

  } catch (e) {
    console.error("❌ Error fatal en reparación:", e);
  } finally {
    console.log("\n✨ REPARACIÓN FINALIZADA.");
    mongoose.disconnect();
    process.exit(0);
  }
};

// Helper para obtener el ID de la temporada
async function getSeasonIds(year: string) {
    const seasons = await Season.find({ year });
    return seasons.map(s => s._id);
}

repair();