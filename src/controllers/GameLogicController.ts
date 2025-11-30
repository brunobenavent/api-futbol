import { Request, Response } from 'express';
import Game from '../models/Game.js';
import GamePlayer from '../models/GamePlayer.js';
import User from '../models/User.js';
import Match from '../models/Match.js';
import { getActiveRoundNumber } from './MatchController.js'; 

// HELPER: Verificar plazo (1h antes del primer partido)
const checkPredictionDeadline = async (seasonId: any, round: number): Promise<{ allowed: boolean, message?: string }> => {
    const firstMatch = await Match.findOne({ season: seasonId, round }).sort({ matchDate: 1 });
    
    if (!firstMatch || !firstMatch.matchDate) return { allowed: true }; 

    const deadline = new Date(firstMatch.matchDate.getTime() - 60 * 60 * 1000);
    const now = new Date();

    if (now > deadline) {
        return { 
            allowed: false, 
            message: `El plazo cerró a las ${deadline.toLocaleTimeString()} (1h antes del primer partido).` 
        };
    }
    return { allowed: true };
};

// --- 1. INICIAR JUEGO (MANUAL) ---
export const startGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.body;
        const game = await Game.findById(gameId);
        
        if (!game) return res.status(404).json({ message: "Juego no encontrado" });
        if (game.status !== 'OPEN') return res.status(400).json({ message: "El juego no está en estado OPEN." });

        // --- VALIDACIÓN NUEVA: MÍNIMO 20 JUGADORES ---
        const playerCount = await GamePlayer.countDocuments({ game: gameId });
        
        if (playerCount < 20) {
            return res.status(400).json({ 
                message: `No se puede iniciar el juego. Se necesitan al menos 20 jugadores (actuales: ${playerCount}).` 
            });
        }

        const currentRealRound = await getActiveRoundNumber();

        // VALIDACIÓN: ¿Ha empezado ya esta jornada?
        const startedMatches = await Match.countDocuments({
            season: game.season,
            round: currentRealRound,
            status: { $ne: 'SCHEDULED' }
        });

        if (startedMatches > 0) {
            return res.status(400).json({ 
                message: `No se puede iniciar. La Jornada ${currentRealRound} ya ha comenzado.` 
            });
        }

        game.status = 'IN_PROGRESS';
        game.currentRound = currentRealRound;
        await game.save();

        res.json({ message: `Juego iniciado en la Jornada ${currentRealRound} con ${playerCount} jugadores. ¡Suerte!` });

    } catch (error) {
        res.status(500).json({ message: "Error iniciando juego", error });
    }
};

// --- 2. UNIRSE A JUEGO ---
export const joinGame = async (req: Request, res: Response) => {
  try {
    const { userId, gameId } = req.body;
    const user = await User.findById(userId);
    const game = await Game.findById(gameId);

    if (!user || !game) return res.status(404).send("Usuario o Juego no encontrado");
    if (game.status !== 'OPEN') return res.status(400).send("El juego ya ha comenzado.");
    if (user.tokens < game.entryPrice) return res.status(400).send("No tienes suficientes tokens");

    const existingPlayer = await GamePlayer.findOne({ user: userId, game: gameId });
    if (existingPlayer) return res.status(400).send("Ya estás inscrito.");

    user.tokens -= game.entryPrice;
    await user.save();
    game.pot += game.entryPrice;
    await game.save();

    const count = await GamePlayer.countDocuments({ game: gameId });
    
    await GamePlayer.create({
      user: userId, game: gameId, playerNumber: count + 1, usedTeams: []
    });

    res.json({ message: `Inscrito correctamente. Jugador #${count + 1}` });
  } catch (error) { res.status(500).json({ message: 'Error al unirse', error }); }
};

// --- 3. HACER PREDICCIÓN ---
export const makePick = async (req: Request, res: Response) => {
  try {
    const { userId, gameId, mainTeamId, backupTeamId, round } = req.body;
    const game = await Game.findById(gameId);
    
    if (!game) return res.status(404).send("Juego no encontrado");
    if (game.status === 'FINISHED') return res.status(400).json({ message: "Juego finalizado." });
    if (game.status === 'WAITING_RESURRECTION') return res.status(400).json({ message: "Juego en fase de resurrección." });

    const playerEntry = await GamePlayer.findOne({ user: userId, game: gameId });
    
    if (round !== game.currentRound) {
        return res.status(400).json({ message: `Debes pronosticar para la Jornada ${game.currentRound} del juego.` });
    }

    if (!playerEntry || !playerEntry.isAlive) return res.status(400).send("Estás eliminado.");

    const deadline = await checkPredictionDeadline(game.season, round);
    if (!deadline.allowed) return res.status(403).json({ message: deadline.message });

    const usedTeamsStrings = playerEntry.usedTeams.map(id => id.toString());
    if (usedTeamsStrings.includes(mainTeamId) || usedTeamsStrings.includes(backupTeamId)) {
        return res.status(400).send("Equipo ya usado.");
    }

    playerEntry.picks = playerEntry.picks.filter(p => p.round !== round);
    // @ts-ignore
    playerEntry.picks.push({
        round, mainTeam: mainTeamId, backupTeam: backupTeamId, result: 'PENDING', usedBackup: false
    });

    await playerEntry.save();
    res.json({ message: "Elección guardada." });

  } catch (error) { res.status(500).json({ message: 'Error al guardar', error }); }
};

