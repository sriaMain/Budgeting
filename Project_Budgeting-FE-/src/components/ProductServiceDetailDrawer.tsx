import React, { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, FileText, FolderKanban, Pencil, Receipt, ShoppingCart } from 'lucide-react';
import { Drawer } from './Drawer';
import { StatusBadge } from './StatusBadge';
import { CatalogIcon } from './CatalogIcon';
import { formatDate, formatDateTime } from '../utils/date';
import {
  DELIVERY_TEAM_LABELS, ENGAGEMENT_LABELS, PROCUREMENT_LABELS, PRODUCT_TYPE_LABELS, deliveryLabel, getCatalogRelated, kindOf,
  type CatalogItem, type CatalogPermissions, type CatalogRelated,
} from '../services/catalog';

const money = (v: string | null | undefined, currency?: string) =>
  v === null || v === undefined || v === '' ? '—'
    : `${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-t border-gray-100 dark:border-gray-800 pt-4">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">{title}</h3>
    {children}
  </section>
);

/** Label / value grid; rows with an empty value are skipped so only relevant facts show. */
const Facts: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '—');
  if (!shown.length) return <p className="text-sm text-gray-400 dark:text-gray-500">Not configured.</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {shown.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 sm:block">
          <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100 text-right sm:text-left">{v}</dd>
        </div>
      ))}
    </dl>
  );
};

const RelatedList: React.FC<{
  icon: React.ReactNode; title: string; count: number;
  rows: { key: string | number; primary: string; secondary: string; amount?: string }[];
}> = ({ icon, title, count, rows }) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-800">
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
      <span className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">{icon}{title}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{count}</span>
    </div>
    {rows.length ? (
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-gray-900 dark:text-gray-100">{r.primary}</span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{r.secondary}</span>
            </span>
            {r.amount && <span className="text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.amount}</span>}
          </li>
        ))}
        {count > rows.length && <li className="px-3 py-2 text-xs text-gray-500">+ {count - rows.length} more</li>}
      </ul>
    ) : <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">None yet.</p>}
  </div>
);

interface Props {
  isOpen: boolean;
  item: CatalogItem | null;
  permissions: CatalogPermissions;
  onClose: () => void;
  onEdit: (item: CatalogItem) => void;
  onToggleArchive: (item: CatalogItem) => void;
}

const ProductServiceDetailDrawer: React.FC<Props> = ({ isOpen, item, permissions, onClose, onEdit, onToggleArchive }) => {
  const [related, setRelated] = useState<CatalogRelated | null>(null);
  const [relatedError, setRelatedError] = useState(false);
  const itemId = item?.id;

  // Clear the previous item's related records when a different item opens.
  const [shownFor, setShownFor] = useState<number | undefined>(undefined);
  if (isOpen && itemId !== shownFor) {
    setShownFor(itemId);
    setRelated(null);
    setRelatedError(false);
  }

  useEffect(() => {
    if (!isOpen || itemId === undefined) return;
    let cancelled = false;
    getCatalogRelated(itemId)
      .then((r) => { if (!cancelled) setRelated(r); })
      .catch(() => { if (!cancelled) setRelatedError(true); });
    return () => { cancelled = true; };
  }, [isOpen, itemId]);

  if (!item) return null;
  const isService = kindOf(item) === 'service';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={item.product_service_name}
      subtitle={item.internal_reference || undefined}
      size="lg"
      footer={(
        <div className="flex items-center justify-between w-full gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Close</button>
          {permissions.can_manage && (
            <div className="flex gap-2">
              <button type="button" onClick={() => onToggleArchive(item)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                {item.is_active ? <><Archive className="w-4 h-4" /> Archive</> : <><ArchiveRestore className="w-4 h-4" /> Restore</>}
              </button>
              <button type="button" onClick={() => onEdit(item)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                <Pencil className="w-4 h-4" /> Edit
              </button>
            </div>
          )}
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <CatalogIcon names={[item.product_service_name, item.short_description, item.service_delivery_type]} className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{PRODUCT_TYPE_LABELS[item.product_type]}</span>
              {isService && item.service_delivery_type && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{deliveryLabel(item.service_delivery_type)}</span>
              )}
              <StatusBadge status={item.is_active ? 'active' : 'archived'} variant={item.is_active ? 'success' : 'neutral'} label={item.is_active ? 'Active' : 'Archived'} />
            </div>
            {item.short_description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{item.short_description}</p>}
          </div>
        </div>

        {item.description && (
          <Section title="Overview">
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{item.description}</p>
          </Section>
        )}

        <Section title="Sales">
          {item.can_be_sold ? (
            <Facts rows={[
              [isService ? 'Price' : 'Sales price', `${money(item.sales_price, item.currency)}${item.uom_name ? ` / ${item.uom_name}` : ''}`],
              ['Default discount', Number(item.default_discount_percent) ? `${Number(item.default_discount_percent)}%` : ''],
              ['Sales tax', item.sales_tax_name ? `${item.sales_tax_name}` : ''],
              ['Payment terms', item.payment_terms_days !== null ? `${item.payment_terms_days} days` : ''],
              ['Default project type', item.default_engagement_type ? ENGAGEMENT_LABELS[item.default_engagement_type] : ''],
              ['Contract duration', item.default_contract_months ? `${item.default_contract_months} months` : ''],
            ]} />
          ) : <p className="text-sm text-gray-500 dark:text-gray-400">Not sold.</p>}
        </Section>

        <Section title={isService ? 'External cost' : 'Purchase'}>
          {item.can_be_purchased ? (
            <Facts rows={[
              ['Procurement type', item.procurement_type ? PROCUREMENT_LABELS[item.procurement_type] : ''],
              ['Vendor', item.preferred_vendor_name || ''],
              ['Vendor reference', item.vendor_reference],
              [isService ? 'Vendor cost' : 'Cost price', `${money(item.cost_price, item.cost_currency)}${item.purchase_uom_name ? ` / ${item.purchase_uom_name}` : ''}`],
              ['Purchase tax', item.purchase_tax_name || ''],
              ['Purchase description', item.purchase_description],
            ]} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">{isService ? 'Delivered by the internal team - no external procurement.' : 'Not purchased.'}</p>
          )}
        </Section>

        {isService && (
          <Section title="Resource & delivery">
            <Facts rows={[
              ['Department', item.department_name],
              ['Suggested designations', item.suggested_designations?.length ? item.suggested_designations.join(', ') : ''],
              ['Delivery team', item.delivery_team_type ? DELIVERY_TEAM_LABELS[item.delivery_team_type] : ''],
              ['Estimated hours', item.estimated_hours ? `${Number(item.estimated_hours)} h` : ''],
              ['Resource cost rate', item.default_cost_rate ? `${money(item.default_cost_rate)} / hour` : ''],
              ['Billing rate', item.default_billing_rate ? `${money(item.default_billing_rate)} / hour` : ''],
            ]} />
          </Section>
        )}

        <Section title="Related records">
          {relatedError ? <p className="text-sm text-red-600">Could not load related records.</p>
            : !related ? <p className="text-sm text-gray-400">Loading...</p>
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <RelatedList icon={<FileText className="w-4 h-4" />} title="Quotations" count={related.quotations.count}
                    rows={related.quotations.results.map((q) => ({ key: q.id, primary: q.name, secondary: [q.client, q.status, formatDate(q.date)].filter(Boolean).join(' · '), amount: money(q.total, q.currency) }))} />
                  <RelatedList icon={<Receipt className="w-4 h-4" />} title="Invoices" count={related.invoices.count}
                    rows={related.invoices.results.map((i) => ({ key: i.id, primary: i.number, secondary: [i.client, i.status, formatDate(i.date)].filter(Boolean).join(' · '), amount: money(i.total) }))} />
                  <RelatedList icon={<ShoppingCart className="w-4 h-4" />} title="Purchase orders" count={related.purchase_orders.count}
                    rows={related.purchase_orders.results.map((o) => ({ key: o.id, primary: o.number, secondary: [o.vendor, o.status, formatDate(o.date)].filter(Boolean).join(' · '), amount: money(o.total) }))} />
                  <RelatedList icon={<FolderKanban className="w-4 h-4" />} title="Projects" count={related.projects.count}
                    rows={related.projects.results.map((p) => ({ key: p.id, primary: p.name, secondary: [p.status, `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`].filter(Boolean).join(' · ') }))} />
                </div>
              )}
        </Section>

        <Section title="Audit">
          <Facts rows={[
            ['Created', `${formatDateTime(item.created_at)}${item.created_by ? ` · ${item.created_by}` : ''}`],
            ['Last updated', `${formatDateTime(item.updated_at)}${item.modified_by ? ` · ${item.modified_by}` : ''}`],
            ['Internal notes', item.internal_notes],
          ]} />
        </Section>
      </div>
    </Drawer>
  );
};

export default ProductServiceDetailDrawer;
