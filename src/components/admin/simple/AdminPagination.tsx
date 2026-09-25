import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  page: number;
  pageSize?: number;
  total: number;
  onPageChange: (page: number) => void;
  isSo?: boolean;
};

export function AdminPagination({ page, pageSize = 50, total, onPageChange, isSo = true }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-3">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={page <= 0}
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
        {isSo ? 'Hore' : 'Previous'}
      </button>
      <span className="text-xs text-muted-foreground">
        {isSo ? 'Bog' : 'Page'} {page + 1} / {totalPages} · {total.toLocaleString()}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
      >
        {isSo ? 'Xiga' : 'Next'}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export const ADMIN_PAGE_SIZE = 50;
