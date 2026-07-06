"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Droplets,
  Shield,
  Thermometer,
  Wind,
} from "lucide-react";
import { useState } from "react";
import {
  AIR_MOVER_RATIO,
  DEHU_RATIO,
  type DamageClass,
} from "@/lib/equipment-calculator";

/**
 * Orphaned component (RA-7001 follow-up) — not mounted anywhere outside its
 * sole parent, components/IICRCReportBuilder.tsx, which is itself not
 * imported by any page/route. Kept correct (metric, S500:2021-consistent)
 * in case it is ever wired back in; canonical equipment sizing lives in
 * lib/equipment-calculator.ts (AIR_MOVER_RATIO / DEHU_RATIO) and this
 * component's ratios mirror it rather than duplicating divergent figures.
 */
const DAMAGE_CLASS_MAP: Record<string, DamageClass> = {
  "Class 1": "CLASS_1",
  "Class 2": "CLASS_2",
  "Class 3": "CLASS_3",
  "Class 4": "CLASS_4",
};

function toDamageClass(waterClass: string): DamageClass {
  return DAMAGE_CLASS_MAP[waterClass] ?? "CLASS_2";
}

// Per-unit daily capacity (L/day) — display-only figure, not part of the
// cited DEHU_RATIO (m² per unit, S500:2021 §12.4.2). Mirrors
// components/EquipmentSizingGuidelines.tsx's calculateDehumidificationRequirements.
const LITER_PER_DEHU_UNIT: Record<DamageClass, number> = {
  CLASS_1: 20,
  CLASS_2: 30,
  CLASS_3: 40,
  CLASS_4: 50,
};

interface IICRCComplianceHelperProps {
  waterCategory?: string;
  waterClass?: string;
  /** m² — RA-6934 item 6 (see IICRCReportBuilder "Affected Area" field). */
  affectedArea?: number;
}

