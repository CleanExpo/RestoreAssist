"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, FileText, Sparkles, MessageCircle } from "lucide-react"
import toast from "react-hot-toast"
import ClientQnA from "./ClientQnA"

interface TechnicianInputFormProps {
  reportId?: string
  onReportGenerated?: (reportId: string) => void
  initialData?: {
    technicianNotes?: string
    photos?: string[]
    dateOfAttendance?: string
    clientContacted?: string
  }
}

export default function TechnicianInputForm({ 
  reportId, 
  onReportGenerated,
  initialData 
}: TechnicianInputFormProps) {
  const [technicianNotes, setTechnicianNotes] = useState(initialData?.technicianNotes || "")
  const [dateOfAttendance, setDateOfAttendance] = useState(
    initialData?.dateOfAttendance || new Date().toISOString().slice(0, 16)
  )
  const [clientContacted, setClientContacted] = useState(initialData?.clientContacted || "")
  const [photos, setPhotos] = useState<File[]>([])
  const [generating, setGenerating] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<"qa" | "notes">("qa")
  const [clientName, setClientName] = useState("")
  const [propertyAddress, setPropertyAddress] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [clientPhone, setClientPhone] = useState("")

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setPhotos(prev => [...prev, ...files])
      toast.success(`${files.length} photo(s) added`)
    }
  }

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleGenerateReport = async () => {
    if (!technicianNotes.trim()) {
      toast.error("Please enter technician notes")
      return
    }

    setGenerating(true)
    try {
      // Upload photos if any
      const photoUrls: string[] = []
      if (photos.length > 0) {
        for (const photo of photos) {
          const formData = new FormData()
          formData.append("file", photo)
          
          const uploadResponse = await fetch("/api/upload", {
            method: "POST",
            body: formData
          })
          
          if (uploadResponse.ok) {
            const data = await uploadResponse.json()
            photoUrls.push(data.url)
          }
        }
      }

      // Generate enhanced report
      const response = await fetch("/api/reports/generate-enhanced", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reportId,
          technicianNotes,
          dateOfAttendance,
          clientContacted,
          clientName: clientName || undefined,
          propertyAddress: propertyAddress || undefined,
          clientEmail: clientEmail || undefined,
          clientPhone: clientPhone || undefined,
          photos: photoUrls,
          conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to generate report")
      }

      const data = await response.json()
      toast.success("Enhanced professional report generated successfully!")
      
      if (onReportGenerated && data.reportId) {
        onReportGenerated(data.reportId)
      }
    } catch (error: any) {
      console.error("Error generating report:", error)
      toast.error(error.message || "Failed to generate report")
    } finally {
      setGenerating(false)
    }
  }

  const handleConversationComplete = (conversation: any[]) => {
    setConversationHistory(conversation)
    
    // Extract client information from conversation
    // Look for system questions asking for name/address/email/phone and the client responses that follow
    let extractedName = ""
    let extractedAddress = ""
    let extractedEmail = ""
    let extractedPhone = ""
    
    // Find system messages asking for information and the client responses that follow
    for (let i = 0; i < conversation.length - 1; i++) {
      const systemMsg = conversation[i]
      const nextClientMsg = conversation[i + 1]
      
      if (systemMsg.role === "system" && nextClientMsg?.role === "client") {
        const systemContent = systemMsg.content.toLowerCase()
        const clientContent = nextClientMsg.content.trim()
        
        // Check if system asked for name
        if ((systemContent.includes("name") || systemContent.includes("your name") || systemContent.includes("full name")) && !extractedName) {
          const cleanName = clientContent
            .replace(/^(my name is|i'm|i am|name is|it's|it is)\s+/i, "")
            .replace(/^[,\s]+|[,\s]+$/g, "")
            .split(/[,\n]/)[0]
            .trim()
          
          if (cleanName && cleanName.length > 2 && cleanName.length < 100) {
            extractedName = cleanName
          }
        }
        
        // Check if system asked for address
        if ((systemContent.includes("address") || systemContent.includes("property address") || systemContent.includes("where")) && !extractedAddress) {
          if (clientContent && clientContent.length > 5 && !clientContent.includes("@")) {
            extractedAddress = clientContent
          }
        }
        
        // Check if system asked for email
        if ((systemContent.includes("email") || systemContent.includes("e-mail")) && !extractedEmail) {
          // Extract email - look for @ symbol
          const emailMatch = clientContent.match(/[\w\.-]+@[\w\.-]+\.\w+/i)
          if (emailMatch) {
            extractedEmail = emailMatch[0]
          } else if (clientContent.includes("@")) {
            extractedEmail = clientContent.trim()
          }
        }
        
        // Check if system asked for phone
        if ((systemContent.includes("phone") || systemContent.includes("contact number") || systemContent.includes("mobile")) && !extractedPhone) {
          // Extract phone - remove common words and keep numbers
          const phoneMatch = clientContent.match(/[\d\s\+\-\(\)]+/g)
          if (phoneMatch) {
            const cleanPhone = phoneMatch.join("").replace(/\s+/g, " ").trim()
            if (cleanPhone.length >= 8) {
              extractedPhone = cleanPhone
            }
          } else {
            extractedPhone = clientContent.trim()
          }
        }
      }
    }
    
    // Fallback: Look at last few client messages if we didn't find all info
    if (!extractedName || !extractedAddress || !extractedEmail || !extractedPhone) {
      const clientMessages = conversation
        .filter(msg => msg.role === "client")
        .map(msg => msg.content)
      
      // Check last 5 client messages (for name, address, email, phone)
      for (let i = clientMessages.length - 1; i >= Math.max(0, clientMessages.length - 5); i--) {
        const message = clientMessages[i].trim()
        const lowerMessage = message.toLowerCase()
        
        if (!extractedName && message.length < 100 && !lowerMessage.includes("address") && !lowerMessage.includes("property") && !lowerMessage.includes("@") && !lowerMessage.includes("phone")) {
          const cleanName = message.replace(/^(my name is|i'm|i am|name is)\s+/i, "").trim()
          if (cleanName && cleanName.length > 2) {
            extractedName = cleanName
          }
        }
        
        if (!extractedAddress && (lowerMessage.includes("street") || lowerMessage.includes("road") || lowerMessage.includes("avenue") || lowerMessage.includes("drive") || lowerMessage.includes("address")) && !lowerMessage.includes("@")) {
          extractedAddress = message
        }
        
        if (!extractedEmail && message.includes("@")) {
          const emailMatch = message.match(/[\w\.-]+@[\w\.-]+\.\w+/i)
          if (emailMatch) {
            extractedEmail = emailMatch[0]
          }
        }
        
        if (!extractedPhone && (lowerMessage.includes("phone") || lowerMessage.includes("mobile") || /[\d\s\+\-\(\)]{8,}/.test(message))) {
          const phoneMatch = message.match(/[\d\s\+\-\(\)]+/g)
          if (phoneMatch) {
            const cleanPhone = phoneMatch.join("").replace(/\s+/g, " ").trim()
            if (cleanPhone.length >= 8) {
              extractedPhone = cleanPhone
            }
          }
        }
      }
    }
    
    // Set extracted information
    if (extractedName) setClientName(extractedName)
    if (extractedAddress) setPropertyAddress(extractedAddress)
    if (extractedEmail) setClientEmail(extractedEmail)
    if (extractedPhone) setClientPhone(extractedPhone)
    
    // Generate a summary from the conversation for clientContacted field
    const allClientMessages = conversation
      .filter(msg => msg.role === "client")
      .map(msg => msg.content)
      .join("\n")
    if (allClientMessages) {
      setClientContacted(allClientMessages)
    }
    
    // Automatically switch to notes tab after conversation is complete
    setActiveTab("notes")
    toast.success("Client information collected! You can now add your technician notes.")
  }

  return (
    <Card className="border-slate-700 bg-slate-800/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <FileText className="h-5 w-5 text-cyan-400" />
          Technician Input Form (AI Enhanced)
        </CardTitle>
        <CardDescription className="text-slate-300">
          First gather information from the client, then enter your technician notes. The system will automatically generate a comprehensive professional report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "qa" | "notes")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-800">
            <TabsTrigger value="qa" className="data-[state=active]:bg-cyan-600">
              <MessageCircle className="mr-2 h-4 w-4" />
              Client Q&A
            </TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-cyan-600">
              <FileText className="mr-2 h-4 w-4" />
              Technician Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="qa" className="mt-0">
            <ClientQnA
              onConversationComplete={handleConversationComplete}
              initialMessages={conversationHistory}
            />
          </TabsContent>

          <TabsContent value="notes" className="mt-0 space-y-6">
        {/* Date of Attendance */}
        <div className="space-y-2">
          <Label htmlFor="dateOfAttendance" className="text-white font-semibold">Date of Attendance</Label>
          <Input
            id="dateOfAttendance"
            type="datetime-local"
            value={dateOfAttendance}
            onChange={(e) => setDateOfAttendance(e.target.value)}
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500"
          />
        </div>

        {/* Extracted Client Information */}
        {(clientName || propertyAddress || clientEmail || clientPhone) && (
          <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg space-y-3">
            <p className="text-sm font-semibold text-cyan-400">Client Information (Extracted from Q&A)</p>
            <div className="grid md:grid-cols-2 gap-3">
              {clientName && (
                <div>
                  <Label className="text-xs text-slate-400">Client Name</Label>
                  <p className="text-white font-medium">{clientName}</p>
                </div>
              )}
              {propertyAddress && (
                <div>
                  <Label className="text-xs text-slate-400">Property Address</Label>
                  <p className="text-white font-medium">{propertyAddress}</p>
                </div>
              )}
              {clientEmail && (
                <div>
                  <Label className="text-xs text-slate-400">Email</Label>
                  <p className="text-white font-medium">{clientEmail}</p>
                </div>
              )}
              {clientPhone && (
                <div>
                  <Label className="text-xs text-slate-400">Phone Number</Label>
                  <p className="text-white font-medium">{clientPhone}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Client Contacted */}
        <div className="space-y-2">
          <Label htmlFor="clientContacted" className="text-white font-semibold">Client Contacted / Notes</Label>
          <Textarea
            id="clientContacted"
            value={clientContacted}
            onChange={(e) => setClientContacted(e.target.value)}
            placeholder="e.g., Upon arrival, confirmed absence of more than 3 hours prior to loss"
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 min-h-[80px] focus:border-cyan-500 focus:ring-cyan-500"
          />
        </div>

        {/* Technician Notes */}
        <div className="space-y-2">
          <Label htmlFor="technicianNotes" className="text-white font-semibold">
            Technician Notes <span className="text-red-400">*</span>
          </Label>
          <Textarea
            id="technicianNotes"
            value={technicianNotes}
            onChange={(e) => setTechnicianNotes(e.target.value)}
            placeholder="Enter your inspection notes here. Example:&#10;&#10;Attended site and met with the client Wednesday November 6th, 2025&#10;Inspection carried out to determine the scope of the claim and the areas affected by the recent escape of liquid from the upstairs kitchen.&#10;&#10;2 bedrooms downstairs with carpet affected&#10;Living Area carpet affected, ceiling and walls also affected with visible paint bubbling.&#10;&#10;Upstairs Areas:&#10;Kitchen - Tiled floor&#10;Hallway, dining and living areas - Floating timber floors&#10;Standing water in the upstairs and downstairs areas&#10;&#10;Took moisture readings and thermal images to determine the scope and areas affected.&#10;Extracted standing water with a truckmounted extraction unit&#10;&#10;Setup Drying Equipment:&#10;18 x Air movers&#10;4 x Dehumidifiers&#10;2 x AFD Units"
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 min-h-[300px] font-mono text-sm focus:border-cyan-500 focus:ring-cyan-500"
          />
          <p className="text-xs text-slate-300">
            Enter all relevant information from your inspection. Include areas affected, equipment used, observations, and any other details.
          </p>
        </div>

        {/* Photo Upload */}
        <div className="space-y-2">
          <Label className="text-white font-semibold">Photos (5-15 recommended)</Label>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo, index) => (
              <div key={index} className="relative">
                <img
                  src={URL.createObjectURL(photo)}
                  alt={`Photo ${index + 1}`}
                  className="w-20 h-20 object-cover rounded border-2 border-slate-600"
                />
                <button
                  onClick={() => handleRemovePhoto(index)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
            <label className="w-20 h-20 border-2 border-dashed border-slate-600 rounded flex items-center justify-center cursor-pointer hover:border-cyan-500 transition-colors bg-slate-900/50">
              <Upload className="h-6 w-6 text-slate-400" />
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-slate-300">
            Upload photos from your inspection (5-15 photos recommended)
          </p>
        </div>

            {/* Generate Report Button */}
            <Button
              onClick={handleGenerateReport}
              disabled={generating || !technicianNotes.trim()}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              size="lg"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  Generating Enhanced Report...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Enhanced Professional Report
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

