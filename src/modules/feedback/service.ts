import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { emailService } from '../../config/email';
import { captureEvent } from '../../lib/posthog';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import { NotFoundError } from '../../utils/errors';
import { FeedbackPriority, FeedbackStatus } from '@prisma/client';
import { SubmitFeedbackDto, ListFeedbackQuery, UpdateFeedbackDto } from './dto';
import { feedbackRepository } from './repository';

const ADMIN_FEEDBACK_EMAIL = 'support@parcsal.co.uk';

function buildFeedbackEmailHtml(params: {
  type: string;
  app: string;
  role: string;
  message: string;
  rating?: number | null;
  pageUrl?: string | null;
  attachments?: string[] | null;
  userId?: string | null;
  companyId?: string | null;
}): string {
  const attachments = params.attachments?.length
    ? params.attachments.map((url) => `<li><a href="${url}">${url}</a></li>`).join('')
    : '<li>None</li>';

  return `
    <div style="font-family: Arial, sans-serif; color: #1A1A1A;">
      <h2>New Feedback Submitted</h2>
      <p><strong>Type:</strong> ${params.type}</p>
      <p><strong>App:</strong> ${params.app}</p>
      <p><strong>Role:</strong> ${params.role}</p>
      <p><strong>Rating:</strong> ${params.rating ?? 'N/A'}</p>
      <p><strong>Page URL:</strong> ${params.pageUrl ?? 'N/A'}</p>
      <p><strong>User ID:</strong> ${params.userId ?? 'N/A'}</p>
      <p><strong>Company ID:</strong> ${params.companyId ?? 'N/A'}</p>
      <h3>Message</h3>
      <p style="white-space: pre-wrap;">${params.message}</p>
      <h3>Attachments</h3>
      <ul>${attachments}</ul>
    </div>
  `;
}

export const feedbackService = {
  async submitFeedback(req: AuthRequest, dto: SubmitFeedbackDto) {
    const userId = req.user?.id ?? null;
    const companyId = req.user?.companyId ?? null;
    const attachments = dto.attachments?.length ? dto.attachments : null;

    const feedback = await feedbackRepository.create({
      userId,
      companyId,
      type: dto.type,
      rating: dto.rating ?? null,
      message: dto.message,
      pageUrl: dto.pageUrl ?? null,
      app: dto.app,
      attachments,
    });

    const role = req.user?.role ?? 'GUEST';
    const companyPlan = companyId
      ? (await prisma.company.findUnique({
          where: { id: companyId },
          select: { plan: true },
        }))?.plan ?? null
      : null;

    captureEvent({
      distinctId: userId ?? feedback.id,
      event: 'feedback_submitted',
      properties: {
        type: dto.type,
        app: dto.app,
        role,
        companyPlan,
      },
    });

    const emailHtml = buildFeedbackEmailHtml({
      type: dto.type,
      app: dto.app,
      role,
      message: dto.message,
      rating: dto.rating ?? null,
      pageUrl: dto.pageUrl ?? null,
      attachments: attachments as string[] | null,
      userId,
      companyId,
    });

    emailService
      .sendEmail(
        ADMIN_FEEDBACK_EMAIL,
        `New Feedback (${dto.type}) - ${dto.app}`,
        emailHtml
      )
      .catch((error) => {
        console.error('Failed to send feedback notification email:', error);
      });

    return feedback;
  },

  async listFeedback(query?: ListFeedbackQuery) {
    const pagination = parsePagination(query || {});
    const filters = {
      status: query?.status,
      type: query?.type,
      app: query?.app,
    };

    const { feedback, total } = await feedbackRepository.findMany(filters, pagination);
    return createPaginatedResponse(feedback, total, pagination);
  },

  async updateFeedback(id: string, dto: UpdateFeedbackDto) {
    const existing = await feedbackRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Feedback not found');
    }

    const updateData: Partial<{ status: FeedbackStatus; priority: FeedbackPriority }> = {};
    if (dto.status) {
      updateData.status = dto.status;
    }
    if (dto.priority) {
      updateData.priority = dto.priority;
    }

    return feedbackRepository.update(id, updateData);
  },

  async getFeedbackById(id: string) {
    const feedback = await feedbackRepository.findById(id);
    if (!feedback) {
      throw new NotFoundError('Feedback not found');
    }

    return feedback;
  },
};

