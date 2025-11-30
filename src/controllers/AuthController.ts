import { Request, Response } from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { sendVerificationEmail, sendResetPasswordEmail, sendAdminNotification } from '../services/EmailService.js';

// Helper para firmar tokens (CORREGIDO FINALMENTE)
const signToken = (id: string) => {
    // Forzamos a string para evitar dudas de TS
    const secret = (process.env.JWT_SECRET || 'secreto_por_defecto') as jwt.Secret;
    
    // Creamos el objeto de opciones y lo forzamos a 'any' para evitar conflictos de sobrecarga
    const options = {
        expiresIn: process.env.JWT_EXPIRES_IN || '30d'
    };

    // @ts-ignore: Ignoramos errores de sobrecarga específicos de jwt
    return jwt.sign({ id }, secret, options);
};

// 1. REGISTRO (Crea usuario PENDING_APPROVAL)
export const register = async (req: Request, res: Response) => {
  try {
    const { name, surname, alias, email, password } = req.body;

    if (!name || !surname || !alias || !email || !password) {
        return res.status(400).json({ message: "Faltan datos obligatorios" });
    }
    
    const existingUser = await User.findOne({ $or: [{ email }, { alias }] });
    if (existingUser) return res.status(400).json({ message: "Email o Alias ya en uso" });

    const newUser = await User.create({
      name, surname, alias, email, password, 
      status: 'PENDING_APPROVAL'
    });

    console.log(`📧 [SISTEMA]: Enviando notificación al Admin...`);
    
    const adminEmail = process.env.ADMIN_EMAIL || "admin@localhost.com";
    await sendAdminNotification(adminEmail, newUser.alias);

    res.status(201).json({ message: 'Registro recibido. Se ha notificado al administrador.' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al registrar' });
  }
};

// 2. LOGIN
export const login = async (req: any, res: Response) => {
    try {
      const { email, password } = req.body;
  
      const user = await User.findOne({ email }).select('+password');
      
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  
      const isMatch = await bcrypt.compare(password, user.password || '');
      if (!isMatch) return res.status(400).json({ message: "Contraseña incorrecta" });
  
      if (user.status !== 'ACTIVE') {
          return res.status(403).json({ message: `Tu cuenta no está activa. Estado: ${user.status}` });
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
    const code = Math.floor(100000 + Math.random() * 900000).toString(); 

    const user = await User.findByIdAndUpdate(userId, {
      status: 'WAITING_CODE',
      verificationCode: code
    }, { new: true });

    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    console.log(`📧 [SISTEMA]: Enviando código a ${user.email}...`); 
    await sendVerificationEmail(user.email, code);

    res.json({ message: `Usuario aprobado. Email enviado a ${user.email}.` });
  } catch (error) {
    res.status(500).json({ message: 'Error aprobando usuario' });
  }
};

// 4. VERIFICAR CÓDIGO
export const verifyCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email, status: 'WAITING_CODE' }).select('+verificationCode');

    if (!user || user.verificationCode !== code) {
        return res.status(400).json({ message: 'Código incorrecto' });
    }

    user.status = 'ACTIVE';
    user.verificationCode = undefined; 
    user.tokens = 100; 
    await user.save();

    res.json({ message: '¡Cuenta activada! Ya puedes jugar.', user });
  } catch (error) {
    res.status(500).json({ message: 'Error verificando' });
  }
};

// 5. OLVIDÉ CONTRASEÑA
export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "Email no registrado" });

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 3600000); 
        await user.save();

        console.log(`📧 [SISTEMA]: Enviando token a ${email}...`);
        await sendResetPasswordEmail(user.email, resetToken);

        res.json({ message: "Email de recuperación enviado." });

    } catch (error) {
        res.status(500).json({ message: "Error en forgot password" });
    }
};

// 6. RESETEAR CONTRASEÑA
export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        const user = await User.findOne({ 
            resetPasswordToken: token, 
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) return res.status(400).json({ message: "Token inválido o expirado" });

        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();

        res.json({ message: "Contraseña actualizada correctamente." });

    } catch (error) {
        res.status(500).json({ message: "Error reseteando password" });
    }
};

// 7. PERFIL
export const getProfile = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Error obteniendo perfil" });
    }
};