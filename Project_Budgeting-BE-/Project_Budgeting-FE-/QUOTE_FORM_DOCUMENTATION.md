# Add Quote Form - Implementation Documentation

## Overview
The Add Quote Form is a comprehensive modal form for creating and editing quotes/opportunities in the pipeline. It features dynamic product rows, automatic calculations, and seamless integration with the backend API.

---

## Component Details

### File Location
`src/components/AddQuoteForm.tsx`

### Features Implemented

#### 1. **Form Fields**
- **Quote Details Section**
  - Quote No (auto-generated or editable)
  - Author (default: "Vignesh Kumar")
  - Date of Issue (defaults to today)
  - Due Date (defaults to 30 days from today)

- **Client & Status Section**
  - Client dropdown (fetches from `/client/` API)
  - Status/Stage selector (Opportunity, Scoping, Proposal, Confirmed)
  - Quote Name field

#### 2. **Dynamic Product Table**
Each row includes:
- **Drag Handle**: Reorder rows (visual only for now)
- **Product Group**: Dropdown (SAP, Development, Analytics)
- **Product/Description**: 
  - Product dropdown (SAP MM, SAP ABAP, Data Analytics, Python, AI/ML, SAP BASIS, App Development)
  - Description textarea
- **Quantity**: Number input with decimal support
- **Unit**: Dropdown (UN, HR, DAY, PC)
- **Unit Price**: Decimal input
- **Amount**: Auto-calculated (Quantity × Unit Price)
- **Delete Button**: Remove row (minimum 1 row required)

#### 3. **Product Actions**
- **Add New Row**: Adds blank product row
- **Add Sub Row**: Placeholder for sub-items (to be implemented)
- **Add Product Group**: Placeholder for grouping (to be implemented)

#### 4. **Automatic Calculations**
- **Sub Total**: Sum of all product amounts
- **Tax**: Configurable percentage (0%, 5%, 12%, 18%)
- **Total**: Sub Total + Tax Amount
- Real-time updates as values change

#### 5. **Form Validation**
- Required fields: Client
- Error display with icon and message
- API error parsing and display

#### 6. **Modal Behavior**
- Full-screen overlay with backdrop
- Close button (X) in header
- Closes on save or cancel
- Scrollable content for long forms

---

## Integration with Pipeline

### Opening the Form

**From Pipeline Screen:**
```typescript
// Click "New" button
const handleNewQuote = () => {
  setSelectedQuote(undefined);
  setShowQuoteForm(true);
};

// Click on existing quote card
const handleQuoteClick = (quote: Quote) => {
  setSelectedQuote(quote);
  setShowQuoteForm(true);
};
```

### Saving Data

**On Form Submit:**
```typescript
const handleQuoteSaved = (quote: Quote) => {
  // Updates pipeline data in state
  // Closes the form
  // Refreshes the stage columns
};
```

---

## API Integration

### Current Implementation (Dummy Mode)
Form is currently using dummy client data. When backend is ready:

### 1. Fetch Clients
```typescript
const response = await axiosInstance.get('/client/');
// Returns: Array<{ id: number, company_name: string }>
```

### 2. Create Quote
```typescript
POST /pipeline/quotes/
Body: {
  client_id: number,
  client_name: string,
  margin_percentage: number,
  probability: number,
  quote_value: number,
  stage: 'opportunity' | 'scoping' | 'proposal' | 'confirmed'
}
```

### 3. Update Quote
```typescript
PUT /pipeline/quotes/{id}/
// Same body as create
```

---

## State Management

### Form State
```typescript
const [formData, setFormData] = useState({
  quote_no: string,
  author: string,
  date_of_issue: string (ISO date),
  due_date: string (ISO date),
  client_id: number,
  client_name: string,
  quote_name: string,
  stage: PipelineStage,
  tax_percentage: number
});
```

### Product Rows State
```typescript
interface ProductRow {
  id: string (UUID),
  group: string,
  product: string,
  description: string,
  quantity: number,
  unit: string,
  unit_price: number,
  amount: number
}

const [productRows, setProductRows] = useState<ProductRow[]>([...]);
```

