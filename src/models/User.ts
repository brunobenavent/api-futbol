import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name: string;
  surname: string;
  alias: string;
  slug: string;
  email: string;
  phone?: string;
  avatar: string;
  role: 'ADMIN' | 'USER';
  status: 'PENDING_APPROVAL' | 'WAITING_CODE' | 'ACTIVE' | 'REJECTED';
  verificationCode?: string;
  password?: string; 
  resetPasswordToken?: string; 
  resetPasswordExpires?: Date;
  tokens: number;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  alias: { type: String, required: true, unique: true },
  slug: { type: String, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, select: false }, 
  phone: { type: String },
  avatar: { type: String, default: 'default_avatar.png' },
  role: { type: String, enum: ['ADMIN', 'USER'], default: 'USER' },
  status: { 
    type: String, 
    enum: ['PENDING_APPROVAL', 'WAITING_CODE', 'ACTIVE', 'REJECTED'], 
    default: 'PENDING_APPROVAL' 
  },
  verificationCode: { type: String, select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  tokens: { type: Number, default: 0 }
}, { timestamps: true });

// --- MIDDLEWARE 1: SLUG (AHORA ASÍNCRONO SIN NEXT) ---
UserSchema.pre('save', async function() {
  const user = this as any;
  if (user.isModified('alias')) {
    const aliasStr = String(user.alias);
    user.slug = aliasStr.trim().toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
  }
  // Sin next(). La promesa resuelve sola.
});

// --- MIDDLEWARE 2: HASH PASSWORD (ASÍNCRONO SIN NEXT) ---
UserSchema.pre('save', async function() {
    const user = this as any;
    if (!user.isModified('password') || !user.password) return; 

    try {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(user.password, salt);
    } catch (error: any) { 
        throw new Error("Error hashing password."); 
    }
});

const User = mongoose.model<IUser>('User', UserSchema);
export default User;