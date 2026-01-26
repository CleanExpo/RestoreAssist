"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Download, Users, Briefcase } from "lucide-react"
import toast from "react-hot-toast"

interface ExternalClient {
  id: string
  externalId: string
  name: string
  email?: string
  phone?: string
  address?: string
  contactId?: string
}

interface ExternalJob {
  id: string
  externalId: string
  title: string
  status?: string
  clientExternalId?: string
  address?: string
  description?: string
  claimId?: string
}

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  provider: string
  providerName: string
}

export default function ImportModal({ isOpen, onClose, provider, providerName }: ImportModalProps) {
  const [activeTab, setActiveTab] = useState<'clients' | 'jobs'>('clients')
  const [clients, setClients] = useState<ExternalClient[]>([])
  const [jobs, setJobs] = useState<ExternalJob[]>([])
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set())
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (isOpen && provider) {
      fetchData()
    }
  }, [isOpen, provider])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [clientsRes, jobsRes] = await Promise.all([
        fetch(`/api/integrations/${provider}/clients`),
        fetch(`/api/integrations/${provider}/jobs`)
      ])

      if (clientsRes.ok) {
        const clientsData = await clientsRes.json()
        setClients(clientsData.clients || [])
      }

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json()
        setJobs(jobsData.jobs || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to fetch data from ' + providerName)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    const clientIds = Array.from(selectedClientIds)
    const jobIds = Array.from(selectedJobIds)

    if (clientIds.length === 0 && jobIds.length === 0) {
      toast.error('Please select at least one item to import')
      return
    }

    setImporting(true)
    try {
      const promises = []

      if (clientIds.length > 0) {
        promises.push(
          fetch(`/api/integrations/${provider}/clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientIds })
          })
        )
      }

      if (jobIds.length > 0) {
        promises.push(
          fetch(`/api/integrations/${provider}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobIds })
          })
        )
      }

      const results = await Promise.all(promises)
      const allOk = results.every(r => r.ok)

      if (allOk) {
        toast.success(`Successfully imported ${clientIds.length} clients and ${jobIds.length} jobs`)
        setSelectedClientIds(new Set())
        setSelectedJobIds(new Set())
        onClose()
      } else {
        toast.error('Some imports failed')
      }
    } catch (error) {
      console.error('Error importing:', error)
      toast.error('Failed to import data')
    } finally {
      setImporting(false)
    }
  }

  const toggleClient = (id: string) => {
    const newSelected = new Set(selectedClientIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedClientIds(newSelected)
  }

  const toggleJob = (id: string) => {
    const newSelected = new Set(selectedJobIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedJobIds(newSelected)
  }

  const selectAllClients = () => {
    if (selectedClientIds.size === clients.filter(c => !c.contactId).length) {
      setSelectedClientIds(new Set())
    } else {
      setSelectedClientIds(new Set(clients.filter(c => !c.contactId).map(c => c.id)))
    }
  }

  const selectAllJobs = () => {
    if (selectedJobIds.size === jobs.filter(j => !j.claimId).length) {
      setSelectedJobIds(new Set())
    } else {
      setSelectedJobIds(new Set(jobs.filter(j => !j.claimId).map(j => j.id)))
    }
  }

  const unimportedClients = clients.filter(c => !c.contactId)
  const unimportedJobs = jobs.filter(j => !j.claimId)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from {providerName}</DialogTitle>
          <DialogDescription>
            Select clients and jobs to import into RestoreAssist
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'clients'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <Users className="inline-block w-4 h-4 mr-2" />
            Clients ({unimportedClients.length})
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'jobs'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <Briefcase className="inline-block w-4 h-4 mr-2" />
            Jobs ({unimportedJobs.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : activeTab === 'clients' ? (
            <div className="space-y-2 p-2">
              {unimportedClients.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No new clients to import
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                    <button
                      onClick={selectAllClients}
                      className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {selectedClientIds.size === unimportedClients.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedClientIds.size} selected
                    </span>
                  </div>
                  {unimportedClients.map((client) => (
                    <div
                      key={client.id}
                      onClick={() => toggleClient(client.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedClientIds.has(client.id)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedClientIds.has(client.id)}
                          onCheckedChange={() => toggleClient(client.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {client.name}
                          </p>
                          {client.email && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {client.email}
                            </p>
                          )}
                          {client.phone && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {client.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {unimportedJobs.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No new jobs to import
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                    <button
                      onClick={selectAllJobs}
                      className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {selectedJobIds.size === unimportedJobs.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedJobIds.size} selected
                    </span>
                  </div>
                  {unimportedJobs.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => toggleJob(job.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedJobIds.has(job.id)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedJobIds.has(job.id)}
                          onCheckedChange={() => toggleJob(job.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {job.title}
                          </p>
                          {job.status && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Status: {job.status}
                            </p>
                          )}
                          {job.address && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {job.address}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || (selectedClientIds.size === 0 && selectedJobIds.size === 0)}
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Import Selected
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
