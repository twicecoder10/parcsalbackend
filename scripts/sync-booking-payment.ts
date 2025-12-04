/**
 * Script to manually sync payment status for a specific booking
 * Usage: npx ts-node scripts/sync-booking-payment.ts <bookingId>
 */

import prisma from '../src/config/database';
import Stripe from 'stripe';
import { config } from '../src/config/env';
import { paymentRepository } from '../src/modules/payments/repository';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

async function syncBookingPayment(bookingId: string) {
  console.log(`\n🔍 Checking booking: ${bookingId}\n`);

  // Get booking
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      customer: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
      shipmentSlot: {
        select: {
          originCity: true,
          destinationCity: true,
        },
      },
    },
  });

  if (!booking) {
    console.error('❌ Booking not found');
    process.exit(1);
  }

  console.log('📋 Booking Details:');
  console.log(`   Customer: ${booking.customer.fullName} (${booking.customer.email})`);
  console.log(`   Route: ${booking.shipmentSlot.originCity} → ${booking.shipmentSlot.destinationCity}`);
  console.log(`   Amount: $${booking.calculatedPrice}`);
  console.log(`   Current Payment Status: ${booking.paymentStatus}`);
  console.log(`   Booking Status: ${booking.status}\n`);

  // Check if payment record exists
  if (booking.payment) {
    console.log('💳 Payment Record Found:');
    console.log(`   Payment ID: ${booking.payment.id}`);
    console.log(`   Stripe Payment Intent: ${booking.payment.stripePaymentIntentId}`);
    console.log(`   Payment Status: ${booking.payment.status}`);
    console.log(`   Amount: $${booking.payment.amount}\n`);

    // Check Stripe payment intent status
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        booking.payment.stripePaymentIntentId
      );

      console.log('🔗 Stripe Payment Intent Status:');
      console.log(`   Status: ${paymentIntent.status}`);
      console.log(`   Amount: $${(paymentIntent.amount / 100).toFixed(2)}`);
      console.log(`   Currency: ${paymentIntent.currency.toUpperCase()}\n`);

      if (paymentIntent.status === 'succeeded' && booking.paymentStatus !== 'PAID') {
        console.log('⚠️  Payment succeeded in Stripe but not marked as PAID in database');
        console.log('🔄 Syncing payment status...\n');

        await paymentRepository.updateStatus(booking.payment.id, 'SUCCEEDED');
        await paymentRepository.updateBookingPaymentStatus(bookingId, 'PAID');

        console.log('✅ Payment status synced successfully!');
        console.log(`   Booking payment status: PAID`);
        console.log(`   Payment record status: SUCCEEDED\n`);
      } else if (paymentIntent.status === 'succeeded' && booking.paymentStatus === 'PAID') {
        console.log('✅ Payment is already synced correctly\n');
      } else {
        console.log(`⚠️  Payment intent status is: ${paymentIntent.status}`);
        console.log(`   This payment has not succeeded yet.\n`);
      }
    } catch (error: any) {
      console.error('❌ Error retrieving payment intent from Stripe:', error.message);
      process.exit(1);
    }
  } else {
    console.log('⚠️  No payment record found in database');
    console.log('🔍 Searching for checkout sessions...\n');

    // Try to find checkout session
    try {
      const sessions = await stripe.checkout.sessions.list({
        limit: 100,
      });

      const relevantSession = sessions.data.find(
        (session) =>
          (session.metadata?.bookingId === bookingId ||
            session.client_reference_id === bookingId) &&
          session.payment_intent
      );

      if (relevantSession) {
        console.log('📝 Found checkout session:');
        console.log(`   Session ID: ${relevantSession.id}`);
        console.log(`   Payment Intent: ${relevantSession.payment_intent}\n`);

        const paymentIntentId = relevantSession.payment_intent as string;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        console.log('🔗 Payment Intent Status:');
        console.log(`   Status: ${paymentIntent.status}`);
        console.log(`   Amount: $${(paymentIntent.amount / 100).toFixed(2)}\n`);

        if (paymentIntent.status === 'succeeded') {
          console.log('🔄 Creating payment record and updating status...\n');

          const paymentData = {
            bookingId,
            stripePaymentIntentId: paymentIntentId,
            amount: Number(paymentIntent.amount) / 100,
            currency: paymentIntent.currency,
            status: 'SUCCEEDED' as const,
          };

          await paymentRepository.create(paymentData);
          await paymentRepository.updateBookingPaymentStatus(bookingId, 'PAID');

          console.log('✅ Payment record created and status updated!');
          console.log(`   Booking payment status: PAID\n`);
        } else {
          console.log(`⚠️  Payment intent status is: ${paymentIntent.status}`);
          console.log(`   Payment has not succeeded yet.\n`);
        }
      } else {
        console.log('❌ No checkout session found for this booking');
        console.log('   The customer may not have initiated payment yet.\n');
      }
    } catch (error: any) {
      console.error('❌ Error searching for checkout sessions:', error.message);
      process.exit(1);
    }
  }

  // Final status
  const updatedBooking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      paymentStatus: true,
      payment: {
        select: {
          status: true,
        },
      },
    },
  });

  console.log('📊 Final Status:');
  console.log(`   Booking Payment Status: ${updatedBooking?.paymentStatus}`);
  if (updatedBooking?.payment) {
    console.log(`   Payment Record Status: ${updatedBooking.payment.status}`);
  }
  console.log('');
}

// Main execution
const bookingId = process.argv[2];

if (!bookingId) {
  console.error('❌ Please provide a booking ID');
  console.log('Usage: npx ts-node scripts/sync-booking-payment.ts <bookingId>');
  process.exit(1);
}

syncBookingPayment(bookingId)
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

