import { Request, Response } from 'express';
import Team from '../models/Team.js';

// Obtener un equipo por su ID (Ej: para la página de detalle del equipo)
export const getTeamById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const team = await Team.findById(id);

    if (!team) {
      return res.status(404).json({ message: 'Equipo no encontrado' });
    }

    res.json(team);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener el equipo' });
  }
};

// Obtener todos los equipos (Ej: para un listado o selector)
export const getAllTeams = async (req: Request, res: Response) => {
    try {
        const teams = await Team.find().sort({ name: 1 }); // Orden alfabético
        res.json(teams);
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo equipos' });
    }
};