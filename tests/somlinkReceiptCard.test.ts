import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  formatSomlinkResponse, parseSomlinkReceipt, somlinkReceiptState,
} from '../src/lib/somlinkReceipt';

describe('Simple Somlink result in the original SMS response box', () => {
  const example = '{"code":200,"message":"DATA_PAID_SUCCESSFULLY","paid_amount":0.25,"data_phone":"252640000045","balance":77.25,"payment_ref":"1080946"}';

  it('converts the real successful API response into a short, readable Somali message', () => {
    expect(formatSomlinkResponse(example, 'completed', '64-000-0045', true, true)).toBe(
      'Xirmada si guul leh ayaa loogu diray 64-000-0045. Somlink waxay jartay $0.25. Haraaga: $77.25. Tixraaca: 1080946.',
    );
  });

  it('does not expose wallet balance or charges to an admin without financial permission', () => {
    const result = formatSomlinkResponse(example, 'completed', '64-000-0045', false, true);
    expect(result).toBe('Xirmada si guul leh ayaa loogu diray 64-000-0045. Tixraaca: 1080946.');
    expect(result).not.toContain('77.25');
    expect(result).not.toContain('0.25');
  });

  it('preserves clear failed and pending messages and never labels them a success', () => {
    const failed = formatSomlinkResponse('{"code":400,"message":"INVALID_AMOUNT"}', 'failed', '64-000-0045', true, true);
    expect(failed).toBe('Dirista xirmada way fashilantay. INVALID AMOUNT');
    expect(formatSomlinkResponse(example, 'processing', '64-000-0045', true, true)).toContain('wali ma xaqiijin');
    expect(formatSomlinkResponse('{"code":400,"message":"INVALID_AMOUNT"}', 'completed', '64-000-0045', true, true))
      .toContain('isma waafaqaan');
    expect(somlinkReceiptState('failed', parseSomlinkReceipt(example)!)).toBe('failed');
  });

  it('handles empty or malformed API content without showing raw JSON', () => {
    expect(formatSomlinkResponse(null, 'processing', '64-000-0045', true, true)).toContain('lama helin');
    expect(formatSomlinkResponse('not json', 'failed', '64-000-0045', true, true)).toContain('way fashilantay');
    expect(formatSomlinkResponse('{"hello":"world"}', 'completed', '64-000-0045', true, true)).not.toContain('hello');
  });

  it('keeps the exact old result box, USSD header and status badge without the receipt cards', () => {
    const view = readFileSync(new URL('../src/components/admin/simple/OrdersView.tsx', import.meta.url), 'utf8');
    expect(view).toContain('📩 SMS ({order.deliveries.length})');
    expect(view).toContain('USSD: {dq.ussd_code}');
    expect(view).toContain('formatSomlinkResponse(');
    expect(view).toContain('dq.ussd_code?.startsWith(\'API:SOMLINK:\')');
    expect(view).toContain('dq.provider_response ? ('); // other providers unchanged
    expect(view).not.toContain('SomlinkReceiptCard');
    expect(view).not.toContain('Natiijooyinka dirista');
  });
});
