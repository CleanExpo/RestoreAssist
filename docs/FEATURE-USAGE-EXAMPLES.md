# Design & Graphics Features - Usage Examples

## Complete Integration Examples

### 1. Sharp Image Processing Examples

#### Basic Image Optimization:
```typescript
import { optimizeImage, createThumbnail } from '@/lib/image-processing'

// Optimize an image buffer for web
async function processUploadedImage(imageBuffer: Buffer) {
  // Optimize main image
  const optimized = await optimizeImage(imageBuffer, {
    width: 1920,
    height: 1080,
    quality: 80,
    format: 'webp'
  })

  // Create thumbnail
  const thumbnail = await createThumbnail(imageBuffer, 200)

  return { optimized, thumbnail }
}
```

#### Cloudinary Integration with Optimization:
```typescript
import { uploadOptimizedImage, uploadImageWithThumbnail } from '@/lib/cloudinary'

// Upload with automatic optimization
async function uploadDamagePhoto(buffer: Buffer) {
  const result = await uploadOptimizedImage(buffer, 'damage-photos', {
    width: 1920,
    quality: 80
  })

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height
  }
}

// Upload with automatic thumbnail generation
async function uploadReportImage(buffer: Buffer) {
  const { image, thumbnail } = await uploadImageWithThumbnail(buffer, 'reports', 200)

  return {
    main: image.secure_url,
    thumb: thumbnail.secure_url,
    publicId: image.public_id
  }
}
```

#### Batch Image Processing:
```typescript
import { batchProcessImages } from '@/lib/image-processing'

async function processMultipleImages(buffers: Buffer[]) {
  const processed = await batchProcessImages(buffers, {
    width: 800,
    quality: 75,
    format: 'webp'
  })

  return processed
}
```

---

### 2. AdvancedCanvas Component Examples

#### Basic Drawing Canvas:
```typescript
import { AdvancedCanvas } from '@/components/canvas/AdvancedCanvas'

export function DamageAnnotationTool() {
  const handleSave = (pngDataUrl: string) => {
    // Save annotated image
    console.log('Canvas saved:', pngDataUrl)
  }

  return (
    <div>
      <h2>Damage Area Marking Tool</h2>
      <AdvancedCanvas
        width={800}
        height={600}
        backgroundColor="#ffffff"
        onSave={handleSave}
      />
    </div>
  )
}
```

#### Canvas in a Form:
```typescript
import { AdvancedCanvas } from '@/components/canvas/AdvancedCanvas'
import { useState } from 'react'

export function FloorPlanAnnotationForm() {
  const [canvasData, setCanvasData] = useState<string>('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canvasData) {
      alert('Please draw on the canvas first')
      return
    }

    // Convert data URL to blob and upload
    const response = await fetch(canvasData)
    const blob = await response.blob()

    const formData = new FormData()
    formData.append('annotation', blob, 'floor-plan.png')

    await fetch('/api/annotations/upload', {
      method: 'POST',
      body: formData
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Annotate Floor Plan</h3>
      <AdvancedCanvas onSave={setCanvasData} width={1000} height={800} />
      <button type="submit">Save Annotation</button>
    </form>
  )
}
```

---

### 3. FabricSignatureCanvas Examples

#### Enhanced Signature Capture:
```typescript
import { FabricSignatureCanvas } from '@/components/forms/signature/FabricSignatureCanvas'
import { useState } from 'react'

export function DocumentSigningPage() {
  const [signature, setSignature] = useState<string>('')
  const [signatureSVG, setSignatureSVG] = useState<string>('')

  const handleSign = (pngUrl: string) => {
    setSignature(pngUrl)
    console.log('Signature captured (PNG):', pngUrl)
  }

  const handleExportSVG = (svg: string) => {
    setSignatureSVG(svg)
    console.log('Signature exported (SVG - Vector):', svg)
  }

  return (
    <div className="signature-section">
      <h3>Please Sign Below</h3>
      <p>Use the canvas below to sign. You can undo/redo if needed.</p>

      <FabricSignatureCanvas
        width={500}
        height={200}
        onSign={handleSign}
        onSignatureSVG={handleExportSVG}
      />

      {signature && (
        <div>
          <p>✓ Signature captured</p>
          <img src={signature} alt="Your signature" style={{ maxWidth: '300px' }} />
        </div>
      )}
    </div>
  )
}
```

