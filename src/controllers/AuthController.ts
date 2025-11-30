import { Request, Response } from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { sendVerificationEmail, sendResetPasswordEmail, sendAdminNotification } from '../services/EmailService.js';
import dotenv from 'dotenv';

// Aseguramos carga de variables de entorno
dotenv.config();

// Helper para firmar tokens
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

// 2. LOGIN (MEJORADO: Reenvío automático)
export const login = async (req: any, res: Response) => {
    try {
      const { email, password } = req.body;
  
      // Pedimos password explícitamente
      const user = await User.findOne({ email }).select('+password');
      
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  
      const isMatch = await bcrypt.compare(password, user.password || '');
      if (!isMatch) return res.status(400).json({ message: "Contraseña incorrecta" });
  
      // --- LÓGICA DE ESTADO ---
      if (user.status !== 'ACTIVE') {
          
          // CASO ESPECIAL: Si está esperando código, se lo reenviamos automáticamente
          if (user.status === 'WAITING_CODE') {
              const newCode = Math.floor(100000 + Math.random() * 900000).toString();
              user.verificationCode = newCode;
              await user.save();
              
              console.log(`📧 [SISTEMA]: Reenviando código automático a ${user.email}...`);
              await sendVerificationEmail(user.email, newCode);

              return res.status(403).json({ 
                  message: "Tu cuenta no está verificada. Te acabamos de enviar un NUEVO código a tu correo." 
              });
          }

          // Otros estados (Rechazado o Pendiente de Admin)
          return res.status(403).json({ message: `Acceso denegado. Estado de cuenta: ${user.status}` });
      }
  
      // Si está activo, generamos token
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

// 4. VERIFICAR CÓDIGO (Activa cuenta con 0 tokens)
export const verifyCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email, status: 'WAITING_CODE' }).select('+verificationCode');

    if (!user || user.verificationCode !== code) {
        return res.status(400).json({ message: 'Código incorrecto' });
    }

    user.status = 'ACTIVE';
    user.verificationCode = undefined; 
    // user.tokens = 100; <--- ELIMINADO: Empiezan con 0 (o lo que tenga por defecto el modelo)
    
    await user.save();

    res.json({ message: '¡Cuenta activada! Tienes 0 tokens. Contacta al admin para recargar.', user });
  } catch (error) {
    res.status(500).json({ message: 'Error verificando' });
  }
};

// 5. REENVIAR CÓDIGO (Manual)
export const resendVerificationCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Falta el email" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    if (user.status !== 'WAITING_CODE') return res.status(400).json({ message: "No se puede enviar código (Cuenta activa o pendiente)." });

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = newCode;
    await user.save();

    console.log(`📧 [SISTEMA]: Reenviando código a ${user.email}...`); 
    await sendVerificationEmail(user.email, newCode);

    res.json({ message: "Nuevo código enviado." });

  } catch (error) {
    res.status(500).json({ message: "Error al reenviar código" });
  }
};

// 6. OLVIDÉ CONTRASEÑA
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

// 7. RESETEAR CONTRASEÑA
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

// 8. PERFIL (PROTEGIDO)
export const getProfile = async (req: any, res: Response) => {
    try {
        const { id } = req.params;
        const requester = req.user;

        if (!requester) return res.status(401).json({ message: "No autorizado." });

        if (requester.role !== 'ADMIN' && requester._id.toString() !== id) {
            return res.status(403).json({ message: "No tienes permiso para ver este perfil." });
        }

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Error obteniendo perfil" });
    }
};
// ... (imports y otras funciones)

// 9. ACTUALIZAR AVATAR
export const updateAvatar = async (req: any, res: Response) => {
    try {
        // El usuario viene del middleware 'protect'
        const userId = req.user._id;
        const { avatar } = req.body;

        if (!avatar) {
            return res.status(400).json({ message: "Se requiere una URL de avatar." });
        }

        // Actualizamos solo el campo avatar
        const user = await User.findByIdAndUpdate(
            userId, 
            { avatar: avatar },
            { new: true } // Devolver el usuario actualizado
        );

        res.json({ 
            message: "Avatar actualizado correctamente.", 
            user 
        });

    } catch (error) {
        res.status(500).json({ message: "Error actualizando avatar" });
    }
};