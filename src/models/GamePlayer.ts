import mongoose, { Schema, Document, Types } from 'mongoose';
import Team from './Team.js'; 

interface IPick {
  round: number;
  mainTeam: Types.ObjectId;   
  backupTeam: Types.ObjectId; 
  // NUEVO: Pronóstico de resultado exacto (Opcional)
  scorePrediction?: { home: number; away: number }; 
  result: 'WIN' | 'LOSE' | 'PENDING' | 'VOID' | 'DRAW';
  usedBackup: boolean; 
}

export interface IGamePlayer extends Document {
  user: Types.ObjectId;
  game: Types.ObjectId;
  playerNumber: number;
  isAlive: boolean;
  usedTeams: Types.ObjectId[]; 
  picks: IPick[];
  
  // NUEVO: Inventario y Voto
  wildcards: string[]; // Ej: ['SHIELD']
  pactVote: 'SPLIT' | 'CONTINUE' | null;
}

const PickSchema: Schema = new Schema({
    round: { type: Number, required: true },
    mainTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    backupTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    
    // NUEVOS CAMPOS DE PRONÓSTICO
    scorePrediction: {
        home: { type: Number }, // Goles local
        away: { type: Number }  // Goles visitante
    },
    
    result: { type: String, enum: ['WIN', 'LOSE', 'PENDING', 'VOID', 'DRAW'], default: 'PENDING' },
    usedBackup: { type: Boolean, default: false }
}, { _id: false });

const GamePlayerSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  game: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
  playerNumber: { type: Number, required: true },
  isAlive: { type: Boolean, default: true },
  usedTeams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
  picks: [PickSchema],

  // NUEVOS CAMPOS DEL JUGADOR
  wildcards: [{ type: String }], // Array de strings simple
  pactVote: { type: String, enum: ['SPLIT', 'CONTINUE'], default: null }

}, { timestamps: true });

// Índice compuesto único
GamePlayerSchema.index({ game: 1, user: 1 }, { unique: true });

const GamePlayer = mongoose.model<IGamePlayer>('GamePlayer', GamePlayerSchema);
export default GamePlayer;