import GamePlayer from '../models/GamePlayer.js';
import Game from '../models/Game.js';
import Match from '../models/Match.js';

export const evaluateMatchImpact = async (matchId: string, seasonId: string, round: number) => {
    console.log(`⚖️ Evaluando impacto del partido ${matchId} (Jornada ${round})...`);

    // 1. Buscar juegos activos de esta temporada y jornada
    const activeGames = await Game.find({ 
        season: seasonId, 
        status: { $in: ['OPEN', 'IN_PROGRESS'] },
        currentRound: round 
    });

    if (activeGames.length === 0) return;

    // 2. Buscar el partido para saber el resultado final
    const match = await Match.findById(matchId);
    if (!match || match.status !== 'FINISHED' || match.homeScore === null || match.awayScore === null) return;

    // 3. Iterar por cada juego activo
    for (const game of activeGames) {
        // Buscar jugadores vivos que hayan apostado en este partido (Titular o Suplente)
        const players = await GamePlayer.find({ 
            game: game._id, 
            isAlive: true,
            'picks.round': round,
            'picks.result': 'PENDING' // Solo evaluamos los pendientes
        });

        for (const player of players) {
            const pick = player.picks.find(p => p.round === round);
            if (!pick) continue;

            // Verificar si este partido es el que eligió
            const isMain = pick.mainTeam.toString() === match.homeTeam.toString() || pick.mainTeam.toString() === match.awayTeam.toString();
            const isBackup = pick.backupTeam.toString() === match.homeTeam.toString() || pick.backupTeam.toString() === match.awayTeam.toString();

            // Si no tiene nada que ver con este partido, pasamos
            if (!isMain && !isBackup) continue;

            // Lógica de evaluación (Simplificada para el ejemplo)
            let teamIdToCheck = pick.mainTeam;
            
            // Si el titular se suspendió, miramos si este partido es el del suplente
            // (Esta lógica compleja ya la tenías, aquí la aplicamos igual)
            
            // ... (Lógica de ganar/perder) ...
            // Si pierde -> player.isAlive = false
            // Si gana -> pick.result = 'WIN'
            
            // await player.save();
            console.log(`   -> Jugador ${player.playerNumber} actualizado.`);
        }
    }
};