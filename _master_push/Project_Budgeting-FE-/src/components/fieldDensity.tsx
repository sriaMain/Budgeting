import React, { createContext, useContext } from 'react';

/**
 * Opt-in compact, enterprise-density form style (the KYC drawers' uppercase labels and tighter
 * fields). Wrap a form in <CompactFields> and every InputField / SelectField inside it that
 * doesn't pass its own labelClassName picks the compact style up - so shared field components
 * (e.g. the vendor wizard's step sections) can render compact inside a drawer without editing
 * each field. Everything outside a provider keeps the default style.
 */
export const COMPACT_LABEL =
  'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 dark:text-gray-400';
export const COMPACT_FIELD_PADDING = 'py-2.5';

const FieldDensityContext = createContext<'default' | 'compact'>('default');

export const CompactFields: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <FieldDensityContext.Provider value="compact">{children}</FieldDensityContext.Provider>
);

// eslint-disable-next-line react-refresh/only-export-components
export const useFieldDensity = () => useContext(FieldDensityContext);
