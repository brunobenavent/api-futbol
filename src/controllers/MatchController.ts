import { Request, Response } from 'express';
import { ScraperService } from '../services/ScraperService.js';
import Match from '../models/Match.js';
import Season from '../models/Season.js';
// Importamos Team para asegurar que Mongoose registra el modelo y funciona el populate
import '../models/Team.js';

const scraper = new ScraperService();

// --- HELPER: CALCULAR TEMPORADA ACTUAL AUTOMÁTICA ---
const getAutoSeasonYear = (): string => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0 = Enero, 11 = Diciembre
    
    // Si estamos en la segunda mitad del año (Julio en adelante), la temporada es Año+1.
    // Ej: Nov 2025 -> Temporada "2026"
    if (currentMonth >= 6) { 
        return (currentYear + 1).toString();
    }
    return currentYear.toString();
};

// --- NUEVA FUNCIÓN HELPER EXPORTADA (Lógica Pura) ---
// Esta es la que llamará GameLogicController para validar predicciones
export const getActiveRoundNumber = async (): Promise<number> => {
    const autoSeason = getAutoSeasonYear();
    const seasonDoc = await Season.findOne({ year: autoSeason });
    
    // Si no hay temporada, asumimos jornada 1 por defecto
    if (!seasonDoc) return 1;

    const now = new Date();

    // Buscamos el primer partido futuro (o de hoy)
    const nextMatch = await Match.findOne({
        season: seasonDoc._id,
        matchDate: { $gte: now } 
    }).sort({ matchDate: 1 }).select('round'); 

    // Si hay partido futuro, esa es la jornada. Si no, es que acabó (38).
    return nextMatch ? nextMatch.round : 38;
};

// --- CONTROLADORES EXPRESS ---

// 1. Obtener partidos (Filtros flexibles)
export const getMatches = async (req: Request, res: Response) => {
  try {
    const { season, round } = req.query;
    const query: any = {};
    
    // Si el usuario pide una temporada específica, buscamos su ID
    if (season) {
        const seasonDoc = await Season.findOne({ year: season });
        if (seasonDoc) {
            query.season = seasonDoc._id;
        } else {
            return res.json([]); // Temporada no encontrada, devolvemos vacío
        }
    }

    if (round) query.round = round;

    const matches = await Match.find(query)
        .sort({ round: 1 })
        .populate('homeTeam')
        .populate('awayTeam')
        .populate('season');

    res.json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo partidos' });
  }
};

// 2. Obtener un partido por ID
export const getMatchById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const match = await Match.findById(id)
        .populate('homeTeam')
        .populate('awayTeam')
        .populate('season');
  
      if (!match) return res.status(404).json({ message: 'Partido no encontrado' });
      res.json(match);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error al obtener el partido' });
    }
};

// 3. Obtener partidos por Temporada y Jornada (Ruta estricta)
export const getMatchesByRound = async (req: Request, res: Response) => {
    const { season, round } = req.params;
    try {
        const seasonDoc = await Season.findOne({ year: season });
        if (!seasonDoc) return res.status(404).json({ message: 'Temporada no encontrada' });

        const matches = await Match.find({ 
            season: seasonDoc._id, 
            round: parseInt(round) 
        })
        .populate('homeTeam')
        .populate('awayTeam')
        .populate('season');

        res.json(matches);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error obteniendo partidos' });
    }
};

// 4. Obtener Jornada Actual (Dashboard)
export const getCurrentRound = async (req: Request, res: Response) => {
  try {
    const seasonYear = req.query.season ? String(req.query.season) : getAutoSeasonYear();
    const seasonDoc = await Season.findOne({ year: seasonYear });
    
    if (!seasonDoc) return res.status(404).json({ message: "Temporada no iniciada" });

    // Usamos la lógica para determinar la jornada activa
    const now = new Date();
    const nextMatch = await Match.findOne({
        season: seasonDoc._id,
        matchDate: { $gte: now } 
    }).sort({ matchDate: 1 }).select('round matchDate'); 

    let targetRound = 38;
    let status = 'FINISHED';

    if (nextMatch) {
        targetRound = nextMatch.round;
        status = 'ACTIVE';
    }

    // Devolvemos la jornada Y los partidos de esa jornada
    const matches = await Match.find({
        season: seasonDoc._id,
        round: targetRound
    })
    .sort({ matchDate: 1 })
    .populate('homeTeam')
    .populate('awayTeam');

    res.json({ 
        season: seasonYear, 
        currentRound: targetRound, 
        status: status,
        matches: matches 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error calculando jornada actual' });
  }
};

// --- MANTENIMIENTO ---

export const seedSeason = async (req: Request, res: Response) => {
    const { season } = req.params;
    if (!season) return res.status(400).send("Falta el parámetro season (ej: 2026)");

    res.send(`🚀 Seed iniciado para la temporada ${season}. Esto tardará unos minutos. Mira la consola.`);
    
    // Ejecutamos en background
    scraper.scrapeFullSeason(season).catch(err => console.error(err));
};

export const hydrateRound = async (req: Request, res: Response) => {
  const { season, round } = req.params;
  try {
    const roundNumber = parseInt(round);
    const seasonDoc = await Season.findOne({ year: season });
    
    if (!seasonDoc) return res.status(404).send("Temporada no encontrada en la base de datos.");

    const matches = await Match.find({ season: seasonDoc._id, round: roundNumber }).populate('homeTeam awayTeam');

    if (matches.length === 0) return res.status(404).send("No hay partidos guardados para esa jornada.");

    res.send(`🚀 Iniciando hidratación masiva para ${matches.length} partidos de la J${round}. Revisa la terminal.`);

    (async () => {
        console.log(`💧 Hidratando Jornada ${round} (Temporada ${season})...`);
        for (const match of matches) {
            const home = match.homeTeam as any;
            const away = match.awayTeam as any;
            
            console.log(`>> Procesando detalles de: ${home.name} vs ${away.name}`);
            await scraper.scrapeMatchDetail(match.matchUrl);
            
            // Pausa de seguridad para evitar bloqueos (2s)
            console.log("⏳ Enfriando motores (2s)...");
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log(`✅ Hidratación de la Jornada ${round} completada.`);
    })();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).send("Error iniciando hidratación");
  }
};

export const syncStadiums = async (req: Request, res: Response) => {
    try {
      const matchesWithStadium = await Match.find({ stadium: { $ne: null, $exists: true } });
      if (matchesWithStadium.length === 0) return res.send("No hay datos para sincronizar.");
  
      res.send(`🔄 Sincronizando estadios de ${matchesWithStadium.length} partidos a sus equipos...`);
      (async () => {
          let count = 0;
          for (const match of matchesWithStadium) {
              if (match.homeTeam && match.stadium) {
                  // Importamos Team dinámicamente por seguridad de contexto o usamos la referencia
                  const TeamModel = (await import('../models/Team.js')).default;
                  await TeamModel.findByIdAndUpdate(match.homeTeam, { stadium: match.stadium });
                  count++;
              }
          }
          console.log(`✅ Sincronización completada: ${count} equipos actualizados.`);
      })();
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.status(500).send("Error en sincronización");
    }
};