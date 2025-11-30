import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Esquema para Registro
const registerSchema = z.object({
  name: z.string().min(2, "El nombre es muy corto"),
  surname: z.string().min(2),
  alias: z.string().min(3, "El alias debe tener al menos 3 letras"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres")
});

// Middleware de validación genérico
export const validateRegister = (req: Request, res: Response, next: NextFunction) => {
  try {
    registerSchema.parse(req.body);
    next();
  } catch (error: any) {
    // Devolvemos los errores de forma limpia
    return res.status(400).json({ 
        message: "Datos inválidos", 
        errors: error.errors.map((e: any) => e.message) 
    });
  }
};