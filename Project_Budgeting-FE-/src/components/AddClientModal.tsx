import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Client, CompanyTag } from "../pages/ClientListPage";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";
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
    street_address: '',
    city: '',
    postal_code: '',
    municipality: '',
    state: '',
    country: '',
    selectedTags: [] as number[]
  });

  useEffect(() => {
    if (isOpen) {
      fetchTags();
      // Reset form when modal opens
      setFormData({
        company_name: '',
        mobile_number: '',
        email: '',
        gstin: '',
        street_address: '',
        city: '',
        postal_code: '',
        municipality: '',
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
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({});
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
        className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-all"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h3 className="text-xl font-bold text-gray-900">Add New Client</h3>
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {errors.general && (
              <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center">
                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
                </svg>
                {errors.general}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* General Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">General Information</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      <span className="text-red-500 mr-1">*</span>Company Name
                    </label>
                    <input 
                      required
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter company name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      <span className="text-red-500 mr-1">*</span>Mobile Number
                    </label>
                    <input 
                      required
                      name="mobile_number"
                      value={formData.mobile_number}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter phone number"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      <span className="text-red-500 mr-1">*</span>Email
                    </label>
                    <input 
                      required
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter email address"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">GSTIN</label>
                    <input 
                      name="gstin"
                      value={formData.gstin}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter GSTIN"
                    />
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Address</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Street Address</label>
                    <input 
                      name="street_address"
                      value={formData.street_address}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter street address"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">City</label>
                    <input 
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter city"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">State</label>
                    <input 
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter state"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Postal Code</label>
                    <input 
                      name="postal_code"
                      value={formData.postal_code}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter postal code"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Municipality</label>
                    <input 
                      name="municipality"
                      value={formData.municipality}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter municipality"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Country</label>
                    <input 
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      placeholder="Enter country"
                    />
                  </div>
                </div>
              </div>

              {/* Tags Section */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Company Tags</h4>
                {loadingTags ? (
                  <p className="text-sm text-gray-500">Loading tags...</p>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-3">Industry</p>
                    <div className="flex flex-wrap gap-3">
                      {tags.map(tag => (
                        <label key={tag.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                          <input 
                            type="checkbox" 
                            checked={formData.selectedTags.includes(tag.id)}
                            onChange={() => handleTagToggle(tag.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
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
                  className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
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
