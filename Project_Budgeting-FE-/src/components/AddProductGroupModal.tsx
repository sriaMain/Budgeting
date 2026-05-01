import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance'; // Assuming you have this
import { Toast } from './Toast';

interface AddProductGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newGroup: { id: string; product_group: string }) => void;
}

const AddProductGroupModal: React.FC<AddProductGroupModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [groupName, setGroupName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      // API call to create product group
       const response = await axiosInstance.post('/product-groups/', {product_group_name: groupName });
      
       const newGroup = response.data;
       console.log("API response:", response);
      
      onSuccess(newGroup);
      setGroupName('');
      
      // Show toast and close after delay
      setIsClosing(true);
      setShowToast(true);
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, 1800);
    } catch (err) {
      setError('Failed to create product group. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 transform transition-all scale-100 p-6 relative">
        {/* Blur overlay when closing */}
        {isClosing && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 pointer-events-auto rounded-xl" />
        )}
        
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">Add Product Group</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Group Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="e.g. Finance Modules"
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !groupName.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              Save Group
            </button>
          </div>
        </form>
        
        {/* Toast Notification */}
        {showToast && (
          <Toast
            message="Product group created successfully!"
            type="success"
            onClose={() => setShowToast(false)}
          />
        )}
      </div>
    </div>
  );
};

export default AddProductGroupModal;