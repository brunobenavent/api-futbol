import express, { Application } from 'express';

// Importamos los enrutadores
import matchRoutes from './routes/matchRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// --- IMPORTACIONES DE SWAGGER (ESTO TE FALTABA) ---
import swaggerUi from 'swagger-ui-express'; 
import { swaggerSpec } from './config/swagger.js'; 

const app: Application = express();

app.use(express.json());

// Ruta Base
app.get('/', (req, res) => {
  res.send('API de Fútbol Scraper funcionando ⚽️');
});

// --- REGISTRO DE RUTAS ---

// 1. Rutas de Partidos (Prefijo: /api/matches)
app.use('/api/matches', matchRoutes);

// 2. Rutas de Equipos (Prefijo: /api/teams)
app.use('/api/teams', teamRoutes);

// 3. Rutas de Admin/Scraping
app.use('/', adminRoutes);

// --- DOCUMENTACIÓN SWAGGER ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

export default app;