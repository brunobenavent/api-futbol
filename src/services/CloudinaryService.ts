import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import streamifier from 'streamifier';

dotenv.config();

// Configuración inicial usando variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube una imagen a Cloudinary desde un buffer (memoria)
 * @param buffer El buffer del archivo (req.file.buffer)
 * @param folder Carpeta destino en Cloudinary (opcional)
 * @returns Promesa con la URL segura de la imagen
 */
export const uploadImageBuffer = async (buffer: Buffer, folder: string = 'avatars'): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'image',
        transformation: [
          { width: 500, height: 500, crop: 'limit' }, // Optimización básica
          { quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        if (result) return resolve(result.secure_url);
        reject(new Error('Error desconocido al subir a Cloudinary'));
      }
    );

    // Convertir el buffer en un stream y enviarlo a Cloudinary
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * Elimina una imagen de Cloudinary
 * @param publicId ID público de la imagen (se puede extraer de la URL)
 */
export const deleteImage = async (publicId: string) => {
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Error eliminando imagen de Cloudinary:", error);
    }
};