"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Shield, 
  Building, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  FileText,
  Users,
  Clock,
  TrendingUp,
  Home,
  Briefcase
} from "lucide-react"

interface InsuranceInformationProps {
  onInsuranceUpdate: (insurance: any) => void
  initialData?: any
}

export default function InsuranceInformation({ onInsuranceUpdate, initialData }: InsuranceInformationProps) {
  const [activeTab, setActiveTab] = useState("property")
  const [insuranceData, setInsuranceData] = useState({
    propertyCover: {
      buildings: false,
      fixtures: false,
      services: false,
      improvements: false
    },
    contentsCover: {
      furniture: false,
      machinery: false,
      stock: false,
      equipment: false
    },
    liabilityCover: {
      publicLiability: false,
      businessLiability: false,
      thirdParty: false
    },
    businessInterruption: {
      revenue: false,
      fixedCosts: false,
      relocation: false,
      extraExpenses: false
    },
    additionalCover: {
      flood: false,
      machineryBreakdown: false,
      glass: false,
      money: false,
      portableItems: false,
      theft: false
    }
  })

  // Update component when initialData changes
  useEffect(() => {
    if (initialData) {
      setInsuranceData(prev => ({ ...prev, ...initialData }))
    }
  }, [initialData])

  const tabs = [
    { id: "property", label: "Property Cover", icon: Building },
    { id: "contents", label: "Contents Cover", icon: Home },
    { id: "liability", label: "Liability Cover", icon: Shield },
    { id: "interruption", label: "Business Interruption", icon: Clock },
    { id: "additional", label: "Additional Cover", icon: FileText }
  ]

  const propertyCoverItems = [
    {
      id: "buildings",
      title: "Business Buildings",
      description: "Physical buildings and structures",
      coverage: "Loss or damage to business premises, outbuildings, shelters, verandas, carports"
    },
    {
      id: "fixtures",
      title: "Fixtures and Fittings",
      description: "Permanent fixtures and fittings",
      coverage: "Built-in fixtures, permanent installations, structural fittings"
    },
    {
      id: "services",
      title: "Underground Services",
      description: "Utility and service connections",
      coverage: "Underground and above-ground services, utility connections"
    },
    {
      id: "improvements",
      title: "Structural Improvements",
      description: "Paths, roadways, fencing, and other improvements",
      coverage: "Paths, roadways, fencing, permanent water and fuel tanks, gates, walls, signs"
    }
  ]

  const contentsCoverItems = [
    {
      id: "furniture",
      title: "Business Furniture",
      description: "Office and business furniture",
      coverage: "Desks, chairs, filing cabinets, reception furniture"
    },
    {
      id: "machinery",
      title: "Machinery and Plant",
      description: "Business machinery and equipment",
      coverage: "Manufacturing equipment, production machinery, plant equipment"
    },
    {
      id: "stock",
      title: "Stock in Trade",
      description: "Inventory and merchandise",
      coverage: "Raw materials, finished goods, merchandise for sale"
    },
    {
      id: "equipment",
      title: "Business Equipment",
      description: "Computers, tools, and business equipment",
      coverage: "IT equipment, tools, specialized business equipment"
    }
  ]

  const liabilityCoverItems = [
    {
      id: "publicLiability",
      title: "Public Liability",
      description: "Protection against third-party claims",
      coverage: "Claims from injured visitors, property damage to third parties"
    },
    {
      id: "businessLiability",
      title: "Business Liability",
      description: "General business liability protection",
      coverage: "Legal liability for business operations, professional services"
    },
    {
      id: "thirdParty",
      title: "Third Party Protection",
      description: "Coverage for third-party incidents",
      coverage: "Accidents involving customers, suppliers, or visitors"
    }
  ]

  const businessInterruptionItems = [
    {
      id: "revenue",
      title: "Lost Revenue",
      description: "Income protection during business closure",
      coverage: "Revenue that would have been earned during closure period"
    },
    {
      id: "fixedCosts",
      title: "Fixed Costs",
      description: "Ongoing business expenses",
      coverage: "Staff wages, rent, loan repayments, supplier invoices"
    },
    {
      id: "relocation",
      title: "Temporary Relocation",
      description: "Costs for temporary business location",
      coverage: "Moving expenses, temporary premises, setup costs"
    },
    {
      id: "extraExpenses",
      title: "Extra Expenses",
      description: "Additional costs to maintain operations",
      coverage: "Reasonable expenses to continue business operations"
    }
  ]

  const additionalCoverItems = [
    {
      id: "flood",
      title: "Flood Cover",
      description: "Protection against flood damage",
      coverage: "Loss or damage caused by flood events"
    },
    {
      id: "machineryBreakdown",
      title: "Machinery Breakdown",
      description: "Equipment failure protection",
      coverage: "Sudden and unforeseen breakdown of machinery"
    },
    {
      id: "glass",
      title: "Glass Cover",
      description: "Glass and glazing protection",
      coverage: "Windows, glass doors, display cases, glass fixtures"
    },
    {
      id: "money",
      title: "Money Cover",
      description: "Cash and money protection",
      coverage: "Cash on premises, money in transit, safe contents"
    },
    {
      id: "portableItems",
      title: "Portable Items",
      description: "Mobile equipment protection",
      coverage: "Laptops, tablets, mobile equipment, tools"
    },
    {
      id: "theft",
      title: "Theft Cover",
      description: "Theft and burglary protection",
      coverage: "Loss or damage due to theft, burglary, robbery"
    }
  ]

  const handleCoverageChange = (section: string, item: string, value: boolean) => {
    const newData = {
      ...insuranceData,
      [section]: {
        ...insuranceData[section as keyof typeof insuranceData],
        [item]: value
      }
    }
    setInsuranceData(newData)
    onInsuranceUpdate(newData)
  }

  const getCoverageStats = () => {
    const totalItems = Object.values(insuranceData).reduce((acc, section) => {
      return acc + Object.keys(section).length
    }, 0)
    
    const selectedItems = Object.values(insuranceData).reduce((acc, section) => {
      return acc + Object.values(section).filter(Boolean).length
    }, 0)
    
    return { selected: selectedItems, total: totalItems, percentage: Math.round((selectedItems / totalItems) * 100) }
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "property":
        return (
          <div className="space-y-4">
            <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Building className="text-blue-400" size={20} />
                <h4 className="font-medium text-blue-400">Property Insurance Coverage</h4>
              </div>
              <p className="text-sm text-blue-300">
                Covers loss or damage to your business's physical buildings, fixtures, fittings, and structural improvements.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              {propertyCoverItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={insuranceData.propertyCover[item.id as keyof typeof insuranceData.propertyCover]}
                      onChange={(e) => handleCoverageChange("propertyCover", item.id, e.target.checked)}
                      className="mt-1 w-4 h-4"
                    />
                    <div className="flex-1">
                      <label htmlFor={item.id} className="font-medium text-white cursor-pointer">
                        {item.title}
                      </label>
                      <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                      <p className="text-xs text-slate-500 mt-2">{item.coverage}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )

      case "contents":
        return (
          <div className="space-y-4">
            <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Home className="text-green-400" size={20} />
                <h4 className="font-medium text-green-400">Contents Insurance Coverage</h4>
              </div>
              <p className="text-sm text-green-300">
                Covers loss or damage to business furniture, machinery, plant, equipment, stock, and merchandise.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              {contentsCoverItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={insuranceData.contentsCover[item.id as keyof typeof insuranceData.contentsCover]}
                      onChange={(e) => handleCoverageChange("contentsCover", item.id, e.target.checked)}
                      className="mt-1 w-4 h-4"
                    />
                    <div className="flex-1">
                      <label htmlFor={item.id} className="font-medium text-white cursor-pointer">
                        {item.title}
                      </label>
                      <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                      <p className="text-xs text-slate-500 mt-2">{item.coverage}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )

      case "liability":
        return (
          <div className="space-y-4">
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="text-amber-400" size={20} />
                <h4 className="font-medium text-amber-400">Liability Insurance Coverage</h4>
              </div>
              <p className="text-sm text-amber-300">
                Protects against claims from injured third parties and damage to client property.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              {liabilityCoverItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={insuranceData.liabilityCover[item.id as keyof typeof insuranceData.liabilityCover]}
                      onChange={(e) => handleCoverageChange("liabilityCover", item.id, e.target.checked)}
                      className="mt-1 w-4 h-4"
                    />
                    <div className="flex-1">
                      <label htmlFor={item.id} className="font-medium text-white cursor-pointer">
                        {item.title}
                      </label>
                      <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                      <p className="text-xs text-slate-500 mt-2">{item.coverage}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )

      case "interruption":
        return (
          <div className="space-y-4">
            <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="text-purple-400" size={20} />
                <h4 className="font-medium text-purple-400">Business Interruption Coverage</h4>
              </div>
              <p className="text-sm text-purple-300">
                Helps ensure your business keeps running smoothly after an unexpected event by covering lost turnover.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              {businessInterruptionItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={insuranceData.businessInterruption[item.id as keyof typeof insuranceData.businessInterruption]}
                      onChange={(e) => handleCoverageChange("businessInterruption", item.id, e.target.checked)}
                      className="mt-1 w-4 h-4"
                    />
                    <div className="flex-1">
                      <label htmlFor={item.id} className="font-medium text-white cursor-pointer">
                        {item.title}
                      </label>
                      <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                      <p className="text-xs text-slate-500 mt-2">{item.coverage}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mt-6">
              <h5 className="font-medium text-white mb-4">Business Interruption Statistics</h5>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">$11B</div>
                  <div className="text-sm text-slate-400">Average annual cost of natural disasters in Australia</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">#1</div>
                  <div className="text-sm text-slate-400">Extreme weather events are the top business risk</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">Many</div>
                  <div className="text-sm text-slate-400">Businesses neglect interruption insurance</div>
                </div>
              </div>
            </div>
          </div>
        )

      case "additional":
        return (
          <div className="space-y-4">
            <div className="bg-cyan-500/20 border border-cyan-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="text-cyan-400" size={20} />
                <h4 className="font-medium text-cyan-400">Additional Coverage Options</h4>
              </div>
              <p className="text-sm text-cyan-300">
                Optional add-ons to ensure your business's specific risks are covered.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              {additionalCoverItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={insuranceData.additionalCover[item.id as keyof typeof insuranceData.additionalCover]}
                      onChange={(e) => handleCoverageChange("additionalCover", item.id, e.target.checked)}
                      className="mt-1 w-4 h-4"
                    />
                    <div className="flex-1">
                      <label htmlFor={item.id} className="font-medium text-white cursor-pointer">
                        {item.title}
                      </label>
                      <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                      <p className="text-xs text-slate-500 mt-2">{item.coverage}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const stats = getCoverageStats()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 
            className="text-xl font-medium text-white"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            Small Business Insurance Coverage
          </h3>
          <p className="text-slate-400">Select the insurance coverage relevant to your restoration project</p>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-400">{stats.percentage}%</div>
            <div className="text-sm text-slate-400">Coverage Selected</div>
            <div className="text-xs text-slate-500">{stats.selected} of {stats.total} items</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-cyan-500 text-white"
                : "bg-slate-700/50 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {renderTabContent()}
      </motion.div>

      {/* Key Considerations */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="font-medium text-white mb-4 flex items-center gap-2">
          <Info className="text-cyan-400" size={20} />
          Key Insurance Considerations
        </h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-white mb-3">Coverage Requirements</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                Ensure asset values are properly covered
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                Review policy exclusions carefully
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                Consider appropriate excess levels
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                Understand claim procedures
              </li>
            </ul>
          </div>
          
          <div>
            <h5 className="font-medium text-white mb-3">Business Protection</h5>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-blue-400 flex-shrink-0" />
                Protect against unexpected events
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-blue-400 flex-shrink-0" />
                Maintain cash flow during recovery
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-blue-400 flex-shrink-0" />
                Cover third-party liability risks
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-blue-400 flex-shrink-0" />
                Ensure business continuity
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
