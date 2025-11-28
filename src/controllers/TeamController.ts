import { Request, Response } from 'express';
import Team from '../models/Team.js';
import Season from '../models/Season.js'; // <--- IMPORTANTE: Importar Season

// Obtener un equipo por su ID
export const getTeamById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const team = await Team.findById(id);
    if (!team) return res.status(404).json({ message: 'Equipo no encontrado' });
    res.json(team);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener el equipo' });
  }
};

// Obtener equipos (FILTRADOS POR SEASON)
export const getAllTeams = async (req: Request, res: Response) => {
    try {
        const { season } = req.query;

        // CASO A: Nos piden una temporada específica (?season=2026)
        if (season) {
            // 1. Buscamos la temporada
            const seasonDoc = await Season.findOne({ year: season }).populate('teams');
            
            if (!seasonDoc) {
                return res.status(404).json({ message: `La temporada ${season} no existe.` });
            }

            // 2. Extraemos los equipos y los ordenamos alfabéticamente
            // TypeScript necesita ayuda aquí para saber que .teams está poblado
            const teams = (seasonDoc.teams as any).sort((a: any, b: any) => 
                a.name.localeCompare(b.name)
            );

            return res.json(teams);
        }

        // CASO B: No piden temporada -> Devolvemos TODOS los equipos históricos
        const teams = await Team.find().sort({ name: 1 }); 
        res.json(teams);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error obteniendo equipos' });
    }
};