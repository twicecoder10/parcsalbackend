import prisma from '../../config/database';
import { Contact } from '@prisma/client';

export interface CreateContactData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export const contactRepository = {
  async create(data: CreateContactData): Promise<Contact> {
    return prisma.contact.create({
      data,
    });
  },
};

