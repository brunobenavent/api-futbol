import mongoose, { Schema, Document } from 'mongoose';

export interface IGame extends Document {
  name: string;
  season: mongoose.Types.ObjectId;
  status: 'OPEN' | 'IN_PROGRESS' | 'FINISHED';
  entryPrice: number;
  pot: number;
  currentRound: number;
  // 👇👇👇 ESTO ES LO QUE TE FALTA 👇👇👇
  winner?: mongoose.Types.ObjectId; 
}

const GameSchema: Schema = new Schema({
  name: { type: String, required: true },
  season: { type: Schema.Types.ObjectId, ref: 'Season', required: true },
  status: { 
    type: String, 
    enum: ['OPEN', 'IN_PROGRESS', 'FINISHED'], 
    default: 'OPEN' 
  },
  entryPrice: { type: Number, required: true },
  pot: { type: Number, default: 0 },
  currentRound: { type: Number, default: 1 },
  // Asegúrate de que esto también está en el Schema
  winner: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

const Game = mongoose.model<IGame>('Game', GameSchema);
export default Game;    