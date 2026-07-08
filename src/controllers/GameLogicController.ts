import { Request, Response } from 'express';
import Game from '../models/Game.js';
import GamePlayer from '../models/GamePlayer.js';
import User from '../models/User.js';
import Match from '../models/Match.js';
import { getActiveRoundNumber } from './MatchController.js';
import { evaluateMatchImpact } from '../services/GameService.js';

// --- HELPER: Verificar plazo (1 hora antes) ---
const checkPredictionDeadline = async (seasonId: any, round: number): Promise<{ allowed: boolean, message?: string }> => {
    const firstMatch = await Match.findOne({ season: seasonId, round }).sort({ matchDate: 1 });
    if (!firstMatch || !firstMatch.matchDate) return { allowed: true }; 
    
    const deadline = new Date(firstMatch.matchDate.getTime() - 60 * 60 * 1000);
    if (new Date() > deadline) {
        return { allowed: false, message: `Plazo cerrado a las ${deadline.toLocaleTimeString()}.` };
    }
    return { allowed: true };
};

// ==========================================
//  MÉTODOS DE GESTIÓN (ADMIN / SISTEMA)
// ==========================================

// 1. INICIAR JUEGO
export const startGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.body;
        const game = await Game.findById(gameId);
        if (!game) return res.status(404).json({ message: "Juego no encontrado" });
        if (game.status !== 'OPEN') return res.status(400).json({ message: "El juego no está OPEN." });

        const playerCount = await GamePlayer.countDocuments({ game: gameId });
        if (playerCount < 2) return res.status(400).json({ message: "Mínimo 2 jugadores para empezar." });

        const activeRound = await getActiveRoundNumber();
        game.status = 'IN_PROGRESS';
        game.currentRound = activeRound; 
        await game.save();

        res.json({ message: `Juego iniciado en la Jornada ${activeRound}. ¡Suerte!` });
    } catch (error) {
        res.status(500).json({ message: "Error iniciando juego" });
    }
};

// 2. EVALUAR JORNADA (ADMIN)
export const evaluateRound = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.body;
        const game = await Game.findById(gameId);
        if (!game) return res.status(404).json({ message: "Juego no encontrado" });

        console.log(`📊 Evaluando Jornada ${game.currentRound} para el juego: ${game.name}`);

        // PASO 1: FORZAR EVALUACIÓN DE PARTIDOS
        // Buscamos todos los partidos FINALIZADOS de esta jornada
        const matches = await Match.find({
            season: game.season,
            round: game.currentRound,
            status: 'FINISHED'
        });

        console.log(`🔎 Encontrados ${matches.length} partidos finalizados para evaluar.`);

        // Ejecutamos la lógica de escudos/puntos para cada partido
        for (const match of matches) {
            await evaluateMatchImpact(match._id.toString());
        }

        // PASO 2: GESTIÓN DE ESTADO (VIDA O MUERTE)
        // Ahora que ya se han calculado los picks, miramos quién queda vivo
        const alivePlayers = await GamePlayer.countDocuments({ game: gameId, isAlive: true });
        
        if (alivePlayers === 1) {
            const winner = await GamePlayer.findOne({ game: gameId, isAlive: true });
            game.status = 'FINISHED';
            game.winner = winner?.user;
            await game.save();
            return res.json({ message: "¡JUEGO TERMINADO! Tenemos un ganador.", winner: winner?.user });
        }
        
        if (alivePlayers === 0) {
            game.status = 'WAITING_RESURRECTION';
            await game.save();
            return res.json({ message: "Todos muertos. Fase de Resurrección activada." });
        }

        res.json({ 
            message: "Evaluación completada con éxito.", 
            processedMatches: matches.length,
            survivors: alivePlayers 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error evaluando jornada" });
    }
};

// 3. CERRAR FASE DE RESURRECCIÓN
export const closeResurrectionRound = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.body;
        const game = await Game.findById(gameId);
        if (!game) return res.status(404).json({ message: "Juego no encontrado" });

        if (game.status !== 'WAITING_RESURRECTION') {
            return res.status(400).json({ message: "El juego no está esperando resurrecciones." });
        }

        const aliveCount = await GamePlayer.countDocuments({ game: gameId, isAlive: true });
        if (aliveCount === 0) {
            // Si nadie revivió, fin del juego desierto
            game.status = 'FINISHED';
            await game.save();
            return res.json({ message: "Nadie revivió. Juego desierto." });
        }

        // Volvemos al juego
        game.status = 'IN_PROGRESS';
        const currentRealRound = await getActiveRoundNumber();
        game.currentRound = currentRealRound;
        await game.save();

        res.json({ message: `Resurrección cerrada. Volvemos en la Jornada ${currentRealRound}.` });

    } catch (error) {
        res.status(500).json({ message: "Error cerrando resurrección" });
    }
};


