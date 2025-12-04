import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  console.log('🌱 Seeding database...');

  // Create default company plans
  const basicPlan = await prisma.companyPlan.upsert({
    where: { name: 'Basic' },
    update: {},
    create: {
      name: 'Basic',
      priceMonthly: 29.99,
      maxActiveShipmentSlots: 10,
      maxTeamMembers: 3,
      isDefault: false,
    },
  });

  const proPlan = await prisma.companyPlan.upsert({
    where: { name: 'Pro' },
    update: {},
    create: {
      name: 'Pro',
      priceMonthly: 99.99,
      maxActiveShipmentSlots: 50,
      maxTeamMembers: 10,
      isDefault: false,
    },
  });

  const enterprisePlan = await prisma.companyPlan.upsert({
    where: { name: 'Enterprise' },
    update: {},
    create: {
      name: 'Enterprise',
      priceMonthly: 299.99,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: null, // unlimited
      isDefault: true,
    },
  });

  console.log('✅ Created company plans:', { basicPlan, proPlan, enterprisePlan });

  // Create super admin user
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@parcsal.com';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';
  const superAdminName = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  console.log('📧 Super Admin Email:', superAdminEmail);
  console.log('👤 Super Admin Name:', superAdminName);
  console.log('🔑 Using', process.env.SUPER_ADMIN_PASSWORD ? 'custom password from .env' : 'default password: Admin@123');

  const passwordHash = await bcrypt.hash(superAdminPassword, SALT_ROUNDS);

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      role: 'SUPER_ADMIN',
      passwordHash,
      isEmailVerified: true,
    },
    create: {
      email: superAdminEmail,
      passwordHash,
      fullName: superAdminName,
      role: 'SUPER_ADMIN',
      isEmailVerified: true,
    },
  });

  console.log('✅ Created super admin user:', { email: superAdmin.email, name: superAdmin.fullName });
  console.log('✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

