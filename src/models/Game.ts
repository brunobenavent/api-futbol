import mongoose, { Schema, Document } from 'mongoose';

export interface IGame extends Document {
  name: string;
  season: mongoose.Types.ObjectId;
  // Añadimos 'PACT_PHASE' para la votación final
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_RESURRECTION' | 'PACT_PHASE' | 'FINISHED';
  entryPrice: number;
  pot: number;
  currentRound: number;
  winner?: mongoose.Types.ObjectId;
  
  // --- NUEVA CONFIGURACIÓN FLEXIBLE ---
  rules: {
    pact: { 
        enabled: boolean; 
        threshold: number; // Ej: A los 5 jugadores se activa
    };
    exactScore: { 
        enabled: boolean; 
        reward: 'SHIELD' | 'TOKENS'; // Qué ganan si aciertan
    };
  };
}

const GameSchema: Schema = new Schema({
  name: { type: String, required: true },
  season: { type: Schema.Types.ObjectId, ref: 'Season', required: true },
  status: { 
    type: String, 
    enum: ['OPEN', 'IN_PROGRESS', 'WAITING_RESURRECTION', 'PACT_PHASE', 'FINISHED'], 
    default: 'OPEN' 
  },
  entryPrice: { type: Number, required: true },
  pot: { type: Number, default: 0 },
  currentRound: { type: Number, default: 1 },
  winner: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  // OBJETO DE REGLAS (Extensible para el futuro)
  rules: {
    pact: {
        enabled: { type: Boolean, default: false },
        threshold: { type: Number, default: 3 }
    },
    exactScore: {
        enabled: { type: Boolean, default: false },
        reward: { type: String, enum: ['SHIELD', 'TOKENS'], default: 'SHIELD' }
    }
  }
}, { timestamps: true });

const Game = mongoose.model<IGame>('Game', GameSchema);
export default Game;