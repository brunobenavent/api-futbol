import { Request, Response } from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { Secret } from 'jsonwebtoken';
// Importamos los servicios de email. Asegúrate de que EmailService.ts exista y exporte estas funciones.
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

    // Validación extra de formato de email
    if (!email.includes('@')) {
        return res.status(400).json({ message: "El formato del email no es válido." });
    }
    
    const existingUser = await User.findOne({ $or: [{ email }, { alias }] });
    if (existingUser) return res.status(400).json({ message: "Email o Alias ya en uso" });

    const newUser = await User.create({
      name, surname, alias, email, password, 
      status: 'PENDING_APPROVAL'
    });

    console.log(`📧 [SISTEMA]: Usuario registrado: ${newUser.alias}. Intentando notificar al Admin...`);
    
    // ENVÍO DE NOTIFICACIÓN AL ADMIN
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && adminEmail.includes('@')) {
        const emailSent = await sendAdminNotification(adminEmail, newUser.alias);
        if (emailSent) console.log("✅ Notificación enviada al Admin.");
        else console.error("❌ Falló el envío al Admin.");
    } else {
        console.warn("⚠️ No hay ADMIN_EMAIL válido en .env, no se envió notificación.");
    }

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
          // Reenvío automático si está esperando código
          if (user.status === 'WAITING_CODE') {
              // Verificamos email antes de reenviar
              if (!user.email || !user.email.includes('@')) {
                  return res.status(403).json({ message: "Tu cuenta está pendiente pero el email registrado es inválido. Contacta al soporte." });
              }

              const newCode = Math.floor(100000 + Math.random() * 900000).toString();
              user.verificationCode = newCode;
              await user.save();
              
              console.log(`📧 [SISTEMA]: Reenviando código automático a ${user.email}...`);
              await sendVerificationEmail(user.email, newCode);

              return res.status(403).json({ 
                  message: "Tu cuenta no está verificada. Te acabamos de enviar un NUEVO código a tu correo." 
              });
          }
          return res.status(403).json({ message: `Acceso denegado. Estado de cuenta: ${user.status}` });
      }
  
      const token = signToken(user._id.toString());
      user.password = undefined;
      
      res.json({ message: "Login correcto", token, user });
  
    } catch (error) {
      res.status(500).json({ message: "Error en login", error });
    }
};

// 3. APROBAR USUARIO (Admin)
export const approveUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body; 
    
    // Primero buscamos al usuario para validar su email ANTES de generar código
    const userCheck = await User.findById(userId);
    if (!userCheck) return res.status(404).json({ message: "Usuario no encontrado" });

    if (!userCheck.email || !userCheck.email.includes('@')) {
        console.error(`❌ Error Crítico: El usuario ${userCheck.alias} tiene un email inválido: ${userCheck.email}`);
        return res.status(400).json({ message: `No se puede aprobar: El email '${userCheck.email}' no es válido.` });
    }

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString(); 

    const user = await User.findByIdAndUpdate(userId, {
      status: 'WAITING_CODE',
      verificationCode: code
    }, { new: true });

    if (!user) return res.status(404).json({ message: "Usuario no encontrado tras actualización." }); // TypeScript check

    console.log(`📧 [SISTEMA]: Aprobando usuario ${user.alias}. Enviando código ${code} a ${user.email}...`); 
    
    // ENVÍO DE CÓDIGO AL USUARIO
    try {
        const emailSent = await sendVerificationEmail(user.email, code);
        if (!emailSent) {
            console.error("❌ SendGrid/Nodemailer devolvió false.");
            return res.status(500).json({ message: "Usuario actualizado a WAITING_CODE, pero falló el envío del email." });
        }
        console.log("✅ Código enviado correctamente.");
    } catch (emailErr) {
        console.error("❌ Excepción enviando email:", emailErr);
        return res.status(500).json({ message: "Error técnico enviando email." });
    }

    res.json({ message: `Usuario aprobado. Email con código enviado a ${user.email}.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error aprobando usuario' });
  }
};

// 4. VERIFICAR CÓDIGO
export const verifyCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email, status: 'WAITING_CODE' }).select('+verificationCode');

    if (!user || user.verificationCode !== code) {
        return res.status(400).json({ message: 'Código incorrecto o usuario no espera verificación.' });
    }

    user.status = 'ACTIVE';
    user.verificationCode = undefined; 
    await user.save();

    console.log(`📧 [SISTEMA]: Usuario ${user.alias} verificado. Enviando email de bienvenida...`);
    
    // ENVÍO DE EMAIL DE BIENVENIDA (Confirmación de activación)
    if (user.email && user.email.includes('@')) {
        const htmlBienvenida = `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #27ae60;">¡Cuenta Activada! 🚀</h2>
            <p>Hola <b>${user.alias}</b>,</p>
            <p>Tu código ha sido verificado correctamente. Ya tienes acceso completo a la API de Fútbol y al Juego Survivor.</p>
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login">Iniciar Sesión</a></p>
          </div>
        `;
        await sendEmail(user.email, "¡Bienvenido! Tu cuenta está activa", htmlBienvenida);
    }

    res.json({ message: '¡Cuenta activada! Ya puedes iniciar sesión.', user });
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

    if (user.status !== 'WAITING_CODE') return res.status(400).json({ message: "Cuenta no está en espera de código." });

    // Validación de email antes de reenviar
    if (!user.email || !user.email.includes('@')) {
        return res.status(400).json({ message: "Email inválido en base de datos." });
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = newCode;
    await user.save();

    console.log(`📧 [SISTEMA]: Solicitud manual. Reenviando código a ${user.email}...`); 
    
    // ENVÍO DE CÓDIGO
    const emailSent = await sendVerificationEmail(user.email, newCode);

    if (!emailSent) {
        console.error("❌ Falló el reenvío del email.");
        return res.status(500).json({ message: "Error al enviar el correo." });
    }

    res.json({ message: "Nuevo código enviado a tu correo." });

  } catch (error) {
    console.error(error);
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

        console.log(`📧 [SISTEMA]: Enviando token de recuperación a ${email}...`);
        await sendResetPasswordEmail(user.email, resetToken);

        res.json({ message: "Si el correo existe, se ha enviado un token de recuperación." });

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

// 8. PERFIL
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

// 9. ACTUALIZAR AVATAR
export const updateAvatar = async (req: any, res: Response) => {
    try {
        const userId = req.user._id;
        const { avatar } = req.body;

        if (!avatar) return res.status(400).json({ message: "Se requiere URL de avatar." });

        const user = await User.findByIdAndUpdate(userId, { avatar }, { new: true });
        res.json({ message: "Avatar actualizado.", user });
    } catch (error) {
        res.status(500).json({ message: "Error actualizando avatar" });
    }
};