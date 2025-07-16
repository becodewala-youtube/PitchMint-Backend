const nodemailer = require('nodemailer');

// Create transporter - Fix: use createTransport instead of createTransporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Send email verification
const sendEmailVerification = async (email, name, token) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Verify Your Email - Pitchmint',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Welcome to Pitchmint!</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333;">Hi ${name},</h2>
          <p style="color: #666; line-height: 1.6;">
            Thank you for signing up for Pitchmint! To complete your registration, please verify your email address using the code below:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #667eea; color: white; padding: 15px 30px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 3px; display: inline-block;">
              ${token}
            </div>
          </div>
          <p style="color: #666; line-height: 1.6;">
            This code will expire in 10 minutes. If you didn't create an account with , please ignore this email.
          </p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #999; font-size: 12px;">
              Best regards,<br>
              The Pitchmint Team
            </p>
          </div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Send password reset email
const sendPasswordReset = async (email, name, token) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Reset Your Password - Pitchmint',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Password Reset</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333;">Hi ${name},</h2>
          <p style="color: #666; line-height: 1.6;">
            We received a request to reset your password. Use the code below to reset your password:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #dc3545; color: white; padding: 15px 30px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 3px; display: inline-block;">
              ${token}
            </div>
          </div>
          <p style="color: #666; line-height: 1.6;">
            This code will expire in 10 minutes. If you didn't request a password reset, please ignore this email.
          </p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #999; font-size: 12px;">
              Best regards,<br>
              The Pitchmint Team
            </p>
          </div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Send welcome email
const sendWelcomeEmail = async (email, name) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Welcome to Pitchmint!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Welcome to Pitchmint!</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333;">Hi ${name},</h2>
          <p style="color: #666; line-height: 1.6;">
            Your email has been successfully verified! You're now ready to start validating your startup ideas with AI-powered insights.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard" style="background: #667eea; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Get Started
            </a>
          </div>
          <p style="color: #666; line-height: 1.6;">
            You start with 3 free credits each month. Use them to validate ideas, generate pitch decks, and more!
          </p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #999; font-size: 12px;">
              Best regards,<br>
              The Pitchmint Team
            </p>
          </div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendEmailVerification,
  sendPasswordReset,
  sendWelcomeEmail
};
