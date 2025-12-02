import { Router } from 'express';
import { 
    register, login, approveUser, verifyCode, resendVerificationCode, 
    forgotPassword, resetPassword, getProfile, updateAvatar,
    updateProfile, changePassword, uploadUserAvatar // <--- Importamos el nuevo controlador
} from '../controllers/AuthController.js';
import { protect } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js'; // <--- Importamos Multer
import { 
    validateRegister, 
    validateLogin, 
    validateEmail, 
    validateResetPassword 
} from '../validators/authValidators.js';

const router = Router();

// --- PÚBLICAS ---
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/verify', verifyCode);
router.post('/resend-code', validateEmail, resendVerificationCode);
router.post('/forgot-password', validateEmail, forgotPassword);
router.post('/reset-password', validateResetPassword, resetPassword);

// --- PROTEGIDAS (Requieren Token) ---
router.get('/profile/:id', protect, getProfile);

// Rutas de Perfil
router.put('/update', protect, updateProfile); 
router.post('/change-password', protect, changePassword); 

// --- SUBIDA DE AVATAR (NUEVO) ---
// 'avatar' es el nombre del campo que debe usar el frontend en el FormData
router.post('/avatar/upload', protect, upload.single('avatar'), uploadUserAvatar);

// Mantener por compatibilidad si se usa URL directa en lugar de archivo
router.put('/avatar', protect, updateAvatar);

// --- ADMIN ---
router.post('/approve', approveUser); 

export default router;