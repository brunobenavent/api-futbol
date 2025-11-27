import mongoose, { Schema, Document } from 'mongoose';

export interface IMatch extends Document {
  // RELACIONES (Referencias)
  homeTeam: mongoose.Types.ObjectId; 
  awayTeam: mongoose.Types.ObjectId;
  season: mongoose.Types.ObjectId;
  
  // DATOS DEL PARTIDO
  homeScore: number | null;
  awayScore: number | null;
  matchDate: Date | null;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'SUSPENDED';
  round: number;
  matchUrl: string;
  stadium: string | null; // Estadio específico del partido
  currentMinute: string | null;
  events: Array<{
    minute: string;
    player: string;
    score: string;
    team: 'home' | 'away';
  }>;
}

const MatchSchema: Schema = new Schema({
  // CAMBIO CLAVE: Referencias a otros modelos
  homeTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  awayTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  season: { type: Schema.Types.ObjectId, ref: 'Season', required: true },

  homeScore: { type: Number, default: null },
  awayScore: { type: Number, default: null },
  matchDate: { type: Date, default: null },
  status: { 
    type: String, 
    enum: ['SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'SUSPENDED'], 
    default: 'SCHEDULED' 
  },
  round: { type: Number, required: true },
  matchUrl: { type: String, unique: true },
  stadium: { type: String, default: null },
  currentMinute: { type: String, default: null },
  events: [
    {
      minute: String,
      player: String,
      score: String,
      team: String
    }
  ]
}, { timestamps: true });

const Match = mongoose.model<IMatch>('Match', MatchSchema);
export default Match;