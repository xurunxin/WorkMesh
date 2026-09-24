'use client'

import { classNames } from '../internal/utils.js'

export type PaginationProps = {
  ariaLabel?: string
  onPageChange: (page: number) => void
  page: number
  pageCount: number
  siblingCount?: number
}

export type PaginationSlot = number | 'ellipsis-before' | 'ellipsis-after'

export function buildPaginationSlots(page: number, pageCount: number, siblingCount: number): PaginationSlot[] {
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1)
  const windowStart = Math.max(2, page - siblingCount)
  const windowEnd = Math.min(pageCount - 1, page + siblingCount)
  const window = pages.filter(candidate => candidate >= windowStart && candidate <= windowEnd)
  const slots: PaginationSlot[] = [1]
  if (windowStart > 2) slots.push('ellipsis-before')
  slots.push(...window)
  if (windowEnd < pageCount - 1) slots.push('ellipsis-after')
  if (pageCount > 1) slots.push(pageCount)
  return slots
}

export function Pagination({ ariaLabel = 'Pagination', onPageChange, page, pageCount, siblingCount = 1 }: PaginationProps) {
  return <nav aria-label={ariaLabel} className="wm-pagination">
    <button
      aria-label="Previous page"
      className="wm-pagination-page"
      disabled={page <= 1}
      onClick={() => onPageChange(page - 1)}
      type="button"
    >‹</button>
    {buildPaginationSlots(page, pageCount, siblingCount).map(slot => slot === 'ellipsis-before' || slot === 'ellipsis-after'
      ? <span aria-hidden="true" className="wm-pagination-ellipsis" key={slot}>…</span>
      : <button
          aria-current={slot === page ? 'page' : undefined}
          aria-label={`Page ${slot}`}
          className={classNames('wm-pagination-page')}
          key={slot}
          onClick={() => onPageChange(slot)}
          type="button"
        >{slot}</button>)}
    <button
      aria-label="Next page"
      className="wm-pagination-page"
      disabled={page >= pageCount}
      onClick={() => onPageChange(page + 1)}
      type="button"
    >›</button>
  </nav>
}
