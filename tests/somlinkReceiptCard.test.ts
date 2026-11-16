import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSomlinkReceipt, somlinkMoney, somlinkReceiptState } from '../src/lib/somlinkReceipt';

describe('Somlink merchant-friendly API receipt', () => {
  const example = '{"code":200,"message":"DATA_PAID_SUCCESSFULLY","paid_amount":0.25,"data_phone":"252640000045","balance":77.25,"payment_ref":"1080946"}';

  it('extracts the actual confirmed Somlink API fields without losing decimals', () => {
    const receipt = parseSomlinkReceipt(example);
    expect(receipt).toEqual({
      code: 200,
      message: 'DATA_PAID_SUCCESSFULLY',
      dataPhone: '252640000045',
      paidAmount: 0.25,
      balance: 77.25,
      paymentRef: '1080946',
    });
    expect(somlinkMoney(receipt!.paidAmount!)).toBe('$0.25');
    expect(somlinkMoney(receipt!.balance!)).toBe('$77.25');
  });

  it('does not pretend that malformed, unrelated, or absent raw text is a parsed API receipt', () => {
    expect(parseSomlinkReceipt(null)).toBeNull();
    expect(parseSomlinkReceipt('')).toBeNull();
    expect(parseSomlinkReceipt('Mustaf, qiimaha aad gelisay ma jiro')).toBeNull();
    expect(parseSomlinkReceipt('{"hello":"world"}')).toBeNull();
    expect(parseSomlinkReceipt('[{"code":200}]')).toBeNull();
    expect(parseSomlinkReceipt('{"paid_amount":"", "balance":"not a number"}')).toMatchObject({
      paidAmount: null,
      balance: null,
    });
  });

  it('always respects recorded queue status; HTTP code 200 does not independently mean delivered', () => {
    const receipt = parseSomlinkReceipt(example)!;
    expect(somlinkReceiptState('completed', receipt)).toBe('success');
    expect(somlinkReceiptState('processing', receipt)).toBe('pending');
    expect(somlinkReceiptState('pending', receipt)).toBe('pending');
    expect(somlinkReceiptState('failed', receipt)).toBe('failed');
    expect(somlinkReceiptState('timeout', receipt)).toBe('failed');
    expect(somlinkReceiptState('completed', parseSomlinkReceipt('{"code":400,"message":"INVALID_AMOUNT"}')!)).toBe('inconsistent');
  });

  it('uses a clean receipt for Somlink while preserving raw responses from other networks', () => {
    const view = readFileSync(new URL('../src/components/admin/simple/OrdersView.tsx', import.meta.url), 'utf8');
    const card = readFileSync(new URL('../src/components/admin/simple/SomlinkReceiptCard.tsx', import.meta.url), 'utf8');
    expect(view).toContain("dq.ussd_code?.startsWith('API:SOMLINK:')");
    expect(view).toContain('<SomlinkReceiptCard');
    expect(view).toContain('canViewFinancial={can(\'view_profit\')}');
    expect(view).toContain('dq.provider_response ? ('); // non-Somlink SMSs unchanged
    expect(card).toContain('receipt?.paymentRef');
    expect(card).toContain('receipt?.dataPhone');
    expect(card).toContain('receipt?.paidAmount');
    expect(card).toContain('receipt?.balance');
    expect(card).toContain('priceDifference');
    expect(card).toContain('<details');
    expect(card).toContain('canViewFinancial ? (');
  });
});
