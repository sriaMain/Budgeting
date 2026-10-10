import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Client, CompanyTag } from "../pages/ClientListPage";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
import { fetchPincodeDetails } from "../utils/pincodeLookup";
import { Toast } from "./Toast";

interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientAdded: (client: Client) => void;
}

export function AddClientModal({ isOpen, onClose, onClientAdded }: AddClientModalProps) {
  const [tags, setTags] = useState<CompanyTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ general?: string }>({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  
  const [formData, setFormData] = useState({
    company_name: '',
    mobile_number: '',
    email: '',
    gstin: '',
    address1: '',
    address2: '',
    city: '',
    postal_code: '',
    state: '',
    country: '',
    selectedTags: [] as number[]
  });
  const [isFetchingPincode, setIsFetchingPincode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTags();
      // Reset form when modal opens
      setFormData({
        company_name: '',
        mobile_number: '',
        email: '',
        gstin: '',
        address1: '',
        address2: '',
        city: '',
        postal_code: '',
        state: '',
        country: '',
        selectedTags: []
      });
      setErrors({});
    }
  }, [isOpen]);

  const fetchTags = async () => {
    setLoadingTags(true);
    try {
      const res = await axiosInstance.get("/company-tags/");
      if (res.status === 200) {
        setTags(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch tags", err);
    } finally {
      setLoadingTags(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'postal_code') {
      const digitsOnly = value.replace(/[^0-9]/g, '');
      if (digitsOnly.length <= 6) {
        setFormData(prev => ({ ...prev, postal_code: digitsOnly }));
        if (digitsOnly.length === 6) {
          handlePincodeLookup(digitsOnly);
        }
      }
    } else if (name === 'gstin') {
      const alphanumericOnly = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (alphanumericOnly.length <= 15) {
        setFormData({ ...formData, gstin: alphanumericOnly });
      }
    } else {
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
      tags: formData.selectedTags,
      country_code: '+91',
    };

    try {
      const response = await axiosInstance.post("/client/", payload);
      if (response.status === 201 || response.status === 200) {
        const savedClient: Client = {
          ...response.data,
          tags: tags.filter(t => formData.selectedTags.includes(t.id))
        };
        onClientAdded(savedClient);
        
        // Show success toast
        setToastMessage("Client added successfully!");
        setShowToast(true);
        
        // Close modal after delay to show toast
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (error) {
      const apiErrors = parseApiErrors(error);
      setErrors(apiErrors);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      setErrors({});
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all dark:bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto transform transition-all dark:bg-gray-900 dark:shadow-black/40"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New Client</h3>
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {errors.general && (
              <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
                </svg>
                {errors.general}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* General Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">General Information</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span className="text-red-500 mr-1">*</span>Company Name
                    </label>
                    <input
                      required
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Enter company name"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span className="text-red-500 mr-1">*</span>Mobile Number
                    </label>
                    <input
                      required
                      name="mobile_number"
                      value={formData.mobile_number}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Enter phone number"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span className="text-red-500 mr-1">*</span>Email
                    </label>
                    <input
                      required
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Enter email address"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">GSTIN</label>
                    <input
                      name="gstin"
                      value={formData.gstin}
                      onChange={handleChange}
                      maxLength={15}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm uppercase dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Enter GSTIN (optional)"
                    />
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Address</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Address 1</label>
                    <input
                      name="address1"
                      value={formData.address1}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Flat, building, street"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Address 2</label>
                    <input
                      name="address2"
                      value={formData.address2}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Area, landmark (optional)"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Postal Code</label>
                    <input
                      name="postal_code"
                      value={formData.postal_code}
                      onChange={handleChange}
                      inputMode="numeric"
                      maxLength={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Enter 6-digit pincode"
                    />
                    {isFetchingPincode && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">Fetching city and state...</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">City</label>
                    <input
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Enter city"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">State</label>
                    <input
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Enter state"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Country</label>
                    <input
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-violet-500"
                      placeholder="Enter country"
                    />
                  </div>
                </div>
              </div>

              {/* Tags Section */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide dark:text-gray-300">Company Tags</h4>
                {loadingTags ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading tags...</p>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-300">Industry</p>
                    <div className="flex flex-wrap gap-3">
                      {tags.map(tag => (
                        <label key={tag.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100">
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

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSaving}
                  className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Creating...' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      {/* Toast Notification */}
      {showToast && (
        <Toast
          message={toastMessage}
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
}
