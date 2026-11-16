import { describe, expect, it } from 'vitest';
import { addDays, startOfDay, subDays } from 'date-fns';
import { readFileSync } from 'node:fs';
import { orderDayBounds } from '../src/lib/orderDayBounds';

describe('tenant Orders date filter', () => {
  it('selects exactly one local calendar day with an exclusive next-day bound', () => {
    const selected = new Date(2026, 10, 15, 16, 46, 52);
    const { from, toExclusive } = orderDayBounds(selected);
    expect(new Date(from).getTime()).toBe(startOfDay(selected).getTime());
    expect(new Date(toExclusive).getTime()).toBe(addDays(startOfDay(selected), 1).getTime());
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(toExclusive).getHours()).toBe(0);
    expect(new Date(from).getTime()).toBeLessThan(new Date(toExclusive).getTime());
  });

  it('adjacent days have no overlap and preserve Somali local midnight', () => {
    const today = new Date(2026, 10, 16);
    const previous = orderDayBounds(subDays(today, 1));
    const current = orderDayBounds(today);
    expect(previous.toExclusive).toBe(current.from);
  });

  it('uses selected date limits for the Orders list and all four summary counts', () => {
    const view = readFileSync(new URL('../src/components/admin/simple/OrdersView.tsx', import.meta.url), 'utf8');
    expect(view).toContain('orderDayBounds(selectedDate)');
    expect(view.match(/\.gte\('created_at', dayStartIso\)\.lt\('created_at', dayEndIso\)/g)).toHaveLength(5);
    expect(view).not.toContain('todayIso');
    expect(view).toContain('setPage(0); setExpandedId(null);');
    expect(view).toContain('setFilter');
  });

  it('renders a calendar date button plus Today and Yesterday shortcuts', () => {
    const view = readFileSync(new URL('../src/components/admin/simple/OrdersView.tsx', import.meta.url), 'utf8');
    expect(view).toContain('<Popover open={calendarOpen}');
    expect(view).toContain('<Calendar');
    expect(view).toContain("setSelectedDate(startOfDay(date))");
    expect(view).toContain("disabled={{ after: new Date() }}");
    expect(view).toContain("'Maanta'");
    expect(view).toContain("'Shalay'");
    expect(view).toContain('ADMIN_PAGE_SIZE');
  });
});
