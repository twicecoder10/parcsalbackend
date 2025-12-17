import PDFDocument from 'pdfkit';
import { uploadToAzure } from './azureStorage';
import { Booking, ShipmentSlot, User, Company, WarehouseAddress } from '@prisma/client';
// @ts-ignore - bwip-js doesn't have perfect TypeScript support
import bwipjs from 'bwip-js';

interface BookingWithRelations extends Booking {
  shipmentSlot: ShipmentSlot;
  customer: User;
  company: Company;
  pickupWarehouse?: WarehouseAddress | null;
  deliveryWarehouse?: WarehouseAddress | null;
}

/**
 * Generate a printable shipping label PDF for a booking
 */
export async function generateShippingLabel(
  booking: BookingWithRelations
): Promise<{ filename: string; url: string }> {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF document (4x6 inches - standard shipping label size)
      // @ts-ignore - pdfkit types may not match exactly
      const doc = new PDFDocument({
        size: [288, 432], // 4x6 inches in points (72 points per inch)
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
      });

      const buffers: Buffer[] = [];

      // Collect PDF data
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          
          // Upload to Azure Storage
          const result = await uploadToAzure(
            pdfBuffer,
            `label-${booking.id}.pdf`,
            'label'
          );
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      doc.on('error', reject);

      // Generate label content (async - includes barcode generation)
      generateLabelContent(doc, booking)
        .then(() => {
          // Finalize PDF after content is generated
          doc.end();
        })
        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate a barcode image from booking ID
 */
async function generateBarcode(bookingId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Generate Code128 barcode (widely supported, can encode alphanumeric)
      bwipjs.toBuffer({
        bcid: 'code128',      // Barcode type: Code 128
        text: bookingId,      // Data to encode
        scale: 3,              // Scaling factor (3x)
        height: 40,            // Bar height in pixels
        includetext: false,    // Don't include text below barcode (we'll add it separately)
        textxalign: 'center',  // Text alignment
      }, (err: string | Error | null, png: Buffer) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(err));
        } else {
          resolve(png);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate the content of the shipping label
 */
async function generateLabelContent(
  doc: any, // PDFDocument type from pdfkit
  booking: BookingWithRelations
): Promise<void> {
  const fontSize = 10;
  const smallFontSize = 8;
  const lineHeight = 12;
  let yPosition = 20;

  // Title
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('SHIPPING LABEL', 20, yPosition, { align: 'center' });
  yPosition += 25;

  // Booking ID text
  // doc.fontSize(14)
  //    .font('Helvetica-Bold')
  //    .text(`Booking ID: ${booking.id}`, 20, yPosition, { align: 'center' });
  // yPosition += 20;

  // Generate and embed barcode
  try {
    const barcodeBuffer = await generateBarcode(booking.id);
    
    // Calculate barcode position (centered, 128 points wide)
    const barcodeX = 80; // Center of 288pt width: (288 - 128) / 2 = 80
    const barcodeY = yPosition;
    const barcodeWidth = 128;
    const barcodeHeight = 40;
    
    // Embed barcode image in PDF
    doc.image(barcodeBuffer, barcodeX, barcodeY, {
      width: barcodeWidth,
      height: barcodeHeight,
      align: 'center',
    });
    
    // Draw border around barcode for better visibility
    doc.rect(barcodeX, barcodeY, barcodeWidth, barcodeHeight)
       .stroke();
    
    yPosition += barcodeHeight + 10;
    
    // Add booking ID text below barcode for human readability
    doc.fontSize(10)
       .font('Helvetica')
       .text(booking.id, 20, yPosition, { align: 'center' });
    yPosition += 15;
  } catch (barcodeError) {
    // If barcode generation fails, show booking ID as fallback
    console.error('Failed to generate barcode:', barcodeError);
    doc.fontSize(12)
       .font('Helvetica')
       .text(booking.id, 20, yPosition, { align: 'center' });
    yPosition += 20;
  }

  // FROM: Pickup Address or Pickup Warehouse
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .text('FROM:', 20, yPosition);
  yPosition += 15;
  
  doc.fontSize(fontSize)
     .font('Helvetica');
  
  // Use pickup address if available, otherwise use pickup warehouse
  if (booking.pickupAddress) {
    // Pickup address available
    if (booking.pickupContactName) {
      doc.text(booking.pickupContactName, 20, yPosition);
      yPosition += lineHeight;
    }
    
    doc.text(booking.pickupAddress, 20, yPosition);
    yPosition += lineHeight;
    
    if (booking.pickupCity) {
      const cityLine = `${booking.pickupCity}${booking.pickupState ? `, ${booking.pickupState}` : ''} ${booking.pickupPostalCode || ''}`.trim();
      doc.text(cityLine, 20, yPosition);
      yPosition += lineHeight;
    }
    
    if (booking.pickupCountry) {
      doc.text(booking.pickupCountry, 20, yPosition);
      yPosition += lineHeight;
    }
    
    if (booking.pickupContactPhone) {
      doc.fontSize(smallFontSize)
         .text(`Phone: ${booking.pickupContactPhone}`, 20, yPosition);
      yPosition += lineHeight;
    }
  } else if (booking.pickupWarehouse) {
    // Use pickup warehouse address
    doc.text(booking.pickupWarehouse.name, 20, yPosition);
    yPosition += lineHeight;
    doc.text(booking.pickupWarehouse.address, 20, yPosition);
    yPosition += lineHeight;
    const cityLine = `${booking.pickupWarehouse.city}${booking.pickupWarehouse.state ? `, ${booking.pickupWarehouse.state}` : ''} ${booking.pickupWarehouse.postalCode || ''}`.trim();
    doc.text(cityLine, 20, yPosition);
    yPosition += lineHeight;
    doc.text(booking.pickupWarehouse.country, 20, yPosition);
    yPosition += lineHeight;
  } else {
    // Fallback: show customer info if no pickup address or warehouse
    doc.text(booking.customer.fullName, 20, yPosition);
    yPosition += lineHeight;
    if (booking.customer.address) {
      doc.text(booking.customer.address, 20, yPosition);
      yPosition += lineHeight;
    }
    if (booking.customer.city) {
      doc.text(booking.customer.city, 20, yPosition);
      yPosition += lineHeight;
    }
    if (booking.customer.country) {
      doc.text(booking.customer.country, 20, yPosition);
      yPosition += lineHeight;
    }
  }

  yPosition += 10;

  // TO: Delivery Address or Delivery Warehouse
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .text('TO:', 20, yPosition);
  yPosition += 15;
  
  doc.fontSize(fontSize)
     .font('Helvetica');
  
  // Use delivery address if available, otherwise use delivery warehouse
  if (booking.deliveryAddress) {
    // Delivery address available
    if (booking.deliveryContactName) {
      doc.text(booking.deliveryContactName, 20, yPosition);
      yPosition += lineHeight;
    }
    
    doc.text(booking.deliveryAddress, 20, yPosition);
    yPosition += lineHeight;
    
    if (booking.deliveryCity) {
      const cityLine = `${booking.deliveryCity}${booking.deliveryState ? `, ${booking.deliveryState}` : ''} ${booking.deliveryPostalCode || ''}`.trim();
      doc.text(cityLine, 20, yPosition);
      yPosition += lineHeight;
    }
    
    if (booking.deliveryCountry) {
      doc.text(booking.deliveryCountry, 20, yPosition);
      yPosition += lineHeight;
    }
    
    if (booking.deliveryContactPhone) {
      doc.fontSize(smallFontSize)
         .text(`Phone: ${booking.deliveryContactPhone}`, 20, yPosition);
      yPosition += lineHeight;
    }
  } else if (booking.deliveryWarehouse) {
    // Use delivery warehouse address
    doc.text(booking.deliveryWarehouse.name, 20, yPosition);
    yPosition += lineHeight;
    doc.text(booking.deliveryWarehouse.address, 20, yPosition);
    yPosition += lineHeight;
    const cityLine = `${booking.deliveryWarehouse.city}${booking.deliveryWarehouse.state ? `, ${booking.deliveryWarehouse.state}` : ''} ${booking.deliveryWarehouse.postalCode || ''}`.trim();
    doc.text(cityLine, 20, yPosition);
    yPosition += lineHeight;
    doc.text(booking.deliveryWarehouse.country, 20, yPosition);
    yPosition += lineHeight;
  } else {
    // Fallback: show customer info if no delivery address or warehouse
    doc.text(booking.customer.fullName, 20, yPosition);
    yPosition += lineHeight;
    if (booking.customer.address) {
      doc.text(booking.customer.address, 20, yPosition);
      yPosition += lineHeight;
    }
    if (booking.customer.city) {
      doc.text(booking.customer.city, 20, yPosition);
      yPosition += lineHeight;
    }
    if (booking.customer.country) {
      doc.text(booking.customer.country, 20, yPosition);
      yPosition += lineHeight;
    }
  }

  yPosition += 10;

  // Parcel Information
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .text('PARCEL INFO:', 20, yPosition);
  yPosition += 15;
  
  doc.fontSize(fontSize)
     .font('Helvetica');
  
  if (booking.parcelType) {
    doc.text(`Type: ${booking.parcelType}`, 20, yPosition);
    yPosition += lineHeight;
  }
  
  if (booking.weight) {
    doc.text(`Weight: ${booking.weight} kg`, 20, yPosition);
    yPosition += lineHeight;
  }
  
  if (booking.requestedWeightKg) {
    doc.text(`Requested Weight: ${booking.requestedWeightKg} kg`, 20, yPosition);
    yPosition += lineHeight;
  }
  
  if (booking.requestedItemsCount) {
    doc.text(`Items: ${booking.requestedItemsCount}`, 20, yPosition);
    yPosition += lineHeight;
  }
  
  if (booking.length && booking.width && booking.height) {
    doc.text(`Dimensions: ${booking.length} x ${booking.width} x ${booking.height} cm`, 20, yPosition);
    yPosition += lineHeight;
  }
  
  if (booking.value) {
    doc.text(`Value: £${Number(booking.value).toFixed(2)}`, 20, yPosition);
    yPosition += lineHeight;
  }

  yPosition += 10;

  // Shipment Details
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .text('SHIPMENT DETAILS:', 20, yPosition);
  yPosition += 15;
  
  doc.fontSize(fontSize)
     .font('Helvetica')
     .text(`Mode: ${booking.shipmentSlot.mode}`, 20, yPosition);
  yPosition += lineHeight;

  // Footer
  const footerY = 400;
  doc.fontSize(smallFontSize)
     .font('Helvetica')
     .text(`Generated on Parcsal at ${new Date().toLocaleString()}`, 20, footerY, { align: 'center' });
}

