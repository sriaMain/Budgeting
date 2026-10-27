import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Eye, Package, Pencil, Plus, Search } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { CatalogIcon } from './CatalogIcon';
import ProductServiceDrawer from './ProductServiceDrawer';
import ProductServiceDetailDrawer from './ProductServiceDetailDrawer';
import { parseApiErrors } from '../utils/parseApiErrors';
import {
  DELIVERY_TYPES, PRODUCT_TYPE_LABELS, deliveryLabel, getCatalogItems, getCatalogPermissions, kindOf,
  setCatalogItemArchived,
  type CatalogItem, type CatalogKind, type CatalogPermissions,
} from '../services/catalog';

const PAGE_SIZE = 24;
const SELECT_CLASS = 'pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:ring-violet-500';

type StatusFilter = 'active' | 'archived' | 'all';

const priceText = (i: CatalogItem) => {
  if (!i.can_be_sold) return 'Not sold';
  const n = Number(i.sales_price);
  if (!(n > 0)) return 'Price on request';
  const amount = n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const unit = i.uom_code && i.uom_code !== 'fixed' && i.uom_code !== 'pieces' ? ` / ${i.uom_name}` : '';
  const from = i.service_delivery_type === 'fixed_price' || i.service_delivery_type === 'milestone' ? 'From ' : '';
  return `${from}${amount} ${i.currency}${unit}`;
};

const FilterSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }> = ({ label, value, onChange, children }) => (
  <div className="relative">
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>{children}</select>
    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none dark:text-gray-500" />
  </div>
);

