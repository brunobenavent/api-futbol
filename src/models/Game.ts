import mongoose, { Schema, Document } from 'mongoose';

export interface IGame extends Document {
  name: string;
  season: mongoose.Types.ObjectId;
  // NUEVO ESTADO: WAITING_RESURRECTION
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_RESURRECTION' | 'FINISHED';
  entryPrice: number;
  pot: number;
  currentRound: number;
  winner?: mongoose.Types.ObjectId;
}

const GameSchema: Schema = new Schema({
  name: { type: String, required: true },
  season: { type: Schema.Types.ObjectId, ref: 'Season', required: true },
  status: { 
    type: String, 
    enum: ['OPEN', 'IN_PROGRESS', 'WAITING_RESURRECTION', 'FINISHED'], 
    default: 'OPEN' 
  },
  entryPrice: { type: Number, required: true },
  pot: { type: Number, default: 0 },
  currentRound: { type: Number, default: 1 },
  winner: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

const Game = mongoose.model<IGame>('Game', GameSchema);
export default Game;