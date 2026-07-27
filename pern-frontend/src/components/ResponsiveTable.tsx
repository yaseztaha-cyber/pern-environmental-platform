import { type ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  renderCard?: (row: T) => ReactNode;
}

export function ResponsiveTable<T extends Record<string, any>>({ columns, data, emptyMessage = 'No data', renderCard }: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return <div className="text-center py-8 text-[var(--text-disabled)] text-sm">{emptyMessage}</div>;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {columns.map(col => (
                <th key={col.key} className={`text-left py-3 px-3 text-[10px] text-[var(--text-disabled)] uppercase font-medium ${col.className || ''}`} scope="col">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors">
                {columns.map(col => (
                  <td key={col.key} className={`py-3 px-3 ${col.className || ''}`}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {renderCard ? data.map((row, i) => <div key={i}>{renderCard(row)}</div>) :
          data.map((row, i) => (
            <div key={i} className="card p-3 space-y-1">
              {columns.map(col => (
                <div key={col.key} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-disabled)]">{col.header}</span>
                  <span className="font-medium">{col.render ? col.render(row) : String(row[col.key] ?? '')}</span>
                </div>
              ))}
            </div>
          ))
        }
      </div>
    </>
  );
}
