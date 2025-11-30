import { Request, Response } from 'express';
import Game from '../models/Game.js';
import GamePlayer from '../models/GamePlayer.js';
import User from '../models/User.js';
import Match from '../models/Match.js';
import { getActiveRoundNumber } from './MatchController.js'; 

// 1. Unirse a un juego
export const joinGame = async (req: Request, res: Response) => {
  try {
    const { userId, gameId } = req.body;

    const user = await User.findById(userId);
    const game = await Game.findById(gameId);

    if (!user || !game) return res.status(404).send("Usuario o Juego no encontrado");
    if (game.status !== 'OPEN') return res.status(400).send("El juego no está abierto");
    if (user.tokens < game.entryPrice) return res.status(400).send("No tienes suficientes tokens");

    const existingPlayer = await GamePlayer.findOne({ user: userId, game: gameId });
    if (existingPlayer) return res.status(400).send("Ya estás inscrito en este juego.");

    user.tokens -= game.entryPrice;
    await user.save();

    game.pot += game.entryPrice;
    await game.save();

    const count = await GamePlayer.countDocuments({ game: gameId });
    
    await GamePlayer.create({
      user: userId,
      game: gameId,
      playerNumber: count + 1,
      usedTeams: []
    });

    res.json({ message: `Inscrito correctamente. Eres el jugador #${count + 1}` });
  } catch (error) {
    res.status(500).json({ message: 'Error al unirse', error });
  }
};

// 2. Hacer predicción
export const makePick = async (req: Request, res: Response) => {
  try {
    const { userId, gameId, mainTeamId, backupTeamId, round } = req.body;

    const playerEntry = await GamePlayer.findOne({ user: userId, game: gameId });
    const currentRoundNumber = await getActiveRoundNumber();

    if (!playerEntry || !playerEntry.isAlive) {
        return res.status(400).send("Estás eliminado o no participas en este juego.");
    }

    if (round !== currentRoundNumber) {
        return res.status(400).json({
            message: `Solo se puede pronosticar para la Jornada ${currentRoundNumber} (actualmente activa).`
        });
    }

    const usedTeamsStrings = playerEntry.usedTeams.map(id => id.toString());
    
    if (usedTeamsStrings.includes(mainTeamId) || usedTeamsStrings.includes(backupTeamId)) {
        return res.status(400).send("Uno de los equipos ya fue utilizado para ganar anteriormente.");
    }

    playerEntry.picks = playerEntry.picks.filter(p => p.round !== round);
    
    // Usamos 'as any' para evitar conflictos de tipos parciales
    playerEntry.picks.push({
        round,
        mainTeam: mainTeamId,
        backupTeam: backupTeamId,
        result: 'PENDING',
        usedBackup: false
    } as any);

    await playerEntry.save();
    res.json({ message: "Elección guardada." });

  } catch (error) {
    res.status(500).json({ message: 'Error al guardar elección', error });
  }
};

// 3. Modificar predicción (Nueva funcionalidad)
export const updatePick = async (req: Request, res: Response) => {
  try {
    const { userId, gameId, mainTeamId, backupTeamId, round } = req.body;

    const playerEntry = await GamePlayer.findOne({ user: userId, game: gameId });
    const currentRoundNumber = await getActiveRoundNumber();

    if (!playerEntry || !playerEntry.isAlive) {
        return res.status(400).send("Estás eliminado o no participas en este juego.");
    }

    // VALIDACIÓN DE RONDA
    if (round !== currentRoundNumber) {
        return res.status(400).json({
            message: `Solo se puede modificar la predicción de la Jornada ${currentRoundNumber} (actualmente activa).`
        });
    }

    // Verificar si existe predicción para editar
    const existingPickIndex = playerEntry.picks.findIndex(p => p.round === round);
    if (existingPickIndex === -1) {
        return res.status(404).send("No tienes una predicción guardada para esta jornada. Usa 'makePick' primero.");
    }

    // VALIDACIÓN DE EQUIPOS REPETIDOS
    const usedTeamsStrings = playerEntry.usedTeams.map(id => id.toString());
    
    if (usedTeamsStrings.includes(mainTeamId) || usedTeamsStrings.includes(backupTeamId)) {
        return res.status(400).send("No puedes elegir un equipo que ya has usado para ganar.");
    }

    // Actualizamos la predicción existente
    playerEntry.picks[existingPickIndex].mainTeam = mainTeamId;
    playerEntry.picks[existingPickIndex].backupTeam = backupTeamId;
    playerEntry.picks[existingPickIndex].result = 'PENDING';
    playerEntry.picks[existingPickIndex].usedBackup = false;

    await playerEntry.save();
    res.json({ message: "Predicción modificada correctamente." });

  } catch (error) {
    res.status(500).json({ message: 'Error al modificar elección', error });
  }
};

