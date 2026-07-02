import { useState, useEffect } from "react";
import { X } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";
import { parseApiErrors } from "../utils/parseApiErrors";

interface ProductGroup {
  id: number;
  product_group: string;
}

interface Service {
  id: string;
  product_service_name: string;
  description: string;
  product_group: string;
}

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServiceAdded: (service: Service) => void;
}

export function AddServiceModal({ isOpen, onClose, onServiceAdded }: AddServiceModalProps) {
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ general?: string }>({});

  const [formData, setFormData] = useState({
    product_service_name: '',
    description: '',
    product_group: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetchProductGroups();
      // Reset form when modal opens
      setFormData({
        product_service_name: '',
        description: '',
        product_group: ''
      });
      setErrors({});
    }
  }, [isOpen]);

  const fetchProductGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await axiosInstance.get("/product-groups/");
      if (res.status === 200) {
        setProductGroups(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch product groups", err);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.product_service_name || !formData.product_group) {
      setErrors({ general: 'Please fill in all required fields' });
      return;
    }

    setIsSaving(true);

    const payload = {
      product_service_name: formData.product_service_name,
      description: formData.description,
      product_group: parseInt(formData.product_group, 10)
    };

    try {
      const response = await axiosInstance.post("/product-services/", payload);
      if (response.status === 201 || response.status === 200) {
        const savedService: Service = {
          ...response.data,
          product_group: productGroups.find(g => g.id === parseInt(formData.product_group))?.product_group || ''
        };
        onServiceAdded(savedService);
        onClose();
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
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h3 className="text-xl font-bold text-gray-900">Add New Service/Product</h3>
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

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Service Name */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  <span className="text-red-500 mr-1">*</span>Service/Product Name
                </label>
                <input
                  required
                  name="product_service_name"
                  value={formData.product_service_name}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                  placeholder="Enter service or product name"
                />
              </div>

              {/* Product Group */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  <span className="text-red-500 mr-1">*</span>Product Group
                </label>
                {loadingGroups ? (
                  <p className="text-sm text-gray-500">Loading groups...</p>
                ) : (
                  <select
                    required
                    name="product_group"
                    value={formData.product_group}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                  >
                    <option value="">Select Product Group</option>
                    {productGroups.map(group => (
                      <option key={group.id} value={group.id}>
                        {group.product_group}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm resize-none"
                  placeholder="Enter description (optional)"
                />
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
                  {isSaving ? 'Creating...' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