// ==========================================
//  MÉTODOS DEL JUGADOR
// ==========================================

// 4. UNIRSE A JUEGO
export const joinGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.body;
        const userId = (req as any).user._id; // Casting para evitar error TS

        const game = await Game.findById(gameId);
        if (!game) return res.status(404).json({ message: "Juego no encontrado" });
        if (game.status !== 'OPEN') return res.status(400).json({ message: "El juego ya empezó." });

        const user = await User.findById(userId);
        if (!user || user.tokens < game.entryPrice) {
            return res.status(400).json({ message: "No tienes suficientes tokens." });
        }

        const existingPlayer = await GamePlayer.findOne({ game: gameId, user: userId });
        if (existingPlayer) return res.status(400).json({ message: "Ya estás en este juego." });

        // Pagar y Unir
        user.tokens -= game.entryPrice;
        await user.save();
        game.pot += game.entryPrice;
        await game.save();

        const count = await GamePlayer.countDocuments({ game: gameId });
        
        await GamePlayer.create({
            user: userId,
            game: gameId,
            playerNumber: count + 1,
            isAlive: true,
            usedTeams: [],
            picks: [],
            wildcards: [],
            pactVote: null
        });

        res.json({ message: "Te has unido al juego." });
    } catch (error) {
        res.status(500).json({ message: "Error al unirse" });
    }
};

// 5. HACER PICK (NUEVO: Con Resultado Exacto)
export const makePick = async (req: Request, res: Response) => {
    try {
        const { gameId, round, mainTeam, backupTeam, scoreHome, scoreAway } = req.body;
        const userId = (req as any).user._id;

        const game = await Game.findById(gameId);
        if (!game) return res.status(404).json({ message: "Juego no encontrado" });
        
        if (game.status === 'PACT_PHASE') return res.status(400).json({ message: "Votación de Pacto en curso." });
        if (game.status !== 'IN_PROGRESS' && game.status !== 'WAITING_RESURRECTION') {
            return res.status(400).json({ message: "Juego no activo." });
        }

        const deadline = await checkPredictionDeadline(game.season, round);
        if (!deadline.allowed) return res.status(400).json({ message: deadline.message });

        const player = await GamePlayer.findOne({ game: gameId, user: userId });
        if (!player || !player.isAlive) return res.status(400).json({ message: "No estás vivo." });

        // Validar equipos repetidos
        if (player.usedTeams.includes(mainTeam)) return res.status(400).json({ message: "Equipo titular ya usado." });

        const newPick: any = {
            round,
            mainTeam,
            backupTeam,
            result: 'PENDING',
            usedBackup: false
        };

        // Lógica de Resultado Exacto
        if (game.rules?.exactScore?.enabled && scoreHome !== undefined && scoreAway !== undefined) {
            newPick.scorePrediction = {
                home: Number(scoreHome),
                away: Number(scoreAway)
            };
        }

        // Guardar (upsert)
        const idx = player.picks.findIndex(p => p.round === round);
        if (idx >= 0) player.picks[idx] = newPick;
        else player.picks.push(newPick);

        await player.save();
        res.json({ message: "Pick guardado.", pick: newPick });

    } catch (error: any) {
        // Imprimimos el error completo con JSON.stringify para que no se esconda nada
        console.log("🔥🔥 ERROR CRÍTICO EN MAKE PICK:", JSON.stringify(error, null, 2));
        
        res.status(500).json({ 
            message: "Error guardando pick", 
            error_details: error.message || "Error desconocido",
            stack: error.stack // Esto nos dirá la línea exacta donde explota
        });
    }
};

// 6. ACTUALIZAR PICK (Alias para makePick, por compatibilidad)
export const updatePick = makePick;

// 7. BORRAR PICK
export const deletePick = async (req: Request, res: Response) => {
    try {
        const { gameId, round } = req.body;
        const userId = (req as any).user._id;
        
        // ... Validaciones de tiempo aquí si quieres ...

        const player = await GamePlayer.findOne({ game: gameId, user: userId });
        if (!player) return res.status(404).json({ message: "Jugador no encontrado" });

        player.picks = player.picks.filter(p => p.round !== round);
        await player.save();

        res.json({ message: "Pick eliminado" });
    } catch (error) {
        res.status(500).json({ message: "Error eliminando pick" });
    }
};

