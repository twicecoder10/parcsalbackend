# Reviews API Documentation

This document provides sample requests and responses for the Reviews API endpoints.

## Base URL
All endpoints are relative to your API base URL.

## Authentication
Most endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

---

## 1. Create Review

Create a review for a booking (only for REJECTED, CANCELLED, or DELIVERED bookings).

**Endpoint:** `POST /customer/bookings/:bookingId/reviews`

**Authentication:** Required (Customer only)

**Request:**
```http
POST /customer/bookings/BOOK123456/reviews
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "rating": 5,
  "comment": "Excellent service! Package arrived on time and in perfect condition."
}
```

**Request Body:**
```json
{
  "rating": 5,  // Required: Integer between 1-5
  "comment": "Excellent service! Package arrived on time and in perfect condition."  // Optional: String, max 1000 characters
}
```

**Success Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "bookingId": "BOOK123456",
  "companyId": "comp-123",
  "customerId": "user-456",
  "rating": 5,
  "comment": "Excellent service! Package arrived on time and in perfect condition.",
  "createdAt": "2025-12-05T17:30:00.000Z",
  "updatedAt": "2025-12-05T17:30:00.000Z",
  "booking": {
    "id": "BOOK123456",
    "shipmentSlot": {
      "id": "slot-789",
      "originCity": "London",
      "destinationCity": "Manchester"
    }
  },
  "company": {
    "id": "comp-123",
    "name": "FastShip Logistics",
    "slug": "fastship-logistics",
    "logoUrl": "https://example.com/logo.png"
  },
  "customer": {
    "id": "user-456",
    "fullName": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**

**400 Bad Request - Booking status not allowed:**
```json
{
  "error": "Reviews can only be created for bookings with status: REJECTED, CANCELLED, DELIVERED"
}
```

**400 Bad Request - Review already exists:**
```json
{
  "error": "A review already exists for this booking"
}
```

**403 Forbidden - Not customer's booking:**
```json
{
  "error": "You can only review your own bookings"
}
```

**404 Not Found - Booking not found:**
```json
{
  "error": "Booking not found"
}
```

**400 Bad Request - Validation error:**
```json
{
  "error": "Rating must be at least 1"
}
```

---

## 2. Update Review

Update an existing review.

**Endpoint:** `PUT /customer/bookings/:bookingId/reviews`

**Authentication:** Required (Customer only)

**Request:**
```http
PUT /customer/bookings/BOOK123456/reviews
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "rating": 4,
  "comment": "Updated: Good service overall, but delivery was slightly delayed."
}
```

**Request Body:**
```json
{
  "rating": 4,  // Optional: Integer between 1-5
  "comment": "Updated: Good service overall, but delivery was slightly delayed."  // Optional: String, max 1000 characters, can be null
}
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "bookingId": "BOOK123456",
  "companyId": "comp-123",
  "customerId": "user-456",
  "rating": 4,
  "comment": "Updated: Good service overall, but delivery was slightly delayed.",
  "createdAt": "2025-12-05T17:30:00.000Z",
  "updatedAt": "2025-12-05T17:35:00.000Z",
  "booking": {
    "id": "BOOK123456",
    "shipmentSlot": {
      "id": "slot-789",
      "originCity": "London",
      "destinationCity": "Manchester"
    }
  },
  "company": {
    "id": "comp-123",
    "name": "FastShip Logistics",
    "slug": "fastship-logistics",
    "logoUrl": "https://example.com/logo.png"
  },
  "customer": {
    "id": "user-456",
    "fullName": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Review not found"
}
```

**403 Forbidden:**
```json
{
  "error": "You can only update your own reviews"
}
```

---

## 3. Delete Review

Delete a review.

**Endpoint:** `DELETE /customer/bookings/:bookingId/reviews`

**Authentication:** Required (Customer only)

**Request:**
```http
DELETE /customer/bookings/BOOK123456/reviews
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200 OK):**
```json
{
  "message": "Review deleted successfully"
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Review not found"
}
```

**403 Forbidden:**
```json
{
  "error": "You can only delete your own reviews"
}
```

---

## 4. Get My Reviews

Get all reviews created by the authenticated customer.

**Endpoint:** `GET /customer/reviews`

**Authentication:** Required (Customer only)

**Query Parameters:**
- `limit` (optional): Number of items per page (default: 10)
- `offset` (optional): Number of items to skip (default: 0)

**Request:**
```http
GET /customer/reviews?limit=10&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200 OK):**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "bookingId": "BOOK123456",
      "companyId": "comp-123",
      "customerId": "user-456",
      "rating": 5,
      "comment": "Excellent service!",
      "createdAt": "2025-12-05T17:30:00.000Z",
      "updatedAt": "2025-12-05T17:30:00.000Z",
      "booking": {
        "id": "BOOK123456",
        "shipmentSlot": {
          "id": "slot-789",
          "originCity": "London",
          "destinationCity": "Manchester"
        }
      },
      "company": {
        "id": "comp-123",
        "name": "FastShip Logistics",
        "slug": "fastship-logistics",
        "logoUrl": "https://example.com/logo.png"
      }
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "bookingId": "BOOK123457",
      "companyId": "comp-124",
      "customerId": "user-456",
      "rating": 4,
      "comment": "Good service",
      "companyReply": null,
      "createdAt": "2025-12-04T10:20:00.000Z",
      "updatedAt": "2025-12-04T10:20:00.000Z",
      "booking": {
        "id": "BOOK123457",
        "shipmentSlot": {
          "id": "slot-790",
          "originCity": "Birmingham",
          "destinationCity": "Leeds"
        }
      },
      "company": {
        "id": "comp-124",
        "name": "QuickDeliver Co",
        "slug": "quickdeliver-co",
        "logoUrl": "https://example.com/logo2.png"
      }
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 2,
    "hasMore": false
  }
}
```

---

## 5. Get Review by Booking ID

Get a specific review by booking ID (public endpoint).

**Endpoint:** `GET /bookings/:bookingId/reviews`

**Authentication:** Not required

**Request:**
```http
GET /bookings/BOOK123456/reviews
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "bookingId": "BOOK123456",
  "companyId": "comp-123",
  "customerId": "user-456",
  "rating": 5,
  "comment": "Excellent service! Package arrived on time and in perfect condition.",
  "companyReply": null,
  "createdAt": "2025-12-05T17:30:00.000Z",
  "updatedAt": "2025-12-05T17:30:00.000Z",
  "booking": {
    "id": "BOOK123456",
    "shipmentSlot": {
      "id": "slot-789",
      "originCity": "London",
      "destinationCity": "Manchester"
    }
  },
  "company": {
    "id": "comp-123",
    "name": "FastShip Logistics",
    "slug": "fastship-logistics",
    "logoUrl": "https://example.com/logo.png"
  },
  "customer": {
    "id": "user-456",
    "fullName": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "error": "Review not found"
}
```

---

## 6. Get Company Reviews

Get all reviews for a specific company (public endpoint).

**Endpoint:** `GET /companies/:companyId/reviews`

**Authentication:** Not required

**Query Parameters:**
- `limit` (optional): Number of items per page (default: 10)
- `offset` (optional): Number of items to skip (default: 0)
- `rating` (optional): Filter by rating (1-5)

**Request:**
```http
GET /companies/comp-123/reviews?limit=10&offset=0&rating=5
```

**Success Response (200 OK):**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "bookingId": "BOOK123456",
      "companyId": "comp-123",
      "customerId": "user-456",
      "rating": 5,
      "comment": "Excellent service!",
      "companyReply": "Thank you for your kind words!",
      "createdAt": "2025-12-05T17:30:00.000Z",
      "updatedAt": "2025-12-05T18:00:00.000Z",
      "booking": {
        "id": "BOOK123456",
        "shipmentSlot": {
          "id": "slot-789",
          "originCity": "London",
          "destinationCity": "Manchester"
        }
      },
      "customer": {
        "id": "user-456",
        "fullName": "John Doe",
        "email": "john@example.com"
      }
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440002",
      "bookingId": "BOOK123458",
      "companyId": "comp-123",
      "customerId": "user-457",
      "rating": 5,
      "comment": "Fast and reliable!",
      "companyReply": null,
      "createdAt": "2025-12-04T15:20:00.000Z",
      "updatedAt": "2025-12-04T15:20:00.000Z",
      "booking": {
        "id": "BOOK123458",
        "shipmentSlot": {
          "id": "slot-791",
          "originCity": "Birmingham",
          "destinationCity": "Liverpool"
        }
      },
      "customer": {
        "id": "user-457",
        "fullName": "Jane Smith",
        "email": "jane@example.com"
      }
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 2,
    "hasMore": false
  }
}
```

