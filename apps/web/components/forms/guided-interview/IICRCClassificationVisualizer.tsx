/**
 * IICRC Classification Visualizer Component
 * Displays IICRC S500 water category and class with detailed explanations
 */

'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface IICRCClassificationVisualizerProps {
  category: number // 1=Clean, 2=Grey, 3=Black
  class: number // 1-4
  affectedArea?: number // Square footage
  timeElapsedHours?: number
  showDetailed?: boolean
}

/**
 * Get category information
 */
const getCategoryInfo = (category: number) => {
  const info: Record<
    number,
    {
      name: string
      color: string
      bgColor: string
      icon: React.ReactNode
      description: string
      sources: string[]
      healthRisks: string[]
      treatment: string[]
      ppe: string[]
    }
  > = {
    1: {
      name: 'Clean Water (Category 1)',
      color: 'bg-green-100 border-green-300',
      bgColor: 'bg-green-50',
      icon: <CheckCircle2 className="h-8 w-8 text-green-600" />,
      description:
        'Water from clean sources such as broken water supply lines, falling rainwater, melted snow/ice. Presents minimal health hazard.',
      sources: [
        'Sanitary water supply lines',
        'Rain water',
        'Melted snow/ice',
        'Water from toilet bowls (clean only)',
      ],
      healthRisks: [
        'Minimal health hazard if proper sanitation maintained',
        'Potential microbial growth if not dried quickly',
      ],
      treatment: ['Standard drying procedures', 'Dehumidification', 'Air movement'],
      ppe: ['Standard work attire', 'Gloves recommended'],
    },
    2: {
      name: 'Grey Water (Category 2)',
      color: 'bg-yellow-100 border-yellow-300',
      bgColor: 'bg-yellow-50',
      icon: <AlertTriangle className="h-8 w-8 text-yellow-600" />,
      description:
        'Water containing some level of contamination. May include soap/detergent residue or other organic matter. Presents moderate health hazard.',
      sources: [
        'Water from dishwashers/washing machines',
        'Water from fish tanks',
        'Water from shower/toilet with urine',
        'Aquarium water',
      ],
      healthRisks: [
        'Bacterial contamination',
        'Potential viral hazards',
        'Allergenic spore formation',
        'Mold growth potential',
      ],
      treatment: [
        'Enhanced drying procedures',
        'Antimicrobial treatment may be required',
        'Professional assessment recommended',
      ],
      ppe: [
        'Gloves (nitrile or rubber)',
        'Long sleeves recommended',
        'Eye protection if splashing risk',
      ],
    },
    3: {
      name: 'Black Water (Category 3)',
      color: 'bg-red-100 border-red-300',
      bgColor: 'bg-red-50',
      icon: <AlertCircle className="h-8 w-8 text-red-600" />,
      description:
        'Highly contaminated water presenting serious health hazard. Contains pathogenic agents, toxic substances, and fecal matter. Requires professional remediation.',
      sources: [
        'Sewage',
        'Toilet overflow (with fecal matter)',
        'Contaminated surface water',
        'Floodwater from rivers or grounds',
        'Water from septic tank failure',
      ],
      healthRisks: [
        'Pathogenic bacteria (E. coli, Salmonella)',
        'Viral hazards (Hepatitis A, Norovirus)',
        'Parasites',
        'Toxic substances',
        'Severe allergenic responses',
      ],
      treatment: [
        'Professional remediation required',
        'Antimicrobial treatment mandatory',
        'Potential material disposal needed',
        'Enhanced decontamination procedures',
      ],
      ppe: [
        'Full protective gear required',
        'Double gloves (latex + nitrile)',
        'Face shield or goggles',
        'Respirator (N95 minimum)',
        'Full-body protection',
        'Booted feet',
      ],
    },
  }

  return info[category] || info[1]
}

/**
 * Get class information
 */
