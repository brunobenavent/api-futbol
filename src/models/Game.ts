import mongoose, { Schema, Document } from 'mongoose';

export interface IGame extends Document {
  name: string; // Ej: "Superliga Calamar 1"
  season: mongoose.Types.ObjectId; // Referencia a Season (2026)
  status: 'OPEN' | 'IN_PROGRESS' | 'FINISHED';
  pot: number; // Bote acumulado
  currentRound: number; // Jornada que se está jugando
  entryPrice: number; // Coste en tokens para entrar
}

const GameSchema: Schema = new Schema({
  name: { type: String, required: true },
  season: { type: Schema.Types.ObjectId, ref: 'Season', required: true },
  status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'FINISHED'], default: 'OPEN' },
  pot: { type: Number, default: 0 },
  currentRound: { type: Number, default: 1 },
  entryPrice: { type: Number, required: true }
}, { timestamps: true });

export default mongoose.model<IGame>('Game', GameSchema);