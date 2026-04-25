import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import archiver from "archiver";
import { Readable } from "stream";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ids, zip = false } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid request", message: "ids must be a non-empty array" },
        { status: 400 },
      );
    }

    // Fetch all selected reports to check which ones have Excel files
    const allReports = await prisma.report.findMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
      select: {
        id: true,
        reportNumber: true,
        title: true,
        clientName: true,
        propertyAddress: true,
        excelReportUrl: true,
      },
    });

    // Separate reports with and without Excel files
    const reportsWithExcel = allReports.filter(
      (r) => r.excelReportUrl !== null,
    );
    const reportsWithoutExcel = allReports.filter(
      (r) => r.excelReportUrl === null,
    );

    if (reportsWithExcel.length === 0) {
      return NextResponse.json(
        {
          error: "No Excel reports found",
          message:
            "None of the selected reports have Excel files available. Please generate Excel reports individually for each report first.",
          missingReports: reportsWithoutExcel.map((r) => ({
            id: r.id,
            reportNumber: r.reportNumber,
            clientName: r.clientName,
            propertyAddress: r.propertyAddress,
          })),
          totalSelected: allReports.length,
        },
        { status: 404 },
      );
    }

    // If some reports are missing Excel files, include that info in the response
    const reports = reportsWithExcel;

    // If zip is requested, create a zip file
    if (zip) {
      return new Promise<NextResponse>((resolve, reject) => {
        const run = async () => {
          try {
          const archive = archiver("zip", { zlib: { level: 9 } });
          const buffers: Buffer[] = [];

          archive.on("data", (chunk: Buffer) => {
            buffers.push(chunk);
          });

          archive.on("end", () => {
            const zipBuffer = Buffer.concat(buffers);
            resolve(
              new NextResponse(zipBuffer, {
                status: 200,
                headers: {
                  "Content-Type": "application/zip",
                  "Content-Disposition": `attachment; filename="Excel_Reports_${new Date().toISOString().split("T")[0]}.zip"`,
                  "Content-Length": zipBuffer.length.toString(),
                },
              }),
            );
          });

          archive.on("error", (err) => {
            reject(err);
          });

          // Download and add each Excel file to the zip (one by one from Cloudinary)
          // RA-1344: only refetch from allowlisted hosts (Cloudinary) to prevent
          // server-side fetch of internal URLs via attacker-controlled excelReportUrl.
          const isAllowedExportUrl = (u: string): boolean => {
            try {
              const parsed = new URL(u);
              return (
                parsed.protocol === "https:" &&
                parsed.hostname === "res.cloudinary.com"
              );
            } catch {
              return false;
            }
          };
          for (const report of reports) {
            if (report.excelReportUrl) {
              if (!isAllowedExportUrl(report.excelReportUrl)) {
                console.error(
                  `[Bulk Excel Export] ✗ Rejected non-allowlisted URL for report ${report.id}`,
                );
                continue;
              }
              try {
                const response = await fetch(report.excelReportUrl);

                if (response.ok) {
                  const buffer = Buffer.from(await response.arrayBuffer());
                  const filename = `${report.reportNumber || report.id}.xlsx`;
                  archive.append(buffer, { name: filename });
                } else {
                  console.error(
                    `[Bulk Excel Export] ✗ Failed to download Excel for report ${report.id}: HTTP ${response.status}`,
                  );
                }
              } catch (error) {
                console.error(
                  `[Bulk Excel Export] ✗ Error downloading Excel for report ${report.id}:`,
                  error,
                );
              }
            } else {
              console.warn(
                `[Bulk Excel Export] Report ${report.id} has no Excel URL`,
              );
            }
          }

          await archive.finalize();
          } catch (error) {
            reject(error);
          }
        };
        run().catch(reject);
      });
    }

    // Return list of Excel URLs
    return NextResponse.json({
      reports: reports.map((report) => ({
        id: report.id,
        reportNumber: report.reportNumber,
        title: report.title,
        clientName: report.clientName,
        propertyAddress: report.propertyAddress,
        excelUrl: report.excelReportUrl,
      })),
      count: reports.length,
      missingReports:
        reportsWithoutExcel.length > 0
          ? reportsWithoutExcel.map((r) => ({
              id: r.id,
              reportNumber: r.reportNumber,
              clientName: r.clientName,
              propertyAddress: r.propertyAddress,
            }))
          : [],
      totalSelected: allReports.length,
    });
  } catch (error) {
    // RA-786: do not leak error.message to clients
    console.error("Error in bulk-export-excel-list:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
