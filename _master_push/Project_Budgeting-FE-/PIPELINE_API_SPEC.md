# Pipeline API Documentation

## Overview
This document outlines the required API endpoints for the Pipeline/Opportunity management feature.

## Base URL
`/api/pipeline/`

---

## Endpoints

### 1. Get Pipeline Data (with all stages)
**Endpoint:** `GET /api/pipeline/`

**Description:** Fetches all pipeline data including statistics and quotes grouped by stage.

**Query Parameters:**
- `search` (optional): Search by client name
- `client_id` (optional): Filter by specific client
- `stage` (optional): Filter by stage (opportunity, scoping, proposal, confirmed)
- `min_value` (optional): Minimum quote value filter
- `max_value` (optional): Maximum quote value filter

**Response:**
```json
{
  "stats": {
    "total_quotes": 20,
    "average_quote": 36500.55,
    "total_sum": 2122000.00,
    "total_margin": 1072000.00
  },
  "stages": [
    {
      "stage": "opportunity",
      "title": "Opportunity",
      "count": 2,
      "total_sum": 57170.00,
      "quotes": [
        {
          "id": 1,
          "client_id": 1,
          "client_name": "Client A",
          "margin_percentage": 41.14,
          "probability": 20.00,
          "quote_value": 7170.00,
          "stage": "opportunity",
          "created_at": "2025-01-01T10:00:00Z",
          "updated_at": "2025-01-01T10:00:00Z"
        }
      ]
    },
    {
      "stage": "scoping",
      "title": "Scoping",
      "count": 4,
      "total_sum": 41520.00,
      "quotes": [...]
    },
    {
      "stage": "proposal",
      "title": "Proposal",
      "count": 1,
      "total_sum": 33170.00,
      "quotes": [...]
    },
    {
      "stage": "confirmed",
      "title": "Confirmed",
      "count": 4,
      "total_sum": 81170.00,
      "quotes": [...]
    }
  ]
}
```

---

### 2. Get Single Quote
**Endpoint:** `GET /api/pipeline/quotes/{id}/`

**Description:** Fetches details of a specific quote.

**Response:**
```json
{
  "id": 1,
  "client_id": 1,
  "client_name": "Client A",
  "margin_percentage": 41.14,
  "probability": 20.00,
  "quote_value": 7170.00,
  "stage": "opportunity",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-01T10:00:00Z"
}
```

---

### 3. Create New Quote
**Endpoint:** `POST /api/pipeline/quotes/`

**Description:** Creates a new quote/opportunity.

**Request Body:**
```json
{
  "client_id": 1,
  "client_name": "Client A",
  "margin_percentage": 41.14,
  "probability": 20.00,
  "quote_value": 7170.00,
  "stage": "opportunity"
}
```

**Response:** `201 Created`
```json
{
  "id": 12,
  "client_id": 1,
  "client_name": "Client A",
  "margin_percentage": 41.14,
  "probability": 20.00,
  "quote_value": 7170.00,
  "stage": "opportunity",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-01T10:00:00Z"
}
```

---

### 4. Update Quote
**Endpoint:** `PUT /api/pipeline/quotes/{id}/`

**Description:** Updates an existing quote.

**Request Body:**
```json
{
  "client_id": 1,
  "client_name": "Client A",
  "margin_percentage": 45.00,
  "probability": 30.00,
  "quote_value": 8500.00,
  "stage": "scoping"
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "client_id": 1,
  "client_name": "Client A",
  "margin_percentage": 45.00,
  "probability": 30.00,
  "quote_value": 8500.00,
  "stage": "scoping",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-05T14:30:00Z"
}
```

---

### 5. Update Quote Stage (Partial Update)
**Endpoint:** `PATCH /api/pipeline/quotes/{id}/stage/`

**Description:** Updates only the stage of a quote (for drag-and-drop functionality).

**Request Body:**
```json
{
  "stage": "proposal"
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "client_id": 1,
  "client_name": "Client A",
  "margin_percentage": 41.14,
  "probability": 20.00,
  "quote_value": 7170.00,
  "stage": "proposal",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-05T15:00:00Z"
}
```

---

### 6. Delete Quote
**Endpoint:** `DELETE /api/pipeline/quotes/{id}/`

**Description:** Deletes a quote.

**Response:** `204 No Content`

---

## Data Models

### Quote Model
```python
{
  "id": Integer (Primary Key),
  "client_id": Integer (Foreign Key to Client),
  "client_name": String (max 255 chars),
  "margin_percentage": Decimal (max 5 digits, 2 decimal places),
  "probability": Decimal (max 5 digits, 2 decimal places),
  "quote_value": Decimal (max 15 digits, 2 decimal places),
  "stage": String (choices: 'opportunity', 'scoping', 'proposal', 'confirmed'),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### Stage Enum
```python
STAGE_CHOICES = [
    ('opportunity', 'Opportunity'),
    ('scoping', 'Scoping'),
    ('proposal', 'Proposal'),
    ('confirmed', 'Confirmed'),
]
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid data provided",
  "details": {
    "quote_value": ["This field is required"],
    "stage": ["Invalid choice"]
  }
}
```

### 404 Not Found
```json
{
  "error": "Quote not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "An unexpected error occurred"
}
```

---

## Notes for Backend Developer

1. **CORS Configuration**: Ensure the pipeline endpoints are included in CORS allowed origins with credentials enabled.

2. **Authentication**: All endpoints should require authentication (JWT token in Authorization header).

3. **Permissions**: Consider implementing role-based permissions (admin, manager, user) for quote operations.

4. **Validation**: 
   - Ensure `margin_percentage` and `probability` are between 0 and 100
   - Ensure `quote_value` is positive
   - Validate `stage` is one of the allowed choices

5. **Statistics Calculation**: 
   - `total_quotes`: Count all quotes
   - `average_quote`: Sum of all quote values / total quotes
   - `total_sum`: Sum of all quote values
   - `total_margin`: Sum of (quote_value * margin_percentage / 100)

6. **Performance**: Consider adding database indexes on:
   - `client_id`
   - `stage`
   - `created_at`

7. **Future Enhancements**:
   - Add pagination for large datasets
   - Add sorting options (by value, date, client name)
   - Add bulk operations (move multiple quotes to different stage)
   - Add quote history/audit trail
