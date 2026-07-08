import GamePlayer from '../models/GamePlayer.js';
import Match from '../models/Match.js';
import Game from '../models/Game.js';

export const evaluateMatchImpact = async (matchId: string) => {
    console.log(`⚖️ Evaluando impacto del partido ${matchId}...`);

    const match = await Match.findById(matchId);
    if (!match || match.status !== 'FINISHED' || match.homeScore === null || match.awayScore === null) {
        return;
    }

    // Buscamos jugadores afectados
    const playersToEvaluate = await GamePlayer.find({
        isAlive: true,
        'picks': {
            $elemMatch: {
                round: match.round,
                result: 'PENDING',
                $or: [
                    { mainTeam: match.homeTeam },
                    { mainTeam: match.awayTeam },
                    { backupTeam: match.homeTeam },
                    { backupTeam: match.awayTeam }
                ]
            }
        }
    });

    let updatedCount = 0;

    for (const player of playersToEvaluate) {
        const pick = player.picks.find(p => p.round === match.round);
        if (!pick) continue;

        // Determinar equipo elegido
        let teamIdToCheck = pick.mainTeam;
        let usedBackup = false;
        
        // Lógica de partido suspendido (usar backup) - Simplificada para este ejemplo
        // ... (Tu lógica de backup aquí si la tienes) ...

        // EVALUAR GANADOR
        let won = false;
        if (match.homeTeam.toString() === teamIdToCheck.toString()) {
            if (match.homeScore > match.awayScore) won = true;
        } else {
            if (match.awayScore > match.homeScore) won = true;
        }

        if (won) {
            pick.result = 'WIN';
            player.usedTeams.push(teamIdToCheck);
            console.log(`✅ Jugador ${player.playerNumber} GANA con ${teamIdToCheck}`);

            // --- LÓGICA DE RESULTADO EXACTO (FRANCOTIRADOR) ---
            const game = await Game.findById(player.game);
            
            if (game && game.rules?.exactScore?.enabled && pick.scorePrediction) {
                // Comparamos goles exactos
                if (pick.scorePrediction.home === match.homeScore && 
                    pick.scorePrediction.away === match.awayScore) {
                    
                    console.log(`🎯 ¡FRANCOTIRADOR! Jugador ${player.playerNumber} acertó marcador exacto.`);
                    
                    if (game.rules.exactScore.reward === 'SHIELD') {
                        player.wildcards.push('SHIELD');
                    }
                }
            }
            // --------------------------------------------------

        } else {
            // --- LÓGICA DE ESCUDO (SALVACIÓN) ---
            const hasShield = player.wildcards.includes('SHIELD');
            
            if (hasShield) {
                console.log(`🛡️ Jugador ${player.playerNumber} SALVADO por Escudo.`);
                // Gastar escudo
                const shieldIdx = player.wildcards.indexOf('SHIELD');
                player.wildcards.splice(shieldIdx, 1);
                
                pick.result = 'WIN'; // Pasa de ronda artificialmente
                player.usedTeams.push(teamIdToCheck); // Se le quema el equipo igual
            } else {
                pick.result = 'LOSE';
                player.isAlive = false;
                console.log(`❌ Jugador ${player.playerNumber} ELIMINADO.`);
            }
        }

        await player.save();
        updatedCount++;
    }
    
    // Si hubo eliminaciones, verificar si activamos PACTO
    if (updatedCount > 0 && playersToEvaluate.length > 0) {
        const gameId = playersToEvaluate[0].game.toString();
        await checkPactActivation(gameId);
    }
};

// HELPER: Activar fase de pacto si quedan pocos
const checkPactActivation = async (gameId: string) => {
    const game = await Game.findById(gameId);
    if (!game || !game.rules.pact.enabled || game.status === 'PACT_PHASE') return;

    const alivePlayers = await GamePlayer.countDocuments({ game: gameId, isAlive: true });

    // Si quedan <= al umbral (ej: 5) y más de 1 (para que haya votación)
    if (alivePlayers <= game.rules.pact.threshold && alivePlayers > 1) {
        console.log(`🤝 ACTIVANDO FASE DE PACTO en juego ${game.name}`);
        game.status = 'PACT_PHASE';
        await game.save();
    }
};