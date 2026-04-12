/**
 * lib/knowledge/index.ts — Relationship-aware query layer (RA-624)
 *
 * Provides TypeScript-native graph traversal over inspection data using
 * Prisma joins for direct relationships and recursive CTEs via $queryRaw
 * for transitive traversal. Designed as a façade: a future LightRAG /
 * property-graph backend can replace the implementation without changing callers.
 *
 * Current schema coverage (Sprint G):
 *   Inspection → EvidenceItem → WorkflowStep → InspectionWorkflow
 *   Inspection → IicrcChunk (via content vector similarity)
 *   HistoricalJob (direct queries; embeddings added in Phase-2)
 *
 * Phase-2 additions (after graph-readiness migration):
 *   InspectionPhoto → InspectionPhotoMaterial (join table)
 *   HistoricalJob   → HistoricalJobEmbedding  (pgvector)
 */

import { prisma } from "@/lib/prisma";
import { EvidenceClass, EvidenceItemStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type GraphEntityType =
  | "Inspection"
  | "EvidenceItem"
  | "WorkflowStep"
  | "InspectionWorkflow"
  | "IicrcChunk"
  | "HistoricalJob";

export type GraphRelation =
  | "hasEvidence" // Inspection → EvidenceItem
  | "hasWorkflow" // Inspection → InspectionWorkflow
  | "hasStep" // InspectionWorkflow → WorkflowStep
  | "capturedIn" // EvidenceItem → WorkflowStep
  | "similarTo" // EvidenceItem ↔ IicrcChunk (vector)
  | "historicallyRelated"; // Inspection ↔ HistoricalJob (heuristic)

export interface GraphNode {
  id: string;
  type: GraphEntityType;
  /** Human-readable label for the node */
  label: string;
  /** Subset of the underlying Prisma record fields */
  properties: Record<string, unknown>;
  createdAt: Date;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relation: GraphRelation;
  /** Optional numeric weight (0–1); used for ranked retrieval */
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FindRelatedOptions {
  /** Root entity */
  entity: { type: GraphEntityType; id: string };
  /** Which relation to traverse */
  relation: GraphRelation;
  /** How many hops to follow (default: 1) */
  depth?: number;
  /** Optional field-equality filters applied to returned nodes */
  filters?: Record<string, unknown>;
  /** Max nodes returned (default: 50) */
  limit?: number;
}

export interface ExpandContextOptions {
  inspectionId: string;
  /** Number of IicrcChunk neighbours to include per evidence class (default: 3) */
  k?: number;
  /** Include INACTIVE/REJECTED evidence items (default: false) */
  includeInactive?: boolean;
}

// ---------------------------------------------------------------------------
// findRelated — single-hop and multi-hop relationship traversal
// ---------------------------------------------------------------------------

/**
 * Traverses one relation from a root entity and returns matching nodes.
 *
 * For depth > 1, the function iterates hop-by-hop (BFS), collecting all
 * intermediate nodes. Cycles are avoided via a visited-id set.
 *
 * @example
 * const steps = await findRelated({
 *   entity: { type: 'InspectionWorkflow', id: wfId },
 *   relation: 'hasStep',
 *   depth: 1,
 * });
 */
export async function findRelated(
  options: FindRelatedOptions,
): Promise<KnowledgeGraph> {
  const { entity, relation, depth = 1, filters = {}, limit = 50 } = options;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const visited = new Set<string>([entity.id]);
  const frontier: Array<{ type: GraphEntityType; id: string }> = [entity];

  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const nextFrontier: Array<{ type: GraphEntityType; id: string }> = [];

    for (const node of frontier) {
      const { newNodes, newEdges } = await _traverseOne(
        node,
        relation,
        filters,
        limit - nodes.length,
      );

      for (const n of newNodes) {
        if (!visited.has(n.id)) {
          visited.add(n.id);
          nodes.push(n);
          nextFrontier.push({ type: n.type, id: n.id });
        }
      }
      edges.push(...newEdges);

      if (nodes.length >= limit) break;
    }

    frontier.length = 0;
    frontier.push(...nextFrontier);
  }

  return { nodes, edges };
}

/** Single-hop traversal for one (node, relation) pair */
async function _traverseOne(
  source: { type: GraphEntityType; id: string },
  relation: GraphRelation,
  filters: Record<string, unknown>,
  limit: number,
): Promise<{ newNodes: GraphNode[]; newEdges: GraphEdge[] }> {
  const newNodes: GraphNode[] = [];
  const newEdges: GraphEdge[] = [];

  switch (`${source.type}:${relation}`) {
    // ── Inspection → EvidenceItem ────────────────────────────────────────
    case "Inspection:hasEvidence": {
      const items = await prisma.evidenceItem.findMany({
        where: {
          inspectionId: source.id,
          status: EvidenceItemStatus.ACTIVE,
          ...filters,
        },
        take: limit,
        orderBy: { capturedAt: "desc" },
      });
      for (const item of items) {
        newNodes.push({
          id: item.id,
          type: "EvidenceItem",
          label: item.title,
          properties: {
            evidenceClass: item.evidenceClass,
            roomName: item.roomName,
            capturedAt: item.capturedAt,
            capturedByName: item.capturedByName,
            isVerified: item.isVerified,
          },
          createdAt: item.createdAt,
        });
        newEdges.push({ sourceId: source.id, targetId: item.id, relation });
      }
      break;
    }

    // ── Inspection → InspectionWorkflow ─────────────────────────────────
    case "Inspection:hasWorkflow": {
      const wf = await prisma.inspectionWorkflow.findUnique({
        where: { inspectionId: source.id },
      });
      if (wf) {
        newNodes.push({
          id: wf.id,
          type: "InspectionWorkflow",
          label: `${wf.jobType} workflow`,
          properties: {
            jobType: wf.jobType,
            completedSteps: wf.completedSteps,
            totalSteps: wf.totalSteps,
            submissionScore: wf.submissionScore,
            isReadyToSubmit: wf.isReadyToSubmit,
          },
          createdAt: wf.createdAt,
        });
        newEdges.push({ sourceId: source.id, targetId: wf.id, relation });
      }
      break;
    }

    // ── InspectionWorkflow → WorkflowStep ────────────────────────────────
    case "InspectionWorkflow:hasStep": {
      const steps = await prisma.workflowStep.findMany({
        where: { workflowId: source.id, ...filters },
        take: limit,
        orderBy: { stepOrder: "asc" },
      });
      for (const step of steps) {
        newNodes.push({
          id: step.id,
          type: "WorkflowStep",
          label: step.stepTitle,
          properties: {
            stepOrder: step.stepOrder,
            stepKey: step.stepKey,
            isMandatory: step.isMandatory,
            status: step.status,
            riskTier: step.riskTier,
          },
          createdAt: step.createdAt,
        });
        newEdges.push({ sourceId: source.id, targetId: step.id, relation });
      }
      break;
    }

    // ── EvidenceItem → WorkflowStep ──────────────────────────────────────
    case "EvidenceItem:capturedIn": {
      const item = await prisma.evidenceItem.findUnique({
        where: { id: source.id },
        include: { workflowStep: true },
      });
      if (item?.workflowStep) {
        const step = item.workflowStep;
        newNodes.push({
          id: step.id,
          type: "WorkflowStep",
          label: step.stepTitle,
          properties: {
            stepOrder: step.stepOrder,
            stepKey: step.stepKey,
            status: step.status,
          },
          createdAt: step.createdAt,
        });
        newEdges.push({ sourceId: source.id, targetId: step.id, relation });
      }
      break;
    }

    // ── EvidenceItem → IicrcChunk (content similarity via IICRC standard) ──
    case "EvidenceItem:similarTo": {
      // Without HistoricalJob embeddings, match on evidenceClass → IICRC standard keyword
      const item = await prisma.evidenceItem.findUnique({
        where: { id: source.id },
        select: { evidenceClass: true, structuredData: true },
      });
      if (item) {
        const standard = _evidenceClassToIicrcStandard(item.evidenceClass);
        if (standard) {
          const chunks = await prisma.iicrcChunk.findMany({
            where: { standard },
            take: Math.min(limit, 3),
            orderBy: { section: "asc" },
          });
          for (const chunk of chunks) {
            newNodes.push({
              id: chunk.id,
              type: "IicrcChunk",
              label: `${chunk.standard}:${chunk.section} — ${chunk.heading}`,
              properties: {
                standard: chunk.standard,
                edition: chunk.edition,
                section: chunk.section,
                heading: chunk.heading,
              },
              createdAt: chunk.createdAt,
            });
            newEdges.push({
              sourceId: source.id,
              targetId: chunk.id,
              relation,
              weight: 0.7, // Heuristic match; Phase-2 will use vector cosine
            });
          }
        }
      }
      break;
    }

    default:
      // Unsupported relation for this source type — return empty
      break;
  }

  return { newNodes, newEdges };
}

// ---------------------------------------------------------------------------
// expandContext — graph-shaped context window for AI report generation
// ---------------------------------------------------------------------------

/**
 * Builds a rich, graph-shaped context window for a single inspection.
 * Returns all direct evidence, the workflow structure, and IICRC content
 * matched by evidence class. Designed to feed AI report generation as a
 * superset of what pgvector alone returns.
 *
 * @example
 * const ctx = await expandContext({ inspectionId, k: 3 });
 * // Pass ctx.nodes and ctx.edges to your AI prompt builder
 */
export async function expandContext(
  options: ExpandContextOptions,
): Promise<KnowledgeGraph & { summary: ContextSummary }> {
  const { inspectionId, k = 3, includeInactive = false } = options;

  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const visitedIds = new Set<string>([inspectionId]);

  // 1. Root inspection node
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      propertyPostcode: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!inspection) throw new Error(`Inspection ${inspectionId} not found`);

  const inspectionNode: GraphNode = {
    id: inspection.id,
    type: "Inspection",
    label: `${inspection.inspectionNumber} — ${inspection.propertyAddress ?? ""}`,
    properties: {
      inspectionNumber: inspection.inspectionNumber,
      propertyAddress: inspection.propertyAddress,
      propertyPostcode: inspection.propertyPostcode,
      status: inspection.status,
    },
    createdAt: inspection.createdAt,
  };
  allNodes.push(inspectionNode);

  // 2. EvidenceItems
  const evidenceWhere = includeInactive
    ? { inspectionId }
    : { inspectionId, status: EvidenceItemStatus.ACTIVE };

  const evidenceItems = await prisma.evidenceItem.findMany({
    where: evidenceWhere,
    orderBy: { capturedAt: "desc" },
    take: 100,
  });

  const evidenceByClass = new Map<EvidenceClass, typeof evidenceItems>();

  for (const item of evidenceItems) {
    if (!visitedIds.has(item.id)) {
      visitedIds.add(item.id);
      allNodes.push({
        id: item.id,
        type: "EvidenceItem",
        label: item.title,
        properties: {
          evidenceClass: item.evidenceClass,
          roomName: item.roomName,
          structuredData: item.structuredData
            ? JSON.parse(item.structuredData)
            : null,
          capturedAt: item.capturedAt,
          capturedByName: item.capturedByName,
          isVerified: item.isVerified,
          fileUrl: item.fileUrl,
        },
        createdAt: item.createdAt,
      });
      allEdges.push({
        sourceId: inspectionId,
        targetId: item.id,
        relation: "hasEvidence",
      });
    }

    const arr = evidenceByClass.get(item.evidenceClass) ?? [];
    arr.push(item);
    evidenceByClass.set(item.evidenceClass, arr);
  }

  // 3. Workflow + steps
  const workflow = await prisma.inspectionWorkflow.findUnique({
    where: { inspectionId },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });

  if (workflow && !visitedIds.has(workflow.id)) {
    visitedIds.add(workflow.id);
    allNodes.push({
      id: workflow.id,
      type: "InspectionWorkflow",
      label: `${workflow.jobType} workflow`,
      properties: {
        jobType: workflow.jobType,
        submissionScore: workflow.submissionScore,
        isReadyToSubmit: workflow.isReadyToSubmit,
        completedSteps: workflow.completedSteps,
        totalSteps: workflow.totalSteps,
      },
      createdAt: workflow.createdAt,
    });
    allEdges.push({
      sourceId: inspectionId,
      targetId: workflow.id,
      relation: "hasWorkflow",
    });

    for (const step of workflow.steps) {
      if (!visitedIds.has(step.id)) {
        visitedIds.add(step.id);
        allNodes.push({
          id: step.id,
          type: "WorkflowStep",
          label: step.stepTitle,
          properties: {
            stepOrder: step.stepOrder,
            stepKey: step.stepKey,
            status: step.status,
            isMandatory: step.isMandatory,
            riskTier: step.riskTier,
          },
          createdAt: step.createdAt,
        });
        allEdges.push({
          sourceId: workflow.id,
          targetId: step.id,
          relation: "hasStep",
        });
      }
    }
  }

  // 4. IICRC chunks — up to k per distinct evidence class (heuristic match)
  const iicrcNodeIds = new Set<string>();
  for (const [evidenceClass] of evidenceByClass) {
    const standard = _evidenceClassToIicrcStandard(evidenceClass);
    if (!standard) continue;

    const chunks = await prisma.iicrcChunk.findMany({
      where: { standard },
      take: k,
      orderBy: { section: "asc" },
    });

    for (const chunk of chunks) {
      if (!visitedIds.has(chunk.id)) {
        visitedIds.add(chunk.id);
        iicrcNodeIds.add(chunk.id);
        allNodes.push({
          id: chunk.id,
          type: "IicrcChunk",
          label: `${chunk.standard}:${chunk.edition} §${chunk.section} — ${chunk.heading}`,
          properties: {
            standard: chunk.standard,
            edition: chunk.edition,
            section: chunk.section,
            heading: chunk.heading,
            content: chunk.content,
          },
          createdAt: chunk.createdAt,
        });
      }
      // Edge from each evidence item of this class → the chunk
      const items = evidenceByClass.get(evidenceClass) ?? [];
      for (const item of items.slice(0, 3)) {
        allEdges.push({
          sourceId: item.id,
          targetId: chunk.id,
          relation: "similarTo",
          weight: 0.7,
        });
      }
    }
  }

  const summary: ContextSummary = {
    inspectionId,
    totalNodes: allNodes.length,
    evidenceCount: evidenceItems.length,
    evidenceByClass: Object.fromEntries(
      Array.from(evidenceByClass.entries()).map(([cls, items]) => [
        cls,
        items.length,
      ]),
    ),
    workflowStepCount: workflow?.steps.length ?? 0,
    workflowSubmissionScore: workflow?.submissionScore ?? null,
    iicrcChunkCount: iicrcNodeIds.size,
  };

  return { nodes: allNodes, edges: allEdges, summary };
}