**Request without rating filter:**
```http
GET /companies/comp-123/reviews?limit=10&offset=0
```

---

## 7. Get Company Review Statistics

Get review statistics for a company (average rating and review count).

**Endpoint:** `GET /companies/:companyId/reviews/stats`

**Authentication:** Not required

**Request:**
```http
GET /companies/comp-123/reviews/stats
```

**Success Response (200 OK):**
```json
{
  "averageRating": 4.5,
  "reviewCount": 25
}
```

**Response when no reviews exist:**
```json
{
  "averageRating": null,
  "reviewCount": 0
}
```

---

## 8. Reply to Review (Company)

Reply to a customer review. Companies can create or update their reply to a review.

**Endpoint:** `POST /companies/bookings/:bookingId/reviews/reply` or `PUT /companies/bookings/:bookingId/reviews/reply`

**Authentication:** Required (Company Admin or Company Staff only)

**Request:**
```http
POST /companies/bookings/BOOK123456/reviews/reply
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "reply": "Thank you for your feedback! We're glad to hear you had a positive experience with our service."
}
```

**Request Body:**
```json
{
  "reply": "Thank you for your feedback! We're glad to hear you had a positive experience with our service."  // Required: String, 1-1000 characters
}
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "bookingId": "BOOK123456",
  "companyId": "comp-123",
  "customerId": "user-456",
  "rating": 5,
  "comment": "Excellent service! Package arrived on time and in perfect condition.",
  "companyReply": "Thank you for your feedback! We're glad to hear you had a positive experience with our service.",
  "createdAt": "2025-12-05T17:30:00.000Z",
  "updatedAt": "2025-12-05T18:00:00.000Z",
  "booking": {
    "id": "BOOK123456",
    "shipmentSlot": {
      "id": "slot-789",
      "originCity": "London",
      "destinationCity": "Manchester"
    }
  },
  "company": {
    "id": "comp-123",
    "name": "FastShip Logistics",
    "slug": "fastship-logistics",
    "logoUrl": "https://example.com/logo.png"
  },
  "customer": {
    "id": "user-456",
    "fullName": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**

**400 Bad Request - Validation error:**
```json
{
  "error": "Reply cannot be empty"
}
```

**400 Bad Request - Reply too long:**
```json
{
  "error": "Reply must be at most 1000 characters"
}
```

**404 Not Found - Review not found:**
```json
{
  "error": "Review not found"
}
```

**403 Forbidden - Not company's review:**
```json
{
  "error": "You can only reply to reviews for your own company"
}
```

**403 Forbidden - Not a company user:**
```json
{
  "error": "Only company users can reply to reviews"
}
```

**Note:** Use `POST` to create a new reply or `PUT` to update an existing reply. Both methods work the same way.

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400 Bad Request` - Validation error or business rule violation
- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User doesn't have permission to perform the action
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## Business Rules

