import multer from 'multer';

// Configuración de almacenamiento en memoria
// Esto permite acceder a req.file.buffer en el controlador
const storage = multer.memoryStorage();

// Filtro de archivos (Opcional: solo imágenes)
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('No es una imagen! Por favor sube solo imágenes.'), false);
  }
};

export const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // Límite de 5MB
    }
});