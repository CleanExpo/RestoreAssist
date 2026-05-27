"use client";

import * as React from "react";
import { GripVerticalIcon } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

type ResizablePrimitiveComponent = React.ComponentType<Record<string, unknown>>;

type ResizablePrimitiveExports = Record<string, unknown> & {
  Group?: ResizablePrimitiveComponent;
  PanelGroup?: ResizablePrimitiveComponent;
  Separator?: ResizablePrimitiveComponent;
  PanelResizeHandle?: ResizablePrimitiveComponent;
};

const resizablePrimitives =
  ResizablePrimitive as unknown as ResizablePrimitiveExports;
const usesNextResizablePrimitives = Boolean(resizablePrimitives.Group);

function getResizablePrimitive(
  nextName: keyof ResizablePrimitiveExports,
  legacyName: keyof ResizablePrimitiveExports,
) {
  const component =
    resizablePrimitives[nextName] ?? resizablePrimitives[legacyName];

  if (!component) {
    throw new Error(
      `react-resizable-panels is missing ${String(nextName)} / ${String(
        legacyName,
      )}`,
    );
  }

  return component as ResizablePrimitiveComponent;
}

const ResizableGroupPrimitive = getResizablePrimitive("Group", "PanelGroup");

const ResizableSeparatorPrimitive = getResizablePrimitive(
  "Separator",
  "PanelResizeHandle",
);

type ResizablePanelGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  autoSaveId?: string | null;
  direction?: "horizontal" | "vertical";
  keyboardResizeBy?: number | null;
  onLayout?: (sizes: number[]) => void;
  orientation?: "horizontal" | "vertical";
};

function ResizablePanelGroup({
  className,
  direction,
  orientation,
  ...props
}: ResizablePanelGroupProps) {
  const resolvedOrientation = orientation ?? direction ?? "horizontal";

  return (
    <ResizableGroupPrimitive
      data-slot="resizable-panel-group"
      data-panel-group-direction={resolvedOrientation}
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      {...(usesNextResizablePrimitives
        ? { orientation: resolvedOrientation }
        : { direction: resolvedOrientation })}
      {...props}
    />
  );
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  withHandle?: boolean;
}) {
  return (
    <ResizableSeparatorPrimitive
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizableSeparatorPrimitive>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
