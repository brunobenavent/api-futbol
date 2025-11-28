import mongoose, { Schema, Document } from 'mongoose';

export interface ITeam extends Document {
  name: string;
  slug: string;
  logo: string | null;
  stadium: string | null;
}

const TeamSchema: Schema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  logo: { type: String, default: null },
  stadium: { type: String, default: null }
}, { timestamps: true });

const Team = mongoose.model<ITeam>('Team', TeamSchema);
export default Team;