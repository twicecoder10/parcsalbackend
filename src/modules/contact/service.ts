import { contactRepository } from './repository';
import { SubmitContactDto } from './dto';
import { emailService } from '../../config/email';

export const contactService = {
  async submitContact(dto: SubmitContactDto): Promise<{ message: string }> {
    // Save to database
    await contactRepository.create({
      name: dto.name,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
    });

    // Send email notification (don't wait for it)
    emailService.sendContactFormNotification(
      dto.name,
      dto.email,
      dto.subject,
      dto.message
    ).catch((err) => {
      console.error('Failed to send contact form notification:', err);
    });

    return {
      message: 'Your message has been received. We will get back to you soon.',
    };
  },
};