#### Signature in Multi-step Form:
```typescript
import { FabricSignatureCanvas } from '@/components/forms/signature/FabricSignatureCanvas'

export function ContractSigningForm() {
  const [formData, setFormData] = useState({
    clientName: '',
    signaturePNG: '',
    signatureSVG: ''
  })

  const handleSignatureCapture = (pngUrl: string) => {
    setFormData(prev => ({ ...prev, signaturePNG: pngUrl }))
  }

  const handleSubmit = async () => {
    if (!formData.signaturePNG) {
      alert('Please sign the document')
      return
    }

    await fetch('/api/contracts/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    })
  }

  return (
    <div>
      <input
        type="text"
        placeholder="Full Name"
        value={formData.clientName}
        onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
      />

      <FabricSignatureCanvas
        width={500}
        height={150}
        onSign={handleSignatureCapture}
      />

      <button onClick={handleSubmit}>Sign & Submit</button>
    </div>
  )
}
```

---

### 4. D3 Visualization Examples

#### Network Graph - Project Relationships:
```typescript
import { NetworkGraph } from '@/components/charts/d3/NetworkGraph'

export function ProjectRelationshipMap() {
  const nodes = [
    { id: 'drying', label: 'Drying Phase', group: 'core' },
    { id: 'cleanup', label: 'Cleanup', group: 'core' },
    { id: 'restoration', label: 'Restoration', group: 'core' },
    { id: 'inspection', label: 'Inspection', group: 'qa' },
    { id: 'documentation', label: 'Documentation', group: 'admin' }
  ]

  const links = [
    { source: 'drying', target: 'cleanup', value: 2 },
    { source: 'cleanup', target: 'restoration', value: 3 },
    { source: 'restoration', target: 'inspection', value: 1 },
    { source: 'inspection', target: 'documentation', value: 2 }
  ]

  return (
    <div>
      <h2>Project Phase Dependencies</h2>
      <NetworkGraph nodes={nodes} links={links} width={1000} height={600} />
    </div>
  )
}
```

#### Heatmap - Moisture Distribution:
```typescript
import { Heatmap } from '@/components/charts/d3/Heatmap'

export function MoistureDistributionMap() {
  const data = [
    { x: 'Room 1', y: 'Floor 1', value: 75.5 },
    { x: 'Room 1', y: 'Floor 2', value: 62.3 },
    { x: 'Room 2', y: 'Floor 1', value: 88.2 },
    { x: 'Room 2', y: 'Floor 2', value: 71.4 },
    { x: 'Room 3', y: 'Floor 1', value: 92.1 },
    { x: 'Room 3', y: 'Floor 2', value: 45.2 }
  ]

  return (
    <div>
      <h2>Property Moisture Levels (%)</h2>
      <Heatmap
        data={data}
        width={800}
        height={500}
        title="Moisture Reading Heatmap"
        xLabel="Room"
        yLabel="Floor Level"
        valueLabel="Moisture %"
        colorScheme="interpolateInferno"
        onCellClick={(cell) => console.log('Cell clicked:', cell)}
      />
    </div>
  )
}
```

#### Timeline - Project Schedule:
```typescript
import { TimelineChart } from '@/components/charts/d3/TimelineChart'

export function ProjectTimeline() {
  const events = [
    {
      id: '1',
      label: 'Water Extraction',
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 3),
      category: 'Emergency',
      description: 'Initial water removal'
    },
    {
      id: '2',
      label: 'Drying Phase',
      startDate: new Date(2026, 0, 3),
      endDate: new Date(2026, 0, 10),
      category: 'Drying',
      description: 'Moisture reduction'
    },
    {
      id: '3',
      label: 'Cleaning & Restoration',
      startDate: new Date(2026, 0, 10),
      endDate: new Date(2026, 0, 20),
      category: 'Restoration',
      description: 'Clean and repair'
    },
    {
      id: '4',
      label: 'Final Inspection',
      startDate: new Date(2026, 0, 20),
      endDate: new Date(2026, 0, 21),
      category: 'QA',
      description: 'Quality assurance'
    }
  ]

  return (
    <div>
      <h2>Restoration Project Timeline</h2>
      <TimelineChart
        events={events}
        width={1200}
        height={400}
        title="Project Schedule"
        onEventClick={(event) => console.log('Event clicked:', event)}
      />
    </div>
  )
}
```

