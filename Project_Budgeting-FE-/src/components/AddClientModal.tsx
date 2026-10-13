import { useEffect, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { CountrySelect } from "./onboarding/CountrySelect";
import { PhoneInput } from "./onboarding/PhoneInput";
import { AddressFields } from "./onboarding/AddressFields";
import { EMPTY_ADDRESS, addressErrors, type AddressValue } from "./onboarding/addressForm";
import { useCountryCurrency } from "./onboarding/useCountryCurrency";
import { FieldShell } from "./onboarding/FieldShell";
import { INPUT_CLASS, INPUT_ERROR_CLASS } from "./onboarding/fieldStyles";
import { useCountries, useCountryConfig, findCountry } from "../hooks/useCountries";
import { EMAIL_REGEX, validatePhoneValue } from "../utils/countryRules";
import { createClient, fetchCompanyTags, readClientApiError } from "../services/clientOnboarding";
import {
  BILLING_CURRENCIES,
  CLIENT_TYPE_OPTIONS,
  computeJurisdiction,
  type Client,
  type ClientCurrency,
  type ClientType,
  type CompanyTag,
} from "../pages/client-onboarding/clientTypes";

interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientAdded: (client: Client) => void;
}

/** Quick "Add client" from the quote screen: creates a DRAFT client with the basics (KYC is
 * completed later from Contacts > Clients). Country-aware phone, address and GSTIN rules. */
