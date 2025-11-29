import { Request, Response } from 'express';
import Game from '../models/Game.js';
import GamePlayer from '../models/GamePlayer.js';
import User from '../models/User.js';
import Match from '../models/Match.js';

export const joinGame = async (req: Request, res: Response) => {
  try {
    const { userId, gameId } = req.body;
    const user = await User.findById(userId);
    const game = await Game.findById(gameId);

    if (!user || !game) return res.status(404).send("Usuario o Juego no encontrado");
    if (game.status !== 'OPEN') return res.status(400).send("El juego no está abierto");
    if (user.tokens < game.entryPrice) return res.status(400).send("No tienes suficientes tokens");

    user.tokens -= game.entryPrice;
    await user.save();
    game.pot += game.entryPrice;
    await game.save();

    const count = await GamePlayer.countDocuments({ game: gameId });
    await GamePlayer.create({
      user: userId, game: gameId, playerNumber: count + 1, usedTeams: []
    });

    res.json({ message: `Inscrito correctamente. Eres el jugador #${count + 1}` });
  } catch (error) { res.status(500).json({ message: 'Error al unirse' }); }
};

export const makePick = async (req: Request, res: Response) => {
  try {
    const { userId, gameId, mainTeamId, backupTeamId, round } = req.body;
    const playerEntry = await GamePlayer.findOne({ user: userId, game: gameId });
    
    if (!playerEntry || !playerEntry.isAlive) return res.status(400).send("Estás eliminado o no participas.");

    const usedTeamsStrings = playerEntry.usedTeams.map(id => id.toString());
    if (usedTeamsStrings.includes(mainTeamId)) return res.status(400).send("Ya has usado el equipo titular anteriormente.");

    playerEntry.picks = playerEntry.picks.filter(p => p.round !== round);
    playerEntry.picks.push({
        round, mainTeam: mainTeamId, backupTeam: backupTeamId, result: 'PENDING', usedBackup: false
    });

    await playerEntry.save();
    res.json({ message: "Elección guardada." });
  } catch (error) { res.status(500).json({ message: 'Error al guardar elección' }); }
};

export const evaluateRound = async (req: Request, res: Response) => {
    const { gameId, round } = req.body; 
    try {
        const players = await GamePlayer.find({ game: gameId, isAlive: true });
        let eliminatedCount = 0;

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

            let match = await Match.findOne({ round: round, $or: [{ homeTeam: pick.mainTeam }, { awayTeam: pick.mainTeam }] });
            let teamIdToCheck = pick.mainTeam;
            let usedBackup = false;

            if (match && (match.status === 'POSTPONED' || match.status === 'SUSPENDED')) {
                 match = await Match.findOne({ round: round, $or: [{ homeTeam: pick.backupTeam }, { awayTeam: pick.backupTeam }] });
                teamIdToCheck = pick.backupTeam;
                usedBackup = true;
            }

            if (!match || match.status !== 'FINISHED') continue; 
            if (match.homeScore === null || match.awayScore === null) continue;

            let won = false;
            if (match.homeTeam.toString() === teamIdToCheck.toString()) {
                if (match.homeScore > match.awayScore) won = true;
            } else {
                if (match.awayScore > match.homeScore) won = true;
            }

            if (won) {
                pick.result = 'WIN'; pick.usedBackup = usedBackup; player.usedTeams.push(teamIdToCheck);
            } else {
                pick.result = 'LOSE'; player.isAlive = false; eliminatedCount++;
            }
            await player.save();
        }
        res.json({ message: `Evaluación completada. ${eliminatedCount} eliminados.` });
    } catch (error) { res.status(500).send("Error evaluando"); }
}