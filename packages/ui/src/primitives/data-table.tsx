'use client'

import { classNames } from '../internal/utils.js'
import { Checkbox } from './checkbox.js'

export type DataTableSort = {
  columnId: string
  direction: 'asc' | 'desc'
}

export type DataTableColumn<T> = {
  align?: 'start' | 'numeric'
  id: string
  sortValue?: (row: T) => string | number
  title: string
  width?: string
}

export type DataTableProps<T> = {
  caption?: string
  columns: Array<DataTableColumn<T>>
  emptyLabel?: string
  getRowId: (row: T) => string
  onSortChange?: (sort: DataTableSort | null) => void
  onToggleAllRows?: (selected: boolean) => void
  onToggleRow?: (rowId: string) => void
  renderCell: (row: T, column: DataTableColumn<T>) => React.ReactNode
  rows: T[]
  selectedRowIds?: string[]
  sort?: DataTableSort | null
}

const SORT_ARIA: Record<DataTableSort['direction'], 'ascending' | 'descending'> = { asc: 'ascending', desc: 'descending' }

function nextSortDirection(sort: DataTableSort | null, columnId: string): DataTableSort | null {
  if (!sort || sort.columnId !== columnId) return { columnId, direction: 'asc' }
  if (sort.direction === 'asc') return { columnId, direction: 'desc' }
  return null
}

export function DataTable<T>({ caption, columns, emptyLabel = 'No rows', getRowId, onSortChange, onToggleAllRows, onToggleRow, renderCell, rows, selectedRowIds = [], sort = null }: DataTableProps<T>) {
  const selectable = Boolean(onToggleRow)
  const allSelected = rows.length > 0 && rows.every(row => selectedRowIds.includes(getRowId(row)))
  const someSelected = rows.some(row => selectedRowIds.includes(getRowId(row)))
  const sortedRows = sort && sort.direction && onSortChange
    ? [...rows].sort((left, right) => {
        const column = columns.find(candidate => candidate.id === sort.columnId)
        if (!column?.sortValue) return 0
        const leftValue = column.sortValue(left)
        const rightValue = column.sortValue(right)
        const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue))
        return sort.direction === 'asc' ? compared : -compared
      })
    : rows

  return <table className="wm-table">
    {caption && <caption className="wm-table-caption">{caption}</caption>}
    <thead>
      <tr>
        {selectable && <th aria-label="Selected" className="wm-table-select" scope="col">
          {onToggleAllRows && <Checkbox
            aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'}
            checked={allSelected ? true : (someSelected ? 'indeterminate' : false)}
            onCheckedChange={checked => onToggleAllRows(checked === true)}
          />}
        </th>}
        {columns.map(column => {
          const sortable = Boolean(column.sortValue && onSortChange)
          const activeSort = sort?.columnId === column.id ? sort : null
          return <th
            aria-sort={activeSort ? SORT_ARIA[activeSort.direction] : undefined}
            key={column.id}
            scope="col"
            style={column.width ? { width: column.width } : undefined}
          >
            {sortable
              ? <button
                  className="wm-table-sort"
                  onClick={() => onSortChange?.(nextSortDirection(sort, column.id))}
                  type="button"
                >
                  {column.title}
                  <span aria-hidden="true" className="wm-table-sort-arrow">{activeSort ? (activeSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                </button>
              : column.title}
          </th>
        })}
      </tr>
    </thead>
    <tbody>
      {sortedRows.length === 0
        ? <tr><td colSpan={columns.length + (selectable ? 1 : 0)}>{emptyLabel}</td></tr>
        : sortedRows.map(row => {
            const rowId = getRowId(row)
            const selected = selectedRowIds.includes(rowId)
            return <tr className={classNames(selected && 'is-selected')} key={rowId}>
              {selectable && <td>
                <Checkbox
                  aria-label={`Select ${rowId}`}
                  checked={selected}
                  onCheckedChange={() => onToggleRow?.(rowId)}
                />
              </td>}
              {columns.map(column => <td className={classNames(column.align === 'numeric' && 'wm-table-num')} key={column.id}>{renderCell(row, column)}</td>)}
            </tr>
          })}
    </tbody>
  </table>
}
