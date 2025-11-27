import mongoose, { Schema, Document } from 'mongoose';

export interface ITeam extends Document {
  name: string;        // "Real Madrid"
  slug: string;        // "real-madrid" (Identificador único en la URL)
  logo: string | null; // URL del escudo
  stadium: string | null; // Estadio principal (opcional, por si queremos moverlo aquí)
}

const TeamSchema: Schema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  logo: { type: String, default: null },
  stadium: { type: String, default: null }
}, { timestamps: true });

const Team = mongoose.model<ITeam>('Team', TeamSchema);
export default Team;