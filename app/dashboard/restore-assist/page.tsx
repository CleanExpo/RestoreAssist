"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Eye, Edit, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ReportStatus = "DRAFT" | "PENDING" | "APPROVED" | "COMPLETED" | "ARCHIVED";

interface Inspection {
  id: string;
  title: string;
  reportNumber?: string;
  clientName: string;
  propertyAddress: string;
  inspectionDate?: Date;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
}

const statusConfig = {
  DRAFT: { label: "Draft", className: "bg-gray-500" },
  PENDING: { label: "Preliminary", className: "bg-blue-500" },
  APPROVED: { label: "Approved", className: "bg-green-500" },
  COMPLETED: { label: "Final", className: "bg-purple-500" },
  ARCHIVED: { label: "Archived", className: "bg-slate-500" },
};

export default function RestoreAssistDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<Inspection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "ALL">("ALL");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchInspections();
  }, []);

  useEffect(() => {
    filterInspections();
  }, [inspections, searchQuery, statusFilter]);

  const fetchInspections = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/restore-assist/inspections");
      if (!response.ok) throw new Error("Failed to fetch inspections");
      const data = await response.json();
      setInspections(data.inspections || []);
    } catch (error) {
      console.error("Error fetching inspections:", error);
      toast({
        title: "Error",
        description: "Failed to load inspections. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterInspections = () => {
    let filtered = [...inspections];

    // Filter by status
    if (statusFilter !== "ALL") {
      filtered = filtered.filter((inspection) => inspection.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (inspection) =>
          inspection.reportNumber?.toLowerCase().includes(query) ||
          inspection.clientName.toLowerCase().includes(query) ||
          inspection.propertyAddress.toLowerCase().includes(query) ||
          inspection.title.toLowerCase().includes(query)
      );
    }

    setFilteredInspections(filtered);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const response = await fetch(`/api/restore-assist/inspections/${deleteId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete inspection");

      toast({
        title: "Success",
        description: "Inspection deleted successfully.",
      });

      setInspections(inspections.filter((i) => i.id !== deleteId));
      setDeleteId(null);
    } catch (error) {
      console.error("Error deleting inspection:", error);
      toast({
        title: "Error",
        description: "Failed to delete inspection. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">RestoreAssist Inspections</h1>
          <p className="text-muted-foreground mt-1">
            Manage water damage inspection reports and assessments
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/restore-assist/new")} size="lg">
          <Plus className="mr-2 h-5 w-5" />
          New Inspection
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and filter inspections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by claim reference, client, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ReportStatus | "ALL")}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PENDING">Preliminary</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="COMPLETED">Final</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inspections Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInspections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== "ALL"
                  ? "No inspections match your filters."
                  : "No inspections yet. Create your first inspection to get started."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim Reference</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Property Address</TableHead>
                  <TableHead>Inspection Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell className="font-medium">
                      {inspection.reportNumber || "N/A"}
                    </TableCell>
                    <TableCell>{inspection.clientName}</TableCell>
                    <TableCell>{inspection.propertyAddress}</TableCell>
                    <TableCell>
                      {inspection.inspectionDate
                        ? format(new Date(inspection.inspectionDate), "dd/MM/yyyy")
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig[inspection.status].className}>
                        {statusConfig[inspection.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/dashboard/restore-assist/inspections/${inspection.id}`)
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(
                              `/dashboard/restore-assist/inspections/${inspection.id}/enhance`
                            )
                          }
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(inspection.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the inspection and all
              associated data including scope of works and cost estimations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
