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

// 2. Crear Juego
export const createGame = async (req: Request, res: Response) => {
    try {
        const { name, seasonYear, entryPrice } = req.body;
        const season = await Season.findOne({ year: seasonYear });
        if (!season) return res.status(404).json({ message: "Temporada no encontrada" });

        const newGame = await Game.create({
            name, season: season._id, status: 'OPEN', entryPrice, pot: 0, currentRound: 1
        });

        res.status(201).json({ message: "Juego creado", game: newGame });
    } catch (error) {
        res.status(500).json({ message: "Error creando juego" });
    }
};

// 3. GESTIONAR TOKENS (Dar / Quitar)
export const manageTokens = async (req: Request, res: Response) => {
    try {
        const { userId, amount, operation } = req.body; 
        // operation debe ser 'add' o 'subtract'
        
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        const cantidad = Number(amount);
        if (isNaN(cantidad) || cantidad <= 0) {
            return res.status(400).json({ message: "La cantidad debe ser un número positivo." });
        }

        if (operation === 'add') {
            user.tokens += cantidad;
        } else if (operation === 'subtract') {
            user.tokens -= cantidad;
            if (user.tokens < 0) user.tokens = 0; // No permitimos deuda negativa
        } else {
            return res.status(400).json({ message: "Operación inválida. Usa 'add' o 'subtract'." });
        }

        await user.save();
        
        console.log(`💰 [ADMIN]: ${operation} ${cantidad} tokens a ${user.alias}. Saldo: ${user.tokens}`);
        
        res.json({ 
            message: `Tokens actualizados (${operation === 'add' ? '+' : '-'}${cantidad})`, 
            saldoActual: user.tokens,
            usuario: user.alias
        });
    } catch (error) {
        res.status(500).json({ message: "Error gestionando tokens" });
    }
};

// 4. Detalle Juego
export const getGameDetails = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const game = await Game.findById(id).populate('season');
        if (!game) return res.status(404).json({ message: "Juego no encontrado" });

        const players = await GamePlayer.find({ game: id })
            .populate('user', 'alias avatar')
            .sort({ isAlive: -1 });

        res.json({ ...game.toObject(), players: players });
    } catch (error) {
        res.status(500).json({ message: "Error obteniendo detalles" });
    }
};