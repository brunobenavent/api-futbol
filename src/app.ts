import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

import cors from 'cors'; // <--- IMPORTAR

// Importamos los enrutadores
import matchRoutes from './routes/matchRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js'; // <--- NUEVO (Auth)
import gameRoutes from './routes/gameRoutes.js';

const app: Application = express();
// 👇 AÑADE ESTO AL PRINCIPIO 👇
app.use(cors({
    origin: 'http://localhost:5173', // Permite peticiones desde tu frontend
    credentials: true // Permite cookies/headers de autorización
}));
// Middleware para leer JSON en el body de las peticiones (Login, Registro, etc.)
app.use(express.json());

// Ruta Base (Ping)
app.get('/', (req, res) => {
  res.send('API de Fútbol Scraper funcionando ⚽️');
});

// --- REGISTRO DE RUTAS ---

// 1. Rutas de Partidos (Prefijo: /api/matches)
app.use('/api/matches', matchRoutes);

// 2. Rutas de Equipos (Prefijo: /api/teams)
app.use('/api/teams', teamRoutes);

// 3. Rutas de Autenticación (Prefijo: /api/auth)
app.use('/api/auth', authRoutes);


app.use('/api/game', gameRoutes);

// 4. Rutas de Admin/Scraping (Sin prefijo extra, ya vienen definidos en el router)
app.use('/', adminRoutes);

// --- DOCUMENTACIÓN SWAGGER ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

export default app;