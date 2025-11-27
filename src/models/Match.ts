import mongoose, { Schema, Document } from 'mongoose';

export interface IMatch extends Document {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  matchDate: Date | null;
  // ESTADOS SOPORTADOS
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'SUSPENDED';
  season: string;
  round: number;
  matchUrl: string;
  homeLogo: string | null;
  awayLogo: string | null;
  stadium: string | null;
  currentMinute: string | null;
  events: Array<{
    minute: string;
    player: string;
    score: string;
    team: 'home' | 'away';
  }>;
}

const MatchSchema: Schema = new Schema({
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  homeScore: { type: Number, default: null },
  awayScore: { type: Number, default: null },
  matchDate: { type: Date, default: null },
  status: { 
    type: String, 
    enum: ['SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'SUSPENDED'], 
    default: 'SCHEDULED' 
  },
  season: { type: String, required: true },
  round: { type: Number, required: true },
  matchUrl: { type: String, unique: true },
  homeLogo: { type: String, default: null },
  awayLogo: { type: String, default: null },
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