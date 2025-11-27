import express, { Application } from 'express';
import { triggerScrape, forceUpdateMatch } from './controllers/ScraperController.js';
// Importamos el nuevo controlador hydrateRound
import { getMatches, seedSeason, hydrateRound } from './controllers/MatchController.js'; 

const app: Application = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API de Fútbol Scraper funcionando ⚽️');
});

// --- RUTAS DE SCRAPING MANUAL ---
// Scrapear la lista de partidos de una jornada (Rápido, sin detalles)
app.get('/test-scrape/:season/:round', triggerScrape);

// Hidratar un partido concreto por URL
app.get('/api/hydrate-match', forceUpdateMatch); 

// NUEVO: Hidratar una jornada entera (lento, pero automático)
app.get('/api/hydrate-round/:season/:round', hydrateRound);


// --- RUTAS DE DATOS ---
// Ver partidos
app.get('/api/matches', getMatches);

// Cargar temporada completa (Seed)
app.get('/api/seed/:season', seedSeason);

export default app;