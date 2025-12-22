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

      // Email sent successfully - messageId available in return value if needed
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

  async sendBookingCancelledEmail(
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
    companyName: string
  ) {
    const formattedPrice = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: bookingDetails.currency.toUpperCase(),
    }).format(bookingDetails.price);

    const reviewUrl = `${config.frontendUrl}/customer/bookings/${bookingId}/review`;

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Booking Cancelled - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF9800 0%, #FFB74D 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Booking Cancelled</h1>
                    <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Your booking has been cancelled</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${customerName},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">We're writing to inform you that your booking with <strong>${companyName}</strong> has been cancelled.</p>
                    
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
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Total Price:</strong>
                            <span style="color: #4A4A4A; font-size: 16px; font-weight: 600;">${formattedPrice}</span>
                          </td>
                        </tr>
                      </table>
                    </div>
                    
                    <!-- Review CTA -->
                    <div style="background-color: #FFF5F0; border-left: 4px solid #FF6B35; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h3 style="margin: 0 0 12px 0; color: #1A1A1A; font-size: 16px; font-weight: 600;">Share Your Experience</h3>
                      <p style="margin: 0 0 16px 0; color: #4A4A4A; font-size: 14px;">We'd love to hear about your experience with this booking. Your feedback helps us improve our service.</p>
                      <table role="presentation" style="width: 100%; margin: 16px 0;">
                        <tr>
                          <td align="center" style="padding: 0;">
                            <a href="${reviewUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);">Leave a Review</a>
                          </td>
                        </tr>
                      </table>
                    </div>
                    
                    <div style="background-color: #FFF3E0; border-left: 3px solid #FF9800; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #E65100; font-size: 14px; font-weight: 600;">ℹ️ Need Help?</p>
                      <p style="margin: 0; color: #E65100; font-size: 14px;">If you have any questions about this cancellation, please contact ${companyName} or our support team.</p>
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
      `Booking Cancelled - ${bookingDetails.originCity} to ${bookingDetails.destinationCity} - Parcsal`,
      html
    );
  },

  async sendBookingDelayedEmail(
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
    companyName: string
  ) {
    const reviewUrl = `${config.frontendUrl}/customer/bookings/${bookingId}/review`;

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Shipment Delayed - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF9800 0%, #FFB74D 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Shipment Delayed</h1>
                    <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Your shipment has been delayed</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${customerName},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">We're writing to inform you that your shipment with <strong>${companyName}</strong> has been delayed. We apologize for any inconvenience this may cause.</p>
                    
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
                      </table>
                    </div>
                    
                    <!-- Review CTA -->
                    <div style="background-color: #FFF5F0; border-left: 4px solid #FF6B35; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h3 style="margin: 0 0 12px 0; color: #1A1A1A; font-size: 16px; font-weight: 600;">Share Your Experience</h3>
                      <p style="margin: 0 0 16px 0; color: #4A4A4A; font-size: 14px;">We value your feedback. Please let us know about your experience with this delayed shipment.</p>
                      <table role="presentation" style="width: 100%; margin: 16px 0;">
                        <tr>
                          <td align="center" style="padding: 0;">
                            <a href="${reviewUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);">Leave a Review</a>
                          </td>
                        </tr>
                      </table>
                    </div>
                    
                    <div style="background-color: #FFF3E0; border-left: 3px solid #FF9800; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #E65100; font-size: 14px; font-weight: 600;">ℹ️ Need Updates?</p>
                      <p style="margin: 0; color: #E65100; font-size: 14px;">For more information about the delay, please contact ${companyName} or check your booking status in your account.</p>
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
      `Shipment Delayed - ${bookingDetails.originCity} to ${bookingDetails.destinationCity} - Parcsal`,
      html
    );
  },

  async sendBookingDeliveredEmail(
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
    companyName: string
  ) {
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

    const reviewUrl = `${config.frontendUrl}/customer/bookings/${bookingId}/review`;

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Shipment Delivered - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Shipment Delivered!</h1>
                    <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Your shipment has been successfully delivered</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${customerName},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">Great news! Your shipment with <strong>${companyName}</strong> has been successfully delivered to its destination.</p>
                    
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
                      </table>
                    </div>
                    
                    <!-- Review CTA -->
                    <div style="background-color: #E8F5E9; border-left: 4px solid #4CAF50; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h3 style="margin: 0 0 12px 0; color: #1A1A1A; font-size: 16px; font-weight: 600;">How Was Your Experience?</h3>
                      <p style="margin: 0 0 16px 0; color: #4A4A4A; font-size: 14px;">We'd love to hear about your experience! Your feedback helps us improve our service and helps other customers make informed decisions.</p>
                      <table role="presentation" style="width: 100%; margin: 16px 0;">
                        <tr>
                          <td align="center" style="padding: 0;">
                            <a href="${reviewUrl}" style="display: inline-block; background-color: #4CAF50; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">Leave a Review</a>
                          </td>
                        </tr>
                      </table>
                    </div>
                    
                    <div style="background-color: #E8F5E9; border-left: 3px solid #4CAF50; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #2E7D32; font-size: 14px; font-weight: 600;">✓ Delivery Confirmed</p>
                      <p style="margin: 0; color: #2E7D32; font-size: 14px;">Your shipment has been successfully delivered. Thank you for using Parcsal!</p>
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
      `Shipment Delivered - ${bookingDetails.originCity} to ${bookingDetails.destinationCity} - Parcsal`,
      html
    );
  },

  async sendExtraChargeRequestEmail(
    email: string,
    customerName: string,
    bookingId: string,
    _extraChargeId: string,
    amount: number,
    currency: string,
    reason: string,
    description: string | null,
    expiresAt: Date,
    bookingDetails: {
      originCity: string;
      originCountry: string;
      destinationCity: string;
      destinationCountry: string;
      mode: string;
    },
    companyName: string
  ) {
    const formattedAmount = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);

    const expiresDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(expiresAt));

    const bookingUrl = `${config.frontendUrl}/bookings/${bookingId}`;
    const reasonDisplay = reason.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Additional Charge Requested - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF9800 0%, #FFB74D 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Additional Charge Requested</h1>
                    <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Action required for your booking</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${customerName},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;"><strong>${companyName}</strong> has requested an additional charge for your booking. Please review the details below and take action.</p>
                    
                    <!-- Charge Details -->
                    <div style="background-color: #FFF5F0; border-left: 4px solid #FF6B35; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h2 style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 18px; font-weight: 600;">Charge Details</h2>
                      <table role="presentation" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Amount:</strong>
                            <span style="color: #4A4A4A; font-size: 18px; font-weight: 600;">${formattedAmount}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Reason:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${reasonDisplay}</span>
                          </td>
                        </tr>
                        ${description ? `
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Description:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${description}</span>
                          </td>
                        </tr>
                        ` : ''}
                        <tr>
                          <td style="padding: 8px 0;">
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 120px;">Expires:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${expiresDate}</span>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- Booking Details -->
                    <div style="background-color: #F8F8F8; border-radius: 8px; padding: 24px; margin: 24px 0; border: 1px solid #EEEEEE;">
                      <h2 style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 18px; font-weight: 600;">Booking Information</h2>
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
                          <a href="${bookingUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);">Review & Pay Charge</a>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="background-color: #FFF9E6; border-left: 3px solid #FFB84D; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #856404; font-size: 14px; font-weight: 600;">⏰ Action Required</p>
                      <p style="margin: 0; color: #856404; font-size: 14px;">Please review and respond to this charge request before it expires. You can pay or decline the charge from your booking page.</p>
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
      `Additional Charge Requested - ${formattedAmount} - Parcsal`,
      html
    );
  },

  async sendExtraChargePaymentReceiptEmail(
    email: string,
    customerName: string,
    bookingId: string,
    _extraChargeId: string,
    amount: number,
    currency: string,
    reason: string,
    paymentIntentId: string,
    paidAt: Date,
    bookingDetails: {
      originCity: string;
      originCountry: string;
      destinationCity: string;
      destinationCountry: string;
      mode: string;
    },
    companyName: string
  ) {
    const formattedAmount = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);

    const formattedDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(paidAt));

    const bookingUrl = `${config.frontendUrl}/bookings/${bookingId}`;
    const reasonDisplay = reason.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Payment Receipt - Extra Charge - Parcsal</title>
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
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">Your payment for the additional charge has been successfully processed. Below are the details of your transaction:</p>
                    
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
                            <strong style="color: #1A1A1A; font-size: 14px; display: inline-block; min-width: 140px;">Charge Reason:</strong>
                            <span style="color: #4A4A4A; font-size: 14px;">${reasonDisplay}</span>
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
      `Payment Receipt - Extra Charge - ${formattedAmount} - Parcsal`,
      html
    );
  },

  async sendAccountDeletionEmail(
    email: string,
    name: string,
    isCompanyAdmin: boolean,
    companyName?: string
  ) {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Account Deleted - Parcsal</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Account Deleted</h1>
                    <p style="margin: 12px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Your account has been successfully deleted</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 16px 0; color: #1A1A1A; font-size: 16px;">Hello ${name},</p>
                    <p style="margin: 0 0 24px 0; color: #4A4A4A; font-size: 16px;">This email confirms that your Parcsal account has been permanently deleted as requested.</p>
                    
                    <div style="background-color: #FFF5F0; border-left: 4px solid #FF6B35; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h3 style="margin: 0 0 12px 0; color: #1A1A1A; font-size: 16px; font-weight: 600;">What Was Deleted:</h3>
                      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #4A4A4A; font-size: 14px; line-height: 1.8;">
                        <li>Your account and all personal information have been anonymized</li>
                        ${isCompanyAdmin && companyName ? `
                        <li><strong>Your company "${companyName}" has been permanently deleted</strong></li>
                        <li>All staff members associated with your company have had their accounts anonymized</li>
                        <li>All company data (shipments, bookings, warehouses, subscriptions) has been deleted</li>
                        ` : `
                        <li>Your booking records have been anonymized (personal contact information removed)</li>
                        <li>Your reviews remain but are linked to an anonymized account</li>
                        `}
                        <li>All notifications have been deleted</li>
                      </ul>
                    </div>

                    <div style="background-color: #E3F2FD; border-left: 4px solid #2196F3; padding: 20px; margin: 24px 0; border-radius: 4px;">
                      <h3 style="margin: 0 0 12px 0; color: #1A1A1A; font-size: 16px; font-weight: 600;">Data Privacy:</h3>
                      <p style="margin: 0; color: #4A4A4A; font-size: 14px; line-height: 1.8;">
                        In accordance with data privacy regulations, all personally identifiable information has been removed from our systems. 
                        Business records (such as anonymized booking data) may be retained for business analytics purposes but cannot be linked back to you.
                      </p>
                    </div>
                    
                    <div style="background-color: #FFF9E6; border-left: 3px solid #FFB84D; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0 0 8px 0; color: #856404; font-size: 14px; font-weight: 600;">⚠️ Important</p>
                      <p style="margin: 0; color: #856404; font-size: 14px;">
                        This action cannot be undone. If you wish to use Parcsal again in the future, you'll need to create a new account.
                      </p>
                    </div>

                    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #EEEEEE;">
                      <p style="margin: 0 0 8px 0; color: #666666; font-size: 14px;">We're sorry to see you go. If you have any feedback about your experience with Parcsal, we'd love to hear from you.</p>
                      <p style="margin: 0; color: #999999; font-size: 14px;">
                        If you didn't request this deletion, please contact our support team immediately.
                      </p>
                    </div>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F8F8; padding: 24px 30px; text-align: center; border-top: 1px solid #EEEEEE;">
                    <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">© ${new Date().getFullYear()} Parcsal. All rights reserved.</p>
                    <p style="margin: 0; color: #999999; font-size: 12px;">This is an automated confirmation email for account deletion.</p>
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
      'Account Deleted - Parcsal',
      html
    );
  },
};

