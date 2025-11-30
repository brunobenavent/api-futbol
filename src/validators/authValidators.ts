import { body, validationResult } from 'express-validator';
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// --- 1. VALIDACIÓN CON EXPRESS-VALIDATOR (Para Registro) ---

// Middleware para procesar los errores de express-validator
const handleExpressValidation = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            message: "Error de validación", 
            errors: errors.array().map(e => e.msg) 
        });
    }
    next();
};

export const validateRegister = [
    // Nombre y Apellido
    body('name')
        .trim().notEmpty().withMessage('El nombre es obligatorio')
        .isLength({ min: 2 }).withMessage('El nombre debe tener al menos 2 letras'),
    body('surname')
        .trim().notEmpty().withMessage('El apellido es obligatorio'),

    // Alias
    body('alias')
        .trim().notEmpty().withMessage('El alias es obligatorio')
        .isLength({ min: 3 }).withMessage('El alias debe tener al menos 3 caracteres'),

    // Email
    body('email')
        .isEmail().withMessage('El email no es válido')
        .normalizeEmail(),

    // Contraseña Fuerte
    body('password')
        .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
        .matches(/[A-Z]/).withMessage('Debe tener una mayúscula')
        .matches(/[0-9]/).withMessage('Debe tener un número'),

    // Ejecutar
    handleExpressValidation
];


// --- 2. VALIDACIÓN CON ZOD (Para lo demás) ---

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria")
});

const emailSchema = z.object({
  email: z.string().email("Email inválido")
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "El token es obligatorio"),
  newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres")
});

// Middleware genérico para Zod
const validateZod = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error: any) {
    return res.status(400).json({ 
        message: "Datos inválidos", 
        errors: error.errors.map((e: any) => e.message) 
    });
  }
};

export const validateLogin = validateZod(loginSchema);
export const validateEmail = validateZod(emailSchema);
export const validateResetPassword = validateZod(resetPasswordSchema);