export interface ContextSummary {
  inspectionId: string;
  totalNodes: number;
  evidenceCount: number;
  evidenceByClass: Record<string, number>;
  workflowStepCount: number;
  workflowSubmissionScore: number | null;
  iicrcChunkCount: number;
}

// ---------------------------------------------------------------------------
// Recursive CTE — transitive traversal via raw SQL
// ---------------------------------------------------------------------------

interface TransitiveRow {
  id: string;
  inspection_id: string;
  evidence_class: string;
  hop: number;
}

/**
 * Finds all inspections that share an EvidenceClass with the given inspection
 * within `maxHops` hops, using a recursive CTE.
 *
 * Hop semantics: hop 1 = same class on this inspection's evidence;
 * hop 2 = inspections sharing ANY class found at hop 1; etc.
 *
 * @example
 * const related = await findTransitivelyRelated(inspectionId, 2);
 */
export async function findTransitivelyRelated(
  inspectionId: string,
  maxHops: number = 2,
  limit: number = 20,
): Promise<
  Array<{ inspectionId: string; evidenceClass: string; hop: number }>
> {
  const rows = await prisma.$queryRaw<TransitiveRow[]>`
    WITH RECURSIVE evidence_graph AS (
      -- Base: evidence classes for the seed inspection
      SELECT
        e.id,
        e."inspectionId" AS inspection_id,
        e."evidenceClass"::text AS evidence_class,
        1 AS hop
      FROM "EvidenceItem" e
      WHERE e."inspectionId" = ${inspectionId}
        AND e.status = 'ACTIVE'

      UNION

      -- Recursive: other inspections sharing any evidence class found so far
      SELECT
        e2.id,
        e2."inspectionId",
        e2."evidenceClass"::text,
        eg.hop + 1
      FROM "EvidenceItem" e2
      INNER JOIN evidence_graph eg
        ON eg.evidence_class = e2."evidenceClass"::text
        AND e2."inspectionId" != ${inspectionId}
      WHERE eg.hop < ${maxHops}
        AND e2.status = 'ACTIVE'
    )
    SELECT DISTINCT
      inspection_id,
      evidence_class,
      MIN(hop) AS hop
    FROM evidence_graph
    WHERE inspection_id != ${inspectionId}
    GROUP BY inspection_id, evidence_class
    ORDER BY hop ASC, inspection_id
    LIMIT ${limit}
  `;

  return (
    rows as Array<{
      inspection_id: string;
      evidence_class: string;
      hop: bigint | number;
    }>
  ).map((r) => ({
    inspectionId: r.inspection_id,
    evidenceClass: r.evidence_class,
    hop: Number(r.hop),
  }));
}

// ---------------------------------------------------------------------------
// Helper — map EvidenceClass → primary IICRC standard
// ---------------------------------------------------------------------------

function _evidenceClassToIicrcStandard(
  evidenceClass: EvidenceClass,
): string | null {
  const map: Partial<Record<EvidenceClass, string>> = {
    MOISTURE_READING: "S500",
    PHOTO_DAMAGE: "S500",
    THERMAL_IMAGE: "S500",
    AMBIENT_ENVIRONMENTAL: "S500",
    EQUIPMENT_LOG: "S500",
    PHOTO_EQUIPMENT: "S500",
    PHOTO_PROGRESS: "S500",
    VIDEO_WALKTHROUGH: "S500",
    FLOOR_PLAN: "S500",
    SCOPE_DOCUMENT: "S500",
    THIRD_PARTY_REPORT: "S500",
    COMPLIANCE_CERTIFICATE: "S520",
    LAB_RESULT: "S520",
    PHOTO_COMPLETION: "S500",
    TECHNICIAN_NOTE: "S500",
    VOICE_MEMO: "S500",
    AUTHORITY_FORM: "S500",
    AFFECTED_CONTENTS: "S500",
  };
  return map[evidenceClass] ?? null;
}
