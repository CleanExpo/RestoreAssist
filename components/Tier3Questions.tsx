"use client"

import { useState, useEffect } from "react"
import { CheckCircle, Save, ArrowRight, Camera, X, Zap } from "lucide-react"
import toast from "react-hot-toast"

interface Tier3QuestionsProps {
  reportId: string
  onComplete: (responses: any) => void
}

// Photo categorization system (6 categories)
const PHOTO_CATEGORIES = [
  { id: "site_damage", label: "Site & Damage Photography", max: 15, description: "Damage assessment, technical findings, evidence" },
  { id: "moisture_mapping", label: "Moisture Mapping & Thermal Imaging", max: 10, description: "Moisture readings, thermal images, mapping data" },
  { id: "equipment_deployment", label: "Equipment Deployment", max: 8, description: "Equipment setup, placement, monitoring" },
  { id: "remediation_progress", label: "Remediation Progress", max: 10, description: "Work in progress, drying progress, restoration steps" },
  { id: "structural_assessment", label: "Structural Assessment", max: 8, description: "Structural damage, integrity concerns, building elements" },
  { id: "final_verification", label: "Final Verification & Handover", max: 5, description: "Completion photos, verification, handover documentation" }
]

interface Photo {
  file: File
  category: string
  description: string
}

export default function Tier3Questions({ reportId, onComplete }: Tier3QuestionsProps) {
  const [loading, setLoading] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [responses, setResponses] = useState({
    // Initial Data Entry Form Fields (for refinement)
    phase1StartDate: '',
    phase1EndDate: '',
    phase2StartDate: '',
    phase2EndDate: '',
    phase3StartDate: '',
    phase3EndDate: '',
    // Advanced Tier 3 Questions
    T3_Q1_timelineRequirements: '',
    T3_Q1_timelineRequirementsOther: '',
    T3_Q2_dryingPreferences: '',
    T3_Q3_chemicalTreatment: '',
    T3_Q4_totalAffectedArea: '',
    T3_Q5_class4DryingAssessment: ''
  })

  useEffect(() => {
    fetchExistingResponses()
  }, [reportId])

  const fetchExistingResponses = async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        
        // Load InitialDataEntryForm timeline fields from report
        const initialDataFields = {
          phase1StartDate: data.phase1StartDate ? new Date(data.phase1StartDate).toISOString().split('T')[0] : '',
          phase1EndDate: data.phase1EndDate ? new Date(data.phase1EndDate).toISOString().split('T')[0] : '',
          phase2StartDate: data.phase2StartDate ? new Date(data.phase2StartDate).toISOString().split('T')[0] : '',
          phase2EndDate: data.phase2EndDate ? new Date(data.phase2EndDate).toISOString().split('T')[0] : '',
          phase3StartDate: data.phase3StartDate ? new Date(data.phase3StartDate).toISOString().split('T')[0] : '',
          phase3EndDate: data.phase3EndDate ? new Date(data.phase3EndDate).toISOString().split('T')[0] : '',
        }
        
        // Load Tier 3 responses if they exist
        const tier3Fields = data.tier3Responses || {}
        
        // Merge both sets of fields
        setResponses({
          ...initialDataFields,
          ...tier3Fields,
        })
      }
    } catch (error) {
      console.error('Error fetching existing responses:', error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      // First, update the report with refined InitialDataEntryForm timeline fields
      const updateResponse = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase1StartDate: responses.phase1StartDate ? new Date(responses.phase1StartDate).toISOString() : null,
          phase1EndDate: responses.phase1EndDate ? new Date(responses.phase1EndDate).toISOString() : null,
          phase2StartDate: responses.phase2StartDate ? new Date(responses.phase2StartDate).toISOString() : null,
          phase2EndDate: responses.phase2EndDate ? new Date(responses.phase2EndDate).toISOString() : null,
          phase3StartDate: responses.phase3StartDate ? new Date(responses.phase3StartDate).toISOString() : null,
          phase3EndDate: responses.phase3EndDate ? new Date(responses.phase3EndDate).toISOString() : null,
        })
      })

      if (!updateResponse.ok) {
        const error = await updateResponse.json()
        toast.error(error.error || 'Failed to update report data')
        setLoading(false)
        return
      }

      // Then save Tier 3 responses
      const response = await fetch('/api/reports/save-tier-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          tier: 3,
          responses
        })
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || 'Failed to save responses')
        return
      }

      // Then save photos if any
      if (photos.length > 0) {
        const formData = new FormData()
        photos.forEach((photo) => {
          formData.append("photos", photo.file)
          formData.append(`photoCategory_${photo.file.name}`, photo.category)
          if (photo.description) {
            formData.append(`photoDescription_${photo.file.name}`, photo.description)
          }
        })
        
        const photoCategories = photos.reduce((acc, photo) => {
          if (!acc[photo.category]) {
            acc[photo.category] = []
          }
          acc[photo.category].push({
            fileName: photo.file.name,
            description: photo.description || ""
          })
          return acc
        }, {} as Record<string, Array<{ fileName: string; description: string }>>)
        formData.append("photoCategories", JSON.stringify(photoCategories))

        const photoResponse = await fetch(`/api/reports/${reportId}/nir-data`, {
          method: 'POST',
          body: formData
        })

        if (!photoResponse.ok) {
          const error = await photoResponse.json()
          toast.error(error.error || 'Failed to save photos')
          return
        }
      }

      toast.success('Tier 3 responses and photos saved successfully')
      onComplete(responses)
    } catch (error) {
      console.error('Error saving responses:', error)
      toast.error('Failed to save responses')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border-2 border-green-500/50 bg-green-500/10">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <h2 className="text-xl font-semibold text-green-400">TIER 3: OPTIMISATION QUESTIONS</h2>
        </div>
        <p className="text-sm text-slate-300">
          These questions optimise cost estimation and timeline prediction. All questions are optional.
        </p>
      </div>

      {/* Advanced Tier 3 Questions */}
      <div className="p-4 rounded-lg border-2 border-green-500/50 bg-green-500/10 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-semibold text-green-400 mb-2">Advanced Optimisation Questions</h3>
            <p className="text-sm text-slate-300">These advanced questions optimise cost estimation and timeline prediction.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setResponses(prev => ({
                ...prev,
                // Only fill Tier 3 advanced questions, not basic information or previous tier data
                T3_Q1_timelineRequirements: 'Within 7 days',
                T3_Q1_timelineRequirementsOther: '',
                T3_Q2_dryingPreferences: 'Balanced (standard LGR dehumidifiers, normal airflow)',
                T3_Q3_chemicalTreatment: 'Standard antimicrobial treatment (preventative — all Category 1 losses)',
                T3_Q4_totalAffectedArea: 'Master Bedroom: 25 sqm, Ensuite: 8 sqm, Hallway: 12 sqm = 45 sqm total',
                T3_Q5_class4DryingAssessment: 'No — Class 2 (standard LGR/air mover deployment sufficient)'
              }))
              toast.success('Tier 3 advanced questions filled with test data')
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Zap className="w-4 h-4" />
            Quick Fill Tier 3
          </button>
        </div>
      </div>

      {/* T3_Q1: Timeline Requirements */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q1: Timeline Requirements</h3>
        <div className="space-y-2">
          {[
            'ASAP (emergency — consider after-hours rates)',
            'Within 7 days',
            'Within 14 days',
            'Within 30 days',
            'No specific deadline',
            'Other'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="timelineRequirements"
                value={option}
                checked={responses.T3_Q1_timelineRequirements === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T3_Q1_timelineRequirements: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
          {responses.T3_Q1_timelineRequirements === 'Other' && (
            <input
              type="text"
              value={responses.T3_Q1_timelineRequirementsOther}
              onChange={(e) => setResponses(prev => ({ ...prev, T3_Q1_timelineRequirementsOther: e.target.value }))}
              placeholder="Please specify"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg mt-2"
            />
          )}
        </div>
      </div>

      {/* T3_Q2: Drying Preferences */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q2: Drying Preferences</h3>
        <div className="space-y-2">
          {[
            'Speed priority (desiccant dehumidifiers, heat plates, injection drying — higher cost)',
            'Balanced (standard LGR dehumidifiers, normal airflow)',
            'Cost-efficiency (minimal equipment, extended drying period)'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="dryingPreferences"
                value={option}
                checked={responses.T3_Q2_dryingPreferences === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T3_Q2_dryingPreferences: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* T3_Q3: Chemical Treatment */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q3: Chemical Treatment</h3>
        <div className="space-y-2">
          {[
            'Standard antimicrobial treatment (preventative — all Category 1 losses)',
            'Enhanced mould remediation (if active growth suspected)',
            'Biohazard treatment (if contaminated water — Category 3)',
            'No additional chemical treatment',
            'To be determined based on final moisture readings'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="chemicalTreatment"
                value={option}
                checked={responses.T3_Q3_chemicalTreatment === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T3_Q3_chemicalTreatment: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* T3_Q4: Total Affected Area */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q4: Total Affected Area</h3>
        <p className="text-sm text-slate-400 mb-4">
          Example: 'Kitchen 15 sqm, Lounge 40 sqm, 2 Bedrooms 50 sqm total, Hallway 20 sqm = 125 sqm total.' Used for chemical treatment costing ($/sqm) and labour estimation.
        </p>
        <input
          type="text"
          value={responses.T3_Q4_totalAffectedArea}
          onChange={(e) => setResponses(prev => ({ ...prev, T3_Q4_totalAffectedArea: e.target.value }))}
          placeholder="Enter total affected area breakdown..."
          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* T3_Q5: Class 4 Drying Assessment */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q5: Class 4 Drying Assessment</h3>
        <div className="space-y-2">
          {[
            'No — Class 1 (simple air drying expected)',
            'No — Class 2 (standard LGR/air mover deployment sufficient)',
            'Possibly — Class 3 or 4 suspected (yellow tongue, cavity saturation, structural timber)',
            'Yes — Class 4 confirmed (requires qualified specialist assessment and quote)',
            'Uncertain — needs qualified technician site assessment'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="class4DryingAssessment"
                value={option}
                checked={responses.T3_Q5_class4DryingAssessment === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T3_Q5_class4DryingAssessment: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Photo Uploads Section (Optimised Only) */}
      <div className="p-6 rounded-lg border-2 border-green-500/50 bg-green-500/10">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold text-green-400">Photo Uploads</h3>
        </div>
        <p className="text-sm text-slate-300 mb-4">
          Categorise photos for proper placement in the report (35-45 images recommended)
        </p>
        
        <div className="space-y-4">
          {PHOTO_CATEGORIES.map((category) => {
            const categoryPhotos = photos.filter(p => p.category === category.id)
            const remaining = category.max - categoryPhotos.length
            return (
              <div key={category.id} className="p-4 rounded-lg border border-slate-600/50 bg-slate-900/30">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h5 className="text-sm font-semibold text-white">{category.label}</h5>
                    <p className="text-xs text-slate-400">{category.description}</p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {categoryPhotos.length} / {category.max}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                  {categoryPhotos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img
                        src={URL.createObjectURL(photo.file)}
                        alt={`${category.label} ${index + 1}`}
                        className="w-full h-20 object-cover rounded border-2 border-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPhotos(photos.filter((p, i) => 
                            !(p.category === category.id && i === photos.findIndex(ph => ph === photo))
                          ))
                          toast.success("Photo removed")
                        }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <label className="w-full h-20 border-2 border-dashed border-slate-600 rounded flex items-center justify-center cursor-pointer hover:border-green-500 transition-colors bg-slate-900/50">
                      <div className="text-center">
                        <Camera className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                        <span className="text-xs text-slate-400">Add</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          if (files.length > 0) {
                            const newPhotos = files.map(file => ({
                              file,
                              category: category.id,
                              description: ""
                            }))
                            if (categoryPhotos.length + files.length > category.max) {
                              toast.error(`Maximum ${category.max} photos allowed for ${category.label}`)
                              return
                            }
                            setPhotos([...photos, ...newPhotos])
                            toast.success(`${files.length} photo(s) added to ${category.label}`)
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/50 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : 'Save & Complete'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

