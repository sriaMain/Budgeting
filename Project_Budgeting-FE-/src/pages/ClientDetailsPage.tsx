import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Client, POC } from "../pages/ClientListPage";
import { AddPOCModal } from "../components/AddPOCModal";
import { MapPin, Phone, Building2, Edit3, X, Mail } from "lucide-react";

interface ClientDetailsProps {
  client: Client;
  pocs: POC[];
  onAddPOC: (poc: POC) => void;
  onEdit: () => void;
  onBack: () => void;
}

export function ClientDetailsPage({ client, pocs, onAddPOC, onEdit, onBack }: ClientDetailsProps) {
  const navigate = useNavigate();
  const [isPOCModalOpen, setIsPOCModalOpen] = useState(false);
  const [selectedPOC, setSelectedPOC] = useState<POC | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingPOC, setEditingPOC] = useState<POC | null>(null);

  const handlePOCClick = (poc: POC) => {
    setSelectedPOC(poc);
    setIsDetailsModalOpen(true);
  };

  const handleEditPOC = (poc: POC, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the card click
    setEditingPOC(poc);
    setIsPOCModalOpen(true);
  };

  const handleCloseDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedPOC(null);
  };

  const handleClosePOCModal = () => {
    setIsPOCModalOpen(false);
    setEditingPOC(null);
  };

  return (
    <div className="space-y-6 animate-fade-in-down">
      {/* Breadcrumb / Back */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="text-blue-600 hover:text-blue-800 font-semibold transition-colors"
        >
          Contacts
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-medium">{client.company_name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-3xl font-bold text-gray-900">{client.company_name}</h2>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/pipeline/add-quote', { state: { clientName: client.company_name } })}
            className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
          >
            Add Quote
          </button>
          <button
            onClick={onEdit}
            className="px-6 py-2.5 text-blue-600 font-semibold border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Modify
          </button>
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Location Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Location & Contact</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-gray-600">{client.city}, {client.state}</p>
                <p className="text-xs text-gray-500 mt-1">{client.street_address}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <p className="text-gray-600">{client.mobile_number}</p>
            </div>
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <p className="text-blue-600 hover:underline cursor-pointer text-xs">{client.email}</p>
            </div>
          </div>
        </div>

        {/* Company Info Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-3">
          <h3 className="font-bold text-gray-900 text-sm">Company Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-600">Industry:</span>
              <span className="font-medium text-gray-900">{client.tags[0]?.name || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-600">GSTIN:</span>
              <span className="font-medium text-gray-900">{client.gstin || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className="font-medium text-green-600">Active</span>
            </div>
          </div>
        </div>

        {/* People (POCs) Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 text-sm">Points of Contact</h3>
            <button
              onClick={() => setIsPOCModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded-md font-semibold transition-colors"
            >
              Add POC
            </button>
          </div>
          <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-56">
            {pocs.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-4">No contacts yet.</p>
            ) : (
              pocs.map((poc, idx) => (
                <div
                  key={idx}
                  onClick={() => handlePOCClick(poc)}
                  className="flex items-start gap-3 pb-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 -mx-4 px-4 py-2 rounded transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {poc.poc_name.substring(0, 1).toUpperCase()}
                  </div>
                  <div className="text-xs flex-1">
                    <p className="font-semibold text-gray-900">{poc.poc_name}</p>
                    <p className="text-gray-600">{poc.designation}</p>
                    <p className="text-gray-500 mt-0.5">{poc.poc_mobile}</p>
                  </div>
                  <button
                    onClick={(e) => handleEditPOC(poc, e)}
                    className="text-gray-600 opacity-100 group-hover:opacity-100 p-1.5 hover:text-blue-800 hover:bg-blue-50 rounded transition-all"
                    aria-label="Edit POC"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* POC Modal for Add/Edit */}
      {isPOCModalOpen && (
        <AddPOCModal
          companyId={client.id}
          companyName={client.company_name}
          poc={editingPOC || undefined}
          onSave={onAddPOC}
          onClose={handleClosePOCModal}
        />
      )}

      {/* POC Details Modal */}
      {isDetailsModalOpen && selectedPOC && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in-down">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Contact Details</h3>
              <button
                onClick={handleCloseDetailsModal}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Avatar and Name */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                  {selectedPOC.poc_name.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900">{selectedPOC.poc_name}</h4>
                  <p className="text-sm text-gray-600">{selectedPOC.designation}</p>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Building2 size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">Company</p>
                    <p className="text-sm font-medium text-gray-900">{selectedPOC.company_name}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">Phone</p>
                    <a href={`tel:${selectedPOC.poc_mobile}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {selectedPOC.poc_mobile}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">Email</p>
                    <a href={`mailto:${selectedPOC.poc_email}`} className="text-sm font-medium text-blue-600 hover:underline break-all">
                      {selectedPOC.poc_email}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleCloseDetailsModal}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={(e: any) => {
                  handleCloseDetailsModal();
                  handleEditPOC(selectedPOC, e);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Edit3 size={16} />
                Edit Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
