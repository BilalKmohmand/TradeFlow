import React from 'react';
import { Download } from 'lucide-react';
import { secondaryBtn } from './ui';
import { downloadCsvFile } from '../../utils/listTools';
import type { CsvTable } from '../../utils/csvReports';

/** "CSV" download button used by every billing report and list (one helper: downloadCsvFile). */
export const CsvButton: React.FC<{ fileName: string; table: () => CsvTable; label?: string; disabled?: boolean }> = ({ fileName, table, label = 'Download CSV', disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => {
      const t = table();
      downloadCsvFile(fileName, t.headers, t.rows);
    }}
    className={secondaryBtn}
    aria-label={label}
    title={label}
  >
    <Download className="w-4 h-4" /> CSV
  </button>
);
