import mongoose, { Schema, Document } from 'mongoose';

export interface IGamePlayer extends Document {
  user: mongoose.Types.ObjectId;
  game: mongoose.Types.ObjectId;
  playerNumber: number; // El número "356"
  isAlive: boolean; // ¿Sigue vivo?
  usedTeams: mongoose.Types.ObjectId[]; // Lista de IDs de equipos que YA HA USADO (y ganado)
  
  // Historial de elecciones por jornada
  picks: Array<{
    round: number;
    mainTeam: mongoose.Types.ObjectId;   // Equipo Titular
    backupTeam: mongoose.Types.ObjectId; // Equipo Suplente
    result: 'WIN' | 'LOSE' | 'PENDING';
    usedBackup: boolean; // Si se tuvo que usar el suplente
  }>;
}

const GamePlayerSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  game: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
  playerNumber: { type: Number, required: true },
  isAlive: { type: Boolean, default: true },
  usedTeams: [{ type: Schema.Types.ObjectId, ref: 'Team' }], // Equipos "quemados"
  picks: [{
    round: Number,
    mainTeam: { type: Schema.Types.ObjectId, ref: 'Team' },
    backupTeam: { type: Schema.Types.ObjectId, ref: 'Team' },
    result: { type: String, enum: ['WIN', 'LOSE', 'PENDING'], default: 'PENDING' },
    usedBackup: { type: Boolean, default: false }
  }]
}, { timestamps: true });

// Índice para que un usuario no se apunte 2 veces al mismo juego
GamePlayerSchema.index({ user: 1, game: 1 }, { unique: true });

export default mongoose.model<IGamePlayer>('GamePlayer', GamePlayerSchema);