export default function IICRCComplianceHelper({
  waterCategory,
  waterClass,
  affectedArea,
}: IICRCComplianceHelperProps) {
  const [activeTab, setActiveTab] = useState("guidelines");

  const getCategoryGuidelines = () => {
    switch (waterCategory) {
      case "Category 1":
        return {
          title: "Category 1 - Clean Water",
          description: "Sanitary source, no contamination risk",
          procedures: [
            "No contamination controls required",
            "Proceed with standard drying procedures",
            "Monitor for secondary damage",
            "Document all procedures",
          ],
          safety: [
            "Standard PPE sufficient",
            "No special containment required",
            "Monitor for electrical hazards",
          ],
        };
      case "Category 2":
        return {
          title: "Category 2 - Grey Water",
          description:
            "Significant contamination, may cause discomfort or sickness",
          procedures: [
            "Implement contamination controls",
            "Establish containment barriers",
            "Use appropriate PPE",
            "Decontamination required before drying",
          ],
          safety: [
            "Enhanced PPE required",
            "Containment barriers necessary",
            "Negative pressure recommended",
            "Decontamination procedures required",
          ],
        };
      case "Category 3":
        return {
          title: "Category 3 - Black Water",
          description: "Grossly contaminated, pathogenic agents present",
          procedures: [
            "Full contamination controls required",
            "Containment barriers mandatory",
            "Negative pressure essential",
            "Complete decontamination before drying",
          ],
          safety: [
            "Full PPE with respiratory protection",
            "Containment barriers mandatory",
            "Negative pressure essential",
            "Professional decontamination required",
          ],
        };
      default:
        return null;
    }
  };

  const getClassGuidelines = () => {
    switch (waterClass) {
      case "Class 1":
        return {
          title: "Class 1 - Slow Rate of Evaporation",
          description: "Minimal water absorption, low evaporation load",
          equipment: [
            "1 airmover per 15m² of affected floor (IICRC S500:2021 §12.5)",
            "1 LGR dehumidifier per 40m² (IICRC S500:2021 §12.4.2)",
          ],
          drying: [
            "Minimal equipment required",
            "Standard drying time",
            "Monitor for secondary damage",
          ],
        };
      case "Class 2":
        return {
          title: "Class 2 - Fast Rate of Evaporation",
          description:
            "Water absorption into materials, moderate evaporation load",
          equipment: [
            "1 airmover per 15m² of affected floor (IICRC S500:2021 §12.5)",
            "1 LGR dehumidifier per 40m² (IICRC S500:2021 §12.4.2)",
          ],
          drying: [
            "Moderate equipment requirements",
            "Extended drying time",
            "Monitor material moisture content",
          ],
        };
      case "Class 3":
        return {
          title: "Class 3 - Fastest Rate of Evaporation",
          description: "Water absorption from overhead, high evaporation load",
          equipment: [
            "1 airmover per 10m² of affected floor (aggressive drying, IICRC S500:2021 §12.5)",
            "1 LGR/desiccant dehumidifier per 30m² (IICRC S500:2021 §12.4.2)",
          ],
          drying: [
            "Significant equipment requirements",
            "Extended drying time",
            "Continuous monitoring required",
          ],
        };
      case "Class 4":
        return {
          title: "Class 4 - Specialty Drying Situations",
          description: "Deep water absorption, specialty drying required",
          equipment: [
            "Specialty drying equipment required",
            "Multiple airmovers for complex assemblies",
            "High capacity dehumidification",
            "Specialized monitoring equipment",
          ],
          drying: [
            "Specialty drying techniques",
            "Extended drying time",
            "Professional expertise required",
            "Continuous monitoring essential",
          ],
        };
      default:
        return null;
    }
  };

  const calculateEquipmentNeeds = () => {
    if (!affectedArea || !waterClass) return null;

    // area is m² — see IICRCReportBuilder "Affected Area (m²)" field
    // (RA-6934 item 6). Ratios delegate to lib/equipment-calculator.ts
    // (AIR_MOVER_RATIO / DEHU_RATIO, IICRC S500:2021-consistent) instead of
    // maintaining a separate, previously imperial (sq ft) copy.
    const area = parseFloat(affectedArea.toString());
    const damageClass = toDamageClass(waterClass);
    const airmovers = Math.ceil(area / AIR_MOVER_RATIO[damageClass]);
    const dehuCount = Math.ceil(area / DEHU_RATIO[damageClass]);
    const dehumidification = dehuCount * LITER_PER_DEHU_UNIT[damageClass];

    return { airmovers, dehumidification };
  };

  const categoryGuidelines = getCategoryGuidelines();
  const classGuidelines = getClassGuidelines();
  const equipmentNeeds = calculateEquipmentNeeds();

  const tabs = [
    { id: "guidelines", label: "Guidelines", icon: BookOpen },
    { id: "safety", label: "Safety", icon: Shield },
    { id: "equipment", label: "Equipment", icon: Wind },
    { id: "procedures", label: "Procedures", icon: CheckCircle },
  ];

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="text-cyan-400" size={24} />
        <h3
          className="text-xl font-medium text-white"
          style={{ fontFamily: "Titillium Web, sans-serif" }}
        >
          IICRC S500 Compliance Helper
        </h3>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
        {activeTab === "guidelines" && (
          <div className="space-y-6">
            {categoryGuidelines && (
              <div>
                <h4 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                  <Droplets className="text-cyan-400" size={20} />
                  {categoryGuidelines.title}
                </h4>
                <p className="text-slate-300 mb-4">
                  {categoryGuidelines.description}
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-white mb-2">Procedures:</h5>
                    <ul className="space-y-1">
                      {categoryGuidelines.procedures.map((procedure, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-2 text-sm text-slate-300"
                        >
                          <CheckCircle
                            size={14}
                            className="text-success flex-shrink-0"
                          />
                          {procedure}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-white mb-2">
                      Safety Requirements:
                    </h5>
                    <ul className="space-y-1">
                      {categoryGuidelines.safety.map((safety, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-2 text-sm text-slate-300"
                        >
                          <Shield
                            size={14}
                            className="text-amber-400 flex-shrink-0"
                          />
                          {safety}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {classGuidelines && (
              <div>
                <h4 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                  <Wind className="text-cyan-400" size={20} />
                  {classGuidelines.title}
                </h4>
                <p className="text-slate-300 mb-4">
                  {classGuidelines.description}
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-white mb-2">
                      Equipment Requirements:
                    </h5>
                    <ul className="space-y-1">
                      {classGuidelines.equipment.map((equipment, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-2 text-sm text-slate-300"
                        >
                          <Wind
                            size={14}
                            className="text-blue-400 flex-shrink-0"
                          />
                          {equipment}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-white mb-2">
                      Drying Considerations:
                    </h5>
                    <ul className="space-y-1">
                      {classGuidelines.drying.map((drying, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-2 text-sm text-slate-300"
                        >
                          <Thermometer
                            size={14}
                            className="text-orange-400 flex-shrink-0"
                          />
                          {drying}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "safety" && (
          <div className="space-y-4">
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="text-amber-400" size={20} />
                <h4 className="font-medium text-amber-400">Safety First</h4>
              </div>
              <p className="text-sm text-amber-300">
                Always assess structural integrity, electrical hazards, and gas
                leaks before entering the structure.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-white mb-3">
                  PPE Requirements
                </h5>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Safety glasses or goggles
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Protective gloves
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Non-slip footwear
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Hard hat (if overhead hazards)
                  </li>
                  {waterCategory === "Category 2" ||
                  waterCategory === "Category 3" ? (
                    <>
                      <li className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-amber-400" />
                        Respiratory protection
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-amber-400" />
                        Protective clothing
                      </li>
                    </>
                  ) : null}
                </ul>
              </div>

              <div>
                <h5 className="font-medium text-white mb-3">
                  Safety Protocols
                </h5>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Turn off electrical power
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Check for gas leaks
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Assess structural integrity
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Post warning signs
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Evacuate occupants if necessary
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === "equipment" && (
          <div className="space-y-6">
            {equipmentNeeds && (
              <div className="bg-cyan-500/20 border border-cyan-500/30 rounded-lg p-4">
                <h4 className="font-medium text-cyan-400 mb-3">
                  Calculated Equipment Needs
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Wind className="text-blue-400" size={16} />
                      <span className="text-sm font-medium text-white">
                        Airmovers
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-cyan-400">
                      {equipmentNeeds.airmovers}
                    </p>
                    <p className="text-xs text-slate-400">units required</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Thermometer className="text-orange-400" size={16} />
                      <span className="text-sm font-medium text-white">
                        Dehumidification
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-cyan-400">
                      {equipmentNeeds.dehumidification}L
                    </p>
                    <p className="text-xs text-slate-400">per day capacity</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-white mb-3">
                  Essential Equipment
                </h5>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Moisture meters
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Psychrometers
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Airmovers
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Dehumidifiers
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" />
                    Air filtration devices
                  </li>
                </ul>
              </div>

              <div>
                <h5 className="font-medium text-white mb-3">
                  Specialty Equipment
                </h5>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-blue-400" />
                    HEPA vacuums
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-blue-400" />
                    Negative pressure units
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-blue-400" />
                    Containment barriers
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-blue-400" />
                    Antimicrobial applicators
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-blue-400" />
                    Thermal imaging cameras
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === "procedures" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-white mb-3">
                  Initial Procedures
                </h5>
                <ol className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <span>Safety assessment and hazard identification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <span>Water source identification and control</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    <span>Category and class determination</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      4
                    </span>
                    <span>Documentation and photography</span>
                  </li>
                </ol>
              </div>

              <div>
                <h5 className="font-medium text-white mb-3">
                  Drying Procedures
                </h5>
                <ol className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <span>Equipment placement and setup</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <span>Psychrometric monitoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    <span>Moisture content measurements</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-cyan-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      4
                    </span>
                    <span>Equipment adjustments as needed</span>
                  </li>
                </ol>
              </div>
            </div>

            <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="text-success" size={20} />
                <h4 className="font-medium text-success">
                  Completion Verification
                </h4>
              </div>
              <ul className="space-y-1 text-sm text-success">
                <li>• All materials returned to pre-loss moisture content</li>
                <li>• Psychrometric conditions stabilized</li>
                <li>• No visible moisture or condensation</li>
                <li>• Post-remediation verification completed</li>
                <li>• Documentation finalized</li>
              </ul>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