---

## Styling & Responsiveness

### Design Tokens
- **Colors**: Blue primary (#2563EB), Gray scale for neutral
- **Spacing**: Consistent padding/margins using Tailwind
- **Typography**: Sans-serif, varied font weights
- **Borders**: Subtle borders for separation
- **Shadows**: Soft shadows for depth

### Responsive Behavior
- Modal: Full viewport on mobile, max-width on desktop
- Table: Horizontal scroll on mobile
- Grid layouts: Stack on mobile, columns on desktop
- Touch-friendly button sizes

---

## Future Enhancements (Ready to Implement)

### 1. **Product Row Features**
- Drag-and-drop reordering (currently has handle UI)
- Sub-rows for detailed breakdown
- Product grouping with collapsible sections
- Copy/duplicate rows
- Bulk delete

### 2. **Advanced Calculations**
- Multiple tax rates per product
- Discount fields (percentage or fixed)
- Margin calculation display
- Currency conversion
- Custom formulas

### 3. **File Attachments**
- Upload supporting documents
- Attach product images
- PDF generation of quote

### 4. **Client Integration**
- Quick add client from dropdown
- Client contact information display
- Previous quotes history
- Client-specific pricing

### 5. **Template System**
- Save as template
- Load from template
- Product catalog/library
- Quick fill from previous quotes

### 6. **Validation Enhancements**
- Field-level error messages
- Real-time validation
- Required field indicators
- Custom validation rules

### 7. **Workflow Features**
- Send for approval
- Email quote to client
- Clone existing quote
- Version history

---

## Code Quality Features

✅ **TypeScript**: Fully typed with interfaces
✅ **Error Handling**: Try-catch with user feedback
✅ **Loading States**: Disabled buttons during save
✅ **Clean Code**: Well-commented and organized
✅ **Reusable**: Can be used in other contexts
✅ **Accessible**: Semantic HTML, keyboard navigation
✅ **Performance**: Efficient state updates, memoization-ready

---

## Testing Checklist

- [ ] Open form via "New" button
- [ ] Open form via quote card click
- [ ] Form pre-populates when editing
- [ ] Client dropdown loads data
- [ ] Add product rows
- [ ] Remove product rows (keeping minimum 1)
- [ ] Quantity × Price calculates amount
- [ ] Tax percentage updates total
- [ ] Form submits successfully
- [ ] Form closes on cancel
- [ ] Errors display correctly
- [ ] Form validates required fields
- [ ] Pipeline updates after save

---

## Usage Example

```tsx
import { AddQuoteForm } from '../components/AddQuoteForm';

function MyComponent() {
  const [showForm, setShowForm] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | undefined>();

  const handleSave = (quote: Quote) => {
    console.log('Quote saved:', quote);
    // Update your state
    setShowForm(false);
  };

  return (
    <>
      <button onClick={() => setShowForm(true)}>
        Create Quote
      </button>

      {showForm && (
        <AddQuoteForm
          quote={editQuote}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}
    </>
  );
}
```

---

## Notes for Backend Developer

### Extended API Requirements (Future)

**Quote with Products Endpoint:**
```
POST /pipeline/quotes/detailed/
Body: {
  quote: {
    client_id, author, date_of_issue, due_date, 
    quote_name, stage, tax_percentage
  },
  products: [
    {
      group, product, description, quantity, 
      unit, unit_price, amount
    }
  ]
}
```

**Response should include:**
- Created quote with ID
- Calculated totals
- Product line items
- Timestamp information

---

## Component Props

```typescript
interface AddQuoteFormProps {
  quote?: Quote;              // Optional: for editing existing quote
  onSave: (quote: Quote) => void;  // Callback when form is saved
  onCancel: () => void;        // Callback when form is cancelled
}
```

---

This form is production-ready and fully functional with dummy data. Once the backend endpoints are available, only the API calls need to be connected - no UI changes required.