1. **Review Eligibility:**
   - Reviews can only be created for bookings with status: `REJECTED`, `CANCELLED`, or `DELIVERED`
   - Only one review per booking is allowed

2. **Customer Restrictions:**
   - Only customers can create, update, or delete reviews
   - Customers can only review their own bookings

3. **Rating:**
   - Rating must be an integer between 1 and 5 (inclusive)

4. **Comment:**
   - Comment is optional
   - Maximum length: 1000 characters

5. **Company Reply:**
   - Only company users (COMPANY_ADMIN or COMPANY_STAFF) can reply to reviews
   - Companies can only reply to reviews for their own company
   - Reply is optional and can be added or updated at any time
   - Maximum length: 1000 characters
   - Use `POST` or `PUT` to create/update a reply

---

## Example Frontend Integration

### React/TypeScript Example

```typescript
// Create a review
const createReview = async (bookingId: string, rating: number, comment?: string) => {
  const response = await fetch(`${API_BASE_URL}/customer/bookings/${bookingId}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      rating,
      comment: comment || null
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }
  
  return response.json();
};

// Get company reviews
const getCompanyReviews = async (companyId: string, limit = 10, offset = 0, rating?: number) => {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    ...(rating && { rating: rating.toString() })
  });
  
  const response = await fetch(`${API_BASE_URL}/companies/${companyId}/reviews?${params}`);
  return response.json();
};

// Get company review stats
const getCompanyReviewStats = async (companyId: string) => {
  const response = await fetch(`${API_BASE_URL}/companies/${companyId}/reviews/stats`);
  return response.json();
};

// Reply to a review (Company)
const replyToReview = async (bookingId: string, reply: string, token: string) => {
  const response = await fetch(`${API_BASE_URL}/companies/bookings/${bookingId}/reviews/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ reply })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }
  
  return response.json();
};

// Update a review reply (Company)
const updateReviewReply = async (bookingId: string, reply: string, token: string) => {
  const response = await fetch(`${API_BASE_URL}/companies/bookings/${bookingId}/reviews/reply`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ reply })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }
  
  return response.json();
};
```

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- Booking IDs follow the format: `BOOK` followed by alphanumeric characters
- Company IDs are UUIDs
- Pagination uses `limit` and `offset` parameters
- Reviews are ordered by creation date (newest first)

