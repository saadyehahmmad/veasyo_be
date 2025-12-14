# Integrations Module

This module handles external integrations for the waiter system, including:
- **Printer Integration**: XPrinter network thermal printers (same as POS systems)
- **Speaker Integration**: Network-based speakers for audio alerts
- **Webhook Integration**: Real-time notifications to external systems

## Database Setup

### Migration

Run the migration to ensure proper database setup:

```bash
npm run db:migrate -- ensure_integrations_support
```

This migration:
- Ensures the `settings` JSONB column exists with proper defaults
- Adds a GIN index on `settings` for better query performance
- Adds documentation comments

### Verification

Verify the integrations setup:

```bash
npm run db:verify-integrations
```

## API Endpoints

### Printer Integration

- `GET /api/integrations/printer` - Get printer settings
- `PUT /api/integrations/printer` - Update printer settings
- `POST /api/integrations/printer/test` - Test printer connection

### Speaker Integration

- `GET /api/integrations/speaker` - Get speaker settings
- `PUT /api/integrations/speaker` - Update speaker settings
- `POST /api/integrations/speaker/test` - Test speaker connection

### Webhook Integration

- `GET /api/integrations/webhook` - Get webhook settings
- `PUT /api/integrations/webhook` - Update webhook settings

## Configuration

All integration settings are stored in the `tenants.settings` JSONB field under the `integrations` key:

```json
{
  "integrations": {
    "printer": {
      "enabled": true,
      "printerIp": "192.168.1.100",
      "printerPort": 9100,
      "printerName": "Kitchen Printer",
      "paperWidth": 80,
      "autoPrint": true,
      "printHeader": true,
      "printFooter": true
    },
    "speaker": {
      "enabled": true,
      "speakerIp": "192.168.1.101",
      "speakerPort": 8080,
      "volume": 80,
      "duration": 5,
      "soundType": "beep",
      "customSoundUrl": null
    },
    "webhook": {
      "enabled": true,
      "webhookUrl": "https://api.example.com/webhook",
      "secretKey": "your-secret-key",
      "events": {
        "newRequest": true,
        "requestAcknowledged": true,
        "requestCompleted": true,
        "requestCancelled": false
      },
      "retryAttempts": 3,
      "timeout": 5000
    }
  }
}
```

## Printer Integration

### XPrinter Network Printer

The printer integration supports XPrinter network thermal printers (same as POS systems).

**Features:**
- Network-based printing via TCP/IP (port 9100 default)
- ESC/POS command generation
- Automatic printing on new requests (if enabled)
- Configurable paper width (58mm or 80mm)
- Optional header and footer

**Receipt Format:**
- Restaurant name and address (if header enabled)
- Order information (table number, time, request type)
- Custom notes
- Timestamp footer (if footer enabled)

## Speaker Integration

### Network Speaker

The speaker integration supports network-based speakers for audio alerts.

**Features:**
- Network-based communication via TCP/IP
- Multiple sound types: beep, alert, custom
- Configurable volume (0-100) and duration (1-60 seconds)
- Custom sound URL support

**Sound Types:**
- `beep`: Simple beep sound
- `alert`: Alert tone
- `custom`: Custom sound from URL

## Automatic Triggers

When a new service request is created:

1. **Printer**: Automatically prints receipt if `autoPrint` is enabled
2. **Speaker**: Triggers audio alert if speaker is enabled
3. **Webhook**: Sends webhook notification if enabled and event is selected

All integrations run asynchronously and don't block the request flow.

## Error Handling

- Integration failures are logged but don't break the request flow
- Test endpoints allow verification before enabling auto-triggers
- Connection timeouts are handled gracefully

## Testing

Use the test endpoints to verify your integration setup:

```bash
# Test printer
POST /api/integrations/printer/test

# Test speaker
POST /api/integrations/speaker/test
```

## Files Structure

```
backend/src/
├── integrations/
│   ├── printer.integration.ts    # Printer integration logic
│   ├── speaker.integration.ts    # Speaker integration logic
│   └── README.md                 # This file
├── services/
│   └── integration.service.ts    # Integration settings management
└── routes/
    └── integrations.routes.ts    # API routes for integrations
```

