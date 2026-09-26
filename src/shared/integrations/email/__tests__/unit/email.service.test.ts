const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-123' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: (...args: any[]) => mockSendMail(...args)
  })
}));

import {
  sendEmailVerification,
  sendPasswordReset,
  sendWelcomeEmail
} from '../../email.service';

describe('Email Service Unit Tests', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  test('sendEmailVerification sends verification email with token', async () => {
    await sendEmailVerification('alice@example.com', 'Alice', '123456');

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'alice@example.com',
      subject: expect.stringContaining('Verify Your Email'),
      html: expect.stringContaining('123456')
    }));
  });

  test('sendPasswordReset sends password reset email with token', async () => {
    await sendPasswordReset('bob@example.com', 'Bob', 'reset-token-xyz');

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'bob@example.com',
      subject: expect.stringContaining('Reset Your Password'),
      html: expect.stringContaining('reset-token-xyz')
    }));
  });

  test('sendWelcomeEmail sends welcome email with user name', async () => {
    await sendWelcomeEmail('charlie@example.com', 'Charlie');

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'charlie@example.com',
      subject: expect.stringContaining('Welcome to Pitchmint!'),
      html: expect.stringContaining('Charlie')
    }));
  });
});
