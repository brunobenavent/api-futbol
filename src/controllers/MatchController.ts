import { Request, Response } from 'express';
import { ScraperService } from '../services/ScraperService.js';
import Match from '../models/Match.js';
import Season from '../models/Season.js';
import Team from '../models/Team.js'; // <--- ¡AQUÍ ESTABA EL FALLO! Antes era solo import '../...'

const scraper = new ScraperService();

// --- HELPER: CALCULAR TEMPORADA ACTUAL AUTOMÁTICA ---
const getAutoSeasonYear = (): string => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0 = Enero, 11 = Diciembre
    
    // Si estamos en la segunda mitad del año (Julio en adelante), la temporada es Año+1.
    if (currentMonth >= 6) { 
        return (currentYear + 1).toString();
    }
    return currentYear.toString();
};

// --- ENDPOINT: OBTENER PARTIDOS (LECTURA) ---
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
            return res.json([]); // Temporada no encontrada
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

// NUEVO: Obtener un partido específico por su ID
export const getMatchById = async (req: Request, res: Response) => {
    const { id } = req.params;
  
    try {
      const match = await Match.findById(id)
        .populate('homeTeam')  
        .populate('awayTeam')  
        .populate('season');   
  
      if (!match) {
        return res.status(404).json({ message: 'Partido no encontrado' });
      }
  
      res.json(match);
  
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error al obtener el partido. ID inválido.' });
    }
};

// Obtener partidos por temporada y jornada (Ruta estricta)
export const getMatchesByRound = async (req: Request, res: Response) => {
    const { season, round } = req.params;
    
    try {
        const seasonDoc = await Season.findOne({ year: season });
        
        if (!seasonDoc) {
            return res.status(404).json({ message: 'Temporada no encontrada' });
        }

        const matches = await Match.find({ 
            season: seasonDoc._id, 
            round: parseInt(round) 
        })
        .populate('homeTeam awayTeam season');

        res.json(matches);

    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo partidos' });
    }
}

// --- ENDPOINT: SEED (CARGA INICIAL DE TEMPORADA) ---
export const seedSeason = async (req: Request, res: Response) => {
    const { season } = req.params;
    
    if (!season) {
        return res.status(400).send("Falta el parámetro season (ej: 2026)");
    }

    res.send(`🚀 Seed iniciado para la temporada ${season}. Esto tardará unos minutos. Mira la consola.`);

    // Ejecutamos en background
    scraper.scrapeFullSeason(season).catch(err => console.error(err));
};

// --- ENDPOINT: HIDRATACIÓN DE JORNADA (DETALLES) ---
export const hydrateRound = async (req: Request, res: Response) => {
  const { season, round } = req.params;

  try {
    const roundNumber = parseInt(round);

    // 1. Buscamos el ID de la temporada
    const seasonDoc = await Season.findOne({ year: season });
    
    if (!seasonDoc) {
        return res.status(404).send(`La temporada ${season} no existe en la base de datos. Ejecuta el seed primero.`);
    }

    // 2. Buscamos los partidos de esa jornada usando el ID
    const matches = await Match.find({ 
        season: seasonDoc._id, 
        round: roundNumber 
    }).populate('homeTeam awayTeam'); 

    if (matches.length === 0) {
      return res.status(404).send("No hay partidos guardados para esa jornada.");
    }

    res.send(`🚀 Iniciando hidratación masiva para ${matches.length} partidos de la J${round}. Revisa la terminal.`);

    // 3. Proceso en background
    (async () => {
        console.log(`💧 Hidratando Jornada ${round} (Temporada ${season})...`);
        
        for (const match of matches) {
            const home = match.homeTeam as any;
            const away = match.awayTeam as any;
            
            console.log(`>> Procesando detalles de: ${home.name} vs ${away.name}`);
            
            await scraper.scrapeMatchDetail(match.matchUrl);
            
            // Freno de mano (2 segundos)
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

// --- ENDPOINT: OBTENER JORNADA ACTUAL AUTOMÁTICA ---
export const getCurrentRound = async (req: Request, res: Response) => {
  try {
    // 1. Calculamos la temporada automática
    const autoSeason = getAutoSeasonYear();
    const seasonYear = req.query.season ? String(req.query.season) : autoSeason;

    // 2. Buscamos el ID de la temporada
    const seasonDoc = await Season.findOne({ year: seasonYear });
    
    if (!seasonDoc) {
        return res.status(404).json({ 
            message: `La temporada ${seasonYear} no existe en la base de datos. Ejecuta el seed.` 
        });
    }

    const now = new Date();

    // 3. Buscamos el PRIMER partido futuro
    const nextMatch = await Match.findOne({
        season: seasonDoc._id,
        matchDate: { $gte: now } 
    })
    .sort({ matchDate: 1 }) 
    .select('round matchDate'); 

    if (nextMatch) {
        res.json({
            season: seasonYear,
            currentRound: nextMatch.round,
            nextMatchDate: nextMatch.matchDate,
            status: 'ACTIVE'
        });
    } else {
        // Si no hay futuros, devolvemos la última jornada (38)
        res.json({
            season: seasonYear,
            currentRound: 38,
            status: 'FINISHED'
        });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error calculando jornada actual' });
  }
};

// --- ENDPOINT: SINCRONIZAR ESTADIOS (Mover de Match a Team) ---
export const syncStadiums = async (req: Request, res: Response) => {
    try {
      // Buscamos partidos que tengan estadio
      const matchesWithStadium = await Match.find({ stadium: { $ne: null, $exists: true } });
  
      if (matchesWithStadium.length === 0) {
          return res.send("No hay partidos con estadio para sincronizar. Hidrata primero.");
      }
  
      res.send(`🔄 Sincronizando estadios de ${matchesWithStadium.length} partidos a sus equipos...`);
  
      (async () => {
          let count = 0;
          for (const match of matchesWithStadium) {
              if (match.homeTeam && match.stadium) {
                  // AHORA SÍ: Team está importado y podemos usarlo
                  await Team.findByIdAndUpdate(match.homeTeam, { 
                      stadium: match.stadium 
                  });
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