// @vitest-environment jsdom
/**
 * RA-8603: a refused or failed floor-plan upload must say why on screen.
 * Before this fix the catch block only logged to the console.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import MoistureMappingCanvas from "../MoistureMappingCanvas";

afterEach(cleanup);

function pickFile(container: HTMLElement) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File(["not an image"], "plan.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("MoistureMappingCanvas floor-plan upload errors (RA-8603)", () => {
  it("shows the server's message when the upload is refused", async () => {
    const onImageUpload = vi.fn(async () => {
      throw new Error("A PNG, JPEG or WebP floor-plan file is required.");
    });
    const { container } = render(
      <MoistureMappingCanvas readings={[]} onImageUpload={onImageUpload} />,
    );
    pickFile(container);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "A PNG, JPEG or WebP floor-plan file is required.",
      ),
    );
  });

  it("shows a plain fallback when the failure carries no message", async () => {
    const onImageUpload = vi.fn(async () => {
      throw new Error("");
    });
    const { container } = render(
      <MoistureMappingCanvas readings={[]} onImageUpload={onImageUpload} />,
    );
    pickFile(container);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The floor plan could not be uploaded. Please try again.",
      ),
    );
  });

  it("clears the message after a successful retry", async () => {
    const onImageUpload = vi
      .fn<(file: File) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Floor-plan image must not exceed 10 MB."))
      .mockResolvedValueOnce("https://cdn.test/plan.png");
    const { container } = render(
      <MoistureMappingCanvas readings={[]} onImageUpload={onImageUpload} />,
    );
    pickFile(container);
    await screen.findByRole("alert");
    pickFile(container);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