// --- 4. MODIFICAR PREDICCIÓN ---
export const updatePick = async (req: Request, res: Response) => {
  try {
    const { userId, gameId, mainTeamId, backupTeamId, round } = req.body;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).send("Juego no encontrado");

    if (game.status === 'FINISHED') return res.status(400).json({ message: "El juego ha terminado." });

    const playerEntry = await GamePlayer.findOne({ user: userId, game: gameId });
    
    if (!playerEntry || !playerEntry.isAlive) return res.status(400).send("Estás eliminado.");
    if (round !== game.currentRound) return res.status(400).json({ message: "Solo jornada actual." });

    const deadline = await checkPredictionDeadline(game.season, round);
    if (!deadline.allowed) return res.status(403).json({ message: deadline.message });

    const existingPickIndex = playerEntry.picks.findIndex(p => p.round === round);
    if (existingPickIndex === -1) return res.status(404).send("No tienes predicción para editar.");

    const usedTeamsStrings = playerEntry.usedTeams.map(id => id.toString());
    if (usedTeamsStrings.includes(mainTeamId) || usedTeamsStrings.includes(backupTeamId)) {
        return res.status(400).send("Equipo ya usado.");
    }

    playerEntry.picks[existingPickIndex].mainTeam = mainTeamId;
    playerEntry.picks[existingPickIndex].backupTeam = backupTeamId;
    // @ts-ignore
    playerEntry.picks[existingPickIndex].result = 'PENDING';
    playerEntry.picks[existingPickIndex].usedBackup = false;

    await playerEntry.save();
    res.json({ message: "Predicción modificada correctamente." });

  } catch (error) { res.status(500).json({ message: 'Error al modificar', error }); }
};

// --- 5. ELIMINAR PREDICCIÓN ---
export const deletePick = async (req: Request, res: Response) => {
  try {
    const { userId, gameId, round } = req.body;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).send("Juego no encontrado");
    
    if (game.status === 'FINISHED') return res.status(400).json({ message: "El juego ha terminado." });

    const playerEntry = await GamePlayer.findOne({ user: userId, game: gameId });

    if (!playerEntry || !playerEntry.isAlive) return res.status(400).send("Acción no permitida.");
    if (round !== game.currentRound) return res.status(400).json({ message: "Solo jornada actual." });

    const deadline = await checkPredictionDeadline(game.season, round);
    if (!deadline.allowed) return res.status(403).json({ message: deadline.message });

    const initialLength = playerEntry.picks.length;
    playerEntry.picks = playerEntry.picks.filter(p => p.round !== round);

    if (playerEntry.picks.length === initialLength) return res.status(404).send("No había predicción.");

    await playerEntry.save();
    res.json({ message: "Predicción eliminada." });

  } catch (error) { res.status(500).json({ message: 'Error al eliminar', error }); }
};

// --- 6. RESUCITAR JUGADOR (Mejorado) ---
export const resurrectPlayer = async (req: any, res: Response) => {
    try {
        const { userId, gameId } = req.body;
        const requester = req.user; // Usuario que hace la petición (del token)
        const RESURRECTION_PRICE = 10;

        // Seguridad: Solo el propio usuario o un Admin pueden hacer esto
        if (requester.role !== 'ADMIN' && requester._id.toString() !== userId) {
            return res.status(403).json({ message: "No tienes permiso para resucitar a este jugador." });
        }

        const game = await Game.findById(gameId);
        const user = await User.findById(userId);
        const playerEntry = await GamePlayer.findOne({ user: userId, game: gameId });

        if (!game || !user || !playerEntry) return res.status(404).json({ message: "Datos no encontrados" });

        // Regla 1: Solo si venimos de un "apocalipsis" (sin ganadores)
        if (game.status !== 'WAITING_RESURRECTION') {
            return res.status(400).json({ message: "El juego no está en fase de resurrección (quizás hubo ganadores o aún no terminó)." });
        }

        // Regla 2: Coste de 10 tokens
        if (user.tokens < RESURRECTION_PRICE) {
            return res.status(400).json({ message: `Saldo insuficiente. Necesitas ${RESURRECTION_PRICE} tokens.` });
        }

        // Ejecutar cobro y resurrección
        user.tokens -= RESURRECTION_PRICE;
        await user.save();

        game.pot += RESURRECTION_PRICE;
        await game.save();

        playerEntry.isAlive = true;
        playerEntry.usedTeams = []; // Reset de equipos usados, ¡nueva vida!
        // Opcional: Marcar en el historial que resucitó
        // playerEntry.picks.push({ round: game.currentRound, result: 'RESURRECTED' } as any); 
        
        await playerEntry.save();

        res.json({ 
            message: "¡Has resucitado! Tus equipos se han reseteado y sigues en el juego.", 
            tokensRestantes: user.tokens 
        });

    } catch (error) {
        res.status(500).json({ message: "Error en resurrección", error });
    }
};