// 4. Eliminar predicción (Nueva funcionalidad)
export const deletePick = async (req: Request, res: Response) => {
  try {
    const { userId, gameId, round } = req.body;

    const playerEntry = await GamePlayer.findOne({ user: userId, game: gameId });
    const currentRoundNumber = await getActiveRoundNumber();

    if (!playerEntry || !playerEntry.isAlive) {
        return res.status(400).send("No puedes realizar esta acción (eliminado o no inscrito).");
    }

    // VALIDACIÓN DE RONDA
    if (round !== currentRoundNumber) {
        return res.status(400).json({
            message: `Solo se puede borrar la predicción de la Jornada ${currentRoundNumber} (activa).`
        });
    }

    const initialLength = playerEntry.picks.length;
    playerEntry.picks = playerEntry.picks.filter(p => p.round !== round);

    if (playerEntry.picks.length === initialLength) {
        return res.status(404).send("No había predicción para borrar en esta jornada.");
    }

    await playerEntry.save();
    res.json({ message: "Predicción eliminada." });

  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar elección', error });
  }
};

// 5. Evaluar Jornada
export const evaluateRound = async (req: Request, res: Response) => {
    const { gameId, round } = req.body; 
    
    try {
        const game = await Game.findById(gameId);
        if (!game) return res.status(404).send("Juego no encontrado.");

        const players = await GamePlayer.find({ game: gameId, isAlive: true });
        let eliminatedCount = 0;
        let winnersCount = 0;
        let remainingPlayers = [];

        for (const player of players) {
            const pick = player.picks.find(p => p.round === round);
            
            if (!pick) {
                player.isAlive = false;
                // @ts-ignore
                player.picks.push({ round, result: 'LOSE' });
                eliminatedCount++;
                await player.save();
                continue;
            }

            let match = await Match.findOne({ 
                round: round, 
                $or: [{ homeTeam: pick.mainTeam }, { awayTeam: pick.mainTeam }] 
            });

            let teamIdToCheck = pick.mainTeam;
            let usedBackup = false;

            if (match && (match.status === 'POSTPONED' || match.status === 'SUSPENDED')) {
                 match = await Match.findOne({ 
                    round: round, 
                    $or: [{ homeTeam: pick.backupTeam }, { awayTeam: pick.backupTeam }] 
                });
                teamIdToCheck = pick.backupTeam;
                usedBackup = true;
            }

            if (!match || match.status !== 'FINISHED') {
                continue; 
            }

            if (match.homeScore === null || match.awayScore === null) {
                continue;
            }

            let won = false;
            if (match.homeTeam.toString() === teamIdToCheck.toString()) {
                if (match.homeScore > match.awayScore) won = true;
            } else {
                if (match.awayScore > match.homeScore) won = true;
            }

            if (won) {
                pick.result = 'WIN';
                pick.usedBackup = usedBackup;
                player.usedTeams.push(teamIdToCheck);
            } else {
                pick.result = 'LOSE';
                player.isAlive = false;
                eliminatedCount++;
            }
            
            await player.save();

            if (player.isAlive) {
                winnersCount++;
                remainingPlayers.push(player._id);
            }
        }

        if (game.status === 'IN_PROGRESS' || game.status === 'OPEN') {
            if (winnersCount === 1) {
                // Aquí usamos as any si TypeScript se queja de 'winner' en IGame, 
                // pero deberías haber añadido winner al modelo Game.ts
                (game as any).winner = remainingPlayers[0]; 
                game.status = 'FINISHED';
                await game.save();
            } else if (winnersCount > 1) {
                game.currentRound++;
                await game.save();
            } else {
                return res.json({ message: "¡Todos eliminados! Juego sin ganador." });
            }
        }
        
        res.json({ message: `Evaluación completada. ${eliminatedCount} eliminados.` });

    } catch (error) {
        console.error(error);
        res.status(500).send("Error evaluando");
    }
}