const CatalogCard: React.FC<{
  item: CatalogItem; canManage: boolean; onView: () => void; onEdit: () => void;
}> = ({ item, canManage, onView, onEdit }) => {
  const isService = kindOf(item) === 'service';
  const typeLabel = isService ? (deliveryLabel(item.service_delivery_type) || 'Service') : PRODUCT_TYPE_LABELS[item.product_type];
  return (
    <article
      onClick={onView}
      className={`group flex flex-col rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md hover:border-blue-300 cursor-pointer dark:bg-gray-900 dark:border-gray-800 dark:hover:border-blue-500/50 ${item.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-75'}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <CatalogIcon names={[item.product_service_name, item.short_description, item.service_delivery_type]} className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={item.product_service_name}>{item.product_service_name}</h3>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{item.internal_reference || (isService ? 'Service' : 'Product')}</p>
        </div>
        {!item.is_active && (
          <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">Archived</span>
        )}
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-gray-600 dark:text-gray-400">
        {item.short_description || item.description || <span className="text-gray-400 dark:text-gray-500">No description</span>}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{typeLabel}</span>
        {item.uom_name && <span className="truncate text-[11px] text-gray-400">{item.uom_name}</span>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{priceText(item)}</span>
        <span className="flex flex-shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={onView} title="View" aria-label={`View ${item.product_service_name}`}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100">
            <Eye className="w-4 h-4" />
          </button>
          {canManage && (
            <button type="button" onClick={onEdit} title="Edit" aria-label={`Edit ${item.product_service_name}`}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100">
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </span>
      </div>
    </article>
  );
};

/** Administration > Products & Services (formerly "Modules"): a visual catalog used by quotations,
 * invoices and purchase orders. Archive replaces delete, so history is never broken. */
const ProductsServicesTab: React.FC = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [permissions, setPermissions] = useState<CatalogPermissions>({ can_manage: false, can_view_accounting: false });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<CatalogKind>('service');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [page, setPage] = useState(1);

  const [viewing, setViewing] = useState<CatalogItem | null>(null);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [archiving, setArchiving] = useState<CatalogItem | null>(null);

  // State is only set after the requests resolve, so this is safe to call from an effect.
  const fetchAll = useCallback(async () => {
    try {
      const [rows, perms] = await Promise.all([getCatalogItems(), getCatalogPermissions()]);
      setItems(rows);
      setPermissions(perms);
      setLoadError(null);
    } catch (err) {
      setLoadError(parseApiErrors(err).general || 'Could not load the catalog.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reload = () => {
    setIsLoading(true);
    fetchAll();
  };

  useEffect(() => {
    (async () => { await fetchAll(); })();
  }, [fetchAll]);

  // Back to page 1 whenever the visible set changes; the type filter belongs to one tab.
  const filterKey = [kind, search, typeFilter, statusFilter].join('|');
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setPage(1);
  }
  const switchKind = (k: CatalogKind) => { setKind(k); setTypeFilter(''); };

  const counts = useMemo(() => {
    const active = items.filter((i) => statusFilter === 'all' || (statusFilter === 'active') === i.is_active);
    return {
      service: active.filter((i) => kindOf(i) === 'service').length,
      product: active.filter((i) => kindOf(i) === 'product').length,
    };
  }, [items, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => kindOf(i) === kind
        && (statusFilter === 'all' || (statusFilter === 'active') === i.is_active)
        && (!typeFilter || (kind === 'service' ? i.service_delivery_type === typeFilter : i.product_type === typeFilter))
        && (!q || [i.product_service_name, i.internal_reference, i.short_description, i.description]
          .some((v) => (v || '').toLowerCase().includes(q))))
      .sort((a, b) => a.product_service_name.localeCompare(b.product_service_name));
  }, [items, kind, search, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstRow = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const upsert = (saved: CatalogItem) =>
    setItems((prev) => (prev.some((i) => i.id === saved.id) ? prev.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...prev]));

  const openCreate = () => { setEditing(null); setIsFormOpen(true); };
  const openEdit = (item: CatalogItem) => { setViewing(null); setEditing(item); setIsFormOpen(true); };

  const handleSaved = (saved: CatalogItem) => {
    upsert(saved);
    setIsFormOpen(false);
    if (kindOf(saved) !== kind) switchKind(kindOf(saved));
  };

  const toggleArchive = async (item: CatalogItem) => {
    try {
      const updated = await setCatalogItemArchived(item.id, item.is_active);
      upsert(updated);
      setViewing((v) => (v && v.id === updated.id ? updated : v));
      toast.success(updated.is_active ? `${updated.product_service_name} restored.` : `${updated.product_service_name} archived.`);
    } catch (err) {
      toast.error(parseApiErrors(err).general || 'Could not update the item.');
    }
  };

  const hasFilters = !!(search || typeFilter || statusFilter !== 'active');
  const noun = kind === 'service' ? 'Service' : 'Product';

  const kindButton = (k: CatalogKind, label: string) => (
    <button type="button" role="tab" aria-selected={kind === k} onClick={() => switchKind(k)}
      className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md transition-colors ${kind === k
        ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white'
        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}>
      {label}
      <span className={`rounded-full px-1.5 text-xs ${kind === k ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
        {counts[k]}
      </span>
    </button>
  );

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Products &amp; Services</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Catalog used on quotations, invoices and purchase orders.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Catalog type" className="flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {kindButton('service', 'Services')}
            {kindButton('product', 'Products')}
          </div>
          {permissions.can_manage && (
            <button type="button" onClick={openCreate}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm whitespace-nowrap">
              <Plus className="w-4 h-4" /> Create {noun}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-grow sm:flex-grow-0">
          <input
            type="search"
            placeholder={`Search ${kind === 'service' ? 'services' : 'products'}...`}
            aria-label={`Search ${kind === 'service' ? 'services' : 'products'}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-72 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        </div>
        {kind === 'service' ? (
          <FilterSelect label="Delivery type" value={typeFilter} onChange={setTypeFilter}>
            <option value="">All delivery types</option>
            {DELIVERY_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </FilterSelect>
        ) : (
          <FilterSelect label="Product type" value={typeFilter} onChange={setTypeFilter}>
            <option value="">All product types</option>
            <option value="digital">{PRODUCT_TYPE_LABELS.digital}</option>
            <option value="consumable">{PRODUCT_TYPE_LABELS.consumable}</option>
          </FilterSelect>
        )}
        <FilterSelect label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as StatusFilter)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All statuses</option>
        </FilterSelect>
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={reload} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl border border-gray-200 bg-gray-50 animate-pulse dark:border-gray-800 dark:bg-gray-900" />
          ))}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <EmptyState
            icon={<Package className="w-8 h-8" />}
            title={hasFilters ? `No ${kind === 'service' ? 'services' : 'products'} match these filters` : `No ${kind === 'service' ? 'services' : 'products'} yet`}
            description={hasFilters ? 'Try a different search or clear the filters.' : `Create your first ${noun.toLowerCase()} to use it on quotations.`}
            action={!hasFilters && permissions.can_manage ? (
              <button type="button" onClick={openCreate} className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                <Plus className="w-4 h-4" /> Create {noun}
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {pageRows.map((item) => (
              <CatalogCard key={item.id} item={item} canManage={permissions.can_manage}
                onView={() => setViewing(item)} onEdit={() => openEdit(item)} />
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Showing <strong className="text-gray-900 dark:text-gray-100">{firstRow}</strong>–<strong className="text-gray-900 dark:text-gray-100">{lastRow}</strong> of <strong className="text-gray-900 dark:text-gray-100">{filtered.length}</strong></span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900">Previous</button>
                <span>Page {currentPage} of {totalPages}</span>
                <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900">Next</button>
              </div>
            )}
          </div>
        </>
      )}

      <ProductServiceDetailDrawer
        isOpen={!!viewing}
        item={viewing}
        permissions={permissions}
        onClose={() => setViewing(null)}
        onEdit={openEdit}
        onToggleArchive={(i) => (i.is_active ? setArchiving(i) : toggleArchive(i))}
      />

      <ProductServiceDrawer
        isOpen={isFormOpen}
        item={editing}
        kind={kind}
        permissions={permissions}
        onClose={() => setIsFormOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={async () => {
          if (archiving) await toggleArchive(archiving);
          setArchiving(null);
        }}
        title={`Archive this ${archiving && kindOf(archiving) === 'service' ? 'service' : 'product'}?`}
        message={
          archiving ? (
            <>
              <strong>{archiving.product_service_name}</strong> will be hidden from quotation and invoice pickers.
              {archiving.usage_count ? (
                <> It is used on <strong>{archiving.usage_count}</strong> quotation / invoice line{archiving.usage_count === 1 ? '' : 's'}; those documents stay exactly as they are.</>
              ) : null}
              {' '}You can restore it at any time.
            </>
          ) : ''
        }
        confirmLabel="Archive"
        danger={false}
      />
    </div>
  );
};

export default ProductsServicesTab;