const getClassInfo = (waterClass: number) => {
  const info: Record<
    number,
    {
      name: string
      percentage: string
      color: string
      description: string
      dryingTime: string
      dehumidificationMethod: string
      affectedMaterials: string[]
    }
  > = {
    1: {
      name: 'Class 1: Smallest',
      percentage: '0-10%',
      color: 'text-green-700',
      description:
        'Affects only small areas with minimum structural damage. Minimal wet materials. Evaporation is rapid.',
      dryingTime: '2-3 days',
      dehumidificationMethod: 'Conventional dehumidifier',
      affectedMaterials: ['Limited to single room or small area', 'Minimal building materials wet'],
    },
    2: {
      name: 'Class 2: Large',
      percentage: '10-30%',
      color: 'text-yellow-700',
      description:
        'Affects large areas including entire rooms or multiple rooms. Moderate structural involvement. Carpeting may be wet.',
      dryingTime: '3-5 days',
      dehumidificationMethod: 'LGR dehumidifier recommended',
      affectedMaterials: [
        'Entire room(s) affected',
        'Carpeting throughout',
        'Drywall saturation',
        'Insulation involvement',
      ],
    },
    3: {
      name: 'Class 3: Entire',
      percentage: '30-50%',
      color: 'text-orange-700',
      description:
        'Affects entire structure including walls, structural members, and subfloors. Requires aggressive drying. High moisture content in building materials.',
      dryingTime: '5-7 days',
      dehumidificationMethod: 'Multiple LGR dehumidifiers',
      affectedMaterials: [
        'Entire building content',
        'All walls (internal)',
        'Ceiling areas',
        'Subfloor materials',
        'Structural supports potentially affected',
      ],
    },
    4: {
      name: 'Class 4: Specialty',
      percentage: '>50%',
      color: 'text-red-700',
      description:
        'Involves materials that take extended time to dry due to high porosity and capillary action. Requires specialized drying equipment and techniques.',
      dryingTime: '7-30+ days',
      dehumidificationMethod: 'Multiple LGR units + specialty equipment',
      affectedMaterials: [
        'Wood studs and framing',
        'Concrete/masonry',
        'Crawlspace materials',
        'Sealed spaces',
        'Concrete slabs',
        'Plywood subfloors',
      ],
    },
  }

  return info[waterClass] || info[1]
}

/**
 * IICRC Classification Visualizer Component
 */
