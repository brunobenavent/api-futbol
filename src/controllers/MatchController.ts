import { Request, Response } from 'express';
import { ScraperService } from '../services/ScraperService.js';
import Match from '../models/Match.js';
import Season from '../models/Season.js'; // <--- Necesitamos importar esto

const scraper = new ScraperService();

// Endpoint para obtener partidos (LECTURA)
export const getMatches = async (req: Request, res: Response) => {
  try {
    const { season, round } = req.query;
    const query: any = {};
    
    // CORRECCIÓN: Si nos piden "season=2026", buscamos su ID primero
    if (season) {
        const seasonDoc = await Season.findOne({ year: season });
        if (seasonDoc) {
            query.season = seasonDoc._id; // Usamos el ID, no el string "2026"
        } else {
            // Si piden una temporada que no existe, devolvemos array vacío
            return res.json([]); 
        }
    }

    if (round) query.round = round;

    const matches = await Match.find(query)
        .sort({ round: 1 })
        .populate('homeTeam')
        .populate('awayTeam')
        .populate('season'); // Para ver info de la temporada

    res.json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo partidos' });
  }
};

// Endpoint SEED (Carga inicial)
export const seedSeason = async (req: Request, res: Response) => {
    const { season } = req.params;
    
    if (!season) {
        return res.status(400).send("Falta el parámetro season (ej: 2026)");
    }

    res.send(`🚀 Seed iniciado para la temporada ${season}. Esto tardará unos minutos.`);

    scraper.scrapeFullSeason(season).catch(err => console.error(err));
};

// Endpoint HIDRATACIÓN (El que te daba error)
export const hydrateRound = async (req: Request, res: Response) => {
  const { season, round } = req.params;

  try {
    const roundNumber = parseInt(round);

    // 1. BUSCAR EL ID DE LA TEMPORADA (El paso que faltaba) 
    const seasonDoc = await Season.findOne({ year: season });
    
    if (!seasonDoc) {
        return res.status(404).send(`La temporada ${season} no existe en la base de datos. Ejecuta el seed primero.`);
    }

    // 2. Ahora buscamos usando el ID de la temporada
    const matches = await Match.find({ 
        season: seasonDoc._id, // <--- AHORA SÍ ES UN OBJECTID
        round: roundNumber 
    }).populate('homeTeam awayTeam');

    if (matches.length === 0) {
      return res.status(404).send("No hay partidos guardados para esa jornada.");
    }

    res.send(`🚀 Iniciando hidratación masiva para ${matches.length} partidos de la J${round}. Revisa la terminal.`);

    (async () => {
        console.log(`💧 Hidratando Jornada ${round} (Temporada ${season})...`);
        
        for (const match of matches) {
            const home = match.homeTeam as any;
            const away = match.awayTeam as any;
            
            console.log(`>> Procesando detalles de: ${home.name} vs ${away.name}`);
            await scraper.scrapeMatchDetail(match.matchUrl);
            
            console.log("⏳ Enfriando motores (1s)...");
            await new Promise(r => setTimeout(r, 1000));
        }
        console.log(`✅ Hidratación de la Jornada ${round} completada.`);
    })();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).send("Error iniciando hidratación");
  }
};