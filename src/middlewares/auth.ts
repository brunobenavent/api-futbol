import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Extendemos la interfaz Request para que TS sepa que le vamos a pegar un 'user'
export interface AuthRequest extends Request {
  user?: any;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token;

  // 1. Buscamos el token en la cabecera Authorization: Bearer <token>
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'No estás autorizado. Por favor, inicia sesión.' });
  }

  try {
    // 2. Verificamos el token
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secreto_por_defecto');

    // 3. Buscamos si el usuario sigue existiendo
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({ message: 'El usuario de este token ya no existe.' });
    }

    // 4. Guardamos el usuario en la request para usarlo en el controlador
    req.user = currentUser;
    next();

  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
};

// Middleware extra para restringir por roles (ej: Solo Admins)
export const restrictTo = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
        }
        next();
    };
};