# Arabic Printer Code Table Debugging

## Overview

When printing Arabic text on thermal printers, different printers support different character encoding tables (code pages). This debug feature helps you identify which code table works best with your specific printer model.

## Problem

Arabic text may appear as gibberish or incorrect characters on thermal printer receipts because the wrong character encoding table is being used. Different printer models and firmware versions support different code tables.

## Solution

Use the "Debug Arabic" feature to test all available code tables and visually inspect which one renders Arabic text correctly.

## How to Use

### Via Admin Panel (Recommended)

1. Navigate to **Admin Panel → Integrations → Printer**
2. Ensure printer integration is **enabled**
3. Ensure **PC Agent is connected**
4. Click the **"Debug Arabic"** button
5. Your printer will print multiple test receipts, each using a different code table
6. **Visually inspect** each receipt to find which code table displays Arabic correctly
7. Note the code table number (e.g., `0x16`, `0x22`, `0x2F`, `0x52`)
8. Update the code in `printer.integration.ts` to use that code table

### Via API

```bash
POST /api/integrations/printer/test-code-tables
Authorization: Bearer <your-token>
```

## Test Code Tables

The debug test will print receipts using these code tables:

| Code | Hex  | Name                    | Description                 |
|------|------|-------------------------|-----------------------------|
| 0    | 0x00 | PC437                   | Standard (baseline test)    |
| 2    | 0x02 | PC850                   | Multilingual               |
| 22   | 0x16 | WPC1252                 | Windows-1252               |
| 33   | 0x21 | PC862                   | Hebrew (similar to Arabic) |
| 34   | 0x22 | PC864                   | Arabic (most common) ✓     |
| 38   | 0x26 | PC1098                  | Farsi/Persian              |
| 47   | 0x2F | WPC1256                 | Windows Arabic (standard) ✓|
| 82   | 0x52 | PC1001                  | Arabic/Farsi alternative   |

## Expected Output

Each test receipt will show:

```
======================
Code: 0x16
WPC1252 (Windows-1252)
======================

Arabic Test:
طباعة تجريبية

English Test:
Test Print
```

## How to Identify the Correct Code Table

1. **Compare the receipts** side by side
2. Look for the receipt where **Arabic text is clear and readable**
3. The correct code table will show proper Arabic letters (ط ب ا ع ة)
4. Wrong code tables will show:
   - Random symbols/gibberish
   - Question marks (???)
   - Boxes/squares (□□□)
   - Latin letters

## Updating the Code

Once you identify the correct code table:

1. Open `backend/src/integrations/printer.integration.ts`
2. Find the `buildReceiptCommands` method (around line 110)
3. Update the code table selection:

```typescript
if (isArabic) {
  // Change 0x16 to your correct code table (e.g., 0x22, 0x2F, 0x52)
  commands.push(0x1b, 0x74, 0x16); // ESC t - Select character code table
}
```

4. Rebuild the backend:

```bash
cd backend
npm run build
```

5. Restart the backend
6. Test with the regular "Test Print" button

## Common Results by Printer Model

Based on ESC/POS thermal printers:

- **XPrinter XP-58**: Usually `0x22` (PC864) or `0x2F` (WPC1256)
- **Epson TM series**: Usually `0x2F` (WPC1256)
- **Star TSP series**: Usually `0x22` (PC864)
- **Generic 58mm/80mm**: Try `0x22` first, then `0x2F`

## Troubleshooting

### No Receipts Printed

- Ensure PC Agent is running and connected
- Check printer is powered on and has paper
- Verify printer integration is enabled
- Check backend logs for errors

### All Receipts Show Gibberish

- Your printer may not support Arabic fonts
- Try updating printer firmware
- Some very old printers may not support non-Latin characters

### PC Agent Not Connected Error

```bash
# Check PC Agent status
cd pc-agent
npm start

# Verify connection in backend logs
```

## Technical Details

### ESC/POS Code Table Command

```
ESC t n
0x1B 0x74 [code]
```

Where `[code]` is the code table number (0x00 to 0xFF).

### Arabic Encoding Standards

- **PC864**: DOS/OEM Arabic (legacy, widely supported)
- **Windows-1256**: Windows Arabic (modern standard)
- **PC1001**: Arabic/Farsi alternative
- **UTF-8**: Not directly supported by ESC/POS (requires printer preprocessing)

## Notes

- This debug feature is **safe** and only prints test receipts
- Each test receipt uses ~5cm of paper
- Total test will use approximately 40cm of paper (8 receipts)
- The test takes about 10-15 seconds to complete
- Results are immediate and visual

## References

- [ESC/POS Command Reference](https://reference.epson-biz.com/modules/ref_escpos/index.php)
- [Code Page List](https://en.wikipedia.org/wiki/Code_page)
- [Windows-1256 (Arabic)](https://en.wikipedia.org/wiki/Windows-1256)

