/**
 * Months of a Time & Material project, from its start date to its end date -
 * the same months the backend bills and costs by (Project/utils/tm_periods.py).
 * A cost dated outside the project is counted in its first / last month.
 */

export interface ProjectMonth {
    /** YYYY-MM */
    value: string;
    /** e.g. "Oct 2026" */
    label: string;
    /** First day of the month within the project (YYYY-MM-DD). */
    start: string;
    /** Last day of the month within the project (YYYY-MM-DD). */
    end: string;
}

const pad = (v: number) => String(v).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export const todayIso = () => {
    const d = new Date();
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

export const monthLabel = (value: string) => {
    const [y, m] = value.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

export const projectMonths = (startDate?: string | null, endDate?: string | null): ProjectMonth[] => {
    if (!startDate || !endDate || endDate < startDate) return [];
    const months: ProjectMonth[] = [];
    let [y, m] = startDate.slice(0, 7).split('-').map(Number);
    const last = endDate.slice(0, 7);
    for (;;) {
        const value = `${y}-${pad(m)}`;
        const lastDay = new Date(y, m, 0).getDate();
        const first = iso(y, m, 1);
        const end = iso(y, m, lastDay);
        months.push({
            value,
            label: monthLabel(value),
            start: first < startDate ? startDate : first,
            end: end > endDate ? endDate : end,
        });
        if (value >= last) break;
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return months;
};

/** The project month a date counts in (clamped to the first / last month), or null without months. */
export const monthForDate = (months: ProjectMonth[], date: string): ProjectMonth | null => {
    if (!months.length || !date) return null;
    const value = date.slice(0, 7);
    if (value <= months[0].value) return months[0];
    if (value >= months[months.length - 1].value) return months[months.length - 1];
    return months.find(mo => mo.value === value) ?? null;
};
