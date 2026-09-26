import { upload, audioUpload } from '../../upload.middleware';
import { Request } from 'express';

describe('Upload Middleware Unit Tests', () => {
  describe('image file filter', () => {
    const filter = (upload as any).fileFilter;

    test('should accept valid jpeg file', (done) => {
      const mockFile: any = {
        originalname: 'avatar.jpg',
        mimetype: 'image/jpeg'
      };

      filter({} as Request, mockFile, (err: any, acceptFile: boolean | undefined) => {
        expect(err).toBeNull();
        expect(acceptFile).toBe(true);
        done();
      });
    });

    test('should accept valid png file', (done) => {
      const mockFile: any = {
        originalname: 'photo.png',
        mimetype: 'image/png'
      };

      filter({} as Request, mockFile, (err: any, acceptFile: boolean | undefined) => {
        expect(err).toBeNull();
        expect(acceptFile).toBe(true);
        done();
      });
    });

    test('should reject invalid file types such as pdf', (done) => {
      const mockFile: any = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf'
      };

      filter({} as Request, mockFile, (err: any, acceptFile: boolean | undefined) => {
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toMatch(/Only image files/);
        expect(acceptFile).toBeFalsy();
        done();
      });
    });
  });

  describe('audio file filter', () => {
    const filter = (audioUpload as any).fileFilter;

    test('should accept valid mp3 file', (done) => {
      const mockFile: any = {
        originalname: 'pitch.mp3',
        mimetype: 'audio/mpeg'
      };

      filter({} as Request, mockFile, (err: any, acceptFile: boolean | undefined) => {
        expect(err).toBeNull();
        expect(acceptFile).toBe(true);
        done();
      });
    });

    test('should accept valid wav file', (done) => {
      const mockFile: any = {
        originalname: 'recording.wav',
        mimetype: 'audio/wav'
      };

      filter({} as Request, mockFile, (err: any, acceptFile: boolean | undefined) => {
        expect(err).toBeNull();
        expect(acceptFile).toBe(true);
        done();
      });
    });

    test('should reject non-audio files such as text files', (done) => {
      const mockFile: any = {
        originalname: 'notes.txt',
        mimetype: 'text/plain'
      };

      filter({} as Request, mockFile, (err: any, acceptFile: boolean | undefined) => {
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toMatch(/Only audio files are allowed/);
        expect(acceptFile).toBeFalsy();
        done();
      });
    });
  });
});
