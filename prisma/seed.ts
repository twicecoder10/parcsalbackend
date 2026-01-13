import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  console.log('🌱 Seeding database...');

  // Create default company plans (matching new CarrierPlan enum)
  const freePlan = await prisma.companyPlan.upsert({
    where: { name: 'FREE' },
    update: {
      carrierPlan: 'FREE',
      priceMonthly: 0,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: 1,
      isDefault: true,
    },
    create: {
      name: 'FREE',
      carrierPlan: 'FREE',
      priceMonthly: 0,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: 1,
      isDefault: false,
    },
  });

  const starterPlan = await prisma.companyPlan.upsert({
    where: { name: 'STARTER' },
    update: {
      carrierPlan: 'STARTER',
      priceMonthly: 49,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: 3,
      isDefault: true,
    },
    create: {
      name: 'STARTER',
      carrierPlan: 'STARTER',
      priceMonthly: 49,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: 3,
      isDefault: false,
    },
  });

  const professionalPlan = await prisma.companyPlan.upsert({
    where: { name: 'PROFESSIONAL' },
    update: {
      carrierPlan: 'PROFESSIONAL',
      priceMonthly: 149,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: 10,
      isDefault: false,
    },
    create: {
      name: 'PROFESSIONAL',
      carrierPlan: 'PROFESSIONAL',
      priceMonthly: 149,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: 10,
      isDefault: false,
    },
  });

  const enterprisePlan = await prisma.companyPlan.upsert({
    where: { name: 'ENTERPRISE' },
    update: {
      carrierPlan: 'ENTERPRISE',
      priceMonthly: 500,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: null, // unlimited
      isDefault: false,
    },
    create: {
      name: 'ENTERPRISE',
      carrierPlan: 'ENTERPRISE',
      priceMonthly: 500,
      maxActiveShipmentSlots: null, // unlimited
      maxTeamMembers: null, // unlimited
      isDefault: false,
    },
  });

  // Remove old plans if they exist
  await prisma.companyPlan.deleteMany({
    where: {
      name: {
        in: ['Basic', 'Pro', 'Enterprise'],
      },
    },
  }).catch(() => {
    // Ignore if they don't exist
  });

  console.log('✅ Created/updated company plans:', { freePlan, starterPlan, professionalPlan, enterprisePlan });

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


