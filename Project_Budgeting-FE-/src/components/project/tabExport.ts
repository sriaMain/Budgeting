/**
 * Excel export lives in the Project Details header's More Actions menu, not on each tab. A tab
 * that can export registers its exporter here while it is shown; the page reads it to build the
 * menu item. The exporter stays in the tab because only the tab knows its full query (its own
 * sort and any tab-only filter such as Resources' Resource Type), so the file always matches
 * what is on screen.
 */
import { useEffect, useRef } from 'react';
import type React from 'react';

export interface TabExport {
    /** Menu label, e.g. "Export Invoices (Excel)". */
    label: string;
    /** False when there is nothing to export (the item is shown disabled). */
    enabled: boolean;
    /** Downloads the file and shows its own progress / success / error toast. */
    run: () => Promise<void>;
}

/** The page's state setter for the current tab's exporter. */
export type RegisterExport = React.Dispatch<React.SetStateAction<TabExport | null>>;

export function useRegisterExport(register: RegisterExport | undefined, label: string, enabled: boolean, run: () => Promise<void>) {
    // The latest run (it closes over the tab's current filters) without re-registering every render.
    const runRef = useRef(run);
    useEffect(() => {
        runRef.current = run;
    });
    useEffect(() => {
        if (!register) return;
        const mine: TabExport = { label, enabled, run: () => runRef.current() };
        register(mine);
        // Only clear our own entry - another tab may already have registered.
        return () => register((current) => (current === mine ? null : current));
    }, [register, label, enabled]);
}
