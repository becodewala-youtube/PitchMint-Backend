const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary storage for multer (avatars)
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pitchmint/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto' }
    ],
    public_id: (req, file) => {
      return `avatar_${req.user._id}_${Date.now()}`;
    }
  },
});

// Configure memory storage for audio files (temporary)
const audioStorage = multer.memoryStorage();

// File filter for images
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, JPG, PNG, GIF) are allowed'));
  }
};

// File filter for audio files
const audioFileFilter = (req, file, cb) => {
  const allowedTypes = /wav|mp3|m4a|webm|ogg/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.includes('audio');

  if (mimetype || extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed'));
  }
};

// Configure multer with Cloudinary storage for images
const upload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: imageFileFilter
});

// Configure multer for audio files (memory storage)
const audioUpload = multer({
  storage: audioStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for audio
  },
  fileFilter: audioFileFilter
});

module.exports = { upload, audioUpload };