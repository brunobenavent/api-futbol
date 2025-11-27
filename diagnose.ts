import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Match from './src/models/Match.js';
import Team from './src/models/Team.js';
import Season from './src/models/Season.js';

dotenv.config();

const diagnose = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || '');
    console.log("✅ Conectado a Mongo. Analizando...");

    // 1. ANALIZAR EQUIPOS
    const teams = await Team.find().sort({ name: 1 });
    console.log(`\n=== EQUIPOS (${teams.length}) ===`);
    console.log("¿Hay duplicados? Revisa esta lista:");
    teams.forEach(t => console.log(` - [${t.slug}] ${t.name}`));

    // 2. ANALIZAR PARTIDOS POR JORNADA
    console.log(`\n=== PARTIDOS POR JORNADA ===`);
    const matches = await Match.find();
    console.log(`Total Partidos: ${matches.length}`);
    
    const matchesPerRound: Record<number, number> = {};
    matches.forEach(m => {
        matchesPerRound[m.round] = (matchesPerRound[m.round] || 0) + 1;
    });

    for (let i = 1; i <= 38; i++) {
        const count = matchesPerRound[i] || 0;
        const status = count === 10 ? "✅" : "❌ FALTAN";
        console.log(`Jornada ${i}: ${count} partidos ${status}`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
  }
};

diagnose();