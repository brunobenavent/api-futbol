import mongoose, { Schema, Document, Types } from 'mongoose';
import Team from './Team.js'; 

interface IPick {
  round: number;
  mainTeam: Types.ObjectId;   
  backupTeam: Types.ObjectId; 
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
}

const PickSchema: Schema = new Schema({
    round: { type: Number, required: true },
    mainTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    backupTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    result: { type: String, enum: ['WIN', 'LOSE', 'PENDING', 'VOID', 'DRAW'], default: 'PENDING' },
    usedBackup: { type: Boolean, default: false }
}, { _id: false });

const GamePlayerSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  game: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
  playerNumber: { type: Number, required: true },
  isAlive: { type: Boolean, default: true },
  usedTeams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
  picks: [PickSchema]
}, { timestamps: true });

GamePlayerSchema.index({ user: 1, game: 1 }, { unique: true });

const GamePlayer = mongoose.model<IGamePlayer>('GamePlayer', GamePlayerSchema);
export default GamePlayer;