import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, X } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { toast } from 'react-hot-toast';
import type { Vendor } from './ContactsScreen';

interface AddVendorPageProps {
  vendor?: Vendor;
  onSave: (vendor: Vendor) => void;
  onCancel: () => void;
}

interface VendorTypeChoice {
  value: string;
  label: string;
}

export function AddVendorPage({ vendor, onSave, onCancel }: AddVendorPageProps) {
  const isEditing = !!vendor;

  const [formData, setFormData] = useState({
    name: vendor?.name || '',
    vendor_type: vendor?.vendor_type || '',
    email: vendor?.email || '',
    phone: vendor?.phone || ''
  });

  const [vendorTypes, setVendorTypes] = useState<VendorTypeChoice[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch vendor type choices
  useEffect(() => {
    const fetchVendorTypes = async () => {
      try {
        setIsLoadingTypes(true);
        const response = await axiosInstance.get('/accounts/vendors/choices/');
        if (response.status === 200 && response.data.vendor_types) {
          setVendorTypes(response.data.vendor_types);
          // Set default if not editing
          if (!isEditing && response.data.vendor_types.length > 0) {
            setFormData(prev => ({
              ...prev,
              vendor_type: response.data.vendor_types[0].value
            }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch vendor types:', error);
        toast.error('Failed to load vendor types');
        // Set default types as fallback
        setVendorTypes([
          { value: 'freelancer', label: 'Freelancer' },
          { value: 'company', label: 'Company' }
        ]);
        if (!isEditing) {
          setFormData(prev => ({ ...prev, vendor_type: 'freelancer' }));
        }
      } finally {
        setIsLoadingTypes(false);
      }
    };

    fetchVendorTypes();
  }, [isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Vendor name is required';
    }

    if (!formData.vendor_type) {
      newErrors.vendor_type = 'Vendor type is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setIsSaving(true);
      
      const payload = {
        name: formData.name.trim(),
        vendor_type: formData.vendor_type,
        email: formData.email.trim(),
        phone: formData.phone.trim()
      };

      let response;
      if (isEditing) {
        response = await axiosInstance.put(`/accounts/vendors/${vendor.id}/`, payload);
        toast.success('Vendor updated successfully!');
      } else {
        response = await axiosInstance.post('/accounts/vendors/', payload);
        toast.success('Vendor created successfully!');
      }

      if (response.status === 200 || response.status === 201) {
        onSave(response.data);
      }
    } catch (error: any) {
      console.error('Error saving vendor:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error ||
                          `Failed to ${isEditing ? 'update' : 'create'} vendor`;
      toast.error(errorMessage);

      // Set field-specific errors if available
      if (error.response?.data) {
        const apiErrors: Record<string, string> = {};
        Object.keys(error.response.data).forEach(key => {
          if (Array.isArray(error.response.data[key])) {
            apiErrors[key] = error.response.data[key][0];
          } else {
            apiErrors[key] = error.response.data[key];
          }
        });
        setErrors(apiErrors);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing ? 'Edit Vendor' : 'Add Vendor'}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {isEditing ? 'Update vendor information' : 'Create a new vendor'}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Vendor Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              <span className="text-red-500">*</span> Vendor Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Enter vendor name"
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Vendor Type */}
          <div className="space-y-2">
            <label htmlFor="vendor_type" className="block text-sm font-medium text-gray-700">
              <span className="text-red-500">*</span> Vendor Type
            </label>
            <select
              id="vendor_type"
              name="vendor_type"
              value={formData.vendor_type}
              onChange={handleChange}
              disabled={isLoadingTypes}
              className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.vendor_type ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
            >
              <option value="">Select vendor type</option>
              {vendorTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {errors.vendor_type && (
              <p className="text-sm text-red-600">{errors.vendor_type}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              <span className="text-red-500">*</span> Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.email ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="vendor@example.com"
            />
            {errors.email && (
              <p className="text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              <span className="text-red-500">*</span> Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.phone ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="9876543210"
            />
            {errors.phone && (
              <p className="text-sm text-red-600">{errors.phone}</p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isLoadingTypes}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isEditing ? 'Update Vendor' : 'Create Vendor'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
