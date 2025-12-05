import nodemailer from 'nodemailer';
import { config } from './env';

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

export const emailService = {
  async sendEmail(to: string, subject: string, html: string, text?: string) {
    try {
      const info = await transporter.sendMail({
        from: `"Parcsal" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@parcsal.com'}>`,
        to,
        subject,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML if no text provided
        html,
      });

      console.log('Email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  },

  async sendVerificationEmail(email: string, token: string, name: string) {
    const verificationUrl = `${config.frontendUrl}/auth/verify-email?token=${token}`;
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Verify Your Email - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Welcome to Parcsal!</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${name},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">Thank you for registering with Parcsal! We're excited to have you on board. To complete your registration and start using our platform, please verify your email address.</p>
                    
                    <!-- CTA Button -->
                    <table role="presentation" style="width: 100%; margin: 32px 0;">
                      <tr>
                        <td align="center" style="padding: 0;">
                          <a href="${verificationUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3); transition: background-color 0.3s;">Verify Email Address</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 24px 0 16px 0; color: #666666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
                    <p style="margin: 0 0 24px 0; padding: 12px; background-color: #FFF5F0; border-left: 3px solid #FF6B35; word-break: break-all; color: #666666; font-size: 13px; font-family: 'Courier New', monospace;">${verificationUrl}</p>
                    
                    <p style="margin: 0 0 8px 0; color: #666666; font-size: 14px;">⏰ This verification link will expire in <strong>24 hours</strong>.</p>
                    <p style="margin: 0; color: #999999; font-size: 14px;">If you didn't create an account with Parcsal, please ignore this email.</p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F8F8; padding: 24px 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                    <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} Parcsal. All rights reserved.</p>
                    <p style="margin: 0; color: #999999; font-size: 12px;">You're receiving this email because you signed up for a Parcsal account.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return this.sendEmail(
      email,
      'Verify Your Email - Parcsal',
      html
    );
  },

  async sendPasswordResetEmail(email: string, token: string, name: string) {
    const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${token}`;
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Reset Your Password - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Reset Your Password</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${name},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">We received a request to reset your password for your Parcsal account. Click the button below to create a new password.</p>
                    
                    <!-- CTA Button -->
                    <table role="presentation" style="width: 100%; margin: 32px 0;">
                      <tr>
                        <td align="center" style="padding: 0;">
                          <a href="${resetUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3); transition: background-color 0.3s;">Reset Password</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 24px 0 16px 0; color: #666666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
                    <p style="margin: 0 0 24px 0; padding: 12px; background-color: #FFF5F0; border-left: 3px solid #FF6B35; word-break: break-all; color: #666666; font-size: 13px; font-family: 'Courier New', monospace;">${resetUrl}</p>
                    
                    <div style="background-color: #FFF9E6; border-left: 3px solid #FFB84D; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #856404; font-size: 14px; font-weight: 600;">⚠️ Important Security Notice</p>
                      <p style="margin: 0 0 8px 0; color: #856404; font-size: 14px;">⏰ This password reset link will expire in <strong>1 hour</strong>.</p>
                      <p style="margin: 0; color: #856404; font-size: 14px;">If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
                    </div>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F8F8; padding: 24px 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                    <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} Parcsal. All rights reserved.</p>
                    <p style="margin: 0; color: #999999; font-size: 12px;">For security reasons, this link can only be used once.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return this.sendEmail(
      email,
      'Reset Your Password - Parcsal',
      html
    );
  },

  async sendContactFormNotification(name: string, email: string, subject: string, message: string) {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>New Contact Form Submission - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">New Contact Form Submission</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background-color: #FFF5F0; border-left: 4px solid #FF6B35; padding: 20px; margin-bottom: 24px; border-radius: 4px;">
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 80px;">From:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${name}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 80px;">Email:</strong>
                            <a href="mailto:${email}" style="color: #FF6B35; font-size: 14px; text-decoration: none;">${email}</a>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 80px;">Subject:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${subject}</span>
                          </td>
                        </tr>
                      </table>
                    </div>
                    
                    <div style="margin-top: 24px;">
                      <h2 style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 18px; font-weight: 600;">Message:</h2>
                      <div style="background-color: #F8F8F8; padding: 20px; border-radius: 8px; border: 1px solid #EEEEEE;">
                        <p style="margin: 0; color: #4A4A4A; font-size: 15px; white-space: pre-wrap; line-height: 1.8;">${message}</p>
                      </div>
                    </div>
                    
                    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #EEEEEE;">
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td align="center" style="padding: 0;">
                            <a href="mailto:${email}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);">Reply to ${name}</a>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F8F8; padding: 24px 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                    <p style="margin: 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} Parcsal. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || '';
    if (!adminEmail) {
      console.warn('No admin email configured for contact form notifications');
      return { success: false, error: 'Admin email not configured' };
    }

    return this.sendEmail(
      adminEmail,
      `Contact Form: ${subject}`,
      html
    );
  },

  async sendTeamInvitationEmail(
    email: string,
    _token: string,
    companyName: string,
    role: string,
    invitationUrl: string
  ) {
    const roleDisplay = role === 'COMPANY_ADMIN' ? 'Company Admin' : 'Company Staff';
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Team Invitation - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">You're Invited!</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello,</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">You have been invited to join <strong>${companyName}</strong> as a <strong>${roleDisplay}</strong> on Parcsal.</p>
                    
                    <div style="background-color: #FFF5F0; border-left: 4px solid #FF6B35; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #1A1A1A; font-size: 14px; font-weight: 600;">What you'll be able to do:</p>
                      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #4A4A4A; font-size: 14px;">
                        <li>Manage shipments and bookings</li>
                        <li>View company analytics and reports</li>
                        ${role === 'COMPANY_ADMIN' ? '<li>Manage team members and company settings</li>' : ''}
                      </ul>
                    </div>
                    
                    <!-- CTA Button -->
                    <table role="presentation" style="width: 100%; margin: 32px 0;">
                      <tr>
                        <td align="center" style="padding: 0;">
                          <a href="${invitationUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3); transition: background-color 0.3s;">Accept Invitation</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 24px 0 16px 0; color: #666666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
                    <p style="margin: 0 0 24px 0; padding: 12px; background-color: #FFF5F0; border-left: 3px solid #FF6B35; word-break: break-all; color: #666666; font-size: 13px; font-family: 'Courier New', monospace;">${invitationUrl}</p>
                    
                    <p style="margin: 0 0 8px 0; color: #666666; font-size: 14px;">⏰ This invitation will expire in <strong>7 days</strong>.</p>
                    <p style="margin: 0; color: #999999; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F8F8; padding: 24px 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                    <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} Parcsal. All rights reserved.</p>
                    <p style="margin: 0; color: #999999; font-size: 12px;">You're receiving this email because you were invited to join a team on Parcsal.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return this.sendEmail(
      email,
      `You're Invited to Join ${companyName} on Parcsal`,
      html
    );
  },

  async sendPaymentReceiptEmail(
    email: string,
    customerName: string,
    bookingId: string,
    amount: number,
    currency: string,
    paymentIntentId: string,
    bookingDetails: {
      originCity: string;
      originCountry: string;
      destinationCity: string;
      destinationCountry: string;
      departureTime: Date;
      arrivalTime: Date;
      mode: string;
    },
    companyName: string
  ) {
    const formattedAmount = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);

    const formattedDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    const departureDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(bookingDetails.departureTime));

    const arrivalDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(bookingDetails.arrivalTime));

    const bookingUrl = `${config.frontendUrl}/bookings/${bookingId}`;

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Payment Receipt - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Payment Receipt</h1>
                    <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Thank you for your payment!</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${customerName},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">Your payment has been successfully processed. Below are the details of your transaction:</p>
                    
                    <!-- Payment Details -->
                    <div style="background-color: #F8F8F8; border-radius: 8px; padding: 24px; margin: 24px 0; border: 1px solid #EEEEEE;">
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 140px;">Payment Amount:</strong>
                            <span style="color: #4A4A4A; font-size: 16px; font-weight: 600;">${formattedAmount}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 140px;">Payment Date:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${formattedDate}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 140px;">Transaction ID:</strong>
                            <span style="color: #4A4A4A; font-size: 13px; font-family: 'Courier New', monospace;">${paymentIntentId}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 140px;">Booking ID:</strong>
                            <span style="color: #4A4A4A; font-size: 13px; font-family: 'Courier New', monospace;">${bookingId}</span>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- Booking Details -->
                    <div style="background-color: #FFF5F0; border-left: 4px solid #FF6B35; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h2 style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 18px; font-weight: 600;">Booking Details</h2>
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Route:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${bookingDetails.originCity}, ${bookingDetails.originCountry} → ${bookingDetails.destinationCity}, ${bookingDetails.destinationCountry}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Mode:</strong>
                            <span style="color: #4A4A4A; font-size: 14px; text-transform: capitalize;">${bookingDetails.mode}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Departure:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${departureDate}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Arrival:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${arrivalDate}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Company:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${companyName}</span>
                          </td>
                        </tr>
                      </table>
                    </div>
                    
                    <!-- CTA Button -->
                    <table role="presentation" style="width: 100%; margin: 32px 0;">
                      <tr>
                        <td align="center" style="padding: 0;">
                          <a href="${bookingUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);">View Booking Details</a>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="background-color: #E8F5E9; border-left: 3px solid #4CAF50; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #2E7D32; font-size: 14px; font-weight: 600;">✓ Payment Confirmed</p>
                      <p style="margin: 0; color: #2E7D32; font-size: 14px;">Your payment has been successfully processed. This email serves as your receipt.</p>
                    </div>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F8F8; padding: 24px 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                    <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} Parcsal. All rights reserved.</p>
                    <p style="margin: 0; color: #999999; font-size: 12px;">This is an automated receipt. Please save this email for your records.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return this.sendEmail(
      email,
      `Payment Receipt - ${formattedAmount} - Parcsal`,
      html
    );
  },

  async sendBookingConfirmationEmail(
    email: string,
    customerName: string,
    bookingId: string,
    bookingDetails: {
      originCity: string;
      originCountry: string;
      destinationCity: string;
      destinationCountry: string;
      departureTime: Date;
      arrivalTime: Date;
      mode: string;
      price: number;
      currency: string;
    },
    companyName: string,
    companyContactEmail?: string,
    companyContactPhone?: string
  ) {
    const formattedPrice = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: bookingDetails.currency.toUpperCase(),
    }).format(bookingDetails.price);

    const departureDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(bookingDetails.departureTime));

    const arrivalDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(bookingDetails.arrivalTime));

    const bookingUrl = `${config.frontendUrl}/bookings/${bookingId}`;

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Booking Confirmed - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Booking Confirmed!</h1>
                    <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Your shipment booking has been accepted</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${customerName},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">Great news! Your booking has been confirmed by <strong>${companyName}</strong>. Your shipment is scheduled and ready to go!</p>
                    
                    <!-- Booking Details -->
                    <div style="background-color: #F8F8F8; border-radius: 8px; padding: 24px; margin: 24px 0; border: 1px solid #EEEEEE;">
                      <h2 style="margin: 0 0 20px 0; color: #1A1A1A; font-size: 18px; font-weight: 600;">Booking Information</h2>
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Booking ID:</strong>
                            <span style="color: #4A4A4A; font-size: 13px; font-family: 'Courier New', monospace;">${bookingId}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Route:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${bookingDetails.originCity}, ${bookingDetails.originCountry} → ${bookingDetails.destinationCity}, ${bookingDetails.destinationCountry}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Mode:</strong>
                            <span style="color: #4A4A4A; font-size: 14px; text-transform: capitalize;">${bookingDetails.mode}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Departure:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${departureDate}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Arrival:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${arrivalDate}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Total Price:</strong>
                            <span style="color: #4A4A4A; font-size: 16px; font-weight: 600;">${formattedPrice}</span>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- Company Contact -->
                    ${companyContactEmail || companyContactPhone ? `
                    <div style="background-color: #E3F2FD; border-left: 4px solid #2196F3; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h3 style="margin: 0 0 12px 0; color: #1A1A1A; font-size: 16px; font-weight: 600;">Need Help?</h3>
                      <p style="margin: 0 0 12px 0; color: #4A4A4A; font-size: 14px;">Contact ${companyName} directly:</p>
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        ${companyContactEmail ? `
                        <tr>
                          <td style="padding: 4px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px;">Email:</strong>
                            <a href="mailto:${companyContactEmail}" style="color: #2196F3; font-size: 14px; text-decoration: none; margin-left: 8px;">${companyContactEmail}</a>
                          </td>
                        </tr>
                        ` : ''}
                        ${companyContactPhone ? `
                        <tr>
                          <td style="padding: 4px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px;">Phone:</strong>
                            <a href="tel:${companyContactPhone}" style="color: #2196F3; font-size: 14px; text-decoration: none; margin-left: 8px;">${companyContactPhone}</a>
                          </td>
                        </tr>
                        ` : ''}
                      </table>
                    </div>
                    ` : ''}
                    
                    <!-- CTA Button -->
                    <table role="presentation" style="width: 100%; margin: 32px 0;">
                      <tr>
                        <td align="center" style="padding: 0;">
                          <a href="${bookingUrl}" style="display: inline-block; background-color: #4CAF50; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">View Booking Details</a>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="background-color: #E8F5E9; border-left: 3px solid #4CAF50; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #2E7D32; font-size: 14px; font-weight: 600;">✓ Booking Confirmed</p>
                      <p style="margin: 0; color: #2E7D32; font-size: 14px;">Your booking has been accepted. Please ensure your items are ready for pickup at the scheduled departure time.</p>
                    </div>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F8F8; padding: 24px 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                    <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} Parcsal. All rights reserved.</p>
                    <p style="margin: 0; color: #999999; font-size: 12px;">You're receiving this email because you have a booking on Parcsal.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return this.sendEmail(
      email,
      `Booking Confirmed - ${bookingDetails.originCity} to ${bookingDetails.destinationCity} - Parcsal`,
      html
    );
  },

  async sendBookingRejectionEmail(
    email: string,
    customerName: string,
    bookingId: string,
    bookingDetails: {
      originCity: string;
      originCountry: string;
      destinationCity: string;
      destinationCountry: string;
      departureTime: Date;
      arrivalTime: Date;
      mode: string;
      price: number;
      currency: string;
    },
    companyName: string,
    reason?: string,
    refunded?: boolean
  ) {
    const formattedPrice = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: bookingDetails.currency.toUpperCase(),
    }).format(bookingDetails.price);

    const departureDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(bookingDetails.departureTime));

    const arrivalDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(bookingDetails.arrivalTime));

    const bookingUrl = `${config.frontendUrl}/bookings/${bookingId}`;

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Booking Rejected - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #F44336 0%, #E57373 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Booking Rejected</h1>
                    <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Your booking request was not accepted</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${customerName},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">We regret to inform you that your booking request has been rejected by <strong>${companyName}</strong>.</p>
                    
                    ${reason ? `
                    <div style="background-color: #FFEBEE; border-left: 4px solid #F44336; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h3 style="margin: 0 0 12px 0; color: #1A1A1A; font-size: 16px; font-weight: 600;">Reason for Rejection:</h3>
                      <p style="margin: 0; color: #4A4A4A; font-size: 14px; white-space: pre-wrap;">${reason}</p>
                    </div>
                    ` : ''}
                    
                    <!-- Booking Details -->
                    <div style="background-color: #F8F8F8; border-radius: 8px; padding: 24px; margin: 24px 0; border: 1px solid #EEEEEE;">
                      <h2 style="margin: 0 0 20px 0; color: #1A1A1A; font-size: 18px; font-weight: 600;">Booking Information</h2>
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Booking ID:</strong>
                            <span style="color: #4A4A4A; font-size: 13px; font-family: 'Courier New', monospace;">${bookingId}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Route:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${bookingDetails.originCity}, ${bookingDetails.originCountry} → ${bookingDetails.destinationCity}, ${bookingDetails.destinationCountry}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Mode:</strong>
                            <span style="color: #4A4A4A; font-size: 14px; text-transform: capitalize;">${bookingDetails.mode}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Departure:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${departureDate}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Arrival:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${arrivalDate}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Total Price:</strong>
                            <span style="color: #4A4A4A; font-size: 16px; font-weight: 600;">${formattedPrice}</span>
                          </td>
                        </tr>
                      </table>
                    </div>

                    ${refunded ? `
                    <div style="background-color: #E8F5E9; border-left: 3px solid #4CAF50; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #2E7D32; font-size: 14px; font-weight: 600;">✓ Refund Processed</p>
                      <p style="margin: 0; color: #2E7D32; font-size: 14px;">A full refund of ${formattedPrice} has been processed and will be credited back to your original payment method within 5-10 business days.</p>
                    </div>
                    ` : ''}
                    
                    <!-- CTA Button -->
                    <table role="presentation" style="width: 100%; margin: 32px 0;">
                      <tr>
                        <td align="center" style="padding: 0;">
                          <a href="${bookingUrl}" style="display: inline-block; background-color: #F44336; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);">View Booking Details</a>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="background-color: #FFF3E0; border-left: 3px solid #FF9800; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #E65100; font-size: 14px; font-weight: 600;">ℹ️ What's Next?</p>
                      <p style="margin: 0; color: #E65100; font-size: 14px;">You can search for other available shipments or contact the company directly if you have questions about this rejection.</p>
                    </div>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F8F8; padding: 24px 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                    <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} Parcsal. All rights reserved.</p>
                    <p style="margin: 0; color: #999999; font-size: 12px;">You're receiving this email because you have a booking on Parcsal.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return this.sendEmail(
      email,
      `Booking Rejected - ${bookingDetails.originCity} to ${bookingDetails.destinationCity} - Parcsal`,
      html
    );
  },
};

