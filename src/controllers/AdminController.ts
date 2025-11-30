import { Request, Response } from 'express';
import User from '../models/User.js';
import Game from '../models/Game.js';
import GamePlayer from '../models/GamePlayer.js';
import Season from '../models/Season.js';

// 1. Listar usuarios pendientes
export const getPendingUsers = async (req: Request, res: Response) => {
    try {
        const users = await User.find({ status: 'PENDING_APPROVAL' });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Error obteniendo usuarios" });
    }
};

// 2. Crear un nuevo Juego
export const createGame = async (req: Request, res: Response) => {
    try {
        const { name, seasonYear, entryPrice } = req.body;
        
        const season = await Season.findOne({ year: seasonYear });
        if (!season) return res.status(404).json({ message: "Temporada no encontrada" });

        const newGame = await Game.create({
            name,
            season: season._id,
            status: 'OPEN',
            entryPrice,
            pot: 0,
            currentRound: 1
        });

        res.status(201).json({ message: "Juego creado", game: newGame });
    } catch (error) {
        res.status(500).json({ message: "Error creando juego" });
    }
};

// 3. Gestionar Tokens
export const manageTokens = async (req: Request, res: Response) => {
    try {
        const { userId, amount, operation } = req.body; 
        const user = await User.findById(userId);
        
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        if (operation === 'add') user.tokens += amount;
        else if (operation === 'subtract') user.tokens -= amount;

        await user.save();
        res.json({ message: "Tokens actualizados", tokens: user.tokens });
    } catch (error) {
        res.status(500).json({ message: "Error gestionando tokens" });
    }
};

// 4. OBTENER DETALLES DEL JUEGO (ESTA ES LA QUE FALTABA)
export const getGameDetails = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        const game = await Game.findById(id).populate('season');
        if (!game) return res.status(404).json({ message: "Juego no encontrado" });

        // Buscamos jugadores vinculados a este juego
        const players = await GamePlayer.find({ game: id })
            .populate('user', 'alias avatar') // Traemos datos del usuario
            .sort({ isAlive: -1 }); // Vivos primero

        // Devolvemos el juego combinado con la lista de jugadores
        res.json({
            ...game.toObject(),
            players: players
        });

    } catch (error) {
        res.status(500).json({ message: "Error obteniendo detalles del juego" });
    }
};