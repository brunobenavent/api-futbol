import { Request, Response } from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { Secret } from 'jsonwebtoken';
import { sendVerificationEmail, sendResetPasswordEmail, sendAdminNotification, sendEmail } from '../services/EmailService.js';
import dotenv from 'dotenv';

dotenv.config();

const signToken = (id: string) => {
    const secret = (process.env.JWT_SECRET || 'secreto_por_defecto') as Secret;
    const options = {
        expiresIn: process.env.JWT_EXPIRES_IN || '30d'
    };
    // @ts-ignore
    return jwt.sign({ id }, secret, options);
};

// 1. REGISTRO
export const register = async (req: Request, res: Response) => {
  try {
    const { name, surname, alias, email, password } = req.body;

    if (!name || !surname || !alias || !email || !password) {
        return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    const emailLower = email.toLowerCase().trim();
    if (!emailLower.includes('@')) return res.status(400).json({ message: "Email inválido." });
    
    const existingUser = await User.findOne({ $or: [{ email: emailLower }, { alias }] });
    if (existingUser) return res.status(400).json({ message: "Email o Alias ya en uso" });

    const newUser = await User.create({
      name, surname, alias, email: emailLower, password, status: 'PENDING_APPROVAL'
    });

    console.log(`📧 [SISTEMA]: Usuario registrado: ${newUser.alias}. Notificando Admin...`);
    
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && adminEmail.includes('@')) {
        await sendAdminNotification(adminEmail, newUser.alias);
    }

    res.status(201).json({ message: 'Registro recibido. Espera aprobación del administrador.' });

  } catch (error) {
    res.status(500).json({ message: 'Error al registrar' });
  }
};

// 2. LOGIN
export const login = async (req: any, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email y contraseña requeridos" });

      const emailLower = email.toLowerCase().trim();
      const user = await User.findOne({ email: emailLower }).select('+password');
      
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  
      const isMatch = await bcrypt.compare(password, user.password || '');
      if (!isMatch) return res.status(400).json({ message: "Contraseña incorrecta" });
  
      if (user.status !== 'ACTIVE') {
          if (user.status === 'WAITING_CODE') {
              const newCode = Math.floor(100000 + Math.random() * 900000).toString();
              user.verificationCode = newCode;
              await user.save();
              await sendVerificationEmail(user.email, newCode);
              return res.status(403).json({ message: "Cuenta no verificada. Nuevo código enviado." });
          }
          return res.status(403).json({ message: `Acceso denegado. Estado: ${user.status}` });
      }
  
      const token = signToken(user._id.toString());
      user.password = undefined;
      
      res.json({ message: "Login correcto", token, user });
  
    } catch (error) {
      res.status(500).json({ message: "Error en login", error });
    }
};

// 3. APROBAR USUARIO
export const approveUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body; 
    const userCheck = await User.findById(userId);
    if (!userCheck) return res.status(404).json({ message: "Usuario no encontrado" });

    if (!userCheck.email || !userCheck.email.includes('@')) {
        return res.status(400).json({ message: "Email de usuario inválido." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString(); 
    const user = await User.findByIdAndUpdate(userId, {
      status: 'WAITING_CODE', verificationCode: code
    }, { new: true });

    if (user) await sendVerificationEmail(user.email, code);

    res.json({ message: `Usuario aprobado. Código enviado.` });
  } catch (error) {
    res.status(500).json({ message: 'Error aprobando usuario' });
  }
};

// 4. VERIFICAR CÓDIGO
export const verifyCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    const emailLower = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailLower, status: 'WAITING_CODE' }).select('+verificationCode');

    if (!user || user.verificationCode !== code) {
        return res.status(400).json({ message: 'Código incorrecto.' });
    }

    user.status = 'ACTIVE';
    user.verificationCode = undefined; 
    await user.save();

    if (user.email.includes('@')) {
        await sendEmail(user.email, "¡Cuenta Activada!", "<h1>Bienvenido</h1><p>Tu cuenta ha sido activada.</p>");
    }

    res.json({ message: '¡Cuenta activada!', user });
  } catch (error) {
    res.status(500).json({ message: 'Error verificando' });
  }
};

