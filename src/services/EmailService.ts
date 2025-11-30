import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Carga las variables ANTES de nada
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: true, 
  auth: {
    user: process.env.EMAIL_USER, // brunobenavent.mexico@gmail.com
    pass: process.env.EMAIL_PASS, // La clave de app
  },
});

// Verificar conexión al arrancar
transporter.verify().then(() => {
    console.log(`✅ EmailService conectado como: ${process.env.EMAIL_USER}`);
}).catch(console.error);

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM, // API Fútbol <brunobenavent.mexico@gmail.com>
      to,
      subject,
      html
    });
    console.log(`📧 Enviado OK -> ${to} | ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("❌ Error enviando email:", error);
    return false;
  }
};

export const sendVerificationEmail = async (to: string, code: string) => {
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #2c3e50;">¡Bienvenido al Juego! ⚽️</h2>
        <p>Tu cuenta ha sido aprobada por el administrador.</p>
        <p>Tu código de activación es:</p>
        <h1 style="color: #e74c3c; letter-spacing: 5px; text-align: center; background: #f9f9f9; padding: 10px;">${code}</h1>
      </div>
    `;
    return sendEmail(to, "Verifica tu cuenta - API Fútbol", html);
};

export const sendResetPasswordEmail = async (to: string, token: string) => {
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #2c3e50;">Recuperación de Contraseña 🔐</h2>
        <p>Copia este token para crear una nueva contraseña:</p>
        <div style="background: #f4f4f4; padding: 15px; text-align: center; font-weight: bold;">${token}</div>
      </div>
    `;
    return sendEmail(to, "Recuperar Contraseña", html);
};

export const sendAdminNotification = async (adminEmail: string, newUserAlias: string) => {
    const html = `
      <h3>🔔 Nuevo Usuario Pendiente</h3>
      <p>El usuario <b>${newUserAlias}</b> se ha registrado.</p>
      <p>Por favor, entra al panel y apruébalo.</p>
    `;
    return sendEmail(adminEmail, "Nuevo Registro Pendiente", html);
};