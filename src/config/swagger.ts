import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Fútbol Scraper API ⚽️',
    version: '1.0.0',
    description: 'API para resultados de fútbol en tiempo real.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Localhost' },
    { url: 'https://api-futbol-pfkw.onrender.com', description: 'Producción' }
  ],
  components: {
    schemas: {
      Team: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '65a...' },
          name: { type: 'string', example: 'Real Madrid' },
          logo: { type: 'string', example: 'https://...' },
          stadium: { type: 'string', example: 'Santiago Bernabéu' }
        }
      },
      Match: {
        type: 'object',
        properties: {
          homeTeam: { $ref: '#/components/schemas/Team' },
          awayTeam: { $ref: '#/components/schemas/Team' },
          homeScore: { type: 'integer', example: 2 },
          awayScore: { type: 'integer', example: 1 },
          status: { type: 'string', enum: ['SCHEDULED', 'LIVE', 'FINISHED'] },
          matchDate: { type: 'string', format: 'date-time' },
          stadium: { type: 'string' },
          events: { type: 'array', items: { type: 'object' } }
        }
      }
    }
  },
  paths: {
    '/api/matches': {
      get: {
        summary: 'Obtener lista de partidos',
        tags: ['Matches'],
        parameters: [
          { in: 'query', name: 'season', schema: { type: 'string' }, description: 'Año (2026)' },
          { in: 'query', name: 'round', schema: { type: 'integer' }, description: 'Jornada' }
        ],
        responses: {
          200: {
            description: 'Lista de partidos',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Match' } } } }
          }
        }
      }
    },
    '/api/matches/current-round': {
      get: {
        summary: 'Obtener jornada actual',
        tags: ['Matches'],
        responses: {
          200: {
            description: 'Info de jornada',
            content: { 'application/json': { schema: { type: 'object' } } }
          }
        }
      }
    },
    '/api/matches/{id}': {
      get: {
        summary: 'Obtener un partido por ID',
        tags: ['Matches'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Detalle del partido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Match' } } } }
        }
      }
    },
    '/api/teams': {
      get: {
        summary: 'Listar equipos',
        tags: ['Teams'],
        responses: {
          200: { description: 'Lista de equipos', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Team' } } } } }
        }
      }
    },
    '/api/teams/{id}': {
      get: {
        summary: 'Obtener equipo por ID',
        tags: ['Teams'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Info del equipo', content: { 'application/json': { schema: { $ref: '#/components/schemas/Team' } } } }
        }
      }
    }
  }
};

const options: swaggerJSDoc.Options = {
  definition: swaggerDefinition,
  apis: [], // YA NO BUSCAMOS EN ARCHIVOS, TODO ESTÁ AQUÍ
};

export const swaggerSpec = swaggerJSDoc(options);