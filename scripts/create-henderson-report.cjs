const { EncryptJWT } = require('jose')
const crypto = require('crypto')
const http = require('http')

async function getToken() {
  const secret = '+bVggjMg7mI9QLdLaum1AvI+oUneJW4klkMcBOHt1+4='
  const secretBytes = Buffer.from(secret)
  const hkdfKey = await new Promise((resolve, reject) => {
    crypto.hkdf('sha256', secretBytes, Buffer.alloc(0), 'NextAuth.js Generated Encryption Key', 32, (err, key) => {
      if (err) reject(err); else resolve(key)
    })
  })
  const now = Math.floor(Date.now() / 1000)
  return new EncryptJWT({
    sub: 'cmn8j161x00002bcgzejfde8b',
    email: 'test.operator@restoreassist.dev',
    name: 'Test Operator',
    role: 'ADMIN',
    iat: now,
    exp: now + 30 * 24 * 60 * 60,
    jti: crypto.randomUUID()
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .encrypt(new Uint8Array(hkdfKey))
}

const payload = {
  clientName: 'Michael & Sarah Henderson',
  clientContactDetails: 'Phone: 0412 345 678',
  propertyAddress: '14 Ironbark Court, Rochedale South QLD 4123',
  propertyPostcode: '4123',
  jobNumber: 'IRG-2026-0001',
  claimReferenceNumber: 'QBE-2026-WL-448821',
  insurerName: 'QBE Insurance',
  incidentDate: '2026-03-27',
  technicianAttendanceDate: '2026-03-27',
  technicianName: 'Inland Restoration Group',
  reportInstructions: 'This report has been prepared in accordance with the IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration (5th Edition). All assessments, classifications, and remediation recommendations comply with Australian standards including AS/NZS 3000 Wiring Rules, AS 4349 Inspection of Buildings, and relevant Queensland Building and Construction Commission (QBCC) requirements.',
  structureType: 'Single Storey Residential',
  buildingAge: 21,
  methamphetamineScreen: 'NEGATIVE',
  methamphetamineTestCount: 1,
  biologicalMouldDetected: false,
  lastInspectionDate: null,
  buildingChangedSinceLastInspection: 'No changes to building reported by occupants',
  structureChangesSinceLastInspection: 'None',
  previousLeakage: 'No previous leakage events reported',
  emergencyRepairPerformed: 'Isolation of water supply and removal of burst flexi hose at kitchen sink. Preliminary water containment measures implemented.',
  phase1StartDate: '2026-03-27',
  phase1EndDate: '2026-03-27',
  phase2StartDate: '2026-03-27',
  phase2EndDate: '2026-04-01',
  phase3StartDate: '2026-04-01',
  phase3EndDate: '2026-04-02',
  technicianFieldReport: 'Attended property at 14 Ironbark Court, Rochedale South QLD 4123 on 27/03/2026. Initial attendance by 2 qualified technicians, 4 hours on Day 1. Burst flexi hose identified at kitchen sink connection causing significant water loss throughout lower level of single-storey dwelling. Water intrusion classified Category 1 (Clean Water) / Class 2 (Significant Saturation) per IICRC S500. 10 rooms affected: Kitchen, Living Room, Dining Room, Hallway, Laundry, Master Bedroom, Bedroom 2, Bedroom 3, Ensuite, and Main Bathroom. Scope of works performed: initial inspection and site assessment, water extraction (truck-mounted), furniture manipulation and content manifesting, equipment setup and placement, thermal imaging survey, photo and video documentation completed, OH&S risk assessment (electrical isolation confirmed, slip/fall hazard controls in place), and client education provided regarding the drying process, equipment noise, and occupancy safety. Moisture readings taken at 13 points across all affected areas — all readings at 100% saturation on Day 1 consistent with fresh water loss event. Drying equipment deployed: 6 LGR dehumidifiers, 13 air movers, 2 air filtration devices. Estimated drying duration 4 days subject to daily monitoring.',
  nirData: {
    moistureReadings: [
      { id: '1', location: 'Kitchen', surfaceType: 'Timber/Vinyl Floor', moistureLevel: 100, depth: 'Surface' },
      { id: '2', location: 'Kitchen', surfaceType: 'Plasterboard Wall', moistureLevel: 100, depth: 'Surface' },
      { id: '3', location: 'Living Room', surfaceType: 'Carpet', moistureLevel: 100, depth: 'Surface' },
      { id: '4', location: 'Living Room', surfaceType: 'Plasterboard Wall', moistureLevel: 100, depth: 'Surface' },
      { id: '5', location: 'Dining Room', surfaceType: 'Timber Floor', moistureLevel: 100, depth: 'Surface' },
      { id: '6', location: 'Hallway', surfaceType: 'Tile Floor', moistureLevel: 100, depth: 'Surface' },
      { id: '7', location: 'Hallway', surfaceType: 'Plasterboard Wall', moistureLevel: 100, depth: 'Surface' },
      { id: '8', location: 'Laundry', surfaceType: 'Tile Floor', moistureLevel: 100, depth: 'Surface' },
      { id: '9', location: 'Master Bedroom', surfaceType: 'Carpet', moistureLevel: 100, depth: 'Surface' },
      { id: '10', location: 'Master Bedroom', surfaceType: 'Plasterboard Wall', moistureLevel: 100, depth: 'Surface' },
      { id: '11', location: 'Bedroom 2', surfaceType: 'Carpet', moistureLevel: 100, depth: 'Surface' },
      { id: '12', location: 'Bedroom 3', surfaceType: 'Carpet', moistureLevel: 100, depth: 'Surface' },
      { id: '13', location: 'Ensuite', surfaceType: 'Tile Floor', moistureLevel: 100, depth: 'Surface' }
    ],
    affectedAreas: [
      { id: 'a1', roomZoneId: 'Kitchen', affectedSquareFootage: 16, waterSource: 'Burst flexi hose at kitchen sink', timeSinceLoss: 2 },
      { id: 'a2', roomZoneId: 'Living Room', affectedSquareFootage: 20, waterSource: 'Water migration from kitchen', timeSinceLoss: 2 },
      { id: 'a3', roomZoneId: 'Dining Room', affectedSquareFootage: 12, waterSource: 'Water migration', timeSinceLoss: 2 },
      { id: 'a4', roomZoneId: 'Hallway', affectedSquareFootage: 8, waterSource: 'Water migration', timeSinceLoss: 2 },
      { id: 'a5', roomZoneId: 'Laundry', affectedSquareFootage: 6, waterSource: 'Water migration', timeSinceLoss: 2 },
      { id: 'a6', roomZoneId: 'Master Bedroom', affectedSquareFootage: 16, waterSource: 'Water migration', timeSinceLoss: 3 },
      { id: 'a7', roomZoneId: 'Bedroom 2', affectedSquareFootage: 12, waterSource: 'Water migration', timeSinceLoss: 3 },
      { id: 'a8', roomZoneId: 'Bedroom 3', affectedSquareFootage: 9, waterSource: 'Water migration', timeSinceLoss: 3 },
      { id: 'a9', roomZoneId: 'Ensuite', affectedSquareFootage: 4, waterSource: 'Water migration', timeSinceLoss: 3 },
      { id: 'a10', roomZoneId: 'Main Bathroom', affectedSquareFootage: 4, waterSource: 'Water migration', timeSinceLoss: 3 },
      { id: 'a11', roomZoneId: 'Laundry Wall Cavity', affectedSquareFootage: 3, waterSource: 'Water infiltration behind wall', timeSinceLoss: 2 },
      { id: 'a12', roomZoneId: 'Kitchen Wall Cavity', affectedSquareFootage: 2, waterSource: 'Water infiltration behind wall', timeSinceLoss: 2 }
    ],
    scopeItems: [
      { id: 's1', category: 'Extraction', description: 'Truck-mounted water extraction performed across all affected areas', completed: true },
      { id: 's2', category: 'Content Manipulation', description: 'Furniture manipulation and content manifesting completed — items photographed and catalogued', completed: true },
      { id: 's3', category: 'Equipment Deployment', description: 'Drying equipment setup: 6 LGR dehumidifiers, 13 air movers, 2 AFD units deployed and operational', completed: true },
      { id: 's4', category: 'Thermal Imaging', description: 'Full thermal imaging survey completed — moisture migration patterns documented', completed: true },
      { id: 's5', category: 'OH&S Documentation', description: 'OH&S risk assessment: electrical isolation confirmed, slip/fall hazard controls applied, client safety briefing completed', completed: true }
    ]
  },
  equipmentData: {
    psychrometricAssessment: {
      waterClass: 2,
      temperature: 26,
      humidity: 74,
      systemType: 'closed'
    },
    scopeAreas: [
      { id: 'sa1', name: 'Kitchen', length: 4, width: 4, height: 2.7, wetPercentage: 100 },
      { id: 'sa2', name: 'Living Room', length: 5, width: 4, height: 2.7, wetPercentage: 100 },
      { id: 'sa3', name: 'Dining Room', length: 4, width: 3, height: 2.7, wetPercentage: 100 },
      { id: 'sa4', name: 'Hallway', length: 6, width: 1.5, height: 2.7, wetPercentage: 100 },
      { id: 'sa5', name: 'Laundry', length: 2.5, width: 2, height: 2.7, wetPercentage: 100 },
      { id: 'sa6', name: 'Master Bedroom', length: 4, width: 4, height: 2.7, wetPercentage: 100 },
      { id: 'sa7', name: 'Bedroom 2', length: 3.5, width: 3, height: 2.7, wetPercentage: 100 },
      { id: 'sa8', name: 'Bedroom 3', length: 3, width: 3, height: 2.7, wetPercentage: 100 },
      { id: 'sa9', name: 'Ensuite', length: 2, width: 2, height: 2.7, wetPercentage: 100 },
      { id: 'sa10', name: 'Main Bathroom', length: 2, width: 2, height: 2.7, wetPercentage: 100 }
    ],
    equipmentSelection: [
      { groupId: 'lgr-55', quantity: 6, dailyRate: 45 },
      { groupId: 'airmover-1500', quantity: 13, dailyRate: 25 },
      { groupId: 'afd-500', quantity: 2, dailyRate: 40 }
    ],
    equipmentCostTotal: 2922,
    estimatedDryingDuration: 4,
    metrics: {
      totalAffectedArea: 112,
      waterRemovalTarget: 560,
      airMoversRequired: 13
    }
  }
}

async function main() {
  const token = await getToken()
  const body = JSON.stringify(payload)

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/reports/initial-entry',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Cookie': 'next-auth.session-token=' + token
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        console.log('STATUS:', res.statusCode)
        try {
          const parsed = JSON.parse(data)
          console.log('REPORT ID:', parsed.report?.id || parsed.reportId || 'N/A')
          console.log('REPORT NUMBER:', parsed.report?.reportNumber || parsed.report?.title || 'N/A')
          if (parsed.error) console.log('ERROR:', parsed.error)
        } catch(e) {
          console.log('RAW:', data.slice(0, 500))
        }
        resolve()
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

main().catch(console.error)
