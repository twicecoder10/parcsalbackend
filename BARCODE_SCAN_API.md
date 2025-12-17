# Barcode Scanning API

## Overview

Companies can scan barcodes from shipping labels to quickly retrieve booking information. The barcode contains the booking ID, which is used to fetch the full booking details.

## Endpoint

**POST** `/bookings/scan`  
**Alternative:** `POST /bookings/company/scan`

**Authentication:** Required (Company Admin/Staff)

## Request

```http
POST /bookings/scan
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "barcode": "BKG-2025-0000007"
}
```

**Request Body:**
```json
{
  "barcode": "string" // The booking ID scanned from the barcode
}
```

## Response

### Success (200 OK)

```json
{
  "status": "success",
  "message": "Barcode scanned successfully",
  "data": {
    "id": "BKG-2025-0000007",
    "status": "ACCEPTED",
    "customer": {
      "id": "uuid",
      "email": "customer@example.com",
      "fullName": "John Doe"
    },
    "shipmentSlot": {
      "id": "uuid",
      "originCity": "London",
      "destinationCity": "Manchester",
      "mode": "VAN"
    },
    "parcelType": "PACKAGE",
    "weight": 5.5,
    "pickupAddress": "123 Main St",
    "deliveryAddress": "456 Oak Ave",
    // ... full booking object
  }
}
```

### Error Responses

**400 Bad Request - Invalid Barcode**
```json
{
  "status": "error",
  "message": "Invalid barcode: empty or invalid format"
}
```

**403 Forbidden - Booking Not Yours**
```json
{
  "status": "error",
  "message": "This booking does not belong to your company"
}
```

**404 Not Found - Booking Not Found**
```json
{
  "status": "error",
  "message": "Booking not found. Please check the barcode and try again."
}
```

## Frontend Integration

### React/TypeScript Example

```typescript
const scanBarcode = async (barcodeValue: string) => {
  try {
    const response = await fetch('/api/bookings/scan', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ barcode: barcodeValue })
    });

    const data = await response.json();
    
    if (data.status === 'success') {
      // Navigate to booking details or show booking info
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Barcode scan failed:', error);
    throw error;
  }
};

// Usage with barcode scanner library
const handleBarcodeScanned = (barcode: string) => {
  scanBarcode(barcode)
    .then(booking => {
      // Show booking details
      setScannedBooking(booking);
    })
    .catch(error => {
      // Show error message
      showError(error.message);
    });
};
```

### Using HTML5 Barcode Scanner

```typescript
import { Html5Qrcode } from 'html5-qrcode';

const startBarcodeScanner = () => {
  const html5QrCode = new Html5Qrcode("scanner-container");
  
  html5QrCode.start(
    { facingMode: "environment" }, // Use back camera
    {
      fps: 10,
      qrbox: { width: 250, height: 250 }
    },
    (decodedText) => {
      // Barcode scanned
      handleBarcodeScanned(decodedText);
      html5QrCode.stop(); // Stop after successful scan
    },
    (errorMessage) => {
      // Ignore scan errors
    }
  );
};
```

### Using react-qr-reader or similar

```typescript
import QrReader from 'react-qr-reader';

<QrReader
  delay={300}
  onError={(error) => console.error(error)}
  onScan={(data) => {
    if (data) {
      scanBarcode(data);
    }
  }}
  style={{ width: '100%' }}
/>
```

## Barcode Format

The barcode is a **Code128** barcode that encodes the booking ID directly. Examples:
- `BKG-2025-0000007`
- `BKG-2025-0000123`

The booking ID format follows the pattern: `BKG-YYYY-XXXXXXX`

## Use Cases

1. **Warehouse Operations**: Scan labels when receiving packages
2. **Pickup Verification**: Scan to verify correct package before pickup
3. **Delivery Confirmation**: Scan to confirm delivery
4. **Inventory Management**: Quick lookup of booking details
5. **Status Updates**: Scan and update booking status

## Security

- Only company admins/staff can scan barcodes
- Bookings are filtered by company (users can only scan their own company's bookings)
- Invalid or non-existent booking IDs return appropriate errors
- All requests require authentication

## Error Handling

### Common Scenarios

1. **Invalid Barcode Format**
   - Check if barcode scanner is reading correctly
   - Verify barcode is not damaged
   - Try manual entry as fallback

2. **Booking Not Found**
   - Booking may have been deleted
   - Barcode may be from a different system
   - Verify booking ID format

3. **Wrong Company**
   - Booking belongs to a different company
   - User may have scanned wrong label
   - Check company association

## Testing

### Manual Test with cURL

```bash
# Login first
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"company@example.com","password":"password"}' \
  | jq -r '.data.accessToken')

# Scan barcode
curl -X POST http://localhost:4000/bookings/scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"BKG-2025-0000007"}' | jq
```

## Notes

- The barcode contains the booking ID in plain text (Code128 format)
- Scanning is instant - no need to wait for processing
- The endpoint returns the full booking object with all relations
- Can be used for quick booking lookup without navigating through lists
- Works with any Code128-compatible barcode scanner

