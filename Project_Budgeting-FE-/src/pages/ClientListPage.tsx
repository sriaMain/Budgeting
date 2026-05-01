import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Building2,
  Phone,
  MapPin,
  Paperclip,
  Briefcase
} from 'lucide-react';

/**
 * ==================================================================
 * SECTION: Types & Interfaces
 * ==================================================================
 */

export interface CompanyTag {
  id: number;
  name: string;
}

export interface Client {
  id: number;
  company_name: string;
  mobile_number: string;
  email: string;
  gstin?: string;
  street_address?: string;
  city?: string;
  postal_code?: string;
  municipality?: string;
  state?: string;
  country?: string;
  tags: CompanyTag[];
  created_at?: string;
  updated_at?: string;
  pocs?: POC[];  // POCs nested in client response
}

export interface POC {
  id: number;
  company: number;
  company_name: string;
  poc_name: string;
  designation: string;
  poc_mobile: string;
  poc_email: string;
}

/**
 * ==================================================================
 * SECTION: ClientListPage Component
 * ==================================================================
 */

interface ClientListProps {
  clients: Client[];
  onAddClient: () => void;
  onSelectClient: (id: number) => void;
}

export function ClientListPage({ clients, onAddClient, onSelectClient }: ClientListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter clients based on search query
  const filteredClients = clients.filter(client => {
    const query = searchQuery.toLowerCase();
    return (
      client.company_name.toLowerCase().includes(query) ||
      client.email.toLowerCase().includes(query) ||
      client.mobile_number.toLowerCase().includes(query) ||
      client.street_address?.toLowerCase().includes(query) ||
      client.city?.toLowerCase().includes(query) ||
      client.state?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in-down">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Contacts</h2>

        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64 text-sm sm:text-base"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          </div>
          <button
            onClick={onAddClient}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-md font-semibold transition-colors whitespace-nowrap shadow-md hover:shadow-lg text-sm sm:text-base"
          >
            <Plus size={18} className="sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Add Client</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Desktop Table View - Hidden on mobile */}
      <div className="hidden md:block bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100/80 text-gray-900 font-bold border-b border-gray-300">
                <th className="py-4 px-6 w-24">ID</th>
                <th className="py-4 px-6">Company Name</th>
                <th className="py-4 px-6">Address</th>
                <th className="py-4 px-6">Email</th>
                <th className="py-4 px-6">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredClients.length > 0 ? (
                filteredClients.map(client => (
                  <tr
                    key={client.id}
                    className="hover:bg-gray-50 transition-colors group cursor-pointer"
                    onClick={() => onSelectClient(client.id)}
                  >
                    <td className="py-4 px-6 font-medium text-gray-500">#{client.id}</td>
                    <td className="py-4 px-6 align-top">
                      <div>
                        <p className="font-bold text-gray-900">{client.company_name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{client.tags?.length > 0 ? client.tags.map(t => t.name).join(', ') : 'No tags'}</p>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {[client.street_address, client.city, client.state].filter(Boolean).join(', ') || 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">{client.email}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">{client.mobile_number}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    No clients found. Click "Add Client" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View - Visible on mobile only */}
      <div className="md:hidden space-y-4">
        {filteredClients.length > 0 ? (
          filteredClients.map(client => (
            <div
              key={client.id}
              onClick={() => onSelectClient(client.id)}
              className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 size={18} className="text-blue-600" />
                    <h3 className="font-bold text-gray-900 text-lg">{client.company_name}</h3>
                  </div>
                  <span className="text-xs text-gray-500">ID: #{client.id}</span>
                </div>
              </div>

              {/* Tags */}
              {client.tags && client.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {client.tags.map(tag => (
                    <span
                      key={tag.id}
                      className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-medium"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Contact Information */}
              <div className="space-y-2">
                {/* Email */}
                <div className="flex items-start gap-2">
                  <Briefcase size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm text-gray-900 truncate">{client.email}</p>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-start gap-2">
                  <Phone size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="text-sm text-gray-900">{client.mobile_number}</p>
                  </div>
                </div>

                {/* Address */}
                {[client.street_address, client.city, client.state].filter(Boolean).length > 0 && (
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Address</p>
                      <p className="text-sm text-gray-900">
                        {[client.street_address, client.city, client.state].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No clients found. Click "Add Client" to create one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
