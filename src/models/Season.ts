import mongoose, { Schema, Document } from 'mongoose';

export interface ISeason extends Document {
  year: string;
  name: string;
  teams: mongoose.Types.ObjectId[]; // <--- ESTO ES LA CLAVE
}

const SeasonSchema: Schema = new Schema({
  year: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  // Un array de IDs que apuntan a la colección 'Team'
  teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }] 
}, { timestamps: true });

const Season = mongoose.model<ISeason>('Season', SeasonSchema);
export default Season;