"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, Trash2, Download, Upload, X } from "lucide-react"
import toast from "react-hot-toast"

interface CostItem {
  id: string
  category: string
  description: string
  rate: number
  unit: string
  createdAt: string
  updatedAt: string
}

interface CostLibrary {
  id: string
  name: string
  region: string
  description?: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
  items: CostItem[]
  _count: {
    items: number
  }
}

export default function CostLibrariesPage() {
  const [selectedLibrary, setSelectedLibrary] = useState<string>("")
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddItemModal, setShowAddItemModal] = useState(false)
  const [showEditItemModal, setShowEditItemModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false)
  const [libraries, setLibraries] = useState<CostLibrary[]>([])
  const [loading, setLoading] = useState(true)
  const [editingLibrary, setEditingLibrary] = useState<CostLibrary | null>(null)
  const [editingItem, setEditingItem] = useState<CostItem | null>(null)
  const [deletingLibrary, setDeletingLibrary] = useState<CostLibrary | null>(null)
  const [deletingItem, setDeletingItem] = useState<CostItem | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    region: "",
    description: "",
    isDefault: false
  })
  const [itemFormData, setItemFormData] = useState({
    category: "",
    description: "",
    rate: "",
    unit: ""
  })

  const currentLibrary = libraries.find((l) => l.id === selectedLibrary)

  // Fetch libraries from API
  useEffect(() => {
    fetchLibraries()
  }, [])

  const fetchLibraries = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/cost-libraries")
      if (response.ok) {
        const data = await response.json()
        setLibraries(data.libraries)
        if (data.libraries.length > 0 && !selectedLibrary) {
          setSelectedLibrary(data.libraries[0].id)
        }
      } else {
        toast.error("Failed to fetch cost libraries")
      }
    } catch (error) {
      console.error("Error fetching cost libraries:", error)
      toast.error("Failed to fetch cost libraries")
    } finally {
      setLoading(false)
    }
  }

  const handleAddLibrary = async () => {
    if (!formData.name || !formData.region) {
      toast.error("Name and region are required")
      return
    }

    try {
      const response = await fetch("/api/cost-libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const newLibrary = await response.json()
        setLibraries([newLibrary, ...libraries])
        setFormData({ name: "", region: "", description: "", isDefault: false })
      setShowAddModal(false)
        setSelectedLibrary(newLibrary.id)
        toast.success("Cost library created successfully")
      } else {
        toast.error("Failed to create cost library")
      }
    } catch (error) {
      console.error("Error creating cost library:", error)
      toast.error("Failed to create cost library")
    }
  }

  const handleEditLibrary = async () => {
    if (!editingLibrary || !formData.name || !formData.region) {
      toast.error("Name and region are required")
      return
    }

    try {
      const response = await fetch(`/api/cost-libraries/${editingLibrary.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const updatedLibrary = await response.json()
        setLibraries(libraries.map(lib => 
          lib.id === editingLibrary.id ? updatedLibrary : lib
        ))
        setFormData({ name: "", region: "", description: "", isDefault: false })
        setShowEditModal(false)
        setEditingLibrary(null)
        toast.success("Cost library updated successfully")
      } else {
        toast.error("Failed to update cost library")
      }
    } catch (error) {
      console.error("Error updating cost library:", error)
      toast.error("Failed to update cost library")
    }
  }

  const openEditLibrary = (library: CostLibrary) => {
    setEditingLibrary(library)
    setFormData({
      name: library.name,
      region: library.region,
      description: library.description || "",
      isDefault: library.isDefault
    })
    setShowEditModal(true)
  }

  const handleDeleteLibrary = async () => {
    if (!deletingLibrary) return

    try {
      const response = await fetch(`/api/cost-libraries/${deletingLibrary.id}`, {
        method: "DELETE"
      })

      if (response.ok) {
        setLibraries(libraries.filter((l) => l.id !== deletingLibrary.id))
        if (selectedLibrary === deletingLibrary.id) {
          setSelectedLibrary(libraries.find(l => l.id !== deletingLibrary.id)?.id || "")
        }
        setShowDeleteModal(false)
        setDeletingLibrary(null)
        toast.success("Cost library deleted successfully")
      } else {
        toast.error("Failed to delete cost library")
      }
    } catch (error) {
      console.error("Error deleting cost library:", error)
      toast.error("Failed to delete cost library")
    }
  }

  const openDeleteLibrary = (library: CostLibrary) => {
    setDeletingLibrary(library)
    setShowDeleteModal(true)
  }

  const handleAddItem = async () => {
    if (!currentLibrary || !itemFormData.category || !itemFormData.description || !itemFormData.rate || !itemFormData.unit) {
      toast.error("All fields are required")
      return
    }

    try {
      const response = await fetch("/api/cost-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...itemFormData,
          libraryId: currentLibrary.id,
          rate: parseFloat(itemFormData.rate)
        })
      })

      if (response.ok) {
        const newItem = await response.json()
        setLibraries(libraries.map(lib => 
          lib.id === currentLibrary.id 
            ? { ...lib, items: [...lib.items, newItem], _count: { items: lib._count.items + 1 } }
            : lib
        ))
        setItemFormData({ category: "", description: "", rate: "", unit: "" })
        setShowAddItemModal(false)
        toast.success("Cost item added successfully")
      } else {
        toast.error("Failed to add cost item")
      }
    } catch (error) {
      console.error("Error adding cost item:", error)
      toast.error("Failed to add cost item")
    }
  }

  const handleEditItem = async () => {
    if (!editingItem || !itemFormData.category || !itemFormData.description || !itemFormData.rate || !itemFormData.unit) {
      toast.error("All fields are required")
      return
    }

    try {
      const response = await fetch(`/api/cost-items/${editingItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...itemFormData,
          rate: parseFloat(itemFormData.rate)
        })
      })

      if (response.ok) {
        const updatedItem = await response.json()
        setLibraries(libraries.map(lib => 
          lib.id === currentLibrary?.id 
            ? { 
                ...lib, 
                items: lib.items.map(item => 
                  item.id === editingItem.id ? updatedItem : item
                )
              }
            : lib
        ))
        setItemFormData({ category: "", description: "", rate: "", unit: "" })
        setShowEditItemModal(false)
        setEditingItem(null)
        toast.success("Cost item updated successfully")
      } else {
        toast.error("Failed to update cost item")
      }
    } catch (error) {
      console.error("Error updating cost item:", error)
      toast.error("Failed to update cost item")
    }
  }

  const handleDeleteItem = async () => {
    if (!deletingItem) return

    try {
      const response = await fetch(`/api/cost-items/${deletingItem.id}`, {
        method: "DELETE"
      })

      if (response.ok) {
        setLibraries(libraries.map(lib => 
          lib.id === currentLibrary?.id 
            ? { 
                ...lib, 
                items: lib.items.filter(item => item.id !== deletingItem.id),
                _count: { items: lib._count.items - 1 }
              }
            : lib
        ))
        setShowDeleteItemModal(false)
        setDeletingItem(null)
        toast.success("Cost item deleted successfully")
      } else {
        toast.error("Failed to delete cost item")
      }
    } catch (error) {
      console.error("Error deleting cost item:", error)
      toast.error("Failed to delete cost item")
    }
  }

  const openDeleteItem = (item: CostItem) => {
    setDeletingItem(item)
    setShowDeleteItemModal(true)
  }

  const openEditItem = (item: CostItem) => {
    setEditingItem(item)
    setItemFormData({
      category: item.category,
      description: item.description,
      rate: item.rate.toString(),
      unit: item.unit
    })
    setShowEditItemModal(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Cost Libraries</h1>
          <p className="text-slate-400">Manage regional and custom cost rates</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
        >
          <Plus size={20} />
          New Library
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      ) : (
      <div className="grid lg:grid-cols-4 gap-6">
        {/* Library List */}
        <div className="lg:col-span-1">
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-4">Your Libraries</p>
              {libraries.length === 0 ? (
                <p className="text-slate-400 text-sm">No libraries yet</p>
              ) : (
                libraries.map((lib) => (
              <button
                key={lib.id}
                onClick={() => setSelectedLibrary(lib.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                  selectedLibrary === lib.id
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                    : "hover:bg-slate-700/50 text-slate-300"
                }`}
              >
                <p className="font-medium text-sm">{lib.name}</p>
                <p className="text-xs text-slate-400 mt-1">{lib.region}</p>
                {lib.isDefault && (
                  <span className="inline-block mt-2 px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded">
                    Default
                  </span>
                )}
              </button>
                ))
              )}
            </div>
        </div>

        {/* Library Details */}
        {currentLibrary && (
          <div className="lg:col-span-3 space-y-6">
            {/* Library Info */}
            <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-semibold">{currentLibrary.name}</h2>
                  <p className="text-slate-400 text-sm mt-1">Region: {currentLibrary.region}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => openEditLibrary(currentLibrary)}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors" 
                    title="Edit Library"
                  >
                    <Edit size={20} />
                  </button>
                  <button
                    onClick={() => openDeleteLibrary(currentLibrary)}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Delete Library"
                  >
                    <Trash2 size={20} className="text-rose-400" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm">
                  <Download size={16} />
                  Export to CSV
                </button>
                <button className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm">
                  <Upload size={16} />
                  Import from CSV
                </button>
              </div>
            </div>

            {/* Cost Items */}
            {currentLibrary.items.length > 0 ? (
              <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
                <h3 className="font-semibold mb-4">Cost Items</h3>
                <div className="space-y-2">
                  {currentLibrary.items.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-700/20 border border-slate-600 hover:bg-slate-700/40 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{item.description}</p>
                        <p className="text-xs text-slate-400">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-cyan-400">
                          ${item.rate.toFixed(2)}/{item.unit}
                        </span>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => openEditItem(item)}
                            className="p-1 hover:bg-slate-600 rounded transition-colors"
                            title="Edit Item"
                          >
                          <Edit size={16} />
                        </button>
                          <button 
                            onClick={() => openDeleteItem(item)}
                            className="p-1 hover:bg-slate-600 rounded transition-colors"
                            title="Delete Item"
                          >
                            <Trash2 size={16} className="text-rose-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setShowAddItemModal(true)}
                  className="mt-4 w-full px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm"
                >
                  Add Item
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 text-center">
                <p className="text-slate-400">No cost items yet. Add items to get started.</p>
                <button 
                  onClick={() => setShowAddItemModal(true)}
                  className="mt-4 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm"
                >
                  Add Item
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Add Library Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Create New Cost Library</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Library Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Regional NSW 2025"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Region</label>
                <select
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                >
                  <option value="">Select region</option>
                  <option value="NSW">Sydney Metro</option>
                  <option value="QLD">Brisbane Metro</option>
                  <option value="VIC">Melbourne Metro</option>
                  <option value="WA">Perth Metro</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this cost library"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="w-4 h-4 text-cyan-500 bg-slate-700 border-slate-600 rounded focus:ring-cyan-500 focus:ring-2"
                />
                <label htmlFor="isDefault" className="text-sm text-slate-300">
                  Set as default cost library
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLibrary}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Library Modal */}
      {showEditModal && editingLibrary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Edit Cost Library</h2>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Library Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Regional NSW 2025"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Region</label>
                <select
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                >
                  <option value="">Select region</option>
                  <option value="NSW">Sydney Metro</option>
                  <option value="QLD">Brisbane Metro</option>
                  <option value="VIC">Melbourne Metro</option>
                  <option value="WA">Perth Metro</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this cost library"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isDefaultEdit"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="w-4 h-4 text-cyan-500 bg-slate-700 border-slate-600 rounded focus:ring-cyan-500 focus:ring-2"
                />
                <label htmlFor="isDefaultEdit" className="text-sm text-slate-300">
                  Set as default cost library
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditLibrary}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                >
                  Update Library
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItemModal && currentLibrary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Add Cost Item to {currentLibrary.name}</h2>
              <button onClick={() => setShowAddItemModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <input
                  type="text"
                  value={itemFormData.category}
                  onChange={(e) => setItemFormData({ ...itemFormData, category: e.target.value })}
                  placeholder="e.g., Labor, Materials, Equipment"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <input
                  type="text"
                  value={itemFormData.description}
                  onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                  placeholder="e.g., Water Extraction (per hour)"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemFormData.rate}
                    onChange={(e) => setItemFormData({ ...itemFormData, rate: e.target.value })}
                    placeholder="150.00"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Unit</label>
                  <input
                    type="text"
                    value={itemFormData.unit}
                    onChange={(e) => setItemFormData({ ...itemFormData, unit: e.target.value })}
                    placeholder="hour, day, item"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddItemModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                >
                  Add Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditItemModal && editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Edit Cost Item</h2>
              <button onClick={() => setShowEditItemModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <input
                  type="text"
                  value={itemFormData.category}
                  onChange={(e) => setItemFormData({ ...itemFormData, category: e.target.value })}
                  placeholder="e.g., Labor, Materials, Equipment"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <input
                  type="text"
                  value={itemFormData.description}
                  onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                  placeholder="e.g., Water Extraction (per hour)"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemFormData.rate}
                    onChange={(e) => setItemFormData({ ...itemFormData, rate: e.target.value })}
                    placeholder="150.00"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Unit</label>
                  <input
                    type="text"
                    value={itemFormData.unit}
                    onChange={(e) => setItemFormData({ ...itemFormData, unit: e.target.value })}
                    placeholder="hour, day, item"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowEditItemModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditItem}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                >
                  Update Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Library Confirmation Modal */}
      {showDeleteModal && deletingLibrary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-rose-400">Delete Cost Library</h2>
              <button onClick={() => setShowDeleteModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                <p className="text-slate-300 mb-2">
                  Are you sure you want to delete the cost library <strong className="text-white">"{deletingLibrary.name}"</strong>?
                </p>
                <p className="text-sm text-slate-400">
                  This will permanently delete the library and all {deletingLibrary._count.items} cost items in it. This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteLibrary}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-rose-500 to-red-500 rounded-lg font-medium hover:shadow-lg hover:shadow-rose-500/50 transition-all"
                >
                  Delete Library
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {showDeleteItemModal && deletingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-rose-400">Delete Cost Item</h2>
              <button onClick={() => setShowDeleteItemModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                <p className="text-slate-300 mb-2">
                  Are you sure you want to delete the cost item <strong className="text-white">"{deletingItem.description}"</strong>?
                </p>
                <p className="text-sm text-slate-400">
                  This will permanently delete the item from the cost library. This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDeleteItemModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteItem}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-rose-500 to-red-500 rounded-lg font-medium hover:shadow-lg hover:shadow-rose-500/50 transition-all"
                >
                  Delete Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
