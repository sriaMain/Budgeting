import React from 'react';
import { resolveCatalogIcon } from './catalogIcons';

/** Category-based icon for a catalog card (see catalogIcons.ts). */
export const CatalogIcon: React.FC<{ iconKey?: string | null; names?: (string | null | undefined)[]; className?: string }> = ({
  iconKey, names = [], className = 'w-5 h-5',
}) => React.createElement(resolveCatalogIcon(iconKey, ...names), { className, 'aria-hidden': true });
