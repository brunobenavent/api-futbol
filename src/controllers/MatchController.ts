import { Request, Response } from 'express';
import { ScraperService } from '../services/ScraperService.js';
import Match from '../models/Match.js';
import Season from '../models/Season.js';
// Importamos Team para asegurar que Mongoose registra el modelo
import '../models/Team.js';

const scraper = new ScraperService();

// Helper: Calcular año de la temporada según la fecha actual
const getAutoSeasonYear = (): string => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); 
    // Si estamos en la segunda mitad del año (Julio en adelante), la temporada es Año+1.
    if (currentMonth >= 6) { 
        return (currentYear + 1).toString();
    }
    return currentYear.toString();
};

// --- LECTURA DE DATOS ---

export const getMatches = async (req: Request, res: Response) => {
  try {
    const { season, round } = req.query;
    const query: any = {};
    
    if (season) {
        const seasonDoc = await Season.findOne({ year: season });
        if (seasonDoc) query.season = seasonDoc._id;
        else return res.json([]); 
    }

    if (round) query.round = round;

    const matches = await Match.find(query)
        .sort({ round: 1 })
        .populate('homeTeam awayTeam season');

    res.json(matches);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

export const getMatchById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const match = await Match.findById(id)
        .populate('homeTeam awayTeam season');
  
      if (!match) return res.status(404).json({ message: 'Partido no encontrado' });
      res.json(match);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener el partido' });
    }
};

export const getMatchesByRound = async (req: Request, res: Response) => {
    const { season, round } = req.params;
    try {
        const seasonDoc = await Season.findOne({ year: season });
        if (!seasonDoc) return res.status(404).json({ message: 'Temporada no encontrada' });

        const matches = await Match.find({ 
            season: seasonDoc._id, 
            round: parseInt(round) 
        }).populate('homeTeam awayTeam season');

        res.json(matches);
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
};

// --- NUEVO: CURRENT ROUND + PARTIDOS ---
export const getCurrentRound = async (req: Request, res: Response) => {
  try {
    // 1. Calculamos temporada automática
    const autoSeason = getAutoSeasonYear();
    const seasonYear = req.query.season ? String(req.query.season) : autoSeason;

    const seasonDoc = await Season.findOne({ year: seasonYear });
    if (!seasonDoc) return res.status(404).json({ message: "Temporada no iniciada" });

    const now = new Date();

    // 2. Determinamos cuál es la jornada "activa"
    // Buscamos el primer partido que no ha pasado todavía (o es hoy)
    const nextMatch = await Match.findOne({
        season: seasonDoc._id,
        matchDate: { $gte: now } 
    }).sort({ matchDate: 1 }).select('round'); 

    let targetRound = 38; // Por defecto fin de liga
    let status = 'FINISHED';

    if (nextMatch) {
        targetRound = nextMatch.round;
        status = 'ACTIVE';
    }

    // 3. Obtenemos los partidos de esa jornada
    const matches = await Match.find({
        season: seasonDoc._id,
        round: targetRound
    })
    .sort({ matchDate: 1 }) // Ordenados por hora
    .populate('homeTeam awayTeam'); // Rellenamos nombres y escudos

    res.json({ 
        season: seasonYear, 
        currentRound: targetRound, 
        status: status,
        matches: matches // <--- Datos listos para el Frontend
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error' });
  }
};

// --- MANTENIMIENTO ---

export const seedSeason = async (req: Request, res: Response) => {
    const { season } = req.params;
    if (!season) return res.status(400).send("Falta season");
    res.send(`🚀 Seed iniciado para ${season}.`);
    scraper.scrapeFullSeason(season).catch(err => console.error(err));
};

export const hydrateRound = async (req: Request, res: Response) => {
  const { season, round } = req.params;
  try {
    const roundNumber = parseInt(round);
    const seasonDoc = await Season.findOne({ year: season });
    
    if (!seasonDoc) return res.status(404).send("Temporada no encontrada");

    const matches = await Match.find({ season: seasonDoc._id, round: roundNumber }).populate('homeTeam awayTeam');

    if (matches.length === 0) return res.status(404).send("No hay partidos.");

    res.send(`🚀 Hidratando J${round}.`);

    (async () => {
        console.log(`💧 Hidratando J${round}...`);
        for (const match of matches) {
            const home = match.homeTeam as any;
            const away = match.awayTeam as any;
            console.log(`>> Procesando: ${home.name} vs ${away.name}`);
            await scraper.scrapeMatchDetail(match.matchUrl);
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log(`✅ Hidratación completada.`);
    })();
  } catch (error) {
    if (!res.headersSent) res.status(500).send("Error");
  }
};

export const syncStadiums = async (req: Request, res: Response) => {
    try {
      const matchesWithStadium = await Match.find({ stadium: { $ne: null, $exists: true } });
      if (matchesWithStadium.length === 0) return res.send("No hay datos para sincronizar.");
  
      res.send(`🔄 Sincronizando estadios...`);
      (async () => {
          let count = 0;
          for (const match of matchesWithStadium) {
              if (match.homeTeam && match.stadium) {
                  // Importamos Team explícitamente arriba, así que esto funciona
                  const TeamModel = (await import('../models/Team.js')).default;
                  await TeamModel.findByIdAndUpdate(match.homeTeam, { stadium: match.stadium });
                  count++;
              }
          }
          console.log(`✅ ${count} equipos actualizados.`);
      })();
    } catch (error) {
      if (!res.headersSent) res.status(500).send("Error");
    }
};