// --- 7. CERRAR FASE DE RESURRECCIÓN ---
export const closeResurrectionRound = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.body;
        const game = await Game.findById(gameId);
        
        if (!game) return res.status(404).send("Juego no encontrado");
        if (game.status !== 'WAITING_RESURRECTION') return res.status(400).send("No espera resurrecciones.");

        const nextRealRound = await getActiveRoundNumber();
        if (game.currentRound < nextRealRound) {
            game.currentRound = nextRealRound;
        } else {
             game.currentRound++;
        }

        game.status = 'IN_PROGRESS';
        await game.save();

        res.json({ message: `Fase cerrada. Juego continúa en J${game.currentRound}.` });
    } catch (error) { res.status(500).json({ message: "Error cerrando fase", error }); }
}

// --- 8. EVALUAR JORNADA ---
export const evaluateRound = async (req: Request, res: Response) => {
    const { gameId, round } = req.body; 
    try {
        const game = await Game.findById(gameId);
        if (!game) return res.status(404).send("Juego no encontrado.");
        if (game.status === 'FINISHED') return res.status(400).json({ message: "Juego finalizado." });

        const pendingMatchesCount = await Match.countDocuments({
            season: game.season, round: round, status: { $in: ['SCHEDULED', 'LIVE'] }
        });

        const players = await GamePlayer.find({ game: gameId, isAlive: true });
        let eliminatedCount = 0;
        let winnersCount = 0;
        let remainingPlayers = [];

        for (const player of players) {
            const pick = player.picks.find(p => p.round === round);
            
            if (!pick) {
                if (pendingMatchesCount === 0) {
                    player.isAlive = false;
                    // @ts-ignore
                    player.picks.push({ round, result: 'LOSE' });
                    eliminatedCount++;
                    await player.save();
                }
                continue; 
            }
            
            if (pick.result === 'WIN' || pick.result === 'LOSE' || pick.result === 'VOID') {
                if (pick.result !== 'LOSE') { winnersCount++; remainingPlayers.push(player._id); }
                continue; 
            }

            let match = await Match.findOne({ round: round, $or: [{ homeTeam: pick.mainTeam }, { awayTeam: pick.mainTeam }] });
            let teamIdToCheck = pick.mainTeam;
            let usedBackup = false;

            if (match && (match.status === 'POSTPONED' || match.status === 'SUSPENDED')) {
                 match = await Match.findOne({ round: round, $or: [{ homeTeam: pick.backupTeam }, { awayTeam: pick.backupTeam }] });
                teamIdToCheck = pick.backupTeam;
                usedBackup = true;
            }

            if (!match || match.status !== 'FINISHED' || match.homeScore === null || match.awayScore === null) {
                if (pendingMatchesCount === 0) {
                    pick.result = 'VOID';
                    await player.save();
                    winnersCount++;
                    remainingPlayers.push(player._id);
                }
                continue; 
            }

            let won = false;
            if (match.homeTeam.toString() === teamIdToCheck.toString()) {
                if (match.homeScore > match.awayScore) won = true;
            } else {
                if (match.awayScore > match.homeScore) won = true;
            }

            if (won) {
                pick.result = 'WIN'; pick.usedBackup = usedBackup; player.usedTeams.push(teamIdToCheck);
                winnersCount++; remainingPlayers.push(player._id);
            } else {
                pick.result = 'LOSE'; player.isAlive = false; eliminatedCount++;
            }
            await player.save();
        }

        if (pendingMatchesCount === 0) {
            if (winnersCount === 1) {
                (game as any).winner = remainingPlayers[0]; 
                game.status = 'FINISHED';
                await game.save();
                return res.json({ message: "¡Tenemos GANADOR! Juego finalizado." });
            } else if (winnersCount > 1) {
                game.currentRound++;
                await game.save();
                return res.json({ message: `Ronda cerrada. Pasan ${winnersCount} jugadores.` });
            } else {
                game.status = 'WAITING_RESURRECTION';
                await game.save();
                return res.json({ message: "¡Todos eliminados! Fase de Resurrección abierta." });
            }
        }
        
        res.json({ message: `Evaluación parcial.`, stats: { eliminated: eliminatedCount } });

    } catch (error) { res.status(500).send("Error evaluando"); }
}