// 8. RESUCITAR (Comprar vida)
export const resurrectPlayer = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.body;
        const userId = (req as any).user._id;

        const game = await Game.findById(gameId);
        if (!game || game.status !== 'WAITING_RESURRECTION') {
            return res.status(400).json({ message: "No es fase de resurrección." });
        }

        const user = await User.findById(userId);
        const RESURRECTION_PRICE = game.entryPrice * 2; // Ejemplo: Doble precio

        if (!user || user.tokens < RESURRECTION_PRICE) {
            return res.status(400).json({ message: "Tokens insuficientes." });
        }

        const player = await GamePlayer.findOne({ game: gameId, user: userId });
        if (!player) return res.status(404).json({ message: "No juegas aquí." });
        if (player.isAlive) return res.status(400).json({ message: "Ya estás vivo." });

        // Transacción
        user.tokens -= RESURRECTION_PRICE;
        game.pot += RESURRECTION_PRICE;
        player.isAlive = true;
        
        await user.save();
        await game.save();
        await player.save();

        res.json({ message: "¡Has resucitado!" });

    } catch (error) {
        res.status(500).json({ message: "Error resurrección" });
    }
};

// 9. VOTAR EN PACTO (NUEVO)
export const votePact = async (req: Request, res: Response) => {
    try {
        const { gameId, vote } = req.body;
        const userId = (req as any).user._id;

        if (!['SPLIT', 'CONTINUE'].includes(vote)) return res.status(400).json({ message: "Voto inválido" });

        const game = await Game.findById(gameId);
        if (!game || game.status !== 'PACT_PHASE') return res.status(400).json({ message: "No hay votación activa." });

        const player = await GamePlayer.findOne({ game: gameId, user: userId, isAlive: true });
        if (!player) return res.status(403).json({ message: "No puedes votar." });

        player.pactVote = vote;
        await player.save();

        const totalAlive = await GamePlayer.countDocuments({ game: gameId, isAlive: true });
        const totalVotes = await GamePlayer.countDocuments({ game: gameId, isAlive: true, pactVote: { $ne: null } });

        if (totalAlive === totalVotes) {
            const splitVotes = await GamePlayer.countDocuments({ game: gameId, isAlive: true, pactVote: 'SPLIT' });
            
            // --- CASO A: PACTO ACEPTADO (UNANIMIDAD) ---
            if (splitVotes === totalAlive) {
                const prizePerPlayer = Math.floor(game.pot / totalAlive);
                
                // Buscamos a todos los supervivientes para darles su parte
                const survivors = await GamePlayer.find({ game: gameId, isAlive: true });
                
                // Actualizamos los tokens de cada usuario
                for (const s of survivors) {
                    await User.findByIdAndUpdate(s.user, { 
                        $inc: { tokens: prizePerPlayer } 
                    });
                }

                game.status = 'FINISHED';
                // Opcional: vaciamos el pot porque ya se repartió
                game.pot = 0; 
                await game.save();

                return res.json({ 
                    status: 'GAME_OVER', 
                    message: `¡Pacto aceptado! Cada jugador ha recibido ${prizePerPlayer} tokens.`,
                    prizeDistributed: prizePerPlayer
                });
            } 
            
            // --- CASO B: PACTO RECHAZADO (ALGUIEN DIJO CONTINUE) ---
            else {
                game.status = 'IN_PROGRESS';
                await game.save();
                // Limpiamos los votos para que puedan volver a pactar en el futuro
                await GamePlayer.updateMany({ game: gameId }, { pactVote: null });
                
                return res.json({ 
                    status: 'CONTINUE', 
                    message: "Pacto rechazado por falta de unanimidad. ¡La competición sigue!" 
                });
            }
        }

        res.json({ message: "Voto registrado correctamente. Esperando al resto de jugadores..." });
        
    } catch (error) {
        res.status(500).json({ message: "Error en la votación del pacto" });
    }
};

// 10. DASHBOARD DEL USUARIO
export const getUserDashboard = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const myGames = await GamePlayer.find({ user: userId })
            .populate({
                path: 'game',
                populate: { path: 'season' } // Populate anidado
            })
            .sort({ createdAt: -1 });

        res.json(myGames);
    } catch (error) {
        res.status(500).json({ message: "Error dashboard" });
    }
};