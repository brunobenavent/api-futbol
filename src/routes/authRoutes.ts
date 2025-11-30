import { Router } from 'express';
import { register, login, approveUser, verifyCode, forgotPassword, resetPassword, getProfile } from '../controllers/AuthController.js';
import { validateRegister } from '../validators/authValidator.js';
const router = Router();
router.post('/register', register);
router.post('/login', login);
router.post('/approve', approveUser);
router.post('/verify', verifyCode);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/profile/:id', getProfile);

router.post('/register', validateRegister, register); // <--- Se ejecuta antes del controlador
export default router;