#### Sankey - Cost Distribution:
```typescript
import { SankeyFlow } from '@/components/charts/d3/SankeyFlow'

export function CostAllocationDiagram() {
  const data = {
    nodes: [
      { name: 'Total Budget' },
      { name: 'Labour' },
      { name: 'Equipment' },
      { name: 'Materials' },
      { name: 'Subcontractors' },
      { name: 'Technician Wages' },
      { name: 'Dehumidifiers' },
      { name: 'Air Movers' },
      { name: 'Timber' },
      { name: 'Drywall' }
    ],
    links: [
      { source: 0, target: 1, value: 12000 },
      { source: 0, target: 2, value: 8000 },
      { source: 0, target: 3, value: 5000 },
      { source: 0, target: 4, value: 3000 },
      { source: 1, target: 5, value: 12000 },
      { source: 2, target: 6, value: 4000 },
      { source: 2, target: 7, value: 4000 },
      { source: 3, target: 8, value: 2500 },
      { source: 3, target: 9, value: 2500 }
    ]
  }

  return (
    <div>
      <h2>Project Cost Allocation</h2>
      <SankeyFlow
        data={data}
        width={1000}
        height={600}
        title="Cost Flow by Category"
        onNodeClick={(node) => console.log('Node:', node)}
        onLinkClick={(link) => console.log('Link:', link)}
      />
    </div>
  )
}
```

---

### 5. Combined Feature Integration

#### Complete Damage Report with Annotations and Visualizations:
```typescript
import { AdvancedCanvas } from '@/components/canvas/AdvancedCanvas'
import { Heatmap } from '@/components/charts/d3/Heatmap'
import { optimizeImage } from '@/lib/image-processing'
import { useState } from 'react'

export function ComprehensiveDamageReport() {
  const [annotationImage, setAnnotationImage] = useState<string>('')
  const [moistureData] = useState([
    { x: 'Bedroom', y: 'North Wall', value: 85 },
    { x: 'Bedroom', y: 'South Wall', value: 72 },
    { x: 'Living Room', y: 'North Wall', value: 78 },
    { x: 'Living Room', y: 'South Wall', value: 65 }
  ])

  const handleAnnotationSave = (pngUrl: string) => {
    setAnnotationImage(pngUrl)
  }

  return (
    <div className="damage-report">
      <h1>Comprehensive Damage Assessment Report</h1>

      <section>
        <h2>1. Damage Area Annotation</h2>
        <p>Mark the damaged areas on the floor plan</p>
        <AdvancedCanvas onSave={handleAnnotationSave} width={1000} height={800} />
      </section>

      <section>
        <h2>2. Moisture Distribution</h2>
        <p>Current moisture levels by location</p>
        <Heatmap
          data={moistureData}
          title="Moisture Levels (%)"
          colorScheme="interpolateInferno"
        />
      </section>

      {annotationImage && (
        <section>
          <h2>3. Annotated Floor Plan</h2>
          <img src={annotationImage} alt="Annotated floor plan" style={{ maxWidth: '100%' }} />
        </section>
      )}
    </div>
  )
}
```

---

## API Integration Examples

### Image Processing in API Route:

```typescript
// app/api/images/optimize/route.ts
import { optimizeImage } from '@/lib/image-processing'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File

  // Convert file to buffer
  const buffer = Buffer.from(await file.arrayBuffer())

  // Optimize image
  const optimized = await optimizeImage(buffer, {
    width: 1920,
    quality: 80,
    format: 'webp'
  })

  // Upload to Cloudinary
  const result = await uploadToCloudinary(optimized, {
    folder: 'reports'
  })

  return NextResponse.json({
    url: result.url,
    thumbnailUrl: result.thumbnailUrl,
    publicId: result.publicId
  })
}
```

---

## Performance Tips

1. **Sharp**: Use for all image uploads to reduce file sizes
2. **Canvas**: Lazy-load components on-demand to reduce bundle
3. **D3**: Import only needed D3 modules to minimise bundle size
4. **Images**: Enable Next.js image optimization for all remote images

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Sharp | N/A (server) | N/A | N/A | N/A |
| Fabric.js | ✅ | ✅ | ✅ | ✅ |
| D3.js | ✅ | ✅ | ✅ | ✅ |
| SVG Export | ✅ | ✅ | ✅ | ✅ |
| Touch Input | ✅ | ✅ | ✅ | ✅ |

---

## Troubleshooting

### Canvas components not rendering?
- Ensure component is marked with `'use client'`
- Check that canvas ref is properly initialised
- Verify browser supports Canvas API

### D3 charts not showing?
- Ensure SVG parent has defined width/height
- Check console for any D3 errors
- Verify data is in correct format

### Image optimisation failing?
- Check file format is supported (JPEG, PNG, WebP, AVIF)
- Ensure buffer is valid image data
- Check disk space for temporary files

---

**Documentation Last Updated**: January 11, 2026
**Version**: 1.0.0
