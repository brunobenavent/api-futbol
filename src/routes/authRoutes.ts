import { Router } from 'express';

import { 
    register, login, approveUser, verifyCode, resendVerificationCode, 
    forgotPassword, resetPassword, getProfile, updateAvatar 
} from '../controllers/AuthController.js';
import { protect } from '../middlewares/auth.js';
// Importamos los validadores nuevos
import { 
    validateRegister, 
    validateLogin, 
    validateEmail, 
    validateResetPassword 
} from '../validators/authValidators.js';

const router = Router();

// Auth Básica (CON VALIDACIÓN)
router.post('/register', validateRegister, register); // Ahora usa express-validator
router.post('/login', validateLogin, login);         // Sigue usando Zod

// Flujo de Aprobación
router.post('/approve', approveUser); // Esto es interno del admin, quizás no necesita validación externa estricta
router.post('/verify', verifyCode); // Podrías validar que 'code' sea string

// Reenvío y Recuperación (Usan validateEmail)
router.post('/resend-code', validateEmail, resendVerificationCode);
router.post('/forgot-password', validateEmail, forgotPassword);

// Reset Password
router.post('/reset-password', validateResetPassword, resetPassword);

// Rutas Protegidas
router.get('/profile/:id', protect, getProfile);
router.put('/avatar', protect, updateAvatar);

export default router;