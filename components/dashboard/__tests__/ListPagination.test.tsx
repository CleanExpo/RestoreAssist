// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListPagination } from "../ListPagination";

describe("ListPagination", () => {
  it("hides when total fits on one page", () => {
    const { container } = render(
      <ListPagination
        page={1}
        pageSize={20}
        total={5}
        onPageChange={vi.fn()}
        noun="clients"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders compact controls and calls onPageChange", () => {
    const onPageChange = vi.fn();
    render(
      <ListPagination
        page={2}
        pageSize={20}
        total={55}
        onPageChange={onPageChange}
        noun="reports"
      />,
    );

    expect(screen.getByLabelText("Pagination")).toBeInTheDocument();
    expect(screen.getByText(/Showing 21–40 of 55 reports/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByLabelText("Page 1"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
