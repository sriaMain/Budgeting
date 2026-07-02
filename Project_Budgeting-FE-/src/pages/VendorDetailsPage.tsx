import React from 'react';
import { ArrowLeft, Edit2, Mail, Phone, Building2, User, Calendar } from 'lucide-react';
import type { Vendor } from './ContactsScreen';

interface VendorDetailsPageProps {
  vendor: Vendor;
  onEdit: () => void;
  onBack: () => void;
}

export function VendorDetailsPage({ vendor, onEdit, onBack }: VendorDetailsPageProps) {
  // Get vendor type display label
  const getVendorTypeLabel = (type: string) => {
    return type === 'freelancer' ? 'Freelancer' : type === 'company' ? 'Company' : type;
  };

  const getVendorTypeIcon = () => {
    return vendor.vendor_type === 'company' ? Building2 : User;
  };

  const VendorTypeIcon = getVendorTypeIcon();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
            <p className="text-sm text-gray-600 mt-1">Vendor Details</p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Edit2 className="w-4 h-4" />
          Edit Vendor
        </button>
      </div>

      {/* Vendor Information Card */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {/* Header Section with Icon */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
              <VendorTypeIcon className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{vendor.name}</h2>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white mt-2">
                {getVendorTypeLabel(vendor.vendor_type)}
              </span>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Email */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Email Address</p>
                <a
                  href={`mailto:${vendor.email}`}
                  className="text-base text-gray-900 hover:text-blue-600 transition-colors"
                >
                  {vendor.email}
                </a>
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Phone Number</p>
                <a
                  href={`tel:${vendor.phone}`}
                  className="text-base text-gray-900 hover:text-green-600 transition-colors"
                >
                  {vendor.phone}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Metadata */}
        {(vendor.created_at || vendor.updated_at) && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vendor.created_at && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span>
                    Created on{' '}
                    {new Date(vendor.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              )}
              {vendor.updated_at && vendor.updated_at !== vendor.created_at && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span>
                    Last updated on{' '}
                    {new Date(vendor.updated_at).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Additional Info Placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
        <p className="text-sm text-gray-600">
          Additional vendor details and transaction history will appear here.
        </p>
      </div>
    </div>
  );
}
