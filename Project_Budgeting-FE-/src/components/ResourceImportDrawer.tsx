/**
 * Import resource assignments from Excel (Resources tab): download the template, upload, preview
 * every row (valid / duplicate / error with its reasons), confirm, import. Only assignments are
 * created - employees (AIRA HRMS), freelancers and vendors must already exist and are never changed.
 * POST /projects/<id>/resources/import/ (commit=false previews, commit=true imports).
 */
import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { formatDate as toDMY } from '../utils/date';
import { Drawer } from './Drawer';
import { ConfirmDialog } from './ConfirmDialog';
import { errorText, money, num, saveDownload } from '../utils/resources';

interface ImportRowResult {
    row: number;
    status: 'valid' | 'duplicate' | 'error' | 'created' | 'skipped' | 'failed';
    errors: string[];
    resource_name: string;
    assignment_id: number | null;
    values: {
        resource_type: string;
        code: string;
        external_name: string;
        milestone: string;
        cost_rate: string | null;
        hours: string | null;
        cost_amount: string | null;
        start_date: string | null;
        end_date: string | null;
        status: string;
    };
}

interface ImportResponse {
    committed: boolean;
    counts: Record<string, number>;
    rows: ImportRowResult[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    currency: string;
    onImported: () => void;
}

const RESULT_BADGE: Record<ImportRowResult['status'], { label: string; cls: string }> = {
    valid: { label: 'Ready', cls: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300' },
    created: { label: 'Imported', cls: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300' },
    duplicate: { label: 'Duplicate', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
    skipped: { label: 'Skipped', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
    error: { label: 'Error', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
    failed: { label: 'Failed', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
};

const Count: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`text-lg font-semibold tabular-nums ${tone}`}>{value.toLocaleString('en-IN')}</p>
    </div>
);

export const ResourceImportDrawer: React.FC<Props> = ({ isOpen, onClose, projectId, currency, onImported }) => {
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState<'' | 'template' | 'check' | 'import'>('');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<ImportResponse | null>(null);
    const [result, setResult] = useState<ImportResponse | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setFile(null);
        setPreview(null);
        setResult(null);
        setError('');
        if (inputRef.current) inputRef.current.value = '';
    };
    const close = () => {
        reset();
        onClose();
    };

    const downloadTemplate = async () => {
        setBusy('template');
        try {
            const res = await axiosInstance.get<Blob>(`/projects/${projectId}/resources/import-template/`, { responseType: 'blob' });
            saveDownload(res, 'Resource_Import_Template.xlsx');
        } catch (err) {
            toast.error(await errorText(err, "Couldn't download the template"));
        } finally {
            setBusy('');
        }
    };

    const send = async (commit: boolean) => {
        if (!file) return;
        const body = new FormData();
        body.append('file', file);
        body.append('commit', commit ? 'true' : 'false');
        setBusy(commit ? 'import' : 'check');
        setError('');
        try {
            const res = await axiosInstance.post<ImportResponse>(`/projects/${projectId}/resources/import/`, body);
            if (commit) {
                setResult(res.data);
                const created = res.data.counts.created || 0;
                toast.success(`${created} resource ${created === 1 ? 'assignment' : 'assignments'} imported`);
                onImported();
            } else {
                setPreview(res.data);
            }
        } catch (err) {
            setError(await errorText(err, commit ? 'The import failed - nothing was saved.' : "Couldn't check this file."));
        } finally {
            setBusy('');
        }
    };

    const shown = result || preview;
    const valid = preview?.counts.valid || 0;
    const duplicates = preview?.counts.duplicate || 0;
    const invalid = preview?.counts.error || 0;

    return (
        <>
            <Drawer
                isOpen={isOpen}
                onClose={close}
                title="Import Resources from Excel"
                subtitle="Resource assignments only - people must already exist in AIRA HRMS, Freelancers or Vendors"
                size="xl"
                footer={(
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {result ? 'Import finished.' : preview ? `${valid} ready · ${duplicates} duplicate · ${invalid} with errors` : 'Step 1: download the template · Step 2: upload and check'}
                        </p>
                        <div className="flex gap-2">
                            <button type="button" onClick={close} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                                {result ? 'Done' : 'Cancel'}
                            </button>
                            {!result && !preview && (
                                <button type="button" onClick={() => send(false)} disabled={!file || busy !== ''}
                                    className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                                    {busy === 'check' ? 'Checking...' : 'Check File'}
                                </button>
                            )}
                            {!result && preview && (
                                <button type="button" onClick={() => setConfirmOpen(true)} disabled={valid === 0 || busy !== ''}
                                    className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                                    {busy === 'import' ? 'Importing...' : `Import ${valid} ${valid === 1 ? 'Row' : 'Rows'}`}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            >
                <div className="space-y-4">
                    {!result && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">1. Get the template</p>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Columns, dropdowns and this project's milestone names, with instructions.</p>
                                <button type="button" onClick={downloadTemplate} disabled={busy !== ''}
                                    className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                                    <Download size={15} aria-hidden="true" /> {busy === 'template' ? 'Downloading...' : 'Download Template'}
                                </button>
                            </div>
                            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">2. Upload the filled file</p>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">.xlsx, up to 1,000 rows. Rows are checked before anything is saved.</p>
                                <label className="mt-2 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-600 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                                    <Upload size={15} aria-hidden="true" /> Choose File
                                    <input
                                        ref={inputRef}
                                        type="file"
                                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                        className="sr-only"
                                        onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setError(''); }}
                                    />
                                </label>
                                {file && (
                                    <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-gray-600 dark:text-gray-300">
                                        <FileSpreadsheet size={13} aria-hidden="true" /> {file.name}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</div>
                    )}

                    {result && (
                        <div className="grid grid-cols-3 gap-2">
                            <Count label="Imported" value={result.counts.created || 0} tone="text-green-600 dark:text-green-400" />
                            <Count label="Skipped (duplicates)" value={result.counts.skipped || 0} tone="text-amber-600 dark:text-amber-400" />
                            <Count label="Failed" value={result.counts.failed || 0} tone="text-red-600 dark:text-red-400" />
                        </div>
                    )}
                    {!result && preview && (
                        <div className="grid grid-cols-3 gap-2">
                            <Count label="Ready to import" value={valid} tone="text-green-600 dark:text-green-400" />
                            <Count label="Duplicates (skipped)" value={duplicates} tone="text-amber-600 dark:text-amber-400" />
                            <Count label="Errors (not imported)" value={invalid} tone="text-red-600 dark:text-red-400" />
                        </div>
                    )}

                    {shown && (
                        <div className="max-h-[52vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
                            <table className="w-full min-w-[760px] text-[13px]" aria-label="Import rows">
                                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                                    <tr className="h-10 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        <th className="px-3">Row</th>
                                        <th className="px-3">Resource</th>
                                        <th className="px-3">Milestone</th>
                                        <th className="px-3">Period</th>
                                        <th className="px-3 text-right">Cost</th>
                                        <th className="px-3">Result</th>
                                        <th className="px-3">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.rows.map((r) => {
                                        const v = r.values;
                                        const cost = v.cost_amount != null ? num(v.cost_amount) : num(v.cost_rate) * num(v.hours);
                                        return (
                                            <tr key={r.row} className="border-t border-gray-100 align-top dark:border-gray-800">
                                                <td className="px-3 py-2 tabular-nums text-gray-500">{r.row}</td>
                                                <td className="px-3 py-2">
                                                    <p className="font-medium text-gray-900 dark:text-white">{r.resource_name || v.external_name || v.code || '—'}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">{[v.resource_type, v.code].filter(Boolean).join(' · ')}</p>
                                                </td>
                                                <td className="px-3 py-2">{v.milestone || '—'}</td>
                                                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{toDMY(v.start_date, '—')} – {toDMY(v.end_date, '—')}</td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{cost ? money(cost, currency) : '—'}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${RESULT_BADGE[r.status].cls}`}>{RESULT_BADGE[r.status].label}</span>
                                                </td>
                                                <td className="px-3 py-2 text-xs">
                                                    {r.errors.length > 0 ? (
                                                        <ul className={`list-disc space-y-0.5 pl-4 ${r.status === 'duplicate' || r.status === 'skipped' ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'}`}>
                                                            {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                                                        </ul>
                                                    ) : <span className="text-gray-500 dark:text-gray-400">{r.status === 'created' ? 'Saved' : 'OK'}</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {preview && !result && (
                        <button type="button" onClick={reset} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Choose a different file</button>
                    )}
                </div>
            </Drawer>

            <ConfirmDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={async () => { setConfirmOpen(false); await send(true); }}
                title="Import resource assignments?"
                message={(
                    <span>
                        {valid} {valid === 1 ? 'assignment' : 'assignments'} will be added to this project.
                        {duplicates > 0 && ` ${duplicates} duplicate ${duplicates === 1 ? 'row' : 'rows'} will be skipped.`}
                        {invalid > 0 && ` ${invalid} ${invalid === 1 ? 'row has' : 'rows have'} errors and won't be imported.`}
                    </span>
                )}
                confirmLabel="Import"
                danger={false}
            />
        </>
    );
};
