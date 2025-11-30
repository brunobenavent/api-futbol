import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';
import Game from './src/models/Game.js';
import GamePlayer from './src/models/GamePlayer.js';
import Season from './src/models/Season.js';
import Match from './src/models/Match.js';
import Team from './src/models/Team.js';

dotenv.config();

const SEASON_YEAR = "2026";
const ROUND = 14;
const GAME_NAME = "Liga de Pruebas J14";
const USERS_COUNT = 20;

const seedGame = async () => {
  try {
    console.log("🌱 Conectando a MongoDB...");
    await mongoose.connect(process.env.MONGO_URI || '');
    
    // 1. Buscar Temporada y Partidos de la J14
    const season = await Season.findOne({ year: SEASON_YEAR });
    if (!season) throw new Error("Temporada no encontrada. Ejecuta el seed de liga primero.");
    
    const matches = await Match.find({ season: season._id, round: ROUND });
    if (matches.length === 0) throw new Error(`No hay partidos para la Jornada ${ROUND}`);

    console.log(`✅ Encontrados ${matches.length} partidos para la J${ROUND}.`);

    // 2. Crear o Buscar el Juego
    let game = await Game.findOne({ name: GAME_NAME });
    if (!game) {
        game = await Game.create({
            name: GAME_NAME,
            season: season._id,
            status: 'OPEN',
            entryPrice: 10,
            pot: 0,
            currentRound: ROUND // Forzamos que esté en la 14
        });
        console.log(`🆕 Juego creado: ${GAME_NAME}`);
    } else {
        console.log(`ℹ️ Usando juego existente: ${GAME_NAME}`);
        game.currentRound = ROUND; // Actualizamos ronda por si acaso
        await game.save();
    }

    // 3. Crear Usuarios y Jugadores
    console.log(`🚀 Creando ${USERS_COUNT} usuarios y predicciones...`);
    
    for (let i = 1; i <= USERS_COUNT; i++) {
        const alias = `Jugador_Falso_${i}`;
        const email = `test${i}@example.com`;
        
        // Crear Usuario
        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({
                name: `Nombre${i}`,
                surname: `Apellido${i}`,
                alias,
                email,
                password: 'password123', // Hash automático
                status: 'ACTIVE',
                tokens: 1000
            });
        }

        // Inscribir en el Juego (GamePlayer)
        let player = await GamePlayer.findOne({ user: user._id, game: game._id });
        if (!player) {
            player = await GamePlayer.create({
                user: user._id,
                game: game._id,
                playerNumber: i,
                isAlive: true,
                usedTeams: []
            });
            game.pot += 10;
        }

        // Generar Predicción Aleatoria
        // Elegimos 2 partidos al azar de los 10 disponibles
        const randomMatch1 = matches[Math.floor(Math.random() * matches.length)];
        let randomMatch2 = matches[Math.floor(Math.random() * matches.length)];
        // Aseguramos que no sea el mismo partido
        while (randomMatch1._id.toString() === randomMatch2._id.toString()) {
            randomMatch2 = matches[Math.floor(Math.random() * matches.length)];
        }

        // Elegimos equipo local o visitante al azar
        const mainTeamId = Math.random() > 0.5 ? randomMatch1.homeTeam : randomMatch1.awayTeam;
        const backupTeamId = Math.random() > 0.5 ? randomMatch2.homeTeam : randomMatch2.awayTeam;

        // Guardamos el Pick
        // Limpiamos picks anteriores de esa ronda si hubiera
        player.picks = player.picks.filter(p => p.round !== ROUND);
        player.picks.push({
            round: ROUND,
            mainTeam: mainTeamId,
            backupTeam: backupTeamId,
            result: 'PENDING',
            usedBackup: false
        } as any);

        await player.save();
        console.log(`   -> 👤 ${alias}: Pick J${ROUND} (Main: ${mainTeamId})`);
    }

    await game.save(); // Guardar bote actualizado
    console.log("\n✨ SEED DE JUEGO COMPLETADO.");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
  }
};

seedGame();