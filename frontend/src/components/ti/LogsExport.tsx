import { useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';

export function LogsExport() {
  const [downloading, setDownloading] = useState<'csv' | 'json' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: 'csv' | 'json') => {
    setDownloading(format);
    setError(null);
    try {
      const { data } = await api.get('/logs/export', { params: { format }, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao exportar logs.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => handleExport('csv')} disabled={downloading !== null}>
          {downloading === 'csv' ? 'Exportando...' : 'Exportar CSV'}
        </Button>
        <Button variant="secondary" onClick={() => handleExport('json')} disabled={downloading !== null}>
          {downloading === 'json' ? 'Exportando...' : 'Exportar JSON'}
        </Button>
      </div>
    </div>
  );
}