// 5. REENVIAR CÓDIGO
export const resendVerificationCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const emailLower = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailLower });
    
    if (!user || user.status !== 'WAITING_CODE') return res.status(400).json({ message: "No se puede enviar código." });

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = newCode;
    await user.save();
    await sendVerificationEmail(user.email, newCode);

    res.json({ message: "Nuevo código enviado." });
  } catch (error) {
    res.status(500).json({ message: "Error reenviando código" });
  }
};

// 6. OLVIDÉ CONTRASEÑA
export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const emailLower = email.toLowerCase().trim();
        const user = await User.findOne({ email: emailLower });
        if (!user) return res.status(404).json({ message: "Email no registrado" });

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 3600000); 
        await user.save();

        await sendResetPasswordEmail(user.email, resetToken);
        res.json({ message: "Token enviado al correo." });
    } catch (error) {
        res.status(500).json({ message: "Error en forgot password" });
    }
};

// 7. RESETEAR CONTRASEÑA (Con Token)
export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;
        const user = await User.findOne({ 
            resetPasswordToken: token, 
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) return res.status(400).json({ message: "Token inválido o expirado" });

        user.password = newPassword; // El middleware del modelo hará el hash
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();
        res.json({ message: "Contraseña actualizada." });
    } catch (error) {
        res.status(500).json({ message: "Error reseteando password" });
    }
};

// 8. PERFIL (GET)
export const getProfile = async (req: any, res: Response) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Error obteniendo perfil" });
    }
};

// 9. ACTUALIZAR AVATAR (Legacy - Mantenido por compatibilidad)
export const updateAvatar = async (req: any, res: Response) => {
    try {
        const user = await User.findByIdAndUpdate(req.user._id, { avatar: req.body.avatar }, { new: true });
        res.json({ message: "Avatar actualizado.", user });
    } catch (error) { res.status(500).json({ message: "Error" }); }
};

// ==========================================
// NUEVAS FUNCIONALIDADES PARA PERFIL
// ==========================================

// 10. ACTUALIZAR PERFIL (Nombre, Alias, Email, Avatar)
export const updateProfile = async (req: any, res: Response) => {
    try {
        const { name, surname, alias, email, avatar } = req.body;
        const userId = req.user._id;

        // Validar si el alias/email ya existe en OTRO usuario
        if (alias || email) {
             const existing = await User.findOne({
                 $and: [
                     { _id: { $ne: userId } }, // No soy yo
                     { $or: [{ alias }, { email: email?.toLowerCase() }] }
                 ]
             });
             if (existing) return res.status(400).json({ message: "Alias o Email ya ocupado por otro usuario." });
        }

        const updates: any = {};
        if (name) updates.name = name;
        if (surname) updates.surname = surname;
        if (alias) updates.alias = alias;
        if (email) updates.email = email.toLowerCase().trim();
        if (avatar) updates.avatar = avatar;

        const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true });

        res.json({ message: "Perfil actualizado correctamente.", user: updatedUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error actualizando perfil." });
    }
};

// 11. CAMBIAR CONTRASEÑA (Estando logueado)
export const changePassword = async (req: any, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        // 1. Obtener usuario con password
        const user = await User.findById(userId).select('+password');
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        // 2. Verificar contraseña actual
        const isMatch = await bcrypt.compare(currentPassword, user.password || '');
        if (!isMatch) return res.status(400).json({ message: "La contraseña actual es incorrecta." });

        // 3. Guardar nueva (El middleware 'pre save' del modelo User hará el hash automáticamente si se modifica 'password')
        user.password = newPassword;
        await user.save();

        res.json({ message: "Contraseña cambiada con éxito." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error cambiando contraseña." });
    }
};