export function AddClientModal({ isOpen, onClose, onClientAdded }: AddClientModalProps) {
  if (!isOpen) return null;
  return <AddClientForm onClose={onClose} onClientAdded={onClientAdded} />;
}

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function AddClientForm({ onClose, onClientAdded }: Omit<AddClientModalProps, "isOpen">) {
  const { countries } = useCountries();
  const [tags, setTags] = useState<CompanyTag[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [clientType, setClientType] = useState<ClientType>("company");
  const [country, setCountry] = useState("India");
  const [currency, setCurrency] = useState<ClientCurrency>("INR");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const { config } = useCountryConfig(country);
  const currencySync = useCountryCurrency({
    currency,
    setCurrency: (code) => {
      if ((BILLING_CURRENCIES as string[]).includes(code)) setCurrency(code as ClientCurrency);
    },
    allowed: BILLING_CURRENCIES,
  });
  const indian = computeJurisdiction(country) === "Indian";

  useEffect(() => {
    let alive = true;
    fetchCompanyTags()
      .then((rows) => {
        if (alive) setTags(rows);
      })
      .catch(() => {
        if (alive) setTags([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const clear = (...keys: string[]) => {
    setGeneral("");
    setErrors((prev) => {
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  };

  const validate = () => {
    const found: Record<string, string> = {};
    if (!companyName.trim()) found.company_name = "Legal name is required";
    if (!country.trim()) found.country = "Country is required";
    else if (countries.length && !findCountry(countries, country)) found.country = "Select the country from the list";
    if (!email.trim()) found.email = "Email is required";
    else if (!EMAIL_REGEX.test(email.trim())) found.email = "Enter a valid email address";
    const phoneError = validatePhoneValue(phone, countries, country, true);
    if (phoneError) found.mobile_number = phoneError;
    if (indian && gstin && !GSTIN_REGEX.test(gstin)) found.gstin = "Enter a valid 15-character GSTIN";
    const addr = addressErrors(address, config, { required: false });
    if (addr.postal_code) found.postal_code = addr.postal_code;
    return found;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_name: companyName.trim(),
        client_type: clientType,
        country,
        currency,
        email: email.trim(),
        mobile_number: phone,
        address1: address.line1.trim(),
        address2: address.line2.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        postal_code: address.postal_code.trim(),
        tags: selectedTags,
      };
      if (indian && gstin) payload.gstin = gstin;
      const created = await createClient(payload);
      toast.success("Client added as a draft - complete its KYC from Contacts > Clients.");
      onClientAdded(created);
      onClose();
    } catch (error) {
      const apiError = readClientApiError(error, "Could not create the client.");
      setErrors(apiError.fields);
      setGeneral(apiError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  const text = (id: string, labelText: string, value: string, onChange: (v: string) => void, opts: { required?: boolean; type?: string; placeholder?: string; error?: string } = {}) => (
    <FieldShell label={labelText} htmlFor={id} required={opts.required} error={opts.error}>
      <input
        id={id}
        type={opts.type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={opts.placeholder}
        aria-invalid={!!opts.error}
        className={`${INPUT_CLASS} ${opts.error ? INPUT_ERROR_CLASS : ""}`}
      />
    </FieldShell>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all dark:bg-black/50" onClick={handleClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto transform transition-all dark:bg-gray-900 dark:shadow-black/40" onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-40 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New Client</h3>
            <button onClick={handleClose} disabled={isSaving} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300">
              <X size={24} />
            </button>
          </div>

          <div className="p-6">
            {general && (
              <div role="alert" className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                {general}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 dark:text-gray-300">General Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                  <div className="md:col-span-2">
                    {text("add-client-name", "Legal name", companyName, (v) => { setCompanyName(v); clear("company_name"); }, { required: true, placeholder: "Registered name of the client", error: errors.company_name })}
                  </div>
                  <FieldShell label="Client type" htmlFor="add-client-type" required>
                    <select id="add-client-type" value={clientType} onChange={(e) => setClientType(e.target.value as ClientType)} className={INPUT_CLASS}>
                      {CLIENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </FieldShell>
                  <CountrySelect
                    id="add-client-country"
                    label="Country"
                    required
                    value={country}
                    onChange={(name) => {
                      const previous = country;
                      setCountry(name);
                      clear("country", "postal_code", "gstin");
                      currencySync.onCountryChange(previous, name);
                    }}
                    error={errors.country}
                    showCurrency
                  />
                  <div>
                    <FieldShell label="Billing currency" htmlFor="add-client-currency" required error={errors.currency}>
                      <select id="add-client-currency" value={currency} onChange={(e) => setCurrency(e.target.value as ClientCurrency)} className={INPUT_CLASS}>
                        {BILLING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </FieldShell>
                    {currencySync.notice}
                  </div>
                  {text("add-client-email", "Email", email, (v) => { setEmail(v); clear("email"); }, { required: true, type: "email", placeholder: "contact@client.com", error: errors.email })}
                  <PhoneInput
                    id="add-client-phone"
                    label="Phone"
                    required
                    value={phone}
                    onChange={(v) => { setPhone(v); clear("mobile_number"); }}
                    defaultCountry={country}
                    error={errors.mobile_number || errors.country_code}
                  />
                  {indian &&
                    text("add-client-gstin", "GSTIN", gstin, (v) => { setGstin(v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 15)); clear("gstin"); }, { placeholder: "Optional - 15 characters", error: errors.gstin })}
                </div>
              </div>

              <div className="border-t pt-4 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 dark:text-gray-300">Address</h4>
                <AddressFields
                  idPrefix="add-client-address"
                  value={address}
                  onChange={(patch) => { setAddress((a) => ({ ...a, ...patch })); clear("address1", "city", "postal_code", "state"); }}
                  country={country}
                  errors={{ line1: errors.address1, city: errors.city, postal_code: errors.postal_code, state: errors.state }}
                />
              </div>

              <div className="space-y-3 border-t pt-4 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Company Tags</h4>
                {tags === null ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading tags...</p>
                ) : tags.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No tags configured yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {tags.map((tag) => (
                      <label key={tag.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100">
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(tag.id)}
                          onChange={() => setSelectedTags((prev) => (prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]))}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        />
                        {tag.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                The client is created as a draft. Identity, banking, commercial details and KYC documents are completed from Contacts &gt; Clients before approval.
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-800">
                <button type="button" onClick={handleClose} disabled={isSaving} className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSaving ? "Creating..." : "Create Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
