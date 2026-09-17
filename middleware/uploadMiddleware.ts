import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import cloudinary from '../config/cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary storage for multer (avatars)
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary as any,
  params: {
    folder: 'pitchmint/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto' }
    ],
    public_id: (req: Request) => {
      return `avatar_${req.user?._id}_${Date.now()}`;
    }
  } as any
});

// Configure memory storage for audio files (temporary)
const audioStorage = multer.memoryStorage();

// File filter for images
const imageFileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, JPG, PNG, GIF) are allowed'));
  }
};

// File filter for audio files
const audioFileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const allowedTypes = /wav|mp3|m4a|webm|ogg/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.includes('audio');

  if (mimetype || extname) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed'));
  }
};

// Configure multer with Cloudinary storage for images
export const upload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: imageFileFilter
});

// Configure multer for audio files (memory storage)
export const audioUpload = multer({
  storage: audioStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for audio
  },
  fileFilter: audioFileFilter
});

export default { upload, audioUpload };
