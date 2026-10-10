import { useState, useEffect } from "react";
import type { Client, CompanyTag } from "./ClientListPage";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
import { fetchPincodeDetails } from "../utils/pincodeLookup";






interface AddClientProps {
  client?: Client;
  onSave: (client: Client) => void;
  onCancel: () => void;
}

export function AddClientPage({ client, onSave, onCancel }: AddClientProps) {
  const [tags, setTags] = useState<CompanyTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ general?: string }>({});

  const [formData, setFormData] = useState({
    company_name: client?.company_name || '',
    mobile_number: client?.mobile_number || '',
    email: client?.email || '',
    gstin: client?.gstin || '',
    address1: client?.address1 || '',
    address2: client?.address2 || '',
    city: client?.city || '',
    postal_code: client?.postal_code || '',
    state: client?.state || '',
    country: client?.country || '',
    selectedTags: client?.tags?.map(t => t.id) || [] as number[]
  });
  const [isFetchingPincode, setIsFetchingPincode] = useState(false);

  // Fetch Tags directly in the component
  useEffect(() => {
    const fetchTags = async () => {
      try {

        const res = await axiosInstance.get("/company-tags/");
        if (res.status === 200) {
          setTags(res.data);
        }

        // Simulate API call


      } catch (err) {
        console.error("Failed to fetch tags", err);
      } finally {
        setLoadingTags(false);
      }
    };
    fetchTags();
    // Clear any errors on mount
    setErrors({});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // For mobile number, only allow exactly 10 digits
    if (name === 'mobile_number') {
      const digitsOnly = value.replace(/[^0-9]/g, '');
      if (digitsOnly.length <= 10) {
        setFormData({ ...formData, [name]: digitsOnly });
      }
    }
    // For postal code, only allow exactly 6 digits, and auto-fetch city/state once complete
    else if (name === 'postal_code') {
      const digitsOnly = value.replace(/[^0-9]/g, '');
      if (digitsOnly.length <= 6) {
        setFormData(prev => ({ ...prev, postal_code: digitsOnly }));
        if (digitsOnly.length === 6) {
          handlePincodeLookup(digitsOnly);
        }
      }
    }
    // For GSTIN, only allow alphanumeric characters and limit to 15 characters (optional field)
    else if (name === 'gstin') {
      const alphanumericOnly = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (alphanumericOnly.length <= 15) {
        setFormData({ ...formData, gstin: alphanumericOnly });
      }
    }
    else {
      setFormData({ ...formData, [name]: value });
    }
    setErrors({});
  };

  const handlePincodeLookup = async (pincode: string) => {
    setIsFetchingPincode(true);
    try {
      const details = await fetchPincodeDetails(pincode);
      if (details) {
        setFormData(prev => ({ ...prev, city: details.city, state: details.state }));
      }
    } finally {
      setIsFetchingPincode(false);
    }
  };

  const handleTagToggle = (tagId: number) => {
    setFormData(prev => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tagId)
        ? prev.selectedTags.filter(id => id !== tagId)
        : [...prev.selectedTags, tagId]
    }));
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const payload = {
      ...formData,
      // send only tag IDs to the API
      tags: formData.selectedTags,
      country_code: '+91',
    };

    try {

      const response = client
        ? await axiosInstance.put(`/client/${client.id}/`, payload)
        : await axiosInstance.post("/client/", payload);
      if (response.status === 201 || response.status === 200) {
        console.log("Client saved:", response.data);
      }

      const savedClient: Client = {
        ...response.data,
        // for UI, convert tag ids back to tag objects
        tags: tags.filter(t => formData.selectedTags.includes(t.id))
      };

      onSave(savedClient);
    } catch (error) {
      const apiErrors = parseApiErrors(error);
      setErrors(apiErrors);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-fade-in-down">
      {/* Breadcrumb Navigation */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <button
          onClick={() => { setErrors({}); onCancel(); }}
          className="text-blue-600 hover:text-blue-800 font-semibold transition-colors"
        >
          Contacts
        </button>
        <span className="text-gray-400 dark:text-gray-500">/</span>
        <span className="text-gray-700 font-medium dark:text-gray-300">{client ? 'Edit Client' : 'Add New Client'}</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 dark:bg-gray-900 dark:border-gray-800">
        <h3 className="text-xl font-bold text-gray-900 mb-8 dark:text-white">
          Client Details
        </h3>

        {errors.general && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
            <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
            </svg>
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Company Information Section */}
          <div className="space-y-6">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">General Information</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <span className="text-red-500 mr-1">*</span>Company Name
                </label>
                <input
                  required
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Enter company name"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <span className="text-red-500 mr-1">*</span>Mobile Number
                </label>
                <input
                  required
                  type="tel"
                  name="mobile_number"
                  value={formData.mobile_number}
                  onChange={handleChange}
                  maxLength={10}
                  pattern="[0-9]{10}"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Enter 10-digit phone number"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <span className="text-red-500 mr-1">*</span>Email
                </label>
                <input
                  required
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Enter email address"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">GSTIN</label>
                <input
                  name="gstin"
                  value={formData.gstin}
                  onChange={handleChange}
                  maxLength={15}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all uppercase dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Enter GSTIN (optional)"
                  title="15-character GSTIN"
                />
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div className="border-t pt-6 space-y-6">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Address</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Address 1</label>
                <input
                  name="address1"
                  value={formData.address1}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Flat, building, street"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Address 2</label>
                <input
                  name="address2"
                  value={formData.address2}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Area, landmark (optional)"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Postal Code</label>
                <input
                  name="postal_code"
                  value={formData.postal_code}
                  onChange={handleChange}
                  inputMode="numeric"
                  maxLength={6}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Enter 6-digit pincode"
                />
                {isFetchingPincode && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">Fetching city and state...</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">City</label>
                <input
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Enter city"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">State</label>
                <input
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Enter state"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Country</label>
                <input
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                  placeholder="Enter country"
                />
              </div>
            </div>
          </div>

          {/* Tags Section */}
          <div className="border-t pt-6 space-y-4">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Company Tags</h4>
            {loadingTags ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading tags from API...</p>
            ) : (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3 dark:text-gray-300">Industry</p>
                <div className="flex flex-wrap gap-3">
                  {tags.map(tag => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.selectedTags.includes(tag.id)}
                        onChange={() => handleTagToggle(tag.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer / Save Button */}
          <div className="pt-8 border-t flex justify-center gap-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-8 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`px-8 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isSaving ? 'opacity-70' : ''}`}
            >
              {isSaving ? 'Saving...' : client ? 'Update Client' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

