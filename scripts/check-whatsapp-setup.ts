/**
 * WhatsApp Setup Diagnostic Script
 * Run with: npx ts-node scripts/check-whatsapp-setup.ts
 */

import { config } from '../src/config/env';
import prisma from '../src/config/database';

async function checkWhatsAppSetup() {
  console.log('🔍 WhatsApp Integration Diagnostic\n');
  console.log('=' .repeat(50));

  // 1. Check Environment Variables
  console.log('\n1. Environment Variables:');
  console.log('   WHATSAPP_ENABLED:', config.whatsapp.enabled ? '✅ true' : '❌ false or missing');
  console.log('   WHATSAPP_TOKEN:', config.whatsapp.token ? `✅ Set (${config.whatsapp.token.substring(0, 10)}...)` : '❌ Missing');
  console.log('   WHATSAPP_PHONE_NUMBER_ID:', config.whatsapp.phoneNumberId ? `✅ ${config.whatsapp.phoneNumberId}` : '❌ Missing');
  console.log('   WHATSAPP_BUSINESS_ACCOUNT_ID:', config.whatsapp.businessAccountId ? `✅ ${config.whatsapp.businessAccountId}` : '❌ Missing');
  console.log('   WHATSAPP_VERIFY_TOKEN:', config.whatsapp.verifyToken ? '✅ Set' : '❌ Missing');
  console.log('   WHATSAPP_DEFAULT_COUNTRY:', config.whatsapp.defaultCountry);

  if (!config.whatsapp.enabled) {
    console.log('\n⚠️  WhatsApp is disabled! Set WHATSAPP_ENABLED=true in .env');
    return;
  }

  // 2. Check Recent Messages
  console.log('\n2. Recent WhatsApp Messages (last 5):');
  try {
    const recentMessages = await prisma.whatsAppMessage.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { email: true, fullName: true },
        },
        company: {
          select: { name: true },
        },
      },
    });

    if (recentMessages.length === 0) {
      console.log('   ⚠️  No messages found in database');
    } else {
      recentMessages.forEach((msg, idx) => {
        console.log(`\n   Message ${idx + 1}:`);
        console.log(`   - ID: ${msg.id}`);
        console.log(`   - Status: ${msg.status}`);
        console.log(`   - Template: ${msg.templateName}`);
        console.log(`   - To: ${msg.toPhone}`);
        console.log(`   - User: ${msg.user?.email || 'N/A'}`);
        console.log(`   - Company: ${msg.company?.name || 'N/A'}`);
        if (msg.error) {
          console.log(`   - ❌ Error: ${msg.error.substring(0, 100)}`);
        }
        if (msg.providerMsgId) {
          console.log(`   - ✅ Provider ID: ${msg.providerMsgId}`);
        }
      });
    }
  } catch (error: any) {
    console.log('   ❌ Error querying messages:', error.message);
  }

  // 3. Check Failed Messages
  console.log('\n3. Failed Messages:');
  try {
    const failedMessages = await prisma.whatsAppMessage.findMany({
      where: { status: 'FAILED' },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    if (failedMessages.length === 0) {
      console.log('   ✅ No failed messages');
    } else {
      console.log(`   ⚠️  Found ${failedMessages.length} failed messages:`);
      failedMessages.forEach((msg, idx) => {
        console.log(`\n   Failed Message ${idx + 1}:`);
        console.log(`   - Template: ${msg.templateName}`);
        console.log(`   - To: ${msg.toPhone}`);
        console.log(`   - Error: ${msg.error?.substring(0, 200) || 'No error message'}`);
      });
    }
  } catch (error: any) {
    console.log('   ❌ Error querying failed messages:', error.message);
  }

  // 4. Check Users with WhatsApp Enabled
  console.log('\n4. Users with WhatsApp Enabled:');
  try {
    const usersWithWhatsApp = await prisma.user.findMany({
      where: {
        notificationWhatsapp: true,
        phoneNumber: { not: null },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        notificationWhatsapp: true,
        role: true,
      },
      take: 10,
    });

    if (usersWithWhatsApp.length === 0) {
      console.log('   ⚠️  No users have WhatsApp enabled with phone numbers');
      console.log('   💡 Users need: phoneNumber set AND notificationWhatsapp=true');
    } else {
      console.log(`   ✅ Found ${usersWithWhatsApp.length} users with WhatsApp enabled:`);
      usersWithWhatsApp.forEach((user) => {
        console.log(`   - ${user.email} (${user.role}): ${user.phoneNumber}`);
      });
    }
  } catch (error: any) {
    console.log('   ❌ Error querying users:', error.message);
  }

  // 5. Test API Connection (if token is set)
  if (config.whatsapp.token && config.whatsapp.phoneNumberId) {
    console.log('\n5. Testing API Connection:');
    try {
      // Just check if we can reach the API (don't send a message)
      const testUrl = `https://graph.facebook.com/v18.0/${config.whatsapp.phoneNumberId}`;
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
        },
      });

      if (response.ok) {
        console.log('   ✅ API connection successful');
      } else {
        const errorData = await response.json().catch(() => ({})) as { error?: any };
        console.log(`   ❌ API connection failed: ${response.status} ${response.statusText}`);
        if (errorData.error) {
          console.log(`   Error details: ${JSON.stringify(errorData.error)}`);
        }
      }
    } catch (error: any) {
      console.log(`   ❌ Network error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n💡 Next Steps:');
  console.log('1. Check the debugging guide: WHATSAPP_DEBUGGING.md');
  console.log('2. Verify templates are approved in Meta Business Manager');
  console.log('3. Check server logs for detailed error messages');
  console.log('4. Ensure users have phone numbers and have opted in');
  console.log('\n');
}

// Run the diagnostic
checkWhatsAppSetup()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error running diagnostic:', error);
    process.exit(1);
  });
