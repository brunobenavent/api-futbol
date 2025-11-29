import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export interface AuthRequest extends Request { user?: any; }

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ message: 'No autorizado.' });

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) return res.status(401).json({ message: 'Usuario no existe.' });
    req.user = currentUser;
    next();
  } catch (error) { return res.status(401).json({ message: 'Token inválido.' }); }
};