export function IICRCClassificationVisualizer({
  category,
  class: waterClass,
  affectedArea,
  timeElapsedHours,
  showDetailed = true,
}: IICRCClassificationVisualizerProps) {
  const categoryInfo = getCategoryInfo(category)
  const classInfo = getClassInfo(waterClass)

  // Risk level based on combination
  const riskLevel = category === 1 && waterClass <= 2 ? 'low' : category === 1 && waterClass >= 3 ? 'medium' : category === 2 && waterClass <= 2 ? 'medium' : 'high'

  const riskColors: Record<string, string> = {
    low: 'bg-green-50 border-green-200',
    medium: 'bg-yellow-50 border-yellow-200',
    high: 'bg-red-50 border-red-200',
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>IICRC S500 Classification</CardTitle>
        <CardDescription>Water Damage Category & Class Assessment</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Category & Class Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Category */}
          <div className={`border-2 rounded-lg p-4 ${categoryInfo.color}`}>
            <div className="flex items-start gap-3 mb-3">
              {categoryInfo.icon}
              <div>
                <h3 className="font-bold text-lg">{categoryInfo.name}</h3>
                <p className="text-sm text-muted-foreground">Water Type Classification</p>
              </div>
            </div>
            <p className="text-sm">{categoryInfo.description}</p>
          </div>

          {/* Class */}
          <div className="border-2 border-blue-300 bg-blue-50 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="flex items-center justify-center h-8 w-8 bg-blue-200 rounded-full">
                <span className="font-bold text-blue-700 text-lg">{waterClass}</span>
              </div>
              <div>
                <h3 className="font-bold text-lg">{classInfo.name}</h3>
                <p className="text-sm text-muted-foreground">Extent of Damage</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Affected Area</p>
                <p className="font-semibold">{classInfo.percentage}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Drying Time</p>
                <p className="font-semibold">{classInfo.dryingTime}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Risk Assessment */}
        <Alert className={riskColors[riskLevel]}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-semibold">
              {riskLevel === 'low' ? '✓ Low Risk' : riskLevel === 'medium' ? '⚠ Medium Risk' : '✗ High Risk'}
            </span>{' '}
            - Category {category} water with Class {waterClass} damage scope
          </AlertDescription>
        </Alert>

        {/* Detailed Tabs */}
        {showDetailed && (
          <Tabs defaultValue="category" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="category">Water Type</TabsTrigger>
              <TabsTrigger value="class">Damage Scope</TabsTrigger>
              <TabsTrigger value="remediation">Remediation</TabsTrigger>
            </TabsList>

            {/* Category Tab */}
            <TabsContent value="category" className="space-y-4">
              {/* Sources */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Common Sources</h4>
                <div className="grid gap-2">
                  {categoryInfo.sources.map((source, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground">•</span>
                      <span>{source}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Health Risks */}
              <div className="space-y-2 p-3 bg-orange-50 border border-orange-200 rounded">
                <h4 className="font-semibold text-sm text-orange-900">Health Risks</h4>
                <div className="space-y-1">
                  {categoryInfo.healthRisks.map((risk, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                      <span className="text-orange-800">{risk}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* PPE Requirements */}
              <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded">
                <h4 className="font-semibold text-sm text-blue-900">PPE Requirements</h4>
                <div className="space-y-1">
                  {categoryInfo.ppe.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <span className="text-blue-800">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Class Tab */}
            <TabsContent value="class" className="space-y-4">
              {/* Class Description */}
              <div>
                <h4 className="font-semibold text-sm mb-2">Description</h4>
                <p className="text-sm text-muted-foreground">{classInfo.description}</p>
              </div>

              {/* Affected Materials */}
              <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded">
                <h4 className="font-semibold text-sm">Typically Affected Materials</h4>
                <div className="space-y-1">
                  {classInfo.affectedMaterials.map((material, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <Badge variant="secondary" className="text-xs">
                        Material
                      </Badge>
                      <span>{material}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Drying Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-xs text-muted-foreground">Estimated Drying Time</p>
                  <p className="text-lg font-bold text-blue-700">{classInfo.dryingTime}</p>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-xs text-muted-foreground">Dehumidification</p>
                  <p className="text-sm font-semibold text-green-700">{classInfo.dehumidificationMethod}</p>
                </div>
              </div>

              {/* Actual Data */}
              {affectedArea && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                  <p className="text-sm font-semibold text-purple-900">This Loss</p>
                  <p className="text-sm text-purple-700">Approximately {affectedArea} sq ft affected</p>
                </div>
              )}
            </TabsContent>

            {/* Remediation Tab */}
            <TabsContent value="remediation" className="space-y-4">
              {/* Treatment Steps */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Treatment Approach</h4>
                <div className="space-y-2">
                  {categoryInfo.treatment.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 bg-gradient-to-r from-green-50 to-transparent border border-green-200 rounded"
                    >
                      <span className="font-bold text-green-700 text-sm">{idx + 1}</span>
                      <span className="text-sm text-green-800">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Standards Reference */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                <h4 className="font-semibold text-sm text-amber-900 mb-2">Standards Compliance</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-amber-800">✓ IICRC S500 Standard & Reference Guide Section 2-3</p>
                  <p className="text-amber-800">✓ NCC 2025 Building Code Section 3</p>
                  <p className="text-amber-800">✓ WHS Act 2011 Safety Requirements</p>
                  <p className="text-amber-800">
                    ✓ AS/NZS 3000 Electrical Safety (if electrical involved)
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Time Analysis */}
        {timeElapsedHours && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="font-semibold text-sm text-amber-900 mb-2">Time Since Loss</h4>
            <p className="text-sm text-amber-800">
              {timeElapsedHours} hours elapsed
              {timeElapsedHours > 72 ? (
                <span className="block mt-1 text-orange-700 font-semibold">
                  ⚠ Over 72 hours - Bacterial growth risk HIGH. Immediate action required.
                </span>
              ) : timeElapsedHours > 48 ? (
                <span className="block mt-1 text-yellow-700 font-semibold">
                  ⚠ 48-72 hours - Mold growth risk increasing. Urgent action needed.
                </span>
              ) : (
                <span className="block mt-1 text-green-700 font-semibold">
                  ✓ Under 48 hours - Optimal time for mitigation. Act now.
                </span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
