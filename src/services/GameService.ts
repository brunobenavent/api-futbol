import GamePlayer from '../models/GamePlayer.js';
import Match from '../models/Match.js';
import Game from '../models/Game.js';

// Función que evalúa SOLO a los jugadores afectados por UN partido específico
export const evaluateMatchImpact = async (matchId: string) => {
    console.log(`⚖️ Evaluando impacto del partido ${matchId}...`);

    const match = await Match.findById(matchId);
    if (!match || match.status !== 'FINISHED' || match.homeScore === null || match.awayScore === null) {
        return; // Si no ha terminado, no hacemos nada
    }

    // Buscamos jugadores que tengan una predicción PENDIENTE para esta jornada
    // y que hayan elegido a uno de los equipos de este partido
    const playersToEvaluate = await GamePlayer.find({
        isAlive: true,
        'picks': {
            $elemMatch: {
                round: match.round,
                result: 'PENDING',
                $or: [
                    { mainTeam: match.homeTeam },
                    { mainTeam: match.awayTeam },
                    { backupTeam: match.homeTeam }, // Por si entra el suplente
                    { backupTeam: match.awayTeam }
                ]
            }
        }
    });

    let updatedCount = 0;

    for (const player of playersToEvaluate) {
        const pick = player.picks.find(p => p.round === match.round);
        if (!pick) continue;

        // Determinar qué equipo está jugando el usuario
        let teamIdToCheck = pick.mainTeam;
        let usedBackup = false;

        // Lógica básica: Si el partido del titular es este, evaluamos.
        // (Nota: La lógica completa de suplentes por suspensión requiere chequear el estado del titular.
        // Aquí asumimos evaluación directa del partido que acaba de terminar).
        
        // Si el partido terminado NO es el de mi titular, no hago nada (espero al titular)
        // A MENOS que el titular ya esté POSTPONED/SUSPENDED (lógica compleja, simplificamos para este paso)
        if (match.homeTeam.toString() !== pick.mainTeam.toString() && match.awayTeam.toString() !== pick.mainTeam.toString()) {
             // Es el partido del suplente. Solo evaluamos si el titular falló.
             // Por ahora, saltamos.
             continue;
        }

        // Evaluar Ganador
        let won = false;
        if (match.homeTeam.toString() === teamIdToCheck.toString()) {
            if (match.homeScore > match.awayScore) won = true;
        } else {
            if (match.awayScore > match.homeScore) won = true;
        }

        // Actualizar Jugador
        if (won) {
            pick.result = 'WIN';
            player.usedTeams.push(teamIdToCheck); // Quemamos equipo
            console.log(`✅ Jugador ${player.playerNumber} GANA con ${teamIdToCheck}`);
        } else {
            pick.result = 'LOSE';
            player.isAlive = false; // ELIMINADO
            console.log(`❌ Jugador ${player.playerNumber} PIERDE con ${teamIdToCheck}`);
        }

        await player.save();
        updatedCount++;
    }
    
    if (updatedCount > 0) {
        console.log(`🔄 Actualizados ${updatedCount} jugadores tras el partido.`);
        // Opcional: Comprobar si queda solo 1 vivo para cerrar el juego
        await checkGameWinner(playersToEvaluate[0].game.toString());
    }
};

// Helper para ver si el juego ha terminado
const checkGameWinner = async (gameId: string) => {
    const alivePlayers = await GamePlayer.countDocuments({ game: gameId, isAlive: true });
    if (alivePlayers === 1) {
        const winner = await GamePlayer.findOne({ game: gameId, isAlive: true });
        await Game.findByIdAndUpdate(gameId, { status: 'FINISHED', winner: winner?.user });
        console.log(`🏆 ¡TENEMOS GANADOR DEL JUEGO!`);
    }
};