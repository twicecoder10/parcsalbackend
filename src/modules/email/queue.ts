import { Queue, Worker, Job } from 'bullmq';
import { redisClient } from '../../config/redis';
import { emailService } from '../../config/email';

// Email queue
export const emailQueue = new Queue('emails', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

// Email job data types
export interface SendEmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendBookingConfirmationEmailJobData {
  customerEmail: string;
  customerName: string;
  bookingId: string;
  companyName: string;
  originCity: string;
  destinationCity: string;
  departureTime: Date;
  price: number;
  originCountry?: string;
  destinationCountry?: string;
  arrivalTime?: Date;
  mode?: string;
}

export interface SendBookingCancelledEmailJobData {
  customerEmail: string;
  customerName: string;
  bookingId: string;
  companyName: string;
  reason?: string;
}

export interface SendBookingDeliveredEmailJobData {
  customerEmail: string;
  customerName: string;
  bookingId: string;
  companyName: string;
}

export interface SendBookingRejectionEmailJobData {
  customerEmail: string;
  customerName: string;
  bookingId: string;
  companyName: string;
  reason?: string;
}

export interface SendTeamInvitationEmailJobData {
  inviteeEmail: string;
  inviterName: string;
  companyName: string;
  invitationToken: string;
}

// Worker to process email jobs
export const emailWorker = new Worker(
  'emails',
  async (job: Job<SendEmailJobData | SendBookingConfirmationEmailJobData | SendBookingCancelledEmailJobData | SendBookingDeliveredEmailJobData | SendBookingRejectionEmailJobData | SendTeamInvitationEmailJobData>) => {
    try {
      const jobName = job.name;
      const jobData = job.data;

      switch (jobName) {
        case 'send-email':
          await emailService.sendEmail(
            (jobData as SendEmailJobData).to,
            (jobData as SendEmailJobData).subject,
            (jobData as SendEmailJobData).html,
            (jobData as SendEmailJobData).text
          );
          break;

        case 'send-booking-confirmation': {
          const data = jobData as SendBookingConfirmationEmailJobData;
          await emailService.sendBookingConfirmationEmail(
            data.customerEmail,
            data.customerName,
            data.bookingId,
            {
              originCity: data.originCity,
              originCountry: '', // Not in job data, but email service expects it
              destinationCity: data.destinationCity,
              destinationCountry: '', // Not in job data, but email service expects it
              departureTime: data.departureTime,
              arrivalTime: new Date(data.departureTime.getTime() + 24 * 60 * 60 * 1000), // Estimate
              mode: 'VAN', // Default, not in job data
              price: data.price,
              currency: 'gbp',
            },
            data.companyName
          );
          break;
        }

        case 'send-booking-cancelled': {
          const data = jobData as SendBookingCancelledEmailJobData;
          await emailService.sendBookingCancelledEmail(
            data.customerEmail,
            data.customerName,
            data.bookingId,
            {
              originCity: '', // Not in job data
              originCountry: '',
              destinationCity: '',
              destinationCountry: '',
              departureTime: new Date(),
              arrivalTime: new Date(),
              mode: 'VAN',
              price: 0,
              currency: 'gbp',
            },
            data.companyName
          );
          break;
        }

        case 'send-booking-delivered': {
          const data = jobData as SendBookingDeliveredEmailJobData;
          await emailService.sendBookingDeliveredEmail(
            data.customerEmail,
            data.customerName,
            data.bookingId,
            {
              originCity: '', // Not in job data
              originCountry: '',
              destinationCity: '',
              destinationCountry: '',
              departureTime: new Date(),
              arrivalTime: new Date(),
              mode: 'VAN',
              price: 0,
              currency: 'gbp',
            },
            data.companyName
          );
          break;
        }

        case 'send-booking-rejection': {
          const data = jobData as SendBookingRejectionEmailJobData;
          await emailService.sendBookingRejectionEmail(
            data.customerEmail,
            data.customerName,
            data.bookingId,
            {
              originCity: '', // Not in job data
              originCountry: '',
              destinationCity: '',
              destinationCountry: '',
              departureTime: new Date(),
              arrivalTime: new Date(),
              mode: 'VAN',
              price: 0,
              currency: 'gbp',
            },
            data.companyName
          );
          break;
        }

        case 'send-team-invitation': {
          const data = jobData as SendTeamInvitationEmailJobData;
          const invitationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/accept-invitation?token=${data.invitationToken}`;
          await emailService.sendTeamInvitationEmail(
            data.inviteeEmail,
            data.invitationToken,
            data.companyName,
            'COMPANY_STAFF', // Default role
            invitationUrl
          );
          break;
        }

        default:
          throw new Error(`Unknown email job type: ${jobName}`);
      }

    } catch (error: any) {
      console.error(`❌ Email job ${job.id} failed:`, error.message);
      throw error; // Re-throw to trigger retry mechanism
    }
  },
  {
    connection: redisClient,
    concurrency: 10, // Process up to 10 emails concurrently
  }
);

// Event handlers
emailWorker.on('completed', () => {
  // Job completed silently
});

emailWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`❌ Email job ${job?.id} failed:`, err.message);
});

// Track shutdown state to suppress expected errors
let isShuttingDown = false;

emailWorker.on('error', (err: Error) => {
  // Suppress "Connection is closed" errors during shutdown (expected behavior)
  if (isShuttingDown && (err.message.includes('Connection is closed') || err.message.includes('closed'))) {
    return;
  }
  
  // Only log non-connection-closed errors
  if (!err.message.includes('Connection is closed') && !err.message.includes('closed')) {
    console.error('❌ Email worker error:', err);
  }
});

/**
 * Queue an email to be sent
 */
export async function queueEmail(data: SendEmailJobData) {
  await emailQueue.add('send-email', data, {
    jobId: `email-${Date.now()}-${Math.random()}`,
  });
}

/**
 * Queue a booking confirmation email
 */
export async function queueBookingConfirmationEmail(data: SendBookingConfirmationEmailJobData) {
  await emailQueue.add('send-booking-confirmation', data, {
    jobId: `booking-confirmation-${data.bookingId}`,
  });
}

/**
 * Queue a booking cancelled email
 */
export async function queueBookingCancelledEmail(data: SendBookingCancelledEmailJobData) {
  await emailQueue.add('send-booking-cancelled', data, {
    jobId: `booking-cancelled-${data.bookingId}`,
  });
}

/**
 * Queue a booking delivered email
 */
export async function queueBookingDeliveredEmail(data: SendBookingDeliveredEmailJobData) {
  await emailQueue.add('send-booking-delivered', data, {
    jobId: `booking-delivered-${data.bookingId}`,
  });
}

/**
 * Queue a booking rejection email
 */
export async function queueBookingRejectionEmail(data: SendBookingRejectionEmailJobData) {
  await emailQueue.add('send-booking-rejection', data, {
    jobId: `booking-rejection-${data.bookingId}`,
  });
}

/**
 * Queue a team invitation email
 */
export async function queueTeamInvitationEmail(data: SendTeamInvitationEmailJobData) {
  await emailQueue.add('send-team-invitation', data, {
    jobId: `team-invitation-${data.invitationToken}`,
  });
}

/**
 * Graceful shutdown
 */
export async function shutdownEmailQueue() {
  isShuttingDown = true;
  
  try {
    // Close worker first (stops processing new jobs)
    await emailWorker.close();
    // Then close queue
    await emailQueue.close();
  } catch (error: any) {
    // Suppress connection errors during shutdown
    if (!error.message?.includes('Connection is closed') && !error.message?.includes('closed')) {
      console.error('Error shutting down email queue:', error);
    }
  }
}

